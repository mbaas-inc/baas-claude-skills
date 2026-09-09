/**
 * 실행 위치 어댑터 — 같은 핸들러를 Lambda 와 로컬 프로세스 양쪽에서 돌린다.
 *
 * 로컬 어댑터가 있어야 에이전트가 **배포 전에 스스로 검증**할 수 있다. 이게 없으면
 * 배포→실패→로그확인 왕복이 유일한 피드백 경로가 되어 반복 비용이 커진다.
 */

import { createServer } from 'node:http'
import { handleInvoke, handleSchedule } from './app.ts'
import { ENVELOPE_CONTRACT_VERSION } from './envelope.ts'
import type { InvokeEnvelope, ScheduleEnvelope } from './envelope'

type AnyEnvelope = (InvokeEnvelope | ScheduleEnvelope) & { scheduleName?: string }

/**
 * envelope가 이 백엔드가 아는 계약인지 **런타임에** 확인한다.
 *
 * 타입 검사는 컴파일 시점 것이라 디스패처가 보내는 JSON 에는 닿지 않는다. 실제로
 * `context.project_id`(snake) 와 `projectId`(camel) 가 갈렸을 때 아무 신호 없이
 * `undefined` 로 흘렀다 — 실패가 요청 처리 한참 뒤 엉뚱한 곳에서 났다.
 *
 * 그래서 여기서 **가장 먼저** 막고, 양쪽 버전을 메시지에 담는다. 어느 쪽을 올려야
 * 하는지 로그만 보고 알 수 있어야 한다.
 */
function contractMismatch(envelope: AnyEnvelope) {
  const got = (envelope as { contractVersion?: unknown })?.contractVersion
  if (got === ENVELOPE_CONTRACT_VERSION) return null
  const message =
    `envelope 계약 불일치: 디스패처=${JSON.stringify(got)} 백엔드=${ENVELOPE_CONTRACT_VERSION}. ` +
    '디스패처와 백엔드를 같은 계약 버전으로 배포해야 한다.'
  console.error('[contract]', message)
  // **던지지 않는다.** 던지면 Lambda 밖으로 새어 `FunctionError=Unhandled` 가 되고,
  // 부른 쪽은 "사용자 코드가 죽었다"와 구분할 수 없다 — 릴리스 점검이 정확히 그렇게
  // 오판해 정상 백엔드의 출시를 막았다(#507). 이 상황은 죽음이 아니라 **대답할 수 있는
  // 거절**이다. 양쪽 버전을 응답에 실어 어느 쪽을 올려야 하는지 부른 쪽이 알게 한다.
  return {
    status: 400,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: message, contractVersion: ENVELOPE_CONTRACT_VERSION, got: got ?? null }),
    // 봉투 결과를 펴는 쪽(브로커·디스패처)은 `status`/`body`/`headers` 만 읽으므로 이
    // 여분 필드는 무시된다. 릴리스 점검은 이것만 보고도 백엔드 버전을 안다.
    contractVersion: ENVELOPE_CONTRACT_VERSION,
  }
}

async function dispatch(envelope: AnyEnvelope) {
  const mismatch = contractMismatch(envelope)
  if (mismatch) return mismatch
  return 'scheduleName' in envelope && envelope.scheduleName
    ? handleSchedule(envelope as ScheduleEnvelope)
    : handleInvoke(envelope as InvokeEnvelope)
}

/** Lambda 진입점. 디스패처가 이 함수를 Invoke 한다. */
export async function lambdaHandler(event: AnyEnvelope) {
  return dispatch(event)
}

/**
 * 로컬 HTTP 어댑터. `POST /invoke` 로 envelope를 그대로 받는다.
 *
 * envelope를 손으로 만들어야 하는 게 번거로워 보이지만 의도한 것이다 — 운영에서 디스패처가
 * 보내는 것과 **정확히 같은 입력**으로 테스트해야 로컬에서만 통과하는 코드를 막는다.
 */
export function startLocalServer(port = Number(process.env.PORT ?? 8788)) {
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', async () => {
      if (req.url !== '/invoke' || req.method !== 'POST') {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'POST /invoke 만 받습니다' }))
        return
      }
      try {
        const out = await dispatch(JSON.parse(raw) as AnyEnvelope)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(out))
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: `envelope를 해석할 수 없습니다: ${String(e)}` }))
      }
    })
  })
  server.listen(port, () => console.log(`local backend on :${port} (POST /invoke)`))
  return server
}
