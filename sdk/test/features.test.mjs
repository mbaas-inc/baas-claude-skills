/** 전 기능 transport 계약 — 엔드포인트/메서드 스모크. (2.0: 고정 기능 제거 — 인증 계열만 남음) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  init, signup, changePassword,
} from "../dist/baas-core.esm.js";

const PROJECT = "b59f841d-bfa3-4d63-8969-70420a4298f6";
let last;
function mockFetch() { globalThis.fetch = async (url, opts) => { last = { url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null }; return { status: 200, json: async () => ({ result: "SUCCESS", data: { items: [] } }) }; }; }

test("signup — POST /account/signup-project, phone 정규화", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await signup("user@example.com", "password123", "홍길동", "01012345678");
  assert.match(last.url, /\/account\/signup-project$/);
  assert.equal(last.method, "POST");
  assert.equal(last.body.phone, "010-1234-5678"); // SDK 가 전송 시 정규화
});

test("changePassword — POST /account/profile/change-password", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await changePassword("old", "new");
  assert.match(last.url, /\/account\/profile\/change-password$/);
  assert.equal(last.body.current_password, "old");
  assert.equal(last.body.new_password, "new");
});
