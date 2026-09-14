/**
 * serverFn ↔ envelope 사이의 얇은 층. **플랫폼 소유** — 생성 코드가 이걸 부른다.
 *
 * 저작 모델만 바꾸고 런타임은 그대로 두는 것이 이 설계의 전제다. 그래서 여기서 하는 일은
 * envelope를 `(input, ctx)` 로 풀고 결과를 다시 envelope로 싸는 것뿐이고, 라우팅·토큰 장착·에러
 * 직렬화는 기존 `platform/app.ts` 가 그대로 처리한다. 폴백이 싼 이유이기도 하다 —
 * 추출기를 걷어내면 손으로 쓴 라우트로 돌아갈 뿐 런타임은 건드릴 게 없다.
 */
import type { Context } from 'hono'
import type { RequestContext } from './envelope'
import type { Sdk } from './sdk'

/** 저작 쪽 `serverFn` 이 넘겨받는 컨텍스트. 프론트에는 이 타입이 노출되지 않는다.
 *
 * envelope의 `RequestContext` 를 그대로 주지 않고 필요한 것만 추린다 — `token` 은 SDK 가
 * 이미 장착했고, 사용자 코드가 만지면 안 된다. 그래서 **여기 없는 필드는 serverFn 에서
 * 보이지 않는다**: envelope에 값을 추가할 때 이 타입과 아래 전달을 함께 고쳐야 한다.
 */
export type ServerCtx = {
  accountId: string | null
  /** 이 요청자가 프로젝트 소유자인가. 관리자 판정의 1순위 — `envelope.ts` 주석 참조. */
  isProjectOwner: boolean
  sdk: Sdk
}

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
