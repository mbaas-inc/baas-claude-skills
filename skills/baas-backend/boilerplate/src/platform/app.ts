/**
 * Hono 앱 팩토리 — envelope를 Hono 요청으로 바꾸고 컨텍스트·SDK 를 주입한다.
 *
 * 에이전트는 `route.get/post/...` 로 라우트만 등록한다. envelope 파싱·SDK 생성·에러 직렬화는
 * 여기가 처리하므로 도메인 로직에 배관 코드가 섞이지 않는다.
 */

import { Hono } from 'hono'
import type { InvokeEnvelope, InvokeResult, RequestContext, ScheduleEnvelope } from './envelope'
import { buildSdk, SdkError, type Sdk } from './sdk.ts'

type Vars = { ctx: RequestContext; sdk: Sdk }
type Bindings = { ctx: RequestContext; sdk: Sdk }

/** 에이전트가 라우트를 등록하는 대상. `c.var.ctx` / `c.var.sdk` 로 플랫폼 자원에 접근한다. */
export const route = new Hono<{ Variables: Vars; Bindings: Bindings }>()

// 어댑터는 컨텍스트를 `fetch(request, env)` 의 env 로 넘긴다(요청마다 값이 다르므로).
// 라우트는 Hono 관례대로 `c.var` 로 읽으므로 여기서 한 번 옮겨 담는다.
// 이 미들웨어가 없으면 `c.var.ctx` 가 undefined 라 라우트가 500 으로 죽는다.
route.use('*', async (c, next) => {
  c.set('ctx', c.env.ctx)
  c.set('sdk', c.env.sdk)
  await next()
})

/**
 * 라우트 예외의 유일한 수신처.
 *
 * Hono 는 라우트가 던진 예외를 **밖으로 내보내지 않는다** — 내부에서 잡아 plain-text
 * "Internal Server Error" 500 응답으로 바꾼다. 그래서 `handleInvoke` 의 try/catch 는
 * 라우트 예외에 대해 실행되지 않고, 거기 적힌 상태코드 보존 계약이 죽은 코드가 된다
 * (실측: `throw new SdkError('중복입니다', 409)` → `{status:500, body:"Internal Server Error"}`).
 * 예외를 여기서 받아야 dyncol 의 409(중복·정원)가 500 으로 뭉개지지 않는다.
 */
route.onError((err, c) => {
  if (err instanceof SdkError) {
    return new Response(JSON.stringify({ error: err.message, code: err.errorCode }), {
      status: err.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  console.error('[unhandled]', { requestId: c.var.ctx?.requestId, error: String(err) })
  return new Response(JSON.stringify({ error: '서버 오류가 발생했습니다.' }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  })
})

type ScheduleHandler = (sdk: Sdk, envelope: ScheduleEnvelope) => Promise<void>
const schedules = new Map<string, ScheduleHandler>()

/**
 * 스케줄 핸들러 등록. 이름은 플랫폼에 크론을 등록할 때 지정한 값과 같아야 한다.
 *
 * 크론에는 요청 회원이 없으므로(`ctx.accountId === null`) 소유자 스코프 조회가 안 된다.
 * 전체 조회가 필요하면 컬렉션 접근 정책을 그에 맞게 설계해야 한다.
 */
export function schedule(name: string, handler: ScheduleHandler): void {
  schedules.set(name, handler)
}

function toResult(status: number, body: unknown): InvokeResult {
  return { status, body, headers: { 'content-type': 'application/json' } }
}

/** envelope를 받아 라우트를 실행한다. 어댑터(Lambda·로컬)가 공통으로 호출한다. */
export async function handleInvoke(envelope: InvokeEnvelope): Promise<InvokeResult> {
  const { context } = envelope
  const sdk = buildSdk(context)

  const url = new URL(`http://backend${envelope.path}`)
  for (const [k, v] of Object.entries(envelope.query ?? {})) url.searchParams.set(k, v)

  const request = new Request(url, {
    method: envelope.method,
    headers: envelope.headers,
    body: envelope.body ?? undefined,
  })

  try {
    const res = await route.fetch(request, { ctx: context, sdk })
    const text = await res.text()
    // 라우트가 JSON 을 돌려주는 게 계약이지만, 비어 있거나 JSON 이 아니면 원문을 그대로 싣는다.
    let body: unknown = null
    if (text) { try { body = JSON.parse(text) } catch { body = text } }
    return { status: res.status, body, headers: { 'content-type': 'application/json' } }
  } catch (e) {
    // 라우트 예외는 `route.onError` 가 이미 처리했다 — 여기 오는 것은 그 바깥의 실패
    // (envelope 로 Request 를 만들지 못했거나 본문을 읽지 못한 경우)뿐이다.
    if (e instanceof SdkError) {
      return toResult(e.status, { error: e.message, code: e.errorCode })
    }
    console.error('[unhandled]', { requestId: context.requestId, error: String(e) })
    return toResult(500, { error: '서버 오류가 발생했습니다.' })
  }
}

/** 스케줄 envelope 실행. 등록되지 않은 이름이면 404 로 알린다(조용히 넘기면 원인 추적이 안 된다). */
export async function handleSchedule(envelope: ScheduleEnvelope): Promise<InvokeResult> {
  const handler = schedules.get(envelope.scheduleName)
  if (!handler) {
    return toResult(404, { error: `등록되지 않은 스케줄입니다: ${envelope.scheduleName}` })
  }
  try {
    await handler(buildSdk(envelope.context), envelope)
    return toResult(200, { ok: true })
  } catch (e) {
    console.error('[schedule]', {
      requestId: envelope.context.requestId,
      schedule: envelope.scheduleName,
      error: String(e),
    })
    return toResult(500, { error: '스케줄 실행이 실패했습니다.' })
  }
}
