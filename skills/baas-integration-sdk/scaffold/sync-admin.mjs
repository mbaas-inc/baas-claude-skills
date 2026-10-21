/** SDK 사용 분석 → 고정 회원 페이지. --check는 파일을 쓰지 않는다. SDK 기능 목록은 features.json이 정본이다. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BUNDLE = 'scripts/baas-admin'
const CHECK = `node ${BUNDLE}/sync-admin.mjs --check`

function sources(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink() || ['node_modules', '__tests__', '__mocks__'].includes(entry.name)) return []
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return sources(file)
    return /\.[cm]?[jt]sx?$/.test(file) && !/\.(d\.ts|test\.[jt]sx?|spec\.[jt]sx?|stories\.[jt]sx?)$/.test(file) ? [file] : []
  })
}

/** 문자열·주석·다른 객체의 동명 메서드는 세지 않는다. import/구조 분해 별칭도 SDK 원본까지 추적한다. */
export function usesMemberAuth(root, metadata) {
  const files = sources(path.join(root, 'src'))
  if (!files.length) return false
  const ts = createRequire(path.join(root, 'package.json'))('typescript')
  const symbols = new Set(metadata.admin_components?.members?.usage_symbols ?? [])
  if (!symbols.size) throw new Error('SDK metadata에 members 사용 계약이 없습니다')
  const configPath = path.join(root, 'tsconfig.json')
  const config = fs.existsSync(configPath) ? ts.readConfigFile(configPath, ts.sys.readFile).config : {}
  const options = ts.parseJsonConfigFileContent(config ?? {}, ts.sys, root).options
  const program = ts.createProgram(files, { ...options, allowJs: true, noResolve: true, noLib: true, jsx: ts.JsxEmit.Preserve })
  const checker = program.getTypeChecker()
  const unwrap = node => {
    while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node))) node = node.expression
    return node
  }
  const property = node => ts.isPropertyAccessExpression(node) ? node.name.text
    : ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null
  const importModule = node => {
    while (node && !ts.isImportDeclaration(node)) node = node.parent
    return node?.moduleSpecifier?.text
  }
  function sdk(node, seen = new Set()) {
    node = unwrap(node)
    if (!node || seen.has(node)) return false
    seen.add(node)
    if (property(node) === 'BaasSDK') {
      const receiver = unwrap(node.expression)
      return ts.isIdentifier(receiver) && ['window', 'globalThis'].includes(receiver.text)
    }
    if (!ts.isIdentifier(node)) return false
    const symbol = checker.getSymbolAtLocation(node)
    if (!symbol) return node.text === 'BaasSDK'
    const direct = (symbol.declarations ?? []).some(declaration =>
      ts.isVariableDeclaration(declaration) ? sdk(declaration.initializer, seen)
        : ts.isNamespaceImport(declaration) && importModule(declaration) === metadata.sdk)
    if (direct) return true
    return (symbol.flags & ts.SymbolFlags.Alias) !== 0 && (checker.getAliasedSymbol(symbol).declarations ?? [])
      .some(declaration => ts.isVariableDeclaration(declaration) && sdk(declaration.initializer, seen))
  }
  function callName(node, seen = new Set()) {
    node = unwrap(node)
    if (!node || seen.has(node)) return null
    seen.add(node)
    const name = property(node)
    if (name && sdk(node.expression)) return name
    if (!ts.isIdentifier(node)) return null
    for (const declaration of checker.getSymbolAtLocation(node)?.declarations ?? []) {
      if (ts.isImportSpecifier(declaration) && importModule(declaration) === metadata.sdk) return (declaration.propertyName ?? declaration.name).text
      if (ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent) && sdk(declaration.parent.parent.initializer)) return (declaration.propertyName ?? declaration.name).text
      if (ts.isVariableDeclaration(declaration)) {
        const alias = callName(declaration.initializer, seen)
        if (alias) return alias
      }
    }
    const symbol = checker.getSymbolAtLocation(node)
    if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      for (const declaration of checker.getAliasedSymbol(symbol).declarations ?? []) {
        if (ts.isVariableDeclaration(declaration)) {
          const alias = callName(declaration.initializer, seen)
          if (alias) return alias
        }
      }
    }
    return null
  }
  let found = false
  function visit(node) {
    if (ts.isCallExpression(node) && symbols.has(callName(node.expression))) found = true
    if (!found) ts.forEachChild(node, visit)
  }
  for (const file of files) {
    visit(program.getSourceFile(file))
    if (found) return true
  }
  return false
}

