# BaaS 동적 게시판 API 스펙

동적 게시판(FREE/REVIEW)의 게시글 CRUD, 댓글, 파일 업로드, 신고 API 스펙입니다.

## 목차

1. [게시판 정보 JSON](#게시판-정보-json)
2. [게시글 목록 조회 API](#1-게시글-목록-조회-api)
3. [게시글 작성 API](#2-게시글-작성-api)
4. [게시글 상세 조회 API](#3-게시글-상세-조회-api)
5. [게시글 수정 API](#4-게시글-수정-api)
6. [게시글 삭제 API](#5-게시글-삭제-api)
7. [게시글 숨김 토글 API](#6-게시글-숨김-토글-api)
8. [댓글 목록 조회 API](#7-댓글-목록-조회-api)
9. [댓글 작성 API](#8-댓글-작성-api)
10. [댓글 수정 API](#9-댓글-수정-api)
11. [댓글 삭제 API](#10-댓글-삭제-api)
12. [댓글 숨김 토글 API](#11-댓글-숨김-토글-api)
13. [파일 업로드 API](#12-파일-업로드-api)
14. [게시글 신고 API](#13-게시글-신고-api)
15. [댓글 신고 API](#14-댓글-신고-api)
16. [보충 설명](#보충-설명)

---

## 게시판 정보 JSON

관리자가 게시판을 생성·설정 완료 후 전달하는 JSON 구조입니다. API 호출에 필요한 필드만 기술합니다.

```json
{
  "id": "board-uuid",              // board_id — API path에 사용
  "project_id": "project-uuid",   // 환경변수의 project_id와 동일
  "name": "자유게시판",
  "description": "자유롭게 소통하는 공간입니다.",
  "board_type": "FREE",           // FREE | REVIEW
  "is_board_enabled": true,       // false면 모든 쓰기 API 403
  "is_comment_enabled": true,     // false면 댓글 API 사용 불가
  "allow_attachment": true         // false면 file_ids 포함 시 400
}
```

> **board_id**: `id` 필드의 값을 목록 조회 API의 `{board_id}` path에 사용합니다.
> **board_type**: 게시글 작성 API의 `?type=` 쿼리 파라미터에 사용합니다.

---

## 1. 게시글 목록 조회 API

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/board/{project_id}/{board_id}/posts` |
| 인증 | 불필요 (공개 API) |
| Content-Type | `application/json` |

### 요청
```typescript
interface BoardPostListParams {
  project_id: string;    // URL path (필수) - 환경변수에서 getProjectId()로 자동 주입
  board_id: string;      // URL path (필수) - 게시판 정보 JSON의 id
  offset?: number;       // 시작 위치 (기본값: 0)
  limit?: number;        // 조회 개수 (기본값: 20, 최대: 100)
  keyword?: string;      // 검색어 (제목/내용)
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
      content?: string,     // 내용 미리보기 (옵션)
      views: number,        // 조회수
      author_name: string,  // 작성자 이름
      is_hidden: boolean,   // 숨김 여부
      created_at: string    // 생성일시 (ISO 8601)
    }>,
    total_count: number,    // 전체 개수
    offset: number,         // 시작 위치
    limit: number           // 조회 개수
  },
  message: "게시글 목록 조회"
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
        "title": "첫 번째 게시글입니다",
        "views": 42,
        "author_name": "홍길동",
        "is_hidden": false,
        "created_at": "2026-03-10T09:00:00Z"
      }
    ],
    "total_count": 1,
    "offset": 0,
    "limit": 20
  },
  "message": "게시글 목록 조회"
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "BAD_REQUEST",
  "message": "잘못된 게시판 식별자입니다."
}
```

---

## 2. 게시글 작성 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /boards/{project_id}/posts?type={board_type}` |
| 인증 | 필수 (로그인 + 프로젝트 소속) |
| Content-Type | `application/json` |

### 요청
```typescript
interface BoardPostCreateRequest {
  title: string;           // 제목 (최대 256자)
  content: string;         // 내용 (Base64 이미지 포함, 최대 16MB)
  file_ids?: number[];     // 첨부파일 ID 목록 (uploadFiles 후 획득)
  is_hidden?: boolean;     // 숨김 여부 (기본값: false)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    board_id: string,
    title: string,
    content: string,
    views: number,
    author_id: string,
    author_name: string,
    created_at: string,
    updated_at: string | null,
    attachments: Array<{ id: number, file_name: string, url: string }>
  },
  message: "게시글이 작성되었습니다."
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "FORBIDDEN",
  "message": "비활성화된 게시판입니다."
}
```

---

## 3. 게시글 상세 조회 API

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /boards/posts/{post_id}` |
| 인증 | 선택적 (숨김 게시글은 작성자/소유자만) |
| Content-Type | `application/json` |

### 요청
```typescript
interface BoardPostDetailParams {
  post_id: string;  // URL path (필수) - 게시글 UUID
}
```

### 응답
```typescript
// 조회 시 조회수(views) 자동 증가
{
  result: "SUCCESS",
  data: {
    id: string,
    board_id: string,
    title: string,
    content: string,               // HTML 내용
    views: number,
    author_id: string,
    author_name: string,
    created_at: string,
    updated_at: string | null,
    attachments: Array<{
      id: number,
      file_name: string,
      url: string
    }>
  },
  message: "게시글 상세 조회"
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "FORBIDDEN",
  "message": "숨김 처리된 게시글입니다."
}
```

---

## 4. 게시글 수정 API

| 항목 | 값 |
|------|-----|
| Endpoint | `PUT /boards/posts/{post_id}` |
| 인증 | 필수 (작성자 본인만) |
| Content-Type | `application/json` |

### 요청
```typescript
interface BoardPostUpdateRequest {
  title?: string;          // 수정할 제목
  content?: string;        // 수정할 내용
  file_ids?: number[];     // 첨부파일 교체 (기존 목록 전체 교체)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: { /* BoardPostDetail 동일 구조 */ },
  message: "게시글이 수정되었습니다."
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "FORBIDDEN",
  "message": "작성자 본인만 수정할 수 있습니다."
}
```

---

## 5. 게시글 삭제 API

| 항목 | 값 |
|------|-----|
| Endpoint | `DELETE /boards/posts/{post_id}` |
| 인증 | 필수 (작성자 또는 프로젝트 소유자) |

### 응답
```typescript
{
  result: "SUCCESS",
  data: true,
  message: "게시글이 삭제되었습니다."
}
```

---

## 6. 게시글 숨김 토글 API

| 항목 | 값 |
|------|-----|
| Endpoint | `PATCH /boards/posts/{post_id}/hidden` |
| 인증 | 필수 (작성자 또는 프로젝트 소유자) |
| Content-Type | `application/json` |

### 요청
```typescript
interface PostHiddenUpdate {
  is_hidden: boolean;  // true=숨김, false=해제
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: { /* BoardPostDetail 동일 구조 */ },
  message: "게시글이 숨김 처리되었습니다." // 또는 "게시글 숨김이 해제되었습니다."
}
```

---

## 7. 댓글 목록 조회 API

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /boards/posts/{post_id}/comments` |
| 인증 | 불필요 |
| Content-Type | `application/json` |

### 요청
```typescript
interface CommentListParams {
  post_id: string;           // URL path (필수) - 게시글 UUID
  sort?: 'oldest' | 'newest'; // 정렬 (기본: oldest)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    items: Array<{
      id: string,
      post_id: string,
      author_id: string,
      author_name: string,
      content: string,
      is_hidden: boolean,
      created_at: string,
      updated_at: string | null,
      replies: Array<{            // 대댓글 목록 (1레벨)
        id: string,
        post_id: string,
        author_id: string,
        author_name: string,
        parent_id: string,
        content: string,
        is_hidden: boolean,
        created_at: string,
        updated_at: string | null
      }>
    }>,
    total_count: number           // 전체 댓글 수 (대댓글 포함)
  },
  message: "댓글 목록 조회"
}
```

---

## 8. 댓글 작성 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /boards/posts/{post_id}/comments` |
| 인증 | 필수 (로그인 + 프로젝트 소속) |
| Content-Type | `application/json` |

### 요청
```typescript
interface CommentCreateRequest {
  content: string;        // 댓글 내용 (1~1000자)
  parent_id?: string;     // 부모 댓글 ID (대댓글인 경우, 1레벨만)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    post_id: string,
    author_id: string,
    author_name: string,
    parent_id: string | null,
    content: string,
    is_hidden: boolean,
    created_at: string,
    updated_at: string | null
  },
  message: "댓글이 작성되었습니다."
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "BAD_REQUEST",
  "message": "대댓글에는 답글을 달 수 없습니다."
}
```

---

## 9. 댓글 수정 API

| 항목 | 값 |
|------|-----|
| Endpoint | `PUT /boards/posts/{post_id}/comments/{comment_id}` |
| 인증 | 필수 (작성자 본인만) |
| Content-Type | `application/json` |

### 요청
```typescript
interface CommentUpdateRequest {
  content: string;  // 수정할 내용 (1~1000자)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: { /* CommentResponse 동일 구조 */ },
  message: "댓글이 수정되었습니다."
}
```

---

## 10. 댓글 삭제 API

| 항목 | 값 |
|------|-----|
| Endpoint | `DELETE /boards/posts/{post_id}/comments/{comment_id}` |
| 인증 | 필수 (작성자 또는 프로젝트 소유자) |

### 응답
```typescript
{
  result: "SUCCESS",
  data: true,
  message: "댓글이 삭제되었습니다."
}
```

---

## 11. 댓글 숨김 토글 API

| 항목 | 값 |
|------|-----|
| Endpoint | `PATCH /boards/comments/{comment_id}/hidden` |
| 인증 | 필수 (작성자 또는 프로젝트 소유자) |
| Content-Type | `application/json` |

### 요청
```typescript
interface CommentHiddenUpdate {
  is_hidden: boolean;  // true=숨김, false=해제
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: { /* CommentResponse 동일 구조 */ },
  message: "댓글이 숨김 처리되었습니다."
}
```

---

## 12. 파일 업로드 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /boards/files?project_id={project_id}` |
| 인증 | 필수 (로그인 + 프로젝트 소속) |
| Content-Type | `multipart/form-data` |

### 요청
```typescript
// FormData로 전송
// files: File[] — 업로드할 파일 (다중)
// project_id: string — 쿼리 파라미터

// 제한사항:
// - 파일당 최대 10MB
// - 실행 파일 차단: .exe, .bat, .cmd, .sh, .ps1, .vbs, .js, .jar 등
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    files: Array<{
      id: number,         // 파일 ID (게시글 생성 시 file_ids로 사용)
      file_name: string,  // 원본 파일명
      url: string         // 다운로드 URL
    }>
  },
  message: "2개 파일이 업로드되었습니다."
}
```

---

## 13. 게시글 신고 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /boards/posts/{post_id}/report` |
| 인증 | 필수 (로그인 + 프로젝트 소속) |
| Content-Type | `application/json` |

### 요청
```typescript
interface ReportCreateRequest {
  reason: 'SPAM' | 'ABUSE' | 'HARASSMENT' | 'INAPPROPRIATE' | 'OTHER';
  description?: string;   // OTHER 선택 시 상세 사유 (최대 1000자)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    project_id: string,
    target_type: "POST",
    target_id: string,
    reporter_id: string,
    reason: string,
    description: string | null,
    status: "PENDING",
    created_at: string
  },
  message: "신고가 접수되었습니다."
}
```

### 에러 응답 예시
```json
{
  "result": "FAIL",
  "errorCode": "CONFLICT",
  "message": "이미 신고한 대상입니다."
}
```

---

## 14. 댓글 신고 API

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /boards/comments/{comment_id}/report` |
| 인증 | 필수 (로그인 + 프로젝트 소속) |
| Content-Type | `application/json` |

### 요청
```typescript
// ReportCreateRequest와 동일
interface ReportCreateRequest {
  reason: 'SPAM' | 'ABUSE' | 'HARASSMENT' | 'INAPPROPRIATE' | 'OTHER';
  description?: string;
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    project_id: string,
    target_type: "COMMENT",
    target_id: string,
    reporter_id: string,
    reason: string,
    description: string | null,
    status: "PENDING",
    created_at: string
  },
  message: "신고가 접수되었습니다."
}
```

---

## 보충 설명

### 파일 업로드 플로우

파일 첨부가 있는 게시글은 2단계로 생성합니다:

1. `POST /boards/files` — 파일 업로드 → file_ids 획득
2. `POST /boards/{project_id}/posts?type=FREE` — body에 `file_ids` 포함하여 게시글 생성

```typescript
// 예시
const uploaded = await uploadBoardFiles([file1, file2]);
const fileIds = uploaded.files.map(f => f.id);
const post = await createBoardPost('FREE', {
  title: '사진 공유',
  content: '여행 사진입니다.',
  file_ids: fileIds
});
```

### 댓글 계층 구조

- **1레벨만 지원**: `parent_id`가 있으면 대댓글, 없으면 루트 댓글
- 대댓글의 대댓글은 불가 (`400 BAD_REQUEST`)
- 응답의 `CommentWithReplies` 구조: 루트 댓글 + `replies[]` 배열

### 신고 사유 Enum

| 값 | 의미 |
|---|------|
| `SPAM` | 스팸/광고 |
| `ABUSE` | 욕설/비방 |
| `HARASSMENT` | 괴롭힘 |
| `INAPPROPRIATE` | 부적절한 콘텐츠 |
| `OTHER` | 기타 (description 필수) |

### 권한 규칙

| 게시판 타입 | 작성 | 수정 | 삭제 | 숨김 |
|------------|------|------|------|------|
| NOTICE/FAQ | 프로젝트 소유자만 | 프로젝트 소유자만 | 프로젝트 소유자만 | 프로젝트 소유자만 |
| FREE/REVIEW | 프로젝트 소속 회원 | 작성자 본인만 | 작성자 또는 소유자 | 작성자 또는 소유자 |

### 숨김 처리

- `is_hidden=true` 게시글은 목록에 표시되나 내용이 가려짐
- 숨김 게시글 상세 조회: 작성자 또는 프로젝트 소유자만 가능
- 삭제와 별개 기능 (soft delete 아님)

---

## 에러 코드

공통 에러 코드는 [common.md](common.md)를 참조하세요.

| 에러 코드 | HTTP | 설명 |
|----------|------|------|
| `BAD_REQUEST` | 400 | 잘못된 요청 (파일 허용 안 됨, 대댓글 깊이 초과 등) |
| `UNAUTHORIZED` | 401 | 인증 필요 (로그인 안 됨) |
| `FORBIDDEN` | 403 | 권한 없음 (비활성화 게시판, 소속 아님, 작성자 아님) |
| `NOT_FOUND` | 404 | 게시판/게시글/댓글을 찾을 수 없음 |
| `CONFLICT` | 409 | 중복 신고 |
