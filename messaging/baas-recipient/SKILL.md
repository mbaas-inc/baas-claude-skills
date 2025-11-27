---
name: baas-recipient
description: "(BaaS API) 발송대상 등록 API. Use when: 연락처 등록, 예약 접수, 문의 등록, 뉴스레터 구독, recipient 생성, 발송대상 추가"
---

# BaaS 발송대상 등록 API

발송대상(연락처)을 BaaS 플랫폼에 등록하는 API입니다. 예약, 문의, 뉴스레터 구독 등 다양한 용도로 활용할 수 있습니다.

## API 스펙

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /recipient/{project_id}` |
| 인증 | 불필요 (공개 API) |
| Content-Type | `application/json` |

## 요청 형식

```typescript
interface RecipientCreateRequest {
  name: string;           // 이름 (필수)
  phone: string;          // 전화번호 010-XXXX-XXXX (필수)
  description?: string;   // 설명/메모 (기본값: " ")
  data?: string;          // JSON 메타데이터 (기본값: "{}")
}
```

## 응답 형식

```typescript
// 성공 시
{
  result: "SUCCESS",
  data: {
    id: string,              // UUID
    project_id: string,      // 프로젝트 UUID
    name: string,
    phone: string,
    description: string | null,
    data: string,            // JSON 문자열
    created_at: string,      // ISO 8601
    removed_at: string | null
  },
  message: "발송 대상 생성 완료"
}

// 실패 시
{
  result: "FAIL",
  errorCode: "ALREADY_EXISTS",
  message: "이미 등록된 전화번호입니다"
}
```

## 전화번호 유효성 검사

```typescript
// 전화번호 형식 검증
function validatePhone(phone: string): boolean {
  return /^010-\d{4}-\d{4}$/.test(phone);
}

// 자동 포맷팅 (선택)
function formatPhone(value: string): string {
  const numbers = value.replace(/[^\d]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0,3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0,3)}-${numbers.slice(3,7)}-${numbers.slice(7,11)}`;
}
```

## 사용 예시

### TypeScript
```typescript
// templates/recipient.ts 참조
const recipient = await registerRecipient({
  name: '홍길동',
  phone: '010-1234-5678',
  description: '12월 25일 저녁 7시 예약',
  metadata: { type: 'reservation', date: '2024-12-25', time: '19:00' }
});
```

### JavaScript
```javascript
// templates/recipient.js 참조
const recipient = await registerRecipient({
  name: '홍길동',
  phone: '010-1234-5678',
  description: '제품 문의'
});
```

### React Hook
```tsx
// templates/react/useRecipient.tsx 참조
const { register, isLoading, error } = useRecipient();

const handleSubmit = async () => {
  await register({
    name: '홍길동',
    phone: '010-1234-5678'
  });
};
```

## 메타데이터 예시

### 예약
```json
{
  "type": "reservation",
  "date": "2024-12-25",
  "time": "19:00",
  "partySize": 4
}
```

### 문의
```json
{
  "type": "inquiry",
  "inquiryType": "product",
  "message": "견적 요청"
}
```

### 뉴스레터
```json
{
  "type": "newsletter",
  "source": "landing_page",
  "consent": true
}
```

## 에러 코드

| ErrorCode | 설명 | 대응 |
|-----------|------|------|
| `VALIDATION_ERROR` | 필수 필드 누락/형식 오류 | 입력값 검증 |
| `ALREADY_EXISTS` | 중복 전화번호 | 다른 번호 사용 안내 |
| `NOT_FOUND` | 프로젝트 없음 | project_id 확인 |
| `INTERNAL_SERVER_ERROR` | 서버 오류 | 재시도 안내 |

## 템플릿 파일

- [recipient.ts](templates/recipient.ts) - TypeScript 버전
- [recipient.js](templates/recipient.js) - JavaScript 버전
- [useRecipient.tsx](templates/react/useRecipient.tsx) - React Hook