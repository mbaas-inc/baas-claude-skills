# AI Studio 연동 핸드오프 — BaaS SDK + baas-integration-sdk 스킬

런타임 CDN SDK로 BaaS 프론트 transport를 올려, 스킬/API 변경 전파를 O(1)로 만드는 전환.
이 문서는 **AI Studio 팀 전달용**(할 일·연동 계약만). 설계 배경·버전/배포 전체 그림은 [baas-sdk-overview.md](baas-sdk-overview.md).

**책임 경계 (요약)**
- **우리(baas-claude-skills)**: SDK 개발 + 스킬 + **CDN 자동 배포(CI)**. AI Studio가 배포에 관여하지 않는다.
- **AI Studio 팀**: ① 플러그인으로 로컬 기술 검증(§1) ② 앱빌더 스캐폴드에 SDK 배선 반영(§3) ③ 버전 매니페스트 비교·마이그레이션 UI(§5) ④ 생성 앱이 CDN URL(§2)을 소비.

즉 AI Studio는 **SDK를 소비·검증하고 앱빌더에 배선**할 뿐, SDK 자체의 배포/버전 릴리스는 우리 CI가 자동 수행한다.

## 0. 구성요소 (역할)
| 요소 | 소유 | 역할 |
|---|---|---|
| `sdk/` (@mbaas/baas-web-sdk) | 우리 | 런타임 CDN transport + React 훅 (`window.BaasSDK`) |
| `skills/baas-integration-sdk` | 우리 | SDK 표면 위 UI 생성 가이드(플러그인) |
| 앱빌더 스캐폴드 | **AI Studio** | SDK `<script>` 로딩·host React 노출·init (아래 §3) |
| 버전 매니페스트 비교 UI / codemod 러너 | **AI Studio** | 업데이트 판정·적용 (아래 §5) |

기존 `baas-integration` 스킬/플러그인은 무변경 — 신규 `baas-integration-sdk-skills` 플러그인 병행(marketplace.json). 전환 전까지 기존 스킬이 생성 담당, 전환 후 두 스킬을 한 프로젝트에 섞지 않는다.

## 1. 로컬 기술 검증 (플러그인)
1. `baas-claude-skills` 를 마켓플레이스로 추가 → `baas-integration-sdk-skills` 플러그인 활성화.
2. SDK 로컬 빌드: `cd sdk && npm install && npm run build` → `dist/baas-react.js`.
3. Vite React 앱 생성 요청(예: "로그인 + 자유게시판 사이트")을 에이전트에 주면, 스킬이 SDK 표면으로 UI를 생성한다(transport 코드 0).
4. 로컬 서빙: `dist/baas-react.js` 를 앱의 `/sdk/baas-react.js` 로 두고, `/aiapp-baas/*` 를 dev 프로젝트 도메인으로 프록시(host 보존 + 쿠키 Domain/Secure/SameSite 로컬화). 로그인·게시판 CRUD가 dev 백엔드로 동작하는지 확인.
   - 참조 구현: 우리 PoC 서버(host 보존 프록시 + Set-Cookie 재작성)와 A/B 테스트 절차.

## 2. SDK 배포 — 자동화됨 (AI Studio 팀 불필요)
SDK 배포는 **우리(baas-claude-skills repo) CI가 자동 수행**한다. AI Studio 팀은 배포에 관여하지 않고, 아래 URL을 소비만 한다:
```
https://cdn.mbaas.kr/public/baas-integration-sdk/v1/baas-react.js   ← 앱은 이걸 참조(별칭, 자동 업데이트)
https://cdn.mbaas.kr/public/baas-integration-sdk/<version>/baas-react.js  (불변 스냅샷 — 롤백·버전 고정용)
```
- **두 경로 = 같은 산출물, 목적만 다름**: 별칭 `v1`은 최신 v1.x를 가리켜 CDN push로 전 앱 자동 반영(O(1)). 불변 `<version>`은 롤백 대상·버전 핀(별칭이 깨지면 `v1 ← 이전 version`으로 되돌림). 앱빌더는 **항상 `v1` 별칭만** 심는다.
- 대상 인프라(고정): S3 `mbaas-file-bucket/public/baas-integration-sdk/`, CloudFront `E3O4WUZ5YOS1S`(cdn.mbaas.kr `/public/*` 동작).
- 트리거: `sdk-vX.Y.Z` 태그 push 또는 Actions 수동 실행 → 빌드·검증·업로드(불변+별칭 v1)·무효화. (`.github/workflows/sdk-release.yml`)
- 마이너/패치는 v1 별칭 갱신으로 전 앱 자동 반영. 메이저(v2, 호환 깨짐)만 새 별칭.

