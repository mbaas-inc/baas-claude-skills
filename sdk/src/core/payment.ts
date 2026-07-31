/** 결제 공통 표면 — 결제가 들어가는 모든 흐름에서 공유(현재: 표준 구매약관 조회). 규약은 스킬 참조. */
import { request } from "./http";
import { getProjectId } from "./config";

export interface PurchaseTerms {
  version: string;
  title: string;
  content: string;
  [key: string]: unknown;
}

/** 표준 구매약관 조회(프로젝트 공통) — 결제 진입 전 content 표시 + 동의용. */
export const getPurchaseTerms = () =>
  request<PurchaseTerms>(`/public/store/${getProjectId()}/terms`);
