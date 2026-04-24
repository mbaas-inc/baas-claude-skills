# BaaS Board API 스펙 — 기본 게시판 (NOTICE / FAQ)

관리자가 작성하는 **읽기 전용** 게시판입니다. 일반 사용자는 작성·수정·삭제할 수 없습니다.
동적 게시판(FREE / REVIEW / URL_LINK)은 [dynamic-board.md](dynamic-board.md)를 참조하세요.

---

## 1. 게시글 목록 조회 (통합 엔드포인트)

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/boards/{project_id}/{board_identifier}/posts` |
| 인증 | 불필요 |

`{board_identifier}` 값:
- `NOTICE` → 공지사항
- `FAQ` → 자주 묻는 질문

### 요청
```typescript
interface BoardListParams {
  project_id: string;       // URL path — 환경변수 getProjectId()로 주입
  board_identifier: string; // URL path — "NOTICE" | "FAQ" | "{board_uuid}"
  offset?: number;          // 기본값 0
  limit?: number;           // 기본값 20, 최대 100
  keyword?: string;         // 검색어 (제목/내용)
  category?: string;        // 카테고리 필터 (board_settings.categories 목록 중 하나)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    items: Array<{
      id: string,                   // 게시글 UUID
      title: string,                // 제목 (FAQ는 질문)
      content?: string | null,      // FAQ 목록에서만 답변 미리보기 포함
      views: number,                // 조회수
      author_name: string,
      is_hidden: boolean,
      created_at: string,           // ISO 8601
      categories: string[] | null,  // 선택된 카테고리 목록
      link_url: null                // NOTICE/FAQ는 항상 null
    }>,
    total_count: number,
    offset: number,
    limit: number,
    board_settings: {               // 게시판 설정 — UI 조건부 렌더링에 사용
      allow_comment: boolean,
      is_board_enabled: boolean,
      allow_attachment: boolean,
      require_login: boolean,
      categories: string[] | null,  // 허용 카테고리 목록 (null이면 카테고리 없음)
      board_type: string            // "NOTICE" | "FAQ"
    } | null
  },
  message: string
}
```

> **카테고리 필터 UI**: `board_settings.categories`가 null이 아닌 경우 목록 위에 카테고리 탭/칩 필터를 표시하세요. 선택한 값을 `?category=` 쿼리로 전달합니다.

### 응답 예시 (공지사항)
```json
{
  "result": "SUCCESS",
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "시스템 점검 안내",
        "content": null,
        "views": 150,
        "author_name": "관리자",
        "is_hidden": false,
        "created_at": "2024-01-15T09:00:00",
        "categories": ["공지"],
        "link_url": null
      }
    ],
    "total_count": 25,
    "offset": 0,
    "limit": 20,
    "board_settings": {
      "allow_comment": false,
      "is_board_enabled": true,
      "allow_attachment": false,
      "require_login": false,
      "categories": ["공지", "이벤트", "서비스"],
      "board_type": "NOTICE"
    }
  }
}
```

---

## 2. 게시글 상세 조회

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/boards/posts/{post_id}` |
| 인증 | 불필요 (require_login 설정 시 선택적 인증) |
| 부수효과 | `views` 자동 증가 |

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    board_id: string,
    title: string,
    content: string,              // HTML 문자열 (FAQ는 답변)
    views: number,
    author_id: string,
    author_name: string,
    created_at: string,
    updated_at: string | null,
    attachments: Array<{
      id: number,
      file_name: string,
      url: string
    }>,
    board_settings: {
      allow_comment: boolean,
      is_board_enabled: boolean,
      allow_attachment: boolean,
      require_login: boolean,
      categories: string[] | null,
      board_type: string
    } | null,
    categories: string[] | null,  // 이 게시글에 선택된 카테고리
    link_url: null                // NOTICE/FAQ는 항상 null
  }
}
```

> **FAQ 패턴**: `title`=질문, `content`=답변. Accordion UI 구현 시 목록의 `content`(답변 미리보기) 또는 상세 API의 `content`를 사용하세요.
> **content 렌더링**: `content`는 HTML 문자열입니다. 반드시 `dangerouslySetInnerHTML` 또는 sanitize 처리 후 렌더링하세요.

