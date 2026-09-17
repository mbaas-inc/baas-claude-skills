---
name: baas-backend
description: "(BaaS 백엔드) 프로젝트 전용 Node 백엔드의 서비스 로직을 작성하는 가이드. 프레임워크(envelope 파싱·주입 토큰·에러 직렬화·배포·라우트 생성)는 플랫폼이 담당하고, 서버 로직을 프론트와 같은 트리(`src/services/*.ts`)에 `serverFn` 으로 작성하면 빌드가 envelope 라우트와 타입 유도 fetch 스텁을 만든다. 제공: dyncol 데이터 접근(unique·원자 증감·조건부 갱신·트랜잭션·집계), 네이티브 기능 호출. Use when: 구현 브리프의 '백엔드 연결 후보'가 채워졌을 때 — 여러 레코드의 합·개수로 판정되는 규칙(선착순·정원·재고), 상태 전이·승인 흐름, 플랫폼이 감싸지 않은 외부 연동(사내 시스템·서드파티 API). 결제와 회원 인증은 네이티브가 담당하므로 여기서 다루지 않고, 프론트 코드·화면도 다루지 않는다."
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
fi
# 의존을 먼저 깐다 — 아래 갱신이 추출을 다시 돌려 확인하는데, 워크스페이스는 복원될 때
# node_modules 가 딸려오지 않는다.
[ -d backend/node_modules ] || (cd backend && npm install --no-audit --no-fund)
# 골격은 복사본이라 저절로 갱신되지 않는다. 그대로 두면 프로젝트마다 다른 세대가 쌓인다
# (2026-09-15 실측: 21개 프로젝트에서 sdk.ts 가 7개 변종). 여기서 정본과 맞춘다.
# 방금 만든 경우엔 기준선만 기록하고 끝난다.
node "$SKILL_DIR/upgrade.mjs" --apply || exit 1
```

`npm install` 이 실패하면 **거기서 멈추고 사용자에게 알린다.** 타입 검사 없이 서버 코드를
내보내지 마라 — 이 층은 프론트와 달리 화면에서 오류가 드러나지 않는다.

`upgrade.mjs` 도 마찬가지로 **실패하면 거기서 멈춘다.** 종료 코드가 신호다:

| 코드 | 뜻 | 할 일 |
|---|---|---|
| 0 | 최신이거나 갱신 완료 | 계속 진행 |
| 2 | **충돌** — 플랫폼 파일이 프로젝트에서도 정본에서도 바뀌었다 | 출력에 나온 파일을 **그대로 인용해** 사용자에게 알리고 멈춘다 |
| 3 | **봉투 계약 버전이 바뀌었다** | 디스패처와 짝이라 배포 순서가 필요하다. 사용자에게 알리고 멈춘다 |

2·3 을 네 말로 요약하지 마라 — 무엇이 걸렸는지는 명령의 출력이 정확하고, 다음 턴에도 같은
판정이 다시 나온다. 해소되면 저절로 통과한다.

갱신은 **플랫폼 파일만** 건드린다. `src/services/*.ts`(네가 쓴 서버 로직)와 생성물은 그대로고,
갱신 뒤 추출이 자동으로 다시 돈다. 적용 중 문제가 생기면 원래대로 되돌린다.

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
}, { access: 'member' })
```

### 접근 선언은 **필수**다

두 가지를 따로 선언한다. **섞지 않는 이유**: 「매니저만 보는 목록」은 *로그인이 필요하면서
동시에 역할 판정이 필요한* 함수다. 하나의 값으로 고르게 하면 둘 중 하나를 포기하게 된다.

**① `access` — 플랫폼이 강제하는 것**

| 값 | 플랫폼이 하는 일 | 언제 |
|---|---|---|
| `public` | 아무것도 막지 않는다 | 비로그인도 봐야 하는 목록·조회 |
| `member` | 비로그인이면 **401** | 로그인이 필요한 모든 것 |
| `owner`  | 소유자가 아니면 **403** | 프로젝트 소유자 전용 |

**② `authorizes` — 본문이 추가로 판정한다는 사실**

역할·계층·자원 범위는 플랫폼이 모른다. 그 판정을 코드가 하면 `authorizes: true` 로 **드러낸다.**

```ts
// 매니저 계층 — 로그인은 플랫폼이 막고, 지점 판정은 코드가 한다
export const listBranchReservations = serverFn<Input, Result>(async (input, ctx) => {
  const staff = await findStaff(ctx)                       // 역할 조회
  if (!staff) throw new ServerFnError('권한이 없습니다', 403)
  ...
}, { access: 'member', authorizes: true })
```

**본문이 403 을 던지는데 `authorizes` 가 없으면 빌드가 선다.** 헬퍼로 뽑아도 마찬가지다 —
공통화가 은폐가 되면 안 된다. 선언만 보고는 「로그인 회원 아무나」와 구분할 수 없고, 그
상태로 감사도 리뷰도 통과해 버린다(2026-09-16 실측: 지점 담당자 전용 함수 2개가 그랬다).

`access` 의 검사는 **핸들러 앞**에서 끝난다. `member`·`owner` 를 쓰면 본문에서 그 검사를
다시 쓰지 마라 — 본문에서 하면 그 앞에 쓴 코드가 이미 돌아 중간 효과가 남는다.

#### 역할 데이터는 **누가 넣나**

`authorizes` 로 역할 판정을 만들었으면 **그 역할을 부여하는 경로까지** 같은 턴에 정한다.
역할 표만 만들고 첫 행을 넣을 방법이 없으면 **그 기능은 아무도 못 쓴다** — 화면은 멀쩡하고
보고서에는 「완성」이라고 적히는데, 실제로는 전원이 「권한이 없습니다」를 본다. 배포한 뒤에야
드러난다(2026-09-16 실측: `staff` 표를 만들었으나 넣을 경로가 없어 `/branch` 가 모두에게
막혔다).

둘 중 하나를 **고르고 사용자에게 알린다.**

| 경로 | 언제 |
|---|---|
| 앱 안 소유자 화면 | 운영자가 수시로 바꾼다 — 지점 담당자 교체, 권한 회수 |
| 프로비저닝 담당자가 CLI 로 | 초기 몇 건이고 바뀔 일이 드물다 |

```bash
# 소유자 권한 경로라 컬렉션 access 가 service 전용이어도 넣을 수 있다
baas collection record create staff \
  --data '{"account_id":"…","branch_id":"gangnam","role":"manager"}'
```

**둘 다 안 할 거면 역할 판정을 만들지 마라.** 쓸 수 없는 권한 체계는 없는 것보다 나쁘다 —
있다고 믿게 만든다.

추출기가 `backend/serverfn-access.json` 으로 전체 표면을 낸다. *"비로그인이 부를 수 있는 게
뭐지?"* 를 파일 하나로 답하기 위한 것이다.

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

프로젝트의 **동적 컬렉션은 전부 이 역할이 만든다.** 규칙과 그 규칙이 지배하는 데이터는
소유자가 하나여야 한다 — 스펙만 적어 다른 역할에 넘기면 산문으로 번역됐다가 재현되면서 어긋난다.

**스키마는 `backend/schema.json` 에 선언한다.** 명령을 하나씩 치지 마라. 추출기가 이 파일을
읽어 서버를 맞추고 TS 타입을 만든다.

```jsonc
// backend/schema.json — 스키마의 유일한 정본
{
  "collections": [
    { "name": "menu_stock", "label": "메뉴 재고",
      "access": {"read":"service","create":"service","update":"service","delete":"service"},
      "fields": [
        {"name":"menu_item_id","type":"string","required":true,"unique":true},
        {"name":"remaining","type":"number","required":true}
      ] }
  ]
}
```

`node backend/extract.mjs` 한 번이 둘을 한다:

| 산출 | 쓰임 |
|---|---|
| 서버 컬렉션 | 선언과 현재를 비교해 **차이만** 적용(멱등). 빠뜨림이 원리적으로 불가능해진다 |
| `src/types/collections.ts` | 레코드 타입. **`interface MenuStockRecord` 를 손으로 쓰지 마라** |

**레코드 타입을 직접 선언하지 마라.** 손으로 쓰면 스키마와 두 출처가 되고 조용히 갈라진다
(실측: `status` 를 `'confirmed' | 'cancelled'` 로 썼는데 스키마에는 `picked_up` 이 있었다).

```ts
import type { MenuStock } from '../types/collections'
const rec = await sdk.dyncol.get<MenuStock>('menu_stock', id)
```

**추가만 한다.** 선언에서 필드를 빼도 지워지지 않는다 — 빠뜨린 것과 지우려는 것을 구별할 수
없기 때문이다. 타입 변경·`required`/`unique` 승격은 기존 레코드에 영향을 주므로 **멈추고**
무엇을 하면 되는지 알려 준다. 그 지시를 따르거나 선언을 현재에 맞춰라.

CLI 는 `baas` 이름으로 PATH 에 있고 자격 증명도 환경에 이미 들어 있다 — **경로를 찾지 마라**
(`which`·`find /` 로 파일시스템을 훑는 것은 순수 낭비다). 문법은 이 문서가 아니라
`baas <group> <action> --help` 가 권위이므로 필요할 때 거기서 읽는다.

**규칙이 없는 컬렉션도 이 역할 소유다.** 스키마만 만들고 `serverFn` 을 하나도 쓰지 않는 것도
완결된 결과다 — 정당화하려고 없는 규칙을 지어내지 말고, 강제할 게 없다고 되돌려 보내지도 마라.
그런 컬렉션에는 **`settings.access` 를 선언하지 않는다.** 플랫폼 기본값이 적용된다 — 로그인한
회원이 컬렉션 전체를 조회하고, 각 행은 만든 사람만 수정·삭제한다. 그 기본이 주어지는 전부이고,
브리프가 그 밖의 것을 요구하면 접근 atom 을 찾을 게 아니라 규칙으로 구현한다.

**조회 범위를 좁히는 것도 규칙이다.** 「내 것만」·「승인된 뒤에만」·비로그인이 읽어야 하는 목록은
`serverFn` 이 컬렉션을 읽어 그 호출자 몫만 돌려준다. 브라우저가 받은 뒤 거르는 건 대안이 아니다.
네이티브 리소스의 설정을 따라야 하는 접근도 마찬가지다 — 생성 시점에 베껴 넣으면 운영자가 콘솔에서
바꾸는 순간 낡으므로, `serverFn` 에서 현재 값을 읽는다.

규칙이 지배하는 컬렉션은 **`service` 만 선언한다.** `public`·`member`·`owner`·`ref_owner` 를 주지 마라 —
규칙이 의존하는 데이터를 브라우저가 직접 고칠 수 있게 되어 규칙이 조용히 무력화된다
(실측: 서버가 세는 이력 컬렉션이 `update: public` 이라 한도 제한이 우회됐다).

백엔드가 만지는 컬렉션은 그 연산에 `service` 권한이 있어야 서버가 통과시킨다. 그런데
**그 선언을 당신이 하지 않는다.** 추출기가 `dyncol.<op>()` 호출부를 걸어 필요한 권한만
`backend/service-grants.json` 으로 낸다.

```
dyncol.get/list/aggregate → read     dyncol.create           → create
dyncol.update/increment   → update   dyncol.remove/restore   → delete
```

dyncol.batch  → 넘긴 키(create·update·delete)가 그대로 grant 가 된다
dyncol.transaction → 항목마다 그 항목의 collection·op 로 유도된다
```

`batch` 의 두 번째 인자와 `transaction` 의 배열은 **리터럴이어야 한다** — 항목을 볼 수
없으면 어느 컬렉션에 무슨 권한이 필요한지 유도할 수 없어 빌드가 선다.

그래서 컬렉션명을 **문자열 리터럴이나 모듈 스코프 `const`** 로 써야 한다. 이건 스타일
규칙이 아니라 권한이 유도되는 조건이다.

```ts
const JOIN = 'gb_join'                       // ✅ 풀린다
await ctx.sdk.dyncol.create(JOIN, {...})     //    → gb_join: create

await ctx.sdk.dyncol.list(`items_${kind}`)   // ✗ 빌드 실패 — 이름을 알 수 없다
```

읽기만 하는 컬렉션에 쓰기 권한이 생기지 않는다 — **코드가 부르는 연산만** 열린다.

### 공통 로직은 함수로 빼도 된다

추출기가 `serverFn` 이 부르는 헬퍼를 **따라 들어가** 그 안의 `dyncol`·`secrets` 호출까지
유도한다 — 같은 파일의 함수든, `src/services/` 안에서 import 한 함수든 마찬가지다.
로그인·운영자 판정처럼 여러 serverFn 이 같이 쓰는 것은 한 곳에 모아라.

```ts
// src/services/_shared.ts
import { ServerFnError } from './serverFn'
import type { ServerCtx } from './serverFn'

// 앱 트리는 `Sdk` 타입을 임포트할 수 없다 — 쓰는 만큼만 좁혀 선언한다.
type OperatorSdk = { dyncol: { list: (c: string, o?: unknown) => Promise<{ items: unknown[] }> } }

export async function requireOperator(sdk: OperatorSdk, ctx: ServerCtx) {
  if (ctx.isProjectOwner) return 'owner'
  const found = await sdk.dyncol.list('operators', { filter: { account_id: ctx.accountId }, limit: 1 })
  if (found.items.length) return 'delegate'          // ← operators:read 가 유도된다
  throw new ServerFnError('운영자 권한이 필요합니다.', 403)
}
```

헬퍼 안에서도 **컬렉션명 규칙은 같다** — 정적으로 풀리지 않으면 거기서 빌드가 선다.

(예전에는 추출기가 `serverFn` 본문만 봐서 헬퍼 안의 호출을 놓쳤다. 그래서 생성 코드가 같은
판정을 serverFn 마다 복붙하는 일이 있었는데, 지금은 그럴 이유가 없다.)

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
| **회원 인증**(가입·로그인·프로필) | 로그인한 회원은 주입 토큰으로 이미 도착한다. `ctx.accountId` 를 **받아 쓰고**, 인증을 다시 만들지 마라. **인가(「본인만」·「관리자만」)는 반대로 네 일이다** — 「회원 정보」 절 참조 |

### 네이티브에 이미 있는 것을 **다시 만들지 마라**

위 표는 대표 둘(결제·회원)만 적었다. 네이티브 표면은 그보다 넓고 **계속 늘어난다** —
게시판·공지·FAQ·문의·연락처·설문·예약·스토어·파일 스토리지 …

**여기에 목록을 베껴 두지 않는다.** 베낀 목록은 조용히 낡고, 그러면 에이전트가 「없다」고
믿고 다시 만든다(2026-09-16 실측: 네이티브 예약이 있는데 dyncol 로 새로 구현했고, 이유를
*"BaaS 에 예약 기능이 없어서"* 라고 적었다 — 이 문서 기준으로는 사실이었다).

> **정본은 `baas-integration-sdk` 스킬의 `features.json` 이다.** 브리프의 기능을 만들기 전에
> 거기 있는지 먼저 본다. 같은 에이전트에 붙어 있으므로 확인 비용이 없다.

#### 있으면 쓰고, 백엔드는 그 **위의 규칙**만 담당한다

커스텀 컬렉션은 네이티브 결과(주문 id·예약 id)를 `reference` 로 연결한다. 네이티브가 슬롯
선점·결제·알림을 하고, 당신은 그 위의 도메인 규칙을 쓴다.

#### 예외 — 한 트랜잭션으로 묶어야 할 때

네이티브 기능과 커스텀 데이터를 **원자적으로 함께 바꿔야** 하면 네이티브를 쓸 수 없다.
네이티브 호출은 별도 API 라 `transaction` 안에 들어가지 않기 때문이다.

예: 「예약을 만들면서 회차권 잔여를 1 깎는다. 잔여가 0이면 예약도 생기면 안 된다」 —
예약이 네이티브에 있으면 두 변경이 갈라져 중간 상태가 남는다. 이럴 때만 커스텀으로 간다.

**그리고 그 사실을 사용자에게 알린다.** 네이티브를 안 쓰면 슬롯 선점·결제 연동·운영 콘솔
같은 것을 함께 잃는데, 그건 사용자가 알고 선택할 일이다.

### serverFn 이 throw 하면 — 프레임워크가 이렇게 응답한다

이건 계약이므로 프레임워크 소스나 `node_modules` 를 열어 확인할 필요가 없다.

| 던진 것 | 응답 |
|---|---|
| `ServerFnError` (앱 트리) | **실은 상태코드 보존** + `{ error: message }` |
| `SdkError` (플랫폼이 던짐) | **원래 상태코드 보존** + `{ error, code }` — dyncol 의 409(중복·정원)가 그대로 프론트에 도착한다 |
| 그 밖의 예외 | `500` + `{ error: '서버 오류가 발생했습니다.' }`, 원문은 `requestId` 와 함께 서버 로그로만 |
| 정상 반환 | `200` + 반환한 값 그대로 (핸들러는 상태코드를 고르지 않는다) |

상태코드는 **클래스가 아니라 `status` 필드로** 판정한다 — 그래서 앱 트리가 만든
`ServerFnError` 도 백엔드의 `SdkError` 와 똑같이 보존된다.

그래서 **`try/catch` 로 409 를 500 으로 바꾸지 마라.** 경합은 결과이지 장애가 아니고,
그대로 통과시키면 프론트가 "이미 처리됨"과 "서버 장애"를 구분할 수 있다.
사용자에게 보일 실패 사유는 예외가 아니라 **정상 응답의 필드**로 돌려주는 편이 낫다
(`{ status: 'rejected', reason: 'capacity_full' }`).

돈이나 신원이 얽혔다는 이유만으로 서버 몫이 되지 않는다. 당신이 쓰는 것은 그 **주변 규칙**
(선착순 상한, 자격 검증, 클라이언트가 알면 안 되는 산식)이고, 결제·로그인 자체는 프론트가
네이티브 훅으로 호출한다.

**데이터 접근은 반드시 `ctx.sdk` 를 지난다.** `fetch` 직접 호출 금지.

## 플랫폼 프리미티브 — 성질과 실측 근거

도메인 규칙은 브리프에서 온다. 아래는 **이 플랫폼의 사실**이다.

### unique 제약 — 중복 차단, 409 는 정상 분기

컬렉션에 `unique` 필드가 선언돼 있으면 서버가 **락을 먼저 잡고** 삽입한다(확인 후 삽입이
아니다). 동시 요청 중 하나만 통과하고 나머지는 409.

- **미리 조회해 검사하지 마라** — 경합에 뚫린다. 실측: 동시 12건 → 1건만 성공.
- 409 를 `catch` 해서 **정상 분기로 다루는 것이 올바른 사용법**이다.
- unique 는 *같은 값*의 중복만 막는다. **정원 같은 상한은 막지 못한다** — 서로 다른 값이면
  전원 통과한다. 상한은 아래 `increment` 반환값으로 판정한다.

### 먼저 판정하라 — 레코드 하나인가, 묶음인가

> **두 개 이상의 레코드를 바꾸는데 중간에 실패할 수 있으면 `transaction` 이다.**

| 상황 | 쓸 것 |
|---|---|
| 조회수·좋아요처럼 **카운터 하나** | `increment` |
| 재고 차감 + 정원 확보 + 주문 생성처럼 **묶음** | **`transaction`** |

이 판정을 틀리면 조용히 망가진다. 아래가 그 실측이다.

### 보상을 손으로 짜지 마라

예전 가이드는 「증감 → 반환값 판정 → 어기면 되돌리기」였다. 결과는 맞지만 **과정이 밖에서
보인다.** 실패하는 4품목 주문을 띄우고 다른 손님 시점으로 동시 조회한 실측(2026-09-15):

| t(ms) | 계란말이 | 시금치 | 겉절이 | 정원 |
|---|---|---|---|---|
| 2039 | 12 | 12 | 4 | **2** |
| 2718 | **9** | 12 | 4 | 2 |
| 3786 | 9 | **10** | **3** | 2 |
| 4465 | 9 | **12** | **4** | 2 |
| 4833 | **12** | 12 | 4 | **2** |

- **2.8초 이상** 중간 상태가 노출된다
- t=4465 에 **부분 복구 상태**가 보인다 — 되돌리는 것 자체도 원자적이 아니다
- 그동안 다른 손님에게 **있는 재고가 품절로** 보이고, 서버가 실제로 `sold_out` 을 돌려줄 수 있다.
  최종 일관성은 지켜지지만 **그 사이의 거절은 되돌아오지 않는다**

되돌리는 코드가 틀려서가 아니다. **되돌린다는 발상 자체가 늦다.**

### 원자 증감 — 카운터 하나일 때

```ts
const after = await sdk.dyncol.increment<Post>('posts', { id }, 'views', 1)
```

대상은 `{ id }` 또는 `{ filter: { … } }` 다. 필터로 지정하면 id 를 찾는 왕복이 없고, 조회와
증감 사이에 대상이 바뀌는 틈도 없다.

경계가 필요하면 반환값으로 판정하되, **되돌릴 일이 생기면 그건 `transaction` 자리다.**

**조회해서 확인한 뒤 증가시키면 안 된다.** unique 로 선점을 먼저 해도 막히지 않는다 —
unique 는 *같은 회원*의 중복만 막으므로 서로 다른 회원들은 여전히 같은 값을 읽는다.

실측 (정원 100 · 서로 다른 회원 120명 동시):

| 순서 | 결과 |
|---|---|
| 조회 → 확인 → 증가 | 120 ❌ |
| unique 선점 → 조회·확인 → 증가 | 120 ❌ |
| **원자증가 → 반환값 판정** | **100** ✅ |

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

`transaction` 은 여러 컬렉션의 create/update/delete/**increment** 를 한 트랜잭션으로 묶는다
(최대 25 작업). 하나라도 실패하면 전부 되돌린다.

```ts
await sdk.dyncol.transaction([
  // 정원 확보 — booked 가 capacity 를 넘으면 전체가 되돌아간다
  { op: 'increment', collection: 'pickup_slots', target: { filter: { slot_id } },
    field: 'booked', by: 1,
    guard: { booked: { lte: { field: 'capacity' } } }, label: 'slot' },

  // 재고 차감 — 음수가 되면 전체가 되돌아간다
  ...lines.map((l) => ({
    op: 'increment' as const, collection: 'menu_stock',
    target: { filter: { menu_item_id: l.menuItemId } },
    field: 'remaining', by: -l.quantity,
    guard: { remaining: { gte: 0 } }, label: `stock:${l.menuItemId}`,
  })),

  { op: 'create', collection: 'orders', data: { ... }, label: 'order' },
])
```

#### 경계는 `guard` 로 **함께 보낸다**

받아서 TypeScript 로 보면 이미 늦다 — 그때는 「쓴다 → 본다 → 되돌린다」가 되고 그 사이가
남에게 보인다(위 실측). `guard` 는 증감 **후** 값을 서버에서 판정해, 어기면 전체를 되돌린다.
SQL 로 치면 `UPDATE … WHERE remaining - 2 >= 0` 의 뒷부분이다.

| 형태 | 뜻 |
|---|---|
| `{ remaining: { gte: 0 } }` | 상수와 비교 |
| `{ booked: { lte: { field: 'capacity' } } }` | **같은 레코드의 다른 필드**와 비교 |

연산자는 `gte`·`lte`·`gt`·`lt` 중 **하나만** 쓴다. 다른 컬렉션 참조나 서브쿼리는 없다.

#### 실패는 `label` 로 갈라 도메인 결과로 옮긴다

```ts
catch (e) {
  const failed = errorStatus(e) === 409 ? (errorDetail(e)?.failed as TxnFailure) : undefined
  if (failed?.label?.startsWith('stock:'))
    return { status: 'sold_out', menuItemId: failed.label.slice(6) }
  if (failed?.label === 'slot') return { status: 'slot_full' }
  throw e
}
```

**index 로 분기하지 마라** — 항목 수가 바뀌는 순간 조용히 어긋난다.

#### 대상은 `target` 으로 — id 를 먼저 찾지 마라

`{ id }` 또는 `{ filter: { … } }` 다. 밖에서 조회해 id 를 구하면 그 사이 대상이 바뀔 수 있고,
트랜잭션이 낡은 id 로 시작한다. 필터는 **정확히 1건**에 맞아야 하고, 아니면 실패한다.

`create` 는 id 를 미리 정할 수 있다 — 같은 요청에서 자식의 `reference` 값으로 쓰려면 필요하다.
잠금은 서버가 정규 순서로 걸고 **실행은 보낸 순서 그대로**라, 이 의존이 지켜진다.

**잠금 전용 컬럼이나 보상 삭제를 손으로 짜지 마라.** 그건 이 연산이 없던 시절의 우회이고,
보상을 빠뜨리면 그 레코드가 영구히 막힌다(서버 주석에 그 사고가 기록돼 있다).

같은 컬렉션 대량 처리는 `batch` 다 — **항목별 부분 성공**이고 각 목록 100건까지. 500행 중
3행이 중복이라고 497행을 되돌리면 사용자가 무엇이 문제인지 알 수 없다. 전부-아니면-전무가
필요하면 `transaction` 을 쓴다.

soft-delete 된 레코드는 `restore` 로 되살린다(인가는 `delete` 권한이다).

### 집계 — 읽기는 되고, 쓰기의 전제로 쓰지는 마라

`aggregate` 로 count·sum·avg·group_by 를 **읽을** 수 있다. 다만 **집계를 읽어 쓰기를
판정하면 경합에 뚫린다**(위 표의 첫 줄이 그 경우다). 판정은 원자 연산의 반환값이나 `if` 로 한다.

### 한계 — 코드로 우회하려 하지 마라

| 항목 | 값 | 대응 |
|---|---|---|
| 목록 1회 | **100건** | 세거나 합치려면 `aggregate`(서버가 센다). 좁히려면 `filter`. 그래도 전량이 필요하면 `offset` + `sort`(커서는 없다) |
| 응답 | **6MB** | 초과분은 presigned URL |
| 기본 타임아웃 | **10초** | 대량 순회는 페이지로 나눠 요청마다 조금씩 |
| 인덱스 | containment(=) 만 GIN | 범위·부분일치·임의 정렬은 순차 스캔 — 대량 컬렉션에서 피한다 |

### 회원 정보 — 인증은 받아 쓰고, 인가는 네 일이다

`ctx.accountId` 는 디스패처가 **쿠키 서명을 검증해** 넣은 값이다. 그 사람이 누구인지 다시
확인하지 마라 — 자체 로그인을 만들면 신원 출처가 둘이 되고 **약한 쪽이 통로가 된다.**

반면 **"그 사람이 무엇을 할 수 있는가" 는 네 일이다.** 「본인만 조회」·「관리자만 수정」 같은
규칙은 프로젝트마다 정의가 달라 플랫폼이 판정할 수 없다. 이게 이 서버가 존재하는 이유다.

```ts
const accountId = requireAccountId(ctx.accountId)   // 인증 결과를 받아 쓴다

// 인가 — 관리자 정의는 이 프로젝트가 정한다(별도 컬렉션, service 전용 접근)
const admin = await sdk.dyncol.list('admins', { filter: { account_id: accountId }, limit: 1 })
if (!admin.items.length) throw new ServerFnError('관리자만 접근할 수 있습니다.', 403)
```

#### 첫 관리자는 `ctx.isProjectOwner` 로 정한다 — 선착순으로 만들지 마라

위 예시에는 함정이 있다. **관리자 컬렉션이 비어 있을 때 누가 첫 관리자가 되는가.**
"먼저 들어온 회원을 관리자로" 로 부트스트랩하면 서비스 공개 뒤 아무나 가입해서 관리자가
된다. 실제로 그렇게 만들어진 적이 있다(2026-09-14).

`ctx.isProjectOwner` 가 그 답이다 — 디스패처가 **프로젝트 소유자인지** 판정해 넣어 준다.
소유자는 프로젝트 회원이 아니므로(통합회원) **`accountId` 는 null 인데 이 값만 true** 인
조합이 정상이다.

**두 값은 독립이다.** `accountId` 가 있으면서 이 값도 true 인 조합이 흔하다 — 사장님이 자기
서비스에 손님으로도 로그인한 상태다. `ctx.accountId` 가 있다고 해서 관리자가 아니라고 단정하면
그 순간 깨진다.

```ts
type Role = 'owner' | 'delegate'

async function requireOperator(sdk: Sdk, ctx: ServerCtx): Promise<Role> {
  if (ctx.isProjectOwner) return 'owner'            // 1순위: 플랫폼이 보증한 소유자
  const accountId = ctx.accountId                   // 2순위: 소유자가 임명한 회원
  if (accountId) {
    const found = await sdk.dyncol.list('operators', { filter: { account_id: accountId }, limit: 1 })
    if (found.items.length) return 'delegate'
  }
  throw new ServerFnError('운영자 권한이 필요합니다.', 403)
}
```

- **소유자만 할 수 있는 일**(운영자 임명·해제, 위험한 일괄 처리)은 `role === 'owner'` 로 가른다.
- 이 값은 **데이터 접근을 넓히지 않는다.** dyncol 인가는 `service` grants 만 보므로, 소유자라고
  해서 코드가 부르지 않은 컬렉션이 열리지는 않는다.

#### 관리자 화면은 **누구 권한으로 열렸는지** 보여 준다

소유자 판정의 근거는 **브라우저에 남아 있는 플랫폼 세션**이다. 그래서 기기를 함께 쓰면
(매장 공용 태블릿 등) 사장님이 로그인해 둔 브라우저에서 다른 사람이 손님으로 로그인해도
관리자 화면이 열린다. 플랫폼이 이걸 막지 않는 이유는, 막으려면 사장님이 자기 앱을 손님으로
써 보는 정상 동작까지 같이 막히기 때문이다.

대신 **상태를 화면에 드러내라.** 설명할 수 없는 화면이 사고를 만든다.

- 관리자 화면 상단에 `사장님 모드` 배지와 **누구인지**(`sdk.account.get(ctx.accountId)` 의
  이름, 없으면 "프로젝트 소유자")를 표시한다
- 손님 화면에서 관리자 화면으로 가는 링크는 `ctx.isProjectOwner` 가 true 일 때만 노출한다 —
  숨기는 게 인가는 아니지만, 안 보이면 우연히 들어가지 않는다
- 관리자 화면에 "여기서 나가기" 를 둔다. 프로젝트 로그아웃은 플랫폼 세션을 지우지 않으므로,
  로그아웃했는데 관리자 화면이 열려 있는 상태가 생긴다 — 그때 돌아갈 곳이 있어야 한다

#### 소유자가 **들어오는 길**을 반드시 만들어라

`ctx.isProjectOwner` 가 false 일 때 "소유자 계정으로 로그인해 주세요" 라고만 적으면
**할 수 없는 일을 지시하는 것**이다(실측 2026-09-17). 앱의 회원 로그인은 프로젝트 회원용이고
소유자는 통합회원이라 그 폼으로는 **원리상 로그인되지 않는다.**

소유자는 플랫폼 로그인으로 보낸 뒤 되돌아오게 한다.

```tsx
// 관리자 화면에서 ctx.isProjectOwner === false 일 때
//
// 이 값은 **UUID** 다 — AI Studio 가 `index.html` 에 프로젝트 UUID 를 심는다. 서버는 UUID 와
// 슬러그를 모두 받으므로 읽은 값을 **그대로** 넘긴다(슬러그로 바꾸려 들지 마라).
const projectRef = document.querySelector('meta[name="baas-project-id"]')?.getAttribute('content')
const consoleHost = location.hostname.endsWith('.aiapp.help') ? 'baas.aiapp.help' : 'baas.jjunmo.link'

// 라벨은 **지금 로그인 상태에 따라 갈린다.** 회원으로 로그인한 사람에게 "로그인" 이라고
// 하면 이미 한 일을 다시 하라는 말이 된다.
//
// `AuthProvider` 가 앱 루트에서 1회 조회해 둔 전역 상태를 **읽기만** 한다 — 여기서 인증을
// 다시 확인하지 않는다. 앱 루트에 Provider 가 없으면 그것부터 두라(네이티브 표면 참조).
const { isLoggedIn } = BaasSDK.useAuth()
const label = isLoggedIn ? '사장님 계정으로 전환' : '사장님 계정으로 로그인'

// `next` 는 **통째로 인코딩한다.** 안 하면 `?to=` 의 `?` 가 `next` 를 끊어 `/login` 의 별개
// 파라미터가 되고 돌아올 경로가 조용히 사라진다 — 기본값이 `/admin` 이라 겉으로는 동작해
// 보이므로 `?to=/admin/orders` 로 바꾸는 순간에야 드러난다.
const next = encodeURIComponent(`/account/enter-app/${projectRef}?to=/admin`)

<a href={`https://${consoleHost}/login?next=${next}`}>
  {label}
</a>
// 로그인 → 플랫폼이 소유권을 확인하고 **이 화면으로 되돌려보낸다**(커스텀 도메인 포함)
```

##### 라우터를 함께 고쳐라 — `RequireAuth` 로 감싸면 위 링크가 전부 무의미하다

링크를 관리자 화면 **안에** 두는 것만으로는 부족하다. **라우트 정의는 다른 파일에 있고 보통
이전 턴에 이미 작성돼 있다.** 관리자 화면을 손볼 때 라우터를 함께 열지 않으면 이게 남는다:

```tsx
// ❌ 실측된 실패(2026-09-17 출시본). 소유자는 진입 화면을 **한 번도 보지 못했다**
<Route path="/admin" element={
  <RequireAuth fallback={<Navigate to="/login" replace />}><AdminPage/></RequireAuth>
}/>

// ✅ 누구나 열 수 있게 두고, 내용은 서버가 403 으로 가린다
<Route path="/admin" element={<AdminPage/>}/>
```

소유자는 통합회원이라 `useAuth()` 의 `isLoggedIn` 이 **항상 false** 다. `RequireAuth` 는
페이지가 마운트되기도 전에 앱 자체 `/login`(회원 폼)으로 보내고, 그 폼으로는 통합회원이
원리상 로그인되지 않는다 — 진입 화면에 **도달할 방법 자체가 사라진다.** 페이지를 아무리 잘
만들어도 실행되지 않으므로, 이 결함은 화면을 보고는 못 찾고 라우터를 열어야 보인다.

축이 다르다: `RequireAuth` 는 「로그인 안 했으면 못 들어감」이고, 관리자 화면은 **로그인한
회원도 소유자가 아니면 못 보는** 화면이다. 인가는 클라이언트가 아니라 서버가 한다.

> 이 규칙은 **`baas-integration-sdk` 스킬에도 같은 내용이 있다**(「로그인 필수 화면은
> `RequireAuth` 로 감싼다」의 예외 항목). 라우트를 실제로 쓰는 것은 그쪽 스킬이므로, 한쪽만
> 고치면 두 지침이 어긋나 에이전트가 라우트를 쓰는 순간의 지침을 따른다 — 실제로 그렇게
> 어긋나 있었다(2026-09-17). 고칠 때는 **둘 다** 고쳐라.

**「관리자 콘솔로 이동」 같은 문구는 쓰지 마라.** 목적지가 다른 콘솔이 아니라 **지금 보고 있는
이 화면**이다 — 인증만 하고 제자리로 돌아온다. 떠나는 것처럼 적으면 사용자가 하던 일을
잃을까 봐 누르지 않는다.

- **앱이 자체 로그인 폼으로 통합회원을 인증하려 하지 마라.** 통합회원은 여러 프로젝트를
  소유하므로, 앱 도메인이 그 자격을 쥐면 **다른 프로젝트까지 권한이 번진다.** 앱은 보내기만 한다
- `next` 는 상대 경로다. 목적지 주소는 플랫폼이 DB 에서 만든다 — 앱이 정하면 오픈 리다이렉터가 된다
- 돌아올 경로는 `?to=/admin/orders` 처럼 **앱 안의 상대 경로**다(기본 `/admin`)
- 식별자는 `<meta name="baas-project-id">` 값을 **그대로** 넘긴다. 서버가 UUID·슬러그를 모두
  받으므로 앱이 형식을 판단할 필요가 없다

#### 이름·연락처는 `sdk.account` 로 조회한다

```ts
const buyer = await sdk.account.get(order.data.account_id)   // 없거나 타 프로젝트면 404
const page = await sdk.account.list({ limit: 50, keyword: '구매' })
```

- 이 프로젝트 소속 회원만 보인다. 스코프는 주입 토큰이 강제하므로 네가 걸지 않아도 된다
- **인가는 이 표면이 하지 않는다.** 관리자 전용 화면에 쓰려면 위 `admins` 체크를 **먼저**
  통과시킨 뒤 불러라. 플랫폼은 "같은 프로젝트 회원인가" 만 판정한다
- 노출 범위는 플랫폼이 정한다 — `id`·`user_id`·`name`·`phone`·`status`·
  `is_profile_completed`·`created_at`. 자유형 `data`·과금·운영 메모는 오지 않는다

### 소유자 화면 — 네이티브 데이터를 **전체 범위로** 읽는다

「사장님만 보는 전체 목록·관리 화면」은 흔한 요구인데, 회원 표면으로는 만들 수 없다 —
`useReservation` 은 `myBookings`(내 것)까지고, 공지·FAQ 는 조회만 열려 있다. 그래서
**서버 SDK 에만** 전체 범위 표면이 있다.

```ts
// 예약 — 전체 목록·상세·상태 변경
const page = await sdk.reservation.list({ dateFrom: '2026-09-01T00:00:00Z', limit: 50 })
await sdk.reservation.changeStatus(id, 'CONFIRMED')

// 공지·FAQ — 작성·수정 (자유·후기 게시판은 여기 없다)
await sdk.board.createPost('NOTICE', { title: '점검 안내', content: '...' })
```

- **인가는 이 표면이 하지 않는다.** `access: 'owner'` 로 선언하고 `ctx.isProjectOwner` 로
  먼저 판정한 뒤 불러라. 그 판정 없이 부르면 **전 회원이 전 예약을 본다**
- 자유·후기 게시판이 `sdk.board` 에 **없는 것은 의도다.** 회원이 자기 이름으로 쓰는 글이라
  서버가 대신 쓰면 작성자가 거짓이 되고 「작성자 본인만 수정」 이 무너진다. 그쪽은 브라우저
  SDK(`useBoard`)가 회원 자격으로 쓴다
- 공지·FAQ 의 작성자는 **프로젝트 소유자로 고정**된다. 주입 토큰에 회원 정보가 없고, 작성자를
  본문으로 받으면 서버가 신원을 caller 말에 의존하게 되기 때문이다

> 실측(2026-09-17): 이 표면이 없던 동안 「소유자만 보는 상담 신청 관리 화면」이 **만들어지지
> 못했다.** 우회로 고려된 「신청 내역을 커스텀 컬렉션에 복사해 쌓기」는 시작 시점 이후만
> 잡히고 실제 예약과 어긋나므로 **하지 마라.**

### 외부 API 자격 증명 — `sdk.secrets` 로 꺼낸다

외부 서드파티(사내 ERP·재고 시스템·서드파티 SaaS)를 부르려면 키가 필요하다. **코드에 쓰지
마라** — 하드코딩과 `process.env` 는 빌드가 막는다. 값은 플랫폼이 암호화해 보관하고, 실행
중에만 꺼낸다.

```ts
const key = await sdk.secrets.get('STOCK_API_KEY')
const res = await fetch('https://erp.example.com/stock', { headers: { 'X-API-Key': key } })
```

- 같은 요청 안에서 여러 번 불러도 **왕복은 한 번**이다(요청 단위 캐시)
- 환경변수로 주지 않는 이유: Lambda 환경변수는 `lambda:GetFunctionConfiguration` 권한이 있으면
  평문으로 조회된다. 런타임에 가져오면 평문이 함수 메모리에만, 그 요청 동안만 존재한다
- 되읽을 수 없다. 값이 맞는지 확인하려 하지 말고 **다시 넣어라**(그게 키 회전이다)

#### 무엇이 시크릿인가

> **유출되면 그 외부 서비스를 대신 호출할 수 있게 되는 값**이 시크릿이다.

| 시크릿 | 설정값(코드에 둔다) |
|---|---|
| API 키·토큰·비밀번호·서명 키·개인 키 | 엔드포인트 URL·테넌트 ID·지역 코드·공개 식별자 |

판단이 애매하면 **사용자에게 물어라.** 설정값을 시크릿으로 넣으면 코드가 괜히 복잡해지고,
반대면 유출된다.

#### 값을 받으면 바로 넣고, 어디에도 옮겨 적지 마라

사용자는 채팅으로 키를 준다 — 그 순간 값이 대화에 들어가는 것은 피할 수 없다. **거기서
멈춰야 한다.**

```bash
printf '%s' "<사용자가 준 값>" | baas secret set STOCK_API_KEY
```

- 값을 **코드·work-log·커밋 메시지·요약·응답**에 옮겨 적지 마라. 대화 한 곳에 남는 것과
  다섯 곳에 복제되는 것은 회수 가능성이 다르다
- 인자로 넘기지 마라(`baas secret set NAME <값>` 은 지원하지 않는다) — 셸 히스토리와 `ps` 에 남는다
- 사용자에게는 **이름만** 확인해 준다: "STOCK_API_KEY 로 저장했어요"

#### 시크릿은 그것을 쓰는 코드와 함께 만든다

이름만 등록해 두고 코드가 없으면 아무 일도 일어나지 않는다. 반대로 코드가 참조하는 이름이
저장소에 없으면 런타임에 404 가 난다 — 연동을 구현하면서 **같은 턴에** 등록한다.

**키가 없으면 구현을 건너뛰지 말고 먼저 요청하라.** 브리프에 외부 연동이 있으면(사내 ERP·
재고·알림 서비스 …) **키가 필요한지 가장 먼저 판단하고, 필요하면 그 사실을 알린 뒤 코드까지
만들어 둔다.** 키가 없다는 이유로 조용히 빼면 사용자는 **그 기능이 만들어진 줄 안다** —
2026-09-16 실측: 브리프가 "API 키를 받아뒀다"고 적었는데도 에이전트가 요청하지 않았고,
연동 코드도 만들지 않았으며, 그 사실을 보고하지도 않았다.

```bash
baas secret list          # 이름·시각만 나온다. 값은 나오지 않는다
```

#### 회원 값을 프로젝트 컬렉션에 **복제하지 마라**

가입 시점에 이름을 `member_profiles` 같은 컬렉션에 적어 두는 방식은 **철회됐다.** 조회
표면이 없던 동안의 우회였고 두 가지가 나쁘다.

1. **클라이언트가 쓰는 값이라 검증할 원본이 없다.** 회원이 자기 이름을 임의 문자열로 넣을
   수 있고, 관리자 화면이 그 값을 믿는다
2. 같은 개인정보가 네이티브 회원 표와 프로젝트 컬렉션 **두 곳에 사본으로** 남고, 회원이
   네이티브에서 이름을 바꾸면 사본이 낡는다

**프로젝트가 정의하는 값(등급·포인트처럼 네이티브에 없는 것)은 여전히 자기 컬렉션에 둔다.**
복제하지 말라는 것은 **네이티브가 이미 들고 있는 신원·연락처**에 한한다.

## 스케줄 핸들러 — **아직 제공되지 않는다**

마감·정산·리마인더처럼 아무도 접속하지 않아도 도는 처리는 **현재 쓸 수 없다.**

런타임에는 스케줄 봉투를 받는 자리가 있지만, 배포된 백엔드를 **주기적으로 깨우는 트리거가
구성되지 않았다**(Lambda 라 EventBridge 규칙이 따로 필요하고, 사용자 프로젝트마다 그것을
만드는 경로가 아직 없다). 그래서 스케줄을 쓰면 **코드는 멀쩡한데 한 번도 실행되지 않는다** —
가장 알아채기 어려운 실패다.

**브리프에 「매일 마감」·「정기 발송」 같은 요구가 있으면 구현하지 말고 그 사실을 먼저
알려라.** 지금 표현할 수 있는 대안은 둘이다.

- **사람이 여는 화면에서 처리한다** — 소유자가 정산 화면을 열 때 집계한다(`access: 'owner'`).
  대부분의 "마감"은 이걸로 충분하고, 누가 언제 눌렀는지도 남는다.
- **요청이 들어올 때 함께 처리한다** — 다음 예약이 생길 때 지난 것을 정리하는 식.

## 응답 규약

성공은 **값을 반환한다.** 어댑터가 그대로 200 으로 싣는다 — 핸들러에서 상태코드를 직접
고르지 않는다.

실패는 **던진다.** 앱 트리에서 상태코드를 실으려면 `serverFn.ts` 가 함께 내보내는
`ServerFnError` 를 쓴다. (`platform/sdk.ts` 의 `SdkError` 는 백엔드 트리 전용이라
`src/services/` 에서 임포트할 수 없다 — `ctx.sdk` 가 `unknown` 인 것과 같은 이유다.)

```ts
import { serverFn, ServerFnError, errorStatus, errorDetail } from './serverFn'

if (!input.id) throw new ServerFnError('id 가 필요합니다', 400)
```

| 상황 | 쓰는 것 |
|---|---|
| 입력이 틀렸다 | `throw new ServerFnError(메시지, 400)` |
| 로그인이 필요하다 | **아무것도 쓰지 않는다** — `access: 'member'` 가 핸들러 앞에서 막는다 |
| 소유자만 | **아무것도 쓰지 않는다** — `access: 'owner'` |
| 역할·범위 판정 | `authorizes: true` + 본문에서 `throw new ServerFnError(…, 403)` |
| 경합·중복 | `throw new ServerFnError(…, 409)` |

플랫폼이 던진 실패는 **클래스가 아니라 모양으로** 판정한다 — 앱 트리는 `SdkError` 로
`instanceof` 를 할 수 없다.

```ts
try { ... } catch (e) {
  if (errorStatus(e) !== 409) throw e            // 409 는 오류가 아니라 결과다
  const failed = errorDetail(e)?.failed          // 트랜잭션이 실은 구조화 정보
}
```

- 경합(409)은 **오류가 아니라 결과다.** 삼키지 마라 — 프론트가 "이미 처리됨"과 "서버 장애"를
  구분할 수 있어야 한다.
- 사용자에게 보일 실패 사유는 예외 대신 **정상 응답의 필드**로 돌려주는 편이 나을 때가 많다
  (`{ status: 'rejected', reason: 'capacity_full' }`).
- 본문은 프론트가 바로 쓸 수 있는 형태로. 내부 필드명을 그대로 노출하지 않는다.

## 참조 구현 — `examples/`

| 파일 | 무엇을 막는가 |
|---|---|
| `examples/slot-booking.ts` | 동시 예약이 같은 마지막 자리를 통과하는 것 → 한 트랜잭션에 **정원 `guard` + `slot_account_key` unique** 를 함께 보낸다 (조회로 판정하면 뚫린다) |

예제는 **CI 에서 타입체크된다**(`examples/tsconfig.json`). 저작 모델이 바뀌면 여기서 먼저
깨지므로, 가이드가 실제로 컴파일되지 않는 코드를 보여주는 일이 다시 생기지 않는다 —
2026-09-16 에 옛 모델(`route.post`)과 없는 API(`sdk.baas.sendSms`)가 그렇게 살아남아 있었다.

임포트 경로만 프로젝트와 다르다(`../boilerplate/src/serverFn`). 프로젝트에서는 `./serverFn` 이다.

## 체크리스트 (작성 후 스스로 확인)

- [ ] `fetch` 를 직접 쓴 곳이 없다 (전부 `sdk` 경유)
- [ ] 상태 전이·순번 진행에 `if` 를 붙였다
- [ ] 집계 판정을 조회 결과로 하지 않았다 (원자 반환값 또는 `if`)
- [ ] 보상이 필요한 경로에서 **되돌리는 순서**를 정했다 (카운터 먼저, 선점 레코드 나중)
- [ ] 목록 조회에 커서·상한이 있다
- [ ] **브리프의 기능이 네이티브에 있는지 먼저 확인했다** (`features.json` 이 정본)
- [ ] 네이티브를 안 쓰기로 했으면 그 이유를 사용자에게 알렸다
- [ ] 외부 연동이 있으면 **키를 먼저 요청**했다
- [ ] 본문이 403 을 던지는 함수에 `authorizes: true` 를 선언했다
- [ ] 역할 표를 만들었으면 **첫 행을 넣는 경로**를 정하고 사용자에게 알렸다
- [ ] 브리프에서 **구현하지 않은 항목**을 보고에 적었다 (스케줄처럼 아직 제공되지 않는 것 포함)
- [ ] `npx tsc --noEmit` 통과
