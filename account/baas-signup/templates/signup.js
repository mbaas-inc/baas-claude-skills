/**
 * BaaS 회원가입 API 클라이언트 (JavaScript)
 *
 * 타입 정의: baas-common/references/types.ts 참조
 *
 * 사용법:
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 */

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

/**
 * 환경변수에서 project_id를 가져옵니다.
 * 외부 에디터에서 BaaS API 사용 시 반드시 환경변수 설정 필요
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
// 회원가입 함수
// ============================================

/**
 * BaaS 회원가입 API 호출
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * @param {string} userId - 로그인 ID (이메일 형식 권장)
 * @param {string} userPw - 비밀번호 (8자 이상 필수)
 * @param {string} name - 이름
 * @param {string} phone - 전화번호
 * @param {Object} [options] - 추가 옵션
 * @param {boolean} [options.termsAgreed] - 이용약관 동의
 * @param {boolean} [options.privacyAgreed] - 개인정보 처리방침 동의
 * @param {Object} [options.data] - 추가 데이터 (확장 포인트)
 * @returns {Promise<Object>} 생성된 계정 정보
 * @throws {Error} 회원가입 실패 시
 *
 * @example
 * // 기본 회원가입
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 *
 * // 추가 데이터 포함
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678', {
 *   termsAgreed: true,
 *   privacyAgreed: true,
 *   data: { company: 'ACME Corp', role: 'developer' }
 * });
 */
async function signup(userId, userPw, name, phone, options = {}) {
  const body = {
    user_id: userId,
    user_pw: userPw,
    name: name,
    phone: phone,
    project_id: getProjectId(),
  };

  if (options.termsAgreed !== undefined) {
    body.terms_agreed = options.termsAgreed;
  }
  if (options.privacyAgreed !== undefined) {
    body.privacy_agreed = options.privacyAgreed;
  }
  if (options.data) {
    body.data = options.data;
  }

  const response = await fetch(`${API_BASE_URL}/account/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
    termsAgreed: true,
    privacyAgreed: true,
    data: { company: 'ACME Corp', role: 'developer' }
  });
  console.log('회원가입 성공!');
} catch (error) {
  console.error('회원가입 실패:', error.message);
}
*/

// ES Module export (필요시 사용)
// export { signup };