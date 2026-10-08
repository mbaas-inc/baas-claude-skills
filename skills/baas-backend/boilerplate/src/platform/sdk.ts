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

/** 트랜잭션 한 단계. `collection` 이 항목마다 있어 복수 컬렉션에 걸칠 수 있다.
 *
 * **`update`·`delete` 는 최상위 `id` 로만 대상을 정한다.** 서버의 트랜잭션 경로는 이 둘에서
 * `target` 을 해석하지 않고 `id` 만 읽는다(없으면 400 `update 는 id 가 필요합니다`). 필터 대상은
 * `increment` 만 된다.
 *
 * **트랜잭션 안 `update` 에는 전제조건(`if`)이 없다.** 서버가 적용하지 않으므로 타입에서 뺐다.
 * 전제조건이 필요한 상태 전이(취소·승인처럼 한 번만 일어나야 하는 것)는 단건
 * `dyncol.update(…, { if })` 로 먼저 확정하고, 그 승자만 뒤따르는 변경을 한다.
 */
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
      /** 대상 레코드 id. 필터 대상(`target`)은 트랜잭션 안 `update` 에서 쓸 수 없다. */
      id: string
      data: Record<string, unknown>
      label?: string
    }
  | {
      op: 'delete'
      collection: string
      /** 대상 레코드 id. 필터 대상(`target`)은 트랜잭션 안 `delete` 에서 쓸 수 없다. */
      id: string
      label?: string
    }
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

/** 관리자 알림 결과. **실패도 값으로 온다** — `disabled`·`limited` 는 오류가 아니다.
 *
 * | 값 | 뜻 |
 * |---|---|
 * | `sent` | 소유자에게 보냈다 |
 * | `failed` | 보내지 못했다(채널 실패·네트워크·미선언 키). 기능 동작은 이미 끝났으므로 그대로 둔다 |
 * | `skipped` | 보낼 채널이나 수신처가 없다 |
 * | `disabled` | 소유자가 이 알림을 꺼 두었다 — 새 선언의 기본값이다 |
 * | `limited` | 발송 한도에 걸렸다 |
 */
export type OwnerNotifyStatus = 'sent' | 'failed' | 'skipped' | 'disabled' | 'limited'

/** 알림 값 하나. 서버는 스칼라만 받고 URL 을 지우며 200자로 자른다 — 사람이 읽을 문자열로 보낸다. */
export type OwnerNotifyValue = string | number | boolean | null

export interface OwnerNotifyResult {
  result: OwnerNotifyStatus
  /** 발송 이력 id. 요청이 서버에 닿지 못했으면 없다. */
  log_id?: number
  /** `failed` 일 때 원인. 서버 응답(미선언 키 404 등)이나 전송 오류의 메시지다. */
  error?: { status?: number; message: string }
}

/** 커스텀 결제 상태 — 결제 상태의 정본은 이 값이다. 자기 컬렉션에 복사해 둔 값을 믿지 않는다. */
export type PaymentStatus = 'CREATED' | 'PAID' | 'CANCELLED'

/** 커스텀 결제 1건 (aiapp-service#900). `order_no` 를 자기 원장(예약 레코드 등)에 보관한다. */
export interface ServicePayment {
  /** 주문번호(토스 orderId). 승인 · 취소 · 조회에 쓴다. */
  order_no: string
  account_id: string
  /** 서버가 세션에 박은 금액(원). 승인 때 토스 금액과 이 값이 다르면 거절된다. */
  amount: number
  item_name: string | null
  status: PaymentStatus
  /** 자리 판단용 결제 상태 — `PAID` · `UNPAID`(결제창만 열고 떠남 · 결제 실패) · `CANCELLED` (aiapp-service#932) */
  payment_status?: 'PAID' | 'UNPAID' | 'CANCELLED'
  /** 이 결제가 끝났나(`PAID`). 정원 판정은 이 값이 아니라 확정 트랜잭션의 `guard` 로 한다 */
  occupying?: boolean
  /** `test` 면 테스트 결제(실제 청구 없음), `live` 면 실결제. 판매자 승인 상태로 서버가 정한다. */
  payment_mode: 'test' | 'live'
  /** 결제위젯 클라이언트 키 — 브라우저에 그대로 넘긴다(공개 키). */
  client_key: string
  pay_method: string | null
  receipt_url: string | null
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
}

