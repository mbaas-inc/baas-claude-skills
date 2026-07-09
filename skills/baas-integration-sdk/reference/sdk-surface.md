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
