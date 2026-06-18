# BaaS Reservation API 스펙 — 예약(슬롯/캘린더)

운영시간 기반 **슬롯 예약** API입니다. 관리자가 콘솔에서 만든 예약 대상(Target)을 공개 조회하고,
프로젝트 회원이 날짜·시간 슬롯을 골라 예약을 신청·조회·수정·취소합니다.

> **구현 전 확인**: 이 기능은 관리자가 BaaS 콘솔에서 **예약 대상(Target)과 운영 정책·예약 폼을 사전 생성**한 경우에만 의미가 있습니다. 활성 Target이 없으면(`GET /targets`가 빈 배열) 구현하지 마세요.

> **데이터 흐름**: 대상 목록 → (대상 상세에서 운영설정·폼 확인) → 슬롯/캘린더 조회 → **로그인** → 예약 생성 → 내 예약 관리

> **인증 경계**: 목록·상세·슬롯·캘린더 **조회는 인증 불필요**. 예약 **생성/내역/수정/취소는 로그인 필수**입니다.
> 단순 로그인이 아니라 **해당 프로젝트 회원**(이 스킬의 `account` 기능으로 가입·로그인한 사용자)이어야 합니다. BaaS 통합회원이나 타 프로젝트 계정은 `FORBIDDEN`. 비로그인 사용자가 예약 버튼을 누르면 `account` 로그인으로 유도하세요.

---

## 1. 활성 예약 대상 목록

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/reservation/{project_id}/targets` |
| 인증 | 불필요 |
| 반환 | `is_active=true` Target만, `display_order` 오름차순 |

### 응답
```typescript
{
  result: "SUCCESS",
  data: Array<{
    id: string,                 // target_id — 이후 모든 예약 API path에 사용
    name: string,               // 예약 대상 이름 (예: "강남점", "원장 김영희")
    description: string | null,
    image_url: string | null,   // 카드 썸네일
    display_order: number
  }>
}
```

> **target_id**: 응답 `id`를 슬롯 조회·예약 생성 API의 `{target_id}` path에 사용합니다 (별도로 미리 알 필요 없음 — 목록에서 획득).
> 카드 그리드로 표시하고, 카드 클릭 시 상세(`## 2`)를 조회하세요.

---

## 2. 예약 대상 상세 (운영설정 + 폼 포함)

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/reservation/{project_id}/targets/{target_id}` |
| 인증 | 불필요 |

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    project_id: string,
    name: string,
    description: string | null,
    image_url: string | null,
    display_order: number,
    is_active: boolean,
    reservation_settings: ReservationSettings,       // 슬롯 그리드/검증 규칙 — 아래 "## reservation_settings 해설"
    reservation_form_schema: { fields: FormField[] }, // 예약 폼 — 아래 "## reservation_form_schema 렌더링"
    created_at: string,
    updated_at: string
  }
}
```

> `reservation_settings`와 `reservation_form_schema`는 이 화면에서 **UI를 만들기 위한 설계도**입니다. 캘린더/슬롯 picker는 `reservation_settings`로, 예약 폼은 `reservation_form_schema.fields`로 그립니다.

---

## 3. 특정 날짜의 가용 슬롯

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/reservation/{project_id}/targets/{target_id}/available-slots` |
| 인증 | 불필요 |
| 쿼리 | `date` (필수, `YYYY-MM-DD`) |

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    target_id: string,
    date: string,                  // 요청한 날짜 (YYYY-MM-DD)
    slots: Array<{
      slot: string,                // 슬롯 시작 시각 (ISO 8601, 예: "2026-06-15T10:00:00")
      remaining: number            // 남은 정원. 0이면 마감
    }>
  }
}
```

> 운영시간(`operating_hours`)을 `slot_duration_min` 단위로 쪼갠 슬롯들이 반환됩니다. 휴무 요일·이미 지난 슬롯(`min_lead_time_min` 적용)은 제외됩니다.
> `remaining === 0`인 슬롯은 **비활성(마감) 버튼**으로, `> 0`이면 선택 가능한 시간 버튼으로 렌더링하세요. `slot` 값을 그대로 예약 생성의 `reserved_at`으로 전달합니다.

---

## 4. 월간 캘린더 (날짜별 가용 수)

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/reservation/{project_id}/targets/{target_id}/available-slots/range` |
| 인증 | 불필요 |
| 쿼리 | `start`, `end` (필수, `YYYY-MM-DD`) |

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    target_id: string,
    counts: { [date: string]: number }  // {"2026-06-01": 12, "2026-06-02": 0, ...} 날짜별 잔여 슬롯 합계
  }
}
```

