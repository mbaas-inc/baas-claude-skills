# BaaS 프론트 SDK — 개요 · 설계 · 운영

이 문서는 런타임 CDN SDK(`@mbaas/baas-web-sdk`)와 `baas-integration-sdk` 스킬의 **단일 기준 문서**다.
코드 레벨 빌드/배포 절차는 [`sdk/README.md`](../sdk/README.md), AI Studio 팀 전달분은 [`docs/ai-studio-sdk-handoff.md`](ai-studio-sdk-handoff.md).

---

## 1. 왜 (문제와 목표)

**문제**: 기존 `baas-integration` 스킬은 transport(fetch 배관·envelope·에러 매핑·DTO)를 프로젝트 소스에 **복사(vendored)**한다. 그래서
- 스킬/백엔드 API가 바뀌면 이미 배포된 앱에 자동 반영되지 않는다(구버전 프론트가 멈질 수 있음).
- 고치려면 앱마다 재생성·재빌드·재배포 → 비용이 프로젝트 수 **N에 비례(O(N))**.

**목표**: 깨지는 변경을 전 프로젝트가 공유하는 한 곳(런타임 CDN SDK)으로 몰아넣어, **CDN push 1회로 전 앱 반영(O(1))**. LLM 재생성·재빌드 0.

**transport란**: "백엔드와 어떻게 대화하는가" — fetch/URL 조립·`credentials`·헤더·envelope(`{result,data,message}`) 처리·project_id 주입·인증 캐시·DTO. UI(화면)는 여기 포함되지 않는다.

---

## 2. 아키텍처 — 두 계층

분리 기준: "UI가 건드리나(→스킬) / 순수 백엔드 대화인가(→SDK)".

| 계층 | 소유 | 내용 | 바뀌는 이유 | 전파 |
|---|---|---|---|---|
| **SDK** (`sdk/`, CDN 런타임) | 우리 | core(fetch·envelope·에러·DTO·project_id) + react(AuthProvider·훅) | API 스펙 변경 | CDN push 1회 → 전 앱 자동 |
| **스킬** (`skills/baas-integration-sdk`) | 우리 | SDK 표면 위 UI/UX 생성 가이드 | 신규 기능·구조 규약 | 앱빌더 재생성(드묾) |

- 앱은 SDK를 `<script>`로 로드하고 `window.BaasSDK` 표면만 호출 → 앱 소스에 transport 코드 0.
- `config`(project_id)는 코드가 아닌 데이터라 앱에 남는다(meta 태그).
- 기존 `baas-integration` 스킬/플러그인은 **무변경**. 신규 플러그인 병행(비파괴). 두 스킬을 한 프로젝트에 섞지 않는다.

---

## 3. 기존 스킬과의 차이 (요약)

목적·UI 생성 방식은 동일하고, **transport 위치만** 다르다.

| | 기존 baas-integration | baas-integration-sdk |
|---|---|---|
| transport | 프로젝트에 복사(~2,100줄) | CDN SDK, 앱엔 0줄 |
| 스킬이 주는 것 | API 스펙(references) → LLM이 fetch 재현 | SDK 표면(훅 시그니처) → LLM이 호출만 |
| 업데이트 전파 | O(N) (앱마다 수정·재배포) | O(1) (CDN 1회) |
| 버전 추적 | 불가 | `X-Baas-Sdk-Version` 헤더 |

같은 것: 커버 기능, UI 생성 흐름(features.json→표면→UI), 생성 품질, dev 백엔드 동작.

---

## 4. 버전 · 전파 모델

**같은 산출물을 두 경로에 올린다** (도커 `image:1.2.3` vs `image:latest` 관계):

| 경로 | 성격 | 캐시 | 용도 |
|---|---|---|---|
| `/public/baas-integration-sdk/<version>/baas-react.js` | 불변(고정) | 1년 immutable | 롤백 대상·버전 핀 |
| `/public/baas-integration-sdk/v1/baas-react.js` | 가변 별칭(최신 v1.x) | 60s + 무효화 | **앱이 참조** → 자동 업데이트 |

**왜 둘 다**: 별칭만 있으면 O(1) 전파는 되지만 ① 깨졌을 때 되돌릴 대상이 없고 ② 특정 앱을 특정 버전에 못 묶는다. 불변 경로가 안전장치.

**자동 업데이트 메커니즘** (S3엔 심링크가 없어 "덮어쓰기"로 구현):
```
새 버전 배포 시:
1) <version>/baas-react.js 업로드      (불변 스냅샷)
2) v1/baas-react.js 덮어쓰기            ← 앱이 보는 파일을 새 내용으로 교체
3) CloudFront 무효화 /v1/*              ← 엣지 캐시의 옛 파일 제거
→ 사용자 새로고침 시 브라우저가 v1 URL에서 새 SDK 수신 (앱 재빌드·재배포 0)
```
- 마이너/패치는 `v1` 갱신으로 자동 전파. **메이저(호환 깨짐)만** 새 별칭 `v2`.
- 모든 요청에 `X-Baas-Sdk-Version` 헤더 → 서버 로그로 프로젝트별 실사용 버전 파악.

---

## 5. 배포 (자동화 — 우리 CI 소유)

