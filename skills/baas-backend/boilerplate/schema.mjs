/**
 * 컬렉션 스키마 — 선언에서 서버와 타입을 함께 만든다.
 *
 * ## 왜 선언인가
 *
 * 지금까지 컬렉션은 `baas collection create` 를 **하나씩 쳐서** 만들었고, 그 결과가 **서버에만**
 * 남았다. 그래서 셋이 따라온다:
 *
 *   1. 빠뜨려도 **아무 신호가 없다**. 2026-09-14 실측: 서버 로직은 완벽한데 컬렉션이 미생성이라
 *      런타임에야 드러났다. 명령형은 빠뜨림이 드러나지 않는다
 *   2. PR diff 에 안 보이고 `git revert` 로 돌아오지 않는다
 *   3. TS 타입을 손으로 또 쓴다 — 스키마와 타입이 **두 출처**가 된다
 *
 * `backend/schema.json` 하나를 정본으로 두고, 거기서 서버 상태와 TS 타입을 **둘 다** 만든다.
 *
 * ## 왜 유도하지 않고 사람이 쓰는가
 *
 * `service-grants.json`·`secret-names.json` 은 코드에서 **유도**한다 — `dyncol.create()` 를
 * 부르면 create 권한이 필연적으로 필요하므로 코드가 진실이다.
 *
 * 스키마는 다르다. `remaining` 이 `required` 인지, `menu_item_id` 가 `unique` 인지, 접근이
 * `service` 인지는 **코드를 봐서 알 수 없는 설계 결정**이고 TS 타입으로도 표현되지 않는다.
 * 그래서 선언이 정본이고 타입이 그 결과다 — 방향이 반대면 표현할 수 없는 것들이 생긴다.
 *
 * ## 관리자 알림(`notifications`)도 같은 파일이다
 *
 * 「예약이 생기면 알려 줘」의 키·제목·값 이름도 코드를 봐서 알 수 없는 설계 결정이다. 그래서
 * 컬렉션과 같은 자리에 선언하고, 같은 수렴으로 서버에 올리고, 같은 방식으로 타입을 만든다 —
 * `notify.owner('오타')` 가 런타임 404 가 아니라 컴파일 에러가 되게 하려는 것이다.
 *
 * 검증은 서버 규칙을 **미리** 본다. 서버도 같은 규칙으로 거절하지만, 그때는 수렴 단계에서야
 * 드러나고 타입은 이미 틀린 선언으로 만들어진 뒤다.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** dyncol 필드 타입 → TS. `date` 는 ISO 문자열, `reference` 는 대상 레코드 id 다. */
const TS_SCALAR = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'string',
  reference: 'string',
}

