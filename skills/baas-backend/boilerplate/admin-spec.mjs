/**
 * 관리 화면 명세(`backend/admin.json`) 검사 — 추출기가 serverFn 매니페스트를 만든 뒤 부른다.
 *
 * AI Studio 관리 화면은 이 명세로 사장님 화면을 그린다. 명세가 틀리면 Studio 가 화면 전체를 거부하는데,
 * 그걸 사장님이 화면을 열고서야 알게 된다(2026-10-16 실측: 동작 `input` 을 객체로 써서 명세가 통째로
 * 거부됐다). 그래서 **만드는 쪽의 빌드에서** 같은 규칙으로 먼저 막는다.
 *
 * 두 단계다.
 *   1. 모양 — `admin.schema.json`(AI Studio `manage/spec.py` 의 pydantic 모델에서 생성) 대로인가.
 *      모르는 속성·모르는 위젯 type·리스트 자리의 객체를 잡는다.
 *   2. 참조 — 그 모양 위에서 Studio 가 하는 대조의 핵심만 옮긴다.
 *      - 컬렉션·칸이 `schema.json` 에 있는가
 *      - `call` 이 `serverfn-access.json` 의 `access:'owner'` 함수인가
 *      - 직접 쓰기(목록 스위치·폼·지우기·일괄 set)가 규칙 컬렉션(`service`)을 열지 않는가
 *        (`owner_content` 에 올린 사장님 콘텐츠는 예외)
 *
 * 정본은 Studio 다 — 여기서 통과해도 Studio 가 더 엄격하게 볼 수 있다(라벨 경고 등). 여기는 "명세 전체가
 * 거부되는" 오류를 생성 시점으로 당겨 오는 곳이다.
 */
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const SCHEMA = JSON.parse(fs.readFileSync(path.join(HERE, 'admin.schema.json'), 'utf8'))
const BUILTIN_FIELDS = new Set(['id', 'created_at'])
const MAX_ERRORS = 30

// ── 1. 모양 ──────────────────────────────────────────────────────────────

const KIND = { object: '객체', array: '리스트', string: '글자', integer: '정수', number: '숫자', boolean: '참·거짓', null: 'null' }

function kindOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (Number.isInteger(v)) return 'integer'
  return typeof v === 'number' ? 'number' : typeof v
}

function typeOk(v, type) {
  const k = kindOf(v)
  return k === type || (type === 'number' && k === 'integer')
}

function resolve(schema) {
  let s = schema
  while (s && s.$ref) s = SCHEMA.$defs[s.$ref.replace('#/$defs/', '')]
  return s
}

function join(where, key) {
  return typeof key === 'number' ? `${where}[${key}]` : where ? `${where}.${key}` : key
}

