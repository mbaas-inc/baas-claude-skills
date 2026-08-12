/**
 * 가입 절차 — 프로젝트 설정 조회, 약관, 이메일 인증 코드, SNS 제공자.
 *
 * 인증 여부는 프로젝트마다 다르고 운영자가 콘솔에서 언제든 바꾼다.
 * 생성 시점 값으로 화면을 고정하지 말고 매번 getAuthConfig() 로 읽어 분기한다.
 */
import { request } from "./http";
import { getProjectId } from "./config";

export interface AuthConfig {
  /** "NONE" = 인증 없이 가입 / "EMAIL" = 이메일 인증 코드 필수 */
  signup_verification: "NONE" | "EMAIL" | string;
  /** true 면 가입 후 관리자 승인 전까지 PENDING */
  require_signup_approval: boolean;
  [key: string]: unknown;
}

export interface TermsDocument {
  title: string;
  content: string;
}

export interface SignupTerms {
  /** 동의 시 signup(..., { terms_version }) 으로 되돌려 보낸다 */
  version: string;
  terms: TermsDocument;
  privacy: TermsDocument;
}

export interface SnsProvider {
  name: string;
  display_name: string;
  logo_url?: string;
  banner_logo_url?: string;
  /** fetch 대상이 아니라 페이지 이동 경로 */
  login_url: string;
  [key: string]: unknown;
}

export interface VerifyCodeResult {
  verified: boolean;
  remaining_attempts?: number;
  message?: string;
  [key: string]: unknown;
}

/** 가입 화면이 절차를 결정하는 근거. 화면 진입마다 호출한다. */
export function getAuthConfig(): Promise<AuthConfig> {
  return request<AuthConfig>(`/public/projects/${getProjectId()}/auth-config`);
}

/** 통합 약관 전문 — 가입 화면 안에서 노출하고 동의를 받는다. */
export function getSignupTerms(): Promise<SignupTerms> {
  return request<SignupTerms>(`/public/projects/${getProjectId()}/signup-terms`);
}

/** 가입용 이메일 인증 코드 발송. 60초 쿨다운(429, data.retry_after). */
export function requestSignupEmailCode(email: string): Promise<unknown> {
  return request("/verification/createV2", {
    method: "POST",
    body: {
      project_id: getProjectId(),
      identifier: email,
      identifier_type: "EMAIL",
      purpose: "SIGNUP",
    },
  });
}

/**
 * 코드 확인. 코드가 틀리면 서버가 400 을 주므로 throw 되고, 남은 시도 횟수는
 * BaasError 로 전달되지 않는다 — 실패는 error 메시지로 안내한다.
 */
export function confirmSignupEmailCode(email: string, code: string): Promise<VerifyCodeResult> {
  return request<VerifyCodeResult>("/verification/verify", {
    method: "POST",
    body: {
      project_id: getProjectId(),
      identifier: email,
      identifier_type: "EMAIL",
      code,
      purpose: "SIGNUP",
    },
  });
}

/** 활성 SNS 제공자 목록 (전역 설정). login_url 은 페이지 이동에 쓴다. */
export async function getSnsProviders(): Promise<SnsProvider[]> {
  const data = await request<{ providers?: SnsProvider[] }>("/auth/providers");
  return data.providers || [];
}
