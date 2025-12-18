# BaaS Account API 스펙

## 목차

1. [회원가입 API](#1-회원가입-api)
2. [로그인 API](#2-로그인-api)
3. [로그아웃 API](#3-로그아웃-api)
4. [계정정보 조회 API](#4-계정정보-조회-api)

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