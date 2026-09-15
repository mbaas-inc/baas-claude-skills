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
  for (const coll of doc.collections) {
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
  if (!Array.isArray(doc.collections) || doc.collections.length === 0) {
    throw new Error('backend/schema.json 의 collections 가 비어 있다')
  }
  for (const coll of doc.collections) {
    if (!coll.name) throw new Error('backend/schema.json: 이름 없는 컬렉션이 있다')
    if (!Array.isArray(coll.fields)) {
      throw new Error(`backend/schema.json: '${coll.name}' 에 fields 가 없다`)
    }
  }
  return doc
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
