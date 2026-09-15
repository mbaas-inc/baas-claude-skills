/**
 * serverFn ↔ envelope 사이의 얇은 층. **플랫폼 소유** — 생성 코드가 이걸 부른다.
 *
 * 저작 모델만 바꾸고 런타임은 그대로 두는 것이 이 설계의 전제다. 그래서 여기서 하는 일은
 * envelope를 `(input, ctx)` 로 풀고 결과를 다시 envelope로 싸는 것뿐이고, 라우팅·토큰 장착·에러
 * 직렬화는 기존 `platform/app.ts` 가 그대로 처리한다. 폴백이 싼 이유이기도 하다 —
 * 추출기를 걷어내면 손으로 쓴 라우트로 돌아갈 뿐 런타임은 건드릴 게 없다.
 */
import type { Context } from 'hono'
import type { ServerCtx as BaseServerCtx } from '../serverFn'
import type { RequestContext } from './envelope'
import type { Sdk } from './sdk'

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
export async function runServerFn<I, O>(handler: Handler<I, O>, c: Context) {
  const raw = await c.req.text()
  const input = (raw ? JSON.parse(raw) : {}) as I
  const ctx = c.var.ctx as RequestContext
  const result = await handler(input, {
    accountId: ctx.accountId,
    // 옛 디스패처(필드 추가 이전)와 섞여도 **권한이 열리지 않도록** false 로 떨어뜨린다.
    isProjectOwner: ctx.isProjectOwner === true,
    sdk: c.var.sdk as Sdk,
  })
  return c.json(result as object, 200)
}
