/**
 * BaaS API 통합 클라이언트 (JavaScript)
 *
 * Account + Messaging API를 모두 포함합니다.
 *
 * 사용법:
 * import { login, signup, logout, getAccountInfo, registerRecipient } from './baas';
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
 * @returns {string} 프로젝트 ID
 * @throws {Error} 환경변수가 설정되지 않은 경우
 */
function getProjectId() {
  const projectId =
    (typeof process !== 'undefined' && process.env?.BAAS_PROJECT_ID) ||
    (typeof process !== 'undefined' && process.env?.REACT_APP_BAAS_PROJECT_ID) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BAAS_PROJECT_ID) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BAAS_PROJECT_ID);

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
// Account API 함수
// ============================================

/**
 * 회원가입
 *
 * @param {string} userId - 로그인 ID (이메일 형식 권장)
 * @param {string} userPw - 비밀번호 (8자 이상)
 * @param {string} name - 이름
 * @param {string} phone - 전화번호
 * @param {Object} [options] - 추가 옵션
 * @param {boolean} [options.terms_agreed] - 이용약관 동의
 * @param {boolean} [options.privacy_agreed] - 개인정보 동의
 * @param {Object} [options.data] - 추가 데이터
 * @returns {Promise<Object>} 생성된 계정 정보
 *
 * @example
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 */
export async function signup(userId, userPw, name, phone, options = {}) {
  const response = await fetch(`${API_BASE_URL}/account/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
 * @param {string} userId - 로그인 ID
 * @param {string} userPw - 비밀번호
 * @returns {Promise<Object>} 토큰 정보
 *
 * @example
 * await login('user@example.com', 'password123');
 */
export async function login(userId, userPw) {
  const response = await fetch(`${API_BASE_URL}/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
 * @returns {Promise<void>}
 *
 * @example
 * await logout();
 */
export async function logout() {
  const response = await fetch(`${API_BASE_URL}/account/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
 * @returns {Promise<{isLoggedIn: boolean, user: Object|null}>} 로그인 여부와 사용자 정보
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

// ============================================
// Messaging API 함수
// ============================================

/**
 * 전화번호 형식 검증
 *
 * @param {string} phone - 검증할 전화번호
 * @returns {boolean} 유효한 형식인지 여부
 */
export function validatePhone(phone) {
  return /^010-\d{4}-\d{4}$/.test(phone);
}

/**
 * 전화번호 자동 포맷팅
 *
 * @param {string} value - 입력값
 * @returns {string} 포맷된 전화번호
 */
export function formatPhone(value) {
  const numbers = value.replace(/[^\d]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0,3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0,3)}-${numbers.slice(3,7)}-${numbers.slice(7,11)}`;
}

/**
 * 발송대상 등록
 *
 * @param {Object} request - 등록 요청 데이터
 * @param {string} request.name - 이름 (필수)
 * @param {string} request.phone - 전화번호 010-XXXX-XXXX (필수)
 * @param {string} [request.description] - 설명/메모 (선택)
 * @param {Object} [request.metadata] - 추가 데이터 객체 (선택, JSON으로 변환됨)
 * @returns {Promise<Object>} 생성된 발송대상 정보
 *
 * @example
 * // 기본 등록
 * const recipient = await registerRecipient({
 *   name: '홍길동',
 *   phone: '010-1234-5678'
 * });
 *
 * @example
 * // 예약 정보 포함
 * const recipient = await registerRecipient({
 *   name: '홍길동',
 *   phone: '010-1234-5678',
 *   description: '12월 25일 저녁 7시 예약',
 *   metadata: {
 *     type: 'reservation',
 *     date: '2024-12-25',
 *     time: '19:00',
 *     partySize: 4
 *   }
 * });
 */
export async function registerRecipient(request) {
  // 전화번호 형식 검증
  if (!validatePhone(request.phone)) {
    throw new Error('전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)');
  }

  const response = await fetch(`${API_BASE_URL}/recipient/${getProjectId()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      name: request.name,
      phone: request.phone,
      description: request.description || ' ',
      data: request.metadata ? JSON.stringify(request.metadata) : '{}'
    }),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '발송대상 등록에 실패했습니다');
  }

  return result.data;
}