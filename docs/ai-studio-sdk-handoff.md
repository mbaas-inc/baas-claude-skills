# AI Studio 연동 핸드오프 — BaaS SDK + baas-integration-sdk 스킬

런타임 CDN SDK로 BaaS 프론트 transport를 올려, 스킬/API 변경 전파를 O(1)로 만드는 전환.

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
- `index.html`: `<script src="https://cdn.mbaas.kr/public/baas-integration-sdk/v1/baas-react.js">` + `<meta name="baas-project-id" content="<id>">`
- 앱 진입점: render 이전 `window.__BAAS_HOST__ = { React, ReactDOM }` → `window.BaasSDK.init({ baseUrl: "/aiapp-baas" })`
- SDK 미로드 시 폴백 에러 화면(빈 화면 방지 — PoC-C에서 식별).

## 4. 검증 계약 (SDK 표면)
- 모든 백엔드 호출은 `window.BaasSDK` 경유(raw fetch 없음). 표면 목록: `skills/baas-integration-sdk/reference/sdk-surface.md`.
- 커버 기능: 인증·발송대상·공지/FAQ·동적게시판·댓글·설문·예약·스토어. 게시판 board_id 는 `baas` CLI로 생성해 주입(CLI 핸드오프는 baas-cli repo 문서 참조).
- 빌드 시 `.d.ts` 참조하면 tsc 가 표면 오타를 잡음(선택, 없어도 동작).

## 5. 버전 관리·업데이트 (AI Studio 구현)
- 생성 앱에 `baas-manifest.json`(`skill_version`, `sdk_channel`, `features_used`) 기록됨.
- 앱빌더가 manifest vs 최신 스킬 버전 비교 → 영향 기능 교집합만 대상. Tier 판정·codemod 러너·Tier2 LLM 트리거는 `skills/baas-integration-sdk/migrations/README.md` 규약을 따른다.
- SDK(런타임) 변경은 CDN push로 자동 반영 — 앱 재생성 불필요. 스킬(구조/UI) 변경만 위 절차.

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
