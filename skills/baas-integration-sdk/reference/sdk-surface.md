# SDK 표면 레퍼런스 (`window.BaasSDK`)

모든 함수/훅은 CDN 로드된 `window.BaasSDK`에 있다. import 하지 말고 전역에서 쓴다.
transport·envelope·project_id 주입은 SDK 내부가 처리한다 — 아래 시그니처만 호출하면 된다.

## ⚠️ 먼저 읽을 것 — 훅 계약 (여기서 틀리면 배포본에서만 드러난다)

`window.BaasSDK` 는 **타입이 없다**(CDN 전역, `.d.ts` 미발행). 아래 계약을 어겨도 `tsc`·`eslint`·
`build` 는 전부 통과하고 **실사용 화면에서만** 크래시하거나 조용히 빈 화면이 된다.

### ① 실패 규약 — **훅 액션은 throw 하지 않는다**

| 호출 형태 | 실패 시 |
|---|---|
| **훅의 액션 함수** (`useBoard().submitPost`, `useCollection().fetchRecords`, `useStore().confirm`, `useLogin().login`, `useFileUpload().upload` …) | **throw 하지 않는다.** `null`(또는 `login`/`logout` 은 `false`) 을 resolve 하고 실패는 훅의 `error` state 에 담긴다 |
| **예외 — `beginWidgetCheckout`** (store·reservation) | 이것만 **throw 한다**(내부 래퍼를 거치지 않음) → `try/catch` 필요 |
| **훅 없는 top-level 함수** (`BaasSDK.uploadFile`, `changePassword`, `getAccountInfo` …) | `BaasError`(`.message` 한국어, `.errorCode`, `.status`) **throw** |

```tsx
// ❌ 훅 액션에 try/catch — catch 가 실행되지 않아 실패가 성공처럼 보인다
try { await submitPost(BOARD_ID, {title, content}); navigate("/board"); } catch { /* 절대 안 옴 */ }

// ✅ 반환값을 확인한다
const ok = await submitPost(BOARD_ID, { title, content });
if (!ok) return;              // error state 를 화면에 노출
navigate("/board");
```

### ② 반환값 vs 훅 state — **셋은 서로 다른 규약이다**

`fetch*` 를 호출한 뒤 무엇을 렌더에 쓸지는 훅마다 다르다. **표에 없는 이름을 구조분해하면
`undefined` 라서 화면이 영구히 빈 상태가 된다.**

**불변식: 훅에 state 가 있으면 `fetch*` 반환값 === 그 state 값이다.** 둘 중 무엇을 써도 같다.
state 가 **없는** 함수만 반환값을 로컬 state 로 받으면 된다.

| 훅 | 훅이 노출하는 state | `fetch*` 반환값 | 렌더에 쓸 것 |
|---|---|---|---|
| `useBoard` | `posts` = `{items,total}` · `post` | 같은 값 | state 또는 반환값 |
| `useNotice`/`useFaq` | `posts` = `{items,total}` · `post` | 같은 값 | state 또는 반환값 |
| `useComments` | `comments` = `{items,total}` | 같은 값 | state 또는 반환값 |
| `useCollection` | `records` = `{items,total_count,…}` · `record` | 같은 값 | state 또는 반환값 (`.items` 를 map) |
| `useStore` | `config` · `products` = **배열** | 같은 값(배열) | state 또는 반환값 |
| `useSurvey` | `surveys` = **배열** · `survey` | 같은 값(배열) | state 또는 반환값 |
| `useReservation` | `targets` = 배열 | `fetchTargets` 는 같은 값 | state 또는 반환값 |
| — **state 없음** — | | | |
| `useReservation` | — | `fetchTarget` · `fetchSlots` · `myBookings` | **반환값을 로컬 state 로** |
| `useStore` | — | `fetchProduct` · `myOrders` | **반환값을 로컬 state 로** |

**목록 형태가 두 가지인 이유**: 페이지네이션이 있는 조회(게시판·공지·댓글·동적 컬렉션)는 총 개수가
필요해 `{items, total}` 봉투를, 전량 조회(스토어 상품·설문·예약 대상)는 **배열**을 준다.

**state 없는 함수는 백엔드 응답을 그대로 준다**(가공 없음) — 그래서 `fetchSlots` 는 `{target_id, date,
slots}` 봉투이고 `fetchTarget` 은 `reservation_settings` 가 중첩된 객체다(각 절의 shape 참조).

> v0.13.0 변경: 이전엔 `useStore().fetchProducts` / `useSurvey().fetchSurveys` 가 state 엔 배열을 넣고
> **반환은 `{items}` 봉투**를 줘서 `(await fetchProducts()).map(...)` 이 `TypeError` 였다. 위 불변식으로
> 통일했다 — 반환값을 쓰던 코드에서 `.items` 를 떼면 된다.

