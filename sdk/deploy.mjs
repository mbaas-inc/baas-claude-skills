/**
 * SDK 배포 — S3 업로드(불변 경로 + 가변 별칭) + CloudFront 무효화.
 * 실제 버킷/배포는 환경변수로 주입(하드코딩 금지 — 팀이 dev/prod 별로 지정).
 *
 * 사용:
 *   SDK_VERSION=0.3.0 \
 *   SDK_S3_BUCKET=<버킷> SDK_CF_DISTRIBUTION=<배포ID> [SDK_CHANNEL=v1] [SDK_S3_PREFIX=sdk] \
 *   node deploy.mjs
 *
 * 산출 경로:
 *   s3://<bucket>/<prefix>/<version>/baas-*.js        (불변, 장기 캐시)
 *   s3://<bucket>/<prefix>/<channel>/baas-*.js         (가변 별칭, 짧은 캐시 + 무효화)
 *
 * 전제: dist/ 가 이미 빌드됨(SDK_VERSION 과 동일 버전으로). aws CLI 설치·자격증명 필요.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// mbaas 실제 CDN 기본값 — cdn.mbaas.kr 의 /public/* 동작이 mbaas-file-bucket 으로 라우팅.
// URL: https://cdn.mbaas.kr/public/baas-integration-sdk/<version|v1>/baas-react.js
const version = process.env.SDK_VERSION;
const bucket = process.env.SDK_S3_BUCKET || "mbaas-file-bucket";
const distribution = process.env.SDK_CF_DISTRIBUTION || "E3O4WUZ5YOS1S";
const channel = process.env.SDK_CHANNEL || "v1";
const prefix = process.env.SDK_S3_PREFIX || "public/baas-integration-sdk";

if (!version || !bucket) {
  console.error("SDK_VERSION, SDK_S3_BUCKET 는 필수입니다.");
  process.exit(1);
}
if (!existsSync("dist")) {
  console.error("dist/ 가 없습니다. 먼저 `SDK_VERSION=" + version + " node build.mjs` 로 빌드하세요.");
  process.exit(1);
}

const assets = readdirSync("dist").filter((f) => f.endsWith(".js") || f.endsWith(".js.map"));
const sh = (args) => execFileSync("aws", args, { stdio: "inherit" });

// 0) 불변 경로 보호 — 같은 버전이 이미 '다른 내용'으로 있으면 실패(버전 bump 누락 감지).
//    동일 내용 재배포는 허용(멱등). ETag(단일파트 업로드 = MD5) 와 로컬 MD5 비교.
//    이게 없으면 버전을 안 올린 채 소스가 바뀌어 재배포될 때 불변 스냅샷이 오염된다.
const localMd5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");
const remoteETag = (key) => {
  try {
    return execFileSync("aws", ["s3api", "head-object", "--bucket", bucket, "--key", key,
      "--query", "ETag", "--output", "text"], { encoding: "utf8" }).trim().replace(/"/g, "");
  } catch { return null; } // 없음(신규 버전)
};
for (const f of assets) {
  const et = remoteETag(`${prefix}/${version}/${f}`);
  if (et && et !== localMd5(`dist/${f}`)) {
    console.error(
      `❌ 불변 경로 충돌: s3://${bucket}/${prefix}/${version}/${f} 가 다른 내용으로 이미 존재합니다.\n` +
      `   같은 버전에 다른 빌드를 올릴 수 없습니다 — SDK_VERSION(package.json version) 을 올리세요.`
    );
    process.exit(1);
  }
}

// 1) 불변 경로 (장기 캐시)
for (const f of assets) {
  sh(["s3", "cp", `dist/${f}`, `s3://${bucket}/${prefix}/${version}/${f}`,
      "--cache-control", "public,max-age=31536000,immutable"]);
}
// 2) 가변 별칭 (짧은 캐시 — push 시 무효화로 갱신)
for (const f of assets) {
  sh(["s3", "cp", `dist/${f}`, `s3://${bucket}/${prefix}/${channel}/${f}`,
      "--cache-control", "public,max-age=60"]);
}
// 3) CloudFront 무효화 (별칭 경로만)
if (distribution) {
  sh(["cloudfront", "create-invalidation", "--distribution-id", distribution,
      "--paths", `/${prefix}/${channel}/*`]);
} else {
  console.warn("SDK_CF_DISTRIBUTION 미지정 — 무효화 생략(별칭 캐시 TTL 만료까지 지연 반영).");
}

const cdnHost = process.env.SDK_CDN_HOST || "https://cdn.mbaas.kr";
console.log(`\n✅ 배포 완료: ${version} → s3://${bucket}/${prefix}/{${version},${channel}}/`);
console.log(`   앱 참조: ${cdnHost}/${prefix}/${channel}/baas-react.js`);