- **트리거**: `sdk-vX.Y.Z` 태그 push 또는 Actions 수동 실행 → 빌드·typecheck·test·업로드(불변+별칭)·무효화. (`.github/workflows/sdk-release.yml`)
- **대상 인프라** (deploy.mjs 기본값): S3 `mbaas-file-bucket/public/baas-integration-sdk/`, CloudFront `E3O4WUZ5YOS1S`(cdn.mbaas.kr `/public/*` 동작), 별칭 `v1`.
- **최초 1회 설정**: GitHub Secret `SDK_DEPLOY_ROLE_ARN`(S3 put + CloudFront 무효화 권한 OIDC role).
- **롤백**: 별칭을 이전 불변 버전으로 되돌림 →
  ```
  aws s3 cp s3://mbaas-file-bucket/public/baas-integration-sdk/<이전>/baas-react.js \
            s3://mbaas-file-bucket/public/baas-integration-sdk/v1/baas-react.js --cache-control max-age=60
  aws cloudfront create-invalidation --distribution-id E3O4WUZ5YOS1S --paths "/public/baas-integration-sdk/v1/*"
  ```

---

## 6. 마이그레이션 — 변경 성격별 처리

"자동 업데이트"는 한 종류가 아니다. transport 변경만 완전 자동이고, UI 변경은 매니페스트로 범위를 좁혀 최소 비용으로 처리한다.

생성 시 앱에 `baas-manifest.json`(`skill_version`·`sdk_channel`·`features_used`) 기록 →
앱빌더가 매니페스트 vs 최신 스킬을 **diff(LLM 0)** → 영향 기능 교집합만 대상.

| Tier | 변경 | 처리 | 비용 |
|---|---|---|---|
| 0 | API/transport | SDK CDN push | LLM 0 · 재빌드 0 (완전 자동) |
| 1 | 기계적 UI(이름·props·import) | codemod 스크립트 + 재빌드 | LLM 0 |
| 2 | 국소 UI 로직 | 교집합 파일만 LLM 수정 + 마이그레이션 노트 | 소량 |
| 3 | 구조 재설계 | 전체 재생성 | 사용자 동의 |

- codemod = 코드 구조를 이해해 기계적으로 변환하는 스크립트(jscodeshift). "모든 X를 Y로" 같은 규칙적 변경에만 유효.
- 스킬 저작 규약: 버전 올릴 때 `migrations/`에 변경 기능·Tier·codemod/노트를 기록. ([migrations/README.md](../skills/baas-integration-sdk/migrations/README.md))
- **책임 경계**: Tier 0(SDK 배포)은 우리 CI. Tier 1~3(매니페스트 비교 UI·codemod 러너)은 AI Studio 앱빌더 구현.

---

## 7. 커버 기능 / 표면

인증(회원가입·로그인·로그아웃·내정보·비번변경), 발송대상, 공지/FAQ, 동적게시판(FREE/REVIEW)·댓글, 설문, 예약(슬롯·토스결제), 스토어(상품·토스결제·주문).
표면 시그니처·에러→UI 규약: [`skills/baas-integration-sdk/reference/sdk-surface.md`](../skills/baas-integration-sdk/reference/sdk-surface.md).
게시판 board_id 등 백엔드 리소스는 `baas` CLI로 생성해 코드에 주입(별도 repo).

---

## 8. 트레이드오프 (공짜 아님)

- **런타임 CDN 의존**: 앱이 실행 시 SDK를 CDN에서 로드 → CDN 장애 시 영향. 완화 = 로드 실패 폴백 화면(스캐폴드) + 불변 별칭 롤백.
- **스캐폴드 배선 필요**: index.html SDK 스크립트 + host React 노출 + init (앱빌더 소유 고정 코드).
- **표면 계약 고정**: SDK 표면이 새 "동결 계약" — 메이저 내 하위호환 영구 유지 책임.

---

## 9. 벤치마크 요약 (2026-07-09, 동일 요청 A/B)

| 지표 | 기존(vendored) | SDK |
|---|---|---|
| 생성 토큰 | 118k | 71k (−40%) |
| 앱 소스 | 2,793줄 | 1,025줄 (−63%) |
| transport | 2,100줄 | 0줄 |
| 빌드(실 파이프라인) | 통과 | 통과 |
| 유지보수 전파 | O(N) | O(1) |

- 생성 한 번은 소폭 우위, **결정적 차이는 배포 이후 전파 비용**.
- 빌드는 두 방식 모두 통과 — 차별점 아님(초판의 "빌드 실패"는 동적게시판 템플릿을 verbatim 복사할 때만 나는 별도 JSDoc 버그였고 정정함).

---

## 10. 현재 상태 · 남은 것 · 범위

- ✅ SDK 전 기능 이식(core+react, 18 테스트) · 스킬 작성 · CI 배포 자동화 · dev DB 티켓/CLI 검증 · PoC(A/B/C)·글루 E2E·A/B 벤치마크.
- ⬜ 첫 CDN 시딩(v0.3.0) · GitHub `SDK_DEPLOY_ROLE_ARN` 설정 · AI Studio 앱빌더 배선/매니페스트 UI · 기존 템플릿 JSDoc 버그 수정(별도).
- **범위 밖**: 기존 스킬·운영 프로젝트 무변경(서버 구경로 호환으로 레거시 보호), baas-cli/티켓 시스템은 형제 관계로 별도.

## 참고 파일
- 코드/빌드/배포: [`sdk/README.md`](../sdk/README.md)
- AI Studio 전달: [`docs/ai-studio-sdk-handoff.md`](ai-studio-sdk-handoff.md)
- 스킬 표면·배선·마이그레이션: `skills/baas-integration-sdk/{reference,scaffold,migrations}/`
