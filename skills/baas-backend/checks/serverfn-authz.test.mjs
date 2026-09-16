/**
 * 인가 선언 검사 — 「본문이 판정하는데 선언은 침묵」을 잡는다.
 *
 * 2026-09-16 E2E: 지점 담당자 전용 함수 2개가 `access: 'member'` 로 선언돼 있었다. 동작은
 * 안전했지만(본문이 재확인했다) `serverfn-access.json` 만 보면 「로그인 회원 아무나」와
 * 구분되지 않아 감사도 리뷰도 통과한다.
 *
 * 원인은 에이전트 판단이 아니라 **선언 축이 하나였던 것**이다. 예전 `access: 'custom'` 은
 * 인가를 드러내는 대신 **플랫폼의 로그인 강제를 잃었다** — 그래서 `member` 를 고르는 쪽이
 * 오히려 안전했다. 축을 둘로 나눈 뒤에야 이 검사가 성립한다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')

/** 생성 프로젝트의 최소 형태 — 앱 트리 + 백엔드 트리. */
function project(serviceSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'authz-'))
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true })
  fs.mkdirSync(path.join(root, 'backend'), { recursive: true })
  fs.cpSync(path.join(BOILERPLATE, 'src'), path.join(root, 'backend', 'src'), { recursive: true })
  // 저작 마커 사본 — §0 이 하는 것과 같다
  fs.copyFileSync(path.join(BOILERPLATE, 'src', 'serverFn.ts'),
                  path.join(root, 'src', 'services', 'serverFn.ts'))
  for (const f of ['extract.mjs', 'schema.mjs', 'build.mjs', 'package.json', 'tsconfig.json']) {
    fs.copyFileSync(path.join(BOILERPLATE, f), path.join(root, 'backend', f))
  }
  // ESM 은 NODE_PATH 를 보지 않는다 — 실제 해석 경로를 만들어 준다
  fs.symlinkSync(path.join(BOILERPLATE, 'node_modules'), path.join(root, 'node_modules'))
  fs.writeFileSync(path.join(root, 'src', 'services', 'bookings.ts'), serviceSource)
  return root
}

const extract = (root) =>
  spawnSync(process.execPath, ['backend/extract.mjs'], { cwd: root, encoding: 'utf8' })

const BODY = (opts) => `import { serverFn, ServerFnError } from './serverFn'
export const listBranch = serverFn<{ q?: string }, { ok: true }>(async (_input, ctx) => {
  const sdk = ctx.sdk as { dyncol: { list: (c: string, o?: unknown) => Promise<{ items: unknown[] }> } }
  const staff = await sdk.dyncol.list('staff', { filter: { account_id: ctx.accountId } })
  if (!staff.items.length) throw new ServerFnError('권한이 없습니다', 403)
  return { ok: true }
}, ${opts})`

test('본문이 403 을 던지는데 선언이 침묵하면 빌드가 선다', () => {
  const r = extract(project(BODY("{ access: 'member' }")))
  assert.notEqual(r.status, 0, `빌드가 서야 한다\n${r.stdout}${r.stderr}`)
  assert.match(r.stderr, /authz-undeclared/)
})

test('authorizes 를 선언하면 통과한다', () => {
  const r = extract(project(BODY("{ access: 'member', authorizes: true }")))
  assert.equal(r.status, 0, r.stderr)
})

test('인가를 헬퍼로 뽑아도 선언 의무는 남는다', () => {
  const root = project(`import { serverFn } from './serverFn'
import { requireStaff } from './_shared'
export const listBranch = serverFn<{}, { ok: true }>(async (_input, ctx) => {
  await requireStaff(ctx)
  return { ok: true }
}, { access: 'member' })`)
  fs.writeFileSync(path.join(root, 'src', 'services', '_shared.ts'),
    `import { ServerFnError } from './serverFn'
import type { ServerCtx } from './serverFn'
export async function requireStaff(ctx: ServerCtx) {
  const sdk = ctx.sdk as { dyncol: { list: (c: string, o?: unknown) => Promise<{ items: unknown[] }> } }
  const staff = await sdk.dyncol.list('staff', { filter: { account_id: ctx.accountId } })
  if (!staff.items.length) throw new ServerFnError('권한이 없습니다', 403)
}`)
  const r = extract(root)
  assert.notEqual(r.status, 0, `공통화가 은폐가 되면 안 된다\n${r.stdout}${r.stderr}`)
  assert.match(r.stderr, /authz-undeclared/)
})

test('매니페스트가 두 축을 모두 싣는다', () => {
  const root = project(BODY("{ access: 'member', authorizes: true }"))
  assert.equal(extract(root).status, 0)
  const m = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'serverfn-access.json'), 'utf8'))
  assert.deepEqual(m['bookings.listBranch'], { access: 'member', authorizes: true })
})