### ③ 훅 반환 컨테이너를 의존성 배열에 넣지 않는다
`const c = useCollection()` 처럼 컨테이너를 통째로 들고 `[c]` 를 의존성에 넣으면 매 렌더 새 객체라
**무한 재요청 + 영구 로딩**이 된다. 개별 함수만 구조분해한다(`const { fetchRecords } = useCollection()`).
`useMemo` 로 우회되지 않는다(반환 객체에 매 호출 토글되는 `loading` 이 함께 담겨 있다).
또한 **`useCollection()` 인스턴스는 컬렉션당 하나** — 한 인스턴스로 두 컬렉션을 조회하면
`records` 슬롯이 하나뿐이라 먼저 도착한 결과가 조용히 사라진다.

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
<BaasSDK.RequireAuth fallback={<Navigate to="/login" replace/>} loadingFallback={<Spinner/>}>
  <ProtectedContent/>
</BaasSDK.RequireAuth>
```
**가드 배치 규율 (누락 방지 — 실측 결함 재발 방지):**
- **영역 단위로 감쌀 것**: 로그인 필수 구역은 **공용 레이아웃/라우트 그룹 자체**를 `RequireAuth` 로 감싼다.
  leaf 라우트만 개별로 감싸면 형제(탭 레이아웃·목록 등)를 빠뜨려 로그아웃 상태로 접근되는 결함이 난다.
  ```tsx
  // 로그인 필수 영역 = 레이아웃째로 가드 → 하위 라우트 전부 자동 보호
  <Route element={<RequireAuth fallback={<Navigate to="/login" replace/>}><AppLayout/></RequireAuth>}>
    <Route path="/mypage" element={<MyPage/>} />
    <Route path="/home"   element={<Home/>} />
  </Route>
  ```
- **범위는 기획에서 판단**: 회원 전용(login-first, 스플래시→로그인) 이면 인증 영역 전체를 가드,
  공개 브라우징 허용이면 회원 액션(마이페이지·글쓰기·결제 등)만 가드. 생성 전에 이 축을 먼저 정한다.
- **일관성 체크**: 한 그룹에서 일부 라우트를 가드했으면 그 그룹의 공용/목록 화면도 같은 기준으로 가드해야 한다
  (일부만 가드하고 레이아웃/형제를 빼먹으면 결함). 미인증 fallback 은 `<Navigate to="/login" replace/>` 로 로그인 유도.

### `useLogin()` / `useSignup()` / `useLogout()`
```tsx
const { login, loading, error } = BaasSDK.useLogin();
await login(userId, userPw);      // 성공 시 전역 인증 상태 자동 갱신(refetch). boolean 반환

const { signup, config, terms, verified, fetchConfig, fetchTerms, sendCode, verifyCode, loading, error } = BaasSDK.useSignup();
await signup(userId, userPw, name, phone, { terms_agreed, privacy_agreed, terms_version });
// AccountInfo | null 반환. phone 은 SDK 가 010-1234-5678 로 자동 정규화(폼은 자유 입력)

const { logout } = BaasSDK.useLogout();
await logout();                   // 성공 시 전역 상태 자동 clear
```

전화번호 유틸(폼에서 재사용 — 직접 정규식 만들지 말 것):
```tsx
BaasSDK.formatPhone(value)     // 입력 중 자동 하이픈: "01012345678" → "010-1234-5678" (부분 입력 대응)
BaasSDK.normalizePhone(value)  // 전송 정규화(멱등). signup/registerRecipient 내부에서 자동 적용
// 폼 입력: onChange={e => setPhone(BaasSDK.formatPhone(e.target.value))}
```

UX 규약:
- 로그인/회원가입 폼은 제출 중 버튼 비활성화(`loading`), 실패 시 `error.message`를 폼 하단에 노출.
- 로그인 성공 후 별도 refetch 불필요(훅이 처리). 화면 전환만 하면 `useAuth()`가 최신 상태.
- **phone 은 거절 검증 대신 자동 포맷**: `formatPhone`로 입력 중 하이픈을 넣고, 하이픈 유무로 막지 않는다(최종 형식은 SDK가 보증).

### 가입 절차는 프로젝트 설정으로 갈린다 (매번 읽어 분기)

**`fetchConfig()` 를 가입 화면 진입 시 호출하고 그 결과로 분기한다. 생성 시점 값으로 화면을
고정하지 말 것** — 운영자가 콘솔에서 언제든 토글하므로, 고정하면 화면은 멀쩡한데 가입만 실패한다.

```tsx
const { config, fetchConfig } = BaasSDK.useSignup();
useEffect(() => { fetchConfig(); }, []);
// config = { signup_verification: "NONE" | "EMAIL", require_signup_approval: boolean }
```

| `signup_verification` | 가입 화면이 할 일 |
|---|---|
| `"NONE"` | 코드 입력 UI 없음. 폼 작성 → 바로 `signup()` |
| `"EMAIL"` | ① 이메일 입력 → `sendCode(email)` ② 코드 입력 → `verifyCode(email, code)` ③ `verified === true` 가 되어야 가입 버튼 활성화 ④ `signup(email, pw, name, phone, {...})` — **`userId` 는 인증한 이메일과 같아야 한다** |

| `require_signup_approval` | 가입 성공 직후 |
|---|---|
| `false` | 바로 로그인 안내 |
| `true` | "관리자 승인 후 이용 가능합니다" 안내 (계정은 PENDING 상태) |

서버가 거부하는 경우(모두 `error.message` 그대로 노출):
- `401 이메일 인증이 필요합니다. 먼저 인증을 완료해주세요.` — 인증 없이 `signup()` 호출
- `400 이메일 인증을 사용하는 프로젝트는 아이디가 이메일 형식이어야 합니다.`
- `429 인증코드는 60초에 한 번만 요청할 수 있습니다.` — `error` 노출 + 재발송 버튼을 60초간 비활성화

### 약관 (가입 화면 안에서 동의를 받는다)

프로젝트 회원도 플랫폼에 저장되는 회원이라 통합 약관 동의가 필요하다. 별도 약관 페이지로
이동시키지 말고 **가입 화면 안에서 전문을 접었다 펴는 형태**로 노출한다.

```tsx
const { terms, fetchTerms } = BaasSDK.useSignup();
useEffect(() => { fetchTerms(); }, []);
// terms = { version, terms: {title, content}, privacy: {title, content} }

