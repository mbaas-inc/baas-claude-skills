/** 가입 절차 transport 계약 — 설정/약관/이메일 인증/SNS 제공자. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  init, getAuthConfig, getSignupTerms, requestSignupEmailCode,
  confirmSignupEmailCode, getSnsProviders, signup,
} from "../dist/baas-core.esm.js";

const PROJECT = "b59f841d-bfa3-4d63-8969-70420a4298f6";
let last;
function mockFetch(data = {}) {
  globalThis.fetch = async (url, opts) => {
    last = { url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null };
    return { status: 200, json: async () => ({ result: "SUCCESS", data }) };
  };
}

test("getAuthConfig — 공개 경로, 프로젝트 설정 반환", async () => {
  init({ projectId: PROJECT });
  mockFetch({ signup_verification: "EMAIL", require_signup_approval: true });
  const config = await getAuthConfig();
  assert.match(last.url, new RegExp(`/public/projects/${PROJECT}/auth-config$`));
  assert.equal(config.signup_verification, "EMAIL");
  assert.equal(config.require_signup_approval, true);
});

test("getSignupTerms — 약관 전문 + 버전", async () => {
  init({ projectId: PROJECT });
  mockFetch({
    version: "1.0",
    terms: { title: "서비스 이용약관", content: "제1조..." },
    privacy: { title: "개인정보 처리방침", content: "제1조..." },
  });
  const t = await getSignupTerms();
  assert.match(last.url, new RegExp(`/public/projects/${PROJECT}/signup-terms$`));
  assert.equal(t.version, "1.0");
  assert.equal(t.privacy.title, "개인정보 처리방침");
});

test("requestSignupEmailCode — SIGNUP 목적으로 project 스코프 발송", async () => {
  init({ projectId: PROJECT });
  mockFetch({});
  await requestSignupEmailCode("user@example.com");
  assert.match(last.url, /\/verification\/createV2$/);
  assert.equal(last.method, "POST");
  assert.deepEqual(last.body, {
    project_id: PROJECT,
    identifier: "user@example.com",
    identifier_type: "EMAIL",
    purpose: "SIGNUP",
  });
});

test("confirmSignupEmailCode — 코드와 함께 확인", async () => {
  init({ projectId: PROJECT });
  mockFetch({ verified: true });
  const r = await confirmSignupEmailCode("user@example.com", "123456");
  assert.match(last.url, /\/verification\/verify$/);
  assert.equal(last.body.code, "123456");
  assert.equal(last.body.purpose, "SIGNUP");
  assert.equal(r.verified, true);
});

test("signup — 약관 버전이 body 로 전달된다", async () => {
  init({ projectId: PROJECT });
  mockFetch({ id: "a1" });
  await signup("user@example.com", "password123", "홍길동", "01012345678", {
    terms_agreed: true, privacy_agreed: true, terms_version: "1.0",
  });
  assert.match(last.url, /\/account\/signup-project$/);
  assert.equal(last.body.terms_version, "1.0");
  assert.equal(last.body.terms_agreed, true);
  assert.equal(last.body.phone, "010-1234-5678"); // SDK 가 전송 시 정규화
});

test("getSnsProviders — 봉투를 벗겨 배열로 반환", async () => {
  init({ projectId: PROJECT });
  mockFetch({ providers: [{ name: "naver", display_name: "네이버", login_url: "/auth/naver/login" }] });
  const providers = await getSnsProviders();
  assert.match(last.url, /\/auth\/providers$/);
  assert.ok(Array.isArray(providers));
  assert.equal(providers[0].login_url, "/auth/naver/login");
});

test("getSnsProviders — providers 누락 시 빈 배열", async () => {
  init({ projectId: PROJECT });
  mockFetch({});
  assert.deepEqual(await getSnsProviders(), []);
});