> 조회 범위는 **최대 60일**(초과 시 `BAD_REQUEST`). 월 캘린더에서 날짜별 잔여 슬롯 수를 뱃지로 표시하고, `0`인 날짜는 선택 불가로 처리하세요. 날짜 클릭 시 `## 3`으로 해당 날짜 슬롯을 조회합니다.

---

## 5. 예약 생성 (로그인 필요)

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /reservation/targets/{target_id}/bookings` |
| 인증 | **필수** (프로젝트 회원) |
| Content-Type | `application/json` |

### 요청
```typescript
interface ReservationCreateRequest {
  reserved_at: string;            // 슬롯 시작 시각 (## 3의 slot 값 그대로, ISO 8601)
  form_data: Record<string, any>; // reservation_form_schema.fields의 name → 값 맵
  payment_method?: 'onsite' | 'online';  // 유료 대상에서 구매자 선택. 제공방법(payment_policy.onsite/online) 중 하나.
                                          // 둘 다 제공이면 필수, 하나만 제공이면 생략 가능(서버 자동 선택)
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,                   // reservation_id
    target_id: string,
    account_id: string,
    reserved_at: string,
    form_data: Record<string, any>,
    status: "PENDING" | "CONFIRMED" | "CANCELLED" | "NO_SHOW",
    payment_method: 'onsite' | 'online' | null,  // 구매자 선택 결제방법(무료는 null)
    admin_memo: string | null,
    created_at: string,
    updated_at: string,
    cancelled_at: string | null,
    payment?: {                   // 카드(online) 결제 예약일 때만 포함, 아니면 null
      amount: number,             // 서버 확정 결제 금액(원) — 위젯·표시에 이 값 사용
      order_id: string,           // 토스 orderId (= 예약 id, 위젯·결제 승인에 그대로 사용)
      client_key: string          // 토스 결제위젯 clientKey (브라우저 공개용)
    } | null
  },
  message: "예약이 접수되었습니다." // 카드 결제 시 "예약이 접수되었습니다. 결제를 완료해 주세요."
}
```

> **status 분기**: `approval_policy.auto_confirm=true`면 즉시 `CONFIRMED`, `false`면 `PENDING`(관리자 승인 대기). 응답 `status`로 "예약 확정"/"접수됨(승인 대기)" 화면을 분기하세요.
>
> **카드(online) 결제 예약**: 응답에 `payment` 객체가 포함되고 status는 결제 완료 전까지 `PENDING`입니다. 결제(`## 9`)를 완료해야 확정으로 진행합니다. **세션은 결제 승인 시점에 생성**되므로 `payment`엔 `session_id`가 없고 `order_id`는 예약 ID입니다. **현장(onsite)·무료 예약**은 `payment`가 없으므로 status로 바로 완료 처리하세요(현장 결제는 방문 시 오프라인 수금).

---

## 6. 내 예약 목록 (로그인 필요)

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /reservation/bookings/me` |
| 인증 | **필수** (프로젝트 회원) |
| 쿼리 | `status?` (PENDING\|CONFIRMED\|CANCELLED\|NO_SHOW), `limit?` (기본 50, 1~200), `offset?` (기본 0) |

### 응답
```typescript
// ⚠️ data는 페이지네이션 래퍼가 아니라 ReservationResponse 객체의 "플랫 배열"입니다.
{
  result: "SUCCESS",
  data: Array<{
    id: string,
    target_id: string,
    account_id: string,
    reserved_at: string,
    form_data: Record<string, any>,
    status: "PENDING" | "CONFIRMED" | "CANCELLED" | "NO_SHOW",
    admin_memo: string | null,
    created_at: string,
    updated_at: string,
    cancelled_at: string | null
  }>
}
```

> `target_id`만 있고 대상 이름은 없으므로, 이름이 필요하면 `## 1`/`## 2` 응답과 클라이언트에서 매핑하세요.

---

## 7. 예약 수정 (로그인 필요)

| 항목 | 값 |
|------|-----|
| Endpoint | `PATCH /reservation/bookings/{reservation_id}` |
| 인증 | **필수** (본인 예약만) |
| Content-Type | `application/json` |

### 요청
```typescript
interface ReservationUpdateRequest {
  reserved_at?: string;            // 슬롯 변경 (변경 시 슬롯 가용성 재검증)
  form_data?: Record<string, any>; // 폼 값 변경
}
```

> `user_policy.allow_self_modify=false`인 Target은 수정 시 `FORBIDDEN`. 이 경우 수정 버튼을 숨기세요. 응답은 `## 5`와 동일한 `ReservationResponse`.

---