await signup(email, pw, name, phone, {
  terms_agreed: true, privacy_agreed: true,
  terms_version: terms.version,   // 동의한 버전을 그대로 돌려보낸다
});
```

- 두 항목 모두 **필수 체크**로 만들고, 체크 전에는 가입 버튼을 비활성화한다.
- `content` 는 일반 텍스트(줄바꿈 포함)다 — `white-space: pre-wrap` 으로 렌더한다.
- `terms_version` 은 서버가 회원 기록에 남긴다(약관 개정 시 재동의 대상 특정용). **하드코딩하지 말고 `terms.version` 을 그대로 넘긴다.**

### SNS 가입 버튼

```tsx
const providers = await BaasSDK.getSnsProviders();
// [{ name, display_name, logo_url, login_url, project_login_url }]
```

- **`project_login_url` 로 이동시킨다** — `window.location.href = provider.project_login_url`.
  fetch 대상이 아니라 페이지 이동 경로이며, **문자열을 가공하지 않는다**(호스트를 앞에 붙이거나
  상대 경로로 바꾸면 깨진다). `login_url` 은 구버전 소비자용 상대 경로이므로 생성 앱에서는 쓰지 않는다.
- **`project_login_url` 이 `null` 이면 SNS 버튼을 렌더하지 않는다.** 프로젝트가 확정되지 않은
  호스트에서 부른 경우이고, 그대로 로그인시키면 프로젝트 회원이 아니라 통합회원이 만들어진다.
- 목록은 **전역**이다(프로젝트별 on/off 없음). 기획에서 특정 provider 만 쓰기로 했다면 **결과를 그 목록으로 필터해 렌더**한다 — 렌더 필터일 뿐 서버가 나머지를 막지는 않는다.
- **SNS 가입은 이메일 인증 대상이 아니다**(provider 가 이미 이메일을 검증). `signup_verification === "EMAIL"` 이어도 SNS 버튼은 그대로 노출한다.

#### SNS 가입을 넣으면 복귀 화면도 **함께 만든다** (필수)

SNS 는 provider 화면에서 계정이 만들어져 돌아오므로, 약관 동의와 이름·연락처를 받을 자리가
가입 폼에 없다. 서버는 앱으로 돌려보내기만 하고 **그 화면은 앱이 자기 디자인으로 제공해야 한다**
— 예전엔 mBaaS 콘솔 약관 페이지로 보냈으나, 고객 앱 한가운데 남의 브랜딩 화면이 끼어드는 데다
프로젝트 회원 세션을 읽지 못해 에러가 났다.

**SNS 버튼을 하나라도 렌더한다면 아래 화면을 같은 앱 디자인으로 반드시 함께 생성한다.**

```tsx
// 복귀 후 (앱 루트 또는 login 시작 시 넘긴 next 경로)
const { user } = BaasSDK.useAuth();
if (user && !user.is_profile_completed) {
  // → 약관 동의 + 추가 정보 화면을 띄운다 (이메일 가입 폼과 같은 톤)
}

const terms = await BaasSDK.getSignupTerms();   // 이메일 가입과 같은 본문
await BaasSDK.completeProfile({
  name, phone,                 // phone 은 010-1234-5678 형식 (하이픈 필수, 서버 정규식 검증)
  terms_agreed: true,
  privacy_agreed: true,        // 둘 다 true 여야 통과 — 서버가 약관 동의를 여기서 강제한다
});
```

지켜야 할 규칙:

1. **약관 본문은 `getSignupTerms()` 로 받아 노출한다.** 이메일 가입 화면과 같은 문안·같은 필수
   체크 UI를 쓴다. 체크 전에는 완료 버튼을 비활성화한다.
2. **`is_profile_completed` 가 false 인 동안은 앱 본 기능으로 넘기지 않는다.** 이름·연락처가
   비어 있어 게시글 작성자 표시 같은 곳이 빈칸으로 나온다.
3. `phone` 은 **하이픈 포함 형식**이어야 한다(`010-1234-5678`). 숫자만 보내면 400 이다.
4. 이미 완료된 회원이 다시 호출하면 400 `ALREADY_COMPLETED` 다 — 재진입 시 화면을 건너뛴다.
5. 로그인 시작 시 `project_login_url` 에 `&next=/원래경로` 를 이어 붙이면 복귀 지점을 지정할 수
   있다. 생략하면 앱 루트로 돌아온다.

---

## 게시판 (board)

board_id 는 **프로비저닝 담당이 미리 생성**한 값을 코드 상수로 주입한다(생성 방식·CLI 문법은 이 문서 범위 밖).

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
await fetchPosts({ limit: 20, offset: 0, keyword, category, category_group });
// posts = { items, total, board_settings }
await fetchPost(postId);
```

