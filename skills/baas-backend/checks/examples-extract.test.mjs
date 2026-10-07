/**
 * 예제는 추출기를 통과해야 한다.
 *
 * 에이전트는 예제와 SKILL.md 의 코드를 그대로 옮겨 쓴다. 그런데 CI 는 예제를 타입 검사만 해서, 예제가
 * 권하는 형태(트랜잭션 안 `increment`, 펼친 `map` 항목)를 추출기가 막아도 아무도 몰랐다 — 에이전트가 예제
 * 그대로 쓴 서버 코드가 빌드에서 멈추고 서버 기능 전체가 꺼졌다(AI Studio Agent Lab 10-04·10-07).
 * 여기서 예제마다 실제 프로젝트 배치로 추출기를 돌려, 예제와 추출기가 다시 어긋나면 이 저장소에서 걸리게 한다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')
const EXAMPLES = path.join(HERE, '..', 'examples')

/** 예제 하나를 프로젝트의 `src/services/` 에 놓고 추출기를 돌린다. 임포트 경로만 프로젝트 형태로 바꾼다. */
function extractExample(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-example-'))
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true })
  fs.cpSync(BOILERPLATE, path.join(root, 'backend'), { recursive: true })
  fs.copyFileSync(path.join(root, 'backend', 'src', 'serverFn.ts'),
    path.join(root, 'src', 'services', 'serverFn.ts'))
  const body = fs.readFileSync(path.join(EXAMPLES, name), 'utf8')
    .replaceAll("'../boilerplate/src/serverFn'", "'./serverFn'")
  fs.writeFileSync(path.join(root, 'src', 'services', name), body)
  const res = spawnSync(process.execPath, [path.join('backend', 'extract.mjs')], { cwd: root, encoding: 'utf8' })
  let grants = null
  try {
    grants = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'service-grants.json'), 'utf8'))
  } catch {
    grants = null
  }
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}`, grants }
}

const examples = fs.readdirSync(EXAMPLES).filter((f) => f.endsWith('.ts'))

test('예제가 하나 이상 있다', () => {
  assert.ok(examples.length > 0)
})

for (const name of examples) {
  test(`${name} 은 추출기를 통과한다`, () => {
    const r = extractExample(name)
    assert.equal(r.status, 0, r.out)
    assert.ok(r.grants && Object.keys(r.grants).length > 0, `grant 가 유도되지 않았다:\n${r.out}`)
  })
}

test('slot-booking: 정원 증가는 update, 예약은 create', () => {
  const r = extractExample('slot-booking.ts')
  assert.deepEqual(r.grants.slots, { update: ['service'] })
  assert.deepEqual(r.grants.reservations, { create: ['service'] })
})

test('order-stock: 펼친 재고 차감까지 update, 주문은 create', () => {
  const r = extractExample('order-stock.ts')
  assert.deepEqual(r.grants.pickup_slots, { update: ['service'] })
  assert.deepEqual(r.grants.menu_stock, { update: ['service'] })
  assert.deepEqual(r.grants.orders, { create: ['service'] })
})
