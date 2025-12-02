# BaaS API 공통 설정

## Base URL

```
https://api.aiapp.link
```

---

## 인증 방식

### 쿠키 기반 JWT
- 로그인 성공 시 서버가 쿠키에 JWT 자동 설정
- 모든 요청에 `credentials: 'include'` 필수
- 쿠키명: `access_token` (관리자) / `access_token_{project_id}` (프로젝트 사용자)

```typescript
// 모든 fetch 요청에 필수
fetch(url, {
  credentials: 'include',  // 필수!
  headers: { 'Content-Type': 'application/json' }
});
```

---

## 응답 형식

### 성공 응답
```typescript
interface SuccessResponse<T> {
  result: "SUCCESS";
  data: T;
  message?: string;
}
```

### 에러 응답
```typescript
interface ErrorResponse {
  result: "FAIL";
  errorCode: string;       // 에러 코드
  message: string;         // 사용자 친화적 메시지
  timestamp?: string;      // ISO 8601, KST
  request_id?: string;     // 요청 추적 UUID
  path?: string;           // 요청 경로
}
```

### 검증 에러 응답 (VALIDATION_ERROR)
```typescript
interface ValidationErrorResponse {
  result: "FAIL";
  errorCode: "VALIDATION_ERROR";
  message: "요청 값이 올바르지 않습니다.";
  detail?: Array<{
    field: string;         // 필드명
    reason: string;        // 에러 사유
  }>;
}
```

---

## 환경변수 설정

외부 에디터에서 BaaS API 사용 시 **project_id 환경변수 설정 필수**:

| 환경 | 환경변수명 |
|------|-----------|
| Node.js | `BAAS_PROJECT_ID` |
| React CRA | `REACT_APP_BAAS_PROJECT_ID` |
| Next.js | `NEXT_PUBLIC_BAAS_PROJECT_ID` |
| Vite | `VITE_BAAS_PROJECT_ID` |

### getProjectId() 함수 패턴
```typescript
function getProjectId(): string {
  const projectId =
    process.env.BAAS_PROJECT_ID ||
    process.env.REACT_APP_BAAS_PROJECT_ID ||
    process.env.NEXT_PUBLIC_BAAS_PROJECT_ID ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BAAS_PROJECT_ID);

  if (!projectId) {
    throw new Error('[BaaS] project_id 환경변수 필요');
  }
  return projectId;
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
| `NOT_FOUND` | 404 | 계정/리소스 없음 | 회원가입 안내 |

### 유효성 검사 관련

| ErrorCode | HTTP | 설명 | 대응 |
|-----------|------|------|------|
| `VALIDATION_ERROR` | 400 | 필수 필드 누락/형식 오류 | detail 필드별 에러 메시지 표시 |

### 서버 관련

| ErrorCode | HTTP | 설명 | 대응 |
|-----------|------|------|------|
| `INTERNAL_SERVER_ERROR` | 500 | 서버 오류 | 재시도 안내 |