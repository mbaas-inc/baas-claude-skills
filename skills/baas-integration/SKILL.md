---
name: baas-integration
description: "(BaaS API) 회원 인증 + 발송대상 + 게시판 + 설문조사 목록 + 예약 + 스토어 통합. static: 회원가입/로그인/로그아웃/계정정보(번들), 연락처 등록, 공지사항(번들)/FAQ(번들) 조회, 설문조사 목록, 예약(슬롯 캘린더/예약 신청/내 예약/유료 예약 토스 결제), 스토어(디지털 상품 구매/토스 결제/내 주문/구매확정 — 번들). dynamic(board_id 필요): 동적 게시판(FREE/REVIEW/URL_LINK) — 게시글 CRUD/댓글/파일/신고(번들). Use when: 로그인/회원가입 구현, 인증 시스템, 연락처 등록 폼, 예약 접수, 문의 등록, 뉴스레터 구독, 공지사항 페이지, FAQ 페이지, 자유게시판, 리뷰 게시판, 링크 목록(URL_LINK), 커뮤니티, 설문조사 목록 페이지, 슬롯/캘린더 기반 예약(네이버 예약식), 예약 내역 관리, 상품 판매 페이지, 결제 기능, 기프트카드/상품권 구매, 주문 내역 관리"
---

# BaaS API 통합 스킬

프로젝트 회원 인증, 발송대상, 게시판, 설문조사 API를 React Hooks 또는 Vanilla TS/JS로 제공합니다.

---

## 사용 방법

1. **`features.json`을 먼저 읽어 필요한 기능을 파악하세요.**  
   최상위에 `static`(project_id만으로 동작)과 `dynamic`(board_id 필요) 두 섹션으로 분리되어 있습니다.  
   각 feature의 `id`는 메타데이터 식별자입니다 (실제 매칭은 `keywords`, 코드 생성은 `ref`/`sections`/`template`로 진행).

2. 필요한 기능의 `ref` 파일만 읽어 상세 API 스펙을 확인하세요.  
   공통 설정(Base URL, 인증, 에러코드)이 필요하면 `references/common.md`를 읽으세요.

3. `template` 필드에 명시된 훅 파일을 `templates/react/`에서 가져다 사용하세요.  
   배열이면 모든 파일을 복사, 문자열이면 단일 파일만 복사. 훅은 **API 호출 + 상태관리**만 제공합니다. UI는 직접 작성하세요.
   - **React/Next/Vite 프로젝트**: `templates/react/` 훅 사용
   - **순수 TS/JS 프로젝트**: `templates/baas.ts` 또는 `baas.js` 사용

---

## 필수 설정

| 항목 | 값 |
|------|-----|
| BASE_URL | `/aiapp-baas` |
| 인증 | `credentials: 'include'` (모든 fetch 필수) |
| 환경변수 | `REACT_APP_BAAS_PROJECT_ID` / `NEXT_PUBLIC_BAAS_PROJECT_ID` / `VITE_BAAS_PROJECT_ID` |

---

## auth 필드 값

| 값 | 의미 |
|----|------|
| `false` | 인증 불필요 |
| `true` | 항상 인증 필요 |
| `"settings"` | `board_settings.require_login`으로 런타임 결정 (읽기 전용) |
| `"mixed"` | 읽기는 settings 결정, 쓰기는 항상 인증 필요 |

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
    ├── useReservation.tsx     # 예약: 대상/슬롯/캘린더 조회 + 예약 생성/내역/수정/취소
    ├── useStore.tsx           # 스토어: 상품/약관 조회 + 토스 결제창 체크아웃 + 내 주문/구매확정/취소
    └── index.tsx              # 통합 export
```
