---
name: baas-login
description: "(BaaS API) 로그인 API. JWT 쿠키 자동 설정. Use when: 로그인 기능 구현, sign in 코드 작성, 인증 처리"
---

# BaaS 로그인 API

BaaS 서버에 로그인하여 JWT 토큰을 쿠키로 받는 API입니다.

## API 스펙

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /account/login` |
| 인증 | 불필요 |
| Content-Type | `application/json` |

## 요청 형식

```typescript
interface LoginRequest {
  user_id: string;       // 로그인 ID
  user_pw: string;       // 비밀번호
  project_id?: string;   // 프로젝트 ID (선택, 프로젝트 사용자만)
}
```

## 응답 형식

```typescript
// 성공 시
{
  result: "SUCCESS",
  data: {
    access_token: string,
    token_type: "bearer"
  },
  message: "로그인 완료"
}

// 실패 시
{
  result: "FAIL",
  errorCode: "INVALID_USER",
  message: "아이디 또는 비밀번호가 올바르지 않습니다."
}
```

## 쿠키 설정

로그인 성공 시 서버가 자동으로 쿠키를 설정합니다:
- **관리자**: `access_token` 쿠키
- **프로젝트 사용자**: `access_token_{project_id}` 쿠키

## 사용 예시

### TypeScript
```typescript
// templates/login.ts 참조
const token = await login({ user_id: 'user@example.com', user_pw: 'password123' });
```

### JavaScript
```javascript
// templates/login.js 참조
const token = await login('user@example.com', 'password123');
```

### React Hook
```tsx
// templates/react/useLogin.tsx 참조
const { login, isLoading, error } = useLogin();
await login('user@example.com', 'password123');
```

## 에러 코드

| ErrorCode | 설명 | 대응 |
|-----------|------|------|
| `INVALID_USER` | ID/PW 불일치 | 입력값 확인 안내 |
| `VALIDATION_ERROR` | 필수 필드 누락 | 필드 검증 |
| `NOT_FOUND` | 계정 없음 | 회원가입 안내 |

## 템플릿 파일

- [login.ts](templates/login.ts) - TypeScript 버전
- [login.js](templates/login.js) - JavaScript 버전
- [useLogin.tsx](templates/react/useLogin.tsx) - React Hook