/**
 * 비공개 파일 업로드 대상 (aiapp-service#919). 공개 주소가 없다 — 브라우저는 `uploadTo(대상, file)` 로 올리고,
 * 앱은 `file_id` 만 원장에 저장한다. 볼 때마다 `storage.private.view` 로 단기 주소를 받는다.
 */
export interface PrivateUploadTarget {
  /** 저장소 직접 PUT 주소 (5분·1회용). 형식과 크기가 서명에 묶여 있다 */
  upload_url: string
  /** 발급 때 서명한 Content-Type — 브라우저 PUT 에 그대로 쓰인다 */
  content_type: string
  /** 파일 식별자 — 원장에 저장하고 열람 · 삭제 때 넘긴다 */
  file_id: string
}

/** 비공개 파일 형식 — 사진(카메라 원본 HEIC 포함)과 PDF. 최대 10MB */
export type PrivateContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'application/pdf'

/** 업로드 분류 — 커스텀 백엔드가 쓰는 것만. images 는 이미지 확장자·최대 10MB. */
export type StorageCategory = 'images' | 'store' | 'reservation'

/**
 * 업로드 대상 (aiapp-service#904). **브라우저에 그대로 넘긴다** — 브라우저는 `useFileUpload().uploadTo(대상, file)`
 * 로 `upload_url` 에 직접 올리고, 올린 뒤 `cdn_url` 을 원장에 저장한다.
 */
export interface StorageUploadTarget {
  /** 저장소 직접 PUT 주소 (단기·1회용). 저장하지 않는다 */
  upload_url: string
  /** 발급 때 서명한 Content-Type — 브라우저 PUT 에 그대로 쓰인다 */
  content_type: string
  /** 인라인 표시용 영구 주소 — 원장 · 컬렉션 필드에 저장한다 */
  cdn_url: string
  /** 첨부 다운로드용 주소 */
  download_url: string
  /** 저장 경로 (프로젝트 접두사 제외) */
  key: string
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
     *
     * `update`·`delete` 는 최상위 `id` 로만 대상을 정하고, 트랜잭션 안 `update` 에는 `if` 가
     * 없다(`TxnOperation` 참고). 한 번만 일어나야 하는 상태 전이는 단건 `update(…, { if })` 다.
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

  // 관리자 알림(aiapp-service#884). 기능 동작이 **성공한 뒤** 프로젝트 소유자에게 알린다.
  //
  // **수신자를 받지 않는다.** 서버가 프로젝트 소유자로 고정한다 — 받는 사람을 caller 가 정하면
  // 이 경로가 방문자·회원에게 아무 내용이나 보내는 발송 API 가 된다.
  //
  // **던지지 않는다.** 알림은 부수 효과다. 예약은 이미 저장됐는데 알림 실패로 예외가 올라가면
  // 손님은 실패 화면을 보고 다시 시도해 예약이 두 건이 된다. 그래서 어떤 실패도 결과 값으로
  // 돌려주고 로그만 남긴다. 미선언 키(404)도 마찬가지다 — 로그의 메시지가 schema.json 선언과
  // 수렴을 가리킨다.
  const notify = {
    /** 소유자에게 알린다. `key` 는 `backend/schema.json` 의 `notifications` 에 선언된 것이어야 한다. */
    owner: async (
      key: string,
      values: Record<string, OwnerNotifyValue> = {},
    ): Promise<OwnerNotifyResult> => {
      try {
        const data = await call<{ result: OwnerNotifyStatus; log_id?: number }>(
          'POST', '/service/notifications/owner', { key, values },
        )
        return { result: data.result, log_id: data.log_id }
      } catch (e) {
        const status = e instanceof SdkError ? e.status : undefined
        const message = e instanceof Error ? e.message : String(e)
        // 토큰은 call 밖으로 나오지 않는다 — 여기 남는 것은 키·상태·서버 메시지뿐이다.
        console.error(
          `[notify.owner] ${key} 알림 실패${status ? ` (${status})` : ''}: ${message}`,
          { requestId: ctx.requestId },
        )
        return { result: 'failed', error: { status, message } }
      }
    },
  }

