---
name: baas-logout
description: BaaS 로그아웃 API 클라이언트
category: account
keywords:
  - 로그아웃
  - logout
  - 로그아웃 기능
  - sign out
  - 로그아웃 코드
  - 로그아웃 API
  - 로그아웃 훅
  - 인증 해제
templates:
  - path: templates/logout.ts
    language: typescript
    framework: vanilla
  - path: templates/logout.js
    language: javascript
    framework: vanilla
  - path: templates/react/useLogout.tsx
    language: typescript
    framework: react
---

# BaaS 로그아웃 API

BaaS 서버에서 로그아웃하여 인증 쿠키를 삭제하는 API입니다.

## API 스펙

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /account/logout` |
| 인증 | 필요 (쿠키 기반 JWT) |
| Content-Type | `application/json` |

## 요청 형식

```typescript
// 요청 본문 없음 (쿠키로 인증)
// credentials: 'include' 필수
```

## 응답 형식

```typescript
// 성공 시
{
  result: "SUCCESS",
  data: null,
  message: "로그아웃 완료"
}

// 실패 시
{
  result: "FAIL",
  errorCode: "UNAUTHORIZED",
  message: "로그인이 필요합니다."
}
```

## 쿠키 삭제

로그아웃 성공 시 서버가 자동으로 쿠키를 삭제합니다:
- **관리자**: `access_token` 쿠키 삭제
- **프로젝트 사용자**: `access_token_{project_id}` 쿠키 삭제

## 사용 예시

### TypeScript
```typescript
// templates/logout.ts 참조
await logout();
```

### JavaScript
```javascript
// templates/logout.js 참조
await logout();
```

### React Hook
```tsx
// templates/react/useLogout.tsx 참조
const { logout, isLoading } = useLogout();
await logout();
```

## 에러 코드

| ErrorCode | 설명 | 대응 |
|-----------|------|------|
| `UNAUTHORIZED` | 로그인 필요 | 이미 로그아웃 상태, 로그인 페이지로 이동 |

## 템플릿 파일

- [logout.ts](templates/logout.ts) - TypeScript 버전
- [logout.js](templates/logout.js) - JavaScript 버전
- [useLogout.tsx](templates/react/useLogout.tsx) - React Hook