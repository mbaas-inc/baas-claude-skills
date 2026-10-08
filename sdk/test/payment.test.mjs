/** 커스텀 결제 위젯 (aiapp-service#900) — serverFn 이 만든 세션으로만 위젯을 띄우고, 승인은 브라우저가 하지 않는다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { beginPaymentWidget, getPaymentRedirectResult } from "../dist/baas-core.esm.js";

const SESSION = { order_no: "pcs_abc", amount: 10000, client_key: "test_gck_x", item_name: "커트 예약금", payment_mode: "test" };

/** 토스 v2 생성자 흉내 — setAmount · requestPayment 인자를 기록한다. */
function fakeToss() {
  const seen = { clientKey: null, amount: null, request: null };
  const ctor = (clientKey) => {
    seen.clientKey = clientKey;
    return {
      widgets: () => ({
        setAmount: async (a) => { seen.amount = a; },
        renderPaymentMethods: async () => {},
        renderAgreement: async () => {},
        requestPayment: async (p) => { seen.request = p; },
      }),
    };
  };
  ctor.ANONYMOUS = "ANONYMOUS";
  globalThis.window = { TossPayments: ctor, location: { search: "" } };
  globalThis.document = {};
  return seen;
}

test("세션의 금액 · 키 · 주문번호 그대로 위젯을 띄운다", async () => {
  const seen = fakeToss();
  const h = await beginPaymentWidget(SESSION, { methodsSelector: "#m", agreementSelector: "#a" });
  assert.equal(seen.clientKey, "test_gck_x");
  assert.deepEqual(seen.amount, { currency: "KRW", value: 10000 });
  assert.equal(h.paymentMode, "test");
  await h.requestPayment({ successUrl: "https://app/ok", failUrl: "https://app/fail" });
  assert.equal(seen.request.orderId, "pcs_abc");
  assert.equal(seen.request.orderName, "커트 예약금");
});

test("세션 없이 부르면 막는다 — 주문 없는 결제를 만들지 않는다", async () => {
  fakeToss();
  await assert.rejects(
    () => beginPaymentWidget({ amount: 1000, client_key: "k" }, { methodsSelector: "#m", agreementSelector: "#a" }),
    (e) => e.errorCode === "PAYMENT_SESSION_INVALID",
  );
});

test("successUrl 쿼리 — orderNo · paymentKey · 숫자 amount", () => {
  assert.deepEqual(
    getPaymentRedirectResult("?paymentType=NORMAL&orderId=pcs_abc&paymentKey=pk_1&amount=10000"),
    { ok: true, orderNo: "pcs_abc", paymentKey: "pk_1", amount: 10000 },
  );
});

test("failUrl 쿼리 — code · message", () => {
  const r = getPaymentRedirectResult("?code=PAY_PROCESS_CANCELED&message=%EC%B7%A8%EC%86%8C&orderId=pcs_abc");
  assert.equal(r.ok, false);
  assert.equal(r.code, "PAY_PROCESS_CANCELED");
  assert.equal(r.orderNo, "pcs_abc");
});

test("토스 쿼리가 없으면 null", () => {
  assert.equal(getPaymentRedirectResult("?tab=1"), null);
});
