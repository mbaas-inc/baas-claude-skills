/**
 * `upgrade.mjs` 판정표 검증 — 네 조합과 게이트를 실제로 돌려 본다.
 *
 * 이 스크립트가 지키는 것은 "동작한다"가 아니라 **틀린 쪽으로 기울지 않는다**이다. 골격 갱신은
 * 남의 프로젝트 파일을 덮어쓰는 일이라, 애매할 때 덮는 쪽으로 기울면 사용자 코드가 조용히
 * 사라진다. 그래서 충돌·계약 게이트가 **정말 멈추는지**를 종료 코드로 고정한다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const UPGRADE = path.join(HERE, '..', 'upgrade.mjs')
const EXIT = { OK: 0, ERROR: 1, CONFLICT: 2, CONTRACT: 3 }

/** 정본과 프로젝트를 최소 형태로 만든다 — 실제 골격을 쓰면 테스트가 골격 변경에 흔들린다. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skeleton-'))
  const canon = path.join(root, 'canonical')
  const proj = path.join(root, 'project')
  fs.mkdirSync(path.join(canon, 'src', 'platform'), { recursive: true })
  fs.mkdirSync(path.join(proj, 'backend', 'src', 'platform'), { recursive: true })

  fs.writeFileSync(path.join(canon, 'src', 'serverFn.ts'), 'export const v = 1\n')
  fs.writeFileSync(
    path.join(canon, 'src', 'platform', 'envelope.ts'),
    'export const ENVELOPE_CONTRACT_VERSION = 2\n',
  )
  // 추출기 자리 — 적용 후 검증에 쓰인다. 기본은 성공.
  fs.writeFileSync(path.join(canon, 'extract.mjs'), 'process.exit(0)\n')
  fs.cpSync(canon, path.join(proj, 'backend'), { recursive: true })
  return { root, canon, proj }
}

const run = (proj, canon, ...args) =>
  spawnSync(process.execPath, [UPGRADE, '--project', proj, '--boilerplate', canon, ...args], {
    encoding: 'utf8',
  })

const record = (proj) =>
  JSON.parse(fs.readFileSync(path.join(proj, '.mbaas', 'backend-skeleton.json'), 'utf8'))

const write = (dir, rel, body) => fs.writeFileSync(path.join(dir, rel), body)

test('기존 프로젝트는 현재 상태를 기준선으로 남긴다', () => {
  const { proj, canon } = fixture()
  // 정본과 이미 갈라진 상태 = 업그레이드 경로 도입 이전에 만들어진 프로젝트
  write(path.join(proj, 'backend'), 'src/serverFn.ts', 'export const v = 0\n')
  const r = run(proj, canon, '--check')
  assert.equal(r.status, EXIT.OK, r.stderr)
  assert.match(r.stdout, /기준선/)
  assert.equal(record(proj).sourceLabel, 'baseline-from-disk')
})

test('갓 설치한 프로젝트는 실제 출처를 기록한다', () => {
  const { proj, canon } = fixture()   // fixture 는 정본을 그대로 복사해 둔다
  const r = run(proj, canon, '--check')
  assert.equal(r.status, EXIT.OK, r.stderr)
  assert.match(r.stdout, /골격 기록 생성/)
  assert.notEqual(record(proj).sourceLabel, 'baseline-from-disk')
})

test('installed=disk=canonical — 최신, 할 일 없음', () => {
  const { proj, canon } = fixture()
  run(proj, canon, '--check')
  const r = run(proj, canon, '--check')
  assert.equal(r.status, EXIT.OK)
  assert.match(r.stdout, /골격 최신/)
})

test('installed=disk≠canonical — 뒤처짐, 덮어쓴다', () => {
  const { proj, canon } = fixture()
  run(proj, canon, '--check')
  write(canon, 'src/serverFn.ts', 'export const v = 2\n')

  const checked = run(proj, canon, '--check')
  assert.equal(checked.status, EXIT.OK)
  assert.match(checked.stdout, /갱신 필요 1개/)

  const applied = run(proj, canon, '--apply')
  assert.equal(applied.status, EXIT.OK, applied.stderr)
  assert.equal(
    fs.readFileSync(path.join(proj, 'backend', 'src', 'serverFn.ts'), 'utf8'),
    'export const v = 2\n',
  )
  // 기록이 정본으로 이동했는지 — 여기가 어긋나면 다음 턴이 충돌로 오판한다.
  assert.equal(run(proj, canon, '--check').stdout.includes('골격 최신'), true)
})

test('installed≠disk, disk=canonical — 이미 정본과 같으면 할 일이 없다', () => {
  const { proj, canon } = fixture()
  run(proj, canon, '--check')
  // 정본과 프로젝트가 같은 방향으로 움직인 경우(예: 사람이 손으로 먼저 맞춰 둠)
  write(canon, 'src/serverFn.ts', 'export const v = 9\n')
  write(path.join(proj, 'backend'), 'src/serverFn.ts', 'export const v = 9\n')
  const r = run(proj, canon, '--check')
  assert.equal(r.status, EXIT.OK)
  assert.match(r.stdout, /골격 최신/)
})

test('installed≠disk, installed=canonical — 로컬 수정은 보고만 하고 막지 않는다', () => {
  const { proj, canon } = fixture()
  run(proj, canon, '--check')
  write(path.join(proj, 'backend'), 'src/serverFn.ts', 'export const v = 3\n')
  const r = run(proj, canon, '--check')
  assert.equal(r.status, EXIT.OK)
  assert.match(r.stdout, /로컬에서 수정된/)
  // 덮어쓰지 않았는지 — 사용자 변경을 조용히 지우면 안 된다
  run(proj, canon, '--apply')
  assert.equal(
    fs.readFileSync(path.join(proj, 'backend', 'src', 'serverFn.ts'), 'utf8'),
    'export const v = 3\n',
  )
})

test('양쪽 다 움직이면 충돌로 멈춘다', () => {
  const { proj, canon } = fixture()
  run(proj, canon, '--check')
  write(path.join(proj, 'backend'), 'src/serverFn.ts', 'export const v = 3\n')
  write(canon, 'src/serverFn.ts', 'export const v = 4\n')
  const r = run(proj, canon, '--check')
  assert.equal(r.status, EXIT.CONFLICT, r.stdout)
  assert.match(r.stderr, /골격 충돌/)
  // --apply 로도 뚫리면 안 된다
  assert.equal(run(proj, canon, '--apply').status, EXIT.CONFLICT)
})

test('봉투 계약 버전이 바뀌면 자동 적용하지 않는다', () => {
  const { proj, canon } = fixture()
  run(proj, canon, '--check')
  write(canon, 'src/platform/envelope.ts', 'export const ENVELOPE_CONTRACT_VERSION = 3\n')
  const r = run(proj, canon, '--check')
  assert.equal(r.status, EXIT.CONTRACT, r.stdout)
  assert.match(r.stderr, /2 → 3/)
})

test('적용 후 추출이 실패하면 원래대로 되돌린다', () => {
  const { proj, canon } = fixture()
  run(proj, canon, '--check')
  const before = fs.readFileSync(path.join(proj, 'backend', 'src', 'serverFn.ts'), 'utf8')
  write(canon, 'src/serverFn.ts', 'export const v = 5\n')
  write(canon, 'extract.mjs', 'process.exit(1)\n') // 갱신된 추출기가 깨진 상황

  const r = run(proj, canon, '--apply')
  assert.equal(r.status, EXIT.ERROR)
  assert.match(r.stderr, /되돌렸다/)
  assert.equal(fs.readFileSync(path.join(proj, 'backend', 'src', 'serverFn.ts'), 'utf8'), before)
  // 기록도 옮겨지지 않아야 한다 — 옮겼다면 다음 턴이 "최신"으로 오판한다
  assert.notEqual(record(proj).sourceLabel, 'applied')
  assert.equal(fs.existsSync(path.join(proj, 'backend', 'extract.mjs')), true)
})

test('생성물은 대상이 아니다 — 정본에 없는 파일은 건드리지 않는다', () => {
  const { proj, canon } = fixture()
  fs.mkdirSync(path.join(proj, 'backend', 'src', 'routes'), { recursive: true })
  write(path.join(proj, 'backend'), 'src/routes/orders.ts', '// 생성물\n')
  write(path.join(proj, 'backend'), 'service-grants.json', '{}\n')
  run(proj, canon, '--check')
  write(canon, 'src/serverFn.ts', 'export const v = 7\n')
  assert.equal(run(proj, canon, '--apply').status, EXIT.OK)
  assert.equal(fs.existsSync(path.join(proj, 'backend', 'src', 'routes', 'orders.ts')), true)
  assert.equal(record(proj).files['src/routes/orders.ts'], undefined)
})

test('앱 트리의 저작 마커 사본도 함께 갱신한다', () => {
  const { proj, canon } = fixture()
  fs.mkdirSync(path.join(proj, 'src', 'services'), { recursive: true })
  write(proj, 'src/services/serverFn.ts', 'export const v = 1\n')
  run(proj, canon, '--check')
  write(canon, 'src/serverFn.ts', 'export const v = 8\n')
  assert.equal(run(proj, canon, '--apply').status, EXIT.OK)
  assert.equal(
    fs.readFileSync(path.join(proj, 'src', 'services', 'serverFn.ts'), 'utf8'),
    'export const v = 8\n',
  )
})