/** `menu_stock` → `MenuStock`. 생성 타입 이름이 컬렉션과 1:1 로 보이게 한다. */
function pascal(name) {
  return name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

function tsType(field) {
  const type = String(field.type || '').toLowerCase()
  if (type === 'enum') {
    const values = field.options?.values
    // values 없는 enum 은 서버가 모든 쓰기를 거부하는 사용 불가 스키마다. 타입에서도 드러낸다.
    if (!Array.isArray(values) || values.length === 0) return 'never'
    return values.map((v) => JSON.stringify(String(v))).join(' | ')
  }
  if (type === 'array') {
    const values = field.options?.values
    return Array.isArray(values) && values.length > 0
      ? `(${values.map((v) => JSON.stringify(String(v))).join(' | ')})[]`
      : 'string[]'
  }
  return TS_SCALAR[type] ?? 'unknown'
}

/**
 * 선언에서 TS 인터페이스를 만든다.
 *
 * `required` 가 아닌 필드는 `?:` 로 낸다 — 레코드에 키가 아예 없을 수 있기 때문이다(서버는
 * 미입력을 유일성 대상에서도 빼는 것과 같은 관례를 쓴다). `| null` 을 붙이지 않는 이유는
 * dyncol 이 "값 없음"을 키 부재로 표현하지 널로 채우지 않기 때문이다.
 */
export function renderTypes(doc) {
  const lines = [
    '// 생성 파일 — `node backend/extract.mjs` 가 `backend/schema.json` 에서 만든다.',
    '// **직접 고치지 마라.** 다음 추출에서 덮인다. 필드를 바꾸려면 schema.json 을 고친다.',
    '',
  ]
  for (const coll of doc.collections ?? []) {
    const label = coll.label ? ` — ${coll.label}` : ''
    lines.push(`/** \`${coll.name}\`${label} */`)
    lines.push(`export interface ${pascal(coll.name)} {`)
    for (const field of coll.fields ?? []) {
      const optional = field.required === true ? '' : '?'
      const note = field.unique === true ? '  // unique' : ''
      lines.push(`  ${field.name}${optional}: ${tsType(field)}${note}`)
    }
    lines.push('}')
    lines.push('')
  }
  return lines.join('\n')
}

export function readSchema(root) {
  const file = path.join(root, 'backend', 'schema.json')
  if (!fs.existsSync(file)) return null
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`backend/schema.json 을 읽을 수 없다: ${error.message}`)
  }
  if (doc.collections !== undefined && !Array.isArray(doc.collections)) {
    throw new Error('backend/schema.json 의 collections 는 배열이어야 한다')
  }
  if (doc.notifications !== undefined && !Array.isArray(doc.notifications)) {
    throw new Error('backend/schema.json 의 notifications 는 배열이어야 한다')
  }
  doc.collections = doc.collections ?? []
  // 알림만 선언한 프로젝트도 있다(네이티브 예약 + 커스텀 백엔드의 알림). 둘 다 비었을 때만 거절한다.
  if (doc.collections.length === 0 && (doc.notifications ?? []).length === 0) {
    throw new Error('backend/schema.json 의 collections 가 비어 있다')
  }
  for (const coll of doc.collections) {
    if (!coll.name) throw new Error('backend/schema.json: 이름 없는 컬렉션이 있다')
    if (!Array.isArray(coll.fields)) {
      throw new Error(`backend/schema.json: '${coll.name}' 에 fields 가 없다`)
    }
  }
  if (doc.notifications !== undefined) validateNotifications(doc.notifications)
  return doc
}

// ── 관리자 알림 선언 ────────────────────────────────────────────────────────
// 서버(aiapp-service `PUT /back/notifications/declarations`)와 같은 규칙이다. 한쪽만 고치면
// 로컬은 통과하고 수렴에서 거절되거나, 그 반대로 서버가 받는 선언을 여기서 막는다.

/** `reservation.created` 처럼 점·하이픈·밑줄로 나눈 소문자. 64자까지. */
const NOTIFY_KEY = /^[a-z0-9][a-z0-9_.-]{0,63}$/
/** 값 이름 — 코드에서 객체 키로 쓰므로 식별자에 가까운 문자만. */
const NOTIFY_FIELD = /^[A-Za-z0-9_]{1,64}$/
/** 제목에 주소를 넣지 못하게 한다. 제목은 알림톡 메시지 제목이 되고, 그 자리의 링크는 심사에서 막힌다. */
const URL_LIKE = /https?:\/\/|www\./i
const NOTIFY_LABEL_MAX = 20
const NOTIFY_FIELD_LABEL_MAX = 30
const NOTIFY_FIELDS_MAX = 20

/** 값 하나를 `{ name, label }` 로 맞춘다. 문자열만 쓰면 이름이 곧 표시 이름이다. */
function normalizeNotifyField(field) {
  if (typeof field === 'string') return { name: field, label: undefined }
  if (field && typeof field === 'object') return { name: field.name, label: field.label }
  return { name: undefined, label: undefined }
}

/**
 * 알림 선언 검증. 첫 위반에서 멈추지 않고 **전부 모아** 한 번에 알린다 — 하나 고치고 다시
 * 돌리기를 반복하게 하면 에이전트가 규칙 대신 오류 문구를 따라 고치게 된다.
 */
