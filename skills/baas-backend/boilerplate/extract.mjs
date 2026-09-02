/**
 * serverFn 추출기 PoC — colocation 저작을 봉투 계약으로 컴파일한다.
 *
 * `src/services/*.ts` 의 `export const x = serverFn(...)` 를 찾아
 *   ① `backend/src/routes/<module>.ts`  (봉투 라우트 — 기존 platform/ 재사용)
 *   ② `src/services/<module>.client.ts` (fetch 스텁)
 * 를 만든다. serverFn 이 하나도 없으면 backend/ 를 만들지 않는다 —
 * 정적 배포 기본값을 지키는 것이 이 설계의 전제다.
 *
 * **합격선은 해피패스가 아니라 경계 위반이다.** 이 세션이 반복해 보여준 실패 유형은
 * "틀렸다" 가 아니라 "조용히 빠졌는데 아무도 몰랐다" 였다. 그래서 아래 셋은 반드시
 * 빌드 실패로 떨어져야 한다:
 *   - 클라이언트 모듈 import   (컴포넌트가 서버 번들에 끌려들어간다)
 *   - 모듈 스코프 클로저 캡처  (요청 간 상태 공유 — 웜 샌드박스 오염과 같은 병)
 *   - 시크릿 참조             (클라이언트 번들로 새면 상시 노출)
 *
 * 정규식으로는 셋째까지는 몰라도 둘째를 못 잡는다. TypeScript 컴파일러 API 로 AST 를 본다.
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

// 프로젝트 루트에서 실행한다: `node backend/extract.mjs`
// 추출기가 backend/ 안에 살아도 대상은 **앱의** src/services 다.
const ROOT = process.cwd()
const SERVICES = path.join(ROOT, 'src', 'services')
const ROUTES_OUT = path.join(ROOT, 'backend', 'src', 'routes')
// 유도된 service grant 매니페스트. 프로비저닝이 이걸 읽어 컬렉션 정책에 반영한다.
const GRANTS_OUT = path.join(ROOT, 'backend', 'service-grants.json')

/** 서버로 넘어가면 안 되는 import. 확장자와 경로 관례 둘 다 본다. */
const CLIENT_ONLY = [/\.(tsx|jsx|css)$/, /\/components\//, /^react$/, /^react-dom/]

// 컬렉션명 -> 필요한 grant 연산 집합. 빌드가 유도해 매니페스트로 낸다(사람이 선언하지 않는다).
const serviceGrants = new Map()
/** 시크릿으로 볼 이름. 실제 도입 시에는 팀 규칙으로 확정해야 한다. */
const SECRET_HINT = /SECRET|API_KEY|TOKEN|PASSWORD|CREDENTIAL/i

const violations = []
const extracted = []

function report(file, kind, detail) {
  violations.push({ file: path.basename(file), kind, detail })
}

/** 이 선언이 serverFn(...) 호출인가. `export const x = serverFn(...)` 형태만 인정한다. */
function serverFnName(stmt) {
  if (!ts.isVariableStatement(stmt)) return null
  const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  if (!exported) return null
  for (const decl of stmt.declarationList.declarations) {
    const init = decl.initializer
    if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'serverFn') {
      return { name: decl.name.getText(), call: init }
    }
  }
  return null
}

function checkImports(source, file) {
  for (const stmt of source.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const spec = stmt.moduleSpecifier.getText().slice(1, -1)
    if (spec === './serverFn') continue
    if (CLIENT_ONLY.some((re) => re.test(spec))) {
      report(file, 'client-import', `'${spec}' 는 클라이언트 전용이다`)
    }
  }
}

/** 모듈 스코프에 선언된 이름들 — 이걸 serverFn 안에서 읽으면 클로저 캡처다. */
function moduleScopeBindings(source) {
  const names = new Map() // name -> { mutable, isSecret, literal }
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    if (serverFnName(stmt)) continue // serverFn 자신은 제외
    const isConstEnum = (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0
    for (const decl of stmt.declarationList.declarations) {
      const name = decl.name.getText()
      const text = decl.getText()
      const isSecret = SECRET_HINT.test(name) || /process\.env/.test(text)
      // const 리터럴은 캡처가 아니라 상수 인라인이므로 허용한다. 다만 시크릿은 예외.
      const mutable = !isConstEnum
      // 문자열 리터럴 값을 보관한다 — grant 유도가 `const JOIN = 'gb_join'` 을 풀어야 한다.
      const literal =
        isConstEnum && decl.initializer && ts.isStringLiteral(decl.initializer)
          ? decl.initializer.text
          : undefined
      names.set(name, { mutable, isSecret, literal })
    }
  }
  return names
}

