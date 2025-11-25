/**
 * BaaS 회원 인증 통합 API
 *
 * 회원가입, 로그인, 로그아웃, 계정정보 조회를 모두 포함합니다.
 *
 * 사용법:
 * import { signup, login, logout, getAccountInfo } from './auth';
 */

// ============================================
// 설정
// ============================================

const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ============================================
// 타입 정의
// ============================================

/** 성공 응답 */
interface SuccessResponse<T> {
  result: 'SUCCESS';
  data: T;
  message?: string;
}

/** 에러 응답 */
interface ErrorResponse {
  result: 'FAIL';
  errorCode: string;
  message: string;
}

type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/** 회원가입 요청 */
export interface SignupRequest {
  user_id: string;
  user_pw: string;
  name: string;
  phone: string;
  project_id?: string;
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  data?: Record<string, unknown>;
}

/** 회원가입 응답 데이터 */
export interface SignupResponse {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  is_profile_completed: boolean;
  created_at: string;
}

/** 로그인 요청 */
export interface LoginRequest {
  user_id: string;
  user_pw: string;
  project_id?: string;
}

/** 토큰 응답 */
export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

/** 계정 정보 */
export interface AccountInfo {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  is_profile_completed: boolean;
  last_logged_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
}

// ============================================
// API 함수
// ============================================

/**
 * 회원가입
 *
 * @param data - 회원가입 정보
 * @returns 생성된 계정 정보
 * @throws Error - 이미 존재하는 아이디, 유효성 검사 실패 등
 *
 * @example
 * const account = await signup({
 *   user_id: 'user@example.com',
 *   user_pw: 'password123',
 *   name: '홍길동',
 *   phone: '010-1234-5678'
 * });
 */
export async function signup(data: SignupRequest): Promise<SignupResponse> {
  const response = await fetch(`${API_BASE_URL}/account/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result: ApiResponse<SignupResponse> = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '회원가입에 실패했습니다');
  }

  return result.data;
}

/**
 * 로그인
 *
 * 성공 시 서버가 쿠키에 JWT 토큰을 자동으로 설정합니다.
 *
 * @param data - 로그인 정보
 * @returns 토큰 정보
 * @throws Error - 아이디/비밀번호 불일치 등
 *
 * @example
 * await login({ user_id: 'user@example.com', user_pw: 'password123' });
 */
export async function login(data: LoginRequest): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/account/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result: ApiResponse<TokenResponse> = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '로그인에 실패했습니다');
  }

  return result.data;
}

/**
 * 로그아웃
 *
 * 서버가 인증 쿠키를 자동으로 삭제합니다.
 *
 * @throws Error - 로그인되지 않은 상태 등
 *
 * @example
 * await logout();
 */
export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/account/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  const result: ApiResponse<null> = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '로그아웃에 실패했습니다');
  }
}

/**
 * 계정 정보 조회
 *
 * 로그인된 사용자의 정보를 조회합니다.
 * 로그인 상태 확인에도 사용할 수 있습니다.
 *
 * @returns 계정 정보
 * @throws Error - 로그인되지 않은 상태 등
 *
 * @example
 * const user = await getAccountInfo();
 * console.log(`안녕하세요, ${user.name}님!`);
 */
export async function getAccountInfo(): Promise<AccountInfo> {
  const response = await fetch(`${API_BASE_URL}/account/info`, {
    method: 'GET',
    credentials: 'include',
  });

  const result: ApiResponse<AccountInfo> = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '계정 정보 조회에 실패했습니다');
  }

  return result.data;
}

/**
 * 로그인 상태 확인
 *
 * @returns 로그인 여부와 사용자 정보
 *
 * @example
 * const { isLoggedIn, user } = await checkAuth();
 * if (isLoggedIn) {
 *   console.log(`환영합니다, ${user.name}님!`);
 * }
 */
export async function checkAuth(): Promise<{ isLoggedIn: boolean; user: AccountInfo | null }> {
  try {
    const user = await getAccountInfo();
    return { isLoggedIn: true, user };
  } catch {
    return { isLoggedIn: false, user: null };
  }
}
