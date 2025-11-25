/**
 * BaaS 로그아웃 API 클라이언트 (TypeScript)
 *
 * 사용법:
 * await logout();
 */

// ============================================
// 타입 정의
// ============================================

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
// 로그아웃 함수
// ============================================

/**
 * BaaS 로그아웃 API 호출
 *
 * @returns 로그아웃 성공 여부
 * @throws Error - 로그아웃 실패 시
 *
 * @example
 * // 로그아웃
 * await logout();
 * window.location.href = '/login'; // 로그인 페이지로 이동
 */
export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/account/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 쿠키 전송 (필수!)
  });

  const result: ApiResponse<null> = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '로그아웃에 실패했습니다');
  }
}

// ============================================
// 사용 예시
// ============================================

/*
// 기본 사용법
try {
  await logout();
  console.log('로그아웃 성공!');
  window.location.href = '/login';
} catch (error) {
  console.error('로그아웃 실패:', error.message);
  // 이미 로그아웃 상태일 수 있음 - 로그인 페이지로 이동
  window.location.href = '/login';
}

// 버튼 클릭 핸들러
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await logout();
    window.location.href = '/login';
  } catch (error) {
    window.location.href = '/login';
  }
});
*/