/**
 * serverFn ↔ envelope 사이의 얇은 층. **플랫폼 소유** — 생성 코드가 이걸 부른다.
 *
 * 저작 모델만 바꾸고 런타임은 그대로 두는 것이 이 설계의 전제다. 그래서 여기서 하는 일은
 * envelope를 `(input, ctx)` 로 풀고 결과를 다시 envelope로 싸는 것뿐이고, 라우팅·토큰 장착·에러
 * 직렬화는 기존 `platform/app.ts` 가 그대로 처리한다. 폴백이 싼 이유이기도 하다 —
 * 추출기를 걷어내면 손으로 쓴 라우트로 돌아갈 뿐 런타임은 건드릴 게 없다.
 */
import type { Context } from 'hono'
import type { ServerCtx as BaseServerCtx, ServerFnAccess } from '../serverFn'
import type { RequestContext } from './envelope'
import { SdkError, type Sdk } from './sdk'

/** 저작 쪽 `serverFn` 이 넘겨받는 컨텍스트 — **필드 목록은 `../serverFn` 이 정본이다.**
 *
 * 여기서는 `sdk` 만 좁힌다(저작 시점에는 `unknown`, 런타임에는 `Sdk`). 필드를 손으로 다시
 * 적지 않는 이유: 예전에 그렇게 두 곳에 복제했다가 `isProjectOwner` 추가 때 한쪽만 고쳐져
 * 저작 시점 타입 에러가 났다. 이제 필드는 한 곳에서만 는다.
 *
 * envelope의 `RequestContext` 를 그대로 주지 않고 필요한 것만 추리는 원칙은 그대로다 —
 * `token` 은 SDK 가 이미 장착했고 사용자 코드가 만지면 안 된다. **여기(정본 타입)에 없는
 * 필드는 serverFn 에서 보이지 않는다**: envelope 에 값을 추가하고 노출하려면 `../serverFn`
 * 의 `ServerCtx` 에 넣고, 아래 전달도 함께 채운다(빠뜨리면 이 파일에서 타입 에러가 난다).
 */
export type ServerCtx = BaseServerCtx<Sdk>

type Handler<I, O> = (input: I, ctx: ServerCtx) => Promise<O>

/**
 * 본문을 입력으로 넘기고 결과를 JSON 으로 돌려준다.
 *
 * 본문이 비었으면 `{}` 로 본다 — 입력 없는 serverFn 을 `POST` 로 부를 때 파싱 실패로
 * 500 이 나면 원인이 도메인 로직처럼 보인다.
 */
/**
 * 선언한 접근 수준을 **실제로 막는다**. lint 가 아니라 게이트다.
 *
 * 플랫폼은 자기가 아는 사실까지만 집행한다 — 로그인 여부와 소유자 여부. 역할·계층은 모르므로
 * `custom` 으로 넘기고 사용자 코드가 판정한다.
 *
 * 검사가 **핸들러 앞**에 있는 것이 요점이다. 본문 안에서 하면 그 앞에 쓴 코드가 이미 돌아
 * 중간 효과가 남는다.
 */
function enforceAccess(access: ServerFnAccess, ctx: RequestContext): void {
  if (access === 'member' && ctx.accountId === null) {
    throw new SdkError('로그인이 필요합니다.', 401)
  }
  if (access === 'owner' && ctx.isProjectOwner !== true) {
    // 위임 운영자는 여기서 통과하지 않는다 — 그건 프로젝트가 정하는 것이라 `custom` 이다.
    throw new SdkError('프로젝트 소유자만 접근할 수 있습니다.', 403)
  }
}

export async function runServerFn<I, O>(handler: Handler<I, O>, c: Context, access: ServerFnAccess) {
  const ctx = c.var.ctx as RequestContext
  enforceAccess(access, ctx)
  const raw = await c.req.text()
  const input = (raw ? JSON.parse(raw) : {}) as I
  const result = await handler(input, {
    accountId: ctx.accountId,
    // 옛 디스패처(필드 추가 이전)와 섞여도 **권한이 열리지 않도록** false 로 떨어뜨린다.
    isProjectOwner: ctx.isProjectOwner === true,
    sdk: c.var.sdk as Sdk,
  })
  return c.json(result as object, 200)
}
