---
name: baas-integration-sdk-native
description: "(BaaS SDK) 런타임 CDN SDK 위에서 BaaS UI/UX를 생성하는 가이드. 제공 기능: 회원 인증(회원가입/로그인/로그아웃/내정보/비밀번호변경/휴대전화 로그인 + AuthProvider 전역 상태), 파일·이미지 업로드, 결제 위젯(serverFn 이 만든 세션). transport는 SDK(@mbaas/baas-web-sdk)가 CDN에서 담당하므로 fetch 코드를 직접 만들지 않는다. Use when: 로그인/회원가입, 인증 시스템, 이미지 업로드, 결제 화면 — baas-cli로 백엔드 리소스를 만들고 SDK 훅으로 UI를 조립하는 신규 프로젝트 (transport를 vendored로 복사하지 않는 SDK 방식)"
---

# BaaS SDK 통합 스킬 (UI 생성 가이드)

BaaS 백엔드와 대화하는 transport·훅은 **런타임 CDN SDK**(`window.BaasSDK`)가 담당한다.
이 스킬은 그 SDK 표면 위에서 **좋은 UI/UX를 생성**하도록 안내한다. fetch 배관 코드는 만들지 않는다.

> 기존 `baas-integration` 스킬과의 차이: 그 스킬은 transport 코드를 프로젝트에 복사(vendored)했다.
> 이 스킬은 transport를 SDK로 올려, API가 바뀌어도 **CDN push 1회로 전 앱에 반영**(재생성·재빌드 0)되게 한다.
> 두 스킬은 병행 존재하되 **한 프로젝트에 섞지 않는다** — SDK 스킬로 만든 앱은 전부 SDK 경유.

## 범위 경계 (이 스킬이 정의하는 것 / 하지 않는 것)

| | 내용 |
|---|---|
| **정의한다** | SDK 표면(훅·시그니처·반환 타입·에러→UI), **무엇을 프로비저닝해야 하는가**(리소스 종류·필드 스키마·접근 정책 의미론), 화면 규약(상태·가드·약관·푸터) |
| **정의하지 않는다** | **`baas` CLI 의 명령·플래그 문법** — 권위는 설치된 CLI 의 `baas <group> <action> --help` 다 |

**왜 나누는가**: SDK 스킬과 CLI 는 **버전 라인이 독립**이다. 스킬에 플래그를 박아두면 CLI 가 바뀔 때
아무도 잡지 못해 조용히 낡는다(실측: 없는 명령을 안내하던 사례). 또한 역할 분리 환경에서 **CLI 실행은
프로비저닝 담당(`baas` CLI) 소유**이고, 이 스킬을 읽는 UI/연동 구현자는 **CLI 변경 명령을 쓰지 않는다**.

접근 정책·관계 패턴 같은 **의미론은 여기 남는다** — 그것이 무엇을 프로비저닝하고 어떤 데이터를 누가
읽을 수 있는지 결정하기 때문이다(예: `read: public` 이면 비로그인도 조회 가능).

---

## 생성 흐름

1. **`features.json`을 읽어** 요청에 맞는 기능 그룹을 파악한다(`account`·`storage`·`payment`).
   v2.0 부터 게시판·공지/FAQ·댓글·설문·예약·스토어·문의·발송대상 **고정 기능 훅은 없다** — 그 요구는 아래 「데이터 저장」 절을 따른다.
2. 해당 기능의 **`reference/sdk-surface.md`** 섹션을 읽어 SDK 훅/함수 시그니처·반환 타입·에러→UI 규약을 확인한다.
3. **백엔드 리소스가 필요하면 UI보다 먼저 프로비저닝한다** — 실행은 `baas` CLI를 쓰는 프로비저닝 담당 소관이다. 이 스킬은 **무엇이 필요한지**(리소스 종류·스키마)를 정의하고, **CLI 문법은 정의하지 않는다**(권위 = 설치된 `baas <group> <action> --help`). 확정된 이름/id를 UI 코드에 주입한다 — 기억으로 다시 타이핑하지 말 것.
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
- **앱에는 사장님 관리 화면이 없다.** 사장님은 AI Studio 관리 화면에서 운영한다(`backend/admin.json`,
  `baas-backend` 「관리 화면」 절). 앱 안에 `/admin` 경로·관리자 셸·「사장님 계정으로 로그인」 링크를 만들지
  않는다 — 소유자는 통합회원이라 앱 로그인으로는 들어올 수 없고, 들어올 이유도 없다.
