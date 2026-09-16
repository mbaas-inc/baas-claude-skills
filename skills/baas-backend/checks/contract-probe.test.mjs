/**
 * 버전 질의와 진짜 계약 어긋남의 분리.
 *
 * 릴리스 스모크(`user_backend_deployer._smoke`)는 `contractVersion` 을 **일부러 비워**
 * 보내 백엔드가 자기 버전을 말하게 한다. 이 질의가 불일치 경로로 처리되면 둘이 한
 * 메시지를 공유해 — 릴리스마다 ERROR 가 쌓이고, 진짜 어긋남이 그 소음에 묻히며,
 * 로그를 읽는 사람이 코드를 역추적해야 정상인지 안다(실측 2026-09-16: 미리보기 기동
 * 로그의 이 ERROR 를 결함으로 오인해 조사에 들어갔다).
 *
 * 그래서 여기서 고정하는 것은 두 가지다. **질의는 조용히 답하는가**, 그리고 그 완화가
 * **진짜 어긋남까지 삼키지 않는가.** 후자가 없으면 소음을 없애다 신호를 없앤 것이 된다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')

/** 보일러플레이트를 그대로 띄워 envelope 하나를 dispatch 시키고 결과·stderr 를 돌려준다. */
function invoke(envelope) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'))
  fs.cpSync(BOILERPLATE, root, { recursive: true })
  fs.writeFileSync(path.join(root, 'run.mjs'), `
    const { lambdaHandler } = await import('./src/platform/adapters.ts')
    const out = await lambdaHandler(${JSON.stringify(envelope)})
    console.log('__OUT__' + JSON.stringify(out))
  `)
  // `sdk.ts` 가 모듈 로드 시점에 요구한다 — 플랫폼이 주입하는 값이라 하네스가 대신 준다.
  const res = spawnSync(process.execPath, ['--experimental-strip-types', 'run.mjs'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, BAAS_BASE_URL: 'http://127.0.0.1:1' } })
  const line = (res.stdout || '').split('\n').find((l) => l.startsWith('__OUT__'))
  return {
    out: line ? JSON.parse(line.slice('__OUT__'.length)) : null,
    stderr: res.stderr || '',
    status: res.status,
  }
}

const CONTRACT_VERSION = 2

test('버전 질의는 200 으로 답하고 ERROR 를 남기지 않는다', () => {
  const { out, stderr } = invoke({
    contractVersion: null,          // 스모크가 보내는 그대로
    path: '/__contract',
    method: 'GET',
    query: {},
    body: null,
    headers: {},
    context: { projectId: 'p-test', token: '', requestId: 'smoke', accountId: null },
  })
  assert.ok(out, '응답이 없다')
  assert.equal(out.status, 200, '질의는 거절이 아니다')
  assert.equal(out.contractVersion, CONTRACT_VERSION, '스모크가 읽는 필드가 비었다')
  assert.equal(JSON.parse(out.body).contractVersion, CONTRACT_VERSION, '중첩 body 에도 있어야 한다')
  assert.ok(!stderr.includes('[contract]'), `질의인데 ERROR 를 남겼다:\n${stderr}`)
})

test('실제 요청 경로에서 버전이 어긋나면 여전히 ERROR 로 막는다', () => {
  const { out, stderr } = invoke({
    contractVersion: 1,             // 구버전 디스패처
    path: '/coupons/claim',
    method: 'POST',
    query: {},
    body: null,
    headers: {},
    context: { projectId: 'p-test', token: '', requestId: 'r1', accountId: null },
  })
  assert.ok(out, '응답이 없다')
  assert.equal(out.status, 400, '진짜 어긋남은 거절해야 한다')
  assert.ok(stderr.includes('[contract]'), '진짜 어긋남인데 경고가 없다 — 신호까지 지웠다')
})

test('버전이 비어 있어도 실제 요청 경로면 어긋남으로 본다', () => {
  // 질의 완화가 경로가 아니라 값(null)에 걸리면, `contractVersion` 필드 자체가 없던
  // 구버전 디스패처를 통과시켜 버린다. 완화 기준이 경로임을 고정한다.
  const { out, stderr } = invoke({
    path: '/coupons/claim',
    method: 'POST',
    query: {},
    body: null,
    headers: {},
    context: { projectId: 'p-test', token: '', requestId: 'r2', accountId: null },
  })
  assert.equal(out.status, 400, '버전 없는 실제 요청을 통과시켰다')
  assert.ok(stderr.includes('[contract]'), '경고가 없다')
})
