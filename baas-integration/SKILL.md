---
name: baas-integration
description: "(BaaS API) 회원 인증 + 발송대상 통합. 제공 기능: 회원가입, 로그인, 로그아웃, 계정정보 조회, 발송대상(연락처) 등록. Use when: 로그인/회원가입 구현, 인증 시스템, 연락처 등록 폼, 예약 접수, 문의 등록, 뉴스레터 구독"
---

# BaaS API 통합 스킬

회원 인증(Account)과 발송대상(Messaging) API를 모두 포함하는 통합 스킬입니다.

## 제공 기능

| 기능 | 설명 |
|------|------|
| 회원가입 | 새 계정 생성 |
| 로그인 | JWT 쿠키 기반 인증 |
| 로그아웃 | 인증 쿠키 삭제 |
| 계정정보 조회 | 로그인된 사용자 정보 |
| 발송대상 등록 | 연락처(이름, 전화번호) 등록 |

---

## 필수 참조 문서

> **⚠️ 모든 API 구현 전 반드시 먼저 참조하세요:**
> - [references/common.md](references/common.md) - Base URL, 인증방식, 응답형식, 에러코드

## 기능별 참조 가이드

| 요청 키워드 | 추가 참조 문서 | 참조할 템플릿 |
|------------|---------------|--------------|
| 회원가입, 로그인, 로그아웃, 인증 | [references/account.md](references/account.md) | `templates/baas.ts` 또는 `react/useLogin.tsx` 등 |
| 연락처 등록, 예약, 문의, 뉴스레터 | [references/messaging.md](references/messaging.md) | `templates/baas.ts` 또는 `react/useRecipient.tsx` |

---

## 워크플로우

### 회원 인증 흐름
1. **회원가입** (`POST /account/signup`) - 계정 생성
2. **로그인** (`POST /account/login`) - JWT 쿠키 자동 설정
3. **인증 확인** (`GET /account/info`) - 로그인 상태 체크
4. **로그아웃** (`POST /account/logout`) - 쿠키 삭제

### 발송대상 등록 흐름
1. 사용자가 폼에 이름, 전화번호 입력
2. 전화번호 형식 검증 (`010-XXXX-XXXX`)
3. **발송대상 등록** (`POST /recipient/{project_id}`)
4. 등록 완료 응답 처리

---

## 사용 예시

### TypeScript/JavaScript
```typescript
// templates/baas.ts 참조
import { login, signup, registerRecipient } from './baas';

// 로그인
await login('user@example.com', 'password123');

// 회원가입
await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');

// 발송대상 등록
await registerRecipient({
  name: '홍길동',
  phone: '010-1234-5678',
  metadata: { type: 'reservation', date: '2024-12-25' }
});
```

### React Hooks
```tsx
// templates/react/ 참조
import { useLogin, useSignup, useRecipient } from './react';

// 로그인 폼
const { login, isLoading, error } = useLogin();
await login('user@example.com', 'password123');

// 연락처 등록 폼
const { register, isLoading, error } = useRecipient();
await register({ name: '홍길동', phone: '010-1234-5678' });
```

---

## 템플릿 파일

| 용도 | 파일 |
|------|------|
| Vanilla TS | `templates/baas.ts` |
| Vanilla JS | `templates/baas.js` |
| React 로그인 | `templates/react/useLogin.tsx` |
| React 회원가입 | `templates/react/useSignup.tsx` |
| React 로그아웃 | `templates/react/useLogout.tsx` |
| React 계정정보 | `templates/react/useAccountInfo.tsx` |
| React 발송대상 | `templates/react/useRecipient.tsx` |
| React 통합 export | `templates/react/index.tsx` |

---

## 상세 API 스펙

- [공통 설정](references/common.md) - Base URL, 인증, 응답형식, 에러코드
- [Account API](references/account.md) - 회원가입, 로그인, 로그아웃, 계정정보
- [Messaging API](references/messaging.md) - 발송대상 등록
