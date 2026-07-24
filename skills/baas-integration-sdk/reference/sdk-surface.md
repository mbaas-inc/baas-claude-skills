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

## 결제 (payment) — 공통 규약

결제가 들어가는 **모든 흐름(스토어·예약, 그리고 결제를 붙이는 커스텀 화면)** 에 공통 적용된다.
결제 실행(금액 확정 prepare / 시크릿키 정산 confirm / 위젯 렌더)은 **store·reservation 백엔드가 소유**한다
(금액 권위·정산이 서버에 있어야 안전). 앱은 아래 공통 규칙만 지키면 된다.

### 위젯 인라인 단일 방식
- 결제는 **결제위젯(인라인) 단일 방식**이다. `beginWidgetCheckout` 이 결제수단/약관 위젯을 앱 DOM(셀렉터 2개)에
  렌더하므로 **결제 도중 앱 화면(헤더·뒤로가기)이 유지**된다(리다이렉트 결제 아님).
- `toss_client_key` 는 **결제위젯 키**(`test_gck_/live_gck_`)여야 한다(개별연동 `ck_` 키는 위젯 미지원).
- 결제 복귀 라우트는 **평면 경로**(`/checkout-success` 등)로 둔다.
- 결제창 닫힘/취소는 `code === "USER_CANCEL"` 에러 → 앱에서 무시(토스트 금지).
- **결제 실행 버튼 라벨은 "결제하기"**(또는 "N원 결제하기") — 위젯이 카드·계좌이체·간편결제 등 **결제수단 선택**을
  제공하므로 **"카드로 결제하기" 같은 수단 한정 문구는 쓰지 말 것.** (위젯 = 다중 결제수단, 카드 전용 아님)
- **위젯 생명주기 주의**: 동의 토글 등으로 위젯 컨테이너(셀렉터 div)를 **조건부 언마운트**하면, 동의 해제 시
  위젯 상태(ready 플래그·handle ref)를 **리셋**해 재동의 시 `beginWidgetCheckout` 를 다시 호출·재렌더해야 한다.
  리셋 없이 "이미 렌더함" 가드만 두면 **재체크 시 빈 컨테이너로 위젯이 안 뜬다**(실측 결함). 컨테이너를 항상
  마운트하고 CSS로만 숨기는 방식도 가능.

### [필수] ① 구매약관 동의 — 결제 있는 모든 화면
`usePayment().fetchTerms()` 의 `content` 를 **결제 진입 전** 표시하고
**동의 체크**를 받는다. content 는 프로젝트 공통 표준 약관 4조항(**통신판매중개 고지 · 결제진행 동의 ·
환불정책 · 개인정보 제공**)이며, **문구를 임의 작성하지 말고 API content 를 그대로 렌더**한다.
```tsx
const pay = BaasSDK.usePayment();
const terms = await pay.fetchTerms();   // { title, content, version }
// content 를 결제 버튼 위 약관 영역(접기/펼치기 권장)에 표시 + 동의 체크박스
```
- **동의 체크 전에는 결제(`beginWidgetCheckout`)로 진입하지 말 것.** (서버 prepare 는 동의를 전제한다.)
- 스토어·예약뿐 아니라 **결제를 붙이는 어떤 화면에서든** 이 동의 게이트를 둔다.

### [필수] ② 통신판매중개업 고지 (푸터) — 웹 앱 전역 푸터에 1회
스토어/결제가 있는 앱은 **웹 앱의 전역 푸터(앱 레이아웃 Footer)에 딱 1회** 아래 **통신판매중개업자(=플랫폼
운영사) 고정 정보**를 표기한다(전자상거래법 제20조① 통신판매중개자 고지). **스토어 목록·상세·체크아웃 등
페이지 컴포넌트마다 중복 배치하지 말 것** — 전역 레이아웃 Footer 한 곳이면 모든 페이지에서 노출된다(목록→상세
이동 시 매번 따로 뜨면 안티패턴). **셀러/앱 운영주체(예: 협회·클라이언트)의 정보가 아니라 플랫폼 운영사
정보이며, API로 내려오지 않으니 아래 문구를 그대로 넣는다.** 개별 셀러 신원정보는 노출하지 않는다.
```text
상호: 주식회사 엠바스 (대표: 김정현)
사업자등록번호: 128-88-02089 | 통신판매업신고번호: 제2026-부산금정-0312호
주소: 부산광역시 금정구 부산대학로50번길 68, 404호 (장전동)
문의: 070-8648-2750 / help@aiapp.help
사업자정보확인: https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1288802089

주식회사 엠바스는 통신판매중개자이며, 통신판매의 당사자가 아닙니다. 상품, 상품정보, 거래에 관한 의무와 책임은 판매자에게 있습니다.
```
- 마지막 "당사자 아님" 문장은 **`fetchTerms()` 약관 1번 조항(통신판매중개 고지)의 API 정본과 동일 문구**다 —
  임의로 바꾸지 말고 이 문구 그대로 쓴다. **생략 불가.**
