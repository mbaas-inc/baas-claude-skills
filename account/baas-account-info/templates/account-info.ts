/**
 * BaaS 계정 정보 API 클라이언트 (TypeScript)
 *
 * 사용법:
 * const account = await getAccountInfo();
 * console.log(account.name);
 */

// ============================================
// 타입 정의
// ============================================

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
// 계정 정보 조회 함수
// ============================================

/**
 * BaaS 계정 정보 API 호출
 *
 * @returns 계정 정보
 * @throws Error - 조회 실패 시 (로그인 필요 등)
 *
 * @example
 * // 계정 정보 조회
 * const account = await getAccountInfo();
 * console.log(`안녕하세요, ${account.name}님!`);
 *
 * // 프로필 완성 여부 확인
 * if (!account.is_profile_completed) {
 *   window.location.href = '/complete-profile';
 * }
 */
export async function getAccountInfo(): Promise<AccountResponse> {
  const response = await fetch(`${API_BASE_URL}/account/info`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 쿠키 전송 (필수!)
  });

  const result: ApiResponse<AccountResponse> = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '계정 정보를 가져올 수 없습니다');
  }

  return result.data;
}

// ============================================
// 사용 예시
// ============================================

/*
// 기본 사용법
try {
  const account = await getAccountInfo();
  console.log('계정 정보:', account);
  console.log(`이름: ${account.name}`);
  console.log(`이메일: ${account.user_id}`);
  console.log(`가입일: ${account.created_at}`);
} catch (error) {
  console.error('조회 실패:', error.message);
  // 로그인 페이지로 이동
  window.location.href = '/login';
}

// 프로필 완성 확인
try {
  const account = await getAccountInfo();
  if (!account.is_profile_completed) {
    alert('프로필을 완성해주세요.');
    window.location.href = '/complete-profile';
  }
} catch (error) {
  window.location.href = '/login';
}

// 추가 데이터 활용
try {
  const account = await getAccountInfo();
  const role = account.data.role as string;
  const company = account.data.company as string;
  console.log(`${company}의 ${role}`);
} catch (error) {
  window.location.href = '/login';
}
*/

export type { AccountResponse };
