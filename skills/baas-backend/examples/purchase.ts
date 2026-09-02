/**
 * 협력업체 발주 승인(결재) 백엔드.
 *
 * 이 파일의 핵심은 두 가지 경합을 막는 것이다.
 *   1) **동시 결재** — 같은 단계를 여러 결재자가 동시에 처리해도 단계가 중복 진행되거나
 *      건너뛰어지면 안 된다. → `po_approval.order_step_key` unique 선점 + 상태 전이는
 *      `if` 조건부 갱신.
 *   2) **금액 수정 중 결재** — 결재선(1천만원 초과면 임원까지)의 판정 근거가 금액이므로,
 *      판정과 실행 사이에 금액이 바뀌면 결재선이 무력화된다. → 전이 `if` 에 `amount` 를
 *      함께 넣는 낙관적 락.
 *
 * 조회·변경은 모두 `po_audit` 에 남긴다.
 */

import { route, schedule } from '../platform/app'
import { SdkError, type DyncolRecord, type Sdk } from '../platform/sdk'

// ---------------------------------------------------------------------------
// 도메인 타입 / 규칙 상수
// ---------------------------------------------------------------------------

type OrderStatus = 'draft' | 'pending' | 'approved' | 'rejected'
type Decision = 'approved' | 'rejected'

interface Order {
  title: string
  vendor_id: string
  amount: number
  status: OrderStatus
  step: number
  requester_id: string
  dept_id: string
  submitted_at: string
}

interface Approval {
  order_step_key: string
  order_id: string
  step: number
  approver_id: string
  result: Decision
  reason: string
  decided_at: string
}

interface Member {
  account_key: string
  account_id: string
  dept_id: string
  rank: 'staff' | 'team_lead' | 'manager' | 'exec'
  vendor_id: string
}

/** 결재선: 팀장(1) → 부장(2) → 임원(3). staff 는 결재 권한이 없다. */
const RANK_STEP: Record<string, number | undefined> = {
  team_lead: 1,
  manager: 2,
  exec: 3,
}

/** 1천만원 초과면 임원(3)까지, 이하면 부장(2)에서 종결. */
const EXEC_THRESHOLD = 10_000_000
const finalStepFor = (amount: number): number => (amount > EXEC_THRESHOLD ? 3 : 2)

const LIST_MAX = 100
const now = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------------------------

function parseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * 감사 로그. **실패해도 본 처리를 되돌리지 않는다** — 결재는 이미 확정됐고 이 SDK 에는
 * 컬렉션을 묶는 트랜잭션 프리미티브가 노출돼 있지 않으므로 되돌릴 수단이 없다.
 * 대신 유실을 삼키지 않고 requestId 와 함께 남겨 추적 가능하게 한다.
 */
async function audit(
  sdk: Sdk,
  action: string,
  target: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await sdk.dyncol.create('po_audit', {
      actor_id: sdk.ctx.accountId ?? 'system',
      action,
      target,
      at: now(),
      detail: JSON.stringify(detail).slice(0, 800),
    })
  } catch (e) {
    console.error('[audit-failed]', {
      requestId: sdk.ctx.requestId,
      action,
      target,
      error: String(e),
    })
  }
}

/**
 * 알림. 현재 스키마에는 회원 연락처 필드가 없어(`po_account` 에 phone 없음, 크론은
 * `accountId === null` 이라 `baas.currentAccount()` 도 못 쓴다) SMS 발송 대상을 만들 수
 * 없다. 그래서 알림은 감사 컬렉션에 `notify:*` 액션으로 적립해 프론트·CMS 가 읽게 한다.
 * 연락처 필드가 생기면 이 함수 안에서 `sdk.baas.sendSms` 만 추가하면 된다.
 */
const notify = (sdk: Sdk, kind: string, target: string, detail: Record<string, unknown>) =>
  audit(sdk, `notify:${kind}`, target, detail)

/** 요청 회원의 조직 정보. `account_key` 가 unique 라 계정당 1건이다. */
async function loadMember(sdk: Sdk, accountId: string): Promise<Member | null> {
  const res = await sdk.dyncol.list<Member>('po_account', {
    filter: { account_id: accountId },
    limit: 1,
  })
  return res.items[0]?.data ?? null
}

