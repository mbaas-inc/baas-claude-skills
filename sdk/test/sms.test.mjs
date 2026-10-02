/** 문자 인증 로그인 transport 계약 — 발송 → 검증(가입된 번호면 로그인) → 미가입이면 가입(즉시 로그인). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  init, requestSmsLoginCode, loginWithSms, signupWithSms, checkAuth, clearAuthCache, BaasError,
} from "../dist/baas-core.esm.js";

const PROJECT = "b59f841d-bfa3-4d63-8969-70420a4298f6";
let calls;
function mockFetch(routes) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    const path = url.replace(/^.*?(?=\/account\/)/, ""); // baseUrl(상대·절대) 접두사 제거
    calls.push({ path, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
    const [status, env] = routes[path] || [404, { result: "FAIL", message: "not found" }];
    return { status, json: async () => env };
  };
}
const ok = (data) => [200, { result: "SUCCESS", data }];
const last = () => calls[calls.length - 1];
const infoCalls = () => calls.filter((c) => c.path === "/account/info").length;

test("requestSmsLoginCode — 프로젝트 스코프로 정규화된 번호를 보낸다", async () => {
  init({ projectId: PROJECT });
  mockFetch({ "/account/sms-login/request": ok({ expires_in: 300 }) });
  await requestSmsLoginCode("01012345678");
  assert.equal(last().method, "POST");
  assert.equal(last().path, "/account/sms-login/request");
  assert.deepEqual(last().body, { phone: "010-1234-5678", project_id: PROJECT });
});

test("requestSmsLoginCode — 60초 쿨다운 429 는 BaasError", async () => {
  init({ projectId: PROJECT });
  mockFetch({
    "/account/sms-login/request": [429, { result: "FAIL", errorCode: "RATE_LIMIT_EXCEEDED", message: "60초에 한 번" }],
  });
  await assert.rejects(
    () => requestSmsLoginCode("010-1234-5678"),
    (e) => e instanceof BaasError && e.status === 429 && e.errorCode === "RATE_LIMIT_EXCEEDED"
  );
});

test("requestSmsLoginCode — 문자 발송 실패는 502 BaasError (바로 재시도 가능)", async () => {
  init({ projectId: PROJECT });
  mockFetch({
    "/account/sms-login/request": [502, { result: "FAIL", errorCode: "EXTERNAL_SERVER_ERROR", message: "문자를 보내지 못했습니다. 잠시 후 다시 시도해주세요." }],
  });
  await assert.rejects(
    () => requestSmsLoginCode("010-1234-5678"),
    (e) => e instanceof BaasError && e.status === 502 && e.errorCode === "EXTERNAL_SERVER_ERROR"
  );
});

test("loginWithSms — 가입된 번호면 registered=true, 인증 캐시를 비운다", async () => {
  init({ projectId: PROJECT });
  clearAuthCache();
  mockFetch({
    "/account/info": [401, { result: "FAIL", errorCode: "UNAUTHORIZED" }],
    "/account/sms-login": ok({ verified: true, registered: true, access_token: "t", remaining_attempts: null }),
  });
  await checkAuth(); // 비로그인 상태가 캐시된다
  const r = await loginWithSms("010-1234-5678", "123456");
  assert.equal(last().path, "/account/sms-login");
  assert.deepEqual(last().body, { phone: "010-1234-5678", code: "123456", project_id: PROJECT });
  assert.equal(r.registered, true);
  await checkAuth(); // 캐시가 비워져 다시 조회한다
  assert.equal(infoCalls(), 2);
});

test("loginWithSms — 미가입이면 registered=false, 캐시는 유지한다", async () => {
  init({ projectId: PROJECT });
  clearAuthCache();
  mockFetch({
    "/account/info": [401, { result: "FAIL", errorCode: "UNAUTHORIZED" }],
    "/account/sms-login": ok({ verified: true, registered: false, access_token: null }),
  });
  await checkAuth();
  const r = await loginWithSms("010-1234-5678", "123456");
  assert.equal(r.verified, true);
  assert.equal(r.registered, false);
  await checkAuth();
  assert.equal(infoCalls(), 1);
});

test("loginWithSms — 인증번호가 틀리면 예외가 아니라 남은 횟수를 돌려준다", async () => {
  init({ projectId: PROJECT });
  mockFetch({ "/account/sms-login": ok({ verified: false, remaining_attempts: 4 }) });
  const r = await loginWithSms("010-1234-5678", "000000");
  assert.equal(r.verified, false);
  assert.equal(r.remaining_attempts, 4);
});

test("loginWithSms — 시도 초과는 BaasError(MAX_ATTEMPTS_EXCEEDED)", async () => {
  init({ projectId: PROJECT });
  mockFetch({
    "/account/sms-login": [400, { result: "FAIL", errorCode: "MAX_ATTEMPTS_EXCEEDED", message: "최대 시도 횟수를 초과했습니다." }],
  });
  await assert.rejects(
    () => loginWithSms("010-1234-5678", "123456"),
    (e) => e instanceof BaasError && e.errorCode === "MAX_ATTEMPTS_EXCEEDED"
  );
});

test("signupWithSms — 통합 가입을 SMS 방식으로, 아이디·비밀번호는 생략", async () => {
  init({ projectId: PROJECT });
  clearAuthCache();
  mockFetch({
    "/account/info": [401, { result: "FAIL", errorCode: "UNAUTHORIZED" }],
    "/account/signup/unified": ok({ id: "a1", status: "ACTIVE", access_token: "t" }),
  });
  await checkAuth();
  const r = await signupWithSms({ phone: "01012345678", name: "김신규", termsAgreed: true, privacyAgreed: true });
  assert.equal(last().path, "/account/signup/unified");
  assert.deepEqual(last().body, {
    phone: "010-1234-5678",
    name: "김신규",
    terms_agreed: true,
    privacy_agreed: true,
    identifier_type: "SMS",
    project_id: PROJECT,
  });
  assert.equal(r.access_token, "t");
  await checkAuth(); // 가입과 동시에 로그인됐으므로 다시 조회한다
  assert.equal(infoCalls(), 2);
});

test("signupWithSms — 앱이 아이디·비밀번호를 받으면 함께 보낸다", async () => {
  init({ projectId: PROJECT });
  mockFetch({ "/account/signup/unified": ok({ id: "a1", status: "ACTIVE", access_token: "t" }) });
  await signupWithSms({
    phone: "010-1234-5678", name: "김신규", termsAgreed: true, privacyAgreed: true,
    userId: "newbie", userPw: "password123",
  });
  assert.equal(last().body.user_id, "newbie");
  assert.equal(last().body.user_pw, "password123");
});

test("signupWithSms — 승인제 프로젝트는 토큰 없이 PENDING", async () => {
  init({ projectId: PROJECT });
  mockFetch({ "/account/signup/unified": ok({ id: "a1", status: "PENDING", access_token: null }) });
  const r = await signupWithSms({ phone: "010-1234-5678", name: "김신규", termsAgreed: true, privacyAgreed: true });
  assert.equal(r.status, "PENDING");
  assert.equal(r.access_token, null);
});
