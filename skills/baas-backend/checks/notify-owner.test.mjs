/**
 * 관리자 알림 — 서버 SDK `notify.owner` 와 선언에서 만든 타입 (aiapp-service#884).
 *
 * 여기서 고정하는 것은 둘이다.
 *
 * **알림 실패가 기능을 깨지 않는가.** 알림은 동작이 끝난 뒤의 부수 효과다. 예약은 저장됐는데
 * 알림 실패가 예외로 올라가면 손님은 실패 화면을 보고 다시 눌러 예약이 두 건이 된다. 그래서
 * 서버 오류·네트워크 오류 모두 값으로 돌아와야 한다.
 *
 * **선언하지 않은 키가 컴파일에서 걸리는가.** 런타임에는 404 가 `failed` 로 삼켜지므로, 오타를
 * 잡을 마지막 자리가 타입이다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { renderNotificationTypes } from '../boilerplate/schema.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')
const TSC = path.join(BOILERPLATE, 'node_modules', 'typescript', 'bin', 'tsc')

/**
 * 골격의 SDK 를 그대로 띄워 `notify.owner` 를 한 번 부른다. `fetch` 는 `respond` 로 바꿔 끼운다.
 * 반환: { out: 결과 값, calls: 보낸 요청, threw, stderr }
 */
function callNotify(respond) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-'))
  fs.cpSync(BOILERPLATE, root, { recursive: true, filter: (src) => !src.includes('node_modules') })
  fs.writeFileSync(path.join(root, 'run.mjs'), `
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) })
      return (${respond})()
    }
    const { buildSdk } = await import('./src/platform/sdk.ts')
    const sdk = buildSdk({ token: 'tok', projectId: 'p1', requestId: 'r1' })
    let out = null, threw = false
    try { out = await sdk.notify.owner('reservation.created', { name: '홍길동', people: '4명' }) }
    catch { threw = true }
    console.log('__OUT__' + JSON.stringify({ out, calls, threw }))
  `)
  const res = spawnSync(process.execPath, ['--experimental-strip-types', 'run.mjs'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, BAAS_BASE_URL: 'http://baas.test' } })
  const line = (res.stdout || '').split('\n').find((l) => l.startsWith('__OUT__'))
  assert.ok(line, `실행 실패:\n${res.stderr}`)
  return { ...JSON.parse(line.slice('__OUT__'.length)), stderr: res.stderr || '' }
}

test('서비스 토큰으로 소유자 알림 경로를 부른다', () => {
  const r = callNotify(`() => new Response(JSON.stringify({ data: { result: 'sent', log_id: 7 } }), { status: 200 })`)
  assert.equal(r.threw, false)
  assert.deepEqual(r.out, { result: 'sent', log_id: 7 })
  const [c] = r.calls
  assert.equal(c.url, 'http://baas.test/service/notifications/owner')
  assert.equal(c.method, 'POST')
  assert.equal(c.headers.authorization, 'Bearer tok')
  assert.equal(c.headers['x-baas-project-id'], 'p1')
  // 수신자는 본문에 없다 — 서버가 소유자로 고정한다.
  assert.deepEqual(c.body, { key: 'reservation.created', values: { name: '홍길동', people: '4명' } })
})

test('꺼진 알림·한도는 오류가 아니다 — 그대로 돌려준다', () => {
  for (const result of ['disabled', 'limited', 'skipped']) {
    const r = callNotify(`() => new Response(JSON.stringify({ data: { result: '${result}', log_id: 1 } }), { status: 200 })`)
    assert.equal(r.threw, false)
    assert.equal(r.out.result, result)
  }
})

test('미선언 키(404)도 던지지 않고 failed 로 돌려준다', () => {
  const r = callNotify(`() => new Response(JSON.stringify({ message: 'schema.json 에 선언하고 수렴하세요' }), { status: 404 })`)
  assert.equal(r.threw, false)
  assert.equal(r.out.result, 'failed')
  assert.equal(r.out.error.status, 404)
  assert.match(r.out.error.message, /schema\.json/)
  // 삼키는 대신 로그로 남긴다 — 토큰은 남기지 않는다.
  assert.match(r.stderr, /reservation\.created/)
  assert.doesNotMatch(r.stderr, /tok\b/)
})

