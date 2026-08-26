/**
 * 디스패처 ↔ 사용자 백엔드의 **호출 계약**.
 *
 * 이 파일이 경계선이다. 이 타입만 유지되면 플랫폼은 그 아래(실행 위치·토큰 발급 방식·
 * 라우팅)를 사용자 코드를 건드리지 않고 바꿀 수 있다. 로컬에서는 HTTP 프로세스로,
 * 운영에서는 Lambda 로 같은 핸들러가 돈다.
 */

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
  memberId: string | null
}

export interface InvokeEnvelope {
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
 * 스케줄 실행 봉투. HTTP 요청이 아니라 크론이 깨운 경우다.
 *
 * `context.memberId` 가 **항상 null** 인 것이 요점 — 크론에는 "요청한 회원"이 없다.
 * 그래서 크론 핸들러에서 소유자 스코프 조회를 기대하면 안 되고, 전체 조회 권한이
 * 필요한 작업은 컬렉션 접근 정책을 그에 맞게 설계해야 한다.
 */
export interface ScheduleEnvelope {
  /** 등록 시 지정한 이름. 한 백엔드의 여러 스케줄을 구분한다. */
  scheduleName: string
  /** 스케줄러가 의도한 실행 시각(ISO). 지연 실행돼도 이 값은 계획 시각이다. */
  scheduledFor: string
  context: RequestContext
}
