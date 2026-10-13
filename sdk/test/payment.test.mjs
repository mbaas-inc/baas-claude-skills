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

/** iframe(Studio 미리보기) 안에서 띄운 위젯 — 토스 Promise 결과로 앱 프레임이 스스로 복귀 주소로 이동한다. */
function framedToss({ result, error } = {}) {
  const seen = { request: null, assigned: null };
  const ctor = () => ({
    widgets: () => ({
      setAmount: async () => {},
      renderPaymentMethods: async () => {},
      renderAgreement: async () => {},
      requestPayment: async (p) => {
        seen.request = p;
        if (error) throw error;
        return result;
      },
    }),
  });
  ctor.ANONYMOUS = "ANONYMOUS";
  globalThis.window = {
    TossPayments: ctor,
    self: { name: "app-frame" },
    top: { name: "studio" },
    location: { search: "", href: "https://preview.example/runtime/app/", assign: (u) => { seen.assigned = u; } },
  };
  globalThis.document = {};
  return seen;
}

test("iframe 안이면 복귀 주소 없이 결제하고, 결과를 토스와 같은 쿼리로 복귀 페이지에 넘긴다", async () => {
  const seen = framedToss({ result: { paymentType: "NORMAL", orderId: "pcs_abc", paymentKey: "pk_1", amount: { currency: "KRW", value: 10000 } } });
  const h = await beginPaymentWidget(SESSION, { methodsSelector: "#m", agreementSelector: "#a" });
  await h.requestPayment({ successUrl: "/deposit-success", failUrl: "/deposit-fail" });
  assert.equal(seen.request.successUrl, undefined);
  assert.equal(seen.request.failUrl, undefined);
  assert.equal(seen.request.orderId, "pcs_abc");
  const u = new URL(seen.assigned);
  assert.equal(u.pathname, "/deposit-success");
  assert.deepEqual(getPaymentRedirectResult(u.search), { ok: true, orderNo: "pcs_abc", paymentKey: "pk_1", amount: 10000 });
});

test("iframe 안 결제 실패는 실패 주소로, 사용자 취소는 리다이렉트 방식처럼 던진다", async () => {
  const failed = framedToss({ error: { code: "REJECT_CARD_COMPANY", message: "카드사 거절" } });
  const h = await beginPaymentWidget(SESSION, { methodsSelector: "#m", agreementSelector: "#a" });
  await h.requestPayment({ successUrl: "/ok", failUrl: "/fail" });
  const r = getPaymentRedirectResult(new URL(failed.assigned).search);
  assert.equal(r.ok, false);
  assert.equal(r.code, "REJECT_CARD_COMPANY");

  const cancelled = framedToss({ error: { code: "USER_CANCEL", message: "취소" } });
  const h2 = await beginPaymentWidget(SESSION, { methodsSelector: "#m", agreementSelector: "#a" });
  await assert.rejects(() => h2.requestPayment({ successUrl: "/ok", failUrl: "/fail" }), (e) => e.code === "USER_CANCEL");
  assert.equal(cancelled.assigned, null);
});

test("iframe 안 입력 오류(약관 미동의 등)는 실패 주소로 보내지 않고 던진다 — 앱이 예약을 풀지 않게", async () => {
  const seen = framedToss({ error: { code: "NEED_AGREEMENT_WITH_REQUIRED_TERMS", message: "필수 약관에 동의해주세요." } });
  const h = await beginPaymentWidget(SESSION, { methodsSelector: "#m", agreementSelector: "#a" });
  await assert.rejects(
    () => h.requestPayment({ successUrl: "/ok", failUrl: "/fail" }),
    (e) => e.code === "NEED_AGREEMENT_WITH_REQUIRED_TERMS",
  );
  assert.equal(seen.assigned, null);
});

test("iframe 이 아니면 지금처럼 복귀 주소를 넘겨 토스가 리다이렉트한다", async () => {
  const seen = framedToss({ result: undefined });
  globalThis.window.top = globalThis.window.self;
  const h = await beginPaymentWidget(SESSION, { methodsSelector: "#m", agreementSelector: "#a" });
  await h.requestPayment({ successUrl: "https://app/ok", failUrl: "https://app/fail" });
  assert.equal(seen.request.successUrl, "https://app/ok");
  assert.equal(seen.assigned, null);
});
