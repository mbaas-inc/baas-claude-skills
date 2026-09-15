#!/usr/bin/env node
/**
 * 골격 업그레이드 — 프로젝트의 `backend/` 플랫폼 파일을 지금 스킬의 정본으로 맞춘다.
 *
 * ## 왜 필요한가
 *
 * `backend/` 는 한 번 복사되면 그대로 남는다(SKILL.md §0 「이미 있음 — 유지」). 그래서 골격을
 * 고쳐도 **기존 프로젝트는 영영 못 받는다.** 2026-09-15 실측: 골격을 가진 21개 프로젝트에서
 * `src/platform/sdk.ts` 가 **7개 변종**으로 갈려 있었다. 업그레이드 경로가 없으면 이 분기는
 * 계속 는다.
 *
 * ## 왜 버전 번호를 안 쓰는가
 *
 * 골격 출처가 둘이다 — Skills API 배포본(`/workspace/skills/...`)과 이미지 git 체크아웃
 * (`/app/plugins/...`). 두 값은 어긋날 수 있고 실제로 어긋난 적이 있다. 그래서 외부 핀
 * (`BAAS_SKILLS_COMMIT`)을 버전으로 삼으면 "기록된 버전"과 "실제로 복사된 내용"이 갈라진다.
 *
 * 대신 **설치 시점에 복사한 내용의 해시**를 기록하고 3-way 로 비교한다. git 이 머지 베이스를
 * 쓰는 것과 같은 구조이고, 여기서는 그 베이스가 `installed` 다.
 *
 * | installed | disk | canonical | 판정 |
 * |---|---|---|---|
 * | = | = | = | 최신 — 할 일 없음 |
 * | = | = | ≠ | 뒤처짐 — 덮어쓴다 |
 * | = | ≠ | = | 로컬 수정 — 보고만(정본과 같으니 급하지 않다) |
 * | = | ≠ | ≠ | **충돌** — 멈춘다 |
 *
 * ## 판정을 저장하지 않는다
 *
 * 결과를 기록하면 그건 "기억"이 되고, 다음 턴이 낡은 기억을 사실로 받는다. work-log 로 나르는
 * 것도 같은 이유로 안 된다 — 그건 에이전트가 산문으로 요약하는 채널이라 사실이 아니라 해석이
 * 전달된다(과거에 경합 실패가 "등급 미지원"으로 승계된 적이 있다). 판정은 **매번 다시 계산**하고
 * 신호는 **종료 코드**로 낸다. 해소되면 저절로 통과한다.
 *
 * ## 종료 코드
 *
 *   0  정상 (최신이거나, 적용 가능하거나, 적용 성공)
 *   2  충돌 — 사람이 봐야 한다
 *   3  봉투 계약 버전이 바뀌었다 — 디스패처와 짝이라 자동 적용하지 않는다
 *   1  오류
 */

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EXIT = { OK: 0, ERROR: 1, CONFLICT: 2, CONTRACT: 3 }

/** 기록 위치. 워크스페이스와 함께 S3 로 보존된다. */
const RECORD_REL = path.join('.mbaas', 'backend-skeleton.json')
/** 앱 트리로도 복사되는 저작 마커 — 골격과 함께 갱신해야 한다(§0 이 설치 때 복사한다). */
const APP_TREE_COPY = { from: path.join('src', 'serverFn.ts'), to: path.join('src', 'services', 'serverFn.ts') }

// ── 파일 수집 ────────────────────────────────────────────────────────────────

/**
 * 플랫폼 소유 파일 = **정본 boilerplate 에 존재하는 전부**.
 *
 * 목록을 손으로 적지 않는 이유: 골격에 파일이 늘 때마다 여기도 고쳐야 하고, 빠뜨리면 그 파일만
 * 조용히 낡는다. 생성물(`src/routes/`·`src/index.ts`·`dist/`·`service-grants.json`)은 애초에
 * 정본에 없으므로 자동으로 제외된다 — 그것들은 `extract.mjs` 가 다시 만든다.
 */
function platformFiles(boilerplateDir) {
  const out = []
  const walk = (rel) => {
    const abs = path.join(boilerplateDir, rel)
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'package-lock.json') continue
      const next = rel ? path.join(rel, entry.name) : entry.name
      if (entry.isDirectory()) walk(next)
      else out.push(next)
    }
  }
  walk('')
  return out.sort()
}

