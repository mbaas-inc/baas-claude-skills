/**
 * 플랫폼 SDK — 주입 토큰을 자동 장착하고 dyncol·BaaS 를 감싼다.
 *
 * **에이전트가 인증 코드를 쓰지 않게 하는 것**이 이 파일의 존재 이유다. 토큰은
 * envelope에서만 오고 이 모듈 밖으로 나가지 않는다. fetch 배관을 직접 만들면 토큰이
 * 로그·에러 응답으로 새기 시작하므로, 데이터 접근은 전부 여기를 지나야 한다.
 */

import type { RequestContext } from './envelope'

/**
 * 플랫폼이 주입한다. **기본값을 두지 않는다.**
 *
 * 올바른 값은 환경마다 다르므로(stage 와 dev 가 서로 다른 BaaS origin 을 쓴다) 어떤
 * 하드코딩도 한쪽에서는 틀린다. 그런데 틀린 기본값은 틀렸다고 말하지 않는다 — 프로세스는
 * 정상 기동하고 기동 로그도 깨끗한데 데이터 접근만 전부 실패해, 원인이 호출 시점의 여러 겹
 * 아래에서 나타난다(실측: 미리보기가 뜨는데 목록만 비어 원인 규명에 오래 걸렸다).
 *
 * 그래서 없으면 **기동 시점에 죽는다.** 로컬도 예외로 두지 않는다 — 로컬만 다른 값을
 * 보게 한 예전 기본값(`http://127.0.0.1:8010`)이 이 문제를 만들었다. 로컬에서도 실제
 * 개발 환경의 BaaS origin 을 가리키면 된다.
 */
const BAAS_BASE_URL = (() => {
  const value = process.env.BAAS_BASE_URL?.trim()
  if (!value) {
    throw new Error(
      'BAAS_BASE_URL 이 설정되지 않았다. 플랫폼이 주입하는 값이며, 로컬에서는 개발 환경의 ' +
        'BaaS origin 을 지정해야 한다.',
    )
  }
  return value.replace(/\/+$/, '')
})()

export class SdkError extends Error {
  // 파라미터 프로퍼티(`readonly status: number`)를 쓰지 않는다. `npm run dev` 가 쓰는
  // `node --experimental-strip-types` 는 타입을 지우기만 할 뿐 코드를 변환하지 못해
  // 파라미터 프로퍼티에서 죽는다(ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). 번들은 통과하므로
  // 이 형태를 되돌리면 배포는 멀쩡한데 로컬 기동만 조용히 깨진다.
  readonly status: number
  readonly errorCode?: string
  /**
   * 서버가 실패에 실어 보낸 구조화 정보. 지금은 트랜잭션이 `{ failed: TxnFailure }` 를 넣는다.
   *
   * 메시지 문자열을 파싱해 분기하지 말라고 두는 값이다 — 문구는 언제든 바뀌지만 이 모양은
   * 계약이다.
   */
  readonly detail?: Record<string, unknown>

  constructor(message: string, status: number, errorCode?: string,
              detail?: Record<string, unknown>) {
    super(message)
    this.name = 'SdkError'
    this.status = status
    this.errorCode = errorCode
    this.detail = detail
  }
}

export interface DyncolRecord<T = Record<string, unknown>> {
  id: string
  data: T
}

/** 필터 연산자. dyncol 이 지원하는 것만 노출한다. */
export type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'has'

/**
 * dyncol 목록 조회 옵션.
 *
 * **커서는 없다.** 서버는 `offset` 기반이고 응답에 `total_count` 를 함께 준다(실측:
 * `cursor` 를 보내면 무시되고 항상 첫 페이지가 온다). 다만 대부분은 페이지를 넘길 일이
 * 없다 — 개수·합계는 `aggregate` 가, 좁히기는 `filter` 가 처리한다.
 *
 * `offset` 페이징은 `sort` 를 함께 주지 않으면 순서가 흔들려 같은 행을 두 번 받거나
 * 빠뜨린다(서버 기본 정렬은 `-created_at`).
 *
 * `filter` 는 `{ 필드: { 연산자: 값 } }` 형태다 — 값만 주면 `eq` 로 본다.
 *   `{ status: 'open' }`              → status = 'open'
 *   `{ deadline: { lt: nowIso } }`    → deadline < nowIso
 */
