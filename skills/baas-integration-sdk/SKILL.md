---
name: baas-integration-sdk
description: "(BaaS SDK) 런타임 CDN SDK 위에서 BaaS UI/UX를 생성하는 가이드. 제공 기능: 회원 인증(회원가입/로그인/로그아웃/내정보/비밀번호변경 + AuthProvider 전역 상태), 발송대상(연락처) 등록, 공지사항/FAQ 조회, 동적 게시판(FREE/REVIEW 게시글 CRUD)·댓글, 설문조사, 예약(슬롯 캘린더/신청/내 예약/토스 결제), 스토어(디지털 상품/토스 결제/내 주문). transport는 SDK(@mbaas/baas-web-sdk)가 CDN에서 담당하므로 fetch 코드를 직접 만들지 않는다. Use when: 로그인/회원가입, 인증 시스템, 연락처/문의/뉴스레터 폼, 공지사항/FAQ, 자유게시판/리뷰/커뮤니티, 댓글, 설문조사, 슬롯 기반 예약, 상품 판매/결제 — baas-cli로 백엔드 리소스를 만들고 SDK 훅으로 UI를 조립하는 신규 프로젝트 (transport를 vendored로 복사하지 않는 SDK 방식)"
---

# BaaS SDK 통합 스킬 (UI 생성 가이드)

BaaS 백엔드와 대화하는 transport·훅은 **런타임 CDN SDK**(`window.BaasSDK`)가 담당한다.
이 스킬은 그 SDK 표면 위에서 **좋은 UI/UX를 생성**하도록 안내한다. fetch 배관 코드는 만들지 않는다.

> 기존 `baas-integration` 스킬과의 차이: 그 스킬은 transport 코드를 프로젝트에 복사(vendored)했다.
> 이 스킬은 transport를 SDK로 올려, API가 바뀌어도 **CDN push 1회로 전 앱에 반영**(재생성·재빌드 0)되게 한다.
> 두 스킬은 병행 존재하되 **한 프로젝트에 섞지 않는다** — SDK 스킬로 만든 앱은 전부 SDK 경유.

---

## 생성 흐름

1. **`features.json`을 읽어** 요청에 맞는 기능 그룹을 파악한다(`account`·`recipient`·`notice`·`board`·`survey`·`reservation`·`store`·`collection`).
2. 해당 기능의 **`reference/sdk-surface.md`** 섹션을 읽어 SDK 훅/함수 시그니처·반환 타입·에러→UI 규약을 확인한다.
3. **백엔드 리소스가 필요하면 `baas` CLI로 먼저 만든다** (예: 게시판 → `baas board create`). 반환된 id를 UI 코드에 상수로 주입한다.
4. **`scaffold/wiring.md`의 배선 보일러플레이트를 그대로** index.html·앱 진입점에 포함한다(창작 금지 — SDK 로딩·host React 노출·init).
5. SDK 훅으로 UI를 조립한다. UI/UX(레이아웃·상태·로딩·에러 표시)는 이 스킬의 원칙을 따라 생성한다.
6. 생성 후 **`baas-manifest.json`을 기록**한다(아래 "버전 매니페스트").

---

## 스캐폴드 배선 (앱빌더 인프라 — 반드시 보일러플레이트 사용)

SDK는 CDN에서 로드되고 앱의 React 인스턴스를 공유한다. 이 배선은 **모든 프로젝트가 동일**하므로
`scaffold/wiring.md`의 고정 코드를 그대로 쓴다. 직접 창작하지 마라(Invalid hook call·로딩 실패의 원인).

핵심 3요소:
- `index.html`에 SDK `<script>` + `<meta name="baas-project-id">`
- 앱 진입점에서 render **이전에** `window.__BAAS_HOST__ = { React, ReactDOM }` 노출
- `window.BaasSDK.init({ baseUrl: '/aiapp-baas' })` 호출 (project_id는 meta에서 자동 해석)

**불변식**: SDK `<script src>`는 `%VITE_BAAS_SDK_URL%` 플레이스홀더를 그대로 두고 concrete URL 을 하드코딩하지 않는다. 실제 값 주입은 인프라 몫이라 에이전트/스킬은 관여하지 않는다.

---

## 인증 상태 전역 관리 (필수 원칙 — 기존 스킬 계승)

**인증 상태는 앱 루트에서 1회만 조회한다. 화면마다 조회하지 않는다.**

