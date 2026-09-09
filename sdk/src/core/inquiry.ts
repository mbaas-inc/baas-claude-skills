/** 문의하기(Contact us) — 비로그인 접수. GET /public/inquiry/{projectId}/config · POST /public/inquiry/{projectId} */
import { request } from "./http";
import { getProjectId } from "./config";
import { normalizePhone } from "./phone";

/** 소유자 설정 + 동의 문구(서버 원장). 화면 진입 시 읽어 분기한다 — 값을 코드에 박지 않는다. */
export interface InquiryConfig {
  enabled: boolean;
  disabled_message: string;
  complete_message: string;
  consent_version: string;
  consent_label: string;
  /** 여러 줄("\n" 구분) — split("\n") 후 줄 단위로 렌더 */
  consent_body: string;
  [key: string]: unknown;
}

/** wire 키 그대로(snake_case) — signup 의 terms_version 과 같은 관례. */
export interface InquiryInput {
  name: string;
  /** contact·email 중 하나 이상 필수(서버 400). 빈 문자열은 SDK 가 전송에서 생략한다. */
  contact?: string | null;
  email?: string | null;
  content: string;
  consent_agreed: boolean;
  /** getInquiryConfig().consent_version 을 그대로 되돌려 보낸다. */
  consent_version: string;
}

export interface InquiryResult {
  accepted: boolean;
  /** "접수되었습니다" · "이미 접수되었습니다"(5분 내 중복, 저장 안 함) — 둘 다 성공. 그대로 노출. */
  message: string;
  [key: string]: unknown;
}

export function getInquiryConfig(): Promise<InquiryConfig> {
  return request(`/public/inquiry/${getProjectId()}/config`);
}

export function submitInquiry(input: InquiryInput): Promise<InquiryResult> {
  const contact = input.contact?.trim();
  const email = input.email?.trim();
  return request(`/public/inquiry/${getProjectId()}`, {
    method: "POST",
    body: {
      name: input.name,
      // 빈 값은 undefined → JSON 에서 빠진다(서버는 "" 를 형식 오류로 본다). 전화는 전송 직전 정규화(recipient 와 동일).
      contact: contact ? normalizePhone(contact) : undefined,
      email: email || undefined,
      content: input.content,
      consent_agreed: input.consent_agreed,
      consent_version: input.consent_version,
    },
  });
}
