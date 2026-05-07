# BaaS Account API 스펙

## 목차

1. [회원가입 API](#1-회원가입-api)
2. [로그인 API](#2-로그인-api)
3. [로그아웃 API](#3-로그아웃-api)
4. [계정정보 조회 API](#4-계정정보-조회-api)
5. [비밀번호 변경 API](#5-비밀번호-변경-api)

---

## 1. 회원가입 API (프로젝트 회원 전용)

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /account/signup-project` |
| 인증 | 불필요 |
| 이메일 인증 | 불필요 |
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
  "errorCode": "ALREADY_EXISTS",
  "message": "이미 존재하는 아이디입니다."
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
  "message": "비밀번호가 올바르지 않습니다."
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
  "message": "로그인이 필요합니다."
}
```

---

## 5. 비밀번호 변경 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /account/profile/change-password` |
| 인증 | 필요 (쿠키) |
| Content-Type | `application/json` |

### 요청
```typescript
interface PasswordChangeRequest {
  current_password: string;  // 현재 비밀번호
  new_password: string;      // 새 비밀번호 (8자 이상 필수)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: null,
  message: "비밀번호가 변경되었습니다."
}
```

### 유효성 검사
| 필드 | 조건 |
|------|------|
| `current_password` | 필수 |
| `new_password` | 필수, 8자 이상 |

### 제약 사항
- SNS 로그인 계정(카카오/네이버/구글 등)은 비밀번호 변경 불가
- 현재 비밀번호가 일치해야 변경 가능

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "BAD_REQUEST",
  "message": "현재 비밀번호가 올바르지 않습니다."
}
```

| 상황 | HTTP | errorCode |
|------|------|-----------|
| 현재 비밀번호 불일치 | 400 | `BAD_REQUEST` |
| SNS 로그인 계정 | 400 | `BAD_REQUEST` |
| 계정을 찾을 수 없음 | 404 | `NOT_FOUND` |
| `new_password` 8자 미만 | 422 | `VALIDATION_ERROR` |
| 미인증(쿠키 만료) | 401 | `UNAUTHORIZED` |

---

## 에러 코드

> 에러 코드 전체 목록은 [common.md](common.md#에러-코드)를 참조하세요.

---

## phone 필드 검증

전화번호는 `010-XXXX-XXXX` 형식이어야 합니다.

검증 함수는 `templates/react/utils.ts`의 `validatePhone()`을 참고하세요.

```typescript
import { validatePhone, formatPhone } from './utils';

// 검증
if (!validatePhone(phone)) {
  alert('전화번호 형식을 확인해주세요.');
}

// 포맷팅 (입력 시 자동 하이픈)
const formatted = formatPhone('01012345678'); // "010-1234-5678"
```