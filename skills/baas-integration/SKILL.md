---
name: baas-integration
description: "(BaaS API) 회원 인증 + 발송대상 + 게시판 + 설문조사 목록 통합. static: 회원가입/로그인/로그아웃(번들), 계정정보, 연락처 등록, 공지사항/FAQ 조회, 설문조사 목록. dynamic(board_id 필요): 동적 게시판(FREE/REVIEW/URL_LINK) — 게시글 CRUD/댓글/파일/신고 번들. Use when: 로그인/회원가입 구현, 인증 시스템, 연락처 등록 폼, 예약 접수, 문의 등록, 뉴스레터 구독, 공지사항 페이지, FAQ 페이지, 자유게시판, 리뷰 게시판, 링크 목록(URL_LINK), 커뮤니티, 설문조사 목록 페이지"
---

# BaaS API 통합 스킬

프로젝트 회원 인증, 발송대상, 게시판, 설문조사 API를 React Hooks 또는 Vanilla TS/JS로 제공합니다.

---

## 사용 방법

1. **`features.json`을 먼저 읽어 필요한 기능을 파악하세요.**  
   최상위에 `static`(project_id만으로 동작)과 `dynamic`(board_id 필요) 두 섹션으로 분리되어 있습니다.

2. 필요한 기능의 `ref` 파일만 읽어 상세 API 스펙을 확인하세요.  
   공통 설정(Base URL, 인증, 에러코드)이 필요하면 `references/common.md`를 읽으세요.

3. `template` 필드에 명시된 훅 파일을 `templates/react/`에서 가져다 사용하세요.  
   훅은 **API 호출 + 상태관리**만 제공합니다. UI는 직접 작성하세요.

---

## 필수 설정

| 항목 | 값 |
|------|-----|
| BASE_URL | `/aiapp-baas` |
| 인증 | `credentials: 'include'` (모든 fetch 필수) |
| 환경변수 | `REACT_APP_BAAS_PROJECT_ID` / `NEXT_PUBLIC_BAAS_PROJECT_ID` / `VITE_BAAS_PROJECT_ID` |

---

## 템플릿 구조

```
templates/
├── baas.ts / baas.js          # Vanilla TS/JS (API_BASE_URL = '/aiapp-baas')
└── react/
    ├── config.ts              # BASE_URL, getProjectId
    ├── types.ts               # 중앙 집중식 타입 정의
    ├── utils.ts               # validatePhone, formatPhone
    ├── useLogin.tsx
    ├── useSignup.tsx
    ├── useLogout.tsx
    ├── useAccountInfo.tsx
    ├── useRecipient.tsx
    ├── useNotice.tsx
    ├── useFaq.tsx
    ├── useBoard.tsx           # FREE/REVIEW/URL_LINK CRUD + 파일 업로드 + 신고
    ├── useComments.tsx
    ├── useSurvey.tsx          # useSurveyList (목록 표시용)
    └── index.tsx              # 통합 export
```