- 앱 루트를 `BaasSDK.AuthProvider`로 감싸고, 화면은 `BaasSDK.useAuth()`로 읽기만 한다.
- 로그인 필수 화면은 `BaasSDK.RequireAuth`로 감싼다.
- 로그인/로그아웃은 `useLogin()`/`useLogout()` — 성공 시 전역 상태가 자동 갱신된다(내부적으로 refetch/clear).
- **비로그인 상태의 401은 에러가 아닌 정상 신호다.** 에러 UI·강제 리다이렉트 금지. `useAuth()`가 `{isLoggedIn:false}`로 알려준다.
- 로그인 후 다른 API의 401은 세션 만료 → 재로그인 유도.

## 동적 컬렉션 (커스텀 데이터) — UI↔스키마 공동 설계

컬렉션 프리미티브는 **고정 기능(회원·발송대상·게시판·설문·예약·스토어)에 스펙이 없는
데이터 전용**이다. 어떤 데이터가 고정 기능으로 커버되는지의 판단(기술 선택)은 이 스킬이
아니라 **에이전트(운영 지침) 소관** — 이 스킬은 선택된 기술의 스펙만 정의한다.

- **공동 설계 흐름**: 요구 → (표현 범위·제약을 알고) **UI 설계 + 그에 맞는 스키마 구성** →
  `baas collection create/field add`로 스키마 생성 → `useCollection` 프리미티브로 UI 연결.
  UI는 SDK 프리미티브·표현 범위(필드 타입·필터 DSL·정책) **안에서 구현 가능하게** 직접
  설계한다(범용 자동 렌더 아님 — 그건 관리자 콘솔 몫).
- **스키마 권한**: 컬렉션/필드 생성·변경은 **baas-cli(에이전트) 소유**. 요구가 바뀌면 UI와 스키마를
  함께 재설계한다. 신규 필드는 optional만 추가 가능.
- **표현 범위의 원본**: 필드 타입·정책·필터 능력은 SDK 타입 + `baas collection get <name>`(런타임
  스키마)이 권위 원본. 프리미티브 사용법은 `reference/sdk-surface.md`의 "동적 컬렉션" 참조.

## UI/UX 생성 원칙

- 로딩·에러·빈 상태를 항상 UI로 표현한다(훅의 `loading`/`error` 사용). 사용자가 멈춘 화면을 보지 않게 한다.
- 폼 검증은 제출 전 클라이언트에서 1차, 서버 에러 메시지는 그대로 노출(서버가 한국어 메시지 제공).
- 게시판 쓰기는 로그인 필수 — 비로그인 사용자에겐 로그인 유도 UI를 보여준다.
- 반환된 에러의 `errorCode`로 분기한다(코드 목록은 `reference/sdk-surface.md`의 에러 표 참조).

## 버전 매니페스트 (생성 시 필수 기록 · 변경 시 필수 동기화)

프로젝트 루트에 `baas-manifest.json`을 만든다 — 이후 업데이트 판단의 근거(LLM 없이 diff):
```json
{ "skill": "baas-integration-sdk", "skill_version": "0.2.0", "sdk_channel": "v1", "features_used": ["account", "notice", "recipient", "board"] }
```
- `features_used`에는 **실제 사용한 기능 그룹만** 적는다(그룹 키: `account`, `notice`(공지+FAQ), `recipient`, `board`, `survey`, `reservation`, `store`).
- `skill_version`은 이 앱을 생성/갱신할 때 사용한 스킬 버전(`features.json`의 `version`)을 적는다.
- **⚠️ 기능을 추가·제거하면 `features_used`를 반드시 함께 갱신한다.** manifest가 실제 사용 기능과 어긋나면(stale) 업데이트 비교기의 교집합 계산이 틀어져 **해당 기능의 업데이트가 누락된다.** 예: 나중에 로그인·게시판을 덧붙였는데 `features_used`에 `account`·`board`를 안 넣으면, 그 기능들의 스킬 변경이 이 앱엔 반영되지 않는다.

스킬/SDK 업데이트 시 앱빌더가 이 파일과 최신 버전을 비교해 영향 여부·마이그레이션 Tier를 판정한다(`migrations/README.md` 참조).

## auth 필드 값 (features.json)

| 값 | 의미 |
|----|------|
| `false` | 인증 불필요(공개 읽기) |
| `true` | 항상 인증 필요(쓰기) |
| `"mixed"` | 읽기는 공개, 쓰기는 인증 필요 |
