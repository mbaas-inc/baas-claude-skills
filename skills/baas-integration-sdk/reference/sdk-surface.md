# SDK 표면 레퍼런스 (`window.BaasSDK`)

모든 함수/훅은 CDN 로드된 `window.BaasSDK`에 있다. import 하지 말고 전역에서 쓴다.
transport·envelope·project_id 주입은 SDK 내부가 처리한다 — 아래 시그니처만 호출하면 된다.

## ⚠️ 먼저 읽을 것 — 훅 계약 (여기서 틀리면 배포본에서만 드러난다)

`window.BaasSDK` 는 **타입이 없다**(CDN 전역, `.d.ts` 미발행). 아래 계약을 어겨도 `tsc`·`eslint`·
`build` 는 전부 통과하고 **실사용 화면에서만** 크래시하거나 조용히 빈 화면이 된다.

### ① 실패 규약 — **훅 액션은 throw 하지 않는다**

| 호출 형태 | 실패 시 |
|---|---|
| **훅의 액션 함수** (<!--collection:start-->`useCollection().fetchRecords`·`submitRecord`, <!--collection:end-->`useLogin().login`, `useFileUpload().upload` …) | **throw 하지 않는다.** `null`(또는 `login`/`logout` 은 `false`) 을 resolve 하고 실패는 훅의 `error` state 에 담긴다 |
| **예외 — `usePayment().beginWidget`** | 이것만 **throw 한다**(내부 래퍼를 거치지 않음) → `try/catch` 필요 |
| **훅 없는 top-level 함수** (`BaasSDK.uploadFile`, `uploadToTarget`, `changePassword`, `getAccountInfo` …) | `BaasError`(`.message` 한국어, `.errorCode`, `.status`) **throw** |

```tsx
// ❌ 훅 액션에 try/catch — catch 가 실행되지 않아 실패가 성공처럼 보인다
try { await login(id, pw); navigate("/"); } catch { /* 절대 안 옴 */ }

// ✅ 반환값을 확인한다
const ok = await login(id, pw);
if (!ok) return;              // error state 를 화면에 노출
navigate("/");
```

### ② 반환값 vs 훅 state

`fetch*` 를 호출한 뒤 무엇을 렌더에 쓸지는 훅마다 다르다. **표에 없는 이름을 구조분해하면
`undefined` 라서 화면이 영구히 빈 상태가 된다.**

**불변식: 훅에 state 가 있으면 `fetch*` 반환값 === 그 state 값이다.** 둘 중 무엇을 써도 같다.

| 훅 | 훅이 노출하는 state | `fetch*` 반환값 | 렌더에 쓸 것 |
|---|---|---|---|
<!--collection:start-->
| `useCollection` | `records` = `{items,total_count,…}` · `record` | 같은 값 | state 또는 반환값 (`.items` 를 map) |
<!--collection:end-->
| `useAuth` | `isLoggedIn` · `user` · `loading` | — | state |
| `usePayment` | — | `fetchTerms` → `{ title, content, version }` | **반환값을 로컬 state 로** |

> v2.0.0 변경: 게시판·공지/FAQ·댓글·설문·예약·스토어·문의·발송대상 훅이 SDK 에서 빠졌다.
> 없는 훅을 부르면 `BaasSDK.useBoard is not a function` 으로 화면이 깨진다.
<!--collection:start-->
> 그 데이터는 동적 컬렉션(`useCollection`)과, 규칙이 붙으면 serverFn(`baas-backend`)으로 만든다.
<!--collection:end-->

### ③ 훅 반환 컨테이너를 의존성 배열에 넣지 않는다
`const c = BaasSDK.useXxx()` 처럼 컨테이너를 통째로 들고 `[c]` 를 의존성에 넣으면 매 렌더 새 객체라
**무한 재요청 + 영구 로딩**이 된다. 개별 함수만 구조분해한다.
`useMemo` 로 우회되지 않는다(반환 객체에 매 호출 토글되는 `loading` 이 함께 담겨 있다).
<!--collection:start-->
`useCollection` 도 같다 — `const c = useCollection()` 이 아니라 `const { fetchRecords } = useCollection()`.
또한 **`useCollection()` 인스턴스는 컬렉션당 하나** — 한 인스턴스로 두 컬렉션을 조회하면
`records` 슬롯이 하나뿐이라 먼저 도착한 결과가 조용히 사라진다.
<!--collection:end-->

