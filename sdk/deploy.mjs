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
import { existsSync, readdirSync } from "node:fs";

const version = process.env.SDK_VERSION;
const bucket = process.env.SDK_S3_BUCKET;
const distribution = process.env.SDK_CF_DISTRIBUTION;
const channel = process.env.SDK_CHANNEL || "v1";
const prefix = process.env.SDK_S3_PREFIX || "sdk";

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

console.log(`\n✅ 배포 완료: ${version} → s3://${bucket}/${prefix}/{${version},${channel}}/`);
console.log(`   앱 참조: https://<cdn-host>/${prefix}/${channel}/baas-react.js`);
