import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ensureMembers, syncAdmin, usesMemberAuth } from '../../baas-integration-sdk/scaffold/sync-admin.mjs'
import { checkAdminSpec, declaredCalls } from '../boilerplate/admin-spec.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const metadataPath = path.resolve(here, '../../baas-integration-sdk/features.json')
const checkerPath = path.resolve(here, '../boilerplate/admin-spec.mjs')
const metadata = JSON.parse(fs.readFileSync(metadataPath))
const require = createRequire(path.resolve(here, '../boilerplate/package.json'))
function fixture(t, source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'member-admin-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'src'))
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.symlinkSync(path.dirname(require.resolve('typescript/package.json')), path.join(root, 'node_modules/typescript'))
  fs.writeFileSync(path.join(root, 'src/App.tsx'), source)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { validate: 'tsc --noEmit', build: 'vite build' } }))
  return root
}
const sync = (root, options = {}) => syncAdmin({ root, metadataPath, checkerPath, install: true, ...options })

for (const source of [
  'const sdk = (window as any).BaasSDK; const value = sdk.useLogin();',
  'const { useSignup: signup } = window.BaasSDK; signup();',
  'import { useSmsLogin as login } from "@mbaas/baas-web-sdk"; login();',
  'import * as SDK from "@mbaas/baas-web-sdk"; SDK.getSnsProviders();',
  'window.BaasSDK["loginWithSms"]({});',
]) test(`실제 로그인 사용을 판정한다: ${source}`, t => {
  assert.equal(usesMemberAuth(fixture(t, source), metadata), true)
})
for (const source of [
  'const value = "BaasSDK.useLogin()"; // BaasSDK.useSignup()',
  'const sdk = window.BaasSDK; sdk.AuthProvider({}); sdk.useAuth();',
  'const settings = {require_signup_approval:true};',
  'const other = { useLogin() {} }; other.useLogin();',
  'import { useLogin } from "other-package"; useLogin();',
  'import { useLogin } from "@mbaas/baas-web-sdk"; const unused = useLogin;',
  'function demo(BaasSDK) { BaasSDK.useLogin() }',
]) test(`로그인 기능으로 과대 판정하지 않는다: ${source}`, t => {
  assert.equal(usesMemberAuth(fixture(t, source), metadata), false)
})

test('로그인만 있는 앱에 명세/검사만 설치하고 반복 실행에도 중복이 없다', async t => {
  const root = fixture(t, 'BaasSDK.useLogin()')
  assert.deepEqual(await sync(root), { enabled: true, changed: true })
  const admin = path.join(root, 'backend/admin.json')
  const first = fs.readFileSync(admin, 'utf8')
  assert.equal(JSON.parse(first).pages.members.component, 'members')
  assert.equal(fs.existsSync(path.join(root, 'backend/package.json')), false)
  assert.equal(fs.existsSync(path.join(root, 'backend/src')), false)
  assert.deepEqual(await sync(root), { enabled: true, changed: false })
  assert.equal(fs.readFileSync(admin, 'utf8'), first)
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')))
  assert.equal(pkg.scripts.validate, 'tsc --noEmit && node scripts/baas-admin/sync-admin.mjs --check')
  await sync(root, { check: true })
})

test('로그인 없는 앱에는 아무 파일도 만들지 않는다', async t => {
  const root = fixture(t, 'BaasSDK.useAuth()')
  assert.deepEqual(await sync(root), { enabled: false, changed: false })
  assert.equal(fs.existsSync(path.join(root, 'backend')), false)
  assert.equal(fs.existsSync(path.join(root, 'scripts')), false)
})

test('로컬 SDK 래퍼를 상대 경로로 import해도 원본을 추적한다', t => {
  const root = fixture(t, 'import {sdk} from "./sdk"; sdk.useLogin()')
  fs.writeFileSync(path.join(root, 'src/sdk.ts'), 'export const sdk = window.BaasSDK;')
  assert.equal(usesMemberAuth(root, metadata), true)
})

test('기존 페이지/메뉴 순서/상세 확장을 보존하고 이름 충돌을 피한다', () => {
  const custom = { title: '고객', component: 'members', widgets: [], member_detail: { bindings: {}, widgets: [] } }
  const spec = { version: 1, title: '앱', menu: ['home'], pages: { home: { title: '홈', widgets: [] }, customers: custom } }
  const synced = ensureMembers(spec)
  assert.deepEqual(synced.menu, ['home', 'customers'])
  assert.deepEqual(synced.pages.customers, custom)
  assert.deepEqual(ensureMembers(synced), synced)
  const collision = ensureMembers({ ...spec, pages: { members: { title: '업무', widgets: [] } }, menu: ['members'] })
  assert.deepEqual(collision.menu, ['members', 'members_2'])
})

test('출시 검사는 누락을 실패시키며 과거 소스를 쓰지 않는다', async t => {
  const root = fixture(t, 'BaasSDK.useLogin()')
  await assert.rejects(sync(root, { check: true }), /회원관리 페이지/)
  assert.equal(fs.existsSync(path.join(root, 'backend')), false)
  await sync(root)
  const admin = path.join(root, 'backend/admin.json')
  const before = fs.readFileSync(admin, 'utf8')
  fs.mkdirSync(path.join(root, 'backend/dist'))
  fs.writeFileSync(path.join(root, 'backend/dist/admin.json'), '{}')
  await assert.rejects(sync(root, { check: true }), /저장된 admin.json과 다릅니다/)
  assert.equal(fs.readFileSync(admin, 'utf8'), before)
  await sync(root)
  assert.equal(fs.readFileSync(path.join(root, 'backend/dist/admin.json'), 'utf8'), before)
})

test('잘못된 명세는 덮어쓰지 않는다', async t => {
  const root = fixture(t, 'BaasSDK.useLogin()')
  fs.mkdirSync(path.join(root, 'backend'))
  fs.writeFileSync(path.join(root, 'backend/admin.json'), '{broken')
  await assert.rejects(sync(root))
  assert.equal(fs.readFileSync(path.join(root, 'backend/admin.json'), 'utf8'), '{broken')
})

test('상세 위젯의 문자열 바인딩·설정 필터·소유자 동작을 검사한다', () => {
  const spec = ensureMembers(null)
  spec.pages.members.member_detail = { bindings: { notes: 'member_id' }, widgets: [
    { type: 'settings', collection: 'notes', filter: { visible: true } },
    { type: 'panel', title: '업무', call: 'members.task' },
  ] }
  const collections = [{ name: 'notes', fields: [{ name: 'member_id', type: 'string' }, { name: 'visible', type: 'boolean' }] }]
  const check = access => checkAdminSpec(JSON.stringify(spec), { collections, access }).errors
  assert.deepEqual(check({ 'members.task': { access: 'owner' } }), [])
  assert.match(check({ 'members.task': { access: 'member' } }).join('\n'), /access: 'owner'/)
  assert.equal(declaredCalls(spec)[0].name, 'members.task')
  spec.pages.members.member_detail.bindings = {}
  assert.match(check({ 'members.task': { access: 'owner' } }).join('\n'), /바인딩/)
})