### 카테고리(분류 그룹) — 있을 때만 렌더

분류는 2단계다. 게시판이 그룹을 정의하고(`posts.board_settings.categories`), 게시글이 그중에서
선택한다(`item.categories`).

```ts
board_settings.categories  // [{ name: "카테고리", values: ["결제", "계정"] }] | null
item.categories            // { "카테고리": ["결제"] } | null
```

- **필터 UI는 `posts.board_settings.categories`가 있을 때만 렌더한다.** 관리자가 분류를 등록하지
  않은 프로젝트에서는 둘 다 `null` — 하드코딩 금지.
- 그룹 이름이 `"카테고리"`(기본값)면 표시에서 접두사를 생략한다(`결제`). 축이 둘 이상일 때만
  `유형: 결제`처럼 그룹명을 붙인다.
- 글 수가 적으면 전체를 받아 클라이언트에서 걸러도 되고, 목록이 길면 `category`(+`category_group`)로
  서버 필터를 쓴다. `category_group`을 주면 그 그룹 안에서만 매칭한다.

---

## 게시판 (board)

board_id 는 **프로비저닝 담당이 생성**한 값을 코드 상수로 주입(게시판 종류는 FREE|REVIEW 등 — 생성은 이 문서 범위 밖).
```tsx
const { posts, post, loading, error, fetchPosts, fetchPost, submitPost, editPost, removePost } = BaasSDK.useBoard();
await fetchPosts(BOARD_ID, { limit: 20, offset: 0, keyword, category, category_group });
// posts = { items, total, board_settings }
await fetchPost(postId);
await submitPost(BOARD_ID, { title, content, categories });   // 로그인 필수
await editPost(postId, { title, content, categories });       // 로그인 필수
await removePost(postId);                          // 로그인 필수
```
- 목록/상세 읽기는 공개, 작성/수정/삭제는 로그인 필수 → 비로그인 시 로그인 유도.
- 카테고리 구조·렌더 규칙은 공지/FAQ와 동일(위 "카테고리(분류 그룹)" 참조). 쓰기 시
  `categories`는 `{ 그룹명: [값] }` 형태이며 **`board_settings.categories`의 부분집합**이어야 한다
  — 벗어나면 서버가 400으로 거부한다.
- `posts.items`가 비면 "아직 글이 없습니다" 빈 상태. 작성 성공 후 `fetchPosts` 재조회.
- **작성자 식별 필드는 `author_id`(계정 UUID) 이며 `fetchPost`(상세)에만 있다. `fetchPosts`(목록)
  응답에는 없다** — 목록에는 표시용 `author_name` 만 온다(동적 컬렉션 레코드의 `account_id` 와 이름이
  다르니 혼동 주의).
  - 상세에서 본인 글 판정: `post.author_id === user.id` (`useAuth()` 의 `user`).
  - **"내가 쓴 글 목록" 화면은 식별자 기반 필터가 불가능**하다. 그 화면이 요구되면 게시글을
    동적 컬렉션으로 설계하거나(레코드 봉투에 `account_id` 가 있다), 사람에게 제약을 보고한다 —
    `author_name` 비교는 동명이인을 구분하지 못하므로 권장하지 않는다.
  - 수정/삭제 버튼 노출은 위 판정으로 좁히되, **실제 권한 경계는 서버(403)** 다.

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
- **결제 세션/주문(order_no)은 위젯 진입 시점(`beginWidgetCheckout`, 보통 약관 동의 후)에 생성된다** — SDK가 그때
  백엔드 `start` 를 호출해 order_no 를 미리 확보한다. 앱은 `beginWidgetCheckout` → `handle.requestPayment` 만 호출.
- **⚠ `handle.requestPayment` 는 결제 버튼 클릭 핸들러 안에서 *동기로* 호출한다(앞에 `await` 등 비동기 작업 금지).**
  현대카드 등 팝업/앱카드 결제창은 사용자 제스처가 끊기면 안 뜬다 — 그래서 order_no 를 클릭 전에 미리 만들어 둔다.
  (미결제 이탈 세션/주문은 서버 정리 배치가 만료.)
