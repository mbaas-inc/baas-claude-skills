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

  constructor(message: string, status: number, errorCode?: string) {
    super(message)
    this.name = 'SdkError'
    this.status = status
    this.errorCode = errorCode
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

/** 트랜잭션 한 단계. `collection` 이 항목마다 있어 복수 컬렉션에 걸칠 수 있다. */
export interface TxnOperation {
  op: 'create' | 'update' | 'delete'
  collection: string
  /** `create` 에서 id 를 미리 정할 수 있다 — 같은 요청에서 자식의 reference 값으로 쓰려면 필요하다. */
  id?: string
  data?: Record<string, unknown>
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
     * number 필드 원자 증감. **갱신된 레코드를 돌려준다** — 이 반환값이 상한 강제의 핵심이다.
     *
     * ⚠️ **경계 가드가 없다** — 정원을 넘고 0 을 지나 음수로 내려간다. 그래서 상한은
     * 이 백엔드가 강제한다. 방법은 **반환된 새 값을 자기 순번으로 읽는 것**이다:
     *
     * ```ts
     * const after = await sdk.dyncol.increment<Slot>('slots', id, 'booked', 1)
     * if (after.data.booked > after.data.capacity) {
     *   await sdk.dyncol.increment('slots', id, 'booked', -1)   // 보상
     *   return 정원마감
     * }
     * ```
     *
     * **조회해서 확인한 뒤 증가시키면 안 된다.** 확인과 증가 사이에 다른 요청이 끼어든다.
     * unique 제약으로 선점을 먼저 해도 막히지 않는다 — unique 는 *같은 회원*의 중복만
     * 막으므로 서로 다른 회원들은 여전히 같은 값을 읽는다. 실측(정원 100 · 회원 120명 동시):
     * 조회→확인→증가 = 120 ❌ / 선점→확인→증가 = 120 ❌ / 선점→원자증가→보상 = 100 ✅
     */
    increment: <T = Record<string, unknown>>(
      collection: string, recordId: string, field: string, by: number,
    ) =>
      call<DyncolRecord<T>>('POST', `/collections/${collection}/records/${recordId}/increment`,
        { field, by }),

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
     * **복수 컬렉션 한 트랜잭션** — 하나라도 실패하면 전부 되돌린다. 최대 25 작업.
     *
     * "따로 남으면 안 되는 쌍"이 이걸 쓴다 — 주문+재고, 본문+이력, 신청+집계.
     * 이게 있으면 잠금 전용 unique 컬럼이나 보상 삭제를 손으로 짜지 않아도 된다.
     *
     * ```ts
     * await sdk.dyncol.transaction([
     *   { op: 'create', collection: 'orders', id: orderId, data: {...} },
     *   { op: 'update', collection: 'stock',  id: itemId,  data: { qty: next } },
     * ])
     * ```
     *
     * 상한 강제에는 이것만으로 부족하다 — 트랜잭션은 원자성을 주지만 "지금 몇 개인지"를
     * 안전하게 읽어주지는 않는다. 카운터가 있는 상한은 `increment` 반환값으로 판정한다.
     */
    transaction: (operations: TxnOperation[]) =>
      call<{ results: { index: number; op: string; collection: string; id?: string }[]; count: number }>(
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

  // `baas` 네임스페이스는 두지 않는다. 주입 토큰은 `scope=service` 로 **`sub` 가 없고**,
  // 회원 API(`/account/info`)와 백오피스 API(`/back/...`)는 `get_current_account` 로
  // `sub` 를 요구한다 — 부르면 401 `토큰 정보가 잘못되었습니다` 가 돌아온다(실측).
  //
  // 회원의 이름·연락처처럼 네이티브가 들고 있는 값을 서버에서 써야 하면, **가입 시점에
  // 프로젝트 자기 컬렉션에 적어 두고** `ctx.accountId` 로 걸러 읽는다. 등급 같은 확장 값을
  // 담는 방식과 같다. 서버가 회원 표를 직접 들여다보는 경로는 없다.

  return { dyncol, ctx }
}

export type Sdk = ReturnType<typeof buildSdk>
export { buildSdk }
