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
  <!-- 런타임 CDN SDK (별칭 v1 = 자동 업데이트 채널) -->
  <script src="https://cdn.aiapp.link/sdk/v1/baas-react.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```
- 로컬/dev 에선 `src` 를 환경에 맞는 SDK URL 로 둔다(앱빌더가 주입).
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
