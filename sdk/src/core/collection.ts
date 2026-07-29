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

// ---- 데이터 플레인 (로그인 여부 무관 — 인가는 컬렉션 정책이 판정) ----

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
