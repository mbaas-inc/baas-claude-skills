/**
 * 동적 컬렉션(사용자 정의 커스텀 DB) 레코드 transport — 이슈 #608.
 *
 * 데이터 프리미티브만 제공한다(범용 UI 렌더 없음). 앱은 요구에 맞춰 UI를 설계하고 이 함수들로
 * 데이터를 연결한다. 컬렉션/필드(스키마)는 baas-cli/컨트롤플레인에서 생성된 값을 전제로 한다.
 *
 * 읽기는 공개(/public/collections) 또는 회원(/collections), 쓰기는 회원(/collections).
 * collection name 은 baas-cli 로 생성해 앱에 주입된 값을 넘긴다(프로젝트마다 다름).
 */
import { request } from "./http";
import { getProjectId } from "./config";

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
  total_count: number;
  offset: number;
  limit: number;
}

/** 필터 DSL: { field: { op: value } }, op ∈ eq|ne|gt|gte|lt|lte|like|in */
export interface RecordFilter {
  [field: string]: { [op: string]: string | number };
}

export interface RecordListOptions {
  offset?: number;
  limit?: number;
  /** "field" 오름차순, "-field" 내림차순 (기본 -created_at) */
  sort?: string;
  filter?: RecordFilter;
}

function buildQuery(o: RecordListOptions): string {
  const p = new URLSearchParams();
  if (o.offset !== undefined) p.append("offset", String(o.offset));
  if (o.limit !== undefined) p.append("limit", String(o.limit));
  if (o.sort) p.append("sort", o.sort);
  if (o.filter) {
    for (const field of Object.keys(o.filter)) {
      const ops = o.filter[field];
      for (const op of Object.keys(ops)) {
        p.append(`filter[${field}][${op}]`, String(ops[op]));
      }
    }
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

// ---- 회원(로그인 사용자) 데이터 플레인 ----

export function listRecords(name: string, options: RecordListOptions = {}): Promise<RecordListResult> {
  return request<RecordListResult>(`/collections/${name}/records${buildQuery(options)}`);
}

export function getRecord(name: string, recordId: string): Promise<DynRecord> {
  return request<DynRecord>(`/collections/${name}/records/${recordId}`);
}

export function createRecord(name: string, data: Record<string, unknown>): Promise<DynRecord> {
  return request<DynRecord>(`/collections/${name}/records`, { method: "POST", body: { data } });
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

// ---- 공개(비로그인) 읽기 — public_read 정책 컬렉션 전용 ----

export function listPublicRecords(
  name: string,
  options: RecordListOptions = {}
): Promise<RecordListResult> {
  return request<RecordListResult>(
    `/public/collections/${getProjectId()}/${name}/records${buildQuery(options)}`
  );
}

export function getPublicRecord(name: string, recordId: string): Promise<DynRecord> {
  return request<DynRecord>(`/public/collections/${getProjectId()}/${name}/records/${recordId}`);
}