---

## 인증 (account)

### 로그인 방식 고르기 (사용자 요구사항 기준)

로그인 방식은 **사이트를 만드는 사용자가 요구한 대로** 고른다. 서버 쪽 설정은 없다 — 아래 방식은 모두 늘 쓸 수 있다.

| 사용자가 이렇게 말하면 | 방식 | 화면 |
|---|---|---|
| "아이디·비밀번호로 로그인", 별말 없음 | 아이디·비밀번호 | `useLogin()` + `useSignup()` |
| "휴대폰(전화번호·핸드폰)으로 로그인/가입", "문자로 인증", "번호 인증" | 휴대전화 로그인 | `useSmsLogin()` 한 화면 — 아래 「휴대전화 로그인」 절 |
| "카카오·네이버·구글·애플 로그인", "간편 로그인" | SNS | SNS 버튼 — 아래 「SNS 가입 버튼」 절 |
| "이메일 인증 후 가입" | 아이디·비밀번호 + 이메일 인증 | `useSignup()` (프로젝트 설정 EMAIL 필요 — 가입 절차 절) |

- **"본인인증", "인증번호"만 말하고 수단이 없으면 묻는다** — "휴대전화로 할까요, 이메일로 할까요?". 국내 서비스에서
  본인인증은 대개 휴대폰을 뜻하지만, 짐작으로 고르면 화면 전체를 다시 만들어야 한다.
- **여러 방식을 함께 요구하면 한 로그인 화면에 함께 둔다** (예: 휴대폰 로그인 + 카카오 버튼). 방식마다 화면을 따로 만들지 않는다.
- 휴대폰 로그인만 쓰는 사이트는 아이디·비밀번호 입력란을 두지 않는다 — 가입 때 아이디·비밀번호를 생략할 수 있다.

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
- **메뉴·링크 노출도 같은 기준**: 회원 전용 화면(내 예약·마이페이지·내 주문 등)으로 가는 **메뉴·탭·링크는
  `useAuth().isLoggedIn` 일 때만 렌더**한다. 가드는 들어오는 것을 막을 뿐이라, 비로그인에게 「내 예약」 메뉴가
  보이면 누르는 순간 로그인 화면으로 튕긴다 — 비로그인에게 「내」 화면은 없다(실측 2026-10-12: 헤더에 「예약하기 ·
  내 예약」이 로그인 여부와 무관하게 노출). `loading` 동안에는 회원 메뉴를 그리지 않는다(깜빡임 방지).
  ```tsx
  const { isLoggedIn, loading } = BaasSDK.useAuth()
  <nav>
    <NavLink to="/">예약하기</NavLink>                      {/* 공개 둘러보기 — 항상 */}
    {!loading && isLoggedIn && <NavLink to="/my">내 예약</NavLink>}   {/* 회원 전용 — 로그인 때만 */}
    {!loading && (isLoggedIn ? <LogoutButton/> : <NavLink to="/login">로그인</NavLink>)}
  </nav>
  ```
  - **공개 화면 안의 회원 행동은 숨기지 않는다** — 둘러보다가 「예약하기」·「글쓰기」를 누르는 순간 로그인을
    요구하는 것은 정상 흐름이다(버튼 문구를 「로그인하고 예약하기」처럼 바꿔 알린다). 숨기는 것은 **회원 전용
    화면으로 가는 진입 메뉴**뿐이다.
  - 사장님 관리 화면으로 가는 링크는 두지 않는다 — 사장님은 AI Studio 관리 화면에서 운영한다(`baas-backend`
    「관리 화면」 절).

