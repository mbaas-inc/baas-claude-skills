/**
 * 추출기가 **헬퍼 함수까지 따라가** grant·시크릿을 유도하는가 (#86).
 *
 * 고치기 전에는 `serverFn` 본문만 훑어서, 헬퍼로 뺀 `dyncol` 호출의 grant 가 누락됐다.
 * 그런데 빌드는 통과하고 `service grant 없음 — 백엔드가 컬렉션을 만지지 않는다` 라고
 * **당당히 보고**했다. 런타임에야 403 으로 드러난다.
 *
 * 그래서 생성된 프로젝트가 *"헬퍼로 분리했을 때 read 가 유도되지 않는다"* 며 일부러 복붙으로
 * 되돌아갔다(`proj-1a6e5d40`, 2026-09 실측). **공통화는 좋은 코드인데 도구가 벌하고 있었다.**
 * 여기서 고정하는 것은 그 유인이 사라졌는가다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')

/** 최소 프로젝트를 만들고 추출기를 돌린다. 반환: { grants, secrets, status, out } */
function extract(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-'))
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true })
  fs.cpSync(BOILERPLATE, path.join(root, 'backend'), { recursive: true })
  // §0 이 설치할 때 하는 복사. 없으면 프론트 트리가 마커를 못 찾아 번들이 깨진다.
  fs.copyFileSync(path.join(root, 'backend', 'src', 'serverFn.ts'),
    path.join(root, 'src', 'services', 'serverFn.ts'))
  for (const [rel, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, 'src', 'services', rel), body)
  }
  const res = spawnSync(process.execPath, [path.join('backend', 'extract.mjs')],
    { cwd: root, encoding: 'utf8' })
  const read = (p) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, 'backend', p), 'utf8'))
    } catch {
      return null
    }
  }
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    grants: read('service-grants.json'),
    secrets: read('secret-names.json'),
  }
}

const SERVER_FN = `import { serverFn } from './serverFn'\n`

test('같은 파일의 헬퍼를 따라간다', () => {
  const r = extract({
    'admin.ts': SERVER_FN + `
async function readSetting(sdk: any) { return sdk.dyncol.get('settings', 'main') }
export const board = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  await readSetting(ctx.sdk as any)
  return { ok: true }
}, { access: 'custom' })`,
  })
  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.settings, { read: ['service'] })
})

test('services 안에서 import 한 헬퍼를 따라간다', () => {
  const r = extract({
    '_shared.ts': `export async function loadAdmins(sdk: any) {
      return sdk.dyncol.list('admin_accounts', { limit: 100 })
    }`,
    'admin.ts': SERVER_FN + `import { loadAdmins } from './_shared'
export const board = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  await loadAdmins(ctx.sdk as any)
  return { ok: true }
}, { access: 'custom' })`,
  })
  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.admin_accounts, { read: ['service'] })
})

test('헬퍼 안의 시크릿 이름도 유도한다', () => {
  const r = extract({
    '_shared.ts': `export async function callErp(sdk: any) {
      const key = await sdk.secrets.get('ERP_API_KEY')
      return key
    }`,
    'sync.ts': SERVER_FN + `import { callErp } from './_shared'
export const run = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  await callErp(ctx.sdk as any)
  return { ok: true }
}, { access: 'custom' })`,
  })
  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.secrets.secrets, ['ERP_API_KEY'])
})

test('헬퍼가 부르는 헬퍼까지 따라간다', () => {
  const r = extract({
    'admin.ts': SERVER_FN + `
async function inner(sdk: any) { return sdk.dyncol.create('audit_log', {}) }
async function outer(sdk: any) { return inner(sdk) }
export const act = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  await outer(ctx.sdk as any)
  return { ok: true }
}, { access: 'custom' })`,
  })
  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.audit_log, { create: ['service'] })
})

test('서로 부르는 헬퍼에서 멈춘다', () => {
  // 순환을 안 막으면 여기서 영원히 돈다. 테스트가 끝난다는 것 자체가 검증이다.
  const r = extract({
    'admin.ts': SERVER_FN + `
async function a(sdk: any): Promise<unknown> { await sdk.dyncol.get('x', '1'); return b(sdk) }
async function b(sdk: any): Promise<unknown> { return a(sdk) }
export const act = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  await a(ctx.sdk as any)
  return { ok: true }
}, { access: 'custom' })`,
  })
  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.x, { read: ['service'] })
})

test('여러 serverFn 이 같은 헬퍼를 써도 한 번만 센다', () => {
  const r = extract({
    '_shared.ts': `export async function touch(sdk: any) { return sdk.dyncol.get('shared', '1') }`,
    'a.ts': SERVER_FN + `import { touch } from './_shared'
export const one = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  await touch(ctx.sdk as any); return { ok: true } }, { access: 'custom' })`,
    'b.ts': SERVER_FN + `import { touch } from './_shared'
export const two = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  await touch(ctx.sdk as any); return { ok: true } }, { access: 'custom' })`,
  })
  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.shared, { read: ['service'] })
})

test('헬퍼 안의 동적 컬렉션명도 빌드를 막는다', () => {
  // 본문에서 막던 것이 헬퍼로 빠지면서 뚫리면 안 된다.
  const r = extract({
    'admin.ts': SERVER_FN + `
async function pick(sdk: any, name: string) { return sdk.dyncol.get(name, '1') }
export const act = serverFn<{ n: string }, { ok: boolean }>(async (input, ctx) => {
  await pick(ctx.sdk as any, input.n)
  return { ok: true }
}, { access: 'custom' })`,
  })
  assert.notEqual(r.status, 0)
  assert.match(r.out, /dynamic-collection/)
})

test('services 밖의 모듈은 쫓지 않는다', () => {
  // 플랫폼 SDK 까지 따라가면 해석 못 하는 호출마다 오탐이 난다.
  const r = extract({
    'admin.ts': SERVER_FN + `import { SdkError } from '../../backend/src/platform/sdk'
export const act = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  if (!ctx.accountId) throw new SdkError('로그인이 필요합니다.', 401)
  await (ctx.sdk as any).dyncol.get('here', '1')
  return { ok: true }
}, { access: 'custom' })`,
  })
  assert.equal(r.status, 0, r.out)
  assert.deepEqual(Object.keys(r.grants), ['here'])
})