const isVendor = (m: Member): boolean => !!str(m.vendor_id)

/** 결재자가 그 발주를 볼/처리할 부서 권한이 있는지. 임원은 전 부서, 팀장·부장은 자기 부서만. */
function inApprovalChain(m: Member, o: Order): boolean {
  const step = RANK_STEP[m.rank]
  if (!step || isVendor(m)) return false
  return m.rank === 'exec' || m.dept_id === o.dept_id
}

/** 발주 상세를 볼 수 있는 주체: 요청자 본인 / 해당 협력업체 / 결재선상의 결재자. */
function canView(m: Member, o: Order, accountId: string): boolean {
  if (o.requester_id === accountId) return true
  if (isVendor(m)) return m.vendor_id === o.vendor_id
  return inApprovalChain(m, o)
}

/** 프론트에 그대로 쓸 수 있는 모양. 내부 필드명을 노출하지 않는다. */
function toOrderView(rec: DyncolRecord<Order>) {
  const o = rec.data
  return {
    id: rec.id,
    title: o.title,
    vendor_id: o.vendor_id,
    amount: o.amount,
    status: o.status,
    current_step: o.step,
    final_step: finalStepFor(o.amount),
    requester_id: o.requester_id,
    dept_id: o.dept_id,
    submitted_at: o.submitted_at,
  }
}

// ---------------------------------------------------------------------------
// 결재 전이 — 경합 방지의 중심
// ---------------------------------------------------------------------------

/**
 * 단계 선점 키. `submitted_at` 을 넣는 이유는 **재상신 라운드 구분** 때문이다.
 * 반려 후 재상신하면 다시 step 1 부터인데 키가 `발주#단계` 뿐이면 이전 라운드의 선점
 * 레코드에 막혀 재결재가 불가능해진다. 재상신은 `submitted_at` 을 새로 찍으므로
 * 라운드마다 새 키가 나온다.
 */
const stepKeyOf = (orderId: string, submittedAt: string, step: number) =>
  `${orderId}|${submittedAt}|${step}`

/**
 * 상태 전이 한 문장. `if` 에 들어가는 값들의 의미:
 *   - `status: 'pending'` — 이미 종결된 발주에 덧쓰기 금지
 *   - `step` — 다른 결재자가 이미 다음 단계로 넘겼으면 거부(단계 건너뜀 방지)
 *   - `amount` — 내가 결재선을 판정한 근거. 그 사이 금액이 바뀌면 전원 거부(낙관적 락)
 *   - `submitted_at` — 그 사이 재상신됐으면 거부(라운드 뒤바뀜 방지)
 * 조건과 갱신이 한 문장이라 그 사이에 끼어들 틈이 없다. 어긋나면 409.
 */
function applyTransition(sdk: Sdk, orderId: string, seen: Order, result: Decision) {
  const patch: Record<string, unknown> =
    result === 'rejected'
      ? { status: 'rejected' }
      : seen.step >= finalStepFor(seen.amount)
        ? { status: 'approved' }
        : { step: seen.step + 1 }

  return sdk.dyncol.update<Order>('po_order', orderId, patch, {
    if: {
      status: 'pending',
      step: seen.step,
      amount: seen.amount,
      submitted_at: seen.submitted_at,
    },
  })
}

/** 확정되지 못한 선점 레코드 회수. 실패하면 그 단계가 잠긴 채 남으므로 크게 남긴다. */
async function releaseClaim(sdk: Sdk, claimId: string, why: string): Promise<void> {
  try {
    await sdk.dyncol.remove('po_approval', claimId)
  } catch (e) {
    console.error('[claim-release-failed]', {
      requestId: sdk.ctx.requestId,
      claimId,
      why,
      error: String(e),
    })
  }
}

// ---------------------------------------------------------------------------
// POST /orders — 발주 상신
// ---------------------------------------------------------------------------