### `useLogin()` / `useSignup()` / `useLogout()` (휴대전화 로그인은 `useSmsLogin()` — 아래 절)
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

> 휴대폰 번호로 로그인·가입하는 앱은 이 설정과 무관하다 — 아래 「휴대전화 로그인」 절(`useSmsLogin()`).

서버가 거부하는 경우(모두 `error.message` 그대로 노출):
- `401 이메일 인증이 필요합니다. 먼저 인증을 완료해주세요.` — 인증 없이 `signup()` 호출
- `400 이메일 인증을 사용하는 프로젝트는 아이디가 이메일 형식이어야 합니다.`
- `429 인증코드는 60초에 한 번만 요청할 수 있습니다.` — `error` 노출 + 재발송 버튼을 60초간 비활성화

### 휴대전화 로그인 — `useSmsLogin()` (기획에 휴대전화 로그인이 있을 때)

휴대폰 번호 소유가 곧 로그인 수단인 앱용이다. **로그인과 가입이 한 흐름**이다 — 번호를 인증하면
가입된 번호는 그 자리에서 로그인되고, 처음인 번호는 추가 정보를 받아 가입과 동시에 로그인된다.
**프로젝트 설정이 필요 없다**(SNS 로그인처럼 늘 제공된다). 기획에 "휴대폰 번호로 로그인/가입"이 있으면
이 화면을 쓰고, 아이디·비밀번호 로그인(`useLogin`)과 함께 둘지는 기획이 정한다. `fetchConfig()` 로 분기하지 않는다.

**인증번호는 카카오톡 알림톡으로 먼저 가고, 알림톡을 보내지 못하면 문자로 간다** — 플랫폼 규칙이고 SDK 는
그대로 따른다(앱이 채널을 고르지 않는다). 훅 이름(`useSmsLogin`)만 SMS 일 뿐 문자 전용이 아니다.
그래서 **화면에 쓰는 이름은 「휴대전화 로그인」**이고, 「문자 인증」이라고만 쓰지 않는다 — 카카오톡으로 받은
손님이 문자함만 찾는다(실측 2026-10-13: 인증번호는 카카오톡으로 왔는데 화면은 「휴대폰 문자 인증」).
- 인증번호 입력 안내: 「카카오톡 또는 문자로 받은 인증번호를 입력해 주세요」
- 내 계정의 로그인 방식 표시: 「휴대전화 로그인」

```tsx
const { step, phone, remainingAttempts, sendCode, verify, signup, reset, loading, error } = BaasSDK.useSmsLogin();
// step: "phone" → "code" → ("signup") → "done" | "pending"

await sendCode(phone);            // 인증번호 발송 → step="code". 가입 여부와 무관하게 보낸다
await verify(code);               // 가입된 번호 → 로그인 완료, step="done"
                                  // 처음인 번호 → step="signup" (인증 완료 상태가 서버에 남는다)
await signup({ name, termsAgreed: true, privacyAgreed: true });   // step="done" (승인제면 "pending")
// 아이디·비밀번호를 받는 앱이면 signup({ ..., userId, userPw }) — 받지 않으면 생략(번호가 아이디가 된다)
```

| `step` | 화면 |
|---|---|
| `"phone"` | 번호 입력(`formatPhone`) + 「인증번호 받기」 → `sendCode(phone)` |
| `"code"` | 6자리 입력 + 「확인」 → `verify(code)`. 틀리면 `remainingAttempts` 로 "N회 남음" 안내. 「재발송」은 `sendCode(phone)` |
| `"signup"` | **이 번호로 처음 오신 분** — 이름·약관 동의(필요하면 앱이 정한 추가 항목) → `signup({...})` |
| `"done"` | 로그인됨 — 전역 인증 상태는 훅이 갱신했다. 화면 전환만 |
| `"pending"` | 승인제 프로젝트 — "관리자 승인 후 이용 가능합니다" 안내 (로그인 안 됨) |

