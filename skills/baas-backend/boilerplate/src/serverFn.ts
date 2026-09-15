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
