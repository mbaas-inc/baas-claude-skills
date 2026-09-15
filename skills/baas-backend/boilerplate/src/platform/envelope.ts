/**
 * 디스패처 ↔ 사용자 백엔드의 **호출 계약**.
 *
 * 이 파일이 경계선이다. 이 타입만 유지되면 플랫폼은 그 아래(실행 위치·토큰 발급 방식·
 * 라우팅)를 사용자 코드를 건드리지 않고 바꿀 수 있다. 로컬에서는 HTTP 프로세스로,
 * 운영에서는 Lambda 로 같은 핸들러가 돈다.
 */

/**
 * envelope 계약 버전. 디스패처와 백엔드가 **같은 값**을 알아야 한다.
 *
 * 버전이 없던 동안 계약이 조용히 갈라졌다(2026-08-30 실측): PoC 디스패처는
 * `context.project_id`(snake) 를 보냈는데 보일러플레이트는 `projectId`(camel) 를 읽어,
 * 프로젝트 식별자가 `undefined` 인 채로 요청이 진행됐다. 타입은 컴파일 시점 것이라
 * **런타임에 오는 JSON 은 아무도 검사하지 않았다.**
 *
 * 그래서 이 계약의 "아래를 자유롭게 교체한다"는 약속에는 **불일치를 즉시 드러내는
 * 장치**가 함께 있어야 한다. 필드를 바꾸면 이 숫자를 올리고, 양쪽을 같이 배포한다.
 *
 * 아직 이 계약에 의존하는 사용자 프로젝트가 0개라 하드 실패로 둔다 — 출시 후에는
 * 구버전 허용 창(예: n, n-1)이 필요해질 수 있다.
 *
 * v2 (2026-09-02): `memberId` → `accountId`. 서버 모델이 `Account`/`account_id` 인데
 * envelope만 `memberId` 라 같은 값이 경계마다 이름을 바꿨다 — 이름이 다르면 언젠가 매핑이
 * 빠진다(v1 이 그렇게 갈렸다). dyncol 소유권 스탬프도 `account_id` 다.
 */
export const ENVELOPE_CONTRACT_VERSION = 2

export interface RequestContext {
  /** 이 요청이 속한 프로젝트. 토큰에 서명으로 박혀 있어 사용자 코드가 바꿀 수 없다. */
  projectId: string
  /**
   * 주입 토큰. **요청 한 건짜리**다 — 디스패처가 호출마다 새로 발급하고 수십 초 뒤 만료된다.
   * SDK 가 자동 장착하므로 직접 다룰 일이 없고, 어디에도 저장하면 안 된다.
   * 저장하는 순간 상시 시크릿이 되어 이 설계의 전제가 깨진다.
   */
  token: string
  /** 로그 상관용. 디스패처·플랫폼 로그와 이 값으로 이어 붙는다. */
  requestId: string
  /**
   * 원 요청의 로그인 회원. 비로그인이면 null.
   * 값이 있으면 SDK 호출이 그 회원 권한으로 나가고 dyncol 레코드 소유자도 이 회원이 된다.
   */
  accountId: string | null
  /**
   * 원 요청의 로그인 계정이 **이 프로젝트의 소유자**인가.
   *
   * 소유자는 프로젝트 회원이 아니다(통합회원이라 계정의 `project_id` 가 NULL). 그래서
   * `accountId` 는 **null 인데 이 값만 true** 인 조합이 정상이고, 반대로 회원으로 로그인한
   * 사람은 `accountId` 가 있고 이 값이 false 다.
   *
   * 관리자 판정의 **1순위**로 쓴다. 플랫폼은 "소유자인가" 까지만 알려주고, "이 소유자에게
   * 무엇을 허용할지" 와 "누구를 운영자로 위임할지" 는 이 백엔드가 정한다 — 관리자의 정의가
   * 프로젝트마다 다르기 때문이다.
   *
   * ```ts
   * async function requireOperator(sdk: Sdk, ctx: Ctx) {
   *   if (ctx.isProjectOwner) return 'owner'          // 소유자는 항상 통과
   *   const id = ctx.accountId
   *   if (id && await isDelegated(sdk, id)) return 'delegate'
   *   throw new SdkError('운영자 권한이 필요합니다', 403)
   * }
   * ```
   *
   * **데이터 접근을 넓히지 않는다.** dyncol 인가는 주입 토큰의 `scope=service` grants 만
   * 보고, 이 값은 토큰에 실리지 않는다. 즉 소유자라고 해서 선언하지 않은 컬렉션을 읽을 수
   * 있게 되지는 않는다.
   *
   * 스케줄(크론) 실행에서는 **항상 false** 다 — 요청한 사람이 없으므로(`accountId` 도 null)
   * 소유자일 수 없다. 크론이 관리자 전용 처리를 해야 하면 이 값이 아니라 그 처리를 크론
   * 핸들러에 직접 둔다.
   */
  isProjectOwner: boolean
}

export interface InvokeEnvelope {
  /** 디스패처가 찍는 계약 버전. `ENVELOPE_CONTRACT_VERSION` 과 달라지면 거부한다. */
  contractVersion: number
  /** `/api` 접두사가 제거된 경로. 예: `/reservations` */
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query: Record<string, string>
  /** 원문 문자열. 파싱은 라우터가 한다 — 빈 본문과 `null` 을 구분해야 하므로. */
  body: string | null
  headers: Record<string, string>
  context: RequestContext
}

export interface InvokeResult {
  status: number
  body: unknown
  headers?: Record<string, string>
}

/**
 * 스케줄 실행 envelope. HTTP 요청이 아니라 크론이 깨운 경우다.
 *
 * `context.accountId` 가 **항상 null** 인 것이 요점 — 크론에는 "요청한 회원"이 없다.
 * 그래서 크론 핸들러에서 소유자 스코프 조회를 기대하면 안 되고, 전체 조회 권한이
 * 필요한 작업은 컬렉션 접근 정책을 그에 맞게 설계해야 한다.
 */
export interface ScheduleEnvelope {
  /** 디스패처가 찍는 계약 버전. `ENVELOPE_CONTRACT_VERSION` 과 달라지면 거부한다. */
  contractVersion: number
  /** 등록 시 지정한 이름. 한 백엔드의 여러 스케줄을 구분한다. */
  scheduleName: string
  /** 스케줄러가 의도한 실행 시각(ISO). 지연 실행돼도 이 값은 계획 시각이다. */
  scheduledFor: string
  context: RequestContext
}
