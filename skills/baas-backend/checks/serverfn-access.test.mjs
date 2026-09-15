/**
 * `serverFn` 접근 선언 (#86 후속).
 *
 * 「공개로 열어 둔 것」과 「검사를 잊은 것」은 코드에서 **똑같이 생겼다.** 그래서 도구가
 * 추론할 수 없고 사람이 읽어도 의도를 모른다. 반찬가게는 9개 함수에 같은 판정을 8번 손으로
 * 썼는데(로그인 3 · 소유자 5), 그중 하나를 빠뜨렸어도 아무도 몰랐을 것이다.
 *
 * 그래서 **침묵을 허용하지 않는다.** 여기서 고정하는 것은 선언이 없으면 빌드가 서는가,
 * 그리고 선언이 라우트까지 실려 **실제로 막히는가**다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')

function extract(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'access-'))
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true })
  fs.cpSync(BOILERPLATE, path.join(root, 'backend'), { recursive: true })
  fs.copyFileSync(path.join(root, 'backend', 'src', 'serverFn.ts'),
    path.join(root, 'src', 'services', 'serverFn.ts'))
  for (const [rel, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, 'src', 'services', rel), body)
  }
  const res = spawnSync(process.execPath, [path.join('backend', 'extract.mjs')],
    { cwd: root, encoding: 'utf8' })
  const read = (p) => {
    try {
      return fs.readFileSync(path.join(root, 'backend', p), 'utf8')
    } catch {
      return null
    }
  }
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    manifest: read('serverfn-access.json') && JSON.parse(read('serverfn-access.json')),
    route: read(path.join('src', 'routes', 'shop.ts')),
  }
}

const fn = (name, access) =>
  `export const ${name} = serverFn<undefined, { ok: boolean }>(async () => ({ ok: true })` +
  (access ? `, { access: '${access}' })` : ')')

const mod = (...bodies) => `import { serverFn } from './serverFn'\n${bodies.join('\n')}`

test('선언이 없으면 빌드가 선다', () => {
  // 가장 중요한 성질이다. 경고면 에이전트가 무시하게 되고, 추론이면 공개와 구별할 수 없다.
  const r = extract({ 'shop.ts': mod(fn('forgotten')) })
  assert.notEqual(r.status, 0)
  assert.match(r.out, /missing-access/)
  assert.match(r.out, /forgotten/)
})

test('네 값을 모두 받는다', () => {
  const r = extract({
    'shop.ts': mod(
      fn('menu', 'public'), fn('order', 'member'),
      fn('settle', 'owner'), fn('staffOnly', 'custom')),
  })
  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.manifest, {
    'shop.menu': 'public', 'shop.order': 'member',
    'shop.settle': 'owner', 'shop.staffOnly': 'custom',
  })
})

test('모르는 값은 거부한다', () => {
  // 오타(`'members'`)가 조용히 통과하면 의도와 다른 수준으로 열린다.
  const r = extract({ 'shop.ts': mod(fn('x', 'members')) })
  assert.notEqual(r.status, 0)
  assert.match(r.out, /missing-access/)
})

test('정적으로 못 읽는 선언은 거부한다', () => {
  // 변수로 넘기면 빌드 시점에 무엇인지 알 수 없다 — 라우트에 실을 값이 없다.
  const r = extract({
    'shop.ts': `import { serverFn } from './serverFn'
const level = 'member' as const
export const x = serverFn<undefined, { ok: boolean }>(async () => ({ ok: true }), { access: level })`,
  })
  assert.notEqual(r.status, 0)
  assert.match(r.out, /missing-access/)
})

test('선언이 라우트까지 실린다', () => {
  // 매니페스트만 맞고 라우트에 안 실리면 아무것도 막히지 않는다.
  const r = extract({ 'shop.ts': mod(fn('order', 'member')) })
  assert.equal(r.status, 0, r.out)
  assert.match(r.route, /runServerFn\(order, c, 'member'\)/)
})

test('공개 함수를 출력에 밝힌다', () => {
  // "비로그인이 부를 수 있는 게 뭐지?" 는 검토 때마다 나오는 질문이다.
  const r = extract({ 'shop.ts': mod(fn('menu', 'public'), fn('order', 'member')) })
  assert.match(r.out, /비로그인 호출 가능: shop\.menu/)
  assert.doesNotMatch(r.out, /shop\.order.*비로그인/)
})
