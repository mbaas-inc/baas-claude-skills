/**
 * 저작 마커. 프론트에서 import 해서 서버 로직을 감싼다.
 *
 * 런타임 구현은 없다 — 빌드(`node backend/extract.mjs`)가 이 호출을 찾아
 * envelope 라우트와 fetch 스텁을 만든다. 여기서는 **타입만** 지킨다.
 */

/**
 * serverFn 이 받는 컨텍스트. **필드 목록의 유일한 정의다.**
 *
 * 런타임(`platform/serverfn-adapter.ts`)은 이 타입을 import 해서 `sdk` 만 좁힌다. 예전에는
 * 같은 이름을 양쪽에 손으로 복제했는데, envelope 에 `isProjectOwner` 가 늘었을 때 어댑터만
 * 고쳐지고 이 파일이 빠져 **런타임에는 값이 오는데 저작 시점에는 타입 에러**가 났다
 * (2026-09-15 실측: `Property 'isProjectOwner' does not exist on type 'ServerCtx'`).
 * 그 상태에서 에이전트가 통과할 유일한 길은 「고치지 마라」고 적힌 이 파일을 고치는 것뿐이라,
 * 골격 갱신이 그 프로젝트를 깨는 원인이 됐다.
 *
 * 그래서 필드를 늘릴 때는 **여기 한 곳만** 고친다. 어댑터가 전달을 빠뜨리면 그쪽에서
 * 타입 에러가 난다.
 *
 * `sdk` 를 제네릭으로 둔 이유: 이 파일은 앱 트리(`src/services/serverFn.ts`)로도 복사되는데,
 * 거기서 `Sdk` 타입을 끌어오면 앱 타입체크가 백엔드 의존(hono 등)까지 해석해야 한다.
 * 기본값 `unknown` 이면 앱 트리는 이 파일만 보면 되고, 런타임 쪽은 `ServerCtx<Sdk>` 로 좁힌다.
 */
export type ServerCtx<S = unknown> = {
  accountId: string | null
  /** 이 요청자가 프로젝트 소유자인가. 관리자 판정의 1순위 — `platform/envelope.ts` 주석 참조. */
  isProjectOwner: boolean
  sdk: S
}
/**
 * 이 함수를 **누가 부를 수 있는가**. 선언은 필수다 — 빠뜨리면 타입 검사에서 걸린다.
 *
 * 침묵을 허용하지 않는 이유: 「공개로 열어 둔 것」과 「검사를 잊은 것」은 코드에서 똑같이
 * 생겼다. 그래서 도구가 추론할 수 없고, 사람이 읽어도 의도를 알 수 없다. 반찬가게는 같은
 * 판정을 9개 함수에 8번 손으로 썼는데(로그인 3 · 소유자 5), 그중 하나를 빠뜨려도 아무도
 * 몰랐을 것이다.
 *
 * | 값 | 플랫폼이 하는 일 |
 * |---|---|
 * | `public` | 아무것도 막지 않는다. 비로그인 포함 누구나 |
 * | `member` | 로그인하지 않았으면 401. **인증**이지 인가가 아니다 |
 * | `owner`  | 프로젝트 소유자가 아니면 403 |
 * | `custom` | **네 코드가 판정한다.** 역할·계층·자원 범위는 전부 네 것이다 |
 *
 * 플랫폼은 **자기가 이미 아는 사실**(로그인 여부·소유자 여부)까지만 강제한다. 매니저·직원
 * 같은 역할은 플랫폼이 모르므로 `custom` 안에서 네가 정한다 — 그래야 어떤 권한 체계든
 * 표현할 수 있다.
 */
export type ServerFnAccess = 'public' | 'member' | 'owner' | 'custom'

export interface ServerFnOptions {
  access: ServerFnAccess
}

export function serverFn<I, O>(
  handler: (input: I, ctx: ServerCtx) => Promise<O>,
  options: ServerFnOptions,
) {
  // 런타임에 쓰이지 않는다 — 추출기가 정적으로 읽어 라우트에 싣는다.
  void options
  return handler
}

/**
 * 앱 트리에서 **실패에 상태코드를 실어 보내는 유일한 수단**.
 *
 * `src/services/*.ts` 는 백엔드 트리(`platform/sdk.ts`)를 임포트할 수 없다 — `ctx.sdk` 가
 * `unknown` 인 것과 같은 이유다. 그래서 `SdkError` 를 쓸 수 없는데, 가이드는 오랫동안
 * 그것을 쓰라고 적어 두었다(2026-09-16 발견). 이 클래스가 그 구멍을 메운다.
 *
 * 플랫폼은 `status` 를 가진 오류를 **구조적으로** 알아보고 그 코드를 보존한다.
 */
export class ServerFnError extends Error {
  // 파라미터 프로퍼티를 쓰지 않는다 — `node --experimental-strip-types` 가 타입만 지우고
  // 변환은 못 해서 로컬 기동이 죽는다(`platform/sdk.ts` 의 SdkError 와 같은 제약).
  readonly status: number
  readonly detail?: Record<string, unknown>

  constructor(message: string, status = 400, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'ServerFnError'
    this.status = status
    this.detail = detail
  }
}

/**
 * 플랫폼이 던진 오류의 상태코드를 읽는다. **409 는 오류가 아니라 결과다** — 경합·중복을
 * 정상 분기로 다루려면 이 값을 봐야 하는데, 앱 트리는 `SdkError` 로 `instanceof` 를 할 수
 * 없으므로 구조로 판정한다.
 */
export function errorStatus(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status
  return typeof s === 'number' ? s : undefined
}

/** 실패에 실려 온 구조화 정보(트랜잭션은 `{ failed }` 를 넣는다). 문구 파싱 대신 이것을 본다. */
export function errorDetail(e: unknown): Record<string, unknown> | undefined {
  const d = (e as { detail?: unknown } | null)?.detail
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : undefined
}
