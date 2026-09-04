---
name: baas-backend
description: "(BaaS 백엔드) 프로젝트 전용 Node 백엔드의 서비스 로직을 작성하는 가이드. 프레임워크(envelope 파싱·주입 토큰·에러 직렬화·배포·라우트 생성)는 플랫폼이 담당하고, 서버 로직을 프론트와 같은 트리(`src/services/*.ts`)에 `serverFn` 으로 작성하면 빌드가 envelope 라우트와 타입 유도 fetch 스텁을 만든다. 제공: dyncol 데이터 접근(unique·원자 증감·조건부 갱신·트랜잭션·집계), 네이티브 기능 호출, 스케줄 핸들러. Use when: 구현 브리프의 '백엔드 연결 후보'가 채워졌을 때 — 여러 레코드의 합·개수로 판정되는 규칙(선착순·정원·재고), 상태 전이·승인 흐름, 아무도 접속하지 않아도 도는 처리(마감·정산·리마인더), 플랫폼이 감싸지 않은 외부 연동(사내 시스템·서드파티 API). 결제와 회원 인증은 네이티브가 담당하므로 여기서 다루지 않고, 프론트 코드·화면도 다루지 않는다."
---

# BaaS 백엔드 스킬 (서비스 로직 작성 가이드)

## 0. 먼저 — 골격을 놓는다

`backend/` 가 없으면 이 스킬의 골격을 복사한다. **손으로 만들지 마라** — envelope 파싱·주입
토큰 장착·에러 직렬화는 §1 표대로 플랫폼 계약이고, 다시 쓰면 어긋난다.

```bash
SKILL_DIR=""
for d in skills/baas-backend /app/plugins/baas-claude-skills/skills/baas-backend; do
  [ -d "$d/boilerplate" ] && SKILL_DIR="$d" && break
done
[ -n "$SKILL_DIR" ] || { echo "boilerplate 를 찾지 못했다"; exit 1; }

if [ ! -d backend ]; then
  mkdir -p backend && cp -R "$SKILL_DIR/boilerplate/." backend/
  cp backend/src/serverFn.ts src/services/serverFn.ts     # 프론트가 import 하는 마커
  echo "backend/ 골격 생성"
else
  echo "backend/ 이미 있음 — 유지"
fi
[ -d backend/node_modules ] || (cd backend && npm install --no-audit --no-fund)
```

`npm install` 이 실패하면 **거기서 멈추고 사용자에게 알린다.** 타입 검사 없이 서버 코드를
내보내지 마라 — 이 층은 프론트와 달리 화면에서 오류가 드러나지 않는다.

## 0-1. 어디에 쓰나 — `src/services/*.ts` 한 곳

**`backend/src/routes/` 를 직접 만들지 마라.** 서버 로직도 프론트와 같은 파일 트리에
`serverFn` 으로 쓰고, 빌드가 envelope 라우트와 fetch 스텁을 만든다.

```ts
// src/services/coupons.ts  ← 사람이 쓰는 유일한 파일
import { serverFn } from './serverFn'

export type ClaimInput = { employeeId: string }
export type ClaimResult = { status: 'issued' | 'already_claimed' | 'sold_out' }

export const claim = serverFn<ClaimInput, ClaimResult>(async (input, ctx) => {
  // ctx.sdk 로 dyncol·네이티브에 접근한다. fetch 직접 호출 금지.
  ...
})
```

작성 후 **반드시** 추출을 돌린다:

```bash
node backend/extract.mjs
```

이 한 명령이 추출부터 번들까지 끝낸다. 생성물 다섯 — 직접 고치지 마라(다음 추출에서 덮인다):

| 생성물 | 쓰임 |
|---|---|
| `backend/src/routes/<모듈>.ts` | envelope 라우트 |
| `src/services/<모듈>.client.ts` | 프론트가 부르는 fetch 스텁 |
| `backend/src/index.ts` | 라우트 등록 진입점 — 라우트 이름을 추출기가 정하므로 손으로 맞추지 않는다 |
| `backend/service-grants.json` | 호출한 dyncol 연산에서 유도한 `service` 권한 |
| `backend/dist/index.js` | Lambda·미리보기가 실제로 실행하는 번들 |