export function ensureMembers(spec) {
  const result = structuredClone(spec ?? { version: 1, title: '관리자', menu: [], pages: {} })
  if (result.version !== 1 || !Array.isArray(result.menu) || !result.pages || Array.isArray(result.pages)) throw new Error('admin.json의 version/menu/pages가 올바르지 않습니다')
  let pageId = Object.keys(result.pages).find(id => result.pages[id].component === 'members')
  if (!pageId) {
    pageId = 'members'
    for (let suffix = 2; pageId in result.pages; suffix++) pageId = `members_${suffix}`
    result.pages[pageId] = { title: '회원관리', component: 'members', widgets: [] }
  }
  if (!result.menu.includes(pageId)) result.menu.push(pageId)
  return result
}

function readJson(file, fallback = null) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback
}

export async function syncAdmin({ root, metadataPath, checkerPath, check = false, install = false }) {
  const metadata = readJson(metadataPath)
  if (!metadata) throw new Error('공식 SDK features.json이 필요합니다')
  const target = path.join(root, 'backend/admin.json')
  const old = readJson(target)
  const login = usesMemberAuth(root, metadata)
  const existing = Object.values(old?.pages ?? {}).some(page => page.component === 'members')
  if (!login && !existing) return { enabled: false, changed: false }
  const next = login ? ensureMembers(old) : old
  const changed = JSON.stringify(next) !== JSON.stringify(old)
  const { checkAdminSpec } = await import(pathToFileURL(checkerPath).href)
  const schema = readJson(path.join(root, 'backend/schema.json'))
  const access = readJson(path.join(root, 'backend/serverfn-access.json'), {})
  const serviceGrants = readJson(path.join(root, 'backend/service-grants.json'), {})
  const serviceOps = new Map(Object.entries(serviceGrants).map(([name, ops]) => [name, new Set(Object.keys(ops))]))
  const result = checkAdminSpec(JSON.stringify(next), { collections: schema?.collections ?? [], access, serviceOps })
  if (result.errors.length) throw new Error(result.errors.join('\n'))
  if (check && changed) throw new Error('로그인 사용에 맞는 회원관리 페이지/메뉴가 없습니다. 작업공간에서 admin 동기화를 실행하세요.')
  const text = changed ? JSON.stringify(next, null, 2) + '\n' : fs.readFileSync(target, 'utf8')
  const dist = path.join(root, 'backend/dist/admin.json')
  if (check && fs.existsSync(dist) && fs.readFileSync(dist, 'utf8') !== text) throw new Error('backend/dist/admin.json이 저장된 admin.json과 다릅니다')
  if (!check) {
    if (changed) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text) }
    if (fs.existsSync(dist)) fs.writeFileSync(dist, text)
    if (install) {
      const destination = path.join(root, BUNDLE)
      fs.mkdirSync(destination, { recursive: true })
      for (const [source, name] of [[fileURLToPath(import.meta.url), 'sync-admin.mjs'], [metadataPath, 'features.json'], [checkerPath, 'admin-spec.mjs'], [path.join(path.dirname(checkerPath), 'admin.schema.json'), 'admin.schema.json']]) {
        if (path.resolve(source) !== path.resolve(destination, name)) fs.copyFileSync(source, path.join(destination, name))
      }
      const pkgPath = path.join(root, 'package.json')
      const pkg = readJson(pkgPath)
      if (!pkg) throw new Error('package.json이 필요합니다')
      const before = JSON.stringify(pkg)
      pkg.scripts ??= {}
      for (const key of ['prebuild', 'validate']) {
        if (!(pkg.scripts[key] ?? '').split('&&').some(command => command.trim() === CHECK)) pkg.scripts[key] = [pkg.scripts[key], CHECK].filter(Boolean).join(' && ')
      }
      if (before !== JSON.stringify(pkg)) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    }
  }
  return { enabled: true, changed }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const option = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback
  try {
    const result = await syncAdmin({
      root: path.resolve(option('--root', process.cwd())),
      metadataPath: path.resolve(option('--metadata', path.join(HERE, 'features.json'))),
      checkerPath: path.resolve(option('--checker', path.join(HERE, 'admin-spec.mjs'))),
      check: argv.includes('--check'), install: argv.includes('--install'),
    })
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(`회원관리 명세 검사 실패: ${error.message}`)
    process.exitCode = 1
  }
}