export function validateNotifications(list) {
  const errors = []
  const keys = new Set()
  list.forEach((n, i) => {
    const where = n && typeof n.key === 'string' ? `'${n.key}'` : `${i + 1}번째 알림`
    if (!n || typeof n !== 'object') {
      errors.push(`${where}: 객체여야 한다`)
      return
    }
    if (typeof n.key !== 'string' || !NOTIFY_KEY.test(n.key)) {
      errors.push(`${where}: key 는 소문자·숫자로 시작하고 소문자·숫자·. _ - 만 쓴다(64자 이내, 예: reservation.created)`)
    } else if (keys.has(n.key)) {
      errors.push(`${where}: key 가 중복이다`)
    } else {
      keys.add(n.key)
    }
    if (typeof n.label !== 'string' || n.label.trim() === '') {
      errors.push(`${where}: label 이 없다 — 소유자가 보는 알림 제목이다`)
    } else {
      if ([...n.label].length > NOTIFY_LABEL_MAX) {
        errors.push(`${where}: label 은 ${NOTIFY_LABEL_MAX}자 이내다(알림톡 제목이 된다)`)
      }
      if (URL_LIKE.test(n.label)) errors.push(`${where}: label 에 주소(URL)를 넣을 수 없다`)
    }
    if (n.feature !== undefined && typeof n.feature !== 'string') {
      errors.push(`${where}: feature 는 문자열이다`)
    }
    const fields = n.fields ?? []
    if (!Array.isArray(fields)) {
      errors.push(`${where}: fields 는 배열이다`)
      return
    }
    if (fields.length > NOTIFY_FIELDS_MAX) {
      errors.push(`${where}: fields 는 ${NOTIFY_FIELDS_MAX}개까지다`)
    }
    const names = new Set()
    for (const raw of fields) {
      const { name, label } = normalizeNotifyField(raw)
      if (typeof name !== 'string' || !NOTIFY_FIELD.test(name)) {
        errors.push(`${where}: 값 이름 '${name ?? ''}' 은 영문·숫자·밑줄만 쓴다(64자 이내)`)
        continue
      }
      if (names.has(name)) errors.push(`${where}: 값 이름 '${name}' 이 중복이다`)
      names.add(name)
      if (label !== undefined) {
        if (typeof label !== 'string') errors.push(`${where}: '${name}' 의 label 은 문자열이다`)
        else if ([...label].length > NOTIFY_FIELD_LABEL_MAX) {
          errors.push(`${where}: '${name}' 의 label 은 ${NOTIFY_FIELD_LABEL_MAX}자 이내다`)
        }
      }
    }
  })
  if (errors.length > 0) {
    throw new Error(`backend/schema.json 의 notifications 가 잘못됐다:\n  - ${errors.join('\n  - ')}`)
  }
}

/**
 * 알림 선언에서 TS 타입을 만든다. 선언이 없으면 `null` — 파일을 만들지 않는다.
 *
 * 앱 트리(`src/services/`)는 백엔드 SDK 타입을 임포트할 수 없어 `ctx.sdk` 를 좁혀 쓴다. 그 좁힐
 * 모양을 **선언에서** 만들어 두면 키 오타와 값 이름 오타가 둘 다 컴파일 에러가 된다. 결과 타입은
 * `platform/sdk.ts` 의 `OwnerNotifyResult` 와 같은 모양이다(같은 이유로 복제한다).
 *
 * 값은 전부 **필수**로 낸다. 선언한 값을 빠뜨리면 소유자가 빈칸이 있는 알림을 받는데, 그건
 * 실패로 보이지 않아 아무도 고치지 않는다. 정말 없으면 `null` 을 명시한다.
 */