/** 값 하나를 스키마 하나로 본다. 오류는 `{ where, message }` 로 모은다. */
function shape(value, schemaIn, where, errors) {
  const schema = resolve(schemaIn)
  if (!schema) return
  if (schema.anyOf) {
    // Optional 은 `anyOf: [X, null]` 로 나온다. 값의 종류와 맞는 갈래로 본다.
    const branches = schema.anyOf.map(resolve)
    const passing = branches.find((b) => {
      const trial = []
      shape(value, b, where, trial)
      return trial.length === 0
    })
    if (passing) return
    const kind = kindOf(value)
    const same = branches.find((b) => b.type ? typeOk(value, b.type) : b.oneOf || b.anyOf || b.enum || b.const !== undefined)
    if (same) return shape(value, same, where, errors)
    const want = [...new Set(branches.map((b) => KIND[b.type] ?? '형식'))].join(' 또는 ')
    errors.push({ where, message: `${want}이어야 합니다 (지금: ${KIND[kind]})` })
    return
  }
  if (schema.oneOf && schema.discriminator) {
    const key = schema.discriminator.propertyName
    const tag = value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined
    const target = schema.discriminator.mapping[tag]
    if (!target) {
      const allowed = Object.keys(schema.discriminator.mapping).join(', ')
      errors.push({ where, message: `알 수 없는 ${key} '${tag ?? '(없음)'}' — 쓸 수 있는 것: ${allowed}` })
      return
    }
    return shape(value, { $ref: target }, where, errors)
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push({ where, message: `값은 ${JSON.stringify(schema.const)} 이어야 합니다` })
    return
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ where, message: `'${value}' 는 쓸 수 없습니다 — 쓸 수 있는 것: ${schema.enum.join(', ')}` })
    return
  }
  if (schema.type && !typeOk(value, schema.type)) {
    const hint = schema.type === 'array' && where.endsWith('.input')
      ? ' — 동작 입력은 [{ "name", "label", "type", "options", "required" }] 리스트다(칸 이름을 키로 한 객체가 아니다)'
      : ''
    errors.push({ where, message: `${KIND[schema.type]}이어야 합니다 (지금: ${KIND[kindOf(value)]})${hint}` })
    return
  }
  const kind = kindOf(value)
  if (kind === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    const hint = schema.pattern.includes('(\\.') ? " — '<파일>.<export>' 형식(파일 이름은 영문·숫자·_ 만, 하이픈 금지)" : ''
    errors.push({ where, message: `'${value}' 가 형식에 맞지 않습니다${hint}` })
  }
  if ((kind === 'integer' || kind === 'number')) {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ where, message: `${schema.minimum} 이상이어야 합니다` })
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ where, message: `${schema.maximum} 이하여야 합니다` })
  }
  if (kind === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ where, message: `${schema.minItems}개 이상이어야 합니다` })
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push({ where, message: `${schema.maxItems}개 이하여야 합니다` })
    if (schema.prefixItems) schema.prefixItems.forEach((s, i) => i < value.length && shape(value[i], s, join(where, i), errors))
    else if (schema.items) value.forEach((v, i) => shape(v, schema.items, join(where, i), errors))
  }
  if (kind === 'object') {
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push({ where, message: `'${req}' 가 필요합니다` })
    }
    const props = schema.properties ?? {}
    for (const [k, v] of Object.entries(value)) {
      if (k in props) shape(v, props[k], join(where, k), errors)
      else if (schema.additionalProperties === false) {
        errors.push({ where: join(where, k), message: `모르는 속성입니다 — 쓸 수 있는 것: ${Object.keys(props).join(', ')}` })
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        shape(v, schema.additionalProperties, join(where, k), errors)
      }
    }
  }
}

// ── 2. 참조 ──────────────────────────────────────────────────────────────

const allWidgets = page => [...page.widgets, ...(page.member_detail?.widgets ?? [])]

const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

/** `access` 한 연산 값에 `service` 가 들어 있는가(문자열·배열 모두). */
function hasService(value) {
  return asList(value).some((x) => String(x) === 'service')
}

function condFields(cond) {
  if (!cond || typeof cond !== 'object') return []
  return Object.entries(cond).flatMap(([k, v]) =>
    k === 'or' && Array.isArray(v) ? v.flatMap(condFields) : [k])
}

function formFields(form) {
  if (form.fields === undefined || form.fields === null) return null // 컬렉션의 모든 칸
  return form.fields.flatMap((item) =>
    item && typeof item === 'object' && 'group' in item ? item.fields : [item])
    .map((m) => (typeof m === 'string' ? { name: m } : m))
}

/**
 * @param spec 모양 검사를 통과한 명세
 * @param collections `schema.json` 의 collections(없으면 null — 컬렉션 대조를 건너뛴다)
 * @param serviceOps 컬렉션 → 코드가 유도한 service 연산(Set). `service-grants.json` 과 같은 값
 * @param access `serverfn-access.json` 과 같은 매니페스트
 */
