/** 전 기능 transport 계약 — 엔드포인트/메서드 스모크. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  init, signup, registerRecipient, getInquiryConfig, submitInquiry, listNoticePosts, listFaqPosts, getNoticePost, getFaqPost,
  listComments, createComment,
  listSurveys, submitSurveyResponse, listTargets, createBooking, prepareOrder,
  listProducts, getStoreConfig, changePassword,
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

test("recipient — POST /recipient/{project}, metadata→data 직렬화", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await registerRecipient({ name: "홍", phone: "01012345678", metadata: { a: 1 } });
  assert.match(last.url, new RegExp(`/recipient/${PROJECT}$`));
  assert.equal(last.method, "POST");
  assert.equal(last.body.phone, "010-1234-5678"); // SDK 가 전송 시 정규화
  assert.equal(last.body.data, JSON.stringify({ a: 1 }));
});

test("inquiry — GET /public/inquiry/{project}/config", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await getInquiryConfig();
  assert.match(last.url, new RegExp(`/public/inquiry/${PROJECT}/config$`));
  assert.equal(last.method, "GET");
});

test("inquiry — POST /public/inquiry/{project}, contact 정규화 + 동의 필드 passthrough + 빈 값 생략", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await submitInquiry({
    name: "홍", contact: "01012345678", email: "", content: "문의 내용입니다",
    consent_agreed: true, consent_version: "1.0",
  });
  assert.match(last.url, new RegExp(`/public/inquiry/${PROJECT}$`));
  assert.equal(last.method, "POST");
  assert.equal(last.body.contact, "010-1234-5678");  // SDK 가 전송 시 정규화
  assert.equal("email" in last.body, false);          // 빈 문자열은 생략(서버는 "" 를 형식 오류로 봄)
  assert.equal(last.body.consent_agreed, true);
  assert.equal(last.body.consent_version, "1.0");
  assert.equal(last.body.content, "문의 내용입니다");
});

test("notice/faq — 통합 엔드포인트 경로", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await listNoticePosts({ limit: 5 });
  assert.match(last.url, new RegExp(`/public/boards/${PROJECT}/NOTICE/posts\\?`));
  await listFaqPosts();
  assert.match(last.url, new RegExp(`/public/boards/${PROJECT}/FAQ/posts$`));
});

test("notice/faq — 카테고리 필터 전달", async () => {
  // 레거시 /public/boards/faq/{pid}/posts 는 category 를 받지 않아 조용히 무시한다.
  // 통합 경로를 쓰는지까지 함께 못박는다.
  init({ projectId: PROJECT }); mockFetch();
  await listFaqPosts({ category: "결제", category_group: "카테고리" });
  assert.match(last.url, new RegExp(`/public/boards/${PROJECT}/FAQ/posts\\?`));
  const q = new URL(`http://x${last.url.slice(last.url.indexOf("/public"))}`).searchParams;
  assert.equal(q.get("category"), "결제");
  assert.equal(q.get("category_group"), "카테고리");
});

test("notice/faq 상세 — board_type 무관 공용 경로", async () => {
  init({ projectId: PROJECT }); mockFetch();
  await getNoticePost("p1");
  assert.match(last.url, /\/public\/boards\/posts\/p1$/);
  await getFaqPost("p2");
  assert.match(last.url, /\/public\/boards\/posts\/p2$/);
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