## 3. 앱빌더 스캐폴드 배선 (AI Studio 소유 — 고정 인프라)
생성 앱마다 동일하므로 스캐폴드 템플릿에 고정한다(스킬의 `scaffold/wiring.md` 원문). LLM이 창작하지 않게 한다.
- `index.html`: `<script src="%VITE_BAAS_SDK_URL%">` + `<meta name="baas-project-id" content="<id>">`
- 앱 진입점: render 이전 `window.__BAAS_HOST__ = { React, ReactDOM }` → `window.BaasSDK.init({ baseUrl: "/aiapp-baas" })`
- SDK 미로드 시 폴백 에러 화면(빈 화면 방지 — PoC-C에서 식별).

### 3.1 SDK URL은 환경별로 빌드 파이프라인이 주입 (concrete URL 하드코딩 금지)
- **스킬·생성 소스·에이전트는 concrete SDK URL을 담지 않는다** — `%VITE_BAAS_SDK_URL%` 플레이스홀더만. 그래야 스킬·소스가 환경 무관하게 dev→운영으로 그대로 승격된다.
- 실제 값은 **AI Studio 빌드 파이프라인(CodeBuild)이 환경별 환경변수로 주입** → `vite build` 가 치환:
  - dev CodeBuild: `VITE_BAAS_SDK_URL = https://cdn.mbaas.kr/public/baas-integration-sdk/next/baas-react.js` (검증 채널/호스트)
  - prod CodeBuild: `VITE_BAAS_SDK_URL = https://cdn.mbaas.kr/public/baas-integration-sdk/v1/baas-react.js`
- 정의 위치는 AI Studio 인프라 소유(CodeBuild 프로젝트 환경변수 또는 Parameter Store). 비-Vite 템플릿이면 `__BAAS_SDK_URL__` + buildspec 치환도 가능.
- 주입 시점 구분: `project_id`(프로젝트 고정) = **생성 시점** 주입 / SDK URL(환경별) = **빌드 시점** 주입.

## 4. 검증 계약 (SDK 표면)
- 모든 백엔드 호출은 `window.BaasSDK` 경유(raw fetch 없음). 표면 목록: `skills/baas-integration-sdk/reference/sdk-surface.md`.
- 커버 기능: 인증·발송대상·공지/FAQ·동적게시판·댓글·설문·예약·스토어. 게시판 board_id 는 `baas` CLI로 생성해 주입(CLI 핸드오프는 baas-cli repo 문서 참조).
- 빌드 시 `.d.ts` 참조하면 tsc 가 표면 오타를 잡음(선택, 없어도 동작).

## 5. 버전 관리·업데이트 (AI Studio 구현)

> **한 줄 원칙: SDK(런타임)는 "항상 최신·자동", 스킬(UI/구조)은 "사용자가 앱빌더에서 갱신할 때만".**
> 업데이트 시점이 두 축에서 다르므로 아래를 반드시 구분해서 이해할 것.

### 5.1 두 축의 업데이트 시점
| 축 | 무엇이 바뀌나 | **언제 반영되나** | AI Studio 관여 |
|---|---|---|---|
| **SDK (런타임, CDN)** | API/transport/버그픽스 | 배포 앱이 `v1`을 **매 페이지 로드마다** 가져옴 → CDN push 후 **다음 방문자부터 자동**. 트리거·재빌드·재배포 없음 | 없음 |
| **스킬 (생성 시점, UI/구조)** | 화면 구조·훅 사용법·컴포넌트 패턴 | 빌드 산출물은 S3에 **고정** → **사용자가 앱빌더에서 "업데이트"를 승인·실행할 때만** 재빌드·재배포 | §5.2 구현 |

- 즉 백엔드/전송 변경으로 배포 앱이 깨질 일은 SDK가 흡수한다. AI Studio가 대응할 대상은 **스킬(UI) 변경뿐**이다.
- **자동 적용 금지(의도된 설계)**: 스킬 변경을 배포 앱에 조용히 반영하지 않는다. 사용자가 손본 UI를 재생성이 덮어쓰는 사고를 막기 위함(특히 Tier 3).

### 5.2 스킬 업데이트 = "감지"와 "적용"을 분리
| 단계 | 무엇 | **시점** |
|---|---|---|
| **감지 (check)** | `baas-manifest.json`(`skill_version`, `sdk_channel`, `features_used`) vs 최신 스킬 `migrations/` 메타 비교 → "업데이트 가능(변경: <기능>)" 표시 | LLM 없는 순수 diff. **사용자가 프로젝트를 앱빌더에서 열 때**(lazy) 계산하거나, 원하면 주기 배치로 미리 스캔·알림 |
| **적용 (apply)** | codemod/LLM/재생성 → 재빌드 → 재배포 | **항상 사용자 승인 후, 앱빌더에서 실행** |

