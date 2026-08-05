/** phone 형식 유틸 — normalizePhone(전송 정규화) / formatPhone(입력 자동 하이픈). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, formatPhone } from "../dist/baas-core.esm.js";

test("normalizePhone — 휴대폰은 하이픈 형식으로 통일(멱등)", () => {
  const canonical = "010-1234-5678";
  // 어떤 형태로 들어와도 같은 출력
  assert.equal(normalizePhone("01012345678"), canonical);
  assert.equal(normalizePhone("010-1234-5678"), canonical); // 이미 하이픈 → 그대로(멱등)
  assert.equal(normalizePhone("010 1234 5678"), canonical);
  assert.equal(normalizePhone("010.1234.5678"), canonical);
  // 멱등: 두 번 돌려도 동일
  assert.equal(normalizePhone(normalizePhone("01012345678")), canonical);
});

test("normalizePhone — +82 국제표기 → 0 로 환원", () => {
  assert.equal(normalizePhone("+821012345678"), "010-1234-5678");
  assert.equal(normalizePhone("821012345678"), "010-1234-5678");
});

test("normalizePhone — 구 01x(3-3-4) 및 011 등 휴대폰 접두", () => {
  assert.equal(normalizePhone("0111234567"), "011-123-4567"); // 10자리
  assert.equal(normalizePhone("01712345678"), "017-1234-5678");
});

test("normalizePhone — 유선·비휴대폰·판단불가는 원본 유지", () => {
  assert.equal(normalizePhone("02-123-4567"), "02-123-4567"); // 유선 서울
  assert.equal(normalizePhone("0312345678"), "0312345678"); // 유선 지역(서버가 원본 저장)
  assert.equal(normalizePhone("hello"), "hello");
  assert.equal(normalizePhone(""), "");
});

test("formatPhone — 입력 중 자동 하이픈(부분 입력 대응)", () => {
  assert.equal(formatPhone("010"), "010");
  assert.equal(formatPhone("0101234"), "010-1234");
  assert.equal(formatPhone("01012345678"), "010-1234-5678");
  assert.equal(formatPhone("010-1234-5678"), "010-1234-5678"); // 재적용해도 동일
  assert.equal(formatPhone("010123456789999"), "010-1234-5678"); // 11자리 초과분 절삭
});
