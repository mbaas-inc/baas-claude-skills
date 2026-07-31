/**
 * SDK 승격 — 검증 완료된 불변 버전(/<version>/)을 가변 채널(기본 v1)로 복사 + CloudFront 무효화.
 * 재빌드하지 않는다 — next 채널 등에서 검증한 "그 산출물"을 그대로 프로덕션 채널로 올려
 * "검증한 것 == 배포되는 것"을 보장한다.
 *
 * 사용:
 *   SDK_VERSION=0.4.0 [SDK_CHANNEL=v1] \
 *   [SDK_S3_BUCKET=…] [SDK_CF_DISTRIBUTION=…] [SDK_S3_PREFIX=…] node promote.mjs
 *
 * 동작:
 *   s3://<bucket>/<prefix>/<version>/*  →  s3://<bucket>/<prefix>/<channel>/*  (S3 서버측 복사)
 *   + CloudFront 무효화 (/<prefix>/<channel>/*)
 *
 * 전제: /<version>/ 불변 경로가 이미 존재해야 한다(먼저 next 등으로 배포·검증된 상태).
 * 기본값은 deploy.mjs 와 동일 — 하드코딩 대신 env override 가능.
 */
import { execFileSync } from "node:child_process";

const version = process.env.SDK_VERSION;
const bucket = process.env.SDK_S3_BUCKET || "mbaas-file-bucket";
const distribution = process.env.SDK_CF_DISTRIBUTION || "E3O4WUZ5YOS1S";
const channel = process.env.SDK_CHANNEL || "v1";
const prefix = process.env.SDK_S3_PREFIX || "public/baas-integration-sdk";

if (!version) {
  console.error("SDK_VERSION 는 필수입니다.");
  process.exit(1);
}

const sh = (args) => execFileSync("aws", args, { stdio: "inherit" });

const srcPrefix = `s3://${bucket}/${prefix}/${version}/`;
const dstPrefix = `s3://${bucket}/${prefix}/${channel}/`;

// 0) 검증된 불변 버전이 존재하는지 확인 — 없으면 승격 불가(먼저 배포·검증 필요).
let exists = false;
try {
  const out = execFileSync("aws", ["s3", "ls", `${srcPrefix}baas-react.js`], { encoding: "utf8" }).trim();
  exists = out.length > 0;
} catch {
  exists = false;
}
if (!exists) {
  console.error(
    `승격 불가: ${srcPrefix}baas-react.js 가 없습니다.\n` +
    `먼저 이 버전을 배포(예: SDK_CHANNEL=next 로 deploy)해 검증하세요.`
  );
  process.exit(1);
}

// 1) 불변 /<version>/ → 가변 /<channel>/ 서버측 복사 (가변 캐시 정책)
sh(["s3", "cp", srcPrefix, dstPrefix, "--recursive",
    "--cache-control", "public,max-age=60"]);

// 2) CloudFront 무효화 (채널 경로만)
if (distribution) {
  sh(["cloudfront", "create-invalidation", "--distribution-id", distribution,
      "--paths", `/${prefix}/${channel}/*`]);
} else {
  console.warn("SDK_CF_DISTRIBUTION 미지정 — 무효화 생략(별칭 캐시 TTL 만료까지 지연 반영).");
}

const cdnHost = process.env.SDK_CDN_HOST || "https://cdn.mbaas.kr";
console.log(`\n✅ 승격 완료: ${version} → 채널 '${channel}' (재빌드 없음)`);
console.log(`   앱 참조: ${cdnHost}/${prefix}/${channel}/baas-react.js`);
