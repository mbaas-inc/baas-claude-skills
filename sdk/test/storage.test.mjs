/** 파일 업로드 transport 계약 — presign 발급(POST) + S3 직접 PUT(Content-Type 일치) 검증. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { init, uploadFile } from "../dist/baas-core.esm.js";

const PROJECT = "b59f841d-bfa3-4d63-8969-70420a4298f6";

function presignOk() {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      result: "SUCCESS",
      data: {
        original: {
          presign_url: "https://s3.example.com/put-here?sig=abc",
          cdn_url: "https://proj.aiapp.help/_file/storage/images/logo.png",
          download_url: "https://proj.aiapp.help/download/images/logo.png",
          key: "storage/images/logo.png",
        },
      },
    }),
  };
}

test("uploadFile — presign 발급 후 S3 직접 PUT, cdn_url 반환", async () => {
  init({ projectId: PROJECT });
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes("/upload/presign")) return presignOk();
    return { status: 200, ok: true }; // S3 PUT
  };

  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  const res = await uploadFile(blob, { filename: "logo.png" });

  // ① presign — project_id 쿼리 + body
  assert.match(calls[0].url, new RegExp(`/upload/presign\\?project_id=${PROJECT}`));
  assert.equal(calls[0].opts.method, "POST");
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.category, "images");
  assert.equal(body.filename, "logo.png");
  assert.equal(body.content_type, "image/png");
  assert.equal(body.size, 3);

  // ② S3 직접 PUT — presign_url + Content-Type 일치
  assert.equal(calls[1].url, "https://s3.example.com/put-here?sig=abc");
  assert.equal(calls[1].opts.method, "PUT");
  assert.equal(calls[1].opts.headers["Content-Type"], "image/png");

  // 반환값
  assert.equal(res.cdn_url, "https://proj.aiapp.help/_file/storage/images/logo.png");
  assert.equal(res.key, "storage/images/logo.png");
});

test("uploadFile — 커스텀 category 전달", async () => {
  init({ projectId: PROJECT });
  let body;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/upload/presign")) {
      body = JSON.parse(opts.body);
      return presignOk();
    }
    return { status: 200, ok: true };
  };
  const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
  await uploadFile(blob, { filename: "b.jpg", category: "store" });
  assert.equal(body.category, "store");
});

test("uploadFile — S3 PUT 실패 시 throw", async () => {
  init({ projectId: PROJECT });
  globalThis.fetch = async (url) => {
    if (String(url).includes("/upload/presign")) return presignOk();
    return { status: 403, ok: false }; // S3 거부
  };
  const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
  await assert.rejects(() => uploadFile(blob, { filename: "x.png" }), /S3 PUT/);
});
