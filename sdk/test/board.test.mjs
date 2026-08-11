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

test("listPosts — 카테고리 필터 + board_settings.categories 노출", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => {
    seen = url;
    return ok({
      items: [{ id: "p1", title: "t", categories: { 업종: ["공통"] } }],
      total: 1,
      board_settings: { categories: [{ name: "업종", values: ["공통", "조선"] }] },
    });
  });
  const res = await listPosts(BOARD, { category: "공통", category_group: "업종" });
  const q = new URL(`http://x${seen.slice(seen.indexOf("/public"))}`).searchParams;
  assert.equal(q.get("category"), "공통");
  assert.equal(q.get("category_group"), "업종");
  // 필터 UI 렌더 판단 근거 — 그룹 정의가 응답으로 내려온다
  assert.deepEqual(res.board_settings.categories, [{ name: "업종", values: ["공통", "조선"] }]);
  assert.deepEqual(res.items[0].categories, { 업종: ["공통"] });
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