프론트는 **응답 모양을 다시 선언하지 않는다.** 스텁이 원본 시그니처에서 유도하므로,
서버가 필드명을 바꾸면 프론트 타입 검사가 깨진다 — 런타임 타입가드를 쓰지 마라.

```ts
// src/components/CouponButton.tsx
import { claim } from '../services/coupons.client'
const result = await claim({ employeeId })
if (result.status === 'issued') { ... }        // 가드 없이 바로 분기
```

## 0-2. 빌드가 막는 것 — 미리 알고 쓰라

추출기는 아래를 **빌드 실패**로 떨어뜨린다. 우회하지 말고 설계를 바꿔라.

| 위반 | 왜 막나 |
|---|---|
| serverFn 파일이 클라이언트 모듈 import (`.tsx`, `components/`, `react`) | 컴포넌트가 서버 번들로 끌려온다 |
| 모듈 스코프 **가변** 상태(`let`)를 serverFn 안에서 사용 | 요청 간 상태가 샌다. `const` 리터럴은 허용 |
| 시크릿으로 보이는 이름(`SECRET`·`API_KEY`·`TOKEN`) 또는 `process.env` 참조 | 클라이언트 번들로 새면 상시 노출된다 |
| `dyncol.<op>()` 의 컬렉션명을 정적으로 풀 수 없음 (템플릿·런타임 값) | 볼 수 없는 이름에는 최소권한을 줄 수 없다 — 아래 참조 |

serverFn 이 **하나도 없으면 `backend/` 를 만들지 않는다** — 서버가 필요 없는 앱은 정적
배포로 남는다. 그것이 기본값이다.

### 컬렉션 접근 권한은 선언하지 않는다 — 빌드가 유도한다

백엔드가 만지는 컬렉션은 그 연산에 `service` 권한이 있어야 서버가 통과시킨다. 그런데
**그 선언을 당신이 하지 않는다.** 추출기가 `dyncol.<op>()` 호출부를 걸어 필요한 권한만
`backend/service-grants.json` 으로 낸다.

```
dyncol.get/list/aggregate → read     dyncol.create        → create
dyncol.update/increment   → update   dyncol.remove        → delete
```

그래서 컬렉션명을 **문자열 리터럴이나 모듈 스코프 `const`** 로 써야 한다. 이건 스타일
규칙이 아니라 권한이 유도되는 조건이다.

```ts
const JOIN = 'gb_join'                       // ✅ 풀린다
await ctx.sdk.dyncol.create(JOIN, {...})     //    → gb_join: create

await ctx.sdk.dyncol.list(`items_${kind}`)   // ✗ 빌드 실패 — 이름을 알 수 없다
```

읽기만 하는 컬렉션에 쓰기 권한이 생기지 않는다 — **코드가 부르는 연산만** 열린다.

## 당신이 쓰는 것 / 쓰지 않는 것

`src/services/*.ts` 의 `serverFn` **하나만** 작성한다. 아래는 플랫폼이 이미 한다 — 만들지 마라.

| 플랫폼 담당 | 당신이 만들면 생기는 문제 |
|---|---|
| envelope 파싱, 라우팅, **라우트 파일 생성** | 중복. 생성물은 다음 추출에서 덮인다 |
| **envelope 계약**(`src/platform/envelope.ts`) | 디스패처와 버전으로 맞물려 있다. 필드를 고치면 `ENVELOPE_CONTRACT_VERSION` 이 어긋나 첫 요청부터 전부 거부된다 |
| **주입 토큰 장착** | `fetch` 를 직접 쓰면 토큰이 로그·에러 응답으로 샌다 |
| 에러 → HTTP 상태 직렬화 | `SdkError.status` 가 500 으로 뭉개진다 |
| 번들·배포·환경변수 | — |
| **결제**(`usePayment`·`getPurchaseTerms`, 결제위젯·정산·웹훅 검증) | PG 계약 주체가 플랫폼이라 이 서버엔 PG 자격도 정산 경로도 **없다**. 만들어도 동작하지 않는다 |
| **회원 신원**(가입·로그인·프로필) | 로그인한 회원은 주입 토큰으로 이미 도착한다. `ctx.accountId` 를 **받아 쓰고**, 인증을 다시 만들지 마라 |

