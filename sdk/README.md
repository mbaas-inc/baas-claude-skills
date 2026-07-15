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
**같은 산출물을 두 경로에 올린다** — 목적이 다르다(도커 `image:1.2.3` vs `image:latest` 관계):

| 경로 | 성격 | 캐시 | 용도 |
|---|---|---|---|
| `/<prefix>/<version>/baas-react.js` (예: `/0.3.0/`) | **불변**(고정 버전) | 1년(immutable) | 롤백 대상·버전 고정 |
| `/<prefix>/<channel>/baas-react.js` (예: `/v1/`) | **가변 별칭**(최신 v1.x) | 60s + 무효화 | **생성 앱이 참조** → CDN push로 자동 업데이트 |

- **왜 둘 다**: 별칭(`v1`)만 있으면 O(1) 전파는 되지만 ① 깨졌을 때 되돌릴 대상이 없고 ② 특정 앱을 특정 버전에 묶을 수 없다. 불변 경로가 그 안전장치(롤백 소스·버전 핀).
- 정상 운영에서 앱이 보는 건 `v1` 하나. `<version>`은 뒤의 스냅샷.
- **메이저 승격**(v1→v2, 호환 깨짐)만 새 별칭. 마이너/패치는 `v1` 갱신으로 자동 전파.
- 모든 요청에 `X-Baas-Sdk-Version` 헤더 → 서버 로그로 프로젝트별 실사용 버전 파악.

## 배포 (S3 + CloudFront) — mbaas CDN
deploy.mjs 에 실제 대상이 기본값으로 박혀 있다(다른 대상은 env override):
- 버킷 `mbaas-file-bucket`, prefix `public/baas-integration-sdk`, CloudFront `E3O4WUZ5YOS1S`, 별칭 `v1`
- cdn.mbaas.kr 의 `/public/*` 동작이 이 버킷으로 라우팅 → URL `https://cdn.mbaas.kr/public/baas-integration-sdk/<version|v1>/baas-react.js`

```bash
# 수동/로컬 (특정 채널·버전 지정 배포)
SDK_VERSION=0.4.0 npm run build
SDK_VERSION=0.4.0 SDK_CHANNEL=next npm run deploy   # 예: next 채널로 배포 + 무효화
```

**자동화 (권장) — 브랜치 CD** (`.github/workflows/sdk-cd.yml`, 버전 = `package.json`):
- `stage` 머지 → `next` 채널 + 불변 `/<version>/` 배포(dev 검증). `v1` 무영향.
- `main` 머지 → 검증된 불변 `/<version>/` 를 `v1` 로 **승격**(재빌드 없이 복사, `npm run promote`).

**예외 — 태그/수동** (`.github/workflows/sdk-release.yml`, `/sdk-release` 스킬): 핫픽스·특정 버전 수동 배포·새 메이저 채널·롤백. `sdk-vX.Y.Z` 태그 push 또는 Actions 수동 실행.

최초 1회 설정:
- Secret `SDK_DEPLOY_ROLE_ARN`: S3 put(`public/baas-integration-sdk/*`) + CloudFront `CreateInvalidation` 권한 role(GitHub OIDC 신뢰). mbaas 공통 롤 `GitHubAction-AssumeRoleWithAction` 재사용 가능.
- (선택) Variables 로 배포 대상 override — 미설정 시 deploy.mjs 기본값 사용

## 롤백
`v1` 별칭을 이전 정상 불변 버전으로 되돌린다(불변 경로가 남아 있어 재빌드 없이 즉시 복구) — `promote.mjs`:
```bash
SDK_VERSION=<이전정상버전> SDK_CHANNEL=v1 npm run promote
```