route.post('/orders', async (c) => {
  const sdk = c.var.sdk
  const actor = c.var.ctx.accountId
  if (!actor) return c.json({ error: '로그인이 필요합니다.' }, 401)

  const body = parseJson(await c.req.text())
  if (!body) return c.json({ error: '요청 본문이 올바른 JSON 이 아닙니다.' }, 400)

  const title = str(body.title)
  const vendorId = str(body.vendor_id)
  const amount = body.amount
  if (!title) return c.json({ error: '발주 제목을 입력해 주세요.' }, 400)
  if (!vendorId) return c.json({ error: '협력업체를 지정해 주세요.' }, 400)
  // 금액은 낙관적 락의 비교 대상이다. 소수점이 섞이면 값 비교가 취약해지므로 원 단위 정수만 받는다.
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    return c.json({ error: '발주 금액은 1원 이상의 정수여야 합니다.' }, 400)
  }

  const member = await loadMember(sdk, actor)
  if (!member) return c.json({ error: '조직 정보가 없어 발주를 올릴 수 없습니다.' }, 403)
  if (isVendor(member)) return c.json({ error: '협력업체는 발주를 상신할 수 없습니다.' }, 403)

  // 부서는 본인 조직 정보에서 가져온다 — 본문 값을 믿으면 결재선(부서 결재자)을 우회할 수 있다.
  const created = await sdk.dyncol.create<Order>('po_order', {
    title,
    vendor_id: vendorId,
    amount,
    status: 'pending',
    step: 1,
    requester_id: actor,
    dept_id: member.dept_id,
    submitted_at: now(),
  })

  await audit(sdk, 'order.submit', created.id, {
    amount,
    vendor_id: vendorId,
    final_step: finalStepFor(amount),
  })

  return c.json(toOrderView(created), 201)
})

// ---------------------------------------------------------------------------
// POST /orders/:id/decide — 승인 / 반려
// ---------------------------------------------------------------------------

