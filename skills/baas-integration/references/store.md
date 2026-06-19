# BaaS Store API 스펙 — 스토어(디지털 상품 구매)

프로젝트 관리자가 콘솔에 등록한 **디지털 상품**(기프트카드·캐시·쿠폰 등)을 공개 조회하고,
프로젝트 회원이 **토스페이먼츠 결제창**으로 구매·구매확정·환불하는 API입니다.

> **구현 전 확인**: `GET /public/store/{project_id}/config`의 `store_enabled`가 `false`이거나
> 상품 목록이 빈 배열이면 판매자(셀러) 미승인/상품 미등록 상태입니다. 구매 UI를 구현하지 마세요.

> **데이터 흐름**: config 조회(store_enabled·클라이언트 키) → 상품 목록/상세 → **로그인** → 약관 동의 → **결제 준비(prepare)** → 토스 결제창 → successUrl 리다이렉트 → **결제 승인(confirm = 주문 생성)** → 내 주문 → (전달 확인 후) 구매확정
>
> **주문은 결제 완료 시점에 생성됩니다(#495).** 결제창만 열고 결제하지 않으면 주문이 만들어지지 않아 "결제대기" 잔재가 없습니다. prepare는 검증·금액 계산만, confirm이 결제 승인과 동시에 주문을 생성합니다.

> **인증 경계**: 상품·config·약관 **조회는 인증 불필요**. 주문 생성/결제 승인/내 주문/구매확정/취소는 **프로젝트 회원 로그인 필수** (이 스킬의 `account` 기능으로 가입·로그인한 사용자). 비로그인 사용자가 구매 버튼을 누르면 `account` 로그인으로 유도하세요.

---

## ⚠️ 필수 라우트 규약 (체크아웃 번들)

결제는 토스 결제창이 **페이지 리다이렉트**로 돌아오기 때문에, 생성하는 사이트에 아래 두 라우트를 **반드시** 만들어야 합니다:

| 라우트 | 역할 |
|--------|------|
| `/checkout-success` | 결제창 성공 복귀 — **`useCheckoutConfirm` 훅만 호출**해 결제 승인(confirm) 처리 후 결과 표시 |
| `/checkout-fail` | 결제창 실패/취소 복귀 — 쿼리 `code`, `message` 표시 후 상품 페이지로 유도 |

추가 규약:
- **금액은 항상 서버 기준** — 주문 생성 응답의 `amount`를 결제창에 전달하고, confirm 시에도 그 값을 그대로 사용. 클라이언트에서 금액을 계산·수정하지 마세요 (서버가 불일치 거부).
- **약관 동의 필수** — `GET /terms`의 약관을 결제 버튼 위에 표시하고, 동의 체크 전에는 주문 생성을 호출하지 마세요 (`terms_agreed=false`는 서버가 400 거부).
- 디지털 상품은 관리자가 **전달 처리**하면 주문 상세의 `fulfillment_note`에 코드/안내가 표시됩니다. 구매자가 **구매확정하면 환불 불가**임을 UI에 고지하세요.

---

## 1. 스토어 설정 (store_enabled + 토스 클라이언트 키)

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/store/{project_id}/config` |
| 인증 | 불필요 |

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    store_enabled: boolean,    // false면 구매 UI 전체 숨김
    toss_client_key: string    // 토스 결제 SDK 클라이언트 키 (공개 키)
  }
}
```

---

## 2. 상품 목록 / 상세 / 카테고리

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/store/{project_id}/products` (`?category_id=` 필터 옵션) |
| Endpoint | `GET /public/store/{project_id}/products/{product_id}` |
| Endpoint | `GET /public/store/{project_id}/categories` |
| 인증 | 불필요 |

### 상품 응답 (목록은 배열)
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,                 // product_id — 주문 생성에 사용
    product_type: "DIGITAL",    // 현재 DIGITAL만 제공
    category_id: string | null,
    name: string,
    description: string | null,
    image_url: string | null,
    price: number,              // KRW 단가
    display_order: number
  }
}
```

### 카테고리 응답
```typescript
{ result: "SUCCESS", data: Array<{ id: string, product_type: "DIGITAL", name: string, display_order: number }> }
```

> 카테고리는 필터 칩으로 표시하고, `?category_id=`로 상품 목록을 다시 조회하세요.

---

## 3. 구매 약관

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /public/store/{project_id}/terms` |
| 인증 | 불필요 |

### 응답
```typescript
{ result: "SUCCESS", data: { version: string, title: string, content: string } }
```

> `content`를 결제 버튼 위 약관 영역(접기/펼치기 권장)에 표시하고 동의 체크박스와 함께 렌더링하세요.

---

## 4. 결제 준비 (prepare, 로그인 필수)

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /store/orders/prepare` |
| 인증 | **필수** (프로젝트 회원) |

> **주문은 아직 생성되지 않습니다.** prepare는 게이팅·상품·약관 검증과 금액 계산만 하고, 토스 결제창에
> 넘길 `order_no`·`amount`·`order_name`을 발급합니다. 결제창만 열고 이탈해도 주문 잔재가 없습니다.

### 요청
```typescript
{
  product_id: string,
  quantity: number,       // 1~99
  terms_agreed: true      // 약관 동의 없으면 400
}
```

### 응답
```typescript
{
  result: "SUCCESS",
  data: {
    order_no: string,      // 토스 결제창 orderId로 그대로 사용 + confirm에 전달
    amount: number,        // 결제창 amount (서버 계산값) + confirm에 전달
    order_name: string     // 결제창 orderName
  }
}
```

> ⚠️ confirm 단계에서 `product_id`·`quantity`·`terms_agreed`를 **다시 보내야** 합니다(주문이 아직 없어
> 서버가 금액을 재계산). successUrl 리다이렉트로 상태가 사라지므로, prepare 직전 값(`product_id`,
> `quantity`, `order_no`)을 **`sessionStorage` 등에 저장**해 두었다가 success 페이지에서 사용하세요.

---

## 5. 토스 결제창 호출 (프론트)

```html
<script src="https://js.tosspayments.com/v2/standard"></script>
```

```typescript
const tossPayments = TossPayments(config.toss_client_key);
const payment = tossPayments.payment({ customerKey: TossPayments.ANONYMOUS });

await payment.requestPayment({
  method: "CARD",
  amount: { currency: "KRW", value: prepared.amount },   // prepare 응답 금액 그대로
  orderId: prepared.order_no,                            // prepare 응답 order_no 그대로
  orderName: prepared.order_name,
  successUrl: `${window.location.origin}/checkout-success`,
  failUrl: `${window.location.origin}/checkout-fail`,
});
```

> 성공 시 토스가 `successUrl`에 `paymentKey`, `orderId`, `amount` 쿼리를 붙여 리다이렉트합니다.

---

## 6. 결제 승인 = 주문 생성 (successUrl 페이지에서 호출, 로그인 필수)

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /store/orders/confirm` |
| 인증 | **필수** (prepare와 같은 회원) |

### 요청 (successUrl 쿼리 + 보관해 둔 준비 정보)
```typescript
{
  payment_key: string,   // 쿼리 paymentKey
  order_id: string,      // 쿼리 orderId (= prepare의 order_no)
  amount: number,        // 쿼리 amount (숫자 변환)
  product_id: string,    // 보관해 둔 값 (서버가 금액 재계산·검증)
  quantity: number,      // 보관해 둔 값
  terms_agreed: true
}
```

### 응답
```typescript
{ result: "SUCCESS", data: { id, order_no, status: "PAID", receipt_url: string | null, ... } }
```

> 결제 승인이 성공하면 **이 시점에 주문(PAID)이 생성**됩니다. 이중 호출은 서버가 멱등 처리합니다(같은
> `order_id`로 이미 결제된 주문이 있으면 그 주문 반환). 토스 승인 실패(4xx) 시 **주문은 생성되지 않으며**,
> 재결제는 prepare부터 다시 시작합니다.

---

## 7. 내 주문 목록 / 상세 (로그인 필수)

| 항목 | 값 |
|------|-----|
| Endpoint | `GET /store/orders/me` (`?status=&limit=&offset=`) |
| Endpoint | `GET /store/orders/{order_id}` |
| 인증 | **필수** (본인 주문만) |

### 응답 (목록은 배열)
```typescript
{
  result: "SUCCESS",
  data: {
    id: string,
    order_no: string,
    product_name: string,
    quantity: number,
    amount: number,
    status: "PAID" | "FULFILLED" | "CONFIRMED" | "CANCELED",  // 주문은 PAID로만 생성됨(결제 완료 시)
    fulfillment_note: string | null,  // FULFILLED 이후 — 전달받은 코드/안내 (강조 표시)
    receipt_url: string | null,       // 토스 영수증
    paid_at: string | null,
    fulfilled_at: string | null,
    confirmed_at: string | null,
    cancelled_at: string | null,
    cancel_reason: string | null,
    created_at: string
  }
}
```

### 상태별 UI 가이드
| status | 표시 | 가능한 액션 |
|--------|------|------------|
| `PAID` | 전달 대기 (판매자 처리 중) | 환불 |
| `FULFILLED` | 전달 완료 — `fulfillment_note` 강조 표시 | **구매확정** / 환불 |
| `CONFIRMED` | 구매 확정 (환불 불가) | - |
| `CANCELED` | 취소·환불 완료 | - |

> **구매확정 UI는 설정이 아니라 주문 상태로 구동하세요.** 프로젝트가 '자동 구매확정' 정책이면 주문이 결제 즉시 `CONFIRMED`가 되어 `FULFILLED`(구매확정 버튼 노출 상태)에 머물지 않습니다 — 즉 위 표대로 `status==FULFILLED`일 때만 구매확정 버튼을 노출하면, 설정 변경이 코드 수정 없이 자동 반영됩니다. 구매확정 페이지를 정적으로 두거나 빼지 마세요.

---

## 8. 구매확정 / 취소 (로그인 필수)

| 항목 | 값 |
|------|-----|
| Endpoint | `POST /store/orders/{order_id}/confirm` — FULFILLED 상태만 가능 |
| Endpoint | `POST /store/orders/{order_id}/cancel` — body `{ reason?: string }`, CONFIRMED 이후 불가 |
| 인증 | **필수** (본인 주문만) |

> **구매확정 전 반드시 확인 다이얼로그**: "구매확정 후에는 환불이 불가능합니다. 전달받은 상품(코드)을 확인하셨나요?"
> 취소는 전액 환불입니다(부분 환불 미지원). PAID/FULFILLED 상태에서는 토스 결제가 자동 취소됩니다.

---

## 에러 코드

| HTTP | 의미 | 처리 |
|------|------|------|
| 400 | 약관 미동의 / 금액 불일치 / 잘못된 요청 | 메시지 표시 |
| 401 | 미로그인 | `account` 로그인으로 유도 |
| 403 | 프로젝트 회원 아님 / 판매자 미승인 | 메시지 표시 |
| 404 | 상품/주문 없음 (비활성·타인 주문 포함) | 목록으로 복귀 |
| 409 | 상태 충돌 (이미 결제됨, 확정 후 환불 시도 등) | 주문 상세 새로고침 |
