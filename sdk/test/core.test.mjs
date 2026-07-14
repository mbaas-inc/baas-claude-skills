/**
 * core 표면 계약 테스트 — 빌드 산출물(dist)을 직접 검증.
 * fetch 를 mock 하여 envelope 언랩·401 처리·checkAuth 캐시·SDK 버전 헤더를 확인.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  init,
  login,
  checkAuth,
  clearAuthCache,
  getProjectId,
  BaasError,
  SDK_VERSION,
} from "../dist/baas-core.esm.js";

const PROJECT = "b59f841d-bfa3-4d63-8969-70420a4298f6";

function mockFetch(handler) {
  globalThis.fetch = async (url, opts) => handler(url, opts);
}

function envelope(status, body) {
  return { status, json: async () => body };
}

test("init 로 project_id 해석, getProjectId 반환", () => {
  init({ projectId: PROJECT, baseUrl: "/aiapp-baas" });
  assert.equal(getProjectId(), PROJECT);
});

test("login 성공 — envelope.data 언랩 + SDK 버전 헤더 전송", async () => {
  init({ projectId: PROJECT });
  let sentHeaders = null;
  let sentBody = null;
  mockFetch((url, opts) => {
    sentHeaders = opts.headers;
    sentBody = JSON.parse(opts.body);
    assert.match(url, /\/account\/login$/);
    return envelope(200, { result: "SUCCESS", data: { access_token: "tok", token_type: "bearer" } });
  });

  const data = await login("u@x.com", "pw");
  assert.equal(data.access_token, "tok");
  assert.equal(sentHeaders["X-Baas-Sdk-Version"], SDK_VERSION);
  assert.equal(sentBody.project_id, PROJECT); // project_id 자동 주입
});

test("login 실패 — FAIL envelope 는 BaasError(message/errorCode)", async () => {
  init({ projectId: PROJECT });
  mockFetch(() => envelope(400, { result: "FAIL", message: "잘못된 비밀번호", errorCode: "INVALID_CREDENTIALS" }));
  await assert.rejects(
    () => login("u@x.com", "bad"),
    (e) => e instanceof BaasError && e.message === "잘못된 비밀번호" && e.errorCode === "INVALID_CREDENTIALS"
  );
});

test("checkAuth — 비로그인 401 은 에러가 아닌 { isLoggedIn:false }", async () => {
  init({ projectId: PROJECT });
  clearAuthCache();
  mockFetch(() => envelope(401, { result: "FAIL", message: "로그인을 해주세요.", errorCode: "UNAUTHORIZED" }));
  const state = await checkAuth();
  assert.equal(state.isLoggedIn, false);
  assert.equal(state.user, null);
});

test("checkAuth — 캐시로 /account/info 는 1회만 호출", async () => {
  init({ projectId: PROJECT });
  clearAuthCache();
  let calls = 0;
  mockFetch(() => {
    calls++;
    return envelope(200, { result: "SUCCESS", data: { id: "1", user_id: "u", name: "n" } });
  });
  const [a, b, c] = await Promise.all([checkAuth(), checkAuth(), checkAuth()]);
  assert.equal(calls, 1); // 동시 3회 → 실제 요청 1회
  assert.equal(a.isLoggedIn, true);
  assert.equal(b.user.name, "n");
  assert.equal(c.isLoggedIn, true);
});

test("checkAuth force — 캐시 무효화 후 재조회", async () => {
  init({ projectId: PROJECT });
  clearAuthCache();
  let calls = 0;
  mockFetch(() => {
    calls++;
    return envelope(200, { result: "SUCCESS", data: { id: "1", user_id: "u", name: "n" } });
  });
  await checkAuth();
  await checkAuth({ force: true });
  assert.equal(calls, 2);
});

test("checkAuth — 네트워크/500 오류는 삼키지 않고 throw", async () => {
  init({ projectId: PROJECT });
  clearAuthCache();
  mockFetch(() => envelope(500, { result: "FAIL", message: "서버 오류" }));
  await assert.rejects(() => checkAuth(), (e) => e instanceof BaasError && e.status === 500);
});
