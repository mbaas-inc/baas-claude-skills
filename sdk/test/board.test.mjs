/** 게시판 transport 계약 — 엔드포인트/메서드/project_id 주입 검증. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { init, listPosts, getPost, createPost, deletePost } from "../dist/baas-core.esm.js";

const PROJECT = "b59f841d-bfa3-4d63-8969-70420a4298f6";
const BOARD = "board-uuid-123";

function mockFetch(handler) {
  globalThis.fetch = async (url, opts) => handler(url, opts);
}
function ok(data) {
  return { status: 200, json: async () => ({ result: "SUCCESS", data }) };
}

test("listPosts — 공개 읽기 경로 + 쿼리스트링", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => { seen = url; return ok({ items: [{ id: "p1", title: "t" }], total: 1 }); });
  const res = await listPosts(BOARD, { limit: 10, keyword: "hi" });
  assert.match(seen, new RegExp(`/public/boards/${PROJECT}/${BOARD}/posts\\?`));
  assert.match(seen, /limit=10/);
  assert.match(seen, /keyword=hi/);
  assert.equal(res.items[0].id, "p1");
});

test("getPost — 공개 단건 경로(project_id 불필요)", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => { seen = url; return ok({ id: "p1", title: "t" }); });
  await getPost("p1");
  assert.match(seen, /\/public\/boards\/posts\/p1$/);
});

test("createPost — 회원 쓰기 경로 POST + body", async () => {
  init({ projectId: PROJECT });
  let seen, method, body;
  mockFetch((url, opts) => { seen = url; method = opts.method; body = JSON.parse(opts.body); return ok({ id: "new", title: "T" }); });
  const res = await createPost(BOARD, { title: "T", content: "C" });
  assert.match(seen, new RegExp(`/boards/${PROJECT}/${BOARD}/posts$`));
  assert.equal(method, "POST");
  assert.equal(body.title, "T");
  assert.equal(res.id, "new");
});

test("deletePost — DELETE 경로", async () => {
  init({ projectId: PROJECT });
  let method;
  mockFetch((_url, opts) => { method = opts.method; return ok(true); });
  const res = await deletePost("p1");
  assert.equal(method, "DELETE");
  assert.equal(res, true);
});
