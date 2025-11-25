---
name: baas-account-integrations
description: "(BaaS API) 회원 인증 통합 (회원가입, 로그인, 로그아웃, 계정정보). 사용: 인증 시스템, 로그인/회원가입 페이지, 회원관리, auth 구현"
---

# BaaS 회원 인증 API

회원가입, 로그인, 로그아웃, 계정정보 조회를 모두 포함하는 통합 스킬.

## 워크플로우

1. **회원가입** (`POST /account/signup`) - 계정 생성
2. **로그인** (`POST /account/login`) - JWT 쿠키 자동 설정
3. **인증 확인** (`GET /account/info`) - 로그인 상태 체크
4. **로그아웃** (`POST /account/logout`) - 쿠키 삭제

## 필수 설정

- Base URL: `http://localhost:8000` (로컬) / `https://api.aiapp.link` (프로덕션)
- 모든 요청에 `credentials: 'include'` 필수

## 사용 예시

**요청: "로그인 기능 만들어줘"**
```typescript
// templates/auth.ts 참조
import { login } from './auth';
await login({ user_id: 'user@example.com', user_pw: 'password123' });
```

**요청: "React로 회원가입 폼 만들어줘"**
```tsx
// templates/react/useSignup.tsx 참조
const { signup, isLoading, error } = useSignup();
await signup({ user_id, user_pw, name, phone });
```

**요청: "인증 상태 확인하는 코드"**
```typescript
// templates/auth.ts 참조
import { checkAuth } from './auth';
const { isLoggedIn, user } = await checkAuth();
```

## 템플릿 파일

| 용도 | 파일 |
|------|------|
| Vanilla TS | `templates/auth.ts` |
| Vanilla JS | `templates/auth.js` |
| React 로그인 | `templates/react/useLogin.tsx` |
| React 회원가입 | `templates/react/useSignup.tsx` |
| React 로그아웃 | `templates/react/useLogout.tsx` |
| React 계정정보 | `templates/react/useAccountInfo.tsx` |
| React 통합 export | `templates/react/index.tsx` |

## 상세 API 스펙

→ [references/api-spec.md](references/api-spec.md) 참조