export function renderNotificationTypes(doc) {
  const list = doc.notifications ?? []
  if (list.length === 0) return null
  const lines = [
    '// 생성 파일 — `node backend/extract.mjs` 가 `backend/schema.json` 의 notifications 에서 만든다.',
    '// **직접 고치지 마라.** 다음 추출에서 덮인다. 알림을 바꾸려면 schema.json 을 고친다.',
    '',
    "export type OwnerNotifyStatus = 'sent' | 'failed' | 'skipped' | 'disabled' | 'limited'",
    '/** 사람이 읽을 문자열로 보낸다(`4` 가 아니라 `"4명"`). 서버는 URL 을 지우고 200자로 자른다. */',
    'export type OwnerNotifyValue = string | number | boolean | null',
    'export interface OwnerNotifyResult {',
    '  result: OwnerNotifyStatus',
    '  log_id?: number',
    '  error?: { status?: number; message: string }',
    '}',
    '',
    '/** 선언된 알림 키 → 값 이름. */',
    'export interface OwnerNotifications {',
  ]
  for (const n of list) {
    const feature = n.feature ? ` (${n.feature})` : ''
    lines.push(`  /** ${n.label}${feature} */`)
    const fields = (n.fields ?? []).map(normalizeNotifyField)
    if (fields.length === 0) {
      lines.push(`  ${JSON.stringify(n.key)}: Record<string, never>`)
      continue
    }
    lines.push(`  ${JSON.stringify(n.key)}: {`)
    for (const f of fields) {
      if (f.label) lines.push(`    /** ${f.label} */`)
      lines.push(`    ${f.name}: OwnerNotifyValue`)
    }
    lines.push('  }')
  }
  lines.push(
    '}',
    '',
    'export type OwnerNotificationKey = keyof OwnerNotifications',
    '',
    '/** `ctx.sdk` 를 좁힐 때 섞어 쓴다: `ctx.sdk as MySdk & OwnerNotifySdk` */',
    'export interface OwnerNotifySdk {',
    '  notify: {',
    '    owner<K extends OwnerNotificationKey>(',
    '      key: K, values: OwnerNotifications[K],',
    '    ): Promise<OwnerNotifyResult>',
    '  }',
    '}',
    '',
  )
  return lines.join('\n')
}

/**
 * 선언대로 서버를 맞춘다. **조용히 건너뛰지 않는다.**
 *
 * `schema.json` 이 있는데 `baas` 가 없거나 `collection` 명령이 빠진 변종(native)이면, 그건
 * 환경 불일치다. 무음으로 넘기면 "코드는 다 됐는데 왜 안 되는지 모르는" 상태가 된다 —
 * 2026-08-31 에 정확히 그 일이 있었다(프로비저닝 수단이 없어 "환경 미지원"으로 반려됨).
 */
export function convergeSchema(root) {
  const result = spawnSync('baas', ['collection', 'converge', '--file', 'backend/schema.json'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.error && result.error.code === 'ENOENT') {
    throw new Error(
      'backend/schema.json 이 있는데 `baas` 를 찾을 수 없다.\n' +
        '컬렉션을 만들 수단이 없으면 서버 코드가 읽을 데이터도 없다 — 환경을 확인해라.',
    )
  }
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (result.status !== 0) {
    // 구버전·변종을 "수렴 실패"로 뭉뚱그리면 원인을 코드에서 찾게 된다. 환경 문제임을 밝힌다.
    if (/unknown command/i.test(out)) {
      throw new Error(
        'backend/schema.json 이 있는데 이 `baas` 에는 `collection` 명령이 없다(native 변종).\n' +
          '동적 컬렉션을 쓰는 프로젝트는 전체판 CLI 가 필요하다.',
      )
    }
    // `converge` 가 없는 구버전은 하위 명령을 못 찾고 플래그를 탓한다 — 메시지가 원인을 가린다.
    if (/unknown flag: --file|unknown shorthand/i.test(out)) {
      throw new Error(
        'backend/schema.json 이 있는데 이 `baas` 에는 `collection converge` 가 없다(구버전).\n' +
          'CLI 를 올려라 — `baas --version` 으로 확인한다.',
      )
    }
    throw new Error(`컬렉션 수렴 실패:\n${out}`)
  }
  return out
}
