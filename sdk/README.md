# @mbaas/baas-web-sdk

BaaS 프론트 SDK — 런타임 CDN에서 로드되는 **부패 방지 계층**. transport(fetch·envelope·에러 매핑·DTO)와 React 훅을 한 곳에 두어, API 스펙이 바뀌어도 **CDN push 1회로 전 앱에 반영**(O(1))한다. 생성 앱은 이 SDK를 `<script>`로 로드하고 `window.BaasSDK` 표면만 호출한다.

`baas-integration-sdk` 스킬이 이 SDK 표면 위에서 UI를 생성한다. (기존 `baas-integration` 스킬은 transport를 프로젝트에 복사(vendored)했다 — 이 SDK가 그 방식을 대체한다.)

## 구조
- `src/core/` — framework 무관: config(project_id 해석)·http(fetch·envelope·`X-Baas-Sdk-Version` 헤더)·auth·board·notice·recipient·survey·reservation·store
- `src/react/` — host React 사용(번들 미포함): AuthProvider·useAuth·RequireAuth + 기능별 훅
- 빌드: `baas-core.js`(전역 `BaasCore`) / `baas-react.js`(전역 `window.BaasSDK`) IIFE + ESM

## 개발
```bash
npm install
npm run typecheck        # tsc --noEmit
npm test                 # core 계약 테스트 (node --test)
SDK_VERSION=0.3.0 npm run build   # → dist/
```

## 버전·전파 모델
- **불변 경로** `/<prefix>/<version>/baas-react.js` — 장기 캐시(immutable)
- **가변 별칭** `/<prefix>/<channel>/baas-react.js`(예: `v1`) — 짧은 캐시 + push 시 무효화. 생성 앱은 별칭을 참조.
- **메이저 승격**(v1→v2)만 새 별칭. 마이너/패치는 v1 별칭 갱신으로 자동 전파.
- 모든 요청에 `X-Baas-Sdk-Version` 헤더 → 서버 로그로 프로젝트별 실사용 버전 파악.

## 배포 (S3 + CloudFront)
버킷/배포는 하드코딩하지 않는다 — 환경변수/CI 변수로 주입.
```bash
SDK_VERSION=0.3.0 npm run build
SDK_VERSION=0.3.0 SDK_S3_BUCKET=<버킷> SDK_CF_DISTRIBUTION=<배포ID> \
  SDK_CHANNEL=v1 SDK_S3_PREFIX=sdk npm run deploy
```
CI: `sdk-vX.Y.Z` 태그 push → `.github/workflows/sdk-release.yml` 가 빌드·검증·배포.
필요 설정 — Secrets: `SDK_DEPLOY_ROLE_ARN` / Variables: `SDK_AWS_REGION`·`SDK_S3_BUCKET`·`SDK_CF_DISTRIBUTION`·`SDK_CHANNEL`·`SDK_S3_PREFIX`.

## 롤백
별칭을 이전 불변 버전으로 되돌린다(불변 경로는 그대로 있으므로 즉시 복구):
```bash
aws s3 cp s3://<버킷>/sdk/<이전버전>/baas-react.js s3://<버킷>/sdk/v1/baas-react.js --cache-control public,max-age=60
aws cloudfront create-invalidation --distribution-id <배포ID> --paths "/sdk/v1/*"
```