- 판정 공식(LLM 없음): `영향받는 기능 = manifest.features_used ∩ 이번 버전 changed_features`. 교집합이 비면 **건너뜀**.
- Tier 판정·codemod 러너·Tier2 LLM 트리거는 `skills/baas-integration-sdk/migrations/README.md` 규약을 따른다 (Tier 0=SDK흡수, 1=codemod, 2=교집합 파일만 LLM, 3=전체 재생성+동의).
- **사용자가 앱빌더를 다시 안 열면**: UI는 옛 산출물 그대로 유지되지만, SDK가 백엔드 변경을 흡수하므로 **동작은 멀쩡**하다("옛 UI·정상 동작" 안전 상태). 원할 때 갱신하면 됨.

### 5.3 AI Studio 구현 체크리스트
1. **manifest 기록** — 생성 파이프라인에서 `baas-manifest.json` 저장(스킬 흐름에 규약화됨, preview 소스에 보존).
2. **버전 비교기** — manifest vs 최신 스킬 `migrations/` 메타 교집합 계산(순수 함수, LLM 없음).
3. **업데이트 노출 UI** — 교집합 있으면 배지 표시 → 사용자 승인 게이트.
4. **codemod 러너** — Tier 1: `migrations/vX-to-vY-*.codemod.js`를 preview 소스에 jscodeshift 실행 후 재빌드.
5. **Tier 2 LLM 트리거** — 교집합 파일 + 마이그레이션 노트만 컨텍스트로 국소 수정(전체 재생성 아님).
6. **Tier 3** — 전체 재생성, 사용자 동의 게이트.

### 5.4 manifest는 "BaaS 연동 표면"만 추적 (UI 겉모습은 아님)
manifest·업데이트 절차의 대상은 **"어떤 BaaS 기능을 어느 버전으로 쓰는가"**뿐이다. 화면 디자인(색·여백·레이아웃·문구)·비-BaaS 컴포넌트는 추적하지 않는다.

| 수정 유형 | 스킬 사용 | manifest | 비고 |
|---|---|---|---|
| **BaaS 기능 추가/변경** (로그인·게시판 등) | O (표면 레퍼런스로 훅 생성) | **`features_used` 갱신 필수** | 업데이트 비교 대상이 됨 |
| **UI만 수정** (색·문구·레이아웃·백엔드 없는 섹션) | X (일반 코드 편집) | **변경 없음** | 스킬·버전과 무관, 자유롭게 편집 |

- **주의(교차점)**: 스킬이 생성했던 영역(예: 로그인 폼)을 손으로 개조해 두면, 이후 그 기능의 **스킬 업데이트 적용(Tier 2/3=재생성)** 시 손편집이 **덮어써질 수 있다**. manifest는 손편집을 추적하지 못해 자동 병합 불가 → 그래서 적용은 항상 사용자 승인 게이트를 둔다. **순수 시각 편집은 대체로 안전**하지만, 생성 컴포넌트를 크게 개조했다면 그 기능 재생성 시 충돌을 감안한다.
- **불변식**: 모든 백엔드 호출은 SDK 표면(훅) 경유. UI를 손봐도 raw fetch 를 새로 넣지 말 것 — 넣으면 버전 추적에서 빠진다.

## 6. 확인 필요 항목 (AI Studio 팀)
- [ ] 앱빌더 스캐폴드에 SDK 배선 반영(§3, 고정 URL) + SDK 로드 실패 폴백
- [ ] 생성 앱 `/aiapp-baas` 프록시가 프로젝트 도메인·쿠키를 정상 전달하는지(프로덕션 경로)
- [ ] 매니페스트 비교 UI·codemod 러너(§5) 구현 범위·시점
- [ ] 전환 정책: 신규 프로젝트부터 SDK 스킬 적용(기존 배포 앱은 서버 구경로 호환으로 무영향)
- (SDK 배포/CDN은 우리 CI 소관 — AI Studio 확인 불필요)

## 검증 근거 (우리 실측, 2026-07-09)
- PoC A(React 인스턴스 공유)/B(재빌드 0 CDN push 전파)/C(장애·롤백) 통과.
- 글루 통합 E2E: 스킬+CLI+SDK로 커뮤니티 페이지 생성 → dev 로그인·글작성·DB저장 확인.
- A/B: 동일 요청에서 SDK 방식이 토큰 ~40%↓·src 2,793→1,025줄·transport 2,100→0줄·표준 빌드 통과(vendored는 템플릿 버그로 빌드 실패).
