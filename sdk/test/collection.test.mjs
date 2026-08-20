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
  getPublicRecord,
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

test("listPublicRecords — 회원 경로로 통합됨(공개 전용 경로 미사용)", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => { seen = url; return ok({ items: [], total_count: 0, offset: 0, limit: 20 }); });
  await listPublicRecords("inventory", { filter: { category: { eq: "전자" } } });
  assert.match(seen, /\/collections\/inventory\/records\?/);
  assert.doesNotMatch(seen, /\/public\/collections/, "deprecated 공개 경로를 더 이상 호출하지 않아야 한다");
  assert.doesNotMatch(seen, new RegExp(PROJECT), "경로에 project_id 를 넣지 않아야 한다(host 로 해석)");
  assert.match(seen, /filter%5Bcategory%5D%5Beq%5D=/);
});

test("getPublicRecord — getRecord 와 동일 경로", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => { seen = url; return ok({ id: "r1", collection: "inventory", data: {} }); });
  await getPublicRecord("inventory", "r1");
  assert.match(seen, /\/collections\/inventory\/records\/r1$/);
  assert.doesNotMatch(seen, /\/public\/collections/);
});

// --- 동적 컬렉션 고도화 (aiapp-service #703) ---
//
// 신규 연산의 **요청 계약**을 고정한다. 서버가 이미 동작을 검증하므로 여기서는 SDK 가
// 올바른 메서드·경로·본문을 만드는지만 본다 — 그게 어긋나면 서버 테스트가 잡아주지 못한다.

import {
  aggregateRecords,
  incrementRecord,
  restoreRecord,
  batchRecords,
  runTransaction,
} from "../dist/baas-core.esm.js";

test("listRecords — or 그룹은 filter 와 별도 접두사로 나간다", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => {
    seen = url;
    return ok({ items: [], total_count: 0, offset: 0, limit: 20 });
  });
  await listRecords("notice", {
    filter: { status: { eq: "게시" } },
    or: { title: { like: "휴무" }, body: { like: "휴무" } },
  });
  const qs = decodeURIComponent(seen);
  assert.ok(qs.includes("filter[status][eq]=게시"), qs);
  assert.ok(qs.includes("or[title][like]=휴무"), qs);
  assert.ok(qs.includes("or[body][like]=휴무"), qs);
});

test("listRecords — includeFields 는 include=fields 로 나간다", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => {
    seen = url;
    return ok({ items: [], total_count: 0, offset: 0, limit: 20, fields: [] });
  });
  await listRecords("notice", { includeFields: true });
  assert.ok(decodeURIComponent(seen).includes("include=fields"), seen);
});

test("getRecord — includeFields 로 렌더 스키마를 함께 받는다", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => {
    seen = url;
    return ok({
      id: "r1", collection: "notice", data: {},
      fields: [{ id: "f1", name: "title", type: "string", required: true, indexed: false,
                 unique: false, sort_order: 0, widget: "text" }],
    });
  });
  const res = await getRecord("notice", "r1", { includeFields: true });
  assert.ok(seen.includes("include=fields"), seen);
  // 렌더러가 볼 값은 widget 하나다
  assert.equal(res.fields[0].widget, "text");
});

test("createRecord — clientTxnId 를 주면 멱등 키가 본문에 실린다", async () => {
  init({ projectId: PROJECT });
  let body;
  mockFetch((_url, opts) => {
    body = JSON.parse(opts.body);
    return ok({ id: "r1", collection: "forms", data: {} });
  });
  await createRecord("forms", { title: "접수" }, { clientTxnId: "submit-1" });
  assert.deepEqual(body, { data: { title: "접수" }, client_txn_id: "submit-1" });
});

test("createRecord — clientTxnId 없으면 키를 보내지 않는다", async () => {
  init({ projectId: PROJECT });
  let body;
  mockFetch((_url, opts) => {
    body = JSON.parse(opts.body);
    return ok({ id: "r1", collection: "forms", data: {} });
  });
  await createRecord("forms", { title: "a" });
  assert.deepEqual(Object.keys(body), ["data"]);
});

