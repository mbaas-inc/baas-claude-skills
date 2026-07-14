# BaaS Survey API 스펙 — 설문조사

프로젝트 관리자가 생성한 설문을 **공개 조회하고 응답**할 수 있는 API입니다.
설문 목록/상세는 인증 없이 접근 가능하고, 응답 제출은 선택적 인증을 지원합니다.

> **구현 전 확인**: 이 기능은 관리자가 BaaS 콘솔에서 설문을 사전에 생성·활성화한 경우에만 의미가 있습니다. 활성 설문이 없으면 구현하지 마세요.

---

## 1. 활성 설문 목록 조회

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/survey/{project_id}/surveys` |
| 인증 | 불필요 |
| 반환 | ACTIVE 상태 설문만 반환 |

### 요청
```typescript
interface SurveyListParams {
  project_id: string;  // URL path — getProjectId()로 주입
  page?: number;       // 기본값 1
  size?: number;       // 기본값 20, 최대 100
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    items: Array<{
      id: string,                // 설문 UUID
      title: string,             // 설문 제목
      status: "ACTIVE",          // 이 API는 ACTIVE만 반환
      is_login_required: boolean, // true면 응답 제출 시 로그인 필요
      response_count: number,    // 현재 응답 수
      template_theme: string,    // "BASIC" | "MODERN" | "ELEGANT"
      share_code: string | null, // 공유 코드 (식별자)
      form_url: string | null,   // 참여 URL — share_code 있으면 "/aiapp-baas/survey/{share_code}" 형식, 없으면 null
      created_at: string         // ISO 8601
    }>,
    total: number,
    page: number,
    size: number
  }
}
```

> **참여 URL**: 응답의 `form_url` 필드를 그대로 사용하세요 — server가 `/aiapp-baas/survey/{share_code}` 상대 경로를 채워줍니다. 클라이언트가 호출한 도메인이 자동 prefix되므로 어떤 도메인에서든 정상 작동합니다. `form_url`이 null인 경우는 share_code가 발급되지 않은 설문이라 참여 불가.
> `is_login_required: true`이면 "로그인 필요" 배지를 표시하고, 비로그인 사용자가 참여 버튼 클릭 시 로그인 페이지로 안내하세요.

### 응답 예시
```json
{
  "result": "SUCCESS",
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "2024 서비스 만족도 조사",
        "status": "ACTIVE",
        "is_login_required": false,
        "response_count": 127,
        "template_theme": "MODERN",
        "share_code": "abc123xy",
        "form_url": "/aiapp-baas/survey/abc123xy",
        "created_at": "2024-01-15T09:00:00"
      }
    ],
    "total": 3,
    "page": 1,
    "size": 20
  }
}
```

---

## 2. 설문 상세 조회 (질문 포함)

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/survey/{project_id}/surveys/{survey_id}` |
| 인증 | 선택적 (로그인 시 `respondent_name`, `has_responded` 제공) |

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    title: string,
    description: string | null,
    status: string,            // "ACTIVE" | "CLOSED" | "DRAFT"
    is_login_required: boolean,
    max_responses: number,     // 0 = 무제한
    response_count: number,
    template_theme: string,
    share_code: string | null,
    form_url: string | null,         // "/aiapp-baas/survey/{share_code}" 형식 (share_code 없으면 null)
    respondent_name: string | null,  // 로그인 상태일 때 자동 주입
    has_responded: boolean,          // 이미 응답했는지 여부
    questions: Array<{
      id: string,
      question_type: string,   // 아래 질문 유형 표 참조
      title: string,           // 질문 텍스트
      description: string | null,
      is_required: boolean,
      sort_order: number,
      options: Array<{         // SINGLE_CHOICE, MULTIPLE_CHOICE, DROPDOWN 전용
        label: string,
        value: string
      }> | null,
      settings: {              // RATING 전용
        max_rating: number,    // 기본값 5
        min_label: string | null,
        max_label: string | null
      } | null
    }>,
    created_at: string,
    updated_at: string | null
  }
}
```

### 질문 유형

| question_type | 설명 | 입력 방식 |
|---------------|------|----------|
| `SHORT_TEXT` | 단답형 | `answer_text` (짧은 텍스트) |
| `LONG_TEXT` | 장문형 | `answer_text` (긴 텍스트, textarea) |
| `SINGLE_CHOICE` | 단일 선택 | `answer_choice: [value]` (라디오 버튼) |
| `MULTIPLE_CHOICE` | 복수 선택 | `answer_choice: [v1, v2, ...]` (체크박스) |
| `DROPDOWN` | 드롭다운 선택 | `answer_choice: [value]` |
| `RATING` | 평점 (기본 1~5) | `answer_rating: number` |

---

## 3. 설문 응답 제출

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /public/survey/{project_id}/surveys/{survey_id}/responses` |
| 인증 | 선택적 (비로그인 시 IP hash로 중복 방지) |
| Content-Type | `application/json` |

### 요청
```typescript
interface ResponseSubmitRequest {
  answers: Array<{
    question_id: string;           // 질문 UUID
    answer_text?: string;          // SHORT_TEXT, LONG_TEXT
    answer_choice?: string[];      // SINGLE_CHOICE, MULTIPLE_CHOICE, DROPDOWN
    answer_rating?: number;        // RATING (1~max_rating)
  }>;
}
```

> `is_required: true`인 질문은 반드시 답변을 포함해야 합니다.
> 이미 응답한 경우(`has_responded: true`) 중복 제출 시 에러가 반환됩니다.

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,           // 응답 UUID
    survey_id: string,
    submitted_at: string,
    answers: Array<{
      question_id: string,
      answer_text: string | null,
      answer_choice: string[] | null,
      answer_rating: number | null
    }>
  },
  message: "응답이 제출되었습니다."
}
```

---

## 구현 패턴

### 설문 목록 → 참여 흐름
```typescript
// 1. 목록 조회
const { data } = await fetch(`/public/survey/${projectId}/surveys`).then(r => r.json());
const surveys = data.items;

// 2. 참여 URL — server가 채운 form_url 그대로 사용
//    server-side 형식: "/aiapp-baas/survey/{share_code}" 상대 경로
//    브라우저가 호출 도메인을 자동 prefix → 어떤 도메인에서든 same-origin으로 작동
const participateUrl = survey.form_url;

// 3. is_login_required 처리
//    isLoggedIn 출처: useAuth() (react/AuthProvider.tsx) — 화면에서 /account/info를 직접 호출하지 말 것
if (survey.is_login_required && !isLoggedIn) {
  // 로그인 페이지로 안내
}
```

### 설문 폼 렌더링 패턴
```typescript
// 1. 상세 조회 (questions 포함)
const survey = await getSurveyDetail(projectId, surveyId);

// 2. has_responded 체크
if (survey.has_responded) return <AlreadySubmittedView />;

// 3. 질문 유형별 인풋 렌더링
survey.questions.map(q => {
  switch (q.question_type) {
    case 'SINGLE_CHOICE':  return <RadioGroup options={q.options} />;
    case 'MULTIPLE_CHOICE': return <CheckboxGroup options={q.options} />;
    case 'RATING':         return <StarRating max={q.settings?.max_rating ?? 5} />;
    case 'SHORT_TEXT':     return <input type="text" />;
    case 'LONG_TEXT':      return <textarea />;
    case 'DROPDOWN':       return <select>{q.options?.map(o => <option value={o.value}>{o.label}</option>)}</select>;
  }
});
```