- 로그인 화면과 가입 화면을 **따로 만들지 않는다.** 사용자는 자기가 가입했는지 모르고 번호부터 넣는다.
- **가입 여부를 미리 묻지 않는다** — 서버는 인증번호를 확인한 뒤에만 알려 준다.
- 약관 전문은 `useSignup().fetchTerms()` 로 받아 `"signup"` 단계 화면 안에서 동의받는다(아래 약관 절).
- 인증번호 유효 시간은 5분이다. `"signup"` 단계에서 오래 머물면 가입이 만료로 실패하니 처음부터(`reset()`) 다시 받게 한다.
- core 함수가 필요하면: `BaasSDK.requestSmsLoginCode(phone)` · `loginWithSms(phone, code)` → `{ verified, registered, remaining_attempts }` · `signupWithSms({ phone, name, termsAgreed, privacyAgreed, userId?, userPw? })`.

서버가 거부하는 경우(모두 `error.message` 그대로 노출):
- `502 문자를 보내지 못했습니다. 잠시 후 다시 시도해주세요.` — 발송 실패. 인증번호가 남지 않아 **바로 재시도할 수 있다**(쿨다운 없음)
- `429 인증코드는 60초에 한 번만 요청할 수 있습니다.` — 재발송 버튼을 60초간 비활성화
- `400 MAX_ATTEMPTS_EXCEEDED` · `400 EXPIRED` — 인증번호를 다시 받게 한다(`sendCode`)
- `403 탈퇴 처리된 계정입니다.` · `403 가입 승인 대기 중입니다…` — 로그인 불가 안내
- `409 이 번호로 가입된 계정이 여러 개입니다…` — 아이디·비밀번호 로그인(`useLogin`)으로 안내
- `400 이미 가입된 전화번호입니다.` — 가입 단계에서 같은 번호 회원이 이미 있음(다시 `verify` 하면 로그인된다)

- 인증번호가 틀리면 예외가 아니라 `verify()` 결과가 `verified=false` 다(남은 횟수 `remainingAttempts`). `error` 만 보고 분기하지 않는다.
- 아이디를 생략하고 가입한 회원은 `useAuth().user.email` 에 번호가 들어 있다 — **이메일로 표시하지 않는다**(마이페이지 등).
- 로그인 쿠키는 프로젝트 쿠키다 — API 는 프로젝트 도메인의 `/aiapp-baas/...` 로만 인증된다(SDK 기본 경로 그대로 쓰면 된다).

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


### `useLogout()` 외 계정
```tsx
const { changePassword } = BaasSDK; // 함수(훅 아님): await changePassword(current, next)
```
SNS 계정은 비밀번호 변경 불가(서버가 에러 반환) — `error.message` 노출.

---

## 결제 (payment) — 공통 규약

결제가 들어가는 **모든 화면**에 공통 적용된다. 결제 세션 생성(금액 확정)과 승인(confirm)은
**커스텀 백엔드(serverFn)가 소유**한다(`baas-backend` 의 `sdk.payments` — 금액 권위·정산이 서버에 있어야 안전).
앱은 serverFn 이 준 세션으로 위젯만 띄우고, 아래 공통 규칙을 지킨다.

### 위젯 인라인 단일 방식
- 결제는 **결제위젯(인라인) 단일 방식**이다. `usePayment().beginWidget(session, …)` 이 결제수단/약관 위젯을 앱 DOM(셀렉터 2개)에
  렌더하므로 **결제 도중 앱 화면(헤더·뒤로가기)이 유지**된다(리다이렉트 결제 아님).
- **결제 세션/주문(order_no)은 위젯 진입 전에 serverFn 이 만든다**(보통 약관 동의 후 serverFn 호출). 앱은
  serverFn 이 준 세션으로 `beginWidget` → `handle.requestPayment` 만 호출.
