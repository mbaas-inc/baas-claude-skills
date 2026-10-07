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