test('네트워크 오류도 던지지 않는다', () => {
  const r = callNotify(`() => { throw new TypeError('fetch failed') }`)
  assert.equal(r.threw, false)
  assert.equal(r.out.result, 'failed')
  assert.match(r.out.error.message, /fetch failed/)
})

test('선언하지 않은 키와 값 이름은 컴파일 에러다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-types-'))
  fs.writeFileSync(path.join(root, 'notifications.ts'), renderNotificationTypes({
    notifications: [
      { key: 'reservation.created', label: '예약 접수', fields: ['name', { name: 'people', label: '인원' }] },
      { key: 'inquiry.created', label: '문의 접수' },
    ],
  }))
  fs.writeFileSync(path.join(root, 'use.ts'), `
import type { OwnerNotifySdk, OwnerNotifyResult } from './notifications'
declare const ctx: { sdk: unknown }
const sdk = ctx.sdk as OwnerNotifySdk
export async function ok(): Promise<OwnerNotifyResult> {
  await sdk.notify.owner('inquiry.created', {})
  return sdk.notify.owner('reservation.created', { name: '홍길동', people: '4명' })
}
export async function bad() {
  // @ts-expect-error — 선언하지 않은 키
  await sdk.notify.owner('reservation.craeted', { name: 'a', people: 'b' })
  // @ts-expect-error — 선언하지 않은 값 이름
  await sdk.notify.owner('reservation.created', { name: 'a', people: 'b', phone: 'c' })
  // @ts-expect-error — 선언한 값을 빠뜨렸다
  await sdk.notify.owner('reservation.created', { name: 'a' })
}
`)
  // 앱 트리를 흉내 낸다 — 백엔드 런타임 타입(node 등)을 끌어오지 않는다.
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', module: 'esnext',
      moduleResolution: 'bundler', noEmit: true, types: [] },
    files: ['use.ts'],
  }))
  const res = spawnSync(process.execPath, [TSC, '-p', root], { encoding: 'utf8' })
  assert.equal(res.status, 0, `${res.stdout}${res.stderr}`)
})

test('생성 타입의 결과 모양이 플랫폼 SDK 와 같다', () => {
  // 앱 트리는 SDK 타입을 임포트할 수 없어 결과 타입을 복제한다. 복제는 갈라지므로 여기서 묶는다 —
  // SDK 가 결과를 바꾸고 생성기를 잊으면 앱 코드는 없는 값을 믿고 분기한다.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-drift-'))
  fs.writeFileSync(path.join(root, 'notifications.ts'), renderNotificationTypes({
    notifications: [{ key: 'a', label: '가', fields: ['x'] }],
  }))
  const sdkPath = path.join(BOILERPLATE, 'src', 'platform', 'sdk.ts')
  fs.writeFileSync(path.join(root, 'drift.ts'), `
import type * as gen from './notifications'
import type * as platform from ${JSON.stringify(sdkPath)}
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
export const result: Same<gen.OwnerNotifyResult, platform.OwnerNotifyResult> = true
export const value: Same<gen.OwnerNotifyValue, platform.OwnerNotifyValue> = true
type PlatformOwner = platform.Sdk['notify']['owner']
export const returns: Same<Awaited<ReturnType<PlatformOwner>>, gen.OwnerNotifyResult> = true
`)
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2023', module: 'esnext', moduleResolution: 'bundler',
      noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true,
      types: ['node'], typeRoots: [path.join(BOILERPLATE, 'node_modules', '@types')] },
    files: ['drift.ts'],
  }))
  const res = spawnSync(process.execPath, [TSC, '-p', root], { encoding: 'utf8' })
  assert.equal(res.status, 0, `${res.stdout}${res.stderr}`)
})
