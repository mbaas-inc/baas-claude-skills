# BaaS 회원 인증 API 스펙

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
로컬:      http://localhost:8000
프로덕션:  https://api.aiapp.link
```

### 인증 방식
- 쿠키 기반 JWT
- 모든 요청에 `credentials: 'include'` 필수
- 쿠키명: `access_token` (관리자) / `access_token_{project_id}` (프로젝트 사용자)

### 응답 형식
```typescript
// 성공
{ result: "SUCCESS", data: T, message?: string }

// 실패
{ result: "FAIL", errorCode: string, message: string }
```

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
  project_id?: string;   // 프로젝트 ID (선택)
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  data?: Record<string, unknown>;
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
  project_id?: string;
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

---

## 에러 코드

| ErrorCode | 설명 | 대응 |
|-----------|------|------|
| `INVALID_USER` | ID/PW 불일치 | 입력값 확인 안내 |
| `UNAUTHORIZED` | 로그인 필요 | 로그인 페이지로 이동 |
| `ALREADY_EXISTS` | 이미 존재하는 ID | 다른 아이디 입력 안내 |
| `VALIDATION_ERROR` | 유효성 검사 실패 | 필드별 에러 메시지 표시 |
| `NOT_FOUND` | 계정 없음 | 회원가입 안내 |
