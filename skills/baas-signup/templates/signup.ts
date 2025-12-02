/**
 * BaaS 회원가입 API 클라이언트 (TypeScript)
 *
 * 타입 정의: baas-common/references/types.ts 참조
 * - SignupRequest, AccountResponse, ApiResponse
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
// 회원가입 함수
// ============================================

/** 회원가입 요청 옵션 */
interface SignupOptions {
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  /** 추가 사용자 데이터 (확장 포인트) */
  data?: Record<string, unknown>;
}

/** 계정 응답 */
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

/**
 * BaaS 회원가입 API 호출
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * @param userId - 로그인 ID (이메일 형식 권장)
 * @param userPw - 비밀번호 (8자 이상 필수)
 * @param name - 이름
 * @param phone - 전화번호
 * @param options - 추가 옵션 (약관동의, 추가데이터 등)
 * @returns 생성된 계정 정보
 * @throws Error - 회원가입 실패 시
 *
 * @example
 * // 기본 회원가입
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 *
 * // 추가 데이터 포함
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678', {
 *   terms_agreed: true,
 *   privacy_agreed: true,
 *   data: { company: 'ACME Corp', role: 'developer' }
 * });
 */
export async function signup(
  userId: string,
  userPw: string,
  name: string,
  phone: string,
  options: SignupOptions = {}
): Promise<AccountResponse> {
  const response = await fetch(`${API_BASE_URL}/account/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

// ============================================
// 사용 예시
// ============================================

/*
// 환경변수 설정 필요 (.env 파일)
// BAAS_PROJECT_ID=your-project-uuid (Node.js)
// REACT_APP_BAAS_PROJECT_ID=your-project-uuid (React)
// NEXT_PUBLIC_BAAS_PROJECT_ID=your-project-uuid (Next.js)
// VITE_BAAS_PROJECT_ID=your-project-uuid (Vite)

// 기본 회원가입
try {
  const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
  console.log('회원가입 성공!', account);
} catch (error) {
  console.error('회원가입 실패:', error.message);
}

// 추가 데이터 포함
try {
  const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678', {
    terms_agreed: true,
    privacy_agreed: true,
    data: { company: 'ACME Corp', role: 'developer' }
  });
  console.log('회원가입 성공!');
} catch (error) {
  console.error('회원가입 실패:', error.message);
}
*/

export type { SignupOptions, AccountResponse };