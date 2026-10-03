/**
 * 스키마 선언 → 타입 생성·수렴 (#7).
 *
 * 여기서 고정하는 것은 **두 출처가 생기지 않는가**다. 타입을 손으로 쓰던 시절에는 스키마와
 * 타입이 조용히 갈라졌다 — 반찬가게에서 `status` 를 `'confirmed' | 'cancelled'` 로 썼는데
 * 스키마에는 `picked_up` 이 있었다. 생성이면 그런 어긋남이 구조적으로 불가능하다.
 *
 * 그리고 **조용히 건너뛰지 않는가**를 본다. 선언이 있는데 수렴 수단이 없으면 "코드는 다 됐는데
 * 왜 안 되는지 모르는" 상태가 된다(2026-08-31 실측).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { readSchema, renderNotificationTypes, renderTypes } from '../boilerplate/schema.mjs'

const write = (root, body) => {
  fs.mkdirSync(path.join(root, 'backend'), { recursive: true })
  fs.writeFileSync(path.join(root, 'backend', 'schema.json'),
    typeof body === 'string' ? body : JSON.stringify(body))
  return root
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'schema-'))

const ONE = {
  collections: [{
    name: 'menu_stock', label: '메뉴 재고',
    fields: [
      { name: 'menu_item_id', type: 'string', required: true, unique: true },
      { name: 'remaining', type: 'number', required: true },
      { name: 'prepared', type: 'number' },
    ],
  }],
}

test('선언이 없으면 아무 일도 하지 않는다', () => {
  assert.equal(readSchema(tmp()), null)
})

test('선언을 읽는다', () => {
  const doc = readSchema(write(tmp(), ONE))
  assert.equal(doc.collections[0].name, 'menu_stock')
})

test('깨진 선언은 거부한다', () => {
  assert.throws(() => readSchema(write(tmp(), '{ not json')), /읽을 수 없다/)
  assert.throws(() => readSchema(write(tmp(), { collections: [] })), /비어 있다/)
  assert.throws(() => readSchema(write(tmp(), { collections: [{ fields: [] }] })), /이름 없는/)
  assert.throws(() => readSchema(write(tmp(), { collections: [{ name: 'a' }] })), /fields 가 없다/)
})

test('required 가 아닌 필드는 선택으로 낸다', () => {
  // dyncol 은 "값 없음"을 키 부재로 표현한다 — `| null` 이 아니라 `?:` 여야 맞다.
  const out = renderTypes(ONE)
  assert.match(out, /menu_item_id: string/)
  assert.match(out, /prepared\?: number/)
})

test('컬렉션 이름을 PascalCase 로 바꾼다', () => {
  assert.match(renderTypes(ONE), /export interface MenuStock \{/)
})

test('enum 은 리터럴 유니온으로 낸다', () => {
  // 손으로 쓰면 값 하나가 빠져도 컴파일된다. 생성이면 스키마가 곧 타입이다.
  const out = renderTypes({
    collections: [{ name: 'orders', fields: [
      { name: 'status', type: 'enum', required: true,
        options: { values: ['confirmed', 'cancelled', 'picked_up'] } },
    ] }],
  })
  assert.match(out, /status: "confirmed" \| "cancelled" \| "picked_up"/)
})

test('값 없는 enum 은 never 로 드러낸다', () => {
  // 서버가 그 필드의 모든 쓰기를 거부하는 사용 불가 스키마다. 타입에서 보여야 한다.
  const out = renderTypes({
    collections: [{ name: 'a', fields: [{ name: 'k', type: 'enum', required: true }] }],
  })
  assert.match(out, /k: never/)
})

test('reference 는 대상 레코드 id 다', () => {
  const out = renderTypes({
    collections: [{ name: 'a', fields: [
      { name: 'slot_id', type: 'reference', required: true, options: { collection: 'slots' } },
    ] }],
  })
  assert.match(out, /slot_id: string/)
})

test('date 는 ISO 문자열이다', () => {
  const out = renderTypes({
    collections: [{ name: 'a', fields: [{ name: 'due', type: 'date', required: true }] }],
  })
  assert.match(out, /due: string/)
})

test('array 는 값 목록이 있으면 유니온 배열이다', () => {
  const plain = renderTypes({
    collections: [{ name: 'a', fields: [{ name: 'tags', type: 'array' }] }],
  })
  assert.match(plain, /tags\?: string\[\]/)
  const constrained = renderTypes({
    collections: [{ name: 'a', fields: [
      { name: 'tags', type: 'array', options: { values: ['x', 'y'] } },
    ] }],
  })
  assert.match(constrained, /tags\?: \("x" \| "y"\)\[\]/)
})

test('생성 파일임을 머리에 밝힌다', () => {
  // 직접 고치면 다음 추출에서 덮인다. 그 사실이 파일 안에 있어야 한다.
  const out = renderTypes(ONE)
  assert.match(out, /생성 파일/)
  assert.match(out, /직접 고치지 마라/)
})

test('unique 를 주석으로 남긴다', () => {
  // 타입으로는 표현되지 않지만, 읽는 사람이 알아야 하는 제약이다.
  assert.match(renderTypes(ONE), /menu_item_id: string\s+\/\/ unique/)
})

// ── 관리자 알림 선언 (aiapp-service#884) ─────────────────────────────────────
// 서버도 같은 규칙으로 거절한다. 여기서 먼저 보는 이유는 타입이 틀린 선언으로 만들어지기 전에
// 멈추기 위해서다.

const NOTIFY = {
  key: 'reservation.created', label: '예약 접수', feature: 'reservation',
  fields: ['name', { name: 'people', label: '인원' }],
}
const withNotify = (...notifications) => ({ ...ONE, notifications })

test('알림 선언을 읽는다', () => {
  const doc = readSchema(write(tmp(), withNotify(NOTIFY)))
  assert.equal(doc.notifications[0].key, 'reservation.created')
})

test('알림만 선언해도 된다 — 컬렉션 없는 커스텀 백엔드', () => {
  const doc = readSchema(write(tmp(), { notifications: [NOTIFY] }))
  assert.deepEqual(doc.collections, [])
  assert.equal(renderTypes(doc).includes('interface'), false)
})

test('알림 key 형식을 지킨다', () => {
  for (const key of ['Reservation.created', '.created', '예약', 'a b', 'x'.repeat(65)]) {
    assert.throws(() => readSchema(write(tmp(), withNotify({ ...NOTIFY, key }))), /key 는/)
  }
  for (const key of ['a', 'order-paid', 'reservation.created', 'r_1', 'x'.repeat(64)]) {
    assert.doesNotThrow(() => readSchema(write(tmp(), withNotify({ ...NOTIFY, key }))))
  }
})

test('알림 key 중복을 거부한다', () => {
  assert.throws(() => readSchema(write(tmp(), withNotify(NOTIFY, { ...NOTIFY }))), /중복/)
})

test('label 은 20자 이내이고 주소를 넣을 수 없다', () => {
  // label 은 알림톡 메시지 제목이 된다.
  assert.doesNotThrow(() => readSchema(write(tmp(), withNotify({ ...NOTIFY, label: '가'.repeat(20) }))))
  assert.throws(() => readSchema(write(tmp(), withNotify({ ...NOTIFY, label: '가'.repeat(21) }))), /20자/)
  assert.throws(() => readSchema(write(tmp(), withNotify({ ...NOTIFY, label: 'https://x.kr 예약' }))), /주소/)
  assert.throws(() => readSchema(write(tmp(), withNotify({ ...NOTIFY, label: 'www.x.kr' }))), /주소/)
  assert.throws(() => readSchema(write(tmp(), withNotify({ ...NOTIFY, label: '' }))), /label 이 없다/)
})

test('값 이름 형식·중복·개수·표시 이름 길이를 지킨다', () => {
  const bad = (fields) => readSchema(write(tmp(), withNotify({ ...NOTIFY, fields })))
  assert.throws(() => bad(['이름']), /영문·숫자·밑줄/)
  assert.throws(() => bad(['a-b']), /영문·숫자·밑줄/)
  assert.throws(() => bad([{ label: '이름' }]), /영문·숫자·밑줄/)
  assert.throws(() => bad(['name', { name: 'name', label: '이름' }]), /'name' 이 중복/)
  assert.throws(() => bad(Array.from({ length: 21 }, (_, i) => `f${i}`)), /20개까지/)
  assert.throws(() => bad([{ name: 'memo', label: '가'.repeat(31) }]), /30자/)
  assert.doesNotThrow(() => bad(Array.from({ length: 20 }, (_, i) => `f${i}`)))
})

test('위반을 한 번에 모아 알린다', () => {
  // 하나씩 알리면 고치고 다시 돌리기를 반복하다 규칙 대신 문구를 따라 고치게 된다.
  const err = (() => {
    try {
      readSchema(write(tmp(), withNotify({ key: 'Bad', label: '가'.repeat(21), fields: ['ok', 'no-'] })))
    } catch (e) { return e.message }
  })()
  assert.match(err, /key 는/)
  assert.match(err, /20자/)
  assert.match(err, /'no-'/)
})

test('알림 타입 — 키와 값 이름으로 좁힌다', () => {
  const out = renderNotificationTypes(withNotify(NOTIFY))
  assert.match(out, /생성 파일/)
  assert.match(out, /"reservation\.created": \{/)
  assert.match(out, /\/\*\* 인원 \*\/\s+people: OwnerNotifyValue/)
  assert.match(out, /export type OwnerNotificationKey = keyof OwnerNotifications/)
  assert.match(out, /owner<K extends OwnerNotificationKey>/)
})

test('알림 선언이 없으면 타입 파일을 만들지 않는다', () => {
  assert.equal(renderNotificationTypes(ONE), null)
})
