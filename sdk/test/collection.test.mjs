/** 동적 컬렉션 레코드 transport 계약 (이슈 #608) — 엔드포인트/메서드/필터 DSL/project_id 검증. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  init,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  listPublicRecords,
} from "../dist/baas-core.esm.js";

const PROJECT = "b59f841d-bfa3-4d63-8969-70420a4298f6";

function mockFetch(handler) {
  globalThis.fetch = async (url, opts) => handler(url, opts);
}
function ok(data) {
  return { status: 200, json: async () => ({ result: "SUCCESS", data }) };
}

test("listRecords — 회원 경로 + 필터 DSL 쿼리스트링", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => {
    seen = url;
    return ok({ items: [{ id: "r1", collection: "inventory", data: {} }], total_count: 1, offset: 0, limit: 20 });
  });
  const res = await listRecords("inventory", {
    limit: 20,
    sort: "-created_at",
    filter: { quantity: { lt: 5 } },
  });
  assert.match(seen, /\/collections\/inventory\/records\?/);
  assert.match(seen, /limit=20/);
  assert.match(seen, /sort=-created_at/);
  assert.match(seen, /filter%5Bquantity%5D%5Blt%5D=5/); // filter[quantity][lt]=5 (URL 인코딩)
  assert.equal(res.items[0].id, "r1");
});

test("getRecord — 회원 단건 경로", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => { seen = url; return ok({ id: "r1", collection: "inventory", data: {} }); });
  await getRecord("inventory", "r1");
  assert.match(seen, /\/collections\/inventory\/records\/r1$/);
});

test("createRecord — POST + { data } 바디", async () => {
  init({ projectId: PROJECT });
  let seen, method, body;
  mockFetch((url, opts) => { seen = url; method = opts.method; body = JSON.parse(opts.body); return ok({ id: "new", collection: "inventory", data: {} }); });
  const res = await createRecord("inventory", { item_name: "노트북", quantity: 3 });
  assert.match(seen, /\/collections\/inventory\/records$/);
  assert.equal(method, "POST");
  assert.equal(body.data.item_name, "노트북");
  assert.equal(res.id, "new");
});

test("updateRecord — PATCH + { data } 바디", async () => {
  init({ projectId: PROJECT });
  let method, body;
  mockFetch((_url, opts) => { method = opts.method; body = JSON.parse(opts.body); return ok({ id: "r1", collection: "inventory", data: {} }); });
  await updateRecord("inventory", "r1", { quantity: 10 });
  assert.equal(method, "PATCH");
  assert.equal(body.data.quantity, 10);
});

test("deleteRecord — DELETE 경로", async () => {
  init({ projectId: PROJECT });
  let method;
  mockFetch((_url, opts) => { method = opts.method; return ok({ id: "r1" }); });
  await deleteRecord("inventory", "r1");
  assert.equal(method, "DELETE");
});

test("listPublicRecords — 공개 경로에 project_id 주입", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => { seen = url; return ok({ items: [], total_count: 0, offset: 0, limit: 20 }); });
  await listPublicRecords("inventory", { filter: { category: { eq: "전자" } } });
  assert.match(seen, new RegExp(`/public/collections/${PROJECT}/inventory/records\\?`));
  assert.match(seen, /filter%5Bcategory%5D%5Beq%5D=/);
});
