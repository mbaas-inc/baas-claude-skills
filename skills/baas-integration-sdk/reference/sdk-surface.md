# SDK 표면 레퍼런스 (`window.BaasSDK`)

모든 함수/훅은 CDN 로드된 `window.BaasSDK`에 있다. import 하지 말고 전역에서 쓴다.
transport·envelope·project_id 주입은 SDK 내부가 처리한다 — 아래 시그니처만 호출하면 된다.

성공/실패 규약: 함수는 성공 시 데이터를 resolve, 실패 시 `BaasError`(`.message` 한국어, `.errorCode`, `.status`)를 throw.
훅은 `{ loading, error }` 상태를 노출한다.

---

## 인증 (account)

### `AuthProvider` / `useAuth()` — 전역 인증 상태 (앱 루트 1회)
```tsx
// 앱 루트를 감싼다
<BaasSDK.AuthProvider><App /></BaasSDK.AuthProvider>

// 화면에서 읽기만
const { isLoggedIn, user, loading, error, refetch, clear } = BaasSDK.useAuth();
// user: { id, user_id, email, name, phone, is_profile_completed, status } | null
```
- 마운트 시 자동으로 인증 상태를 1회 조회한다. `loading` 동안 스켈레톤/스피너 표시.
- `isLoggedIn=false`는 정상(비로그인) — 에러 아님. `error`는 네트워크/서버 오류일 때만 채워진다.

### `RequireAuth` — 로그인 필수 화면 가드
```tsx
<BaasSDK.RequireAuth fallback={<LoginPrompt/>} loadingFallback={<Spinner/>}>
  <ProtectedContent/>
</BaasSDK.RequireAuth>
```

### `useLogin()` / `useSignup()` / `useLogout()`
```tsx
const { login, loading, error } = BaasSDK.useLogin();
await login(userId, userPw);      // 성공 시 전역 인증 상태 자동 갱신(refetch). boolean 반환

const { signup, loading, error } = BaasSDK.useSignup();
await signup(userId, userPw, name, phone);   // AccountInfo | null 반환

const { logout } = BaasSDK.useLogout();
await logout();                   // 성공 시 전역 상태 자동 clear
```

UX 규약:
- 로그인/회원가입 폼은 제출 중 버튼 비활성화(`loading`), 실패 시 `error.message`를 폼 하단에 노출.
- 로그인 성공 후 별도 refetch 불필요(훅이 처리). 화면 전환만 하면 `useAuth()`가 최신 상태.

---

## 게시판 (board)

board_id 는 **baas-cli로 미리 생성**해 코드에 상수로 주입한다(`baas board create --type FREE --name "..." --ensure --json` → `board.id`).

### `useBoard()`
```tsx
const { posts, post, loading, error, fetchPosts, fetchPost, submitPost, editPost, removePost } = BaasSDK.useBoard();

await fetchPosts(BOARD_ID, { limit: 20, offset: 0, keyword });  // posts = { items: [...], total }
await fetchPost(postId);                                        // post = { id, title, content, author_name, views, created_at }
await submitPost(BOARD_ID, { title, content });                 // 로그인 필수
await editPost(postId, { title, content });                     // 로그인 필수
await removePost(postId);                                       // 로그인 필수
```
- `posts.items`가 빈 배열이면 "아직 글이 없습니다" 빈 상태 UI를 보여준다.
- 목록/상세 읽기는 공개(비로그인 가능). 작성/수정/삭제는 로그인 필수 → 비로그인 시 로그인 유도.
- 글 작성 성공 후 `fetchPosts`로 목록을 새로고침한다.

---

### `useLogout()` 외 계정
```tsx
const { changePassword } = BaasSDK; // 함수(훅 아님): await changePassword(current, next)
```
SNS 계정은 비밀번호 변경 불가(서버가 에러 반환) — `error.message` 노출.

---

## 발송대상 (recipient)

문의/상담신청/뉴스레터 구독/예약 접수 등 "연락처를 남기는" 폼.
```tsx
const { register, loading, error } = BaasSDK.useRecipient();
await register({ name, phone, description?, metadata? });  // metadata 는 객체 → SDK가 직렬화
```
UX: 제출 성공 시 "접수되었습니다" 안내, 폼 초기화. 인증 불필요.

---

## 공지사항·FAQ (notice/faq)

정적 게시판(공개 읽기 전용, board_id 불필요 — 프로젝트에 1개씩 고정).
```tsx
const { posts, post, loading, error, fetchPosts, fetchPost } = BaasSDK.useNotice(); // FAQ는 useFaq()
await fetchPosts({ limit: 20, offset: 0, keyword });   // posts = { items, total }
await fetchPost(postId);
```

---

## 게시판 (board)