export interface ListOptions {
  filter?: Record<string, unknown | Partial<Record<FilterOp, unknown>>>
  /** 서버 기본 20, 상한 100. */
  limit?: number
  offset?: number
  /** `'field'` 오름차순, `'-field'` 내림차순. 기본 `-created_at`. */
  sort?: string
}

/** 목록 응답. 봉투 레벨에 전체 건수가 온다 — 세려고 전 페이지를 받을 필요가 없다. */
export interface ListResult<T = Record<string, unknown>> {
  items: DyncolRecord<T>[]
  total_count: number
  offset: number
  limit: number
}

/** 집계 한 칸. `group_by` 가 없으면 버킷 1개이고 `key` 는 null. */
export interface AggregateBucket {
  key: string | null
  /** `count` 연산에서는 null — 건수는 `count` 에 있다. */
  value: number | null
  count: number
}

/** 레코드 지정 — id 또는 등호 필터. **정확히 하나만** 채운다.
 *
 * 필터로 지정할 수 있어야 트랜잭션이 자기완결이 된다. 밖에서 조회해 id 를 구하면 그 사이
 * 대상이 바뀔 수 있고, 트랜잭션이 낡은 id 로 시작한다.
 */
export type RecordTarget = { id: string } | { filter: Record<string, unknown> }

/** 증감 **후** 값이 만족해야 할 경계. 연산자 하나만 쓴다.
 *
 * `{ field: 'capacity' }` 로 **같은 레코드의 다른 필드**와 비교할 수 있다 — 정원은
 * `booked <= capacity` 라 상수로 표현되지 않는다.
 */
export type GuardBound = number | { field: string }
export type GuardCondition =
  | { gte: GuardBound } | { lte: GuardBound } | { gt: GuardBound } | { lt: GuardBound }

/** 트랜잭션 한 단계. `collection` 이 항목마다 있어 복수 컬렉션에 걸칠 수 있다. */
export type TxnOperation =
  | {
      op: 'create'
      collection: string
      /** `create` 에서 id 를 미리 정할 수 있다 — 같은 요청에서 자식의 reference 값으로 쓰려면 필요하다. */
      id?: string
      data: Record<string, unknown>
      label?: string
    }
  | {
      op: 'update'
      collection: string
      target: RecordTarget
      data: Record<string, unknown>
      /** 전제조건 — 내가 읽은 그 상태가 아직 그대로인가. */
      if?: Record<string, unknown>
      label?: string
    }
  | { op: 'delete'; collection: string; target: RecordTarget; label?: string }
  | {
      op: 'increment'
      collection: string
      target: RecordTarget
      field: string
      by: number
      /** 경계를 **연산과 함께** 보낸다. 없으면 음수·초과가 그대로 들어간다. */
      guard?: Record<string, GuardCondition>
      label?: string
    }

/** 어느 연산이 왜 걸렸는지. `label` 로 갈라 도메인 결과로 옮긴다. */
export interface TxnFailure {
  index: number
  op: string
  collection: string
  label?: string
  reason: 'guard_failed' | 'not_found' | 'ambiguous' | 'condition_failed'
  field?: string
  value?: number
}

/** 회원 1명. 플랫폼이 노출 범위를 정한다 — `data`(자유형 JSON)·과금·운영 메모는 오지 않는다. */
export interface ServiceAccount {
  /** `ctx.accountId` 와 같은 값. */
  id: string
  /** 로그인 ID (이메일 또는 아이디). */
  user_id: string
  /** 소셜 로그인은 추가정보 입력 전까지 `null`. */
  name: string | null
  phone: string | null
  status: string
  is_profile_completed: boolean
  /** 가입 시각 (KST). */
  created_at: string
}