- 「사업자정보확인」은 위 공정위 URL로 **새 창 링크**(`target="_blank" rel="noopener noreferrer"`),
  앵커 텍스트는 `사업자정보확인`(`wrkr_no`=사업자번호 하이픈 제거). 신고번호 등 텍스트는 그대로 두고 링크만 덧붙인다.
- 상호·사업자번호·신고번호·주소·연락처는 API로 내려오지 않는 플랫폼 운영사 고정 정보다(변경 시 이 스킬 문구 갱신).
- **배치**: 전역 레이아웃이 모든 화면을 감싸면 그 Footer에 1회. **탭/비탭 라우트가 나뉘는 모바일 앱**은
  공용 푸터 컴포넌트를 만들어 스토어/결제 화면에 **일관 배치**(모바일은 하단 탭바와 겹치지 않게). 어느 경우든
  **스토어 페이지 컴포넌트마다 즉석 삽입은 금지**(목록→상세 중복 노출 안티패턴).
- **구조 권장(정돈된 커머스 푸터, 예: 네이버 스타일)**: `고지 문구 → 사업자정보(라벨·값 인라인, 구분점 ·) →
  고객센터(전화·이메일) → 저작권` 순으로 구획화한다. 밋밋한 `<p>` 나열보다 라벨을 흐리게·항목을 `·` 로 구분해
  가독성을 높인다.
  ```text
  주식회사 엠바스는 통신판매중개자이며, 통신판매의 당사자가 아닙니다. 상품, 상품정보, 거래에 관한 의무와 책임은 판매자에게 있습니다.
  상호 주식회사 엠바스 · 대표 김정현 · 사업자등록번호 128-88-02089 · 통신판매업신고번호 제2026-부산금정-0312호 · 주소 부산광역시 금정구 부산대학로50번길 68, 404호 (장전동) · [사업자정보확인]
  고객문의 070-8648-2750 · 이메일 help@aiapp.help
  © 주식회사 엠바스 (mBaaS). All Rights Reserved.
  ```

### 커스텀 화면에 결제를 붙일 때
현재 SDK 는 결제 금액을 안전하게 다루는 prepare/confirm 을 **store·reservation 에만** 제공한다. 따라서
"돈이 실제로 움직이는" 결제는 **store 또는 reservation 을 경유**하고, 커스텀 컬렉션은 그 결과(주문/예약 id 등)를
**reference 로 연결**해 도메인 데이터를 관리한다. **커스텀 컬렉션 필드에 금액·결제상태를 두고 클라이언트가 직접
쓰는 방식은 위·변조 가능하므로 금지**(결제 확정은 반드시 서버 소유). 결제 화면엔 위 ①②를 동일 적용.

---

## 예약 (reservation)

