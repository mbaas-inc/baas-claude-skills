#!/usr/bin/env node
/**
 * native 스킬 파생 생성 — `baas-integration-sdk` 정본에서 동적 컬렉션 표면을 걷어낸 사본을 만든다.
 *
 * 왜 생성인가: 손으로 관리하는 사본은 정본이 바뀔 때마다 어긋난다(드리프트). 파생 생성이면
 * 정본 한 곳만 고치고 다시 돌리면 되고, `--check` 가 CI 에서 불일치를 잡는다.
 *
 * 왜 스킬만 가르나: 에이전트 게이트는 **표면**이다 — `features.json` 의 `fallback` 이
 * "표면에 없는 기능은 이 스킬 범위 밖" 이라 표면에서 빠지면 우회 코드를 만들지 않는다.
 * SDK 번들(`sdk/`)·채널(`v1`·`next`)은 건드리지 않는다(프로덕션 재빌드 위험 > 번들 크기 이득).
 *
 * 절단 수단이 둘인 이유:
 *   1) 펜스 `<!--collection:start-->…<!--collection:end-->` — 마크다운 본문. 주석이라 렌더 무영향.
 *   2) 문자열 절단(`CUTS`) — YAML 프론트매터·JSON 프로즈처럼 주석을 넣을 수 없는 자리.
 *      **하나라도 못 찾으면 던진다** — 정본 문구가 바뀌었을 때 조용히 새는 것보다 실패가 낫다.
 *
 * 사용:
 *   node scripts/build-native-skill.mjs           # 생성(덮어씀)
 *   node scripts/build-native-skill.mjs --check   # 정본과 일치하는지만 검증(파일 안 씀)
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC_NAME = "baas-integration-sdk";
const DST_NAME = "baas-integration-sdk-native";
const SRC = path.join(ROOT, "skills", SRC_NAME);
const DST = path.join(ROOT, "skills", DST_NAME);
const SUFFIX = "-native";
const CHECK = process.argv.slice(2).includes("--check");
const tag = "[native-skill]";

/** 펜스 구간 — 마커 포함, 마커만 있던 줄의 개행까지 먹어 표·목록이 깨지지 않게 한다. */
const FENCE = /[ \t]*<!--collection:start-->[\s\S]*?<!--collection:end-->[ \t]*\n?/g;

/**
 * 주석을 넣을 수 없는 자리의 문자열 절단. 각 항목은 정확히 1회 나타나야 한다.
 * key 는 실패 메시지용 위치 이름.
 */
const CUTS = {
  "SKILL.md frontmatter (제공 기능)":
    ", 동적 컬렉션(사용자 정의 데이터 모델 — 스키마 정의 + 레코드 CRUD, 고정 기능에 없는 임의 도메인 데이터를 DB처럼 다룸)",
  "SKILL.md frontmatter (Use when)":
    ", 그리고 위 고정 기능(인증·발송대상·문의·게시판·설문·예약·스토어)에 없는 어떤 도메인 데이터든 저장·조회·목록·CRUD가 필요할 때(동적 컬렉션 — 예: 메뉴·포트폴리오·재고·예약목록·고객·일정 등 무엇이든)",
};

/** features.json 의 프로즈 값 절단 — `<경로>` → 잘라낼 문자열들. */
const JSON_CUTS = {
  "data_flow.storage": [" 또는 동적 컬렉션 이미지 필드(string url)"],
  "data_flow.payment": [
    "·커스텀",
    " — 커스텀은 결과 id를 reference로 연결(금액·결제상태를 커스텀 필드에 두고 클라가 쓰는 것 금지=위변조)",
  ],
};

// ── 유틸 ────────────────────────────────────────────────────────────────────

function listFiles(dir) {
  const out = [];
  const walk = (cur) => {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      if (e.name === ".DS_Store") continue;
      const abs = path.join(cur, e.name);
      if (e.isDirectory()) walk(abs);
      else out.push(path.relative(dir, abs));
    }
  };
  walk(dir);
  return out.sort();
}

/** 정확히 1회 절단. 못 찾으면 던진다(정본 변경을 조용히 넘기지 않는다). */
function cutOnce(text, needle, where) {
  const first = text.indexOf(needle);
  if (first === -1) {
    throw new Error(
      `${tag} ✗ 절단 대상을 찾지 못했다 — ${where}\n` +
        `  찾던 문자열: ${JSON.stringify(needle.slice(0, 60))}…\n` +
        `  정본 문구가 바뀌었다면 scripts/build-native-skill.mjs 의 CUTS 를 함께 고쳐라.`,
    );
  }
  if (text.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`${tag} ✗ 절단 대상이 2회 이상 나타난다 — ${where} (모호해서 중단)`);
  }
  return text.slice(0, first) + text.slice(first + needle.length);
}

const SRC_VERSION = JSON.parse(fs.readFileSync(path.join(SRC, "features.json"), "utf8")).version;
const DST_VERSION = SRC_VERSION + SUFFIX;

// ── 변환 ────────────────────────────────────────────────────────────────────