route.post('/orders/:id/decide', async (c) => {
  const sdk = c.var.sdk
  const actor = c.var.ctx.accountId
  if (!actor) return c.json({ error: '로그인이 필요합니다.' }, 401)

  const orderId = c.req.param('id')
  const body = parseJson(await c.req.text())
  if (!body) return c.json({ error: '요청 본문이 올바른 JSON 이 아닙니다.' }, 400)

  const result = body.result
  if (result !== 'approved' && result !== 'rejected') {
    return c.json({ error: "result 는 'approved' 또는 'rejected' 여야 합니다." }, 400)
  }
  const reason = str(body.reason).slice(0, 500)

  const member = await loadMember(sdk, actor)
  if (!member) return c.json({ error: '조직 정보가 없습니다.' }, 403)
  const myStep = RANK_STEP[member.rank]
  if (!myStep) return c.json({ error: '결재 권한이 없습니다.' }, 403)

  // 여기서 읽은 값(step·amount·submitted_at)이 전이 `if` 의 근거가 된다.
  const order = await sdk.dyncol.get<Order>('po_order', orderId)
  const seen = order.data

  if (!inApprovalChain(member, seen)) {
    await audit(sdk, 'decide.denied', orderId, { reason: 'out_of_chain' })
    return c.json({ error: '이 발주의 결재자가 아닙니다.' }, 403)
  }
  if (seen.status !== 'pending') {
    await audit(sdk, 'decide.conflict', orderId, { status: seen.status })
    return c.json({ error: '이미 종결된 발주입니다.', status: seen.status }, 409)
  }
  if (myStep !== seen.step) {
    await audit(sdk, 'decide.denied', orderId, { reason: 'wrong_step', current_step: seen.step })
    return c.json({ error: '현재 결재 차례가 아닙니다.', current_step: seen.step }, 403)
  }

  const stepKey = stepKeyOf(orderId, seen.submitted_at, seen.step)

  // 1단계: 단계 선점. `order_step_key` 가 unique 이므로 서버가 락을 먼저 잡는다 —
  // 같은 단계를 동시에 누른 결재자 중 한 명만 통과하고 나머지는 409 다.
  // (미리 조회해 "이미 처리됐나?" 검사하는 방식은 경합에 뚫린다.)
  let claimId: string
  try {
    const claim = await sdk.dyncol.create<Approval>('po_approval', {
      order_step_key: stepKey,
      order_id: orderId,
      step: seen.step,
      approver_id: actor,
      result,
      reason,
      decided_at: now(),
    })
    claimId = claim.id
  } catch (e) {
    if (e instanceof SdkError && e.status === 409) {
      // 이 단계는 남이 먼저 잡았다. 먼저 박힌 결과를 읽어 **그대로 따라 굴린다** —
      // 선점 직후 전이 전에 죽은 실행이 있었다면 발주가 pending 에 멈춰 있고, 그 단계는
      // 키가 잠겨 아무도 다시 처리할 수 없기 때문이다(자기 판단을 밀어붙이지는 않는다).
      const prior = await sdk.dyncol.list<Approval>('po_approval', {
        filter: { order_step_key: stepKey },
        limit: 1,
      })
      const decided = prior.items[0]?.data
      if (decided) {
        try {
          await applyTransition(sdk, orderId, seen, decided.result)
        } catch (e2) {
          if (!(e2 instanceof SdkError && e2.status === 409)) throw e2
          // 409 = 이미 누군가 전이시켰다. 정상이다.
        }
      }
      await audit(sdk, 'decide.conflict', orderId, { step: seen.step, reason: 'step_claimed' })
      return c.json(
        {
          error: '이미 처리된 단계입니다.',
          code: 'STEP_ALREADY_DECIDED',
          step: seen.step,
          result: decided?.result ?? null,
        },
        409,
      )
    }
    throw e
  }

  // 2단계: 상태 전이. 조건이 어긋나면(금액 변경·단계 진행·재상신·종결) 전원 거부된다.
  let updated: DyncolRecord<Order>
  try {
    updated = await applyTransition(sdk, orderId, seen, result)
  } catch (e) {
    // 보상 순서: 전이가 안 됐으므로 **선점 레코드를 회수**해 재판정 가능한 상태로 되돌린다.
    await releaseClaim(sdk, claimId, 'transition-failed')
    if (e instanceof SdkError && e.status === 409) {
      await audit(sdk, 'decide.stale', orderId, {
        step: seen.step,
        seen_amount: seen.amount,
      })
      return c.json(
        {
          error: '결재 판정 근거(금액·단계)가 그 사이 변경되었습니다. 다시 확인해 주세요.',
          code: 'STALE_ORDER',
        },
        409,
      )
    }
    throw e
  }

  const after = updated.data
  if (after.status === 'rejected') {
    await notify(sdk, 'rejected', orderId, {
      requester_id: after.requester_id,
      step: seen.step,
      reason,
    })
  }
  await audit(sdk, 'order.decide', orderId, {
    result,
    step: seen.step,
    amount: seen.amount,
    next_status: after.status,
    next_step: after.step,
  })

  return c.json({
    ...toOrderView(updated),
    decided: { step: seen.step, result, approver_id: actor, reason },
  })
})

// ---------------------------------------------------------------------------
// POST /orders/:id/resubmit — 반려된 발주 재상신 (다시 step 1 부터)
// ---------------------------------------------------------------------------

route.post('/orders/:id/resubmit', async (c) => {
  const sdk = c.var.sdk
  const actor = c.var.ctx.accountId
  if (!actor) return c.json({ error: '로그인이 필요합니다.' }, 401)

  const orderId = c.req.param('id')
  const body = parseJson(await c.req.text())
  if (!body) return c.json({ error: '요청 본문이 올바른 JSON 이 아닙니다.' }, 400)

  const order = await sdk.dyncol.get<Order>('po_order', orderId)
  const seen = order.data
  if (seen.requester_id !== actor) {
    return c.json({ error: '요청자만 재상신할 수 있습니다.' }, 403)
  }

  // 금액 수정은 **결재가 돌지 않는 상태에서만** 허용한다. pending 중 금액 변경을 열어 두면
  // 결재선 판정 근거가 흔들리므로, 여기서 상태로 차단하고 결재 쪽 `if` 로 한 번 더 막는다.
  let amount = seen.amount
  if (body.amount !== undefined) {
    if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount <= 0) {
      return c.json({ error: '발주 금액은 1원 이상의 정수여야 합니다.' }, 400)
    }
    amount = body.amount
  }

  const patch: Record<string, unknown> = {
    status: 'pending',
    step: 1,
    amount,
    submitted_at: now(),
  }
  const title = str(body.title)
  if (title) patch.title = title

  try {
    // `if` 로 "내가 본 반려 상태 그대로일 때만" — 동시 재상신 2건 중 1건만 통과한다.
    const updated = await applyTransitionlessUpdate(sdk, orderId, patch, seen)
    await audit(sdk, 'order.resubmit', orderId, {
      amount,
      prev_amount: seen.amount,
      final_step: finalStepFor(amount),
    })
    return c.json(toOrderView(updated))
  } catch (e) {
    if (e instanceof SdkError && e.status === 409) {
      await audit(sdk, 'resubmit.conflict', orderId, { status: seen.status })
      return c.json(
        { error: '반려 상태의 발주만 재상신할 수 있습니다.', code: 'NOT_REJECTED' },
        409,
      )
    }
    throw e
  }
})

