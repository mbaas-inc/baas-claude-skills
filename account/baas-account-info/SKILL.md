---
name: baas-account-info
description: "(BaaS API) 계정정보 조회 API. Use when: 내 정보 조회, 프로필 표시, user info 필요 시"
---

# BaaS 계정 정보 API

로그인된 사용자의 계정 정보를 조회하는 API입니다.

## API 스펙

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /account/info` |
| 인증 | 필요 (쿠키 기반 JWT) |

## 응답 형식

```typescript
// 성공 시
{
  result: "SUCCESS",
  data: {
    id: string,                    // 계정 UUID
    user_id: string,               // 로그인 ID
    name: string,                  // 이름
    phone: string,                 // 전화번호
    is_profile_completed: boolean, // 프로필 완성 여부
    last_logged_at: string | null, // 마지막 로그인 (ISO 8601)
    created_at: string,            // 생성일시 (ISO 8601)
    data: Record<string, unknown>  // 추가 데이터
  }
}

// 실패 시
{
  result: "FAIL",
  errorCode: "UNAUTHORIZED",
  message: "로그인이 필요합니다."
}
```

## 사용 예시

### TypeScript
```typescript
// templates/account-info.ts 참조
const account = await getAccountInfo();
console.log(account.name); // 홍길동
```

### JavaScript
```javascript
// templates/account-info.js 참조
const account = await getAccountInfo();
console.log(account.name); // 홍길동
```

### React Hook
```tsx
// templates/react/useAccountInfo.tsx 참조
const { data: account, isLoading, refetch } = useAccountInfo();
// account?.name
```

## 에러 코드

| ErrorCode | 설명 | 대응 |
|-----------|------|------|
| `UNAUTHORIZED` | 로그인 필요 | 로그인 페이지로 이동 |

## 템플릿 파일

- [account-info.ts](templates/account-info.ts) - TypeScript 버전
- [account-info.js](templates/account-info.js) - JavaScript 버전
- [useAccountInfo.tsx](templates/react/useAccountInfo.tsx) - React Hook