# BaaS Board API 스펙

## 목차

1. [공지사항 목록 조회 API](#1-공지사항-목록-조회-api)
2. [공지사항 상세 조회 API](#2-공지사항-상세-조회-api)
3. [FAQ 목록 조회 API](#3-faq-목록-조회-api)

---

## 1. 공지사항 목록 조회 API

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/board/notice/{project_id}/posts` |
| 인증 | 불필요 (공개 API) |
| Content-Type | `application/json` |

### 요청
```typescript
interface NoticeListParams {
  project_id: string;  // URL path (필수) - 환경변수에서 getProjectId()로 자동 주입
  offset?: number;     // 시작 위치 (기본값: 0)
  limit?: number;      // 조회 개수 (기본값: 20, 최대: 100)
  keyword?: string;    // 검색어 (제목/내용)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    items: Array<{
      id: string,           // 게시글 UUID
      title: string,        // 제목
      views: number,        // 조회수
      recommends: number,   // 추천수
      author_name: string,  // 작성자 이름
      is_hidden: boolean,   // 숨김 여부
      created_at: string    // 생성일시 (ISO 8601)
    }>,
    total_count: number,    // 전체 개수
    offset: number,         // 시작 위치
    limit: number           // 조회 개수
  },
  message: "공지사항 목록 조회"
}
```

### 응답 JSON 예시
```json
{
  "result": "SUCCESS",
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "시스템 점검 안내",
        "views": 150,
        "recommends": 5,
        "author_name": "관리자",
        "is_hidden": false,
        "created_at": "2024-01-15T09:00:00Z"
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "title": "서비스 이용약관 변경 안내",
        "views": 89,
        "recommends": 2,
        "author_name": "관리자",
        "is_hidden": false,
        "created_at": "2024-01-10T14:30:00Z"
      }
    ],
    "total_count": 25,
    "offset": 0,
    "limit": 20
  },
  "message": "공지사항 목록 조회"
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "NOT_FOUND",
  "message": "NOTICE 게시판을 찾을 수 없습니다."
}
```

---

## 2. 공지사항 상세 조회 API

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/board/notice/{project_id}/posts/{post_id}` |
| 인증 | 불필요 (공개 API) |
| Content-Type | `application/json` |

### 요청
```typescript
interface NoticeDetailParams {
  project_id: string;  // URL path (필수) - 환경변수에서 getProjectId()로 자동 주입
  post_id: string;     // URL path (필수) - 게시글 UUID
}
```

### 응답
```typescript
// 조회 시 조회수(views) 자동 증가
{
  result: "SUCCESS",
  data: {
    id: string,                    // 게시글 UUID
    board_id: string,              // 게시판 UUID
    title: string,                 // 제목
    content: string,               // 내용
    views: number,                 // 조회수
    recommends: number,            // 추천수
    author_id: string,             // 작성자 UUID
    author_name: string,           // 작성자 이름
    created_at: string,            // 생성일시 (ISO 8601)
    updated_at: string | null,     // 수정일시 (ISO 8601)
    attachments: Array<{
      id: number,
      file_name: string,
      url: string
    }>
  },
  message: "공지사항 상세 조회"
}
```

### 응답 JSON 예시
```json
{
  "result": "SUCCESS",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "board_id": "660e8400-e29b-41d4-a716-446655440000",
    "title": "시스템 점검 안내",
    "content": "<p>2024년 1월 20일 02:00 ~ 06:00 시스템 점검이 예정되어 있습니다.</p>",
    "views": 151,
    "recommends": 5,
    "author_id": "770e8400-e29b-41d4-a716-446655440000",
    "author_name": "관리자",
    "created_at": "2024-01-15T09:00:00Z",
    "updated_at": null,
    "attachments": []
  },
  "message": "공지사항 상세 조회"
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "NOT_FOUND",
  "message": "게시글을 찾을 수 없습니다."
}
```

---

## 3. FAQ 목록 조회 API

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/board/faq/{project_id}/posts` |
| 인증 | 불필요 (공개 API) |
| Content-Type | `application/json` |

### 요청
```typescript
interface FaqListParams {
  project_id: string;  // URL path (필수) - 환경변수에서 getProjectId()로 자동 주입
  offset?: number;     // 시작 위치 (기본값: 0)
  limit?: number;      // 조회 개수 (기본값: 20, 최대: 100)
  keyword?: string;    // 검색어 (제목/내용)
}
```

### 응답
```typescript
// FAQ는 title=질문, content=답변 구조
{
  result: "SUCCESS",
  data: {
    items: Array<{
      id: string,           // 게시글 UUID
      title: string,        // 질문
      views: number,        // 조회수
      recommends: number,   // 추천수
      author_name: string,  // 작성자 이름
      is_hidden: boolean,   // 숨김 여부
      created_at: string    // 생성일시 (ISO 8601)
    }>,
    total_count: number,
    offset: number,
    limit: number
  },
  message: "FAQ 목록 조회"
}
```

### 응답 JSON 예시
```json
{
  "result": "SUCCESS",
  "data": {
    "items": [
      {
        "id": "880e8400-e29b-41d4-a716-446655440000",
        "title": "배송은 얼마나 걸리나요?",
        "views": 230,
        "recommends": 12,
        "author_name": "관리자",
        "is_hidden": false,
        "created_at": "2024-01-05T10:00:00Z"
      },
      {
        "id": "880e8400-e29b-41d4-a716-446655440001",
        "title": "교환/환불은 어떻게 하나요?",
        "views": 185,
        "recommends": 8,
        "author_name": "관리자",
        "is_hidden": false,
        "created_at": "2024-01-03T14:00:00Z"
      }
    ],
    "total_count": 15,
    "offset": 0,
    "limit": 20
  },
  "message": "FAQ 목록 조회"
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "NOT_FOUND",
  "message": "FAQ 게시판을 찾을 수 없습니다."
}
```
