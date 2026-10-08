/**
 * 추출기가 `dyncol.transaction([...])` 항목마다 grant 를 유도하는가.
 *
 * SKILL.md 「transaction」 절과 `examples/slot-booking.ts` 는 정원 차감을 트랜잭션 안의
 * `op: 'increment'` 로 쓰라고 권한다. 그런데 추출기의 항목 op 표에 `increment` 가 빠져 있어서
 * 권한 대로 쓰면 `dynamic-transaction` 으로 빌드가 멈췄다. 문구는 「op·collection 을 문자열
 * 리터럴로 쓴다」였다 — 이미 리터럴로 썼으므로 원인을 찾을 수 없었고, 서버 번들이 빈 채로
 * 예약 조회·신청·관리자 기능 전체가 꺼졌다(AI Studio Agent Lab 2026-10-07, 10-04 에도 같은 증상).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')

/** 최소 프로젝트를 만들고 추출기를 돌린다. 반환: { grants, status, out } */
function extract(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-txn-'))
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true })
  fs.cpSync(BOILERPLATE, path.join(root, 'backend'), { recursive: true })
  fs.copyFileSync(path.join(root, 'backend', 'src', 'serverFn.ts'),
    path.join(root, 'src', 'services', 'serverFn.ts'))
  fs.writeFileSync(path.join(root, 'src', 'services', 'booking.ts'),
    `import { serverFn } from './serverFn'\n${body}`)
  const res = spawnSync(process.execPath, [path.join('backend', 'extract.mjs')],
    { cwd: root, encoding: 'utf8' })
  let grants = null
  try {
    grants = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'service-grants.json'), 'utf8'))
  } catch {
    grants = null
  }
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}`, grants }
}

const book = (items) => `
export const book = serverFn<undefined, { ok: boolean }>(async (_i, ctx) => {
  await (ctx.sdk as any).dyncol.transaction([
${items}
  ])
  return { ok: true }
}, { access: 'member' })`

test('트랜잭션 안의 increment 는 update grant 다 — 스킬이 권하는 정원 차감', () => {
  const r = extract(book(`
    { op: 'increment', collection: 'slots', target: { filter: { slot_id: 's1' } }, field: 'booked', by: 1, label: 'slot' },
    { op: 'create', collection: 'bookings', data: { slot_id: 's1' }, label: 'booking' },`))

  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.slots, { update: ['service'] })
  assert.deepEqual(r.grants.bookings, { create: ['service'] })
})

test('트랜잭션 항목 네 가지 op 가 각각 grant 를 낸다', () => {
  const r = extract(book(`
    { op: 'create', collection: 'a', data: {} },
    { op: 'update', collection: 'b', id: '1', data: {} },
    { op: 'delete', collection: 'c', id: '1' },
    { op: 'increment', collection: 'd', target: { id: '1' }, field: 'n', by: -1 },`))

  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.a, { create: ['service'] })
  assert.deepEqual(r.grants.b, { update: ['service'] })
  assert.deepEqual(r.grants.c, { delete: ['service'] })
  assert.deepEqual(r.grants.d, { update: ['service'] })
})

test('모르는 op 는 계속 막되, 리터럴을 탓하지 않고 지원 op 를 알려 준다', () => {
  const r = extract(book(`
    { op: 'upsert', collection: 'a', data: {} },`))

  assert.notEqual(r.status, 0)
  assert.match(r.out, /dynamic-transaction/)
  assert.match(r.out, /upsert/)
  assert.match(r.out, /create·update·delete·increment/)
})

// ── 항목 수가 정해지지 않은 트랜잭션 — SKILL.md 「트랜잭션」 절의 주문·재고 차감 형태 ──
// `...lines.map((l) => ({ op: 'increment' as const, collection: 'menu_stock', … }))` 는 op·collection 이
// 콜백이 돌려주는 객체 리터럴에 그대로 적혀 있어 정적으로 권한을 유도할 수 있다. 그런데 추출기가 펼치기를
// 「객체 리터럴이 아니다」로 막아 스킬이 권하는 주문 코드가 빌드에서 멈췄다(2026-10-07 확인).

const order = (items) => `
export const order = serverFn<{ lines: { menuItemId: string; quantity: number }[] }, { ok: boolean }>(
  async (input, ctx) => {
    const lines = input.lines
    await (ctx.sdk as any).dyncol.transaction([
${items}
    ])
    return { ok: true }
  }, { access: 'member' })`

test('펼친 map 이 돌려주는 객체 리터럴에서 grant 를 유도한다 — as const 포함', () => {
  const r = extract(order(`
      ...lines.map((l) => ({
        op: 'increment' as const, collection: 'menu_stock',
        target: { filter: { menu_item_id: l.menuItemId } }, field: 'remaining', by: -l.quantity,
        guard: { remaining: { gte: 0 } }, label: \`stock:\${l.menuItemId}\`,
      })),
      { op: 'create' as const, collection: 'orders', data: {}, label: 'order' },`))

  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.menu_stock, { update: ['service'] })
  assert.deepEqual(r.grants.orders, { create: ['service'] })
})

test('블록 본문 콜백도 모든 return 이 객체 리터럴이면 읽는다', () => {
  const r = extract(order(`
      ...lines.map((l) => {
        const by = -l.quantity
        return { op: 'increment' as const, collection: 'menu_stock', target: { id: l.menuItemId }, field: 'remaining', by }
      }),`))

  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.menu_stock, { update: ['service'] })
})

test('satisfies 로 감싼 항목도 읽는다', () => {
  const r = extract(book(`
    { op: 'delete', collection: 'holds', id: 'h1' } satisfies { op: string },`))

  assert.equal(r.status, 0, r.out)
  assert.deepEqual(r.grants.holds, { delete: ['service'] })
})

test('항목을 볼 수 없는 펼치기는 계속 막고 쓸 수 있는 형태를 알려 준다', () => {
  const r = extract(order(`
      ...(lines as any[]),`))

  assert.notEqual(r.status, 0)
  assert.match(r.out, /dynamic-transaction/)
  assert.match(r.out, /\.map/)
})

test('map 콜백 안에서도 컬렉션 이름이 동적이면 막는다', () => {
  const r = extract(order(`
      ...lines.map((l) => ({ op: 'increment' as const, collection: l.menuItemId, target: { id: 'x' }, field: 'n', by: 1 })),`))

  assert.notEqual(r.status, 0)
  assert.match(r.out, /op·collection 을 문자열 리터럴/)
})
