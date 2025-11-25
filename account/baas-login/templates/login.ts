/**
 * BaaS 로그인 API 클라이언트 (TypeScript)
 *
 * 사용법:
 * const token = await login({ user_id: 'user@example.com', user_pw: 'password123' });
 */

// ============================================
// 타입 정의
// ============================================

interface LoginRequest {
  user_id: string;
  user_pw: string;
  project_id?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

interface SuccessResponse<T> {
  result: 'SUCCESS';
  data: T;
  message?: string;
}

interface ErrorResponse {
  result: 'FAIL';
  errorCode: string;
  message: string;
}

type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'http://localhost:8000'; // 환경에 맞게 변경

// ============================================
// 로그인 함수
// ============================================

/**
 * BaaS 로그인 API 호출
 *
 * @param data - 로그인 요청 데이터
 * @returns 토큰 정보 (쿠키는 자동 설정됨)
 * @throws Error - 로그인 실패 시
 *
 * @example
 * // 기본 로그인
 * const token = await login({ user_id: 'user@example.com', user_pw: 'password123' });
 *
 * // 프로젝트 사용자 로그인
 * const token = await login({
 *   user_id: 'user@example.com',
 *   user_pw: 'password123',
 *   project_id: 'project-uuid'
 * });
 */
export async function login(data: LoginRequest): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/account/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 쿠키 자동 저장 (필수!)
    body: JSON.stringify(data),
  });

  const result: ApiResponse<TokenResponse> = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '로그인에 실패했습니다');
  }

  return result.data;
}

// ============================================
// 사용 예시
// ============================================

/*
// 기본 사용법
try {
  const token = await login({
    user_id: 'user@example.com',
    user_pw: 'password123'
  });
  console.log('로그인 성공!', token);
  // 이후 API 호출 시 credentials: 'include' 포함하면 자동 인증
} catch (error) {
  console.error('로그인 실패:', error.message);
}

// 프로젝트 사용자 로그인
try {
  const token = await login({
    user_id: 'project-user@example.com',
    user_pw: 'password123',
    project_id: '550e8400-e29b-41d4-a716-446655440000'
  });
  console.log('프로젝트 로그인 성공!');
} catch (error) {
  console.error('로그인 실패:', error.message);
}
*/

export type { LoginRequest, TokenResponse };