/** 재상신 갱신 — 반려 상태·같은 라운드일 때만. (전이 헬퍼와 조건이 달라 분리) */
function applyTransitionlessUpdate(
  sdk: Sdk,
  orderId: string,
  patch: Record<string, unknown>,
  seen: Order,
) {
  return sdk.dyncol.update<Order>('po_order', orderId, patch, {
    if: { status: 'rejected', submitted_at: seen.submitted_at, requester_id: seen.requester_id },
  })
}

// ---------------------------------------------------------------------------
// GET /orders/pending — 내가 처리할 차례인 발주
//   ':id' 보다 먼저 등록해야 한다(같은 메서드는 등록 순서로 매칭되므로 'pending' 이
//   :id 로 먹히면 안 된다).
// ---------------------------------------------------------------------------

route.get('/orders/pending', async (c) => {
  const sdk = c.var.sdk
  const actor = c.var.ctx.accountId
  if (!actor) return c.json({ error: '로그인이 필요합니다.' }, 401)

  const member = await loadMember(sdk, actor)
  if (!member) return c.json({ error: '조직 정보가 없습니다.' }, 403)
  const myStep = RANK_STEP[member.rank]
  if (!myStep || isVendor(member)) return c.json({ error: '결재 권한이 없습니다.' }, 403)

  const wanted = Number(c.req.query('limit') ?? '20')
  const limit = Math.min(Number.isFinite(wanted) && wanted > 0 ? wanted : 20, LIST_MAX)
  const cursor = c.req.query('cursor') ?? undefined

  // 내 차례 = status pending && step == 내 랭크 단계. 팀장·부장은 자기 부서로 더 좁힌다.
  const filter: Record<string, unknown> = { status: 'pending', step: myStep }
  if (member.rank !== 'exec') filter.dept_id = member.dept_id

  const res = await sdk.dyncol.list<Order>('po_order', { filter, limit, cursor })
  await audit(sdk, 'order.list_pending', `step:${myStep}`, {
    dept_id: member.rank === 'exec' ? 'ALL' : member.dept_id,
    count: res.items.length,
  })

  return c.json({
    items: res.items.map(toOrderView),
    next_cursor: res.next_cursor ?? null,
    my_step: myStep,
  })
})

// ---------------------------------------------------------------------------
// GET /orders/:id — 발주 상세 (권한 확인)
// ---------------------------------------------------------------------------

route.get('/orders/:id', async (c) => {
  const sdk = c.var.sdk
  const actor = c.var.ctx.accountId
  if (!actor) return c.json({ error: '로그인이 필요합니다.' }, 401)

  const orderId = c.req.param('id')
  const member = await loadMember(sdk, actor)
  if (!member) return c.json({ error: '조직 정보가 없습니다.' }, 403)

  const order = await sdk.dyncol.get<Order>('po_order', orderId)
  if (!canView(member, order.data, actor)) {
    await audit(sdk, 'order.view_denied', orderId, { rank: member.rank })
    return c.json({ error: '이 발주를 조회할 권한이 없습니다.' }, 403)
  }

  // 결재 이력은 라운드당 최대 3건이라 한 페이지로 충분하다.
  const history = await sdk.dyncol.list<Approval>('po_approval', {
    filter: { order_id: orderId },
    limit: LIST_MAX,
  })

  await audit(sdk, 'order.view', orderId, { rank: member.rank })

  return c.json({
    ...toOrderView(order),
    approvals: history.items
      .map((r) => ({
        step: r.data.step,
        approver_id: r.data.approver_id,
        result: r.data.result,
        reason: r.data.reason,
        decided_at: r.data.decided_at,
      }))
      .sort((a, b) => a.decided_at.localeCompare(b.decided_at)),
  })
})