- **⚠ `handle.requestPayment` 는 결제 버튼 클릭 핸들러 안에서 *동기로* 호출한다(앞에 `await` 등 비동기 작업 금지).**
  현대카드 등 팝업/앱카드 결제창은 사용자 제스처가 끊기면 안 뜬다 — 그래서 order_no 를 클릭 전에 미리 만들어 둔다.
  (자리·재고는 결제가 끝난 뒤 serverFn 이 확정한다 — 결제창만 열고 떠난 손님이 자리를 묶지 않는다.)
- **결제 완료 = successUrl 복귀 → confirm.** 카드 · 간편결제 · 계좌이체만 받는다 — **가상계좌는 받지 않는다**(입금
  대기로 끝나면 서버가 취소하고 오류를 돌려준다). 승인 뒤 정원·재고를 넘으면 serverFn 이
  결제를 취소하고 사유를 돌려준다 — 그 사유를 그대로 보여 준다.
- `toss_client_key` 는 **결제위젯 키**(`test_gck_/live_gck_`)여야 한다(개별연동 `ck_` 키는 위젯 미지원).
- 결제 복귀 라우트는 **평면 경로**(`/checkout-success` 등)로 둔다.
- 결제창 닫힘/취소는 `code === "USER_CANCEL"` 에러 → 앱에서 무시(토스트 금지).
- **결제 실행 버튼 라벨은 "결제하기"**(또는 "N원 결제하기") — 위젯이 카드·계좌이체·간편결제 등 **결제수단 선택**을
  제공하므로 **"카드로 결제하기" 같은 수단 한정 문구는 쓰지 말 것.** (위젯 = 다중 결제수단, 카드 전용 아님)
- **⚠ `customerKey` 를 직접 만들지 마라 — 넘기지 않으면 SDK가 익명 키를 쓴다.**
  토스 제약은 `^[a-zA-Z0-9\-_=.@]{2,50}$` 이고, 회원 id 가 UUID 면 `user-{id}-{Date.now()}` 같은
  조합이 **55자로 길이를 넘겨** `"고객키는 … 2자 이상 50자 이하여야 합니다"` 로 위젯이 뜨지 않는다
  (실측 2026-09-17). 그리고 `Date.now()` 를 섞으면 **결제할 때마다 다른 구매자**가 되어 카드 등록·
  재사용이 성립하지 않는다 — `customerKey` 는 같은 구매자에게 **안정적**이어야 하는 값이지
  주문마다 유일해야 하는 값이 아니다(그건 `order_no` 고 SDK가 만든다).
  회원별로 분리해야 할 이유가 생기면 **UUID 에서 하이픈을 뺀 32자**처럼 길이와 안정성을 함께
  만족시키는 값을 쓰고, 그럴 이유가 없으면 **그냥 넘기지 마라.**
- **위젯 생명주기 주의**: 동의 토글 등으로 위젯 컨테이너(셀렉터 div)를 **조건부 언마운트**하면, 동의 해제 시
  위젯 상태(ready 플래그·handle ref)를 **리셋**해 재동의 시 `beginWidget` 을 다시 호출·재렌더해야 한다.
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
- **동의 체크 전에는 결제(`beginWidget`)로 진입하지 말 것.**
- **결제를 붙이는 어떤 화면에서든** 이 동의 게이트를 둔다.

### [필수] ② 통신판매중개업 고지 (푸터) — 웹 앱 전역 푸터에 1회
결제가 있는 앱은 **웹 앱의 전역 푸터(앱 레이아웃 Footer)에 딱 1회** 아래 **통신판매중개업자(=플랫폼
운영사) 고정 정보**를 표기한다(전자상거래법 제20조① 통신판매중개자 고지). **상품 목록·상세·결제 등
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
  공용 푸터 컴포넌트를 만들어 결제 화면에 **일관 배치**(모바일은 하단 탭바와 겹치지 않게). 어느 경우든
  **페이지 컴포넌트마다 즉석 삽입은 금지**(목록→상세 중복 노출 안티패턴).
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
"돈이 실제로 움직이는" 결제의 금액은 **브라우저가 정하지 않는다.** 결제 화면엔 위 ①② 와 위젯 규칙을 동일 적용.
<!--collection:start-->
예약금 · 이용권 · 상품 판매 등 모든 결제는 **금액을 DB(컬렉션)에 두고, 커스텀
백엔드(serverFn)가 그 값을 읽어 세션을 만들고 승인한다**(`baas-backend` 의 `sdk.payments`). 앱은 결제 대상
id 만 보내고 위젯만 띄운다 — 금액을 보내지 않는다.

