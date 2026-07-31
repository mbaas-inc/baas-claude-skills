# baas-claude-skills

**mBaaS AI Studio**가 앱을 생성할 때 사용하는 **BaaS 통합 스킬 모음 + 런타임 프론트 SDK**. Claude Code 플러그인 마켓플레이스(`baas-agent-skills`)로 배포되며, AI Studio(및 Claude Code)가 이 스킬들을 로드해 BaaS 백엔드(회원 인증·게시판·예약·스토어·설문 등)와 연동되는 프론트엔드를 생성한다.

## 두 가지 통합 방식

BaaS 연동은 **transport(fetch·envelope·에러 매핑·DTO)를 어디에 두느냐**로 갈린다. 이 repo는 두 방식을 모두 제공한다.

| 방식 | 스킬 | transport 위치 | 변경 전파 |
|------|------|----------------|-----------|
| **API 방식** (기존) | `baas-integration`, `baas-*` | 생성 앱에 **복사(vendored)** | API가 바뀌면 앱마다 재생성 필요 |
| **SDK 방식** (권장) | `baas-integration-sdk` + [`sdk/`](sdk/) | 런타임 **CDN SDK**(`@mbaas/baas-web-sdk`) | **CDN push 1회로 전 앱 반영(O(1))** — 앱 재빌드 0 |

SDK 방식은 생성 앱이 `<script>`로 SDK를 로드하고 `window.BaasSDK` 표면만 호출하므로, API 스펙이 바뀌어도 앱을 다시 만들지 않는다. 자세한 배경은 [`docs/baas-sdk-overview.md`](docs/baas-sdk-overview.md) 참고.

## 저장소 구조

```
skills/        BaaS 통합 스킬 (Claude Code SKILL.md)
sdk/           @mbaas/baas-web-sdk — 런타임 CDN 프론트 SDK 소스 + 빌드/배포 도구
docs/          설계·운영·핸드오프 문서
.github/workflows/sdk-cd.yml        브랜치 CD — stage→next 배포, main→v1 승격 (정상 경로)
.github/workflows/sdk-release.yml   sdk-v* 태그 push 시 빌드→배포 (핫픽스·롤백 예외 경로)
.claude-plugin/                     마켓플레이스/플러그인 매니페스트
```

## 제공 스킬

| 스킬 | 방식 | 용도 |
|------|------|------|
| `baas-integration-sdk` | **SDK** | 런타임 CDN SDK 위에서 BaaS UI/UX 생성 — 인증(AuthProvider 전역 상태)·발송대상·공지/FAQ·동적 게시판·댓글·설문·예약(토스 결제)·스토어 |
| `baas-integration` | API | 회원 인증 + 발송대상 + 게시판 + 설문 + 예약 + 스토어 통합 (transport vendored) |
| `baas-common` | API | 공통 타입과 API 규칙 — 다른 BaaS 스킬과 함께 사용 |
| `baas-account-integrations` | API | 회원 인증 통합 (회원가입·로그인·로그아웃·계정정보) |
| `baas-signup` / `baas-login` / `baas-logout` | API | 개별 인증 API |
| `baas-account-info` | API | 계정정보 조회 API |
| `baas-recipient` | API | 발송대상(연락처) 등록 API — 문의·예약 접수·뉴스레터 구독 |

## SDK 배포

`sdk/`의 `@mbaas/baas-web-sdk`는 **브랜치 CD**로 배포된다([`sdk-cd.yml`](.github/workflows/sdk-cd.yml), 버전 = `sdk/package.json`).

| 트리거 | 동작 | 영향 |
|---|---|---|
| `stage` 머지 | 빌드·검증 → 불변 `/<version>/` + **`next` 채널** 배포 | dev 검증. `v1` 무영향 |
| `main` 머지 | 검증된 불변 `/<version>/` 를 **`v1` 채널로 승격**(재빌드 없이 복사) | **프로덕션 반영** |

- **`main` 머지 = 프로덕션 승격이다.** 별도 태그 push가 필요 없다.
- 트리거 조건: 머지 diff에 `sdk/**`가 포함되어야 한다. 문서만 바꾸면 CD가 돌지 않아 채널이 갱신되지 않는다.
- **예외(핫픽스·롤백·수동)**: `sdk-vX.Y.Z` 태그 push → [`sdk-release.yml`](.github/workflows/sdk-release.yml). 이 경로는 **빌드부터 새로 하며 기본 채널이 `v1`** 이라, 잘못 밀면 프로덕션이 즉시 덮인다.
- 롤백: `SDK_VERSION=<이전버전> SDK_CHANNEL=v1 npm run promote` (불변 경로에서 복사, 수동)
- 앱 참조 URL: `https://cdn.mbaas.kr/public/baas-integration-sdk/v1/baas-react.js` (환경별 주입 — dev=`next`, prod=`v1`)
- 코드 레벨 빌드/배포 상세: [`sdk/README.md`](sdk/README.md)

## 문서

- [`docs/baas-sdk-overview.md`](docs/baas-sdk-overview.md) — SDK·`baas-integration-sdk` 스킬의 단일 기준 문서 (개요·설계·운영)
- [`docs/ai-studio-sdk-handoff.md`](docs/ai-studio-sdk-handoff.md) — AI Studio 팀 전달용 연동 계약·할 일

## 브랜치 컨벤션

- 작업 → `stage` → `main` (릴리스는 `stage` → `main` **Squash merge**)
- **SDK 배포가 이 흐름에 실려 있다** — `stage` 머지 = `next` 배포, `main` 머지 = `v1` 승격(프로덕션)
