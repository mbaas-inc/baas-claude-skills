/**
 * 저작 마커. 프론트에서 import 해서 서버 로직을 감싼다.
 *
 * 런타임 구현은 없다 — 빌드(`node backend/extract.mjs`)가 이 호출을 찾아
 * envelope 라우트와 fetch 스텁을 만든다. 여기서는 **타입만** 지킨다.
 */
export type ServerCtx = { accountId: string | null; sdk: unknown }
export function serverFn<I, O>(handler: (input: I, ctx: ServerCtx) => Promise<O>) {
  return handler
}