- **결제 완료 = 카드는 동기(successUrl 복귀 → confirm), 가상계좌는 비동기(입금 웹훅)** 로 처리된다. 앱의 복귀
  페이지 confirm 은 카드 완결/즉시 UX용이고, 가상계좌는 입금 시 서버 웹훅이 완결하므로 복귀 시점엔 "입금 대기"일 수 있다.
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
await r.fetchTargets();                          // 예약 대상 목록(공개) → 훅 state `targets` 에 담김
await r.fetchTarget(targetId);                   // 대상 상세 — ⚠️ state 없음, 반환값을 로컬 state 로
await r.fetchSlots(targetId, { date });          // 가용 슬롯 — ⚠️ state 없음 + 봉투 반환(아래)
await r.book(targetId, { reserved_at, form_data, payment_method });  // 무료·현장 즉시 예약, 로그인 필수
//   ⚠️ payment_method 는 유료 + 결제수단 복수 제공일 때 **필수**다(아래 "결제 경로 선택" 표).
```

**`fetchTarget()` 반환 shape — 가격·정원·소요시간은 평평하지 않고 `reservation_settings` 안에 중첩된다.**
`target.price` / `target.capacity` 같은 평평한 필드는 **없다**(그렇게 쓰면 런타임 크래시):
```jsonc
{
  "id": "...", "name": "도자기 기초 물레성형", "description": "...", "image_url": null,
  "is_active": true, "display_order": 0,
  "reservation_settings": {
    "operating_hours": { "mon": [["10:00","18:00"]], /* … 요일별 */ },
    "slot_policy":   { "slot_duration_min": 120, "slot_capacity": 4,
                        "advance_booking_days": 30, "min_lead_time_min": 0 },
    "payment_policy": { "amount": 45000, "online": true, "onsite": false },
    "approval_policy": { "auto_confirm": true, "confirmation_message": "..." },
    "user_policy":   { "cancel_deadline_min": 1440, "allow_self_modify": true, "max_active_per_user": 3 }
  },
  "reservation_form_schema": { "fields": [] }
}
```
| 화면에 쓸 값 | 경로 |
|---|---|
| 참가비 | `target.reservation_settings.payment_policy.amount` |
| 정원 | `target.reservation_settings.slot_policy.slot_capacity` |
| 소요시간 | `target.reservation_settings.slot_policy.slot_duration_min` |
| **제공 결제수단** | `payment_policy.online` · `payment_policy.onsite` → **예약 경로를 이 값으로 고른다**(아래) |

### 결제 경로 선택 — `payment_policy` 를 읽어 분기한다 (한쪽으로 고정하지 말 것)

**`online`/`onsite` 는 대상마다 다르고, 운영자가 콘솔에서 언제든 켜고 끈다.** 앱 생성 시점에 관측한
값으로 경로를 고정하면 정책이 바뀌는 순간 조용히 깨진다 — 화면은 멀쩡히 그려지고 **예약 버튼만 죽는다.**
매번 `fetchTarget()` 결과를 읽어 분기한다.

| `amount` | `online` | `onsite` | 화면이 해야 할 것 |
|---|---|---|---|
| `0` | – | – | **무료** — `book(id, { reserved_at, form_data })` (`payment_method` 생략) |
| `>0` | ✅ | ❌ | `beginWidgetCheckout` (위젯). **①구매약관 ②중개고지 푸터 필수** |
| `>0` | ❌ | ✅ | `book(id, { …, payment_method: 'onsite' })` — 약관·푸터 불요(앱이 결제를 중개하지 않음) |
| `>0` | ✅ | ✅ | **사용자에게 결제수단을 고르게 한다.** 고른 값이 `onsite` 면 `book(…, 'onsite')`, `online` 이면 위젯 |

- ⚠️ **유료 + 복수 제공인데 `payment_method` 를 안 보내면 400** `"결제 방법을 선택해 주세요."` 다.
  단일 제공일 때만 서버가 자동 선택한다 — 그래서 "지금 onsite 하나뿐"인 상태에서 만든 코드는
  나중에 online 이 켜지는 순간 400 으로 죽는다.
- ⚠️ **`book()` 에 `payment_method: 'online'` 을 보내면 400** `"카드 결제 예약은 결제 준비(prepare)를
  거쳐 결제 완료 시 생성됩니다."` — 카드는 반드시 `beginWidgetCheckout` 경로다(결제 완료 시점에 예약 생성).
- 제공되지 않는 수단을 보내도 400 `"선택한 결제 방법은 제공되지 않습니다."`

**`fetchSlots()` 반환 shape — 배열이 아니라 봉투이고, 시각 필드명은 `slot` 이다**(`reserved_at` 아님):
```jsonc
{ "target_id": "...", "date": "2026-08-03",
  "slots": [ { "slot": "2026-08-03T10:00:00", "remaining": 4 },
             { "slot": "2026-08-03T12:00:00", "remaining": 4 } ] }
```
```tsx
const res = await r.fetchSlots(targetId, { date });
setSlots(res?.slots ?? []);          // ✅ 언랩 — res ?? [] 로 받으면 .map 이 TypeError
// 렌더: slots.map(s => new Date(s.slot).toLocaleTimeString(...))   // ✅ s.slot (s.reserved_at 아님)
```
⚠️ **응답 필드명(`slot`)과 요청 파라미터명(`reserved_at`)이 다르다** — 값의 출처만 바꾸고 파라미터
이름은 유지한다:
```tsx
await r.beginWidgetCheckout(targetId, { reserved_at: selected.slot, form_data: {} , … });
```
정원이 찬 슬롯은 서버가 이미 제외하고 준다(앱에서 다시 거를 필요 없음).

