# 스캐폴드 배선 (고정 보일러플레이트 — 그대로 사용)

SDK 로딩·host React 노출·init 은 모든 프로젝트가 동일하다. 아래를 **그대로** 넣는다.
창작하거나 변형하지 마라 — 변형은 Invalid hook call·SDK 로딩 실패의 원인이다.

## 1. `index.html`
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- 프로젝트 컨텍스트 (앱빌더가 실제 project_id 주입) -->
  <meta name="baas-project-id" content="__PROJECT_ID__" />
  <title>__TITLE__</title>
  <!-- 런타임 CDN SDK. src 는 플레이스홀더 그대로 둔다 — concrete URL 하드코딩 금지. -->
  <script src="%VITE_BAAS_SDK_URL%"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```
- SDK `src` 는 `%VITE_BAAS_SDK_URL%` 플레이스홀더를 **그대로** 둔다(concrete URL 하드코딩 금지). 실제 값 주입은 인프라 몫이다.
- Vite `base: '/'` 로 빌드한다(자산 경로 안정).

## 2. 앱 진입점 (`src/main.tsx`)
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// SDK 는 React 를 번들하지 않고 이 host 인스턴스를 쓴다(같은 React → 훅 정상 동작).
(window as any).__BAAS_HOST__ = { React, ReactDOM };

const BaasSDK = (window as any).BaasSDK;
if (!BaasSDK) {
  // SDK 로드 실패 시 빈 화면 대신 명시적 안내(장애 모드 폴백)
  document.getElementById("root")!.innerHTML =
    '<div style="padding:2rem;text-align:center">서비스를 불러오지 못했습니다. 잠시 후 새로고침 해주세요.</div>';
} else {
  BaasSDK.init({ baseUrl: "/aiapp-baas" }); // project_id 는 <meta> 에서 자동 해석
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
```

## 3. 앱 루트에서 AuthProvider 로 감싸기 (`src/App.tsx`)
```tsx
const BaasSDK = (window as any).BaasSDK;
export default function App() {
  return (
    <BaasSDK.AuthProvider>
      {/* 라우팅·화면 */}
    </BaasSDK.AuthProvider>
  );
}
```

## TypeScript — `window.BaasSDK` 는 타입이 없다 (⚠️ tsc 가 아무것도 못 잡는다)

`window.BaasSDK` 는 CDN 전역이라 **타입 선언이 없다**(배포물은 `baas-react.js` 뿐 — `.d.ts` 는
발행하지 않는다). 앱은 보통 `(window as any).BaasSDK` 로 받는데, 그러면 훅 반환값의 **모든 필드
접근이 `any`** 라서 다음이 전부 `tsc` 를 통과한다:

```tsx
const target = await fetchTarget(id);
target.price.toLocaleString();     // ✅ tsc 통과 — 그러나 런타임 크래시(실제 필드는 중첩, 아래 참조)
const products = await fetchProducts();
products.map(...);                 // ✅ tsc 통과 — 그러나 런타임 크래시(반환값은 { items } 봉투)
```

**결론: 반환값 shape 은 타입이 지켜주지 않으므로 `reference/sdk-surface.md` 의 "훅 반환 계약" 표를
읽고 맞춰야 한다.** 그리고 정적 검증(tsc·eslint·build)이 전부 통과해도 이 부류의 결함은
**배포본에서만** 드러나므로, 배포 후 실제 화면·네트워크 응답으로 확인한다.

앱에서 방어하려면 SDK 반환값을 받는 지점에 **직접 선언한 타입**을 붙이고(`as` 단언 말고 명시 타입),
그 타입을 `sdk-surface.md` 의 표와 일치시킨다.

## 4. `baas-manifest.json` 자동 동기화 (stale 방지 — 고정 배선)
마이그레이션 판정(업데이트 비교기)은 `baas-manifest.json` 의 `features_used`/`skill_version` 을 근거로 한다.
이를 **손으로 유지하면 stale 이 나서 업데이트가 조용히 누락**되므로(예: store 를 쓰는데 목록에서 빠짐),
**코드에서 자동 도출**해 구조적으로 stale 을 막는다. hook→group 매핑의 SSOT 는 `features.json.hook_groups`.

- `scripts/sync-manifest.mjs` — `src/` 의 `BaasSDK.<name>` 사용을 스캔 → `features.json.hook_groups` 매핑으로
  `features_used` 도출, `skill_version` 을 `features.json.version` 으로 세팅해 `baas-manifest.json` 갱신.
- **`package.json` 배선(고정)**: `prebuild` 에 물려 **`npm run build` 직전 자동 실행**(배포는 build 가
  불가피하므로 건너뛸 수 없는 관문이 된다). `validate` 엔 `--check`(불일치 시 exit 1)로 건다.
```jsonc
"scripts": {
  "prebuild": "node scripts/sync-manifest.mjs",
  "build": "vite build",
  "validate": "npm run typecheck && npm run lint && node scripts/sync-manifest.mjs --check"
}
```
- 새 훅/기능을 붙이면 코드만 바꾸면 되고 manifest 는 다음 build 에서 자동 반영된다(에이전트가 manifest 를
  손대야 한다는 규약 자체가 불필요해진다). 단 **신규 훅을 SDK 에 추가할 때는 `features.json.hook_groups` 에
  그 훅→group 매핑을 넣어야** 한다(매핑 없으면 sync 가 경고).

## 5. 로그인·가입의 고정 회원관리

로그인·가입을 붙이면 `backend/admin.json`에 `component: "members"`인 페이지와 메뉴를 함께 둔다.
회원 목록·검색·상세·승인·거부는 Studio 고정 컴포넌트가 기존 BaaS 회원 API를 사용한다.
이를 위한 회원 복제 컬렉션, 앱 내부 관리자 화면, serverFn, Lambda는 만들지 않는다.

공식 `features.json.admin_components.members.usage_symbols`와 `scaffold/sync-admin.mjs`가 사용 판정의 정본이다.
실제 SDK 호출을 AST로 분석하며 `AuthProvider`·`useAuth`·승인 설정만으로는 회원 페이지를 만들지 않는다.
Studio는 validate와 작업공간 저장 전에 이 도구를 실행한다. 다른 코딩 환경에서는 다음을 실행한다:

```bash
node skills/baas-integration-sdk-native/scaffold/sync-admin.mjs --root . --metadata skills/baas-integration-sdk-native/features.json --checker skills/baas-backend/boilerplate/admin-spec.mjs --install
```

- 기존 `component: "members"` 페이지를 재사용한다. 페이지 ID 충돌, 메뉴 순서, 기존 위젯·상세 확장을 보존한다.
- 로그인만 있는 앱에도 `backend/admin.json`만 만든다. 백엔드 추출이나 프로비저닝은 필요하지 않다.
- `scripts/baas-admin/`에는 검증된 도구·메타데이터·JSON Schema를 저장하고 validate/prebuild에 `--check`를 연결한다.
  이 사본은 출시 버전의 계약이다. 출시에서는 저장된 버전을 검사만 하며 과거 `admin.json`을 자동 수정하지 않는다.
- 로그인 코드를 수정한 뒤 위 명령으로 동기화하고 저장한다. `--check` 실패를 없애기 위해 검사를 삭제하지 않는다.
- 사용자 요청에 추가 회원 데이터가 있을 때만 업무 컬렉션을 설계한다. 회원 UUID는 string 필드로 연결한다.
  고정 페이지 아래는 `widgets`, 회원 상세 아래는 `member_detail.bindings`와 `member_detail.widgets`로 확장한다.
  네이티브 회원 테이블을 동적 `reference` 대상으로 선언하지 않는다.
