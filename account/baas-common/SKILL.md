---
name: baas-common
description: BaaS API 공통 타입과 규칙 문서
category: account
keywords:
  - BaaS 공통
  - API 규칙
  - 공통 타입
  - 에러 코드
  - BaaS API
  - 응답 형식
  - 인증 방식
  - credentials include
references:
  - path: references/types.ts
    type: typescript
    description: 공통 TypeScript 타입 정의
  - path: references/api-rules.md
    type: markdown
    description: API 통신 규칙 문서
  - path: references/error-codes.md
    type: markdown
    description: 에러 코드 매핑 테이블
---

# BaaS API 공통 규칙

BaaS(aiapp-service) API와 통신할 때 반드시 따라야 할 공통 규칙입니다.

## 사용 시점

- BaaS API와 통신하는 코드를 작성할 때
- 에러 처리 로직을 구현할 때
- TypeScript 타입 정의가 필요할 때

## 핵심 규칙

### 1. 인증 방식
- **쿠키 기반 JWT** 사용
- 모든 요청에 `credentials: 'include'` **필수**
- 쿠키명:
  - 관리자: `access_token`
  - 프로젝트 사용자: `access_token_{project_id}`

### 2. Base URL
```
로컬:      http://localhost:8000
프로덕션:  https://api.aiapp.link
```

### 3. 응답 형식
```typescript
// 성공
{ result: "SUCCESS", data: T, message?: string }

// 실패
{ result: "FAIL", errorCode: string, message: string }
```

### 4. 공통 fetch 패턴
```javascript
const response = await fetch(`${API_BASE_URL}/endpoint`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',  // 필수!
  body: JSON.stringify(data)
});
const result = await response.json();
if (result.result !== 'SUCCESS') {
  throw new Error(result.message);
}
return result.data;
```

## 참조 문서

- [공통 타입 정의](references/types.ts) - TypeScript 인터페이스
- [API 규칙 상세](references/api-rules.md) - HTTP 상태 코드, 요청 형식 등
- [에러 코드 매핑](references/error-codes.md) - 에러별 대응 방법
