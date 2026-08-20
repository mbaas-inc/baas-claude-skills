/**
 * 동적 컬렉션(사용자 정의 커스텀 DB) 레코드 transport — 이슈 #608.
 *
 * 데이터 프리미티브만 제공한다(범용 UI 렌더 없음). 앱은 요구에 맞춰 UI를 설계하고 이 함수들로
 * 데이터를 연결한다. 컬렉션/필드(스키마)는 baas-cli/컨트롤플레인에서 생성된 값을 전제로 한다.
 *
 * 읽기·쓰기 모두 `/collections` 한 벌을 쓴다. 인가는 컬렉션 정책(settings.access)이
 * 판정하므로 앱이 로그인 여부에 따라 경로를 고를 필요가 없다.
 * collection name 은 baas-cli 로 생성해 앱에 주입된 값을 넘긴다(프로젝트마다 다름).
 */
import { request } from "./http";

export interface DynRecord {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  account_id?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface RecordListResult {
  items: DynRecord[];
  /** 필터가 적용된 **전체** 건수(현재 페이지 건수가 아니다) */
  total_count: number;
  offset: number;
  limit: number;
  /** `includeFields: true` 일 때만 — 항목마다 반복하지 않는다 */
  fields?: FieldDefinition[] | null;
}

/** 단건 조회 결과 — `includeFields` 면 스키마가 함께 온다. */
export interface DynRecordDetail extends DynRecord {
  fields?: FieldDefinition[] | null;
}

/** 필터 DSL: { field: { op: value } }, op ∈ eq|ne|gt|gte|lt|lte|like|in|has(array) */
export interface RecordFilter {
  [field: string]: { [op: string]: string | number | boolean };
}

export interface RecordListOptions {
  offset?: number;
  /** 서버 상한 100 — 넘겨도 100 으로 잘린다 */
  limit?: number;
  /** "field" 오름차순, "-field" 내림차순 (기본 -created_at) */
  sort?: string;
  filter?: RecordFilter;
  /**
   * OR 조건. `filter`(전부 AND)와 다시 AND 로 결합된다.
   * `{ filter: { status: { eq: "게시" } }, or: { title: { like: "휴무" }, body: { like: "휴무" } } }`
   * → status=게시 AND (title~휴무 OR body~휴무). 게시판 검색이 이 형태다.
   */
  or?: RecordFilter;
  /**
   * 렌더에 필요한 스키마를 함께 받는다(`fields`). 목록은 봉투 레벨에 한 번만 실린다.
   * 화면을 처음 열 때 한 번 받아 두고 페이지 이동에는 생략하는 편이 낫다.
   */
  includeFields?: boolean;
}

/** 필드 정의 — 렌더러는 `widget` 하나만 보면 된다(서버가 확정한 값). */
export interface FieldDefinition {
  id: string;
  name: string;
  label?: string | null;
  type: string;
  required: boolean;
  indexed: boolean;
  ui?: string | null;
  unique: boolean;
  options?: Record<string, unknown> | null;
  sort_order: number;
  /**
   * 확정된 위젯. `ui` 가 있으면 그 값, 없으면 타입 기본값
   * (string→text, number→number, boolean→toggle, date→date, array→tags,
   *  enum→값 3개 이하 radio / 4개 이상 select, reference→reference).
   * 폴백 규칙을 앱에서 다시 구현하지 말 것 — 규칙이 갈라진다.
   */
  widget: string;
}

function appendFilter(p: URLSearchParams, prefix: string, filter?: RecordFilter): void {
  if (!filter) return;
  for (const field of Object.keys(filter)) {
    const ops = filter[field];
    for (const op of Object.keys(ops)) {
      p.append(`${prefix}[${field}][${op}]`, String(ops[op]));
    }
  }
}

function buildQuery(o: RecordListOptions): string {
  const p = new URLSearchParams();
  if (o.offset !== undefined) p.append("offset", String(o.offset));
  if (o.limit !== undefined) p.append("limit", String(o.limit));
  if (o.sort) p.append("sort", o.sort);
  appendFilter(p, "filter", o.filter);
  appendFilter(p, "or", o.or);
  if (o.includeFields) p.append("include", "fields");
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

// ---- 데이터 플레인 (로그인 여부 무관 — 인가는 컬렉션 정책이 판정) ----

export function listRecords(name: string, options: RecordListOptions = {}): Promise<RecordListResult> {
  return request<RecordListResult>(`/collections/${name}/records${buildQuery(options)}`);
}

export function getRecord(
  name: string,
  recordId: string,
  options: { includeFields?: boolean } = {}
): Promise<DynRecordDetail> {
  const qs = options.includeFields ? "?include=fields" : "";
  return request<DynRecordDetail>(`/collections/${name}/records/${recordId}${qs}`);
}

/**
 * 레코드 생성.
 *
 * `clientTxnId` 를 주면 **멱등**해진다 — 같은 키로 다시 보내면 새로 만들지 않고 기존 레코드를
 * 그대로 돌려준다(오류가 아니다). 폼 제출이 네트워크 실패로 재시도될 때 중복 접수를 막는 용도다.
 * 키는 제출 1회당 하나를 만들어 재시도 사이에 **유지**해야 한다(매번 새로 만들면 의미가 없다).
 */
export function createRecord(
  name: string,
  data: Record<string, unknown>,
  options: { clientTxnId?: string } = {}
): Promise<DynRecord> {
  const body: Record<string, unknown> = { data };
  if (options.clientTxnId) body.client_txn_id = options.clientTxnId;
  return request<DynRecord>(`/collections/${name}/records`, { method: "POST", body });
}

export function updateRecord(
  name: string,
  recordId: string,
  data: Record<string, unknown>
): Promise<DynRecord> {
  return request<DynRecord>(`/collections/${name}/records/${recordId}`, {
    method: "PATCH",
    body: { data },
  });
}

export function deleteRecord(name: string, recordId: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/collections/${name}/records/${recordId}`, { method: "DELETE" });
}

// ---- 부가 연산 ----

export interface AggregateBucket {
  /** `groupBy` 가 없으면 null */
  key: string | null;
  /** `op: "count"` 면 null (건수는 `count` 에 있다) */
  value: number | null;
  count: number;
}

export interface AggregateResult {
  collection: string;
  op: string;
  field?: string | null;
  group_by?: string | null;
  /** `groupBy` 유무와 무관하게 항상 배열 — 응답 형태를 분기하지 않아도 된다 */
  buckets: AggregateBucket[];
}

export type AggregateOp = "count" | "sum" | "avg" | "min" | "max";

/**
 * 집계. `count` 외에는 `field` 가 필요하고 **number 타입만** 가능하다.
 *
 * 목록과 같은 `filter`·`or` 를 함께 쓸 수 있고 인가도 목록과 같다 — 목록에서 보이지 않는
 * 행은 합계에도 들어가지 않는다.
 */
export function aggregateRecords(
  name: string,
  op: AggregateOp,
  options: { field?: string; groupBy?: string; filter?: RecordFilter; or?: RecordFilter } = {}
): Promise<AggregateResult> {
  const p = new URLSearchParams({ op });
  if (options.field) p.append("field", options.field);
  if (options.groupBy) p.append("group_by", options.groupBy);
  appendFilter(p, "filter", options.filter);
  appendFilter(p, "or", options.or);
  return request<AggregateResult>(`/collections/${name}/aggregate?${p.toString()}`);
}

/**
 * number 필드를 원자적으로 증감한다. `by` 는 음수 가능(재고 차감).
 *
 * 읽어서 더해 저장하면 동시 요청이 서로의 증가를 덮는다 — 이 함수는 서버가 DB 안에서
 * 더하므로 유실되지 않는다. 인가는 **수정 권한**을 쓴다(값을 바꾸는 연산이므로).
 */
export function incrementRecord(
  name: string,
  recordId: string,
  field: string,
  by = 1
): Promise<DynRecord> {
  return request<DynRecord>(`/collections/${name}/records/${recordId}/increment`, {
    method: "POST",
    body: { field, by },
  });
}

/**
 * 삭제된 레코드를 되살린다(삭제 취소).
 *
 * 복구 시 서버가 유일성을 다시 확인한다 — 삭제된 동안 그 값을 다른 레코드가 가져갔으면
 * 중복이 되므로 거부된다.
 */
export function restoreRecord(name: string, recordId: string): Promise<DynRecord> {
  return request<DynRecord>(`/collections/${name}/records/${recordId}/restore`, { method: "POST" });
}

export interface BatchInput {
  create?: { data: Record<string, unknown>; client_txn_id?: string }[];
  update?: { id: string; data: Record<string, unknown> }[];
  delete?: string[];
}

export interface BatchItemResult {
  index: number;
  op: "create" | "update" | "delete";
  id?: string | null;
  success: boolean;
  /** 실패 사유 — 행별 오류 표시에 그대로 쓴다 */
  error?: string | null;
}

export interface BatchResult {
  collection: string;
  results: BatchItemResult[];
  succeeded: number;
  failed: number;
}

/**
 * 배치 생성·수정·삭제. **항목별로 독립 성공/실패**한다.
 *
 * 한 항목이 실패해도 나머지는 저장되고, 실패한 항목은 `error` 에 사유가 담긴다 — 표에서
 * 여러 행을 붙여넣을 때 그 값을 행별 오류 표시에 그대로 쓸 수 있다. 목록당 100개까지.
 * 처리 순서는 생성 → 수정 → 삭제.
 *
 * 전부 아니면 전무가 필요하면 `runTransaction` 을 쓴다.
 */
export function batchRecords(name: string, input: BatchInput): Promise<BatchResult> {
  return request<BatchResult>(`/collections/${name}/records/batch`, {
    method: "POST",
    body: input,
  });
}

export interface TxnOperation {
  op: "create" | "update" | "delete";
  collection: string;
  /** create 에 주면 그 id 로 만들어진다 — 부모를 만들며 자식의 참조 값으로 쓸 수 있다 */
  id?: string;
  data?: Record<string, unknown>;
}

export interface TxnResult {
  results: { index: number; op: string; collection: string; id?: string | null }[];
  count: number;
}

/**
 * 복수 컬렉션 원자 트랜잭션 — **하나라도 실패하면 전부 되돌린다**.
 *
 * "본문 + 이력", "주문 + 재고 차감" 처럼 따로 남으면 데이터가 거짓이 되는 쌍에 쓴다.
 * 작업은 보낸 순서대로 실행되고 25개까지. 같은 컬렉션 대량 작업은 부분 성공이 필요하므로
 * `batchRecords` 를 쓴다.
 */
export function runTransaction(operations: TxnOperation[]): Promise<TxnResult> {
  return request<TxnResult>(`/collections/transaction`, {
    method: "POST",
    body: { operations },
  });
}

// ---- 공개 읽기 별칭 ----
//
// 비로그인 읽기는 `/public/collections/{projectId}/...` 라는 별도 경로였다. 이제 `/collections`
// 가 비로그인에도 열리므로 경로가 하나로 합쳐졌고, 아래는 기존 앱 코드 호환용 별칭이다.
//
// 동작 차이: 로그인 상태에서 부르면 회원 스코프로 판정된다. `read: [public, owner]` 처럼 혼합
// 정책인 컬렉션에서 공개분만 보려고 썼다면 본인 레코드까지 함께 조회된다 — filter 로 명시할 것.

/** @deprecated `listRecords` 를 쓴다 — 경로 통합으로 동작이 같다. */
export const listPublicRecords = listRecords;

/** @deprecated `getRecord` 를 쓴다 — 경로 통합으로 동작이 같다. */
export const getPublicRecord = getRecord;
