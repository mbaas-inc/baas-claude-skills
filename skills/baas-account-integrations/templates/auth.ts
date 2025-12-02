/**
 * BaaS 회원 인증 통합 API
 *
 * 회원가입, 로그인, 로그아웃, 계정정보 조회를 모두 포함합니다.
 *
 * 타입 정의: baas-common/references/types.ts 참조
 *
 * 사용법:
 * import { signup, login, logout, getAccountInfo } from './auth';
 *
 * 환경변수 설정 필요:
 * - BAAS_PROJECT_ID (Node.js)
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

/**
 * 환경변수에서 project_id를 가져옵니다.
 */
function getProjectId(): string {
  const projectId =
    process.env.BAAS_PROJECT_ID ||
    process.env.REACT_APP_BAAS_PROJECT_ID ||
    process.env.NEXT_PUBLIC_BAAS_PROJECT_ID ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BAAS_PROJECT_ID);

  if (!projectId) {
    throw new Error(
      '[BaaS] project_id 환경변수 필요:\n' +
      '  - BAAS_PROJECT_ID (Node.js)\n' +
      '  - REACT_APP_BAAS_PROJECT_ID (React)\n' +
      '  - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)\n' +
      '  - VITE_BAAS_PROJECT_ID (Vite)'
    );
  }
  return projectId;
}

// ============================================
// 타입 정의 (전체 타입은 baas-common/references/types.ts 참조)
// ============================================

/** 회원가입 추가 옵션 */
interface SignupOptions {
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  /** 추가 사용자 데이터 (확장 포인트) */
  data?: Record<string, unknown>;
}

/** 토큰 응답 */
interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

/** 계정 정보 */
interface AccountInfo {
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
 * @param userId - 로그인 ID (이메일 형식 권장)
 * @param userPw - 비밀번호 (8자 이상)
 * @param name - 이름
 * @param phone - 전화번호
 * @param options - 추가 옵션 (약관 동의, 확장 데이터)
 * @returns 생성된 계정 정보
 * @throws Error - 이미 존재하는 아이디, 유효성 검사 실패 등
 *
 * @example
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 */
export async function signup(
  userId: string,
  userPw: string,
  name: string,
  phone: string,
  options: SignupOptions = {}
): Promise<AccountInfo> {
  const response = await fetch(`${API_BASE_URL}/account/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      user_id: userId,
      user_pw: userPw,
      name,
      phone,
      project_id: getProjectId(),
      ...options,
    }),
  });

  const result = await response.json();

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
 * @param userId - 로그인 ID
 * @param userPw - 비밀번호
 * @returns 토큰 정보
 * @throws Error - 아이디/비밀번호 불일치 등
 *
 * @example
 * await login('user@example.com', 'password123');
 */
export async function login(userId: string, userPw: string): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/account/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      user_id: userId,
      user_pw: userPw,
      project_id: getProjectId(),
    }),
  });

  const result = await response.json();

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

  const result = await response.json();

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
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  const result = await response.json();

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
