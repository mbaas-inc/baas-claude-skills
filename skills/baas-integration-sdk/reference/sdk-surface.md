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
await fetchComments(postId, "latest");     // 공개 읽기 → comments = { items: [...], total } (board.posts 와 동일 형태, 배열 아님)
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
await s.fetchConfig();                    // config.store_enabled 확인 후 진입(false면 "준비 중")
await s.fetchProducts({ category_id });   // s.products = Product[] (SDK가 items/data/배열 정규화)
await s.fetchProduct(productId);

// 카드결제: SDK가 원스톱 처리 — 토스 SDK 로드·버전·키타입을 앱이 몰라도 된다.
await s.checkout(productId, qty, {
  successUrl: `${location.origin}/checkout-success?product_id=${productId}&quantity=${qty}`,
  failUrl: `${location.origin}/checkout-fail`,
  customerKey,           // 로그인 계정 식별자(user.id 등). 생략 시 토스 ANONYMOUS
  customerName, customerEmail,
});
// → 성공 시 successUrl 로 리다이렉트(토스가 paymentKey/orderId/amount 쿼리 부착).
//   복귀 페이지(/checkout-success)에서 confirm 으로 승인 완료:
await s.confirm({ order_no, payment_key, amount, product_id, quantity }); // orderId=order_no, paymentKey=payment_key

await s.myOrders();                        // 내 주문(로그인)
await s.confirmPurchase(orderId);          // 구매확정
await s.cancel(orderId, reason);
```
- **`checkout()`가 `getStoreConfig → prepare → 토스 결제창(v2 payment().requestPayment)`을 대신 수행**한다.
  앱은 토스 스크립트를 직접 로드하거나 `widgets()`/`payment()`를 고르지 않는다(그 선택이 키 타입과
  안 맞으면 "결제위젯 연동 키의 클라이언트 키로 SDK를 연동해주세요" 에러). `toss_client_key`(API 개별
  연동 키)로 SDK가 알아서 올바른 방식을 쓴다.
- 사용자가 결제창을 닫으면 `checkout()`이 `code === "USER_CANCEL"` 에러를 throw → 앱에서 무시 처리.
- 결제 복귀 라우트는 **평면 경로**(`/checkout-success`, `/checkout-fail`)로 둘 것(SPA 자산 경로 안정).
- 예약(`useReservation`) 카드결제도 동일 계약(prepare→토스→confirm) — 필요 시 같은 패턴 적용.

---

## 동적 컬렉션 (collection)

**사용자 정의 커스텀 데이터**(고정 기능이 커버 못 하는 것). 데이터 프리미티브만 제공 — **범용 자동
렌더 없음**. 앱은 요구에 맞춰 UI를 설계하고 이 훅으로 데이터만 연결한다.

**전제**: `collection name`·필드(스키마)·접근 정책은 **baas-cli로 먼저 생성**(`baas collection create --name inventory
--field item_name:string:req,idx … [--access-json '{"read":"public"}']` / `baas collection field add …`). 스키마·정책 변경은 CLI/에이전트 소유(콘솔·앱에서 변경 아님).
```tsx
const { records, record, loading, error,
        fetchRecords, fetchPublicRecords, fetchRecord, submitRecord, editRecord, removeRecord } = BaasSDK.useCollection();

// 회원(로그인) 경로 — 접근 정책(settings.access)은 서버가 강제
await fetchRecords("inventory", { limit: 20, offset: 0, sort: "-created_at",
                                  filter: { quantity: { lt: 5 }, category: { eq: "전자" } } });
// records = { items, total_count, offset, limit }; item = { id, collection, data:{...}, account_id, created_at }
// ⚠️ 렌더는 records 가 아니라 records.items 를 map 한다 (records 는 배열이 아니라 봉투):
//    (records?.items ?? []).map((r) => r.data.item_name)   // records.map(...) 는 TypeError
await fetchRecord("inventory", recordId);   // 인증 단건 — read:public이어도 로그인 필수(비로그인은 401→null)
await submitRecord("inventory", { item_name: "노트북", quantity: 3, category: "전자" });  // create 정책 member/owner면 로그인 필수
await editRecord("inventory", recordId, { quantity: 10 });                                 // update 정책 owner면 작성자만
await removeRecord("inventory", recordId);                                                  // delete 정책 owner면 작성자만