function references(spec, collections, serviceOps, access) {
  const errors = []
  const err = (where, message) => errors.push({ where, message })
  const byName = collections ? new Map(collections.map((c) => [c.name, c])) : null
  const fieldsOf = (name) => {
    const c = byName?.get(name)
    return c ? new Map((c.fields ?? []).map((f) => [f.name, f])) : null
  }
  const coll = (name, where) => {
    if (!byName) return null
    if (!byName.has(name)) {
      err(where, `schema.json 에 없는 컬렉션 '${name}'`)
      return null
    }
    return fieldsOf(name)
  }
  const field = (fields, name, where) => {
    if (fields && name && !fields.has(name) && !BUILTIN_FIELDS.has(name)) err(where, `없는 칸 '${name}'`)
  }
  const text = (fields, name, where, what) => {
    const f = fields?.get(name)
    if (f && f.type !== 'string') err(where, `${what}은 글자(string) 칸에만 씁니다 ('${name}' 은 ${f.type})`)
  }
  const cond = (fields, c, where) => condFields(c).forEach((n) => field(fields, n, where))
  const joins = (js, fields, where) => {
    for (const j of js ?? []) {
      field(fields, j.field, `${where}.join`)
      const other = coll(j.collection, `${where}.join`)
      field(other, j.match ?? 'id', `${where}.join`)
      field(other, j.show, `${where}.join`)
    }
  }
  const actions = (acts, fields, where) => (acts ?? []).forEach((a, i) => cond(fields, a.when, `${where}.actions[${i}].when`))

  for (const id of spec.menu ?? []) if (!(id in (spec.pages ?? {}))) err('menu', `없는 페이지 '${id}'`)
  for (const key of ['hidden', 'owner_content']) for (const n of spec[key] ?? []) coll(n, key)
  for (const key of ['labels', 'values']) {
    for (const [n, m] of Object.entries(spec[key] ?? {})) {
      const f = coll(n, `${key}.${n}`)
      for (const fname of Object.keys(m)) field(f, fname, `${key}.${n}`)
    }
  }
  for (const [n, m] of Object.entries(spec.formats ?? {})) {
    const f = coll(n, `formats.${n}`)
    for (const [fname, fmt] of Object.entries(m)) {
      field(f, fname, `formats.${n}`)
      if (fmt === 'markdown') text(f, fname, `formats.${n}.${fname}`, 'markdown 형식')
    }
  }

  for (const [pid, page] of Object.entries(spec.pages ?? {})) {
    const detail = page.member_detail
    if (detail) {
      const where = `pages.${pid}.member_detail`
      if (page.component !== 'members') err(where, '회원 상세는 component=members 페이지에만 선언할 수 있습니다')
      const bindings = detail.bindings ?? {}
      for (const [name, link] of Object.entries(bindings)) {
        const fields = fieldsOf(name)
        if (!fields || fields.get(link)?.type !== 'string' || (spec.hidden ?? []).includes(name)) {
          err(`${where}.bindings`, `'${name}.${link}'은 표시 가능한 컬렉션의 문자열 칸이어야 합니다`)
        }
        const recordDetail = spec.details?.[name]
        const related = [...(recordDetail?.related ?? []), ...(recordDetail?.thread ? [recordDetail.thread] : [])]
        for (const target of related) if (!(target.collection in bindings)) err(where, `'${target.collection}'의 회원 바인딩이 필요합니다`)
      }
      for (const widget of detail.widgets ?? []) {
        const names = widget.type === 'panel' ? [] : widget.type === 'stat'
          ? [widget.source?.collection, widget.minus?.collection].filter(Boolean) : [widget.collection]
        for (const name of names) if (!(name in bindings)) err(where, `'${name}'의 회원 바인딩이 필요합니다`)
      }
    }
    allWidgets(page).forEach((w, i) => {
      const where = `pages.${pid}.widgets[${i}](${w.type})`
      if (w.type === 'stat') {
        for (const src of [w.source, w.minus].filter(Boolean)) {
          const f = coll(src.collection, where)
          field(f, src.field, where)
          cond(f, src.filter, `${where}.filter`)
        }
        return
      }
      if (w.type === 'panel') return
      if ((spec.hidden ?? []).includes(w.collection)) err(where, `숨긴 컬렉션 '${w.collection}' 을 화면에 쓸 수 없습니다`)
      const f = coll(w.collection, where)
      cond(f, w.filter, `${where}.filter`)
      if (w.type === 'list') {
        for (const c of w.columns) field(f, c, `${where}.columns`)
        if (w.tabs) field(f, w.tabs.field, `${where}.tabs`)
        for (const s of w.search ?? []) {
          field(f, s, `${where}.search`)
          text(f, s, `${where}.search`, '검색')
        }
        for (const fd of w.filters ?? []) field(f, typeof fd === 'string' ? fd : fd.field, `${where}.filters`)
        if (w.sort) field(f, w.sort.replace(/^-/, ''), `${where}.sort`)
        if (Array.isArray(w.editable)) {
          for (const n of w.editable) {
            field(f, n, `${where}.editable`)
            if (!w.columns.includes(n)) err(`${where}.editable`, `'${n}' 은 columns 에 없는 칸이라 목록에서 고칠 수 없습니다`)
          }
        }
        joins(w.join, f, where)
        actions(w.actions, f, where)
        for (const ref of [w.create, w.edit]) {
          if (!ref) continue
          const form = spec.forms?.[ref.form]
          if (!form) err(where, `없는 폼 '${ref.form}'`)
          else if (form.collection !== w.collection) err(where, `폼 '${ref.form}' 은 '${form.collection}' 컬렉션 폼입니다`)
        }
        ;(w.bulk ?? []).forEach((b, j) => Object.keys(b.set ?? {}).forEach((n) => field(f, n, `${where}.bulk[${j}]`)))
      } else if (w.type === 'agenda') {
        for (const n of [w.date, w.time, w.group, w.group_label, ...(w.columns ?? [])]) field(f, n, where)
        joins(w.join, f, where)
      } else if (w.type === 'timeline') {
        for (const n of [w.resource, w.date, w.start, w.duration, w.end, w.label, w.status]) field(f, n, where)
      } else if (w.type === 'breakdown' || w.type === 'trend') {
        for (const n of [w.group_by, w.date, w.field]) field(f, n, where)
      } else if (w.type === 'settings') {
        for (const n of Object.keys(w.fields ?? {})) field(f, n, where)
      }
    })
  }

  for (const [cname, d] of Object.entries(spec.details ?? {})) {
    const where = `details.${cname}`
    const f = coll(cname, where)
    for (const n of d.fields ?? []) field(f, n, where)
    for (const n of Object.keys(d.json ?? {})) field(f, n, `${where}.json`)
    joins(d.join, f, where)
    for (const r of d.related ?? []) {
      const rf = coll(r.collection, `${where}.related`)
      field(rf, r.field, `${where}.related`)
      field(f, r.match ?? 'id', `${where}.related`)
      for (const c of r.columns) field(rf, c, `${where}.related`)
    }
    if (d.thread) {
      const t = d.thread
      const tf = coll(t.collection, `${where}.thread`)
      for (const n of [t.field, t.body, t.author, t.at ?? 'created_at']) field(tf, n, `${where}.thread`)
      field(f, t.match ?? 'id', `${where}.thread`)
      text(tf, t.body, `${where}.thread.body`, '대화 본문')
      const values = tf?.get(t.author)?.options?.values
      const owner = t.owner_value ?? 'owner'
      if (values && !values.includes(owner)) err(`${where}.thread`, `owner_value '${owner}' 가 '${t.author}' 칸 값(${values.join(', ')})에 없습니다`)
    }
    actions(d.actions, f, where)
    if (d.edit && !spec.forms?.[d.edit]) err(where, `없는 폼 '${d.edit}'`)
  }

  for (const [fid, form] of Object.entries(spec.forms ?? {})) {
    const where = `forms.${fid}`
    const f = coll(form.collection, where)
    const items = formFields(form)
    const seen = new Set()
    for (const item of items ?? []) {
      field(f, item.name, where)
      if (seen.has(item.name)) err(where, `칸 '${item.name}' 이 두 번 나옵니다`)
      seen.add(item.name)
      if (item.ui === 'richtext') text(f, item.name, `${where}.${item.name}`, '서식 편집기(richtext)')
    }
    for (const n of [...(form.readonly ?? []), ...Object.keys(form.defaults ?? {})]) field(f, n, where)
  }

  // 직접 쓰기 — 명세가 연 쓰기가 규칙(service) 연산이면 Studio 가 거부한다. owner_content 는 예외.
  if (byName) {
    const writes = []
    const open = (name, op, where) => writes.push({ name, op, where })
    const viaForm = (formId, op, where) => {
      const form = spec.forms?.[formId]
      if (form && !form.save) open(form.collection, op, where)
    }
    const viaDelete = (name, del, where) => {
      if (!del) return
      if (del === true) return open(name, 'delete', where)
      if (del.call) return
      open(name, del.archive ? 'update' : 'delete', where)
    }
    for (const [pid, page] of Object.entries(spec.pages ?? {})) {
      allWidgets(page).forEach((w, i) => {
        if (w.type !== 'list') return
        const where = `pages.${pid}.widgets[${i}](list)`
        if (w.create) viaForm(w.create.form, 'create', where)
        if (w.edit) viaForm(w.edit.form, 'update', where)
        if (w.editable === true || (Array.isArray(w.editable) && w.editable.length)) open(w.collection, 'update', `${where}.editable`)
        viaDelete(w.collection, w.delete, `${where}.delete`)
        for (const b of w.bulk ?? []) {
          if (b.set) open(w.collection, 'update', `${where}.bulk`)
          else if (b.delete) open(w.collection, 'delete', `${where}.bulk`)
        }
      })
    }
    for (const [cname, d] of Object.entries(spec.details ?? {})) {
      if (d.edit) viaForm(d.edit, 'update', `details.${cname}.edit`)
      viaDelete(cname, d.delete, `details.${cname}.delete`)
    }
    const ownerContent = new Set(spec.owner_content ?? [])
    const reported = new Set()
    for (const { name, op, where } of writes) {
      const c = byName.get(name)
      if (!c || ownerContent.has(name)) continue
      const service = hasService((c.access ?? {})[op]) || serviceOps?.get(name)?.has(op)
      const key = `${name}:${op}`
      if (service && !reported.has(key)) {
        reported.add(key)
        err(where, `'${name}' 의 ${op} 는 규칙이 걸린(service) 연산이라 관리 화면이 직접 쓸 수 없습니다. ` +
          'owner serverFn(call·save)으로 바꾸거나, 규칙 없이 사장님만 쓰는 콘텐츠면 owner_content 에 올리세요')
      }
    }
  }

  // 동작 이름 — 매니페스트의 access:'owner' 함수만
  if (access) {
    for (const { name, where } of declaredCalls(spec)) {
      const entry = access[name]
      if (!entry) {
        err(where, `동작 '${name}' 의 serverFn 이 없습니다 (src/services/<파일>.ts 의 export 이름 — '<파일>.<export>')`)
      } else if (entry.access !== 'owner') {
        err(where, `동작 '${name}' 은 access '${entry.access}' 입니다. 관리 화면 동작은 access: 'owner' serverFn 만 부릅니다`)
      }
    }
  }
  return errors
}