돈이나 신원이 얽혔다는 이유만으로 서버 몫이 되지 않는다. 당신이 쓰는 것은 그 **주변 규칙**
(선착순 상한, 자격 검증, 클라이언트가 알면 안 되는 산식)이고, 결제·로그인 자체는 프론트가
네이티브 훅으로 호출한다.

**데이터 접근은 반드시 `c.var.sdk` 를 지난다.** `fetch` 직접 호출 금지.

## 플랫폼 프리미티브 — 성질과 실측 근거

도메인 규칙은 브리프에서 온다. 아래는 **이 플랫폼의 사실**이다.

### unique 제약 — advisory lock, 409 는 정상 분기

컬렉션에 `unique` 필드가 선언돼 있으면 서버가 **락을 먼저 잡고** 삽입한다(확인 후 삽입이
아니다). 동시 요청 중 하나만 통과하고 나머지는 409.

- **미리 조회해 검사하지 마라** — 경합에 뚫린다. 실측: 동시 12건 → 1건만 성공.
- 409 를 `catch` 해서 **정상 분기로 다루는 것이 올바른 사용법**이다.

### 원자 증감 — 반환값이 내 순번

`increment` 는 갱신된 레코드를 돌려준다. **경계 가드는 없다**(정원을 넘고 0 을 지나
음수로 내려간다). 그래서 상한·하한은 **반환값으로 판정**한다.

```ts
const after = await sdk.dyncol.increment<Slot>('slots', id, 'booked', 1)
if (after.data.booked > after.data.capacity) {
  await sdk.dyncol.increment('slots', id, 'booked', -1)   // 보상
  return 정원마감
}
```

**조회해서 확인한 뒤 증가시키면 안 된다.** unique 로 선점을 먼저 해도 막히지 않는다 —
unique 는 *같은 회원*의 중복만 막으므로 서로 다른 회원들은 여전히 같은 값을 읽는다.

실측 (정원 100 · 서로 다른 회원 120명 동시):

| 순서 | 결과 |
|---|---|
| 조회 → 확인 → 증가 | 120 ❌ |
| unique 선점 → 조회·확인 → 증가 | 120 ❌ |
| unique 선점 → **원자증가 → 반환값 판정** → 보상 | **100** ✅ |

### 조건부 갱신 — 상태 전이는 이걸로

`update(..., { if: {...} })` 는 그 값들이 현재 레코드와 같을 때만 갱신하고 다르면 409.
조건과 갱신이 **한 문장**이라 끼어들 틈이 없다.

```ts
// 승인 — 아직 pending 일 때만
await sdk.dyncol.update('po', id, { status: 'approved', step: 2 },
                        { if: { status: 'pending' } })

// 낙관적 락 — 내가 본 값이 그대로일 때만
await sdk.dyncol.update('po', id, { status: 'approved' },
                        { if: { status: 'pending', amount: seenAmount } })
```

**상태 전이·순번 진행은 예외 없이 `if` 를 붙인다.** unique 로는 막을 수 없다 — 잠글 값이
없기 때문이다. 실측 (동시 20명 승인 시도):

| 순서 | 승인 성공 |
|---|---|
| 조회 → 상태 확인 → update | **20건** ❌ |
| `if: { status: 'pending' }` | **1건** ✅ |
| `if: { status, amount }` — 그 사이 금액 변경됨 | **0건** ✅ (전원 거부) |

마지막 줄이 낙관적 락이다. 판정 근거가 된 값(금액·수량·버전)을 `if` 에 함께 넣으면
**"판정과 실행 사이에 근거가 바뀌는"** 경합이 막힌다.

### 트랜잭션 — 복수 컬렉션 전부-아니면-전무

`transaction` 은 여러 컬렉션의 create/update/delete 를 한 트랜잭션으로 묶는다. 하나라도
실패하면 전부 되돌린다. "본문 + 이력", "주문 + 재고 차감" 처럼 따로 남으면 안 되는 쌍에 쓴다.

### 집계 — 읽기는 되고, 쓰기의 전제로 쓰지는 마라

