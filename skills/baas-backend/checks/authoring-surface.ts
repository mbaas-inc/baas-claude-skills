/**
 * 저작 표면 회귀 검사 — **프로젝트로 복사되지 않는다**(`boilerplate/` 밖이다).
 *
 * 골격만 타입체크하면 이 부류를 못 잡는다. 실제로 깨지는 자리는 골격이 아니라 **에이전트가
 * 쓰는 코드**이기 때문이다: 2026-09-15 에 `serverFn.ts` 의 `ServerCtx` 에 `isProjectOwner` 가
 * 빠져 있었는데, 어댑터는 그 값을 넘기고 있어서 `boilerplate` 자체 타입체크는 통과했다.
 * 에이전트가 `ctx.isProjectOwner` 를 쓰는 순간에야 TS2339 로 드러났고, 그때는 이미 「고치지
 * 마라」고 적힌 파일을 고치는 것 말고는 통과할 길이 없었다.
 *
 * 그래서 이 파일은 **생성 코드가 실제로 쓰는 형태**를 그대로 흉내 낸다. `ctx` 의 필드를
 * 하나라도 못 쓰게 되면 여기서 컴파일이 깨진다.
 *
 * 앱 트리를 흉내 내므로 `hono` 같은 백엔드 런타임 의존을 끌어오면 안 된다 — tsconfig 가
 * 그 경로를 막고 있다.
 */
import { serverFn } from '../boilerplate/src/serverFn'
import type { ServerCtx } from '../boilerplate/src/serverFn'

export const readsEveryContextField = serverFn<{ q: string }, { status: string }>(
  async (input, ctx) => {
    // 관리자 판정 — 플랫폼이 보증하는 소유자 여부
    if (!ctx.isProjectOwner) return { status: 'forbidden' }
    // 로그인 회원 (비로그인이면 null)
    const accountId: string | null = ctx.accountId
    // sdk 는 저작 시점에 unknown 이다 — 생성 코드처럼 좁혀 쓴다
    const sdk = ctx.sdk as { dyncol: { list: (name: string) => Promise<unknown> } }
    await sdk.dyncol.list(input.q)
    return { status: accountId ? 'ok' : 'anon' }
  },
)

/** 어댑터가 좁히는 형태(`ServerCtx<Sdk>`)가 성립하는지도 함께 고정한다. */
type NarrowedIsAssignable = ServerCtx<{ dyncol: unknown }> extends ServerCtx ? true : never
export const narrowing: NarrowedIsAssignable = true