```tsx

// 카드예약(위젯 인라인 — store 와 동일 계약). 앱에 결제수단/약관 컨테이너 div 2개를 두고:
const w = await r.beginWidgetCheckout(targetId, {
  reserved_at, form_data,
  methodsSelector: "#toss-payment-methods", agreementSelector: "#toss-agreement", customerKey });
//   → 진입 시 SDK가 start(예약 PENDING+세션 생성, 슬롯 선점) → 위젯 렌더(w.amount, w.orderId). 결제 버튼 클릭 시(동기):
await w.requestPayment({
  successUrl: `${location.origin}/reservation-payment-success`,
  failUrl: `${location.origin}/reservation-payment-fail`, orderName: `${target.name} 예약` });
// → 성공 시 successUrl 리다이렉트(paymentKey/amount 쿼리). order_no/reserved_at/form_data 는 SDK가
//   sessionStorage 에 보관 → 복귀 페이지에서:
const ctx = r.getCheckoutContext();  // { target_id, order_no, reserved_at, form_data }
await r.confirm(ctx.target_id, { order_no: ctx.order_no, payment_key, amount, reserved_at: ctx.reserved_at, form_data: ctx.form_data });
r.clearCheckoutContext();

await r.myBookings();                            // 내 예약(로그인)
await r.cancel(reservationId);
```
- 결제 복귀 라우트는 **평면 경로**(`/reservation-payment-success`, `/reservation-payment-fail`)로 둘 것.
- 예약은 `prepareBooking` 응답 안에 `client_key`가 포함된다(store 는 config 로 별도). confirm 필드는 **store·예약 모두 `order_no`**(값은 토스 orderId) — `beginWidgetCheckout()`/`getCheckoutContext()` 가 세부 배선을 흡수한다.
- 결제 방식(위젯 인라인)·`USER_CANCEL` 처리, **[필수] ①구매약관 동의 ②통신판매중개 고지 푸터**는 위
  **"결제 (payment) — 공통 규약"** 을 따른다(예약 결제 화면에도 ①②를 동일 적용).

---

## 스토어 (store)

디지털 상품 판매. 결제 방식·**[필수] ①구매약관 동의 ②통신판매중개 고지 푸터**는 위 **"결제 (payment) — 공통 규약"** 참조.
```tsx
const { config, products, fetchConfig, fetchProducts, fetchProduct, ... } = BaasSDK.useStore();
await fetchConfig();                      // → 훅 state `config`. store_enabled 확인 후 진입(false면 "준비 중")
await fetchProducts({ category_id });     // → state `products` = 배열. 반환값도 같은 배열(v0.13.0)
await fetchProduct(productId);            // ⚠️ state 없음 — 반환값을 로컬 state 로 받는다

// [필수] 구매약관은 결제 공통 훅으로 — const terms = await BaasSDK.usePayment().fetchTerms();
//   content 를 결제 영역 위에 표시 + 동의 체크(동의 전 결제 진입 금지). 위 "결제 공통 규약 ①" 참조.
// 결제(위젯 인라인) — 앱 화면 안에서 결제(뒤로가기 유지, 위젯이 결제수단 선택 제공). 동의 완료 후:
// 1) 앱에 결제수단/약관 컨테이너 div 2개를 두고, 준비 시작:
const w = await s.beginWidgetCheckout({ productId, quantity: qty,
  methodsSelector: "#toss-payment-methods", agreementSelector: "#toss-agreement", customerKey });
//    → 진입 시 SDK가 start(주문 PENDING+세션 생성) → 위젯 렌더(w.amount, w.orderNo).
// 2) 결제 버튼 클릭 시(동기 — 앞에 await 금지, 현대카드 등 팝업 제스처 유지):
await w.requestPayment({ successUrl: `${location.origin}/checkout-success`,
  failUrl: `${location.origin}/checkout-fail`, orderName });
//    → 성공 시 successUrl 리다이렉트(paymentKey/orderId/amount 쿼리).
//    order_no/product_id/quantity 는 SDK가 sessionStorage 에 보관 → 복귀 페이지에서(terms_agreed 는 SDK가 처리):
const ctx = s.getCheckoutContext();  // { order_no, product_id, quantity }
await s.confirm({ order_no: ctx.order_no, payment_key, amount, product_id: ctx.product_id, quantity: ctx.quantity });
s.clearCheckoutContext();

await s.myOrders();                        // 내 주문(로그인) — ⚠️ state 없음, 반환값을 로컬 state 로
await s.confirmPurchase(orderId);          // 구매확정(환불 불가 — 확인 다이얼로그 필수)
await s.cancel(orderId, reason);           // 취소=전액 환불
```
목록 렌더는 state `products` 를 쓰면 된다(반환값도 같은 배열이라 어느 쪽이든 동일):
```tsx
const { products, fetchProducts } = BaasSDK.useStore();
useEffect(() => { fetchProducts({}) }, [fetchProducts]);
return (products ?? []).map(p => …);                        // 초기값은 null 이므로 가드
```
- 결제 방식(위젯 인라인)·복귀 경로·`USER_CANCEL` 처리, **[필수] ①구매약관 동의 ②통신판매중개 고지 푸터**는
  위 **"결제 (payment) — 공통 규약"** 을 따른다(구매약관은 `usePayment().fetchTerms()`).
- **구매확정하면 환불 불가** — 구매확정 전 확인 다이얼로그 필수. 취소는 전액 환불(부분 환불 없음).

---

## 동적 컬렉션 (collection)