/** 명세가 부르는 serverFn 이름과 그 자리. */
export function declaredCalls(spec) {
  const out = []
  const add = (name, where) => name && out.push({ name, where })
  for (const [pid, page] of Object.entries(spec.pages ?? {})) {
    allWidgets(page).forEach((w, i) => {
      const where = `pages.${pid}.widgets[${i}](${w.type})`
      for (const a of w.actions ?? []) add(a.call, `${where}.actions`)
      for (const b of w.bulk ?? []) add(b.call, `${where}.bulk`)
      if (w.delete && typeof w.delete === 'object') add(w.delete.call, `${where}.delete`)
      if (w.type === 'settings') add(w.save, `${where}.save`)
      if (w.type === 'panel') add(w.call, where)
    })
  }
  for (const [cname, d] of Object.entries(spec.details ?? {})) {
    for (const a of d.actions ?? []) add(a.call, `details.${cname}.actions`)
    if (d.delete && typeof d.delete === 'object') add(d.delete.call, `details.${cname}.delete`)
    for (const c of d.children ?? []) add(c.save, `details.${cname}.children`)
    add(d.thread?.reply?.call, `details.${cname}.thread.reply`)
  }
  for (const [fid, form] of Object.entries(spec.forms ?? {})) add(form.save, `forms.${fid}.save`)
  return out
}

/**
 * 명세 글자 하나를 검사한다. 오류가 없으면 `{ errors: [] }`.
 * @returns {{ errors: string[] }}
 */
export function checkAdminSpec(text, { collections = null, serviceOps = null, access = null } = {}) {
  let spec
  try {
    spec = JSON.parse(text)
  } catch (error) {
    return { errors: [`JSON 형식이 아닙니다: ${error.message}`] }
  }
  const shapeErrors = []
  shape(spec, SCHEMA, '', shapeErrors)
  const found = shapeErrors.length ? shapeErrors : references(spec, collections, serviceOps, access)
  const lines = found.map(({ where, message }) => (where ? `${where}: ${message}` : message))
  return {
    errors: lines.length > MAX_ERRORS ? [...lines.slice(0, MAX_ERRORS), `…외 ${lines.length - MAX_ERRORS}건`] : lines,
  }
}