function transformMarkdown(rel, text) {
  let out = text.replace(FENCE, "");
  if (rel === "SKILL.md") {
    for (const [where, needle] of Object.entries(CUTS)) out = cutOnce(out, needle, where);
  }
  // 스킬 이름·버전은 파생물 기준으로 바꾼다 — baas-manifest.json 예시가 정본 이름을 남기면
  // 생성 앱이 자기가 쓴 스킬을 잘못 기록한다.
  out = out.replaceAll(SRC_NAME, DST_NAME);
  out = out.replaceAll(`"skill_version": "${SRC_VERSION}"`, `"skill_version": "${DST_VERSION}"`);
  return out;
}

function transformFeatures(text) {
  const d = JSON.parse(text);

  d.version = DST_VERSION;
  // hook_groups: collection 훅 매핑 제거 → 생성 앱의 features_used 에 collection 이 도출될 수 없다.
  for (const [hook, group] of Object.entries(d.hook_groups)) {
    if (group === "collection") delete d.hook_groups[hook];
  }
  delete d.data_flow.collection;
  delete d.groups.collection;

  for (const [pathStr, needles] of Object.entries(JSON_CUTS)) {
    const [a, b] = pathStr.split(".");
    for (const needle of needles) {
      d[a][b] = cutOnce(d[a][b], needle, `features.json ${pathStr}`);
    }
  }
  return JSON.stringify(d, null, 2) + "\n";
}

/**
 * 과거 버전 노트는 native 라인에 싣지 않는다.
 *
 * 마이그레이션 노트는 "이 스킬 라인의 **이전 버전으로 생성된 앱**"을 갱신하기 위한 것이다.
 * native 라인은 v1.4.0-native 가 첫 릴리스라 이전 버전으로 만든 앱이 존재할 수 없다 —
 * 실을 이유가 없고, 실으면 지워진 컬렉션 표면을 참조하는 문서가 남는다.
 * 규약 문서(`migrations/README.md`)는 남긴다 — 앞으로의 노트 작성 형식이 여기 있다.
 */
function skipMigration(rel) {
  return rel.startsWith("migrations/") && rel !== "migrations/README.md";
}

/** 파생물 전체를 { 상대경로: 내용 } 으로 만든다. */
function generate() {
  const files = {};
  const skipped = [];
  for (const rel of listFiles(SRC)) {
    const text = fs.readFileSync(path.join(SRC, rel), "utf8");
    if (skipMigration(rel)) {
      skipped.push(rel);
      continue;
    }
    if (rel === "features.json") files[rel] = transformFeatures(text);
    else if (rel.endsWith(".md")) files[rel] = transformMarkdown(rel, text);
    else files[rel] = text;
  }
  return { files, skipped };
}

// ── 실행 ────────────────────────────────────────────────────────────────────

let generated;
try {
  generated = generate();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const { files, skipped } = generated;

// 남은 누출 검사 — 펜스·CUTS 를 다 통과해도 새 문구가 들어오면 여기서 걸린다.
const LEAK = /useCollection|동적 컬렉션|"collection"|`collection`/;
const leaks = Object.entries(files).filter(([, t]) => LEAK.test(t)).map(([rel]) => rel);
if (leaks.length) {
  console.error(`${tag} ✗ 파생물에 컬렉션 표면이 남았다: ${leaks.join(", ")}`);
  console.error(`${tag}   해당 서술을 정본에서 펜스로 감싸거나 CUTS 에 추가해라.`);
  process.exit(1);
}

if (CHECK) {
  if (!fs.existsSync(DST)) {
    console.error(`${tag} ✗ 파생물이 없다: skills/${DST_NAME} — 먼저 생성해라`);
    process.exit(1);
  }
  const have = listFiles(DST);
  const want = Object.keys(files).sort();
  const problems = [];
  for (const rel of want) if (!have.includes(rel)) problems.push(`누락: ${rel}`);
  for (const rel of have) if (!want.includes(rel)) problems.push(`잉여: ${rel}`);
  for (const rel of want) {
    if (!have.includes(rel)) continue;
    if (fs.readFileSync(path.join(DST, rel), "utf8") !== files[rel]) problems.push(`불일치: ${rel}`);
  }
  if (problems.length) {
    console.error(`${tag} ✗ 정본과 파생물이 어긋났다 (v${DST_VERSION})`);
    for (const p of problems) console.error(`${tag}   ${p}`);
    console.error(`${tag}   고치려면: node scripts/build-native-skill.mjs`);
    process.exit(1);
  }
  console.log(`${tag} ✓ 정본과 일치 (v${DST_VERSION}, ${want.length}개 파일)`);
  process.exit(0);
}

fs.rmSync(DST, { recursive: true, force: true });
for (const [rel, text] of Object.entries(files)) {
  const abs = path.join(DST, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}
console.log(`${tag} ✓ 생성 완료 — skills/${DST_NAME} (v${DST_VERSION}, ${Object.keys(files).length}개 파일)`);
if (skipped.length) console.log(`${tag}   제외한 마이그레이션: ${skipped.join(", ")}`);