슬롯/캘린더 기반. 무료·현장 예약은 즉시 생성, 카드 예약은 `beginWidgetCheckout`(위젯 인라인 — 위 **결제 공통 규약** 참조).
```tsx
const r = BaasSDK.useReservation();
await r.fetchTargets();                          // 예약 대상 목록(공개)
await r.fetchTarget(targetId);                   // 운영설정·폼·결제정책
await r.fetchSlots(targetId, { date });          // 가용 슬롯(공개)
await r.book(targetId, { reserved_at, form_data });  // 무료·현장 즉시 예약, 로그인 필수

// 카드예약(위젯 인라인 — store 와 동일 계약). 앱에 결제수단/약관 컨테이너 div 2개를 두고:
const w = await r.beginWidgetCheckout(targetId, {
  reserved_at, form_data,
  methodsSelector: "#toss-payment-methods", agreementSelector: "#toss-agreement", customerKey });
//   → 결제수단/약관 위젯이 앱 DOM 에 렌더됨(w.amount, w.orderId). 결제 버튼 클릭 시:
await w.requestPayment({
  successUrl: `${location.origin}/reservation-payment-success`,
  failUrl: `${location.origin}/reservation-payment-fail`, orderName: `${target.name} 예약` });
// → 성공 시 successUrl 로 리다이렉트(paymentKey/amount 쿼리). reserved_at/form_data 는 SDK가
//   sessionStorage 에 보관 → 복귀 페이지에서:
const ctx = r.getCheckoutContext();  // { target_id, order_id, reserved_at, form_data }
await r.confirm(ctx.target_id, { order_id: ctx.order_id, payment_key, amount, reserved_at: ctx.reserved_at, form_data: ctx.form_data });
r.clearCheckoutContext();

await r.myBookings();                            // 내 예약(로그인)
await r.cancel(reservationId);
```
- 결제 복귀 라우트는 **평면 경로**(`/reservation-payment-success`, `/reservation-payment-fail`)로 둘 것.
- 예약은 `prepareBooking` 응답 안에 `client_key`가 포함된다(store 는 config 로 별도). confirm 필드는 store=`order_no`, 예약=`order_id`(값은 둘 다 토스 orderId) — `beginWidgetCheckout()`/`getCheckoutContext()` 가 세부 배선을 흡수한다.
- 결제 방식(위젯 인라인)·`USER_CANCEL` 처리, **[필수] ①구매약관 동의 ②통신판매중개 고지 푸터**는 위
  **"결제 (payment) — 공통 규약"** 을 따른다(예약 결제 화면에도 ①②를 동일 적용).

---

## 스토어 (store)

디지털 상품 판매. 결제 방식·**[필수] ①구매약관 동의 ②통신판매중개 고지 푸터**는 위 **"결제 (payment) — 공통 규약"** 참조.
```tsx
const s = BaasSDK.useStore();
await s.fetchConfig();                    // config.store_enabled 확인 후 진입(false면 "준비 중")
await s.fetchProducts({ category_id });   // s.products = Product[] (SDK가 items/data/배열 정규화)
await s.fetchProduct(productId);

// [필수] 구매약관은 결제 공통 훅으로 — const terms = await BaasSDK.usePayment().fetchTerms();
//   content 를 결제 영역 위에 표시 + 동의 체크(동의 전 결제 진입 금지). 위 "결제 공통 규약 ①" 참조.
// 결제(위젯 인라인) — 앱 화면 안에서 결제(뒤로가기 유지, 위젯이 결제수단 선택 제공). 동의 완료 후:
// 1) 앱에 결제수단/약관 컨테이너 div 2개를 두고, 준비 시작:
const w = await s.beginWidgetCheckout({ productId, quantity: qty,
  methodsSelector: "#toss-payment-methods", agreementSelector: "#toss-agreement", customerKey });
//    → 결제수단/약관 위젯이 앱 DOM 에 렌더됨(w.amount, w.orderNo).
// 2) 결제 버튼 클릭 시:
await w.requestPayment({ successUrl: `${location.origin}/checkout-success?product_id=${productId}&quantity=${qty}`,
  failUrl: `${location.origin}/checkout-fail`, orderName });
//    → 성공 시 successUrl 로 리다이렉트(paymentKey/orderId/amount 쿼리). 복귀 페이지에서 confirm:
//    order_no 는 복귀 쿼리의 토스 orderId(= prepare 응답 order_no). terms_agreed 는 넘길 필요 없다(SDK 가 처리).
await s.confirm({ order_no: orderId, payment_key, amount, product_id, quantity });

await s.myOrders();                        // 내 주문(로그인)
await s.confirmPurchase(orderId);          // 구매확정(환불 불가 — 확인 다이얼로그 필수)
await s.cancel(orderId, reason);           // 취소=전액 환불
```
- 결제 방식(위젯 인라인)·복귀 경로·`USER_CANCEL` 처리, **[필수] ①구매약관 동의 ②통신판매중개 고지 푸터**는
  위 **"결제 (payment) — 공통 규약"** 을 따른다(구매약관은 `usePayment().fetchTerms()`).
- **구매확정하면 환불 불가** — 구매확정 전 확인 다이얼로그 필수. 취소는 전액 환불(부분 환불 없음).

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