## 8. 예약 취소 (로그인 필요)

| 항목 | 값 |
|------|-----|
| Endpoint | `DELETE /reservation/bookings/{reservation_id}` |
| 인증 | **필수** (본인 예약만) |

### 응답
```typescript
{
  result: "SUCCESS",
  data: { /* ReservationResponse — status가 "CANCELLED"로 변경, cancelled_at 채워짐 */ },
  message: "예약이 취소되었습니다."
}
```

> `user_policy.cancel_deadline_min` 마감을 지나면 `FORBIDDEN`("취소 가능 시간이 지났습니다"). 이미 취소/종료된 예약은 `BAD_REQUEST`.

---

## 9. 예약 결제 승인 (카드 결제 예약, 로그인 필요)

구매자가 **카드(online)** 결제를 선택한 예약은 **예약 생성(`## 5`) 후 결제까지 완료해야 확정**됩니다. 예약 생성 응답의 `payment` 정보로 토스 결제위젯을 띄우고, 성공 후 아래로 승인합니다. (현장(onsite) 결제는 `payment`가 없어 이 단계를 건너뜁니다.)

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /reservation/bookings/{reservation_id}/confirm-payment` |
| 인증 | **필수** (본인 예약) |
| Content-Type | `application/json` |

### 요청
```typescript
interface ReservationConfirmPaymentRequest {
  payment_key: string;  // 토스 결제위젯 성공 콜백의 paymentKey
  order_id: string;     // 예약 생성 응답 payment.order_id 그대로
  amount: number;       // 예약 생성 응답 payment.amount 그대로 (서버가 세션 금액과 대조)
}
```

### 응답
`## 5`와 동일한 `ReservationResponse`. 결제 완료 후 `auto_confirm=true`면 `status="CONFIRMED"`, `false`면 `PENDING` 유지(관리자 승인 대기). `message: "결제가 완료되었습니다."`

### 결제 흐름
```typescript
// 1. 예약 생성 → 응답 payment 수신 (결제 필요 대상만)
const booking = await book(slot, formData);             // POST .../bookings
if (booking.payment) {
  // 2. 토스 결제위젯 (금액·orderId·clientKey 모두 서버 응답값 사용)
  const toss = await loadTossPayments(booking.payment.client_key);
  await toss.requestPayment('CARD', {
    amount: booking.payment.amount,                       // 서버 확정 금액
    orderId: booking.payment.order_id,                    // 세션 orderId
    orderName: targetName + ' 예약',
    successUrl: location.origin + '/reservation/payment-success?rid=' + booking.id,
    failUrl: location.origin + '/reservation/payment-fail',
  });
  // 3. successUrl 페이지에서 paymentKey 수신 → 승인
  // POST /reservation/bookings/{booking.id}/confirm-payment
  //   { payment_key, order_id: booking.payment.order_id, amount: booking.payment.amount }
}
```

> 금액·orderId·clientKey는 **반드시 booking 응답값을 그대로** 사용하세요(직접 만들지 말 것). 금액은 서버가 세션과 대조해 위변조 시 `BAD_REQUEST`. 무료 대상은 `payment`가 없으므로 이 단계를 건너뜁니다.

---

## reservation_settings 해설

`## 2` 응답의 `reservation_settings`는 4개 정책 묶음입니다. 슬롯 그리드와 입력 검증을 이 값으로 구성하세요.

```typescript
interface ReservationSettings {
  operating_hours: {              // 요일별 운영 시간 구간 (없는 요일/빈 배열 = 휴무)
    mon: [string, string][];      // 예: [["11:00","15:00"], ["17:00","22:00"]] (점심·저녁)
    tue: [string, string][]; wed: ...; thu: ...; fri: ...; sat: ...; sun: ...;
  };
  slot_policy: {
    slot_duration_min: number;    // 슬롯 길이(분). 시간 버튼 간격
    slot_capacity: number;        // 슬롯당 정원. remaining 계산 기준
    advance_booking_days: number; // 오늘부터 며칠 후까지 예약 가능 (캘린더 상한)
    min_lead_time_min: number;    // 지금부터 최소 N분 뒤 슬롯만 예약 가능
  };
  approval_policy: {
    auto_confirm: boolean;        // true=즉시 CONFIRMED, false=PENDING(승인 대기)
    confirmation_message: string; // 예약 완료 화면에 보여줄 안내 문구
  };
  user_policy: {
    cancel_deadline_min: number;  // 예약 N분 전까지만 취소 가능 (0=제한 없음)
    allow_self_modify: boolean;   // false면 수정 버튼 숨김
    max_active_per_user: number;  // 사용자당 동시 활성 예약 수 상한
  };
  payment_policy: {               // 예약 결제 정책 (#495 결제 빌딩블록)
    amount: number;               // 결제 금액(원). 0이면 무료. 표시 참고용 — 실제 청구액은 booking 응답 payment.amount(서버 확정)
    onsite: boolean;              // 현장 결제 제공(방문 시 오프라인 수금 — 결제 단계 없음)
    online: boolean;              // 카드 선결제 제공(예약 시 토스 결제 — 정산 계정 등록 시에만 true)
  };
}
```

