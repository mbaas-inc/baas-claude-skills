# BaaS 회원 인증 API 스펙

> **백엔드 동기화**: 2025-11-26 (예외 핸들링 리팩토링 반영)

## 목차

1. [공통 설정](#공통-설정)
2. [회원가입 API](#1-회원가입-api)
3. [로그인 API](#2-로그인-api)
4. [로그아웃 API](#3-로그아웃-api)
5. [계정정보 조회 API](#4-계정정보-조회-api)
6. [에러 코드](#에러-코드)

---

## 공통 설정

### Base URL
```
https://api.aiapp.link
```

### 인증 방식
- 쿠키 기반 JWT
- 모든 요청에 `credentials: 'include'` 필수
- 쿠키명: `access_token` (관리자) / `access_token_{project_id}` (프로젝트 사용자)

### 응답 형식

**성공 응답:**
```typescript
{
  result: "SUCCESS",
  data: T,
  message?: string
}
```

**에러 응답 (메타데이터 포함):**
```typescript
{
  result: "FAIL",
  errorCode: string,       // 에러 코드
  message: string,         // 사용자 친화적 메시지
  timestamp?: string,      // 에러 발생 시간 (ISO 8601, KST)
  request_id?: string,     // 요청 추적 UUID (디버깅용)
  path?: string            // 요청 경로
}
```

**검증 에러 응답 (VALIDATION_ERROR):**
```typescript
{
  result: "FAIL",
  errorCode: "VALIDATION_ERROR",
  message: "요청 값이 올바르지 않습니다.",
  detail?: Array<{
    field: string,         // 필드명
    reason: string         // 에러 사유
  }>,
  timestamp?: string,
  request_id?: string,
  path?: string
}
```

### 외부 프로젝트 필수 설정

회원가입/로그인 시 `project_id` 환경변수 설정 필수:
- `BAAS_PROJECT_ID` (Node.js)
- `REACT_APP_BAAS_PROJECT_ID` (React CRA)
- `NEXT_PUBLIC_BAAS_PROJECT_ID` (Next.js)
- `VITE_BAAS_PROJECT_ID` (Vite)

템플릿의 `getProjectId()` 함수가 자동으로 환경변수에서 주입합니다.

---

## 1. 회원가입 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /account/signup` |
| 인증 | 불필요 |
| Content-Type | `application/json` |

### 요청
```typescript
interface SignupRequest {
  user_id: string;       // 로그인 ID (이메일 형식 권장)
  user_pw: string;       // 비밀번호 (8자 이상 필수)
  name: string;          // 이름 (최대 32자)
  phone: string;         // 전화번호 (예: "010-1234-5678")
  project_id: string;    // 환경변수에서 getProjectId()로 자동 주입
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  data?: Record<string, unknown>;  // 확장 포인트
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    user_id: string,
    name: string,
    phone: string,
    is_profile_completed: boolean,
    created_at: string
  },
  message: "회원가입 완료"
}
```

### 유효성 검사
| 필드 | 조건 |
|------|------|
| `user_id` | 필수, 이메일 형식 권장 |
| `user_pw` | 필수, 8자 이상 |
| `name` | 필수, 32자 이하 |
| `phone` | 필수, 64자 이하 |

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "VALIDATION_ERROR",
  "message": "요청 값이 올바르지 않습니다.",
  "detail": [
    { "field": "user_pw", "reason": "user_pw 필드는 최소 8자 이상이어야 합니다." }
  ],
  "timestamp": "2025-11-26T14:30:45.123456+09:00",
  "request_id": "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6",
  "path": "/account/signup"
}
```

---

## 2. 로그인 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /account/login` |
| 인증 | 불필요 |
| Content-Type | `application/json` |

### 요청
```typescript
interface LoginRequest {
  user_id: string;
  user_pw: string;
  project_id: string;    // 환경변수에서 getProjectId()로 자동 주입
}
```

### 응답
```typescript
// 성공 시 쿠키에 access_token 자동 설정
{
  result: "SUCCESS",
  data: {
    access_token: string,
    token_type: "bearer"
  },
  message: "로그인 완료"
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "INVALID_USER",
  "message": "비밀번호가 올바르지 않습니다.",
  "timestamp": "2025-11-26T14:30:45.123456+09:00",
  "request_id": "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6",
  "path": "/account/login"
}
```

---

## 3. 로그아웃 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /account/logout` |
| 인증 | 필요 (쿠키) |
| Content-Type | `application/json` |

### 요청
요청 본문 없음 (쿠키로 인증)

### 응답
```typescript
// 성공 시 쿠키 자동 삭제
{
  result: "SUCCESS",
  data: null,
  message: "로그아웃 완료"
}
```

---

## 4. 계정정보 조회 API

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /account/info` |
| 인증 | 필요 (쿠키) |

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    user_id: string,
    name: string,
    phone: string,
    is_profile_completed: boolean,
    last_logged_at: string | null,
    created_at: string,
    data: Record<string, unknown>
  }
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "UNAUTHORIZED",
  "message": "로그인이 필요합니다.",
  "timestamp": "2025-11-26T14:30:45.123456+09:00",
  "request_id": "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6",
  "path": "/account/info"
}
```

---

## 에러 코드

### 회원 인증 관련

| ErrorCode | HTTP | 설명 | 대응 |
|-----------|------|------|------|
| `INVALID_USER` | 400 | ID/PW 불일치 | 입력값 확인 안내 |
| `UNAUTHORIZED` | 401 | 로그인 필요 | 로그인 페이지로 이동 |
| `INVALID_TOKEN` | 401 | 잘못된 토큰 | 재로그인 |
| `TOKEN_EXPIRED` | 401 | 토큰 만료 | 재로그인 |
| `ALREADY_EXISTS` | 409 | 이미 존재하는 ID | 다른 아이디 입력 안내 |
| `VALIDATION_ERROR` | 400 | 유효성 검사 실패 | 필드별 에러 메시지 표시 |
| `NOT_FOUND` | 404 | 계정 없음 | 회원가입 안내 |
| `INVALID_CODE` | 400 | 잘못된 인증 코드 | 코드 재입력 |
| `MAX_ATTEMPTS_EXCEEDED` | 429 | 최대 시도 횟수 초과 | 일정 시간 대기 |
| `EXPIRED` | 410 | 인증 만료 | 재시도 안내 |

### 전체 에러 코드 참조

상세한 에러 코드 목록과 처리 패턴은 [error-codes.md](../../baas-common/references/error-codes.md)를 참조하세요.

---

## 디버깅

에러 발생 시 응답의 `request_id`를 활용하여 서버 로그를 추적할 수 있습니다:

```typescript
// 에러 처리 예시
catch (error) {
  if (error.request_id) {
    console.error(`[${error.request_id}] ${error.errorCode}: ${error.message}`);
    // 사용자에게 request_id 표시 (고객 지원용)
  }
}
```