/**
 * dyncol 연산 → 컬렉션 정책의 grant 연산.
 *
 * 서버는 `service` 를 grants 의 한 원자로 평가하므로, 백엔드가 만지는 컬렉션은
 * 그 연산에 `service` 를 선언해야 한다. **선언을 사람이 하면 빼먹는다** — 어느 컬렉션을
 * 만지는지는 이 빌드가 알고 있으니 여기서 유도한다.
 */
const DYNCOL_OP_TO_GRANT = {
  list: 'read', get: 'read', aggregate: 'read',
  create: 'create',
  update: 'update', increment: 'update',
  remove: 'delete',
}

/**
 * serverFn 본문의 `sdk.dyncol.<op>(<컬렉션>, …)` 호출부에서 필요한 grant 를 모은다.
 *
 * 컬렉션명이 문자열 리터럴이거나 모듈 스코프 const 리터럴이면 정적으로 풀린다.
 * **풀 수 없으면 빌드를 세운다** — 볼 수 없는 이름에는 최소권한을 줄 수 없다.
 * (client-import·closure-capture·secret-reference 와 같은 kill 게이트 계열이다.)
 */
function collectGrants(call, bindings, file, grants) {
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === 'dyncol'
    ) {
      const op = node.expression.name.text
      const grant = DYNCOL_OP_TO_GRANT[op]
      const arg = node.arguments[0]
      if (grant && arg) {
        let name
        if (ts.isStringLiteral(arg)) name = arg.text
        else if (ts.isIdentifier(arg)) name = bindings.get(arg.text)?.literal
        if (name) {
          if (!grants.has(name)) grants.set(name, new Set())
          grants.get(name).add(grant)
        } else {
          report(
            file,
            'dynamic-collection',
            `dyncol.${op}() 의 컬렉션명을 정적으로 풀 수 없다 — 문자열 리터럴이나 모듈 스코프 const 로 쓴다`,
          )
        }
      }
    }
    ts.forEachChild(node, walk)
  }
  ts.forEachChild(call, walk)
}

function checkBody(call, bindings, file) {
  const seen = new Set()
  const walk = (node) => {
    if (ts.isIdentifier(node) && bindings.has(node.text) && !seen.has(node.text)) {
      seen.add(node.text)
      const { mutable, isSecret } = bindings.get(node.text)
      if (isSecret) report(file, 'secret-reference', `'${node.text}' 가 시크릿으로 보인다`)
      else if (mutable) report(file, 'closure-capture', `'${node.text}' 는 모듈 스코프 가변 상태다`)
    }
    ts.forEachChild(node, walk)
  }
  ts.forEachChild(call, walk)
}

for (const entry of fs.readdirSync(SERVICES)) {
  if (!entry.endsWith('.ts') || entry === 'serverFn.ts') continue
  const file = path.join(SERVICES, entry)
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true)
  const fns = source.statements.map(serverFnName).filter(Boolean)
  if (fns.length === 0) continue

  checkImports(source, file)
  const bindings = moduleScopeBindings(source)
  for (const fn of fns) {
    checkBody(fn.call, bindings, file)
    collectGrants(fn.call, bindings, file, serviceGrants)
  }
  extracted.push({ module: entry.replace(/\.ts$/, ''), names: fns.map((f) => f.name) })
}

if (violations.length > 0) {
  console.error('경계 위반 — 빌드를 중단한다\n')
  for (const v of violations) console.error(`  ✗ ${v.file}  [${v.kind}]  ${v.detail}`)
  console.error(`\n총 ${violations.length}건`)
  process.exit(1)
}

if (extracted.length === 0) {
  console.log('serverFn 없음 — backend/ 를 만들지 않는다 (정적 배포 유지)')
  process.exit(0)
}