- 회원 전용 화면으로 가는 메뉴·링크(내 예약·마이페이지 등)는 `isLoggedIn` 일 때만 보인다 — 가드는 들어오는 것만 막는다(`reference/sdk-surface.md` 「메뉴·링크 노출도 같은 기준」).
- 로그인/로그아웃은 `useLogin()`/`useLogout()` — 성공 시 전역 상태가 자동 갱신된다(내부적으로 refetch/clear). 기획에 휴대전화 로그인이 있으면 로그인·가입을 `useSmsLogin()` 한 화면으로 만든다 — 프로젝트 설정은 필요 없다(`reference/sdk-surface.md` 휴대전화 로그인 절). 인증번호는 카카오톡 알림톡으로 먼저, 보내지 못하면 문자로 간다(플랫폼 규칙) — 화면 이름은 「휴대전화 로그인」, 입력 안내는 「카카오톡 또는 문자로 받은 인증번호」.
- **비로그인 상태의 401은 에러가 아닌 정상 신호다.** 에러 UI·강제 리다이렉트 금지. `useAuth()`가 `{isLoggedIn:false}`로 알려준다.
- 로그인 후 다른 API의 401은 세션 만료 → 재로그인 유도.

## 위임 운영자 화면은 **셸을 분리한다**

사장님이 임명한 운영자(지점 담당자 등)가 앱 안에서 쓰는 화면을 만들 때만 해당한다. 손님 화면과 같은
레이아웃 안에 넣지 마라 — 라우트만 나누고 헤더·푸터를 공유하면 운영 화면에 손님용 네비게이션과 「로그인 /
회원가입」 같은 마케팅 CTA 가 그대로 남는다(실측 2026-09-17).

```tsx
<Routes>
  <Route element={<SiteLayout/>}>      {/* 손님: 헤더·푸터 */}
    <Route path="/" element={<Home/>}/>
  </Route>
  <Route element={<StaffLayout/>}>     {/* 운영자: 최소 크롬 + 「사이트로 돌아가기」 */}
    <Route path="/staff" element={<RequireAuth><Staff/></RequireAuth>}/>
  </Route>
</Routes>
```

운영자는 이 프로젝트의 **회원**이라 `RequireAuth` 로 감싸고, 권한은 serverFn(`member` + `authorizes`)이
판정한다. 사장님 화면(전체 목록·승인·설정)은 여기 만들지 않는다 — AI Studio 관리 화면 몫이다.

## 데이터 저장

v2.0 에서 고정 기능(게시판·공지/FAQ·댓글·설문·예약·스토어·문의·발송대상) 훅이 SDK 에서 빠졌다.
`useBoard`·`useNotice`·`useReservation`·`useStore`·`useInquiry` 같은 이름은 **존재하지 않는다** — 부르면
배포본에서 `is not a function` 으로 화면이 깨진다.

표면에 없는 것은 만들지 않는다. 임의 저장소(localStorage·하드코딩 배열·게시글 본문 문자열 인코딩)로
흉내 내지 말고 미지원으로 보고한다(`features.json` 의 `fallback`).

## 마크다운 본문 렌더 — 공지·답장 본문

관리 화면의 서식 편집기가 쓰는 본문(공지 `body`, 문의 답장 등)은 **마크다운 글자**다. 손님 화면은 이렇게 그린다.

- **마크다운 렌더러로 그리고 원본 HTML 은 버린다.** `dangerouslySetInnerHTML`·`innerHTML` 로 넣지 마라 — 본문
  하나가 그 앱의 쿠키로 스크립트를 돌린다. 예전 게시판 지침의 「HTML 본문을 그대로 넣는다」는 이 본문에 쓰지 않는다
