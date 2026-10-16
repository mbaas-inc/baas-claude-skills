/**
 * 관리 화면 명세(`backend/admin.json`) 검사 — 추출기가 Studio 보다 먼저 막는가.
 *
 * 2026-10-16 실측: 에이전트가 동작 `input` 을 `{ "reply": { "type": "string" } }` 객체로 써서 AI Studio 가
 * 명세 전체를 거부했다. 그런데 그걸 사장님이 관리 화면을 열고서야 알았다. 여기서 고정하는 것:
 *   - 명세 전체가 거부되는 모양 오류(모르는 속성·위젯 type·리스트 자리의 객체·하이픈 동작 이름)
 *   - Studio 가 하는 참조 대조의 핵심(없는 칸·owner 아닌 동작·규칙 컬렉션 직접 쓰기)
 *   - SKILL.md 의 명세 예시가 이 검사를 통과한다(지침과 검사기가 어긋나지 않게)
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { checkAdminSpec } from '../boilerplate/admin-spec.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')
const EXAMPLES = path.join(HERE, '..', 'examples')

const COLLECTIONS = [
  {
    name: 'bookings',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'visit_date', type: 'date' },
      { name: 'status', type: 'enum', options: { values: ['pending', 'approved', 'rejected'] } },
      { name: 'submitted_at', type: 'date' },
      { name: 'slot_id', type: 'string' },
      { name: 'reject_reason', type: 'string' },
    ],
  },
  { name: 'slots', fields: [{ name: 'booked', type: 'number' }] },
  {
    name: 'notices',
    access: { read: 'public', create: 'service', update: 'service', delete: 'service' },
    fields: [
      { name: 'title', type: 'string' },
      { name: 'body', type: 'string' },
      { name: 'published', type: 'boolean' },
    ],
  },
]
const ACCESS = {
  'booking.server.adminApprove': { access: 'owner' },
  'booking.server.adminReject': { access: 'owner' },
  'booking.server.book': { access: 'member' },
}

/** SKILL.md 「명세 — backend/admin.json」 절의 예시. 지침이 보여 주는 그대로 통과해야 한다. */
function skillExample() {
  const md = fs.readFileSync(path.join(HERE, '..', 'SKILL.md'), 'utf8')
  const blocks = [...md.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]).filter((b) => b.includes('"menu"'))
  assert.equal(blocks.length, 1, 'SKILL.md 에 admin.json 예시가 하나 있어야 한다')
  return JSON.parse(blocks[0])
}

const check = (spec, opts = {}) =>
  checkAdminSpec(JSON.stringify(spec), { collections: COLLECTIONS, access: ACCESS, ...opts }).errors

const listOf = (spec) => spec.pages.bookings.widgets[1]

test('SKILL.md 의 명세 예시는 검사를 통과한다', () => {
  assert.deepEqual(check(skillExample()), [])
})

test('동작 input 을 객체로 쓰면 리스트여야 한다고 알린다 (E2E 실측 오류)', () => {
  const spec = skillExample()
  listOf(spec).actions[1].input = { reason: { type: 'string', label: '거절 사유' } }
  const errors = check(spec)
  assert.equal(errors.length, 1, errors.join('\n'))
  assert.match(errors[0], /pages\.bookings\.widgets\[1\]\.actions\[1\]\.input: 리스트이어야 합니다/)
  assert.match(errors[0], /\[\{ "name", "label", "type", "options", "required" \}\]/)
})

test('모르는 위젯 type·속성·input type 을 거부한다', () => {
  const spec = skillExample()
  spec.pages.bookings.widgets.push({ type: 'calendar', collection: 'bookings' })
  listOf(spec).colour = 'red'
  listOf(spec).actions[1].input[0].type = 'string'
  const errors = check(spec).join('\n')
  assert.match(errors, /알 수 없는 type 'calendar'/)
  assert.match(errors, /widgets\[1\]\.colour: 모르는 속성입니다/)
  assert.match(errors, /'string' 는 쓸 수 없습니다 — 쓸 수 있는 것: text, textarea, richtext/)
})

test('하이픈이 든 동작 이름은 형식 오류다 (관리 화면이 부를 수 없다)', () => {
  const spec = skillExample()
  listOf(spec).actions[0].call = 'owner-actions.adminApprove'
  assert.match(check(spec).join('\n'), /'owner-actions\.adminApprove' 가 형식에 맞지 않습니다 — '<파일>\.<export>'/)
})

test('없는 컬렉션·칸을 알린다', () => {
  const spec = skillExample()
  listOf(spec).columns.push('phone')
  spec.labels.ghosts = { x: '유령' }
  const errors = check(spec).join('\n')
  assert.match(errors, /pages\.bookings\.widgets\[1\]\(list\)\.columns: 없는 칸 'phone'/)
  assert.match(errors, /labels\.ghosts: schema\.json 에 없는 컬렉션 'ghosts'/)
})

