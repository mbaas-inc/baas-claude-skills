/**
 * 파일 업로드 대상 발급 — 서버 SDK `storage.presign` (aiapp-service#904).
 *
 * 고정하는 것: 서비스 경로로 부른다(주입 토큰) · 분류 기본값 images · 브라우저에 넘길 모양
 * (upload_url · content_type · cdn_url) · 실패(형식 · 크기 400)는 던진다.
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-'))
  fs.cpSync(BOILERPLATE, root, { recursive: true, filter: (src) => !src.includes('node_modules') })
  fs.writeFileSync(path.join(root, 'run.mjs'), `
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined })
      return (${respond})()
    }
    const { buildSdk } = await import('./src/platform/sdk.ts')
    const sdk = buildSdk({ token: 'tok', projectId: 'p1', requestId: 'r1', accountId: null })
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

const OK = `() => new Response(JSON.stringify({ data: { original: {
  presign_url: 'https://s3/put?sig', cdn_url: 'https://cdn/p1/storage/images/a.png',
  download_url: 'https://cdn/dl/a.png', key: 'storage/images/a.png' } } }), { status: 200 })`

test('서비스 경로로 부르고 분류 기본값은 images', () => {
  const r = run(OK, `(sdk) => sdk.storage.presign({ filename: 'a.png', contentType: 'image/png', size: 1024 })`)
  assert.equal(r.error, null)
  const [c] = r.calls
  assert.equal(c.url, 'http://baas.test/service/storage/presign')
  assert.equal(c.method, 'POST')
  assert.equal(c.headers.authorization, 'Bearer tok')
  assert.deepEqual(c.body, { category: 'images', filename: 'a.png', content_type: 'image/png', size: 1024 })
})

test('비로그인(소유자 전용 serverFn)이어도 발급 — 권한은 serverFn 의 access 가 정한다', () => {
  const r = run(OK, `(sdk) => sdk.storage.presign({ filename: 'a.png', contentType: 'image/png', size: 1, category: 'store' })`)
  assert.equal(r.error, null)
  assert.equal(r.calls[0].body.category, 'store')
})

test('브라우저에 넘길 모양 — upload_url · content_type · cdn_url', () => {
  const r = run(OK, `(sdk) => sdk.storage.presign({ filename: 'a.png', contentType: 'image/png', size: 1 })`)
  assert.deepEqual(r.out, {
    upload_url: 'https://s3/put?sig', content_type: 'image/png',
    cdn_url: 'https://cdn/p1/storage/images/a.png', download_url: 'https://cdn/dl/a.png', key: 'storage/images/a.png',
  })
})

test('형식 · 크기 거절은 던진다', () => {
  const r = run(`() => new Response(JSON.stringify({ message: '이미지 파일만 업로드 가능합니다.' }), { status: 400 })`,
    `(sdk) => sdk.storage.presign({ filename: 'run.exe', contentType: 'application/octet-stream', size: 1 })`)
  assert.equal(r.out, null)
  assert.equal(r.error.status, 400)
})
