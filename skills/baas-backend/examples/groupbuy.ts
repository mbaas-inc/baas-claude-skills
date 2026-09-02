/**
 * 동네 정육점 공동구매 — 참여 신청 / 현황 조회 / 마감 확정.
 *
 * 이 도메인의 어려운 점은 두 가지뿐이다.
 *  1) `joined` 집계가 동시 요청에서 유실되거나 부풀지 않아야 한다.
 *  2) 마감 확정이 여러 번 실행돼도 결과가 한 번만 정해져야 한다.
 *
 * 둘 다 "애플리케이션에서 조회해 검사하기"로는 못 푼다. 조회와 쓰기 사이에 다른 요청이
 * 끼어들기 때문이다. 그래서 두 곳 모두 **원자적 프리미티브를 먼저 통과시키고**
 * 그 반환값을 근거로 판단한다 — unique 제약(중복 차단)과 increment(집계).
 */

import { route, schedule } from '../platform/app'
import { SdkError } from '../platform/sdk'
import type { Sdk } from '../platform/sdk'

// ── 컬렉션 스키마 ────────────────────────────────────────────────────────────

interface Product {
  title: string
  price: number
  min_people: number
  /** ISO 문자열 */
  deadline: string
  joined: number
  status: 'open' | 'fulfilled' | 'cancelled'
}

interface Join {
  /** `${product_id}:${account_key}` — unique. 상품당 1인 1회를 서버가 원자적으로 강제한다. */
  product_account_key: string
  product_id: string
  account_key: string
  phone: string
}

interface Result {
  /** unique. 상품당 결과 레코드가 하나뿐임을 서버가 보장한다 = 중복 확정 방지 잠금. */
  product_id: string
  state: 'fulfilled' | 'cancelled'
  joined_at_close: number
  decided_at: string
}

const PRODUCT = 'gb_product'
const JOIN = 'gb_join'
const RESULT = 'gb_result'

// ── 공통 유틸 ────────────────────────────────────────────────────────────────

/**
 * 마감 경과 여부.
 *
 * 파싱 불가한 deadline 은 "아직 안 지났다"로 본다. 반대로 처리하면 데이터 오류 하나가
 * 멀쩡한 공동구매를 전부 취소시켜 버린다 — 되돌릴 수 없는 쪽으로 기울면 안 된다.
 */
function isClosed(deadline: string, at: number = Date.now()): boolean {
  const ts = Date.parse(deadline)
  if (Number.isNaN(ts)) {
    console.warn('[groupbuy] deadline 파싱 실패', { deadline })
    return false
  }
  return ts <= at
}

/** 참여를 더 받을 수 있는 상태인가 (열려 있고 + 마감 전). */
function isJoinable(p: Product, at?: number): boolean {
  return p.status === 'open' && !isClosed(p.deadline, at)
}

/** unique 충돌(409)인지. dyncol 은 unique 위반을 409 로 돌려준다. */
function isConflict(e: unknown): e is SdkError {
  return e instanceof SdkError && e.status === 409
}

/** 상품의 확정 결과 조회. product_id 가 unique 라 있으면 정확히 한 건이다. */
async function findResult(sdk: Sdk, productId: string) {
  const res = await sdk.dyncol.list<Result>(RESULT, {
    filter: { product_id: productId },
    limit: 1,
  })
  return res.items[0] ?? null
}

// ── POST /join — 참여 신청 ───────────────────────────────────────────────────