test('동작은 매니페스트의 access:owner 함수만 부른다', () => {
  const spec = skillExample()
  listOf(spec).actions[0].call = 'booking.server.book'
  listOf(spec).actions[1].call = 'booking.server.missing'
  const errors = check(spec).join('\n')
  assert.match(errors, /동작 'booking\.server\.book' 은 access 'member' 입니다/)
  assert.match(errors, /동작 'booking\.server\.missing' 의 serverFn 이 없습니다/)
})

test('규칙 컬렉션(service)을 직접 쓰기로 열면 막고, owner_content 면 허용한다', () => {
  const spec = {
    version: 1,
    title: '공지',
    labels: { notices: { title: '제목', body: '본문', published: '공개' } },
    formats: { notices: { body: 'markdown' } },
    menu: ['notices'],
    pages: {
      notices: {
        title: '공지',
        widgets: [{ type: 'list', collection: 'notices', columns: ['title', 'published'], editable: ['published'], create: { form: 'notice' } }],
      },
    },
    forms: { notice: { collection: 'notices', fields: ['title', { name: 'body', ui: 'richtext' }, 'published'] } },
  }
  const errors = check(spec).join('\n')
  assert.match(errors, /'notices' 의 create 는 규칙이 걸린\(service\) 연산이라 관리 화면이 직접 쓸 수 없습니다/)
  assert.match(errors, /'notices' 의 update 는 규칙이 걸린\(service\)/)
  assert.deepEqual(check({ ...spec, owner_content: ['notices'] }), [])
})

test('코드가 유도한 service 연산도 규칙 컬렉션으로 본다', () => {
  const spec = skillExample()
  listOf(spec).editable = ['status']
  assert.deepEqual(check(spec), [])
  const errors = check(spec, { serviceOps: new Map([['bookings', new Set(['read', 'update'])]]) })
  assert.match(errors.join('\n'), /'bookings' 의 update 는 규칙이 걸린\(service\)/)
})

test('서식 편집기·markdown 은 글자 칸에만', () => {
  const spec = skillExample()
  spec.formats.bookings.visit_date = 'markdown'
  assert.match(check(spec).join('\n'), /formats\.bookings\.visit_date: markdown 형식은 글자\(string\) 칸에만 씁니다/)
})

test('schema.json 이 없으면 컬렉션 대조를 건너뛰고 모양·동작만 본다', () => {
  const spec = skillExample()
  listOf(spec).columns.push('phone')
  assert.deepEqual(checkAdminSpec(JSON.stringify(spec), { collections: null, access: ACCESS }).errors, [])
  assert.match(checkAdminSpec('{', {}).errors[0], /JSON 형식이 아닙니다/)
})

// ── 추출기에 묶였는가 ─────────────────────────────────────────────────────

/** 예제 serverFn + schema.json + admin.json 을 가진 프로젝트를 만들고 추출기를 돌린다. */
function extractProject({ spec, withService = true }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-spec-'))
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true })
  fs.cpSync(BOILERPLATE, path.join(root, 'backend'), { recursive: true })
  if (withService) {
    fs.copyFileSync(path.join(root, 'backend', 'src', 'serverFn.ts'), path.join(root, 'src', 'services', 'serverFn.ts'))
    const body = fs.readFileSync(path.join(EXAMPLES, 'booking.server.ts'), 'utf8')
      .replaceAll("'../boilerplate/src/serverFn'", "'./serverFn'")
    fs.writeFileSync(path.join(root, 'src', 'services', 'booking.server.ts'), body)
  }
  fs.writeFileSync(path.join(root, 'backend', 'schema.json'), JSON.stringify({ collections: COLLECTIONS }))
  fs.writeFileSync(path.join(root, 'backend', 'admin.json'), JSON.stringify(spec))
  // schema.json 이 있으면 추출기가 `baas collection converge` 를 부른다 — 네트워크 없이 성공하는 대역을 둔다.
  const bin = path.join(root, 'fake-bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'baas'), '#!/bin/sh\necho "converge: no changes"\n', { mode: 0o755 })
  const res = spawnSync(process.execPath, [path.join('backend', 'extract.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  })
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

test('추출기: 잘못된 명세면 빌드를 세우고, 고치면 통과한다', () => {
  const bad = skillExample()
  listOf(bad).actions[1].input = { reason: { type: 'textarea' } }
  const failed = extractProject({ spec: bad })
  assert.equal(failed.status, 1, failed.out)
  assert.match(failed.out, /관리 화면 명세\(backend\/admin\.json\) 오류 — 빌드를 중단한다/)
  assert.match(failed.out, /input: 리스트이어야 합니다/)

  const ok = extractProject({ spec: skillExample() })
  assert.equal(ok.status, 0, ok.out)
  assert.match(ok.out, /관리 화면 명세 확인 → backend\/admin\.json/)
})

test('추출기: serverFn 이 없는데 명세가 동작을 부르면 그 이름이 없다고 막는다', () => {
  const r = extractProject({ spec: skillExample(), withService: false })
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /동작 'booking\.server\.adminApprove' 의 serverFn 이 없습니다/)
})
