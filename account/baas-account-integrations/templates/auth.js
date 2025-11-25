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
// API 함수
// ============================================

/**
 * 회원가입
 *
 * @param {Object} data - 회원가입 정보
 * @param {string} data.user_id - 로그인 ID (이메일 형식 권장)
 * @param {string} data.user_pw - 비밀번호 (8자 이상)
 * @param {string} data.name - 이름
 * @param {string} data.phone - 전화번호
 * @param {string} [data.project_id] - 프로젝트 ID (선택)
 * @returns {Promise<Object>} 생성된 계정 정보
 *
 * @example
 * const account = await signup({
 *   user_id: 'user@example.com',
 *   user_pw: 'password123',
 *   name: '홍길동',
 *   phone: '010-1234-5678'
 * });
 */
export async function signup(data) {
  const response = await fetch(`${API_BASE_URL}/account/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
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
 * @param {Object} data - 로그인 정보
 * @param {string} data.user_id - 로그인 ID
 * @param {string} data.user_pw - 비밀번호
 * @param {string} [data.project_id] - 프로젝트 ID (선택)
 * @returns {Promise<Object>} 토큰 정보
 *
 * @example
 * await login({ user_id: 'user@example.com', user_pw: 'password123' });
 */
export async function login(data) {
  const response = await fetch(`${API_BASE_URL}/account/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
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
 * @returns {Promise<void>}
 *
 * @example
 * await logout();
 */
export async function logout() {
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
 *
 * @returns {Promise<Object>} 계정 정보
 *
 * @example
 * const user = await getAccountInfo();
 * console.log(`안녕하세요, ${user.name}님!`);
 */
export async function getAccountInfo() {
  const response = await fetch(`${API_BASE_URL}/account/info`, {
    method: 'GET',
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
 * @returns {Promise<{isLoggedIn: boolean, user: Object|null}>}
 *
 * @example
 * const { isLoggedIn, user } = await checkAuth();
 * if (isLoggedIn) {
 *   console.log(`환영합니다, ${user.name}님!`);
 * }
 */
export async function checkAuth() {
  try {
    const user = await getAccountInfo();
    return { isLoggedIn: true, user };
  } catch {
    return { isLoggedIn: false, user: null };
  }
}
