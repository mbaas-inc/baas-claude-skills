/**
 * 문자 인증 로그인 — 휴대폰 번호 소유가 곧 로그인 수단인 앱용.
 *
 * 흐름: requestSmsLoginCode(번호) → loginWithSms(번호, 인증번호)
 *   - registered=true  → 이미 로그인됨(쿠키 설정)
 *   - registered=false → 추가 정보를 받아 signupWithSms(...) → 가입과 동시에 로그인
 *
 * 프로젝트의 가입 인증 설정(getAuthConfig().signup_verification)이 "SMS" 일 때만 서버가 발송한다.
 * 가입 여부는 인증번호를 확인한 뒤에만 알려 준다 — 발송 단계에서 묻지 않는다.
 */
import { request } from "./http";
import { getProjectId } from "./config";
import { normalizePhone } from "./phone";
import { clearAuthCache } from "./auth";

export interface SmsCodeSent {
  /** 만료까지 남은 초 (현재 300) */
  expires_in: number;
  expires_at: string;
  message?: string;
  [key: string]: unknown;
}

export interface SmsLoginResult {
  /** false 면 인증번호 불일치 — remaining_attempts 로 남은 횟수 안내 */
  verified: boolean;
  /** 인증 성공 시에만 의미가 있다. false 면 signupWithSms 로 가입시킨다 */
  registered?: boolean | null;
  access_token?: string | null;
  remaining_attempts?: number | null;
  [key: string]: unknown;
}

export interface SmsSignupInput {
  /** loginWithSms 때와 같은 번호 */
  phone: string;
  name: string;
  termsAgreed: boolean;
  privacyAgreed: boolean;
  /** 생략하면 서버가 번호를 아이디로 쓴다 */
  userId?: string;
  /** 생략하면 비밀번호 없는 계정(문자 인증 로그인 전용) */
  userPw?: string;
}

export interface SmsSignupResult {
  id: string;
  /** "ACTIVE" 면 가입과 동시에 로그인됨 / "PENDING" 이면 관리자 승인 대기(로그인 안 됨) */
  status: string;
  access_token?: string | null;
  [key: string]: unknown;
}

/** 인증번호 발송. 가입 여부와 무관하게 보낸다. 60초 쿨다운(429, data.retry_after). */
export function requestSmsLoginCode(phone: string): Promise<SmsCodeSent> {
  return request<SmsCodeSent>("/account/sms-login/request", {
    method: "POST",
    body: { phone: normalizePhone(phone), project_id: getProjectId() },
  });
}

/**
 * 인증번호 확인 + 가입된 번호면 로그인.
 * 불일치는 예외가 아니라 verified=false 로 온다. 5회 초과·만료는 BaasError
 * (MAX_ATTEMPTS_EXCEEDED · EXPIRED) — 인증번호를 다시 받게 한다.
 */
export async function loginWithSms(phone: string, code: string): Promise<SmsLoginResult> {
  const result = await request<SmsLoginResult>("/account/sms-login", {
    method: "POST",
    body: { phone: normalizePhone(phone), code, project_id: getProjectId() },
  });
  if (result.registered) clearAuthCache();
  return result;
}

/**
 * loginWithSms 가 registered=false 를 준 뒤 호출한다 — 서버가 방금 인증한 번호인지 확인한다.
 * status 가 ACTIVE 면 쿠키가 설정되어 바로 로그인 상태다.
 */
export async function signupWithSms(input: SmsSignupInput): Promise<SmsSignupResult> {
  const body: Record<string, unknown> = {
    phone: normalizePhone(input.phone),
    name: input.name,
    terms_agreed: input.termsAgreed,
    privacy_agreed: input.privacyAgreed,
    identifier_type: "SMS",
    project_id: getProjectId(),
  };
  if (input.userId) body.user_id = input.userId;
  if (input.userPw) body.user_pw = input.userPw;

  const result = await request<SmsSignupResult>("/account/signup/unified", { method: "POST", body });
  if (result.access_token) clearAuthCache();
  return result;
}