const sha = (file) => {
  try {
    return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

const hashAll = (dir, files) =>
  Object.fromEntries(files.map((f) => [f, sha(path.join(dir, f))]))

// ── 봉투 계약 버전 ───────────────────────────────────────────────────────────

/**
 * 계약 버전은 디스패처(aiapp-service)와 **짝**이다. 골격만 올리면 백엔드가 첫 요청부터 거부한다
 * — `envelope.ts` 가 불일치를 하드 실패로 다루기 때문이다. 그래서 값이 바뀌면 자동 적용하지 않고
 * 배포 순서를 사람이 정하게 한다.
 */
function contractVersion(boilerplateDir) {
  const file = path.join(boilerplateDir, 'src', 'platform', 'envelope.ts')
  const match = /ENVELOPE_CONTRACT_VERSION\s*=\s*(\d+)/.exec(fs.readFileSync(file, 'utf8'))
  return match ? Number(match[1]) : null
}

// ── 기록 ─────────────────────────────────────────────────────────────────────

function readRecord(projectRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, RECORD_REL), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function writeRecord(projectRoot, record) {
  const file = path.join(projectRoot, RECORD_REL)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
}

/**
 * 정본 저장소의 커밋. **보고용이다** — 판정에는 쓰지 않는다.
 *
 * 출처가 둘이라 이 값이 실제 복사된 내용과 어긋날 수 있다. 사람이 "어느 세대인가" 를 가늠할 때만
 * 쓰고, 기계 판정은 해시만 본다.
 */
function sourceLabel(boilerplateDir) {
  const result = spawnSync('git', ['-C', boilerplateDir, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  })
  const sha1 = result.status === 0 ? result.stdout.trim() : ''
  return sha1 ? `baas-claude-skills@${sha1}` : 'unknown'
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

function classify({ installed, disk, canonical, files }) {
  const behind = []
  const localOnly = []
  const conflicts = []
  for (const f of files) {
    const i = installed[f] ?? null
    const d = disk[f] ?? null
    const c = canonical[f] ?? null
    if (d === c) continue // 이미 정본과 같다 (설치 기록과 다르더라도 할 일이 없다)
    if (d === i) behind.push(f) // 설치 이후 손대지 않았다 — 안전하게 덮는다
    else if (i === c) localOnly.push(f) // 정본은 그대로인데 파일만 바뀌었다
    else conflicts.push(f) // 양쪽 다 움직였다 — 사람이 본다
  }
  return { behind, localOnly, conflicts }
}

// ── 적용 ─────────────────────────────────────────────────────────────────────

function copyInto(boilerplateDir, backendDir, files) {
  for (const f of files) {
    const dest = path.join(backendDir, f)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(path.join(boilerplateDir, f), dest)
  }
}

/**
 * 적용은 **전부 되돌릴 수 있어야** 한다. 골격 갱신이 프로젝트를 깨고 끝나는 게 최악이라,
 * 스냅샷을 뜨고 추출이 통과할 때만 확정한다.
 */
function applyUpgrade({ projectRoot, backendDir, boilerplateDir, files, record }) {
  // 워크스페이스 밖에 뜬다 — 중단되어 남더라도 프로젝트 소스로 S3 에 올라가면 안 된다.
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-snapshot-'))
  fs.cpSync(backendDir, snapshot, { recursive: true })
  const restore = () => {
    fs.rmSync(backendDir, { recursive: true, force: true })
    fs.cpSync(snapshot, backendDir, { recursive: true })
  }
  try {
    copyInto(boilerplateDir, backendDir, files)
    // 앱 트리 사본 — 프론트가 import 하는 저작 마커라 같이 움직여야 타입이 맞는다.
    const appCopy = path.join(projectRoot, APP_TREE_COPY.to)
    if (fs.existsSync(appCopy)) {
      fs.copyFileSync(path.join(backendDir, APP_TREE_COPY.from), appCopy)
    }
    // 생성물을 새 추출기로 다시 만든다. 여기서 깨지면 갱신이 잘못된 것이다.
    const extract = spawnSync(process.execPath, [path.join('backend', 'extract.mjs')], {
      cwd: projectRoot,
      encoding: 'utf8',
    })
    if (extract.status !== 0) {
      restore()
      process.stderr.write(extract.stdout || '')
      process.stderr.write(extract.stderr || '')
      return { ok: false, reason: '갱신 후 추출이 실패해 원래대로 되돌렸다' }
    }
    writeRecord(projectRoot, record)
    return { ok: true }
  } catch (error) {
    restore()
    return { ok: false, reason: `갱신 중 오류로 되돌렸다: ${error.message}` }
  } finally {
    fs.rmSync(snapshot, { recursive: true, force: true })
  }
}

// ── 진입점 ───────────────────────────────────────────────────────────────────

function resolveBoilerplate(explicit) {
  const candidates = explicit
    ? [explicit]
    : [
        path.join(path.dirname(new URL(import.meta.url).pathname), 'boilerplate'),
        path.join('skills', 'baas-backend', 'boilerplate'),
        '/app/plugins/baas-claude-skills/skills/baas-backend/boilerplate',
      ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'src', 'serverFn.ts'))) return dir
  }
  return null
}

