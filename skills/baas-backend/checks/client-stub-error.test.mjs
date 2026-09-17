/**
 * 생성된 클라이언트 스텁이 **실패의 상태 코드를 속성으로** 들고 오는가 (2026-09-17).
 *
 * 고치기 전에는 `throw new Error(\`${path} 실패: ${res.status}\`)` 라 상태가 **메시지
 * 문자열에만** 있었다. 그런데 스킬 계약표는 "상태코드 보존 + `{ error: message }`" 를
 * 약속하고, `SdkError` 주석은 "메시지 문자열을 파싱해 분기하지 말라" 고 못박는다.
 * 서버는 약속을 지키는데 **같은 스킬이 만드는 생성물이 그것을 버리고 있었다.**
 *
 * 실측된 결과: 생성된 앱의 관리자 화면이 `error.status` 로 403 을 판정했는데 그 속성이
 * 없어 분기가 **한 번도 참이 되지 않았고**, 소유자 진입 버튼이 코드에 있는데도 도달
 * 불가였다(`p-cb604a27`). 타입체크·린트는 둘 다 통과했다 — 문자열 안의 상태 코드는
 * 타입 시스템에 보이지 않는다.
 *
 * 파급은 403 하나가 아니다. 409(중복·정원)도 같이 죽어 **선착순 마감이 서버 장애와
 * 같은 화면**이 된다. 보일러플레이트는 프로젝트로 복사된 뒤 자동 갱신되지 않으므로,
 * 여기서 새면 이후 생성되는 모든 프로젝트에 박힌다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const BOILERPLATE = path.join(HERE, '..', 'boilerplate')

/** 최소 프로젝트에서 추출기를 돌리고 생성된 클라이언트 스텁 본문을 돌려준다. */
function clientStub() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-err-'))
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true })
  fs.cpSync(BOILERPLATE, path.join(root, 'backend'), { recursive: true })
  fs.copyFileSync(path.join(root, 'backend', 'src', 'serverFn.ts'),
    path.join(root, 'src', 'services', 'serverFn.ts'))
  fs.writeFileSync(path.join(root, 'src', 'services', 'demo.ts'),
    `import { serverFn } from './serverFn'\n\n` +
    `export const ping = serverFn(async () => ({ ok: true }), { access: 'public' })\n`)
  const res = spawnSync(process.execPath, [path.join('backend', 'extract.mjs')],
    { cwd: root, encoding: 'utf8' })
  const file = path.join(root, 'src', 'services', 'demo.client.ts')
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    body: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '',
  }
}

test('실패 에러에 status 가 **속성으로** 실린다', () => {
  const { status, body, out } = clientStub()
  assert.equal(status, 0, `추출 실패:\n${out}`)
  assert.match(body, /readonly status: number/,
    '생성 스텁의 에러 클래스에 status 속성이 없다 — 화면이 403·401·409 를 구분할 수 없다')
  assert.match(body, /throw new ServerFnCallError\(/,
    '생성 스텁이 구조화된 에러를 던지지 않는다')
})

test('상태 코드를 메시지 문자열에만 담지 않는다', () => {
  const { body } = clientStub()
  // `throw new Error(...)` 로 끝나면 화면이 문구를 파싱할 수밖에 없다.
  assert.doesNotMatch(body, /throw new Error\(`\$\{path\} 실패/,
    '상태가 메시지 문자열에만 있다 — 문구가 바뀌면 화면 분기가 조용히 깨진다')
})

test('실패 본문의 `{ error: message }` 를 읽는다', () => {
  const { body } = clientStub()
  assert.match(body, /payload\.error/,
    '계약표가 약속한 `{ error: message }` 를 스텁이 버리고 있다')
})
