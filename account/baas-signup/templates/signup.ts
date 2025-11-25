/**
 * BaaS 회원가입 API 클라이언트 (TypeScript)
 *
 * 사용법:
 * const account = await signup({
 *   user_id: 'user@example.com',
 *   user_pw: 'password123',
 *   name: '홍길동',
 *   phone: '010-1234-5678'
 * });
 */

// ============================================
// 타입 정의
// ============================================

interface SignupRequest {
  user_id: string;
  user_pw: string;
  name: string;
  phone: string;
  project_id?: string;
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  data?: Record<string, unknown>;
}

interface AccountResponse {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  is_profile_completed: boolean;
  last_logged_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
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
// 회원가입 함수
// ============================================

/**
 * BaaS 회원가입 API 호출
 *
 * @param data - 회원가입 요청 데이터
 * @returns 생성된 계정 정보
 * @throws Error - 회원가입 실패 시
 *
 * @example
 * // 기본 회원가입
 * const account = await signup({
 *   user_id: 'user@example.com',
 *   user_pw: 'password123',
 *   name: '홍길동',
 *   phone: '010-1234-5678'
 * });
 *
 * // 프로젝트 사용자 회원가입
 * const account = await signup({
 *   user_id: 'user@example.com',
 *   user_pw: 'password123',
 *   name: '홍길동',
 *   phone: '010-1234-5678',
 *   project_id: 'project-uuid',
 *   terms_agreed: true,
 *   privacy_agreed: true
 * });
 */
export async function signup(data: SignupRequest): Promise<AccountResponse> {
  const response = await fetch(`${API_BASE_URL}/account/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result: ApiResponse<AccountResponse> = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '회원가입에 실패했습니다');
  }

  return result.data;
}

// ============================================
// 사용 예시
// ============================================

/*
// 기본 사용법
try {
  const account = await signup({
    user_id: 'user@example.com',
    user_pw: 'password123',
    name: '홍길동',
    phone: '010-1234-5678'
  });
  console.log('회원가입 성공!', account);
  // 로그인 페이지로 이동 또는 자동 로그인
} catch (error) {
  console.error('회원가입 실패:', error.message);
}

// 프로젝트 사용자 + 추가 데이터
try {
  const account = await signup({
    user_id: 'user@example.com',
    user_pw: 'password123',
    name: '홍길동',
    phone: '010-1234-5678',
    project_id: '550e8400-e29b-41d4-a716-446655440000',
    terms_agreed: true,
    privacy_agreed: true,
    data: {
      company: 'ACME Corp',
      role: 'developer'
    }
  });
  console.log('프로젝트 회원가입 성공!');
} catch (error) {
  console.error('회원가입 실패:', error.message);
}
*/

export type { SignupRequest, AccountResponse };