```tsx
const pay = BaasSDK.usePayment();
// 결제 화면 — serverFn 이 금액을 정해 만든 세션을 그대로 넘긴다(앱이 금액을 만들지 않는다)
const session = await startDeposit({ serviceId, slot });   // id 만 — 금액은 serverFn 이 DB 에서 읽는다
const handle = await pay.beginWidget(session, { methodsSelector: "#pay-methods", agreementSelector: "#pay-agreement" });
if (handle.paymentMode === "test") showNotice("테스트 결제예요 — 실제로 청구되지 않아요.");
// 결제 버튼 onClick — 동기로(앞에 await 금지)
handle.requestPayment({ successUrl: `${location.origin}/deposit-success`, failUrl: `${location.origin}/deposit-fail` });

// 복귀 페이지(/deposit-success)
const r = pay.getRedirectResult();          // { ok, orderNo, paymentKey, amount } | { ok:false, code, message } | null
if (r?.ok) await confirmDeposit({ orderNo: r.orderNo, paymentKey: r.paymentKey, amount: r.amount });
```

- **승인은 브라우저가 하지 않는다.** `getRedirectResult()` 의 ok 는 「토스에서 돌아왔다」일 뿐이다 —
  serverFn 이 `payments.confirm` 으로 PAID 를 받아야 결제 완료다.
- failUrl 의 `code` 가 `PAY_PROCESS_CANCELED`(사용자 취소)면 조용히 결제 화면으로 돌려보낸다.
- 원장에는 `order_no` 만 두고 상태는 서버(`payments.get`)가 정본이다. **커스텀 컬렉션 필드에 금액·결제상태를
  두고 클라이언트가 직접 쓰는 방식은 위·변조 가능하므로 금지.**
<!--collection:end-->

---

<!--collection:start-->
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

// 읽기 — 로그인 여부와 무관하게 같은 함수. 접근은 서버가 플랫폼 기본값으로 판정
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
await submitRecord("application", form, { clientTxnId: submitId });

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
- **접근은 플랫폼 기본값 하나뿐 (서버 강제)**: 규칙 없는 컬렉션은 **로그인한 회원이 컬렉션 전체를
  조회**하고 **각 행은 만든 사람만 수정·삭제**한다. 연산별 권한을 설계하지 않는다 — 이 스킬에는
  그럴 어휘가 없다. 기본과 다른 게 필요하면(호출자 구분, 조회 범위 축소, 비로그인 공개) 그건
  규칙이고 serverFn 이 판정한다.
  - **읽기 함수는 하나다** — 목록은 `fetchRecords`, 단건은 `fetchRecord`. 로그인 여부로 함수를 고르지
    않는다.

    | | 목록(다건) | 단건 |
    |---|---|---|
    | 로그인 무관 | `fetchRecords(name, {filter,sort})` | `fetchRecord(name, id)` |

    `fetchPublicRecords`·`BaasSDK.getPublicRecord` 는 **deprecated 별칭**이다(경로 통합으로 동작 동일).
    기존 앱 호환용이라 신규 코드에서는 쓰지 않는다.
  - ⚠️ **비로그인이면 `BaasError` throw 가 아니라 `null` 을 resolve** 한다 → 반환값을
    `res?.items ?? []`/null 로 가드. 쓰기·기타 작업은 실패 시 `BaasError`(.message) throw
    (상단 §성공/실패 규약) — 에러 **표시 방식**(토스트/모달/인라인)은 앱 UX 소관.
  - 작성자가 아닌 회원의 `editRecord`/`removeRecord` 는 서버가 403 을 낸다. 클라의 버튼 숨김은
    보조일 뿐이고, 판정은 서버가 한다.
  - **목록은 컬렉션 전체가 온다.** "내 것만" 화면이 필요하면 `r.account_id === user.id` 로 거르는 건
    표시 편의일 뿐 보호가 아니다 — 다른 사람의 행이 이미 브라우저에 도착해 있다. 보이면 안 되는
    데이터라면 serverFn 으로 올린다.
