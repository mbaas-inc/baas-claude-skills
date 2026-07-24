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

## TypeScript 편의(선택)
`window.BaasSDK` 타입은 배포된 `baas.d.ts` 를 참조하면 tsc 가 표면 오타(환각)를 빌드 시 잡는다.
없어도 동작에는 문제없다.

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