route.post('/join', async (c) => {
  const { ctx, sdk } = c.var
  const accountId = ctx.accountId
  if (!accountId) {
    return c.json({ error: '로그인이 필요합니다.' }, 401)
  }

  const body = (await c.req.json().catch(() => null)) as
    | { productId?: unknown; phone?: unknown }
    | null
  const productId = typeof body?.productId === 'string' ? body.productId.trim() : ''
  if (!productId) {
    return c.json({ error: 'productId 가 필요합니다.' }, 400)
  }

  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  if (!phone) {
    // 공동구매 성사 시 연락할 방법이 없으면 참여를 받아도 의미가 없다.
    return c.json({ error: '연락받을 전화번호가 필요합니다.' }, 400)
  }

  // ── 1단계: 사전 확인 (권고적 — 판정 근거가 아니라 낭비 방지용)
  // 여기서 통과해도 그 사이에 마감될 수 있으므로 이 결과를 믿고 최종 판정하지 않는다.
  // 그래도 먼저 하는 이유는, 이미 마감된 상품에 대해 아래 쓰기 2회를 낭비하지 않기 위해서다.
  const product = await sdk.dyncol.get<Product>(PRODUCT, productId)
  if (!isJoinable(product.data)) {
    return c.json(
      {
        error:
          product.data.status === 'open'
            ? '마감된 공동구매입니다.'
            : '이미 종료된 공동구매입니다.',
        status: product.data.status,
      },
      409,
    )
  }

  // ── 2단계: 중복 차단 (원자적 관문) — 집계보다 **먼저**
  // product_account_key 가 unique 라 동시에 들어온 같은 회원의 요청 중 하나만 통과한다.
  // 이 create 를 increment 뒤로 미루면, 중복 요청이 이미 카운터를 올린 뒤에 거절돼
  // 집계가 부풀어 버린다. "카운터를 올릴 자격"을 먼저 원자적으로 따내고 나서 올린다.
  let joinRecord
  try {
    joinRecord = await sdk.dyncol.create<Join>(JOIN, {
      product_account_key: `${productId}:${accountId}`,
      product_id: productId,
      account_key: accountId,
      phone,
    })
  } catch (e) {
    if (isConflict(e)) {
      return c.json({ error: '이미 참여한 공동구매입니다.', alreadyJoined: true }, 409)
    }
    throw e
  }

  // ── 3단계: 원자 증가 — 반환값이 곧 내 순번
  // 조회→+1→저장 은 동시 요청에서 갱신이 유실된다. increment 는 서버에서 원자적으로
  // 처리되고 **갱신된 레코드**를 돌려주므로, 동시에 들어온 요청들이 서로 다른 값을 받는다.
  // 즉 반환된 joined 를 그대로 내 순번으로 읽으면 중복도 유실도 없다.
  let after
  try {
    after = await sdk.dyncol.increment<Product>(PRODUCT, productId, 'joined', 1)
  } catch (e) {
    // 증가가 반영됐는지 알 수 없는 상태(네트워크 실패 등). 참여 레코드를 되돌려
    // 회원이 재시도할 수 있게 한다 — 남겨두면 unique 에 막혀 영영 참여할 수 없다.
    await sdk.dyncol.remove(JOIN, joinRecord.id).catch(() => {})
    throw e
  }

  // ── 4단계: 사후 검증 — increment 반환 레코드가 "가장 최근의 진실"이다
  // 1단계 조회 이후 마감·취소됐을 수 있다. 별도 조회를 또 하지 않고 increment 가 돌려준
  // 스냅샷으로 판정하는 이유는, 그 값이 내 증가가 반영된 시점의 상태라서
  // "내 증가가 마감 전이었나"를 가장 좁은 창으로 판단할 수 있기 때문이다.
  if (!isJoinable(after.data)) {
    // 보상은 **카운터 먼저**. 참여 레코드를 먼저 지우면, 그 다음 감소가 실패했을 때
    // 근거 없는 +1 이 남아 성사 판정을 왜곡한다. 집계 정확성이 상위 요구사항이다.
    await sdk.dyncol.increment(PRODUCT, productId, 'joined', -1).catch(() => {})
    await sdk.dyncol.remove(JOIN, joinRecord.id).catch(() => {})
    return c.json({ error: '마감된 공동구매입니다.', status: after.data.status }, 409)
  }

  const joined = after.data.joined
  const minPeople = after.data.min_people
  return c.json(
    {
      joinId: joinRecord.id,
      productId,
      // 내 순번 = 원자 증가가 나에게 배정한 값. 다른 참여자와 절대 겹치지 않는다.
      order: joined,
      joined,
      minPeople,
      // 음수 순번(초과 달성)은 의미가 없으므로 0 으로 바닥을 깐다.
      remaining: Math.max(0, minPeople - joined),
      fulfilledNow: joined >= minPeople,
    },
    201,
  )
})

// ── GET /status — 현황 조회 ──────────────────────────────────────────────────

route.get('/status', async (c) => {
  const { sdk } = c.var
  const productId = c.req.query('productId')?.trim()
  if (!productId) {
    return c.json({ error: 'productId 가 필요합니다.' }, 400)
  }

  let product = await sdk.dyncol.get<Product>(PRODUCT, productId)

  // 마감 시각이 지났는데 아직 open 이면, 크론을 기다리지 않고 여기서도 확정을 시도한다.
  // 확정 로직 자체가 멱등(unique 로 잠금)이라 크론과 동시에 돌아도 결과가 갈라지지 않는다.
  // 실패해도 조회는 성공해야 하므로 삼켜서 현재 값으로 응답한다 — 읽기가 쓰기 권한 때문에
  // 깨지면 안 된다.
  if (product.data.status === 'open' && isClosed(product.data.deadline)) {
    try {
      await finalize(sdk, productId)
      product = await sdk.dyncol.get<Product>(PRODUCT, productId)
    } catch (e) {
      console.warn('[groupbuy] 조회 중 확정 시도 실패', { productId, error: String(e) })
    }
  }

  const result = await findResult(sdk, productId)
  const joined = product.data.joined
  const minPeople = product.data.min_people

  return c.json({
    productId,
    title: product.data.title,
    price: product.data.price,
    deadline: product.data.deadline,
    status: product.data.status,
    joined,
    minPeople,
    remaining: Math.max(0, minPeople - joined),
    closed: isClosed(product.data.deadline),
    result: result
      ? {
          state: result.data.state,
          joinedAtClose: result.data.joined_at_close,
          decidedAt: result.data.decided_at,
        }
      : null,
  })
})

