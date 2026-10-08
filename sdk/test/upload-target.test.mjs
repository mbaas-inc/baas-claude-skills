/** serverFn 이 발급한 업로드 대상으로 올리기 (aiapp-service#904) — 앱 회원 로그인 없이, 서명한 Content-Type 그대로. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadToTarget } from "../dist/baas-core.esm.js";

const TARGET = { upload_url: "https://s3/put?sig", content_type: "image/png", cdn_url: "https://cdn/a.png" };

test("upload_url 로 PUT — 서명한 content_type 을 그대로 쓰고 쿠키를 싣지 않는다", async () => {
  let seen;
  globalThis.fetch = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200 }; };
  const out = await uploadToTarget(TARGET, new Blob(["x"], { type: "image/jpeg" }));
  assert.equal(seen.url, "https://s3/put?sig");
  assert.equal(seen.opts.method, "PUT");
  assert.equal(seen.opts.headers["Content-Type"], "image/png");
  assert.equal(seen.opts.credentials, undefined);
  assert.equal(out.cdn_url, "https://cdn/a.png");
});

test("저장소 거절은 UPLOAD_FAILED 로 던진다", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(() => uploadToTarget(TARGET, new Blob(["x"])), (e) => e.errorCode === "UPLOAD_FAILED" && e.status === 403);
});

test("대상이 없으면 막는다", async () => {
  await assert.rejects(() => uploadToTarget({ cdn_url: "x" }, new Blob(["x"])), (e) => e.errorCode === "UPLOAD_TARGET_INVALID");
});