board_id 는 **baas-cli로 생성**해 코드 상수로 주입(`baas board create --type FREE|REVIEW --name "..." --ensure --json` → `board.id`).
```tsx
const { posts, post, loading, error, fetchPosts, fetchPost, submitPost, editPost, removePost } = BaasSDK.useBoard();
await fetchPosts(BOARD_ID, { limit: 20, offset: 0, keyword });  // posts = { items, total }
await fetchPost(postId);
await submitPost(BOARD_ID, { title, content });   // 로그인 필수
await editPost(postId, { title, content });       // 로그인 필수
await removePost(postId);                          // 로그인 필수
```
- 목록/상세 읽기는 공개, 작성/수정/삭제는 로그인 필수 → 비로그인 시 로그인 유도.
- `posts.items`가 비면 "아직 글이 없습니다" 빈 상태. 작성 성공 후 `fetchPosts` 재조회.

## 댓글 (comments)
```tsx
const { comments, loading, error, fetchComments, addComment, editComment, removeComment } = BaasSDK.useComments();
await fetchComments(postId, "latest");     // 공개 읽기
await addComment(postId, content);         // 로그인 필수
await editComment(postId, commentId, content);
await removeComment(postId, commentId);
```

---

## 설문조사 (survey)
```tsx
const { surveys, survey, loading, error, fetchSurveys, fetchSurvey, submitResponse } = BaasSDK.useSurvey();
await fetchSurveys({ status: "OPEN" });   // surveys = 배열
await fetchSurvey(surveyId);               // survey.form_url / share_code
await submitResponse(surveyId, answers);   // 공개 제출
```
목록에서 각 항목의 `form_url`(있으면)로 외부 참여 페이지 이동도 가능. 응답 제출은 인증 불필요.

---

## 예약 (reservation)

슬롯/캘린더 기반. 무료·현장 예약은 즉시 생성, 카드 예약은 prepare→토스위젯→confirm 3단계(토스 위젯 호출은 앱 UI가 `config`의 키로 수행).
```tsx
const r = BaasSDK.useReservation();
await r.fetchTargets();                          // 예약 대상 목록(공개)
await r.fetchTarget(targetId);                   // 운영설정·폼·결제정책
await r.fetchSlots(targetId, { date });          // 가용 슬롯(공개)
await r.book(targetId, { reserved_at, form_data, payment_method });  // 무료·현장, 로그인 필수
// 카드: const p = await r.prepare(targetId, { reserved_at, form_data }); → 토스 위젯 → r.confirm(targetId, { order_id, payment_key, amount, reserved_at, form_data })
await r.myBookings();                            // 내 예약(로그인)
await r.cancel(reservationId);
```
결제 복귀 라우트는 **평면 경로**(`/reservation-payment-success`)로 둘 것(SPA 자산 경로 안정).

---

## 스토어 (store)

디지털 상품 판매. **[필수] 통신판매중개 특성상 모든 페이지 푸터에 중개업자 고지·사업자정보를 고정 표기**한다.
```tsx
const s = BaasSDK.useStore();
await s.fetchConfig();                    // config.store_enabled 확인 후 진입, config.toss_client_key 로 결제
await s.fetchProducts({ category_id });   // products = 배열
await s.fetchProduct(productId);
// 결제: const p = await s.prepare(productId, qty); → 토스 위젯(config.toss_client_key) → s.confirm({ order_no, payment_key, amount, product_id, quantity })
await s.myOrders();                        // 내 주문(로그인)
await s.confirmPurchase(orderId);          // 구매확정
await s.cancel(orderId, reason);
```
- 진입 전 `config.store_enabled`가 false면 "준비 중" 안내.
- 결제 복귀 라우트도 평면 경로(`/checkout-success`, `/checkout-fail`).

---

## 에러코드 → UI 분기

`catch (e) { if (e instanceof BaasSDK.BaasError) ... }` 또는 훅의 `error`.

| errorCode | HTTP | 대응 UI |
|-----------|------|---------|
| `INVALID_USER` | 400 | 로그인 폼: "아이디 또는 비밀번호를 확인하세요" |
| `UNAUTHORIZED` | 401 | 보호 기능이면 로그인 페이지로. 단 `useAuth`의 비로그인 401은 정상(에러 처리 금지) |
| `TOKEN_EXPIRED`/`INVALID_TOKEN` | 401 | "세션이 만료되었습니다. 다시 로그인해주세요" |
| `ALREADY_EXISTS` | 409 | 회원가입: "이미 사용 중인 아이디입니다" |
| `VALIDATION_ERROR` | 400 | 필드별 에러 메시지 표시 |
| `NOT_FOUND` | 404 | "대상을 찾을 수 없습니다" |
| `INTERNAL_SERVER_ERROR` | 500 | "잠시 후 다시 시도해주세요" |
