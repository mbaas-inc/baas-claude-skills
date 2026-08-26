/**
 * 실행 위치 어댑터 — 같은 핸들러를 Lambda 와 로컬 프로세스 양쪽에서 돌린다.
 *
 * 로컬 어댑터가 있어야 에이전트가 **배포 전에 스스로 검증**할 수 있다. 이게 없으면
 * 배포→실패→로그확인 왕복이 유일한 피드백 경로가 되어 반복 비용이 커진다.
 */

import { createServer } from 'node:http'
import { handleInvoke, handleSchedule } from './app'
import type { InvokeEnvelope, ScheduleEnvelope } from './envelope'

type AnyEnvelope = (InvokeEnvelope | ScheduleEnvelope) & { scheduleName?: string }

async function dispatch(envelope: AnyEnvelope) {
  return 'scheduleName' in envelope && envelope.scheduleName
    ? handleSchedule(envelope as ScheduleEnvelope)
    : handleInvoke(envelope as InvokeEnvelope)
}

/** Lambda 진입점. 디스패처가 이 함수를 Invoke 한다. */
export async function lambdaHandler(event: AnyEnvelope) {
  return dispatch(event)
}

/**
 * 로컬 HTTP 어댑터. `POST /invoke` 로 봉투를 그대로 받는다.
 *
 * 봉투를 손으로 만들어야 하는 게 번거로워 보이지만 의도한 것이다 — 운영에서 디스패처가
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
        res.end(JSON.stringify({ error: `봉투를 해석할 수 없습니다: ${String(e)}` }))
      }
    })
  })
  server.listen(port, () => console.log(`local backend on :${port} (POST /invoke)`))
  return server
}
