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

1. **`features.json`을 읽어** 요청에 맞는 기능 그룹을 파악한다(현재 `account`, `board`).
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

---

## 인증 상태 전역 관리 (필수 원칙 — 기존 스킬 계승)

**인증 상태는 앱 루트에서 1회만 조회한다. 화면마다 조회하지 않는다.**

- 앱 루트를 `BaasSDK.AuthProvider`로 감싸고, 화면은 `BaasSDK.useAuth()`로 읽기만 한다.
- 로그인 필수 화면은 `BaasSDK.RequireAuth`로 감싼다.
- 로그인/로그아웃은 `useLogin()`/`useLogout()` — 성공 시 전역 상태가 자동 갱신된다(내부적으로 refetch/clear).
- **비로그인 상태의 401은 에러가 아닌 정상 신호다.** 에러 UI·강제 리다이렉트 금지. `useAuth()`가 `{isLoggedIn:false}`로 알려준다.
- 로그인 후 다른 API의 401은 세션 만료 → 재로그인 유도.

## UI/UX 생성 원칙

- 로딩·에러·빈 상태를 항상 UI로 표현한다(훅의 `loading`/`error` 사용). 사용자가 멈춘 화면을 보지 않게 한다.
- 폼 검증은 제출 전 클라이언트에서 1차, 서버 에러 메시지는 그대로 노출(서버가 한국어 메시지 제공).
- 게시판 쓰기는 로그인 필수 — 비로그인 사용자에겐 로그인 유도 UI를 보여준다.
- 반환된 에러의 `errorCode`로 분기한다(코드 목록은 `reference/sdk-surface.md`의 에러 표 참조).

## 버전 매니페스트 (생성 시 필수 기록)

프로젝트 루트에 `baas-manifest.json`을 만든다 — 이후 업데이트 판단의 근거(LLM 없이 diff):
```json
{ "skill": "baas-integration-sdk", "skill_version": "0.1.0", "sdk_channel": "v1", "features_used": ["account", "board"] }
```
`features_used`에는 실제 사용한 기능 그룹만 적는다. 스킬/SDK 업데이트 시 앱빌더가 이 파일과 최신 버전을
비교해 영향 여부·마이그레이션 Tier를 판정한다(`migrations/README.md` 참조).

## auth 필드 값 (features.json)

| 값 | 의미 |
|----|------|
| `false` | 인증 불필요(공개 읽기) |
| `true` | 항상 인증 필요(쓰기) |
| `"mixed"` | 읽기는 공개, 쓰기는 인증 필요 |