fs.mkdirSync(ROUTES_OUT, { recursive: true })

// ── service grant 매니페스트 ───────────────────────────────────────────────
// 백엔드가 만지는 컬렉션과 연산을 코드에서 유도한다. 에이전트가 손으로 선언하면 빼먹고,
// 그러면 서버가 403 을 낸다 — 잘 쓰인 403 도 실패다. 코드가 부르면 grant 가 존재한다.
const grantsManifest = Object.fromEntries(
  [...serviceGrants].sort(([a], [b]) => a.localeCompare(b)).map(([coll, ops]) => [
    coll,
    Object.fromEntries([...ops].sort().map((op) => [op, ['service']])),
  ]),
)
fs.writeFileSync(GRANTS_OUT, `${JSON.stringify(grantsManifest, null, 2)}\n`)
const grantCount = Object.keys(grantsManifest).length
console.log(
  grantCount === 0
    ? 'service grant 없음 — 백엔드가 컬렉션을 만지지 않는다'
    : `service grant 유도 ${grantCount}개 컬렉션 → backend/service-grants.json`,
)

for (const { module, names } of extracted) {
  const routes = names
    .map((n) => `route.post('/${module}/${n}', (c) => runServerFn(${n}, c))`)
    .join('\n')
  fs.writeFileSync(
    path.join(ROUTES_OUT, `${module}.ts`),
    `// 생성 파일 — src/services/${module}.ts 에서 추출됨. 직접 고치지 마라.\n` +
      `import { route } from '../platform/app'\n` +
      `import { runServerFn } from '../platform/serverfn-adapter'\n` +
      `import { ${names.join(', ')} } from '../../../src/services/${module}'\n\n` +
      `${routes}\n`,
  )
}
// ── 클라이언트 스텁 ────────────────────────────────────────────────────────
// 계약 이중화를 없애는 지점이다. 프론트가 응답 모양을 **다시 선언하지 않고** 원본에서
// 가져오므로, 서버가 필드명을 바꾸면 프론트 타입체크가 깨진다. 지금은 런타임 타입가드로
// 방어하는데(실측 ~60줄), 그건 "맞는지 확인" 이지 "틀리면 못 만들게" 가 아니다.
//
// `Parameters`/`ReturnType` 으로 원본 시그니처에서 유도한다 — 타입을 손으로 다시 쓰면
// 그 순간 이중화가 되살아난다.
for (const { module, names } of extracted) {
  const body = names
    .map(
      (n) =>
        `export const ${n} = (input: Parameters<typeof impl.${n}>[0]): Promise<Awaited<ReturnType<typeof impl.${n}>>> =>\n` +
        `  call('/${module}/${n}', input)`,
    )
    .join('\n\n')
  fs.writeFileSync(
    path.join(SERVICES, `${module}.client.ts`),
    `// 생성 파일 — src/services/${module}.ts 에서 추출됨. 직접 고치지 마라.\n` +
      `import type * as impl from './${module}'\n\n` +
      `// 3단 백엔드 채널. 서버 라우터 prefix 와 **같은 값**이어야 한다 —\n` +
      `// CDN 이 이 prefix 를 떼지 않고 그대로 넘긴다(\`/aiapp-baas/*\` 와 다르다).\n` +
      `const API_BASE = '/aiapp-custom'\n\n` +
      `async function call(path: string, input: unknown) {\n` +
      `  const res = await fetch(\`\${API_BASE}\${path}\`, {\n` +
      `    method: 'POST',\n` +
      `    headers: { 'content-type': 'application/json' },\n` +
      `    body: JSON.stringify(input ?? {}),\n` +
      `  })\n` +
      `  if (!res.ok) throw new Error(\`\${path} 실패: \${res.status}\`)\n` +
      `  return res.json()\n` +
      `}\n\n` +
      `${body}\n`,
  )
}

console.log(`추출 완료 — ${extracted.length}개 모듈 / ${extracted.reduce((a, e) => a + e.names.length, 0)}개 함수`)
for (const e of extracted) {
  console.log(`  backend/src/routes/${e.module}.ts   ←  ${e.names.join(', ')}`)
  console.log(`  src/services/${e.module}.client.ts  ←  타입 유도 스텁`)
}
