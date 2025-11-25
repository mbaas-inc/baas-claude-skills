# BaaS 에러 코드 매핑

BaaS API에서 반환하는 에러 코드와 대응 방법입니다.

## 에러 코드 테이블

| ErrorCode | HTTP | 설명 | 사용자 메시지 예시 | 대응 방법 |
|-----------|------|------|-------------------|-----------|
| `INVALID_USER` | 401 | ID/PW 불일치 | "아이디 또는 비밀번호를 확인해주세요" | 입력값 확인 안내, 비밀번호 찾기 링크 |
| `UNAUTHORIZED` | 401 | 로그인 필요 | "로그인이 필요합니다" | 로그인 페이지로 이동 |
| `NOT_FOUND` | 404 | 리소스 없음 | "요청한 정보를 찾을 수 없습니다" | 존재 여부 확인, 목록으로 이동 |
| `BAD_REQUEST` | 400 | 잘못된 요청 | "요청 형식이 올바르지 않습니다" | 요청 형식 검토 |
| `VALIDATION_ERROR` | 422 | 유효성 실패 | "입력값을 확인해주세요" | 필드별 에러 메시지 표시 |
| `ALREADY_EXISTS` | 409 | 중복 | "이미 사용 중인 아이디입니다" | 다른 값 입력 안내 |
| `ALREADY_COMPLETED` | 400 | 이미 완료 | "이미 처리된 요청입니다" | 현재 상태 확인 |
| `EXPIRED` | 410 | 만료됨 | "인증이 만료되었습니다" | 재시도 안내 |
| `RATE_LIMIT_EXCEEDED` | 429 | 한도 초과 | "잠시 후 다시 시도해주세요" | 대기 후 재시도 |
| `INTERNAL_SERVER_ERROR` | 500 | 서버 오류 | "일시적인 오류가 발생했습니다" | 관리자 문의 안내 |

## 에러 처리 패턴

### TypeScript
```typescript
import type { ApiResponse, ErrorCode } from './types';

async function handleApiCall<T>(apiCall: () => Promise<ApiResponse<T>>): Promise<T> {
  try {
    const result = await apiCall();

    if (result.result === 'SUCCESS') {
      return result.data;
    }

    // 에러 처리
    handleError(result.errorCode, result.message);
    throw new Error(result.message);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('알 수 없는 오류가 발생했습니다');
  }
}

function handleError(errorCode: ErrorCode, message: string): void {
  switch (errorCode) {
    case 'INVALID_USER':
      // 로그인 실패 처리
      alert('아이디 또는 비밀번호를 확인해주세요');
      break;

    case 'UNAUTHORIZED':
      // 인증 필요 - 로그인 페이지로 이동
      window.location.href = '/login';
      break;

    case 'VALIDATION_ERROR':
      // 유효성 검사 실패 - 필드별 에러 표시
      alert(message);
      break;

    case 'ALREADY_EXISTS':
      // 중복 - 다른 값 입력 안내
      alert('이미 사용 중입니다. 다른 값을 입력해주세요');
      break;

    case 'EXPIRED':
      // 만료 - 재시도 안내
      alert('인증이 만료되었습니다. 다시 시도해주세요');
      break;

    case 'RATE_LIMIT_EXCEEDED':
      // 한도 초과 - 대기 안내
      alert('요청이 너무 많습니다. 잠시 후 다시 시도해주세요');
      break;

    case 'INTERNAL_SERVER_ERROR':
    default:
      // 서버 오류 - 관리자 문의
      alert('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요');
      break;
  }
}
```

### React Hook 에러 처리
```tsx
function useApiError() {
  const handleError = useCallback((error: unknown) => {
    if (error instanceof Error) {
      // API 에러 메시지 사용
      toast.error(error.message);
    } else {
      toast.error('알 수 없는 오류가 발생했습니다');
    }
  }, []);

  return { handleError };
}
```

## 에러별 상세 설명

### INVALID_USER
- **원인**: 로그인 시 아이디 또는 비밀번호가 일치하지 않음
- **대응**: 입력값 재확인, 비밀번호 찾기 기능 안내

### UNAUTHORIZED
- **원인**: 인증이 필요한 API에 인증 없이 접근
- **대응**: 로그인 페이지로 리다이렉트, 로그인 후 원래 페이지로 복귀

### VALIDATION_ERROR
- **원인**: 요청 데이터가 유효성 검사 실패
- **대응**: 응답의 `message`에 포함된 상세 내용을 필드별로 표시

### ALREADY_EXISTS
- **원인**: 회원가입 시 이미 존재하는 아이디
- **대응**: 다른 아이디 입력 안내, 아이디 중복 확인 기능 제공

### EXPIRED
- **원인**: 인증 코드, 토큰 등이 만료됨
- **대응**: 인증 절차 처음부터 다시 시작

### RATE_LIMIT_EXCEEDED
- **원인**: 동일 요청을 너무 많이 시도 (예: 로그인 5회 실패)
- **대응**: 일정 시간 대기 후 재시도 안내