export interface ServiceAccountPage {
  items: ServiceAccount[]
  /** 조건에 맞는 전체 수(페이지 아님). */
  total: number
  limit: number
  offset: number
}

/** 예약 1건. 플랫폼 예약 기능이 돌려주는 모양 그대로다. */
export interface ServiceReservation {
  id: string
  target_id: string
  account_id: string
  reserved_at: string
  status: string
  form_data?: Record<string, unknown>
  admin_memo?: string | null
  created_at: string
}

export interface ServiceReservationPage {
  items: ServiceReservation[]
  total: number
  limit: number
  offset: number
}

export interface ReservationListOptions {
  targetId?: string
  status?: string
  /** ISO 8601. 예약 일시 기준이다. */
  dateFrom?: string
  dateTo?: string
  /** 예약자 이름·전화 등 */
  search?: string
  limit?: number
  offset?: number
}

export interface AccountListOptions {
  /** 1~100. 기본 20. */
  limit?: number
  offset?: number
  /** `user_id`·`name`·`phone` 부분 검색. */
  keyword?: string
}

function buildSdk(ctx: RequestContext) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BAAS_BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${ctx.token}`,
        // 데이터 플레인은 host 로 프로젝트를 해석한다. 서버 간 직접 호출에는 host 가
        // 없으므로 이 헤더가 스코프를 정한다 — 없으면 400 "프로젝트 컨텍스트가 없습니다".
        'x-baas-project-id': ctx.projectId,
        'content-type': 'application/json',
        // 디스패처·플랫폼 로그와 이어 붙이기 위한 상관 ID
        'x-request-id': ctx.requestId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      throw new SdkError(
        String(payload.message ?? `BaaS ${res.status}`),
        res.status,
        typeof payload.errorCode === 'string' ? payload.errorCode : undefined,
        // 실패 본문의 `data` — 트랜잭션은 여기에 `failed` 를 싣는다(어느 연산이 왜 걸렸는지).
        payload.data && typeof payload.data === 'object'
          ? (payload.data as Record<string, unknown>)
          : undefined,
      )
    }
    return (payload.data ?? payload) as T
  }

  const dyncol = {
    list: <T>(collection: string, opts: ListOptions = {}) => {
      const q = new URLSearchParams()
      if (opts.limit) q.set('limit', String(opts.limit))
      if (opts.offset) q.set('offset', String(opts.offset))
      if (opts.sort) q.set('sort', opts.sort)
      // dyncol 필터 DSL 은 `filter[<필드>][<연산자>]=<값>` 이다. JSON 을 통째로 보내면
      // 서버가 malformed_filter 로 거절한다.
      for (const [field, cond] of Object.entries(opts.filter ?? {})) {
        if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
          for (const [op, v] of Object.entries(cond as Record<string, unknown>)) {
            q.set(`filter[${field}][${op}]`, String(v))
          }
        } else {
          q.set(`filter[${field}][eq]`, String(cond))
        }
      }
      const qs = q.toString()
      return call<ListResult<T>>(
        'GET', `/collections/${collection}/records${qs ? `?${qs}` : ''}`,
      )
    },

    get: <T>(collection: string, recordId: string) =>
      call<DyncolRecord<T>>('GET', `/collections/${collection}/records/${recordId}`),

    /**
     * 레코드 생성. 컬렉션에 `unique` 필드가 선언돼 있으면 **서버가 원자적으로** 중복을 막는다
     * (advisory lock — 확인 후 삽입이 아니라 락을 먼저 잡는다). 동시 요청 중 하나만 통과하고
     * 나머지는 409 다. 애플리케이션에서 미리 조회해 검사하는 것은 경합에 뚫리므로,
     * **409 를 정상 분기로 다루는 것이 올바른 사용법**이다.
     */
    create: <T>(collection: string, data: Record<string, unknown>) =>
      call<DyncolRecord<T>>('POST', `/collections/${collection}/records`, { data }),

    /**
     * 레코드 부분 수정. 보낸 키만 병합되고(DB 에서 `||`) 나머지는 유지된다.
     *
     * `opts.if` — **조건부 갱신.** 그 값들이 현재 레코드와 같을 때만 갱신하고, 다르면 409.
     * 조건과 갱신이 한 문장이라 그 사이에 끼어들 틈이 없다.
     *
     * **상태 전이는 반드시 이걸로 한다.** 조회해서 확인한 뒤 update 하면 경합에 뚫린다 —
     * unique 제약으로도 막히지 않는다(잠글 값이 없다). 실측(동시 결재자 20명):
     * 조회→확인→update = **20건 승인** ❌ / `if: {status:'pending'}` = **1건** ✅
     *
     * ```ts
     * // 결재 승인 — 아직 pending 일 때만
     * await sdk.dyncol.update('po', id, { status: 'approved', step: 2 },
     *                         { if: { status: 'pending' } })
     *
     * // 낙관적 락 — 내가 본 금액이 그대로일 때만 (금액 수정 중 승인 차단)
     * await sdk.dyncol.update('po', id, { status: 'approved' },
     *                         { if: { status: 'pending', amount: seenAmount } })
     * ```
     * 409 는 정상 분기다 — 경합에서 졌다는 뜻이므로 재조회 후 다시 판단한다.
     */
    update: <T>(
      collection: string, recordId: string, data: Record<string, unknown>,
      opts: { if?: Record<string, unknown> } = {},
    ) =>
      call<DyncolRecord<T>>('PATCH', `/collections/${collection}/records/${recordId}`,
        opts.if ? { data, if: opts.if } : { data }),

    remove: (collection: string, recordId: string) =>
      call<void>('DELETE', `/collections/${collection}/records/${recordId}`),

    /**
     * number 필드 원자 증감 — **카운터 하나만** 건드릴 때 쓴다.
     *
     * 갱신된 레코드를 돌려준다. **경계 가드가 없어** 0 을 지나 음수로 내려가므로, 상한이
     * 필요하면 반환값으로 판정한다.
     *
     * ```ts
     * const after = await sdk.dyncol.increment<Post>('posts', { id }, 'views', 1)
     * ```
     *
     * ⚠️ **두 개 이상의 레코드를 바꾸면 이걸 쓰지 마라.** 중간에 실패했을 때 손으로 되돌려야
     * 하고, 그 되돌리는 사이가 남에게 보인다 — 실측(2026-09-15): 실패한 4품목 주문이 중간
     * 상태를 **2.8초 이상** 노출했고 **부분 복구 상태**까지 관측됐다. 그동안 다른 손님에게는
     * 있는 재고가 품절로 보인다. 그런 경우는 `transaction` 이다.
     *
     * **조회해서 확인한 뒤 증가시키면 안 된다.** 확인과 증가 사이에 다른 요청이 끼어든다.
     * 실측(정원 100 · 회원 120명 동시): 조회→확인→증가 = 120 ❌ / 원자증가→반환값 판정 = 100 ✅
     */
    increment: <T = Record<string, unknown>>(
      collection: string, target: RecordTarget, field: string, by: number,
    ) =>
      call<DyncolRecord<T>>('POST', `/collections/${collection}/records/increment`,
        { target, field, by }),

    /**
     * 집계 — `count`·`sum`·`avg`·`min`·`max` + 단일 필드 `group_by`. 인가는 목록과 같다.
     *
     * **세려고 목록을 받지 마라.** 서버가 세어 준다 — `limit` 상한이 100 이라 1만 건이면
     * 100 요청이 되고, 그렇게 받은 합계는 어차피 읽는 도중 바뀐다.
     *
     * ```ts
     * const [b] = await sdk.dyncol.aggregate('applications', 'count',
     *                                        { filter: { meeting_id: id } })
     * b.count   // 이 모임의 신청 건수
     * ```
     *
     * `count` 이외에는 `field` 가 필요하고 **number 타입만** 된다.
     *
     * ⚠️ **집계를 읽어 쓰기를 판정하지 마라.** 읽는 순간과 쓰는 순간 사이에 다른 요청이
     * 끼어든다. 상한 강제는 `increment` 의 반환값이나 `transaction` 으로 한다.
     */
    aggregate: (
      collection: string,
      op: 'count' | 'sum' | 'avg' | 'min' | 'max' = 'count',
      opts: ListOptions & { field?: string; groupBy?: string } = {},
    ) => {
      const q = new URLSearchParams()
      q.set('op', op)
      if (opts.field) q.set('field', opts.field)
      if (opts.groupBy) q.set('group_by', opts.groupBy)
      if (opts.limit) q.set('limit', String(opts.limit))
      for (const [field, cond] of Object.entries(opts.filter ?? {})) {
        if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
          for (const [fop, v] of Object.entries(cond as Record<string, unknown>)) {
            q.set(`filter[${field}][${fop}]`, String(v))
          }
        } else {
          q.set(`filter[${field}][eq]`, String(cond))
        }
      }
      return call<{ buckets: AggregateBucket[] }>(
        'GET', `/collections/${collection}/aggregate?${q.toString()}`,
      ).then((r) => r.buckets)
    },

    /**
     * **여러 레코드를 한 트랜잭션으로** — 하나라도 실패하면 전부 되돌린다. 최대 25 작업.
     *
     * **두 개 이상의 레코드를 바꾸는데 중간에 실패할 수 있으면 이걸 쓴다.** 재고 차감·정원
     * 확보·주문 생성처럼 따로 남으면 안 되는 묶음이 여기 들어간다.
     *
     * ```ts
     * await sdk.dyncol.transaction([
     *   { op: 'increment', collection: 'pickup_slots', target: { filter: { slot_id } },
     *     field: 'booked', by: 1,
     *     guard: { booked: { lte: { field: 'capacity' } } }, label: 'slot' },
     *   ...lines.map((l) => ({
     *     op: 'increment' as const, collection: 'menu_stock',
     *     target: { filter: { menu_item_id: l.menuItemId } },
     *     field: 'remaining', by: -l.quantity,
     *     guard: { remaining: { gte: 0 } }, label: `stock:${l.menuItemId}`,
     *   })),
     *   { op: 'create', collection: 'orders', data: { ... }, label: 'order' },
     * ])
     * ```
     *
     * **경계는 `guard` 로 함께 보낸다.** 여기서 판정해야 어긴 순간 전체가 되돌아가고, 중간
     * 상태가 밖에서 보이지 않는다. 받아서 TypeScript 로 보면 이미 늦다 — 그때는 「쓴다 →
     * 본다 → 되돌린다」가 되고 그 사이가 남에게 노출된다.
     *
     * **실패는 `SdkError` 로 온다(409).** `error.detail.failed` 에 어느 연산이 왜 걸렸는지
     * 들어 있고, `label` 로 갈라 도메인 결과로 옮긴다:
     *
     * ```ts
     * catch (e) {
     *   const failed = e instanceof SdkError ? (e.detail?.failed as TxnFailure) : undefined
     *   if (failed?.label?.startsWith('stock:'))
     *     return { status: 'sold_out', menuItemId: failed.label.slice(6) }
     *   if (failed?.label === 'slot') return { status: 'slot_full' }
     *   throw e
     * }
     * ```
     *
     * `label` 로 가르는 이유: index 로 분기하면 항목 수가 바뀌는 순간 조용히 어긋난다.
     *
     * 잠금은 서버가 정규 순서로 걸고 **실행은 보낸 순서 그대로**다 — 앞에서 만든 레코드를
     * 뒤 작업의 reference 로 쓸 수 있다(`create` 에 id 를 미리 정하는 이유).
     */
    transaction: (operations: TxnOperation[]) =>
      call<{
        results: { index: number; op: string; collection: string; id?: string
                   label?: string; value?: number }[]
        count: number
      }>(
        'POST', '/collections/transaction', { operations },
      ),

    /**
     * 같은 컬렉션 대량 처리. **항목별로 독립 성공/실패**한다 — 500행 중 3행이 중복이어도
     * 497행은 들어간다. 각 목록 최대 100.
     *
     * 전부 아니면 전무가 필요하면 `transaction` 을 쓴다.
     */
    batch: (
      collection: string,
      ops: {
        create?: { data: Record<string, unknown>; client_txn_id?: string }[]
        update?: { id: string; data: Record<string, unknown> }[]
        delete?: string[]
      },
    ) =>
      call<{
        collection: string
        results: { index: number; op: string; id?: string; success: boolean; error?: string }[]
        succeeded: number
        failed: number
      }>('POST', `/collections/${collection}/records/batch`, ops),

    /** soft-delete 된 레코드 복구. */
    restore: <T = Record<string, unknown>>(collection: string, recordId: string) =>
      call<DyncolRecord<T>>('POST', `/collections/${collection}/records/${recordId}/restore`),
  }

  // 네이티브 회원 조회 — 이 프로젝트 소속 회원만, 읽기 전용.
  //
  // `baas` 네임스페이스는 두지 않는다. 주입 토큰은 `scope=service` 로 **`sub` 가 없고**,
  // 회원 API(`/account/info`)와 백오피스 API(`/back/...`)는 `get_current_account` 로
  // `sub` 를 요구한다 — 부르면 401 `토큰 정보가 잘못되었습니다` 가 돌아온다(실측).
  // 대신 `scope=service` 로 열린 전용 경로가 있고, 그게 아래 `account` 다.
  //
  // **인가는 여기서 하지 않는다.** 플랫폼은 "같은 프로젝트 회원인가" 만 판정한다.
  // "이 요청자가 관리자인가" 는 프로젝트마다 정의가 달라 플랫폼이 알 수 없으므로,
  // **serverFn 이 먼저 판정한 뒤** 이 표면을 부른다.
  const account = {
    /** 회원 1명. 없거나 다른 프로젝트 소속이면 **둘 다 404** — 구분하면 그 UUID 가
     *  이 플랫폼에 있는지 확인하는 도구가 된다. */
    get: (accountId: string) => call<ServiceAccount>('GET', `/service/accounts/${accountId}`),

    /** 이 프로젝트 회원 한 페이지. 탈퇴 회원은 제외되고 가입 최신순이다. */
    list: (opts: AccountListOptions = {}) => {
      const q = new URLSearchParams()
      if (opts.limit !== undefined) q.set('limit', String(opts.limit))
      if (opts.offset !== undefined) q.set('offset', String(opts.offset))
      if (opts.keyword) q.set('keyword', opts.keyword)
      const qs = q.toString()
      return call<ServiceAccountPage>('GET', `/service/accounts${qs ? `?${qs}` : ''}`)
    },
  }

  /** 시크릿 평문 캐시. 이 SDK 인스턴스는 요청 하나에 대응하므로 한 요청 안에서만 산다. */
  const secretCache = new Map<string, string>()

  // 외부 서드파티 API 자격 증명(aiapp-service#763).
  //
  // **환경변수로 주지 않는다.** Lambda 환경변수는 저장 시 암호화되지만
  // `lambda:GetFunctionConfiguration` 권한이 있으면 평문으로 조회된다 — 최종 사용자에게는
  // 안 보여도 플랫폼 운영자에게는 보인다. 런타임에 가져오면 평문이 함수 메모리에만, 그 요청을
  // 처리하는 동안만 존재한다. 덤으로 실행 런타임(작업 중 MicroVM 프로세스, 미리보기·출시
  // Lambda)이 무엇이든 동작이 같아진다.
  //
  // 값은 되읽을 수 없는 자원이므로 `list` 는 두지 않는다 — 이름을 알아야 쓰는 것이고, 이름은
  // 코드에 이미 있다.
  const secrets = {
    /** 이름 하나의 평문. 같은 요청 안에서는 한 번만 왕복한다. */
    get: async (name: string): Promise<string> => {
      const cached = secretCache.get(name)
      if (cached !== undefined) return cached
      const { value } = await call<{ name: string; value: string }>(
        'GET',
        `/service/secrets/${encodeURIComponent(name)}`,
      )
      secretCache.set(name, value)
      return value
    },
  }

  // 소유자 범위 네이티브 데이터(aiapp-service, E2E 2026-09-17).
  //
  // 예약·공지는 **회원 표면(브라우저 SDK)에 없다.** `useReservation` 은 `myBookings`
  // 까지고, 공지·FAQ 는 조회만 열려 있다. 그래서 「소유자가 전체를 본다·관리한다」를
  // 프로젝트가 만들 방법이 없었다 — 실측에서 상담 관리 화면이 이 이유로 만들어지지 못했다.
  //
  // **인가는 여기서 하지 않는다.** `account` 와 같다 — 플랫폼은 프로젝트 경계까지 보고,
  // "이 요청자가 관리자인가" 는 serverFn 이 `access: 'owner'` 와 `ctx.isProjectOwner` 로
  // 먼저 판정한 뒤 이 표면을 부른다. 그 판정 없이 부르면 **전 회원이 전 예약을 본다.**
  const reservation = {
    /** 이 프로젝트 예약 한 페이지. 소유자 콘솔과 같은 질의를 쓴다. */
    list: (opts: ReservationListOptions = {}) => {
      const q = new URLSearchParams()
      if (opts.targetId) q.set('target_id', opts.targetId)
      if (opts.status) q.set('status', opts.status)
      if (opts.dateFrom) q.set('date_from', opts.dateFrom)
      if (opts.dateTo) q.set('date_to', opts.dateTo)
      if (opts.search) q.set('search', opts.search)
      if (opts.limit !== undefined) q.set('limit', String(opts.limit))
      if (opts.offset !== undefined) q.set('offset', String(opts.offset))
      const qs = q.toString()
      return call<ServiceReservationPage>('GET', `/service/reservation/bookings${qs ? `?${qs}` : ''}`)
    },

    /** 예약 1건. 다른 프로젝트 예약이면 404 — id 를 알아도 경계를 넘지 못한다. */
    get: (reservationId: string) =>
      call<ServiceReservation>('GET', `/service/reservation/bookings/${reservationId}`),

    /** 상태 변경(확정·취소 등). 허용 값은 플랫폼 예약 상태를 따른다. */
    changeStatus: (reservationId: string, status: string) =>
      call<ServiceReservation>(
        'PATCH',
        `/service/reservation/bookings/${reservationId}/status`,
        { status },
      ),
  }

  // 공지·FAQ 쓰기. **자유·후기 게시판은 여기 없다** — 그쪽은 회원이 자기 이름으로 쓰는
  // 글이라 서버가 대신 쓰면 작성자가 거짓이 되고 "작성자 본인만 수정" 이 무너진다.
  // 브라우저 SDK(`useBoard`)가 회원 자격으로 쓰는 것이 맞다.
  //
  // 작성자는 **프로젝트 소유자로 고정**된다. 주입 토큰에 `sub` 가 없어 호출한 회원을
  // 모르는데, 작성자 id 를 본문으로 받으면 서버가 신원을 caller 말에 의존하게 된다.
  const board = {
    /** 공지사항·FAQ 글 작성. `type` 은 'NOTICE' 또는 'FAQ'. */
    createPost: (type: 'NOTICE' | 'FAQ', post: Record<string, unknown>) =>
      call<Record<string, unknown>>('POST', `/service/boards/${type}/posts`, post),

    /** 공지사항·FAQ 글 수정. 다른 프로젝트 글이거나 자유·후기면 거부된다. */
    updatePost: (postId: string, post: Record<string, unknown>) =>
      call<Record<string, unknown>>('PUT', `/service/boards/posts/${postId}`, post),
  }

  return { dyncol, account, secrets, reservation, board, ctx }
}

export type Sdk = ReturnType<typeof buildSdk>
export { buildSdk }