| 정책 필드 | UI/동작에 미치는 영향 |
|----------|--------------------|
| `operating_hours` | 휴무 요일은 캘린더에서 비활성. 실제 슬롯은 서버가 계산(`## 3`)하므로 직접 쪼갤 필요 없음 |
| `slot_duration_min` | 시간 슬롯 버튼의 간격(표시용). 슬롯 목록은 서버 응답 사용 |
| `advance_booking_days` | 캘린더에서 선택 가능한 마지막 날짜 = 오늘 + N일 |
| `auto_confirm` | 예약 완료 후 "확정" vs "접수(승인 대기)" 문구/뱃지 분기 |
| `confirmation_message` | 예약 완료 화면 안내 문구로 그대로 노출 |
| `cancel_deadline_min` | 취소 버튼 노출/비활성 판단(클라이언트 가드 + 서버 재검증) |
| `allow_self_modify` | `false`면 수정 UI 숨김 |
| `max_active_per_user` | 한도 도달 시 예약 버튼 비활성 + 안내 |
| `payment_policy.amount` | 0보다 크고 제공방법(onsite/online)이 1개 이상이면 유료 예약. 금액 표시(원), 실제 청구액은 booking 응답 `payment.amount`(서버 확정) 사용 |
| `payment_policy.onsite` / `.online` | 구매자에게 보여줄 결제방법. **둘 다 true면 사용자가 선택**(`book`의 `paymentMethod`), 하나면 자동. `online`만 카드 결제 단계(`## 9`) 진행, `onsite`는 결제 단계 없이 방문 시 수금 |

---

## reservation_form_schema 렌더링

`## 2` 응답의 `reservation_form_schema.fields`로 **예약 폼을 동적 생성**합니다. (설문 질문 렌더링과 동일한 데이터 드리븐 방식)

```typescript
interface FormField {
  name: string;        // form_data의 key (예약 생성 시 이 name으로 값 전송)
  label: string;       // 입력 라벨
  type: 'text' | 'textarea' | 'email' | 'phone' | 'number'
      | 'select' | 'checkbox' | 'radio';
  required: boolean;
  options?: { label: string; value: string }[]; // select/radio/checkbox 전용
  min?: number;        // number 전용 최솟값
  max?: number;        // number 전용 최댓값
}
```

| type | 입력 컴포넌트 |
|------|-------------|
| `text` | `<input type="text">` |
| `textarea` | `<textarea>` |
| `email` | `<input type="email">` |
| `phone` | `<input type="tel">` (전화번호) |
| `number` | `<input type="number" min max>` |
| `select` | `<select>` + `options` |
| `radio` | 라디오 그룹 + `options` |
| `checkbox` | 체크박스 그룹 + `options` (다중 선택 → 배열) |

> 입력값을 `{ [field.name]: value }` 형태로 모아 예약 생성의 `form_data`로 전송합니다.
> `required: true` 필드는 클라이언트에서 검증하고, 서버도 누락 시 `BAD_REQUEST`로 재검증합니다.

---

## 구현 패턴

예약 UI는 고정 레이아웃이 아닙니다 — 아래 데이터→UI 매핑(레시피)을 조합해 **위저드/단일 페이지/인라인 캘린더 등 원하는 형태로** 자유롭게 구성하세요.

> **⚠️ 결제 UI는 런타임 분기로 구현하세요 (하드코딩 금지).** 결제 정책은 관리자가 콘솔에서 언제든 바꿉니다(무료↔유료, 현장/카드 토글, 셀러 등록으로 카드 개방). 따라서 **특정 설정에 맞춰 고정 UI를 만들지 말고**, 대상 상세(`## 2`)의 `payment_policy`(`amount`/`onsite`/`online`)를 **매번 읽어 조건부 렌더**하세요 — 모든 경우(무료 / 현장만 / 카드만 / 둘 다)를 코드에 열어두고 값에 따라 보여주거나 숨기면, 관리자가 금액을 0→유료로 바꾸거나 셀러를 등록해도 **재생성·재배포 없이** 즉시 반영됩니다.