// 공개(비로그인) 읽기 — read 정책이 public 인 컬렉션 전용
await fetchPublicRecords("inventory", { filter: { category: { eq: "전자" } } });   // 목록(다건)
await BaasSDK.getPublicRecord("inventory", recordId);                              // 단건 — 훅에 래퍼 없어 top-level 사용
```
- **접근 정책 (settings.access — CRUD 연산별 grants, 서버 강제)**: `{create, read, update, delete}`,
  값 = **atom 또는 배열(OR 합집합)**. atom ∈ `public`(누구나) | `member`(로그인) | `owner`(레코드 작성자)
  | `ref_owner:<field>`(그 레코드의 reference 필드가 가리키는 **부모 레코드의 작성자** — #626).
  기본값 create:member/read:member/update:owner/delete:owner, create 는 public|member 만.
  - **읽기 함수 선택 (인증상태 × 개수)** — `read:public` 이어도 `fetchRecords`/`fetchRecord` 는 **항상
    로그인 세션 필요**(인증 데이터플레인 라우트, 컬렉션 read 정책과 무관). 비로그인 조회는 공개 함수로만:

    | | 목록(다건) | 단건 |
    |---|---|---|
    | 비로그인 가능(`read:public`) | `fetchPublicRecords(name, {filter,sort})` | `BaasSDK.getPublicRecord(name, id)` |
    | 로그인 필요 | `fetchRecords(name, …)` | `fetchRecord(name, id)` |

    `getPublicRecord` 는 훅(`useCollection`)에 래퍼가 없어 **top-level `BaasSDK.getPublicRecord`** 로 부른다
    (SDK 표면 — raw fetch 아님). `fetchPublicRecords` 는 레코드 `id` 로 필터가 안 되므로(`unknown_field`)
    단건 조회에 못 쓴다.
  - ⚠️ **인증 읽기(`fetchRecords`/`fetchRecord`)는 비로그인(401) 시 `BaasError` throw가 아니라 `null` 을
    resolve** 한다 → 반환값을 `res?.items ?? []`/null 로 가드(또는 로그인 상태에서만 호출). 쓰기·기타
    작업은 실패 시 `BaasError`(.message) throw(상단 §성공/실패 규약) — 에러 **표시 방식**(토스트/모달/
    인라인)은 앱 UX 소관.
  - `read:owner` → `fetchRecords`가 **본인 레코드만** 반환(개인 데이터).
  - `read:["owner","ref_owner:post_id"]` → `fetchRecords`는 **내 레코드(owner)** ∪ **내가 주인인 부모
    (post_id)에 달린 레코드(ref_owner)** 의 **합집합**을 반환한다. ⚠️ 응답은 **각 행이 어느 자격으로
    매칭됐는지 표시하지 않는다** → 이 목록을 "받은 신청 관리 뷰"로 **그대로 렌더하면 안 된다**(내가 낸
    신청까지 섞여 나옴). 관점으로 나눠 소비한다:
    - `r.account_id === user.id` → **내가 낸** 레코드(내 신청 현황).
    - `r.account_id !== user.id` → **내가 주인인 부모에 달린** 레코드(받은 신청) = 수락/거절 대상.
    "받은 신청 관리"와 "내 신청 현황"은 **별도 화면·별도 부분집합**으로 분리하는 게 안전하다.
  - `update/delete` 에 `owner`/`ref_owner:<f>` → 해당 주체가 아닌 회원의 `editRecord`/`removeRecord`는
    서버가 403(클라 버튼 숨김은 보조). 예: 신청 수락(update)=`ref_owner`(부모 소유자)만, 신청 취소
    (delete)=`owner`(작성자 본인). **ref_owner 전용 액션 버튼은 위 `account_id !== user.id` 부분집합에만
    노출**한다 — 내가 낸 신청에 "수락" 버튼을 붙이면 누를 때 403(실제 발생 오류).
  - UI는 이 정책을 **읽어서** 로그인 게이트·버튼 노출을 맞춘다(정책 자체는 서버가 강제).
- **reference 무결성(서버 강제)**: `reference` 필드 값은 대상 컬렉션의 실존 레코드 id 여야 하며
  아니면 `submitRecord`/`editRecord`가 400. self-reference(같은 컬렉션) 허용 — 트리는 root anchor
  (`post_id`)+parent(`parent_id`) 이중 참조로 설계하고 anchor 평면 조회 후 클라에서 조립한다.
- **필터 DSL**: `filter: { field: { op: value } }`, op ∈ `eq|ne|gt|gte|lt|lte|like|in`. sort는 `field`/`-field`.
- **필드 타입↔UI 관례**(에이전트 설계 시): string→텍스트, number→숫자입력/범위필터, boolean→토글,
  date→날짜피커, enum→select(options.values), reference→검색선택. **이미지/파일**은 아래
  [파일 업로드(storage)](#파일-업로드-storage) 절의 `useFileUpload` 로 `cdn_url` 을 얻어 string(url) 필드에 저장한다.
- `records.items`가 비면 빈 상태 UI. 작성/수정 성공 후 `fetchRecords`로 새로고침.
- 표현 가능 범위(필드 타입·정책·제약)의 **권위 원본은 SDK 타입 + 런타임 컬렉션 스키마** — 이 문서는
  프리미티브 사용법만. 스키마·정책은 CLI로 조회(`baas collection get <name>` → fields + settings.access).

---

## 파일 업로드 (storage)

이미지·파일을 **presign 방식**으로 업로드한다 — 작은 JSON 으로 업로드 URL 을 발급받아 파일 본체는
S3 로 직접 PUT 한다(큰 바이너리가 CloudFront/Lambda 우회, 413/403·지연 없음). 반환된 `cdn_url` 을
콘텐츠에 저장해 영구 조회한다. **동적 컬렉션의 이미지 필드**에 넣을 URL을 이 훅으로 얻는다.

```tsx
const { upload, isUploading, error } = BaasSDK.useFileUpload();