  // 커스텀 결제(aiapp-service#900). **금액은 serverFn 이 정한다** — 자기 원장에서 계산한 값을
  // 넘기고, 브라우저가 보낸 금액은 절대 쓰지 않는다. 세션 금액이 서버에 박히므로 위젯에서 금액을
  // 바꿔도 승인 때 거절된다.
  //
  // **승인도 serverFn 이 한다.** 토스 successUrl 로 돌아온 paymentKey 를 받아 `confirm` 하고, 같은
  // 요청 안에서 자기 원장(예약 확정 등)을 갱신한다. 확정할 수 없으면(정원 초과) `cancel` 로 환불한다 —
  // 보상 트랜잭션. 결제 상태를 컬렉션 필드에 두고 브라우저가 쓰게 하면 위변조된다 — 상태는 `get` 이 정본이다.
  //
  // 결제자는 **이 요청의 로그인 회원**으로 고정한다. 결제자를 인자로 받으면 다른 회원 이름으로
  // 결제가 만들어진다. 비로그인이면 만들 수 없다.
  //
  // 알림과 달리 **던진다.** 결제 실패를 값으로 삼키면 예약이 결제 없이 확정된다.
  const payments = {
    /** 결제 세션 만들기. 응답의 order_no · amount · client_key 를 브라우저에 넘겨 위젯을 띄운다. */
    create: async (opts: { amount: number; itemName: string }) => {
      if (!ctx.accountId) {
        throw new SdkError('로그인한 회원만 결제할 수 있습니다.', 401, 'LOGIN_REQUIRED')
      }
      return call<ServicePayment>('POST', '/service/payments/sessions', {
        account_id: ctx.accountId,
        amount: opts.amount,
        item_name: opts.itemName,
      })
    },

    /** 결제 1건 — 상태의 정본. 다른 프로젝트 결제이거나 없으면 404. */
    get: (orderNo: string) =>
      call<ServicePayment>('GET', `/service/payments/sessions/${encodeURIComponent(orderNo)}`),

    /**
     * 결제 여러 건 — 원장 여러 줄의 결제 상태를 한 번에 붙인다(aiapp-service#932). 건마다 `get` 하면
     * 줄 수만큼 왕복한다. 서버 한도(100건)를 넘으면 나눠 부른다. 없는 번호 · 다른 프로젝트 결제는 빠진다.
     */
    list: async (orderNos: string[]) => {
      const unique = [...new Set(orderNos)]
      const out: ServicePayment[] = []
      for (let i = 0; i < unique.length; i += 100) {
        const q = new URLSearchParams()
        for (const no of unique.slice(i, i + 100)) q.append('order_no', no)
        out.push(...(await call<ServicePayment[]>('GET', `/service/payments/sessions?${q}`)))
      }
      return out
    },

    /**
     * 승인. `paymentKey` · `amount` 는 토스 successUrl 쿼리 값이다. 금액이 세션과 다르면 400.
     * 돌아오면 `PAID` 다 — 가상계좌(입금 대기)는 받지 않아 서버가 토스에서 취소하고 400 을 던진다.
     */
    confirm: (orderNo: string, payment: { paymentKey: string; amount: number }) =>
      call<ServicePayment>('POST', `/service/payments/sessions/${encodeURIComponent(orderNo)}/confirm`, {
        payment_key: payment.paymentKey,
        amount: payment.amount,
      }),

    /** 취소. 결제 완료면 전액 환불, 결제 전이면 세션만 닫는다. 이미 취소됐으면 그대로 돌려준다. */
    cancel: (orderNo: string, reason: string) =>
      call<ServicePayment>('POST', `/service/payments/sessions/${encodeURIComponent(orderNo)}/cancel`, {
        reason,
      }),
  }