### 표준 예약 흐름
```typescript
// 1. 대상 목록 → 카드 그리드
const { targets } = useReservationTargets();            // GET /targets

// 2. 대상 선택 → 상세(운영설정 + 폼)
await fetchTargetDetail(target.id);                     // GET /targets/{id}

// 3. 월 캘린더 → 날짜별 잔여 뱃지
const { monthCounts, fetchMonth } = useReservationSlots(target.id);
await fetchMonth('2026-06-01', '2026-06-30');           // counts {date: n}, 0이면 비활성

// 4. 날짜 선택 → 시간 슬롯 버튼
const { slots, fetchSlots } = useReservationSlots(target.id);
await fetchSlots('2026-06-15');                         // remaining===0 → 비활성

// 5.0 결제 방법 분기 — 런타임에 payment_policy로 결정(하드코딩 금지)
const pay = target.reservation_settings.payment_policy;
const methods = [
  pay.onsite && 'onsite',
  pay.online && 'online',
].filter(Boolean) as ('onsite' | 'online')[];
const needsPayment = pay.amount > 0 && methods.length > 0;
// needsPayment===false → 결제 UI 없음(무료). methods.length===1 → 자동. 2개 → 사용자 선택 UI 노출.
let chosen: 'onsite' | 'online' | undefined = methods.length === 1 ? methods[0] : undefined;
// (둘 다면 라디오/버튼으로 chosen 선택받기)

// 5. 로그인 체크 → 폼 작성 → 예약 생성 (유료면 chosen 전달)
if (!isLoggedIn) { /* account 로그인으로 유도 */ }
const { book } = useReservationBooking(target.id);
const booking = await book(selectedSlot, formData, needsPayment ? chosen : undefined);

// 5.5 카드(online) 선택이면 booking.payment로 토스 위젯 → 결제 승인(## 9).
//     현장(onsite)·무료는 booking.payment 없음 → 건너뜀(현장은 방문 시 오프라인 수금 안내).
if (booking.payment) {
  // loadTossPayments(booking.payment.client_key).requestPayment({ orderId, amount, ... })
  // successUrl → POST /reservation/bookings/{booking.id}/confirm-payment
}

// 6. auto_confirm 분기 (결제 완료 후 기준)
//   status === 'CONFIRMED' → "예약 확정"
//   status === 'PENDING'   → confirmation_message + "승인 대기"
```

### 레시피 요약
| 데이터 | UI |
|--------|-----|
| `## 4` range `counts` | 월 캘린더, 날짜별 잔여 뱃지(0=비활성) |
| `## 3` `slots[].remaining` | 시간 슬롯 버튼(0=마감 비활성) |
| `## 2` `reservation_form_schema.fields` | 동적 입력 폼 |
| `## 2` `approval_policy.auto_confirm` | 완료 화면 확정/접수 분기 |
| `## 2` `payment_policy.amount`/`onsite`/`online` | 유료 여부(amount>0+방법≥1)·제공 결제방법. 둘 다 제공이면 구매자 선택, online만 결제 단계(`## 9`) |
| `## 5` 응답 `payment` | 토스 위젯(client_key/order_id/amount) → `## 9` 승인 |
| 비로그인 + 예약 시도 | `account` 로그인/회원가입 유도 |

---

## 에러 코드

공통 에러 코드는 [common.md](common.md)를 참조하세요.

| 에러 코드 | HTTP | 발생 상황 | 대응 |
|----------|------|----------|------|
| `BAD_REQUEST` | 400 | 슬롯 불일치("예약 가능 슬롯이 아닙니다"), 휴무일, min_lead_time 경과, 폼 형식 오류, range 60일 초과 | 메시지 노출 + 슬롯/폼 재선택 |
| `UNAUTHORIZED` | 401 | 비로그인 상태로 예약/내역/수정/취소 호출 | `account` 로그인으로 유도 |
| `FORBIDDEN` | 403 | 프로젝트 회원 아님(통합회원/타 프로젝트), 본인 예약 아님, 수정 불가 Target, 취소 마감 경과 | 메시지 노출, 로그인 주체 안내 |
| `NOT_FOUND` | 404 | Target/예약을 찾을 수 없음(비활성·삭제 포함) | 목록으로 복귀 |
| `CONFLICT` | 409 | 정원 마감("정원이 마감되었습니다"), 동일 시간대 중복 예약, max_active 한도 초과 | 슬롯 재선택 / 한도 안내 |
| `VALIDATION_ERROR` | 400 | 요청 바디 형식 오류(reserved_at 형식 등) | detail 필드별 메시지 표시 |
