/** 서버 공통 응답 봉투 */
export interface Envelope<T> {
  result: "SUCCESS" | "FAIL";
  data: T | null;
  message?: string | null;
  errorCode?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface AccountInfo {
  id: string;
  user_id: string;
  email: string | null;
  name: string;
  phone: string | null;
  is_profile_completed: boolean;
  status: string;
  [key: string]: unknown;
}

export interface SignupOptions {
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  /** 동의한 약관 버전 — getSignupTerms().version 을 그대로 넘긴다 */
  terms_version?: string;
  [key: string]: unknown;
}

export interface AuthState {
  isLoggedIn: boolean;
  user: AccountInfo | null;
}