  // 파일 업로드(aiapp-service#904). **누가 올려도 되는지는 이 serverFn 이 판정한다** — `access: 'owner'` 면
  // 소유자 전용(관리자 화면의 사장님 업로드), 역할 규칙은 코드로. 플랫폼은 프로젝트 경계 · 파일 형식/크기만 본다.
  //
  // 브라우저 직접 업로드(`useFileUpload().upload`)는 앱 회원 로그인이 필요하다. 관리자 진입으로 소유자
  // 인증된 사장님은 회원이 아니므로 그 경로로는 401 이다 — 이 표면으로 대상을 받아 넘긴다.
  //
  // 실패는 던진다 — 형식 · 크기 거절(400)을 그대로 화면에 보여 준다.
  const storage = {
    /** 업로드 대상 발급. `contentType` · `size` 는 브라우저가 고른 File 의 `type` · `size` 를 넘긴다. */
    presign: async (file: {
      filename: string
      contentType: string
      size: number
      category?: StorageCategory
    }): Promise<StorageUploadTarget> => {
      const data = await call<{ original: { presign_url: string; cdn_url: string; download_url: string; key: string } }>(
        'POST', '/service/storage/presign', {
          category: file.category ?? 'images',
          filename: file.filename,
          content_type: file.contentType,
          size: file.size,
        },
      )
      return {
        upload_url: data.original.presign_url,
        content_type: file.contentType,
        cdn_url: data.original.cdn_url,
        download_url: data.original.download_url,
        key: data.original.key,
      }
    },

    /**
     * 비공개 파일(aiapp-service#919) — 처방전 사진처럼 **정해진 사람만 보는 파일**. 공개 주소가 없고, 볼 때마다
     * 단기 주소(5분)를 받는다. 누가 올리고 볼 수 있는지는 이 serverFn 이 판정한다(플랫폼은 프로젝트 경계 ·
     * 형식 · 크기만 본다). 여러 프로젝트 파일이 섞이지 않게 `file_id` 는 서버가 정한다.
     */
    private: {
      /** 업로드 대상 발급. `size` 는 정확한 바이트 수 — 다른 크기로 올리면 저장소가 거절한다 */
      presign: async (file: { contentType: PrivateContentType; size: number }): Promise<PrivateUploadTarget> => {
        const data = await call<{ file_id: string; upload_url: string }>('POST', '/service/storage/private/presign', {
          content_type: file.contentType,
          size: file.size,
        })
        return { upload_url: data.upload_url, content_type: file.contentType, file_id: data.file_id }
      },

      /** 열람 주소(5분) 발급 — 한 번에 20개까지. 화면이 바로 `<img src>` 로 쓴다. 저장하지 않는다 */
      view: async (fileIds: string[]): Promise<{ file_id: string; url: string }[]> => {
        if (!fileIds.length) return []
        const data = await call<{ items: { file_id: string; url: string }[] }>('POST', '/service/storage/private/view', {
          file_ids: fileIds,
        })
        return data.items
      },

      /** 삭제 — 없는 파일도 성공(멱등). 지운 요청 수를 돌려준다 */
      remove: async (fileIds: string[]): Promise<number> => {
        if (!fileIds.length) return 0
        const data = await call<{ deleted: number }>('POST', '/service/storage/private/delete', { file_ids: fileIds })
        return data.deleted
      },
    },
  }

  return { dyncol, account, secrets, reservation, board, notify, payments, storage, ctx }
}

export type Sdk = ReturnType<typeof buildSdk>
export { buildSdk }