`aggregate` 로 count·sum·avg·group_by 를 **읽을** 수 있다. 다만 **집계를 읽어 쓰기를
판정하면 경합에 뚫린다**(위 표의 첫 줄이 그 경우다). 판정은 원자 연산의 반환값이나 `if` 로 한다.

### 한계 — 코드로 우회하려 하지 마라

| 항목 | 값 | 대응 |
|---|---|---|
| 목록 1회 | **100건** | 커서로 페이지 넘김. 페이지 수 상한을 두고 남은 건은 다음 실행에 넘긴다 |
| 응답 | **6MB** | 초과분은 presigned URL |
| 기본 타임아웃 | **10초** | 대량 순회는 스케줄 핸들러로 |
| 인덱스 | containment(=) 만 GIN | 범위·부분일치·임의 정렬은 순차 스캔 — 대량 컬렉션에서 피한다 |

## 스케줄 핸들러 — 아무도 접속하지 않아도 도는 쪽

```ts
schedule('daily-close', async (sdk) => { ... })
```

- **`ctx.accountId === null`** 이다. 요청 회원이 없으므로 소유자 스코프 조회를 기대하지 마라.
- **몇 번 실행돼도 결과가 같아야 한다**(멱등). 스케줄러는 재시도할 수 있다.
  결과 레코드의 `unique` 필드가 확정 잠금 역할을 한다 — 409 를 받으면 **먼저 박힌 결과를
  읽어 그대로 따른다**(자기 계산을 밀어붙이면 중복 확정과 같아진다).
- 발송은 크레딧을 쓴다. 한 번에 처리할 건수를 **스스로 제한**하라 — 스케줄은 실패해도
  아무도 즉시 알아채지 못하는 경로라 폭주가 특히 위험하다.

## 응답 규약

- 상태 코드로 말한다: 201 생성 / 409 경합·중복 / 400 입력 / 401 로그인 필요
- 경합(409)은 **오류가 아니라 결과다.** 프론트가 "이미 처리됨"과 "서버 장애"를 구분할 수
  있어야 한다 — `SdkError.status` 를 삼키지 마라.
- 본문은 프론트가 바로 쓸 수 있는 형태로. 내부 필드명을 그대로 노출하지 않는다.

## 참조 구현 — `examples/`

경합을 실제로 막은 코드다. 비슷한 요구를 만나면 **패턴을 여기서 확인하고** 자기 도메인에
옮긴다. 그대로 복사하지는 마라 — 컬렉션 이름과 필드가 프로젝트마다 다르다.

| 파일 | 무엇을 막았나 |
|---|---|
| `examples/groupbuy.ts` | 동시 참여로 `joined` 집계가 유실·부풀는 것 · 마감 확정이 여러 번 실행되는 것 → unique 선점 + 원자 증가 반환값 판정 |
| `examples/purchase.ts` | 같은 결재 단계의 동시 처리 · **판정과 실행 사이에 금액이 바뀌어 결재선이 무력화되는 것** → `order_step_key` unique + `if` 조건부 갱신에 `amount` 를 함께 넣는 낙관적 락 |
| `examples/slot-booking.ts` | 동시 예약이 같은 마지막 자리를 통과하는 것 → `slot_account_key` unique 로 **예약을 먼저 만들고** 그 다음 정원을 올린다 (순서가 뒤바뀌면 초과된다) |

두 번째가 특히 볼 값어치가 있다. "권한 판정의 근거가 되는 값"이 판정 후에 바뀔 수 있으면
조건부 갱신의 `if` 에 그 값을 넣어야 한다 — 이건 조회해서 검사하는 방식으로는 못 막는다.

## 체크리스트 (작성 후 스스로 확인)

- [ ] `fetch` 를 직접 쓴 곳이 없다 (전부 `sdk` 경유)
- [ ] 상태 전이·순번 진행에 `if` 를 붙였다
- [ ] 집계 판정을 조회 결과로 하지 않았다 (원자 반환값 또는 `if`)
- [ ] 보상이 필요한 경로에서 **되돌리는 순서**를 정했다 (카운터 먼저, 선점 레코드 나중)
- [ ] 스케줄 핸들러가 멱등하다
- [ ] 목록 조회에 커서·상한이 있다
- [ ] `npx tsc --noEmit` 통과
