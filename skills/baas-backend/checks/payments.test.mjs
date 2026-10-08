/**
 * 커스텀 결제 — 서버 SDK `payments` (aiapp-service#900).
 *
 * 고정하는 것은 셋이다.
 *
 * **결제자는 요청한 회원이다.** 인자로 받으면 다른 회원 이름으로 결제가 만들어진다. 비로그인이면
 * 서버에 닿기 전에 막는다.
 *
 * **금액은 serverFn 이 넘긴 값 그대로 간다.** 서버가 그 값을 세션에 박는다.
 *
 * **실패는 던진다.** 알림(`notify.owner`)과 반대다 — 결제 실패를 값으로 삼키면 예약이 결제 없이
 * 확정된다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')

/** 골격 SDK 로 `body`(sdk 를 쓰는 async 코드)를 실행한다. `fetch` 는 `respond` 로 바꿔 끼운다. */
function run(respond, body, accountId = 'acc-1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'payments-'))
  fs.cpSync(BOILERPLATE, root, { recursive: true, filter: (src) => !src.includes('node_modules') })
  fs.writeFileSync(path.join(root, 'run.mjs'), `
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined })
      return (${respond})()
    }
    const { buildSdk } = await import('./src/platform/sdk.ts')
    const sdk = buildSdk({ token: 'tok', projectId: 'p1', requestId: 'r1', accountId: ${JSON.stringify(accountId)} })
    let out = null, error = null
    try { out = await (${body})(sdk) }
    catch (e) { error = { message: e.message, status: e.status } }
    console.log('__OUT__' + JSON.stringify({ out, calls, error }))
  `)
  const res = spawnSync(process.execPath, ['--experimental-strip-types', 'run.mjs'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, BAAS_BASE_URL: 'http://baas.test' } })
  const line = (res.stdout || '').split('\n').find((l) => l.startsWith('__OUT__'))
  assert.ok(line, `실행 실패:\n${res.stderr}`)
  return JSON.parse(line.slice('__OUT__'.length))
}

const OK = `() => new Response(JSON.stringify({ data: { order_no: 'pcs_1', status: 'CREATED', amount: 10000 } }), { status: 200 })`

test('create — 결제자는 요청한 회원, 금액은 넘긴 값 그대로', () => {
  const r = run(OK, `(sdk) => sdk.payments.create({ amount: 10000, itemName: '커트 예약금' })`)
  assert.equal(r.error, null)
  const [c] = r.calls
  assert.equal(c.url, 'http://baas.test/service/payments/sessions')
  assert.equal(c.method, 'POST')
  assert.equal(c.headers.authorization, 'Bearer tok')
  assert.deepEqual(c.body, { account_id: 'acc-1', amount: 10000, item_name: '커트 예약금' })
})

test('create — 비로그인이면 서버에 닿기 전에 막는다', () => {
  const r = run(OK, `(sdk) => sdk.payments.create({ amount: 10000, itemName: 'x' })`, null)
  assert.equal(r.calls.length, 0)
  assert.equal(r.error.status, 401)
})

test('confirm — 토스 successUrl 값을 서버 필드 이름으로 보낸다', () => {
  const r = run(OK, `(sdk) => sdk.payments.confirm('pcs_1', { paymentKey: 'pk', amount: 10000 })`)
  const [c] = r.calls
  assert.equal(c.url, 'http://baas.test/service/payments/sessions/pcs_1/confirm')
  assert.deepEqual(c.body, { payment_key: 'pk', amount: 10000 })
})

test('get · cancel 경로', () => {
  const r = run(OK, `async (sdk) => { await sdk.payments.get('pcs_1'); return sdk.payments.cancel('pcs_1', '고객 요청') }`)
  assert.equal(r.calls[0].method, 'GET')
  assert.equal(r.calls[0].url, 'http://baas.test/service/payments/sessions/pcs_1')
  assert.equal(r.calls[1].url, 'http://baas.test/service/payments/sessions/pcs_1/cancel')
  assert.deepEqual(r.calls[1].body, { reason: '고객 요청' })
})

test('실패는 던진다 — 금액 불일치 400 이 값으로 삼켜지면 예약이 결제 없이 확정된다', () => {
  const r = run(
    `() => new Response(JSON.stringify({ message: '결제 금액이 세션 금액과 일치하지 않습니다.' }), { status: 400 })`,
    `(sdk) => sdk.payments.confirm('pcs_1', { paymentKey: 'pk', amount: 1 })`,
  )
  assert.equal(r.out, null)
  assert.equal(r.error.status, 400)
  assert.match(r.error.message, /일치하지 않습니다/)
})
