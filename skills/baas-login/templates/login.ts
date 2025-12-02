/**
 * BaaS 로그인 API 클라이언트 (TypeScript)
 *
 * 타입 정의: baas-common/references/types.ts 참조
 * - LoginRequest, TokenResponse, ApiResponse
 *
 * 사용법:
 * const token = await login('user@example.com', 'password123');
 */

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

/**
 * 환경변수에서 project_id를 가져옵니다.
 * 외부 에디터에서 BaaS API 사용 시 반드시 환경변수 설정 필요
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
// 로그인 함수
// ============================================

interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

/**
 * BaaS 로그인 API 호출
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * @param userId - 로그인 ID
 * @param userPw - 비밀번호
 * @returns 토큰 정보 (쿠키는 자동 설정됨)
 * @throws Error - 로그인 실패 시
 *
 * @example
 * const token = await login('user@example.com', 'password123');
 */
export async function login(userId: string, userPw: string): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/account/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 쿠키 자동 저장 (필수!)
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

// ============================================
// 사용 예시
// ============================================

/*
// 환경변수 설정 필요 (.env 파일)
// BAAS_PROJECT_ID=your-project-uuid (Node.js)
// REACT_APP_BAAS_PROJECT_ID=your-project-uuid (React)
// NEXT_PUBLIC_BAAS_PROJECT_ID=your-project-uuid (Next.js)
// VITE_BAAS_PROJECT_ID=your-project-uuid (Vite)

try {
  const token = await login('user@example.com', 'password123');
  console.log('로그인 성공!');
  // 이후 API 호출 시 credentials: 'include' 포함하면 자동 인증
} catch (error) {
  console.error('로그인 실패:', error.message);
}
*/

export type { TokenResponse };