# BaaS Messaging API 스펙

## 목차

1. [발송대상 등록 API](#1-발송대상-등록-api)
2. [전화번호 유효성 검사](#2-전화번호-유효성-검사)
3. [메타데이터 예시](#3-메타데이터-예시)

---

## 1. 발송대상 등록 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /recipient/{project_id}` |
| 인증 | 불필요 (공개 API) |
| Content-Type | `application/json` |

### 요청
```typescript
interface RecipientCreateRequest {
  name: string;           // 이름 (필수)
  phone: string;          // 전화번호 010-XXXX-XXXX (필수)
  description?: string;   // 설명/메모 (기본값: " ")
  data?: string;          // JSON 메타데이터 (기본값: "{}")
}
```

### 응답
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
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "ALREADY_EXISTS",
  "message": "이미 등록된 전화번호입니다"
}
```

```json
{
  "result": "FAIL",
  "errorCode": "VALIDATION_ERROR",
  "message": "요청 값이 올바르지 않습니다.",
  "detail": [
    { "field": "phone", "reason": "전화번호 형식이 올바르지 않습니다." }
  ]
}
```

---

## 2. 전화번호 유효성 검사

> 💡 **클라이언트 구현 참고용**: 아래 함수들은 서버 API 스펙이 아닌, 클라이언트에서 전화번호를 검증/포맷팅할 때 참고할 수 있는 유틸리티 예시입니다.

### 필수 형식
```
010-XXXX-XXXX
```

### 검증 함수
```typescript
function validatePhone(phone: string): boolean {
  return /^010-\d{4}-\d{4}$/.test(phone);
}
```

### 자동 포맷팅 함수
```typescript
function formatPhone(value: string): string {
  const numbers = value.replace(/[^\d]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0,3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0,3)}-${numbers.slice(3,7)}-${numbers.slice(7,11)}`;
}
```

---

## 3. 메타데이터 예시

발송대상 등록 시 `data` 필드에 JSON 문자열로 추가 정보를 저장할 수 있습니다.

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

---

## 에러 코드

> 에러 코드 전체 목록은 [common.md](common.md#에러-코드)를 참조하세요.