// ---------------------------------------------------------------------------
// 스케줄 — 결재 대기 3일 초과 지연 알림
// ---------------------------------------------------------------------------

const DELAY_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000
/** 같은 계획 실행의 재시도만 걸러내는 창. 하루 뒤 정기 실행은 다시 알린다. */
const DEDUPE_WINDOW_MS = 12 * 60 * 60 * 1000
const MAX_PAGES = 3
/** 실행 1회 알림 상한. 스케줄은 실패해도 즉시 아무도 모르는 경로라 폭주를 스스로 막는다. */
const MAX_NOTICES_PER_RUN = 30

/**
 * 대기 시작 시각 = 직전 단계 승인 시각(있으면), 없으면 상신 시각.
 * step 1 이면 조회 없이 상신 시각으로 판정해 호출 수를 아낀다.
 */
async function waitingSince(sdk: Sdk, rec: DyncolRecord<Order>): Promise<string> {
  const o = rec.data
  if (o.step <= 1) return o.submitted_at
  const history = await sdk.dyncol.list<Approval>('po_approval', {
    filter: { order_id: rec.id },
    limit: 10,
  })
  // 이전 라운드(반려→재상신) 이력이 섞여 있으므로 현재 라운드 것만 본다.
  const current = history.items
    .map((r) => r.data.decided_at)
    .filter((at) => at > o.submitted_at)
    .sort()
  return current[current.length - 1] ?? o.submitted_at
}

/**
 * 이미 알렸는지. `po_audit` 에는 unique 필드가 없어 조회 기반 중복 제거밖에 없다
 * (근본 해결은 감사 컬렉션에 `notify_key` unique 필드를 두는 것). 재시도 중복 알림은
 * 아프긴 해도 결재 상태를 훼손하지는 않으므로 이 수준에서 감수한다.
 */
async function alreadyNotified(sdk: Sdk, orderId: string, sinceIso: string): Promise<boolean> {
  const res = await sdk.dyncol.list('po_audit', {
    filter: { action: 'notify:delay', target: orderId, at: { gte: sinceIso } },
    limit: 1,
  })
  return res.items.length > 0
}

schedule('po-delay-notify', async (sdk, envelope) => {
  // 계획 시각 기준으로 계산한다 — 지연 실행·재시도에서도 같은 판정이 나와야 멱등하다.
  const planned = Date.parse(envelope.scheduledFor) || Date.now()
  const cutoff = new Date(planned - DELAY_DAYS * DAY_MS).toISOString()
  const dedupeSince = new Date(planned - DEDUPE_WINDOW_MS).toISOString()

  let cursor: string | undefined
  let notified = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    // 상신이 3일 이내인 건은 어떤 단계든 지연일 수 없으므로 서버에서 미리 걸러 받는다.
    const res = await sdk.dyncol.list<Order>('po_order', {
      filter: { status: 'pending', submitted_at: { lt: cutoff } },
      limit: LIST_MAX,
      cursor,
    })

    for (const rec of res.items) {
      if (notified >= MAX_NOTICES_PER_RUN) return // 남은 건은 다음 실행에 넘긴다
      const since = await waitingSince(sdk, rec)
      if (since >= cutoff) continue // 최근에 단계가 넘어갔다 → 지연 아님
      if (await alreadyNotified(sdk, rec.id, dedupeSince)) continue

      await notify(sdk, 'delay', rec.id, {
        step: rec.data.step,
        waiting_since: since,
        dept_id: rec.data.dept_id,
        requester_id: rec.data.requester_id,
        amount: rec.data.amount,
      })
      notified += 1
    }

    cursor = res.next_cursor
    if (!cursor) break
  }

  console.log('[po-delay-notify]', {
    requestId: sdk.ctx.requestId,
    scheduledFor: envelope.scheduledFor,
    notified,
  })
})