**사용자 정의 커스텀 데이터**(고정 기능이 커버 못 하는 것). 데이터 프리미티브만 제공 — **범용 자동
렌더 없음**. 앱은 요구에 맞춰 UI를 설계하고 이 훅으로 데이터만 연결한다.

**전제**: `collection name`·필드(스키마)·접근 정책은 **프로비저닝 담당이 먼저 생성**한다 — 필드는
`이름:타입:수식어`(예: `item_name:string` + required/indexed), 접근 정책은 기본값과 달라지는 연산만 명시
(예: `read: public`). **생성 명령·플래그는 이 문서 범위 밖**이다(권위 = 설치된 CLI 의 `--help`).
스키마·정책 변경은 프로비저닝 담당 소유(콘솔·앱에서 변경 아님).
```tsx
const { records, record, fields, loading, error,
        fetchRecords, fetchPublicRecords, fetchRecord, submitRecord, editRecord, removeRecord,
        restore, increment, aggregate, batch, transaction } = BaasSDK.useCollection();

// 읽기 — 로그인 여부와 무관하게 같은 함수. 범위는 접근 정책(settings.access)이 서버에서 판정
await fetchRecords("inventory", { limit: 20, offset: 0, sort: "-created_at",
                                  filter: { quantity: { lt: 5 }, category: { eq: "전자" } } });
// records = { items, total_count, offset, limit }; item = { id, collection, data:{...}, account_id, created_at }
// ⚠️ 렌더는 records 가 아니라 records.items 를 map 한다 (records 는 배열이 아니라 봉투):
//    (records?.items ?? []).map((r) => r.data.item_name)   // records.map(...) 는 TypeError
await fetchRecord("inventory", recordId);   // 단건 — 비로그인이면 read:public 범위로 판정
await submitRecord("inventory", { item_name: "노트북", quantity: 3, category: "전자" });  // create 정책 member/owner면 로그인 필수
await editRecord("inventory", recordId, { quantity: 10 });                                 // update 정책 owner면 작성자만
await removeRecord("inventory", recordId);                                                  // delete 정책 owner면 작성자만

// fetchPublicRecords / BaasSDK.getPublicRecord 는 deprecated 별칭(동작 동일) — 신규 코드에서 쓰지 않는다

// ── OR 검색 — filter(전부 AND)와 다시 AND 로 결합된다. 게시판 검색이 이 형태
await fetchRecords("notice", { filter: { status: { eq: "게시" } },
                               or: { title: { like: kw }, content: { like: kw } } });

// ── 렌더 스키마 동봉 — 필드별 위젯을 서버에서 받아 화면을 그린다
await fetchRecords("notice", { includeFields: true });   // fields 에 담긴다(목록은 봉투 레벨 1회)
await fetchRecord("notice", recordId, { includeFields: true });
// fields[i] = { name, label, type, ui, unique, required, options, widget }
// ⚠️ 렌더러는 widget 하나만 본다 — type/ui 폴백 규칙을 앱에서 다시 구현하지 않는다

// ── 멱등 생성 — 네트워크 재시도가 중복 접수를 만들지 않게. 키는 제출 1회당 하나를 만들어 유지
await submitRecord("inquiry", form, { clientTxnId: submitId });

// ── 집계 — count 외에는 field 필요(number 타입만). 인가는 목록과 동일
const agg = await aggregate("order", "sum", { field: "amount", groupBy: "status" });
// agg.buckets = [{ key, value, count }, ...]  (groupBy 없으면 1개, key=null)

// ── 카운터 원자 증감 — 동시 요청이 서로를 덮지 않는다. 인가는 update 권한
await increment("notice", recordId, "views");          // +1
await increment("product", recordId, "stock", -1);     // 재고 차감

await restore("notice", recordId);                     // 삭제 취소(soft delete 복구)

// ── 배치 — 항목별 독립 성공/실패. 실패 사유를 행별 오류 표시에 그대로 쓴다
const res = await batch("notice", { create: rows.map((data) => ({ data })) });
// res = { results:[{index, op, id, success, error}], succeeded, failed }

// ── 원자 트랜잭션 — 하나라도 실패하면 전부 롤백. 복수 컬렉션 가능
await transaction([
  { op: "create", collection: "posts",   id: newId, data: { title } },
  { op: "create", collection: "history", data: { post_id: newId } },  // 부모 id 를 미리 정해 참조
]);
```
- **접근 정책 (settings.access — CRUD 연산별 grants, 서버 강제)**: `{create, read, update, delete}`,
  값 = **atom 또는 배열(OR 합집합)**. atom ∈ `public`(누구나) | `member`(로그인) | `owner`(레코드 작성자)
  | `ref_owner:<field>`(그 레코드의 reference 필드가 가리키는 **부모 레코드의 작성자** — #626).
  기본값 create:member/read:member/update:owner/delete:owner, create 는 public|member 만.
  - **읽기 함수는 하나다** — 목록은 `fetchRecords`, 단건은 `fetchRecord`. 로그인 여부로 함수를 고르지
    않는다. 비로그인이면 `read:public` 범위, 로그인이면 회원 범위로 **서버가 정책을 보고 판정**한다.

    | | 목록(다건) | 단건 |
    |---|---|---|
    | 로그인 무관 | `fetchRecords(name, {filter,sort})` | `fetchRecord(name, id)` |

    `fetchPublicRecords`·`BaasSDK.getPublicRecord` 는 **deprecated 별칭**이다(경로 통합으로 동작 동일).
    기존 앱 호환용이라 신규 코드에서는 쓰지 않는다. 로그인 상태에서 별칭을 부르면 회원 범위로
    판정되므로, `read: [public, owner]` 같은 혼합 정책에서 공개분만 보려면 `filter` 로 명시해야 한다.
  - ⚠️ **정책이 거부하면(예: `read:member`/`owner` 인데 비로그인) `BaasError` throw가 아니라 `null` 을
    resolve** 한다 → 반환값을 `res?.items ?? []`/null 로 가드. 쓰기·기타 작업은 실패 시
    `BaasError`(.message) throw(상단 §성공/실패 규약) — 에러 **표시 방식**(토스트/모달/인라인)은 앱 UX 소관.
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
- **필터 DSL**: `filter: { field: { op: value } }`, op ∈ `eq|ne|gt|gte|lt|lte|like|in|has`(array 요소 포함).
  sort는 `field`/`-field`. `or: {...}` 는 서로 OR 이고 그 묶음이 `filter` 와 AND 로 결합된다(한 겹만 — 중첩 없음).
  **성능**: 등호(`eq`)·`has` 만 인덱스를 탄다. `like`·범위 비교·커스텀 필드 정렬은 전체 스캔이므로
  큰 컬렉션에서 목록 UX 를 설계할 때 감안한다. `limit` 상한은 100.
- **필드 타입 7종**: string · number · boolean · date · enum · reference · **array**(태그·다중 선택,
  `options.values` 가 있으면 그 목록에서만). **이미지/파일**은 아래
  [파일 업로드(storage)](#파일-업로드-storage) 절의 `useFileUpload` 로 `cdn_url` 을 얻어 string(url) 필드에 저장한다.
- **위젯은 서버가 확정한다 — `widget` 하나만 보면 된다**(`includeFields: true` 로 받는다).
  `type`·`ui` 는 선언이고 `widget` 은 결론이다. 폴백 규칙(boolean→toggle, date→date,
  array→tags, **enum→값 3개 이하 radio / 4개 이상 select**)을 앱에서 다시 구현하면 규칙이 갈라진다.

  | widget | 그릴 것 |
  |---|---|
  | `text` · `textarea` · `richtext` | 한 줄 / 여러 줄 / 에디터 |
  | `phone` · `email` | 형식 입력 |
  | `number` · `money` | 숫자 / 금액(12,000원) |
  | `toggle` · `date` | 스위치 / 날짜 선택 |
  | `radio` · `select` | 선택지는 `options.values` |
  | `reference` | 검색 후 선택(대상은 `options.collection`) |
  | `tags` | 다중 값 입력 |

- **값 형식**: `date` 는 `YYYY-MM-DD` 또는 `YYYY-MM-DDTHH:MM[:SS]` — **구분자는 `T` 만**(공백·자리수
  미달은 400). 금액은 부동소수 오차를 피해 **원 단위 정수**로 저장한다. 레코드 전체 상한 64KB
  (이미지는 base64 로 넣지 말고 URL 을 쓴다).
- **유일성**: `unique` 필드에 중복 값을 쓰면 **409**. 해당 입력에 "이미 사용 중" 을 표시한다.
- **삭제 정책**(reference 필드의 `on_delete`, 기본 `restrict`): 부모 레코드를 지울 때
  `restrict`=참조가 있으면 409(오류에 막는 컬렉션·건수가 담긴다) · `cascade`=자식도 함께 삭제
  (삭제 확인에 경고) · `set_null`=자식의 참조 키 제거 · `none`=방치. 정책은 프로비저닝 담당 소유.
- `records.items`가 비면 빈 상태 UI. 작성/수정 성공 후 `fetchRecords`로 새로고침.
- **부분 수정**: `editRecord` 는 보낸 키만 바꾼다(안 보낸 필드는 유지). 병합이 서버에서 일어나므로
  두 사용자가 같은 행의 **다른 칸**을 동시에 고쳐도 서로의 변경이 사라지지 않는다.
- **배치 vs 트랜잭션**: 배치 = 같은 컬렉션 대량 + **부분 성공**(엑셀 붙여넣기·일괄 정리),
  트랜잭션 = 복수 컬렉션 소수 + **전부 아니면 전무**(따로 남으면 데이터가 거짓이 되는 쌍).
  대량 작업에 트랜잭션을 쓰면 한 행 때문에 전부 되돌아간다.
- ⚠️ **"누구나 조회수만 올리기" 는 아직 불가** — `increment` 는 `update` 권한을 쓰므로 비로그인
  조회수 증가에는 `update: public` 이 필요하고 그건 본문 수정까지 열어 버린다. 필드 단위 권한이
  없어서 생기는 제약이다(로그인 회원 기준 카운터·관리자 경로에서는 문제없다).
- 표현 가능 범위(필드 타입·정책·제약)의 **권위 원본은 SDK 타입 + 런타임 컬렉션 스키마** — 이 문서는
  프리미티브 사용법만. 스키마·정책은 런타임 컬렉션 상세 조회로 확인한다(fields + settings.access).

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