// ── 마감 확정 ────────────────────────────────────────────────────────────────

/**
 * 상품 하나를 확정한다. **몇 번을 호출해도 결과가 한 번만 정해진다.**
 *
 * 순서가 핵심이다:
 *   (1) gb_result 를 먼저 만든다 — product_id 가 unique 라 이 create 가 곧 확정 잠금이다.
 *       동시에 크론 두 번, 크론과 조회가 겹쳐도 정확히 하나만 성공하고 나머지는 409 다.
 *   (2) 그 다음 gb_product.status 를 결과에 맞춘다 — 이쪽은 **파생 상태**라 몇 번 써도 같다.
 *
 * 반대로 status 를 먼저 바꾸면 원자적 관문이 하나도 없어서, 두 실행이 서로 다른 `joined`
 * 를 읽고 fulfilled/cancelled 로 엇갈리게 덮어쓸 수 있다. 그래서 "결정을 원자적으로 박고,
 * 표시 상태는 뒤따라간다"는 순서를 지킨다.
 *
 * (1) 직후 죽어도 안전하다. 다음 실행이 409 를 받고, 이미 박힌 결과를 읽어
 * (2) 를 다시 적용하므로 스스로 복구된다.
 */
async function finalize(sdk: Sdk, productId: string): Promise<Result['state'] | null> {
  // 확정 직전에 다시 읽는다. 목록 조회 시점의 joined 는 이미 낡았을 수 있다.
  const product = await sdk.dyncol.get<Product>(PRODUCT, productId)
  if (!isClosed(product.data.deadline)) return null

  const joinedAtClose = product.data.joined
  const decided: Result['state'] =
    joinedAtClose >= product.data.min_people ? 'fulfilled' : 'cancelled'

  let state = decided
  try {
    await sdk.dyncol.create<Result>(RESULT, {
      product_id: productId,
      state: decided,
      joined_at_close: joinedAtClose,
      decided_at: new Date().toISOString(),
    })
  } catch (e) {
    if (!isConflict(e)) throw e
    // 이미 다른 실행이 확정했다. 내가 계산한 값이 아니라 **먼저 박힌 결과**를 따른다.
    // 여기서 내 계산을 밀어붙이면 중복 확정과 같은 결과가 된다.
    const existing = await findResult(sdk, productId)
    if (!existing) throw e
    state = existing.data.state
  }

  // 파생 상태 반영. 이미 같은 값이면 다시 써도 무해하므로 재실행 안전하다.
  if (product.data.status !== state) {
    await sdk.dyncol.update<Product>(PRODUCT, productId, { status: state })
  }
  return state
}

/**
 * 크론 확정 — "아무도 보고 있지 않아도" 도는 쪽.
 *
 * 크론에는 요청 회원이 없다(`ctx.accountId === null`). 따라서 gb_product 컬렉션은
 * 소유자 스코프가 아닌 접근 정책이어야 이 목록 조회가 성립한다.
 */
schedule('groupbuy-finalize', async (sdk) => {
  const now = Date.now()
  let cursor: string | undefined
  let scanned = 0
  let finalized = 0

  // 목록은 100건 상한이라 커서로 넘긴다. 상한 없이 돌면 크론 한 번이 무한정 길어질 수
  // 있으므로 페이지 수를 막아 둔다 — 남은 건은 다음 실행이 이어받는다(멱등하므로 안전).
  for (let page = 0; page < 50; page += 1) {
    const res = await sdk.dyncol.list<Product>(PRODUCT, {
      filter: { status: 'open' },
      limit: 100,
      cursor,
    })

    for (const item of res.items) {
      scanned += 1
      if (!isClosed(item.data.deadline, now)) continue
      try {
        const state = await finalize(sdk, item.id)
        if (state) finalized += 1
      } catch (e) {
        // 한 건 실패가 나머지 확정을 막으면 안 된다. 실패분은 다음 실행이 다시 집는다.
        console.error('[groupbuy] 확정 실패', { productId: item.id, error: String(e) })
      }
    }

    cursor = res.next_cursor
    if (!cursor) break
  }

  console.log('[groupbuy] 확정 배치 완료', { scanned, finalized })
})
