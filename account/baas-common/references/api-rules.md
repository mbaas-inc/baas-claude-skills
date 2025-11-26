# BaaS API 공통 규칙

BaaS(aiapp-service) API와 통신할 때 반드시 따라야 할 규칙입니다.

## 1. Base URL

```
https://api.aiapp.link
```

**⚠️ 외부 에디터에서는 프로덕션 URL만 사용**

## 2. 인증 방식

### 쿠키 기반 JWT
- **httponly**: JavaScript에서 직접 접근 불가 (XSS 방어)
- **secure**: HTTPS에서만 전송 (프로덕션)
- **samesite**: `None` (크로스 도메인 쿠키)

### 쿠키명 규칙
| 사용자 유형 | 쿠키명 | 예시 |
|-------------|--------|------|
| 관리자 | `access_token` | `access_token` |
| 프로젝트 사용자 | `access_token_{project_id}` | `access_token_maas` |

### 필수 설정
```javascript
// 모든 요청에 반드시 포함
credentials: 'include'
```

## 3. 요청 헤더

```javascript
headers: {
  'Content-Type': 'application/json'
}
```

## 4. 응답 형식

### 성공 응답
```json
{
  "result": "SUCCESS",
  "data": { /* API별 데이터 */ },
  "message": "성공 메시지 (선택)"
}
```

### 에러 응답
```json
{
  "result": "FAIL",
  "errorCode": "INVALID_USER",
  "message": "아이디 또는 비밀번호가 올바르지 않습니다."
}
```

## 5. HTTP 상태 코드

| 코드 | 의미 | ErrorCode |
|------|------|-----------|
| 200 | 성공 | - |
| 400 | 잘못된 요청 | `BAD_REQUEST` |
| 401 | 인증 필요/실패 | `UNAUTHORIZED`, `INVALID_USER` |
| 403 | 권한 없음 | - |
| 404 | 리소스 없음 | `NOT_FOUND` |
| 409 | 충돌 (중복) | `ALREADY_EXISTS` |
| 410 | 만료됨 | `EXPIRED` |
| 422 | 유효성 실패 | `VALIDATION_ERROR` |
| 429 | 요청 한도 초과 | `RATE_LIMIT_EXCEEDED` |
| 500 | 서버 오류 | `INTERNAL_SERVER_ERROR` |

## 6. 공통 fetch 패턴

### TypeScript
```typescript
const API_BASE_URL = 'https://api.aiapp.link';

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || `API Error: ${result.errorCode}`);
  }

  return result.data;
}
```

### JavaScript
```javascript
const API_BASE_URL = 'https://api.aiapp.link';

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || `API Error: ${result.errorCode}`);
  }

  return result.data;
}
```

## 7. 외부 프로젝트 필수 설정

**⚠️ 외부 에디터에서 BaaS API 사용 시 project_id 환경변수 설정 필수:**

```bash
# .env 파일
BAAS_PROJECT_ID=your-project-uuid           # Node.js
REACT_APP_BAAS_PROJECT_ID=your-project-uuid # React (CRA)
NEXT_PUBLIC_BAAS_PROJECT_ID=your-project-uuid # Next.js
VITE_BAAS_PROJECT_ID=your-project-uuid      # Vite
```

**getProjectId() 패턴:**
```javascript
function getProjectId() {
  const projectId =
    process.env.BAAS_PROJECT_ID ||
    process.env.REACT_APP_BAAS_PROJECT_ID ||
    process.env.NEXT_PUBLIC_BAAS_PROJECT_ID ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BAAS_PROJECT_ID);

  if (!projectId) {
    throw new Error('[BaaS] project_id 환경변수 필요');
  }
  return projectId;
}
```

## 8. CORS 주의사항

- 프로덕션에서는 `*.aiapp.link` 도메인만 허용
- 로컬 개발 시 `http://localhost:*` 허용
- `credentials: 'include'` 사용 시 `Access-Control-Allow-Credentials: true` 필요
