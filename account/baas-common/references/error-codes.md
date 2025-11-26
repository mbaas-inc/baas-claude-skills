# BaaS 에러 코드 매핑

BaaS API에서 반환하는 에러 코드와 대응 방법입니다.

> **백엔드 동기화**: 2025-11-26 (예외 핸들링 리팩토링 반영)

## 에러 코드 테이블

### 인증/권한 관련

| ErrorCode | HTTP | 설명 | 사용자 메시지 예시 | 대응 방법 |
|-----------|------|------|-------------------|-----------|
| `INVALID_USER` | 400 | ID/PW 불일치 | "아이디 또는 비밀번호를 확인해주세요" | 입력값 확인 안내, 비밀번호 찾기 링크 |
| `UNAUTHORIZED` | 401 | 로그인 필요 | "로그인이 필요합니다" | 로그인 페이지로 이동 |
| `INVALID_TOKEN` | 401 | 잘못된 토큰 | "인증 정보가 올바르지 않습니다" | 재로그인 |
| `TOKEN_EXPIRED` | 401 | 토큰 만료 | "세션이 만료되었습니다" | 재로그인 |

### 요청 오류 관련

| ErrorCode | HTTP | 설명 | 사용자 메시지 예시 | 대응 방법 |
|-----------|------|------|-------------------|-----------|
| `NOT_FOUND` | 404 | 리소스 없음 | "요청한 정보를 찾을 수 없습니다" | 존재 여부 확인, 목록으로 이동 |
| `BAD_REQUEST` | 400 | 잘못된 요청 | "요청 형식이 올바르지 않습니다" | 요청 형식 검토 |
| `INVALID_REQUEST` | 400 | 잘못된 요청 형식 | "요청 형식이 올바르지 않습니다" | 요청 형식 검토 |
| `VALIDATION_ERROR` | 400 | 유효성 실패 | "입력값을 확인해주세요" | 필드별 에러 메시지 표시 |

### 상태 오류 관련

| ErrorCode | HTTP | 설명 | 사용자 메시지 예시 | 대응 방법 |
|-----------|------|------|-------------------|-----------|
| `ALREADY_EXISTS` | 409 | 중복 | "이미 사용 중인 아이디입니다" | 다른 값 입력 안내 |
| `ALREADY_COMPLETED` | 400 | 이미 완료 | "이미 처리된 요청입니다" | 현재 상태 확인 |
| `EXPIRED` | 410 | 만료됨 | "인증이 만료되었습니다" | 재시도 안내 |

### 제한 관련

| ErrorCode | HTTP | 설명 | 사용자 메시지 예시 | 대응 방법 |
|-----------|------|------|-------------------|-----------|
| `RATE_LIMIT_EXCEEDED` | 429 | 한도 초과 | "잠시 후 다시 시도해주세요" | 대기 후 재시도 |
| `MAX_ATTEMPTS_EXCEEDED` | 429 | 최대 시도 초과 | "시도 횟수를 초과했습니다" | 일정 시간 대기 |
| `INVALID_CODE` | 400 | 잘못된 인증 코드 | "인증 코드가 올바르지 않습니다" | 코드 재입력 |

### 서버 오류 관련

| ErrorCode | HTTP | 설명 | 사용자 메시지 예시 | 대응 방법 |
|-----------|------|------|-------------------|-----------|
| `INTERNAL_SERVER_ERROR` | 500 | 서버 오류 | "일시적인 오류가 발생했습니다" | 관리자 문의 안내 |
| `NOT_IMPLEMENTED` | 501 | 미구현 기능 | "아직 지원하지 않는 기능입니다" | 기능 미지원 안내 |
| `EXTERNAL_SERVER_ERROR` | 502 | 외부 서버 에러 | "외부 서비스 연결에 실패했습니다" | 재시도 |
| `WEBHOOK_ERROR` | 500 | 웹훅 에러 | "웹훅 처리에 실패했습니다" | 설정 확인 |

### 기능별 에러

| ErrorCode | HTTP | 설명 | 사용자 메시지 예시 | 대응 방법 |
|-----------|------|------|-------------------|-----------|
| `UNSUPPORTED_VENDOR` | 400 | 미지원 벤더 | "지원하지 않는 서비스입니다" | 지원 벤더 확인 |
| `UNSUPPORTED_METHOD` | 405 | 미지원 메서드 | "지원하지 않는 방식입니다" | API 문서 확인 |
| `FCM_SUBSCRIBE_FAILED` | 500 | FCM 구독 실패 | "푸시 알림 등록에 실패했습니다" | 재시도 |

---

## 에러 응답 형식

모든 에러 응답은 다음 형식을 따릅니다:

```typescript
interface ErrorResponse {
  result: 'FAIL';
  errorCode: string;        // 위 테이블의 에러 코드
  message: string;          // 사용자 친화적 메시지
  timestamp?: string;       // 에러 발생 시간 (ISO 8601, KST)
  request_id?: string;      // 요청 추적 UUID
  path?: string;            // 요청 경로
}
```

### 검증 에러 응답 (VALIDATION_ERROR)

유효성 검사 실패 시 필드별 상세 정보가 포함됩니다:

```typescript
interface ValidationErrorResponse extends ErrorResponse {
  errorCode: 'VALIDATION_ERROR';
  detail?: Array<{
    field: string;    // 필드명
    reason: string;   // 에러 사유
  }>;
}
```

---

## 에러 처리 패턴

### TypeScript

