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
import { serverFn, ServerFnError, errorStatus, errorDetail } from '../boilerplate/src/serverFn'
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
  // 접근 선언은 필수다 — 빠뜨리면 여기서 타입 에러가 난다(생성 코드도 마찬가지).
  { access: 'custom' },
)

/** 네 값이 모두 받아들여지는지 고정한다 — 하나라도 빠지면 생성 코드가 표현을 잃는다. */
export const publicFn = serverFn<undefined, null>(async () => null, { access: 'public' })
export const memberFn = serverFn<undefined, null>(async () => null, { access: 'member' })
export const ownerFn = serverFn<undefined, null>(async () => null, { access: 'owner' })

/** 어댑터가 좁히는 형태(`ServerCtx<Sdk>`)가 성립하는지도 함께 고정한다. */
type NarrowedIsAssignable = ServerCtx<{ dyncol: unknown }> extends ServerCtx ? true : never
export const narrowing: NarrowedIsAssignable = true

/**
 * 앱 트리가 **상태코드를 낼 수 있는지** 고정한다.
 *
 * `src/services/` 는 백엔드 트리를 임포트할 수 없어 `SdkError` 를 만들 수 없다. 그 사실을
 * 모른 채 가이드가 `throw new SdkError(...)` 를 보여주고 있었고(2026-09-16), 그래서 생성
 * 코드가 실패를 알리는 표준 경로가 없었다. 이 검사가 그 경로를 붙잡아 둔다.
 */
export const failsWithStatus = serverFn<{ id?: string }, { ok: true }>(async (input, ctx) => {
  if (!input.id) throw new ServerFnError('id 가 필요합니다', 400)
  try {
    const sdk = ctx.sdk as { dyncol: { create: (c: string, d: unknown) => Promise<unknown> } }
    await sdk.dyncol.create('things', { key: input.id })
  } catch (e) {
    // 409 는 오류가 아니라 결과다 — 클래스가 아니라 모양으로 판정한다.
    if (errorStatus(e) !== 409) throw e
    const failed = errorDetail(e)?.failed
    throw new ServerFnError('이미 있습니다', 409, { failed } as Record<string, unknown>)
  }
  return { ok: true }
}, { access: 'member' })