- 렌더러가 프로젝트에 없으면 HTML 을 만들지 않는 렌더러(`react-markdown` 기본값처럼 원본 HTML 을 그리지 않는 것)를
  쓴다. 패키지를 더할 수 없으면 줄바꿈만 살린 글자(`white-space: pre-line`)로 보여 준다 — 직접 HTML 로 바꾸지 마라
- **링크는 `http`·`https`·`mailto` 만, 사진은 `https` 주소만** 연다. `javascript:` 같은 주소는 글자로 남긴다
- 사진 주소는 그 앱 저장소(`…/_file/storage/…`)다. 따로 내려받거나 다시 올리지 않는다
- 목록에는 기호를 걷어낸 첫 줄 요약을 쓰고, 전문은 상세에서 그린다

## UI/UX 생성 원칙

- 로딩·에러·빈 상태를 항상 UI로 표현한다(훅의 `loading`/`error` 사용). 사용자가 멈춘 화면을 보지 않게 한다.
- 폼 검증은 제출 전 클라이언트에서 1차, 서버 에러 메시지는 그대로 노출(서버가 한국어 메시지 제공).
  - **전화번호(phone)는 하이픈 유무로 거절하지 말 것.** 입력 `onChange`에 `BaasSDK.formatPhone`로 **자동 하이픈**을 적용하고, 전송은 SDK가 `normalizePhone`으로 `010-1234-5678` 형식으로 자동 정규화한다(서버는 ≤64자면 수용). phone 정규식을 새로 만들지 말 것 — 서버보다 엄격한 검증이 도리어 정상 입력을 막는다.
- 작성·수정 화면은 로그인 필수 — 비로그인 사용자에겐 로그인 유도 UI를 보여준다.
- 반환된 에러의 `errorCode`로 분기한다(코드 목록은 `reference/sdk-surface.md`의 에러 표 참조).

## 버전 매니페스트 (생성 시 필수 기록 · 변경 시 필수 동기화)

프로젝트 루트에 `baas-manifest.json`을 만든다 — 이후 업데이트 판단의 근거(LLM 없이 diff):
```json
{ "skill": "baas-integration-sdk-native", "skill_version": "2.0.0", "sdk_channel": "v1", "features_used": ["account", "storage"] }
```
- `features_used`(그룹 키: `account`, `payment`, `storage`)와 `skill_version`(=`features.json`의 `version`)은 **손으로 유지하지 않는다.**
- **자동 동기화(권장·고정 배선)**: `scripts/sync-manifest.mjs` 가 `src/` 의 `BaasSDK.<name>` 사용을 스캔해 `features.json.hook_groups` 매핑으로 `features_used` 를 도출하고 `skill_version` 을 맞춘다. `package.json` 의 `prebuild` 에 물려 **build 마다 자동 갱신**, `validate` 엔 `--check`(불일치 시 실패)로 건다(배선: `scaffold/wiring.md` §4).
- **왜 자동인가**: `features_used` 를 손으로 유지하면 stale 이 나서(예: payment 를 쓰는데 목록에서 빠짐) 업데이트 비교기의 교집합이 틀어져 **해당 기능의 업데이트가 조용히 누락된다.** 코드에서 도출하면 구조적으로 stale 이 불가능하다. (신규 훅을 SDK 에 추가할 때만 `features.json.hook_groups` 에 매핑을 추가하면 된다.)

스킬/SDK 업데이트 시 앱빌더가 이 파일과 최신 버전을 비교해 영향 여부·마이그레이션 Tier를 판정한다(`migrations/README.md` 참조).

## auth 필드 값 (features.json)

| 값 | 의미 |
|----|------|
| `false` | 인증 불필요(공개 읽기) |
| `true` | 항상 인증 필요(쓰기) |
| `"mixed"` | 읽기는 공개, 쓰기는 인증 필요 |
