---
name: baas-signup
description: "(BaaS API) 회원가입 API. 사용: 회원가입 기능, 가입 폼, register, sign up"
---

# BaaS 회원가입 API

BaaS 서버에 새 계정을 생성하는 API입니다.

## API 스펙

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /account/signup` |
| 인증 | 불필요 |
| Content-Type | `application/json` |

## 요청 형식

```typescript
interface SignupRequest {
  user_id: string;       // 로그인 ID (이메일 형식 권장)
  user_pw: string;       // 비밀번호 (8자 이상 필수)
  name: string;          // 이름 (최대 32자)
  phone: string;         // 전화번호 (예: "010-1234-5678", 최대 64자)
  project_id?: string;   // 프로젝트 ID (선택, 프로젝트 사용자만)
  terms_agreed?: boolean;   // 이용약관 동의
  privacy_agreed?: boolean; // 개인정보 처리방침 동의
  data?: Record<string, unknown>; // 추가 데이터
}
```

## 응답 형식

```typescript
// 성공 시
{
  result: "SUCCESS",
  data: {
    id: string,           // 계정 UUID
    user_id: string,      // 로그인 ID
    name: string,         // 이름
    phone: string,        // 전화번호
    is_profile_completed: boolean,
    created_at: string    // ISO 8601
  },
  message: "회원가입 완료"
}

// 실패 시
{
  result: "FAIL",
  errorCode: "ALREADY_EXISTS" | "VALIDATION_ERROR",
  message: "이미 사용 중인 아이디입니다." | "비밀번호는 8자 이상이어야 합니다."
}
```

## 유효성 검사

| 필드 | 조건 | 에러 메시지 |
|------|------|-------------|
| `user_id` | 필수, 이메일 형식 권장 | "아이디를 입력해주세요" |
| `user_pw` | 필수, 8자 이상 | "비밀번호는 8자 이상이어야 합니다" |
| `name` | 필수, 32자 이하 | "이름을 입력해주세요" |
| `phone` | 필수, 64자 이하 | "전화번호를 입력해주세요" |

## 사용 예시

### TypeScript
```typescript
// templates/signup.ts 참조
const account = await signup({
  user_id: 'user@example.com',
  user_pw: 'password123',
  name: '홍길동',
  phone: '010-1234-5678'
});
```

### JavaScript
```javascript
// templates/signup.js 참조
const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
```

### React Hook
```tsx
// templates/react/useSignup.tsx 참조
const { signup, isLoading, error } = useSignup();
await signup({
  user_id: 'user@example.com',
  user_pw: 'password123',
  name: '홍길동',
  phone: '010-1234-5678'
});
```

## 에러 코드

| ErrorCode | 설명 | 대응 |
|-----------|------|------|
| `ALREADY_EXISTS` | 이미 존재하는 ID | 다른 아이디 입력 안내 |
| `VALIDATION_ERROR` | 유효성 검사 실패 | 필드별 에러 메시지 표시 |
| `BAD_REQUEST` | 잘못된 요청 | 요청 형식 확인 |

## 템플릿 파일

- [signup.ts](templates/signup.ts) - TypeScript 버전
- [signup.js](templates/signup.js) - JavaScript 버전
- [useSignup.tsx](templates/react/useSignup.tsx) - React Hook
