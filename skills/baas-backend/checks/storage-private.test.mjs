/**
 * 비공개 파일 — 서버 SDK `storage.private` (aiapp-service#919).
 *
 * 고정하는 것: 서비스 경로로 부른다(주입 토큰) · 요청 모양(content_type · size / file_ids) · 브라우저에 넘길
 * 업로드 대상 모양(upload_url · content_type · file_id — `uploadTo` 가 받는 모양) · 빈 목록은 부르지 않는다 ·
 * 실패는 던진다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')

function run(respond, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-private-'))
  fs.cpSync(BOILERPLATE, root, { recursive: true, filter: (src) => !src.includes('node_modules') })
  fs.writeFileSync(path.join(root, 'run.mjs'), `
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined })
      return (${respond})()
    }
    const { buildSdk } = await import('./src/platform/sdk.ts')
    const sdk = buildSdk({ token: 'tok', projectId: 'p1', requestId: 'r1', accountId: 'a1' })
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

const json = (data, status = 200) => `() => new Response(JSON.stringify(${JSON.stringify(data)}), { status: ${status} })`
const FID = 'a'.repeat(32) + '.jpg'

test('업로드 대상 — 서비스 경로, uploadTo 가 받는 모양', () => {
  const r = run(json({ data: { file_id: FID, upload_url: 'https://s3/put?sig', expires_in: 300 } }),
    `(sdk) => sdk.storage.private.presign({ contentType: 'image/jpeg', size: 2048 })`)
  assert.equal(r.error, null)
  const [c] = r.calls
  assert.equal(c.url, 'http://baas.test/service/storage/private/presign')
  assert.equal(c.method, 'POST')
  assert.equal(c.headers.authorization, 'Bearer tok')
  assert.deepEqual(c.body, { content_type: 'image/jpeg', size: 2048 })
  assert.deepEqual(r.out, { upload_url: 'https://s3/put?sig', content_type: 'image/jpeg', file_id: FID })
})

test('열람 주소 — file_ids 로 부르고 items 를 돌려준다', () => {
  const r = run(json({ data: { items: [{ file_id: FID, url: 'https://s3/get?sig' }], expires_in: 300 } }),
    `(sdk) => sdk.storage.private.view(['${FID}'])`)
  assert.equal(r.error, null)
  assert.equal(r.calls[0].url, 'http://baas.test/service/storage/private/view')
  assert.deepEqual(r.calls[0].body, { file_ids: [FID] })
  assert.deepEqual(r.out, [{ file_id: FID, url: 'https://s3/get?sig' }])
})

test('삭제 — 지운 수', () => {
  const r = run(json({ data: { deleted: 1 } }), `(sdk) => sdk.storage.private.remove(['${FID}'])`)
  assert.equal(r.calls[0].url, 'http://baas.test/service/storage/private/delete')
  assert.equal(r.out, 1)
})

test('빈 목록은 서버를 부르지 않는다', () => {
  const r = run(json({ data: {} }), `async (sdk) => [await sdk.storage.private.view([]), await sdk.storage.private.remove([])]`)
  assert.equal(r.calls.length, 0)
  assert.deepEqual(r.out, [[], 0])
})

test('형식 · 크기 거절은 던진다', () => {
  const r = run(json({ message: '비공개 파일로 올릴 수 없는 형식입니다.' }, 400),
    `(sdk) => sdk.storage.private.presign({ contentType: 'text/html', size: 1 })`)
  assert.equal(r.out, null)
  assert.equal(r.error.status, 400)
})