- **reference 무결성(서버 강제)**: `reference` 필드 값은 대상 컬렉션의 실존 레코드 id 여야 하며
  아니면 `submitRecord`/`editRecord`가 400. self-reference(같은 컬렉션) 허용 — 트리는 root anchor
  (`post_id`)+parent(`parent_id`) 이중 참조로 설계하고 anchor 평면 조회 후 클라에서 조립한다.
- **필터 DSL**: `filter: { field: { op: value } }`, op ∈ `eq|ne|gt|gte|lt|lte|like|in|has`(array 요소 포함).
  **필드 타입마다 쓸 수 있는 연산자가 다르다** — 맞지 않으면 400 `op_not_allowed_for_<타입>:<op>`:

  | 타입 | 연산자 |
  |---|---|
  | `string` | `eq` `ne` `like` `in` — **범위 비교(`gt`·`gte`·`lt`·`lte`)는 안 된다** |
  | `number` | `eq` `ne` `gt` `gte` `lt` `lte` `in` |
  | `date` | `eq` `ne` `gt` `gte` `lt` `lte` |
  | `enum` · `reference` | `eq` `ne` `in` |
  | `boolean` | `eq` `ne` |
  | `array` | `has` |

  날짜·시각을 범위로 찾을 필드(「이번 달 예약」)는 **처음부터 `date` 타입**으로 선언한다. `string` 으로
  만든 뒤에는 타입을 바꿀 수 없어(스키마는 더하기만 된다) 숫자 필드를 하나 더 두게 된다.
  `like` 는 **값 그대로 부분 일치**다(서버가 앞뒤에 `%` 를 붙인다, 대소문자 무시) — `%` 를 직접 넣지 않는다.
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
  프리미티브 사용법만. 스키마는 런타임 컬렉션 상세 조회로 확인한다(fields).

---

<!--collection:end-->
## 파일 업로드 (storage)

이미지·파일을 **presign 방식**으로 업로드한다 — 작은 JSON 으로 업로드 URL 을 발급받아 파일 본체는
S3 로 직접 PUT 한다(큰 바이너리가 CloudFront/Lambda 우회, 413/403·지연 없음). 반환된 `cdn_url` 을
콘텐츠에 저장해 영구 조회한다.

```tsx
const { upload, isUploading, error } = BaasSDK.useFileUpload();

// <input type="file"> 의 File 을 그대로 넘긴다. category 기본 "images".
const res = await upload(file);                 // → { cdn_url, download_url, key } | null
if (res) setImageUrl(res.cdn_url);              // <img src={imageUrl}> 로 표시
```
<!--collection:start-->
얻은 `cdn_url` 은 **동적 컬렉션의 이미지 필드**(string)에 그대로 저장한다.
```tsx
await BaasSDK.useCollection().submitRecord("products", { name, image_url: res.cdn_url });
```
<!--collection:end-->
- **category**(저장 분류, 기본 `images`): `images`(이미지 확장자 jpg/png/gif/webp·최대 100MB) 하나뿐이다.
- **반환**: `cdn_url`(인라인 표시용 `<img src>`) · `download_url`(첨부 다운로드) · `key`(S3 경로).
- 훅은 `isUploading`(로딩)·`error`(실패 시 `BaasError`)를 노출하고 실패 시 `null` 반환(에러 표시 방식은 앱 UX 소관).
- 훅 없이 직접 호출: `await BaasSDK.uploadFile(file, { category })` (성공 시 결과 resolve, 실패 시 throw).
- `upload` 는 **로그인 회원**(프로젝트 소속)으로 올린다. `<input accept="image/*">` 로 클라 사전 필터 권장.
<!--collection:start-->
### 올릴 수 있는 사람이 정해진 업로드 — `uploadTo`

