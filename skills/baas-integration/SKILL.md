---
name: baas-integration
description: "(BaaS API) 회원 인증 + 발송대상 + 게시판 통합. 제공 기능: 회원가입, 로그인, 로그아웃, 계정정보 조회, 발송대상(연락처) 등록, 공지사항/FAQ 조회. Use when: 로그인/회원가입 구현, 인증 시스템, 연락처 등록 폼, 예약 접수, 문의 등록, 뉴스레터 구독, 공지사항 페이지, FAQ 페이지"
version: 5.1
---

# BaaS API 통합 스킬

회원 인증(Account), 발송대상(Messaging), 게시판(Board) API를 모두 포함하는 통합 스킬입니다.

---

## 빠른 시작

### 필수 설정
- **Base URL**: `https://api.aiapp.link`
- **인증 방식**: 쿠키 기반 JWT (`credentials: 'include'` 필수)
- **환경변수**: 프레임워크에 맞게 설정
  - React CRA: `REACT_APP_BAAS_PROJECT_ID`
  - Next.js: `NEXT_PUBLIC_BAAS_PROJECT_ID`
  - Vite: `VITE_BAAS_PROJECT_ID`

### 템플릿 사용법

1. `templates/react/` 폴더를 프로젝트에 복사
2. 환경변수 설정 (`.env` 파일)
3. 훅을 import해서 컴포넌트 로직 작성

> **중요**: 훅은 **API 호출 + 상태관리**만 제공합니다.
> UI 컴포넌트와 연결 로직은 직접 작성하세요.

```tsx
import { useLogin } from './hooks/baas';

function LoginPage() {
  const { login, isLoading, error } = useLogin();

  const handleSubmit = async (e) => {
    e.preventDefault();
    await login({ email, password });
  };

  // UI는 직접 작성
  return (
    <form onSubmit={handleSubmit}>
      {/* 폼 UI */}
    </form>
  );
}
```

---

## 제공 기능

| 기능 | 설명 |
|------|------|
| 회원가입 | 새 계정 생성 |
| 로그인 | JWT 쿠키 기반 인증 |
| 로그아웃 | 인증 쿠키 삭제 |
| 계정정보 조회 | 로그인된 사용자 정보 |
| 발송대상 등록 | 연락처(이름, 전화번호) 등록 |
| 공지사항 조회 | 공지사항 목록/상세 (인증 불필요) |
| FAQ 조회 | FAQ 목록/상세 (인증 불필요) |

---

## 필수 참조 문서

> **⚠️ 모든 API 구현 전 반드시 먼저 참조하세요:**
> - [references/common.md](references/common.md) - Base URL, 인증방식, 응답형식, 에러코드

## 기능별 참조 가이드

| 요청 키워드 | 추가 참조 문서 | 참조할 템플릿 |
|------------|---------------|--------------|
| 회원가입, 로그인, 로그아웃, 인증 | [references/account.md](references/account.md) | `templates/baas.ts` 또는 `react/useLogin.tsx` 등 |
| 연락처 등록, 예약, 문의, 뉴스레터 | [references/messaging.md](references/messaging.md) | `templates/baas.ts` 또는 `react/useRecipient.tsx` |
| 공지사항, FAQ, 게시판 | [references/board.md](references/board.md) | `templates/baas.ts` 또는 `react/useNotice.tsx`, `react/useFaq.tsx` |

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

### 게시판 조회 흐름 (공지사항/FAQ)
1. **목록 조회** (`GET /public/board/notice/{project_id}/posts`) - 인증 불필요
2. 목록에서 게시글 선택
3. **상세 조회** (`GET /public/board/notice/{project_id}/posts/{post_id}`) - 조회수 자동 증가
4. 게시글 내용 렌더링

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

// 공지사항 목록
const { posts, fetchPosts } = useNotice();
await fetchPosts({ limit: 10 });

// FAQ 상세 조회
const { post, fetchPost } = useFaq();
await fetchPost('post-uuid');
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
| React 공지사항 | `templates/react/useNotice.tsx` |
| React FAQ | `templates/react/useFaq.tsx` |
| React 통합 export | `templates/react/index.tsx` |

---

## 상세 API 스펙

- [공통 설정](references/common.md) - Base URL, 인증, 응답형식, 에러코드
- [Account API](references/account.md) - 회원가입, 로그인, 로그아웃, 계정정보
- [Messaging API](references/messaging.md) - 발송대상 등록
- [Board API](references/board.md) - 공지사항, FAQ 조회