// <input type="file"> 의 File 을 그대로 넘긴다. category 기본 "images".
const res = await upload(file);                 // → { cdn_url, download_url, key, file_id? } | null
if (res) {
  // 컬렉션 레코드 이미지 필드에 cdn_url 저장 (동적 컬렉션 절 참고)
  await BaasSDK.useCollection().submitRecord("products", { name, image_url: res.cdn_url });
}
```
- **category**(저장 분류, 기본 `images`): `images`(이미지 확장자 jpg/png/gif/webp·최대 10MB) |
  `store` | `reservation` | `board_import` | `board_attachment`. 일반 이미지는 `images` 로 충분.
- **반환**: `cdn_url`(인라인 표시용 `<img src>`) · `download_url`(첨부 다운로드) · `key`(S3 경로) ·
  `file_id`(board_attachment 에서만 — 게시글 `file_ids` 연결용).
- 훅은 `isUploading`(로딩)·`error`(실패 시 `BaasError`)를 노출하고 실패 시 `null` 반환(에러 표시 방식은 앱 UX 소관).
- 훅 없이 직접 호출: `await BaasSDK.uploadFile(file, { category })` (성공 시 결과 resolve, 실패 시 throw).
- 업로드는 **로그인 필요**(프로젝트 소속). `<input accept="image/*">` 로 클라 사전 필터 권장.

---

## 에러코드 (의미 참조)

`catch (e) { if (e instanceof BaasSDK.BaasError) ... }` 또는 훅의 `error`.

실패 시 `BaasError`(`.message` 한국어 · `.errorCode` · `.status`)를 throw. **`.message`는 서버가 준 한국어 문구이므로 그대로 노출**하고, **어떤 UI(토스트·모달·인라인·리다이렉트·문구)로 보여줄지는 사용자 요구에 따라 에이전트가 결정**한다. 아래는 각 코드의 의미(사실)·사용 주의일 뿐 UI 규정이 아니다.

| errorCode | HTTP | 의미 | 사용 주의 |
|-----------|------|------|----------|
| `VALIDATION_ERROR` | 400 | 입력이 규칙 위반 | 상세는 `.message` |
| `INVALID_USER` | 400 | 로그인 자격증명 불일치 | 로그인 맥락 |
| `UNAUTHORIZED` | 401 | 미인증(로그인 안 됨) | `useAuth`의 비로그인 401은 **정상**(에러 처리 금지) |
| `TOKEN_EXPIRED`/`INVALID_TOKEN` | 401 | 세션 만료·무효 | 재로그인 유도 대상 |
| `FORBIDDEN` | 403 | 인증됐으나 권한 없음 | **401과 달리 재로그인 대상 아님.** 컬렉션 access(owner/ref_owner) 백스톱 — 클라 버튼 숨김이 1차 |
| `NOT_FOUND` | 404 | 대상 없음 | |
| `ALREADY_EXISTS` | 409 | 중복·충돌 | 회원가입 아이디 중복 등 |
| `INTERNAL_SERVER_ERROR` | 500 | 서버 오류 | 재시도 가능 |