운영자가 올리는 매장 사진처럼 **누가 올리는지 정해진 업로드**는 커스텀 백엔드(serverFn)가 업로드 주소를
받아 넘기고, 앱은 그 주소로 올리기만 한다(aiapp-service#904). 권한 판정은 serverFn 의 `access`·`authorizes` 가
한다(serverFn 쪽은 `baas-backend` 「파일 업로드」 절). 사장님 관리 화면의 사진(공지 본문 등)은 AI Studio 가 직접
올리므로 앱이 만들 것이 없다.

```tsx
const { uploadTo, isUploading, error } = BaasSDK.useFileUpload();

const target = await presignGalleryPhoto({ filename: file.name, contentType: file.type, size: file.size });
const res = await uploadTo(target, file);       // → { cdn_url, download_url?, key? } | null
if (res) await addGalleryPhoto({ cdnUrl: res.cdn_url });
```
- 실패 규약은 `upload` 와 같다(throw 없이 `null` + 훅 `error`). 훅 없이는 `BaasSDK.uploadToTarget(target, file)`(throw).
- serverFn 이 준 `content_type` 그대로 올린다(서명이 그 값에 묶여 있다 — 바꾸면 S3 가 403).
- 권한이 정해진 업로드를 `upload` 로 만들지 마라 — `upload` 는 로그인 회원이면 누구나 올린다.
<!--collection:end-->

---

## 에러코드 (의미 참조)

`catch (e) { if (e instanceof BaasSDK.BaasError) ... }` 또는 훅의 `error`.

실패 시 `BaasError`(`.message` 한국어 · `.errorCode` · `.status`)를 throw. **`.message`는 서버가 준 한국어 문구이므로 그대로 노출**하고, **어떤 UI(토스트·모달·인라인·리다이렉트·문구)로 보여줄지는 사용자 요구에 따라 에이전트가 결정**한다. 아래는 각 코드의 의미(사실)·사용 주의일 뿐 UI 규정이 아니다.

| errorCode | HTTP | 의미 | 사용 주의 |
|-----------|------|------|----------|
| `VALIDATION_ERROR` | 400 | 입력이 규칙 위반 | 상세는 `.message` |
| `BAD_REQUEST` | 400 | 요청이 규칙 위반 | 상세는 `.message` — 그대로 노출 |
| `INVALID_USER` | 400 | 로그인 자격증명 불일치 | 로그인 맥락 |
| `UNAUTHORIZED` | 401 | 미인증(로그인 안 됨) | `useAuth`의 비로그인 401은 **정상**(에러 처리 금지) |
| `TOKEN_EXPIRED`/`INVALID_TOKEN` | 401 | 세션 만료·무효 | 재로그인 유도 대상 |
| `FORBIDDEN` | 403 | 인증됐으나 권한 없음 | **401과 달리 재로그인 대상 아님.**<!--collection:start--> 작성자가 아닌 수정·삭제의 서버 백스톱 —<!--collection:end--> 클라 버튼 숨김이 1차 |
| `NOT_FOUND` | 404 | 대상 없음 | |
| `ALREADY_EXISTS` | 409 | 중복·충돌 | 회원가입 아이디 중복 등 |
| `INTERNAL_SERVER_ERROR` | 500 | 서버 오류 | 재시도 가능 |
| `NETWORK_ERROR` | 0 | 서버에 닿지 못함(오프라인·연결 끊김) | SDK 가 브라우저 영문(`Failed to fetch`) 대신 한국어 `.message` 를 싣는다 — 그대로 노출하고 다시 시도를 안내 |
| `UPLOAD_FAILED` | S3 응답 코드 | 파일 본체 업로드(S3) 거절 | `useFileUpload` 의 `error` — 그대로 노출 |