```typescript
import type { ApiResponse, ErrorCode, ErrorResponse, ValidationErrorResponse } from './types';

async function handleApiCall<T>(apiCall: () => Promise<ApiResponse<T>>): Promise<T> {
  try {
    const result = await apiCall();

    if (result.result === 'SUCCESS') {
      return result.data;
    }

    // 에러 처리
    handleError(result as ErrorResponse);
    throw new Error(result.message);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('알 수 없는 오류가 발생했습니다');
  }
}

function handleError(error: ErrorResponse): void {
  // 디버깅용 로깅 (request_id 활용)
  if (error.request_id) {
    console.error(`[${error.request_id}] ${error.errorCode}: ${error.message}`);
  }

  switch (error.errorCode) {
    case 'INVALID_USER':
      // 로그인 실패 처리
      alert('아이디 또는 비밀번호를 확인해주세요');
      break;

    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      // 인증 필요 - 로그인 페이지로 이동
      window.location.href = '/login';
      break;

    case 'VALIDATION_ERROR':
      // 유효성 검사 실패 - 필드별 에러 표시
      handleValidationError(error as ValidationErrorResponse);
      break;

    case 'ALREADY_EXISTS':
      // 중복 - 다른 값 입력 안내
      alert('이미 사용 중입니다. 다른 값을 입력해주세요');
      break;

    case 'EXPIRED':
    case 'INVALID_CODE':
      // 만료/잘못된 코드 - 재시도 안내
      alert('인증이 만료되었습니다. 다시 시도해주세요');
      break;

    case 'RATE_LIMIT_EXCEEDED':
    case 'MAX_ATTEMPTS_EXCEEDED':
      // 한도 초과 - 대기 안내
      alert('요청이 너무 많습니다. 잠시 후 다시 시도해주세요');
      break;

    case 'NOT_IMPLEMENTED':
      // 미구현 기능
      alert('아직 지원하지 않는 기능입니다');
      break;

    case 'INTERNAL_SERVER_ERROR':
    case 'EXTERNAL_SERVER_ERROR':
    case 'WEBHOOK_ERROR':
    default:
      // 서버 오류 - 관리자 문의
      alert('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요');
      break;
  }
}

function handleValidationError(error: ValidationErrorResponse): void {
  if (error.detail && error.detail.length > 0) {
    // 필드별 에러 메시지 표시
    const messages = error.detail.map(d => `${d.field}: ${d.reason}`).join('\n');
    alert(messages);
  } else {
    alert(error.message);
  }
}
```

### React Hook 에러 처리

```tsx
import { useCallback } from 'react';
import type { ErrorResponse, ValidationErrorResponse } from './types';

function useApiError() {
  const handleError = useCallback((error: unknown) => {
    if (isErrorResponse(error)) {
      // request_id를 포함한 에러 로깅
      console.error(`[API Error] ${error.request_id || 'N/A'}: ${error.errorCode}`);

      // 검증 에러의 경우 상세 처리
      if (error.errorCode === 'VALIDATION_ERROR') {
        const validationError = error as ValidationErrorResponse;
        if (validationError.detail?.length) {
          toast.error(validationError.detail[0].reason);
          return;
        }
      }

      toast.error(error.message);
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error('알 수 없는 오류가 발생했습니다');
    }
  }, []);

  return { handleError };
}

function isErrorResponse(error: unknown): error is ErrorResponse {
  return typeof error === 'object' && error !== null && 'result' in error && error.result === 'FAIL';
}
```

---

## 에러별 상세 설명

### INVALID_USER
- **원인**: 로그인 시 아이디 또는 비밀번호가 일치하지 않음
- **HTTP 상태**: 400 (잘못된 요청)
- **대응**: 입력값 재확인, 비밀번호 찾기 기능 안내

### UNAUTHORIZED
- **원인**: 인증이 필요한 API에 인증 없이 접근
- **HTTP 상태**: 401 (인증 필요)
- **대응**: 로그인 페이지로 리다이렉트, 로그인 후 원래 페이지로 복귀

### VALIDATION_ERROR
- **원인**: 요청 데이터가 유효성 검사 실패
- **HTTP 상태**: 400 (잘못된 요청)
- **대응**: 응답의 `detail`에 포함된 상세 내용을 필드별로 표시

### ALREADY_EXISTS
- **원인**: 회원가입 시 이미 존재하는 아이디
- **HTTP 상태**: 409 (충돌)
- **대응**: 다른 아이디 입력 안내, 아이디 중복 확인 기능 제공

### EXPIRED
- **원인**: 인증 코드, 토큰 등이 만료됨
- **HTTP 상태**: 410 (만료됨)
- **대응**: 인증 절차 처음부터 다시 시작

### RATE_LIMIT_EXCEEDED / MAX_ATTEMPTS_EXCEEDED
- **원인**: 동일 요청을 너무 많이 시도 (예: 로그인 5회 실패)
- **HTTP 상태**: 429 (요청 한도 초과)
- **대응**: 일정 시간 대기 후 재시도 안내

### INVALID_CODE
- **원인**: 인증 코드가 올바르지 않음
- **HTTP 상태**: 400 (잘못된 요청)
- **대응**: 인증 코드 재입력 안내

### NOT_IMPLEMENTED
- **원인**: 아직 구현되지 않은 기능 호출
- **HTTP 상태**: 501 (미구현)
- **대응**: 기능 미지원 안내

---

## 디버깅 가이드

에러 응답의 `request_id`를 활용하여 서버 로그와 매칭할 수 있습니다:

```typescript
// 에러 발생 시 콘솔에 request_id 출력
console.error(`문제 발생 시 이 ID를 관리자에게 전달해주세요: ${error.request_id}`);
```

서버 로그 검색 예시:
```bash
# CloudWatch에서 특정 request_id로 검색
aws logs filter-log-events --log-group-name /aws/lambda/aiapp-service \
  --filter-pattern "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6"
```