test("aggregateRecords — op/field/group_by + 필터를 쿼리로 보낸다", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => {
    seen = url;
    return ok({ collection: "order", op: "sum", buckets: [] });
  });
  await aggregateRecords("order", "sum", {
    field: "amount", groupBy: "status", filter: { paid: { eq: true } },
  });
  const qs = decodeURIComponent(seen);
  assert.ok(qs.includes("/collections/order/aggregate?"), qs);
  assert.ok(qs.includes("op=sum") && qs.includes("field=amount"), qs);
  assert.ok(qs.includes("group_by=status") && qs.includes("filter[paid][eq]=true"), qs);
});

test("aggregateRecords — count 는 field 없이도 나간다", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url) => {
    seen = url;
    return ok({ collection: "notice", op: "count", buckets: [{ key: null, value: null, count: 3 }] });
  });
  const res = await aggregateRecords("notice", "count");
  assert.ok(!decodeURIComponent(seen).includes("field="), seen);
  // group_by 가 없어도 buckets 배열이다 — 응답 형태를 분기하지 않는다
  assert.equal(res.buckets[0].count, 3);
  assert.equal(res.buckets[0].key, null);
});

test("incrementRecord — 기본 +1, 음수 허용", async () => {
  init({ projectId: PROJECT });
  const seen = [];
  mockFetch((url, opts) => {
    seen.push([url, JSON.parse(opts.body), opts.method]);
    return ok({ id: "r1", collection: "notice", data: {} });
  });
  await incrementRecord("notice", "r1", "views");
  await incrementRecord("product", "p1", "stock", -2);
  assert.ok(seen[0][0].endsWith("/collections/notice/records/r1/increment"), seen[0][0]);
  assert.equal(seen[0][2], "POST");
  assert.deepEqual(seen[0][1], { field: "views", by: 1 });
  assert.deepEqual(seen[1][1], { field: "stock", by: -2 });
});

test("restoreRecord — POST .../restore, 본문 없음", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url, opts) => {
    seen = [url, opts.method];
    return ok({ id: "r1", collection: "notice", data: {} });
  });
  await restoreRecord("notice", "r1");
  assert.ok(seen[0].endsWith("/collections/notice/records/r1/restore"), seen[0]);
  assert.equal(seen[1], "POST");
});

test("batchRecords — 세 목록을 그대로 보내고 행별 결과를 돌려준다", async () => {
  init({ projectId: PROJECT });
  let body;
  mockFetch((_url, opts) => {
    body = JSON.parse(opts.body);
    return ok({
      collection: "notice",
      results: [
        { index: 0, op: "create", id: "r1", success: true },
        { index: 1, op: "create", success: false, error: "필수 항목이 누락되었습니다: title" },
      ],
      succeeded: 1, failed: 1,
    });
  });
  const res = await batchRecords("notice", {
    create: [{ data: { title: "a" } }, { data: {} }],
    delete: ["r9"],
  });
  assert.deepEqual(body.create.length, 2);
  assert.deepEqual(body.delete, ["r9"]);
  // 실패 사유가 그대로 와야 행별 오류 표시에 쓸 수 있다
  assert.equal(res.failed, 1);
  assert.match(res.results[1].error, /필수/);
});

test("runTransaction — operations 를 감싸 보낸다(컬렉션 무관 단일 경로)", async () => {
  init({ projectId: PROJECT });
  let seen;
  mockFetch((url, opts) => {
    seen = [url, JSON.parse(opts.body)];
    return ok({ results: [], count: 2 });
  });
  await runTransaction([
    { op: "create", collection: "posts", id: "p1", data: { title: "글" } },
    { op: "create", collection: "history", data: { post_id: "p1" } },
  ]);
  assert.ok(seen[0].endsWith("/collections/transaction"), seen[0]);
  assert.equal(seen[1].operations.length, 2);
  assert.equal(seen[1].operations[0].id, "p1");
});