function main(argv) {
  const apply = argv.includes('--apply')
  const arg = (name) => {
    const at = argv.indexOf(name)
    return at >= 0 ? argv[at + 1] : undefined
  }
  const projectRoot = path.resolve(arg('--project') ?? process.cwd())
  const boilerplateDir = resolveBoilerplate(arg('--boilerplate'))
  if (!boilerplateDir) {
    console.error('정본 boilerplate 를 찾지 못했다 — --boilerplate 로 경로를 준다')
    return EXIT.ERROR
  }
  const backendDir = path.join(projectRoot, 'backend')
  if (!fs.existsSync(backendDir)) {
    console.log('backend/ 없음 — 업그레이드 대상이 아니다 (§0 이 새로 설치한다)')
    return EXIT.OK
  }

  const files = platformFiles(boilerplateDir)
  const canonical = hashAll(boilerplateDir, files)
  const disk = hashAll(backendDir, files)
  const canonicalContract = contractVersion(boilerplateDir)

  let record = readRecord(projectRoot)
  if (!record) {
    // 기록이 없는 프로젝트(업그레이드 경로 도입 이전)는 **지금 상태를 기준선으로** 삼는다.
    // 충돌로 보면 기존 프로젝트 전부가 첫 턴에 멈추는데, 실측해 보니 그렇게 막아서 지키는 것이
    // 주석 번역 한 건뿐이었다(2026-09-15, 21개 조사). 비용이 이득을 압도한다.
    // 방금 설치한 경우(§0 이 복사한 직후)는 disk 가 곧 정본이다. 그때는 실제 출처를 남겨야
    // 나중에 "어느 세대인가" 를 사람이 읽을 수 있다. 기존 프로젝트는 출처를 알 길이 없으므로
    // 기준선임을 명시한다.
    const fresh = files.every((f) => disk[f] === canonical[f])
    record = {
      installedAt: new Date().toISOString(),
      envelopeContractVersion: canonicalContract,
      sourceLabel: fresh ? sourceLabel(boilerplateDir) : 'baseline-from-disk',
      files: disk,
    }
    writeRecord(projectRoot, record)
    console.log(
      fresh
        ? `골격 기록 생성 — ${record.sourceLabel}`
        : '기록이 없어 현재 상태를 기준선으로 남겼다 — .mbaas/backend-skeleton.json',
    )
  }

  const { behind, localOnly, conflicts } = classify({
    installed: record.files ?? {},
    disk,
    canonical,
    files,
  })

  if (conflicts.length > 0) {
    console.error('골격 충돌 — 플랫폼 파일이 프로젝트에서도, 정본에서도 바뀌었다.')
    console.error('둘 중 무엇을 남길지는 사람이 정해야 한다. 아래 파일을 확인한다:')
    for (const f of conflicts) console.error(`  ✗ backend/${f}`)
    return EXIT.CONFLICT
  }

  if (localOnly.length > 0) {
    // 정본은 그대로인데 파일만 바뀐 경우. 급하지 않아 진행을 막지 않는다.
    console.log('로컬에서 수정된 플랫폼 파일 (정본은 동일 — 갱신하지 않는다):')
    for (const f of localOnly) console.log(`  · backend/${f}`)
  }

  if (behind.length === 0) {
    console.log('골격 최신')
    return EXIT.OK
  }

  if (record.envelopeContractVersion != null && canonicalContract !== record.envelopeContractVersion) {
    console.error(
      `봉투 계약 버전이 ${record.envelopeContractVersion} → ${canonicalContract} 로 바뀌었다.`,
    )
    console.error('디스패처(aiapp-service)와 짝이라 골격만 올리면 백엔드가 첫 요청부터 거부한다.')
    console.error('배포 순서를 정한 뒤 사람이 적용한다.')
    return EXIT.CONTRACT
  }

  if (!apply) {
    console.log(`골격 갱신 필요 ${behind.length}개 — --apply 로 적용한다`)
    for (const f of behind) console.log(`  ↑ backend/${f}`)
    return EXIT.OK
  }

  const next = {
    installedAt: new Date().toISOString(),
    envelopeContractVersion: canonicalContract,
    sourceLabel: sourceLabel(boilerplateDir),
    files: canonical,
  }
  const result = applyUpgrade({ projectRoot, backendDir, boilerplateDir, files: behind, record: next })
  if (!result.ok) {
    console.error(result.reason)
    return EXIT.ERROR
  }
  console.log(`골격 갱신 ${behind.length}개 적용 — ${next.sourceLabel}`)
  return EXIT.OK
}

process.exit(main(process.argv.slice(2)))
