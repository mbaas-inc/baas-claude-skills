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

import { readSchema, renderTypes } from '../boilerplate/schema.mjs'

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
