/** 전 기능 transport 계약 — 엔드포인트/메서드 스모크. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  init, registerRecipient, listNoticePosts, listFaqPosts, listComments, createComment,
  listSurveys, submitSurveyResponse, listTargets, createBooking, prepareOrder,
  listProducts, getStoreConfig, changePassword,
} from "../dist/baas-core.esm.js";

const PROJECT = "b59f841d-bfa3-4d63-8969-70420a4298f6";
let last;
function mockFetch() { globalThis.fetch = async (url, opts) => { last = { url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null }; return { status: 200, json: async () => ({ result: "SUCCESS", data: { items: [] } }) }; }; }

test("recipient — POST /recipient/{project}, metadata→data 직렬화", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await registerRecipient({ name: "홍", phone: "01012345678", metadata: { a: 1 } });
  assert.match(last.url, new RegExp(`/recipient/${PROJECT}$`));
  assert.equal(last.method, "POST");
  assert.equal(last.body.data, JSON.stringify({ a: 1 }));
});

test("notice/faq — 공개 정적 게시판 경로", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await listNoticePosts({ limit: 5 });
  assert.match(last.url, new RegExp(`/public/boards/notice/${PROJECT}/posts\\?`));
  await listFaqPosts();
  assert.match(last.url, new RegExp(`/public/boards/faq/${PROJECT}/posts$`));
});

test("comments — 공개 읽기 / 회원 쓰기 경로", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await listComments("p1", "oldest");
  assert.match(last.url, /\/public\/boards\/posts\/p1\/comments\?sort=oldest$/);
  await createComment("p1", { content: "hi" });
  assert.match(last.url, /\/boards\/posts\/p1\/comments$/);
  assert.equal(last.method, "POST");
});

test("survey — 목록/응답 제출", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await listSurveys({ status: "OPEN" });
  assert.match(last.url, new RegExp(`/public/survey/${PROJECT}/surveys\\?status=OPEN`));
  await submitSurveyResponse("s1", [{ q: 1 }]);
  assert.match(last.url, new RegExp(`/public/survey/${PROJECT}/surveys/s1/responses$`));
  assert.deepEqual(last.body.answers, [{ q: 1 }]);
});

test("reservation — 대상 목록 / 예약 생성", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await listTargets();
  assert.match(last.url, new RegExp(`/public/reservation/${PROJECT}/targets$`));
  await createBooking("t1", { reserved_at: "2026-07-10T10:00", form_data: {} });
  assert.match(last.url, /\/reservation\/targets\/t1\/bookings$/);
  assert.equal(last.method, "POST");
});

test("store — config/products 공개, order prepare 회원", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await getStoreConfig();
  assert.match(last.url, new RegExp(`/public/store/${PROJECT}/config$`));
  await listProducts({ category_id: "c1" });
  assert.match(last.url, new RegExp(`/public/store/${PROJECT}/products\\?category_id=c1`));
  await prepareOrder("prod1", 2);
  assert.match(last.url, /\/store\/orders\/prepare$/);
  assert.equal(last.body.product_id, "prod1");
  assert.equal(last.body.terms_agreed, true);
});

test("changePassword — POST /account/profile/change-password", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await changePassword("old", "new");
  assert.match(last.url, /\/account\/profile\/change-password$/);
  assert.equal(last.body.current_password, "old");
  assert.equal(last.body.new_password, "new");
});
