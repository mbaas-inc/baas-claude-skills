/**
 * 플랫폼 SDK — 주입 토큰을 자동 장착하고 dyncol·BaaS 를 감싼다.
 *
 * **에이전트가 인증 코드를 쓰지 않게 하는 것**이 이 파일의 존재 이유다. 토큰은
 * 봉투에서만 오고 이 모듈 밖으로 나가지 않는다. fetch 배관을 직접 만들면 토큰이
 * 로그·에러 응답으로 새기 시작하므로, 데이터 접근은 전부 여기를 지나야 한다.
 */

import type { RequestContext } from './envelope'

/** 플랫폼이 주입한다. 로컬에서는 .env 로 로컬 aiapp-service 를 가리킨다. */
const BAAS_BASE_URL = process.env.BAAS_BASE_URL ?? 'http://127.0.0.1:8010'

export class SdkError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super(message)
    this.name = 'SdkError'
  }
}

export interface DyncolRecord<T = Record<string, unknown>> {
  id: string
  data: T
}

/** 필터 연산자. dyncol 이 지원하는 것만 노출한다. */
export type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'has'

/**
 * dyncol 목록 조회 옵션. 서버 상한은 100건이라 그 이상은 커서로 나눠 받는다.
 *
 * `filter` 는 `{ 필드: { 연산자: 값 } }` 형태다 — 값만 주면 `eq` 로 본다.
 *   `{ status: 'open' }`              → status = 'open'
 *   `{ deadline: { lt: nowIso } }`    → deadline < nowIso
 */
export interface ListOptions {
  filter?: Record<string, unknown | Partial<Record<FilterOp, unknown>>>
  limit?: number
  cursor?: string
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
      if (opts.cursor) q.set('cursor', opts.cursor)
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
      return call<{ items: DyncolRecord<T>[]; next_cursor?: string }>(
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
  }

  const baas = {
    /** 현재 요청의 회원 정보. 비로그인 요청이면 null. */
    currentAccount: () =>
      ctx.accountId ? call<Record<string, unknown>>('GET', '/account/info') : Promise.resolve(null),

    /** SMS 발송. 크레딧이 차감되므로 크론에서 대량 발송 시 건수를 스스로 제한할 것. */
    sendSms: (to: string, message: string) =>
      call<{ id: string }>('POST', '/back/member/message/sms', { to, message }),
  }

  return { dyncol, baas, ctx }
}

export type Sdk = ReturnType<typeof buildSdk>
export { buildSdk }
