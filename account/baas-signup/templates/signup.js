/**
 * BaaS 회원가입 API 클라이언트 (JavaScript)
 *
 * 사용법:
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 */

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
 * @param {string} userId - 로그인 ID (이메일 형식 권장)
 * @param {string} userPw - 비밀번호 (8자 이상 필수)
 * @param {string} name - 이름
 * @param {string} phone - 전화번호
 * @param {Object} [options] - 추가 옵션
 * @param {string} [options.projectId] - 프로젝트 ID (프로젝트 사용자만)
 * @param {boolean} [options.termsAgreed] - 이용약관 동의
 * @param {boolean} [options.privacyAgreed] - 개인정보 처리방침 동의
 * @param {Object} [options.data] - 추가 데이터
 * @returns {Promise<Object>} 생성된 계정 정보
 * @throws {Error} 회원가입 실패 시
 *
 * @example
 * // 기본 회원가입
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 *
 * // 프로젝트 사용자 회원가입
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678', {
 *   projectId: 'project-uuid',
 *   termsAgreed: true,
 *   privacyAgreed: true
 * });
 */
async function signup(userId, userPw, name, phone, options = {}) {
  const body = {
    user_id: userId,
    user_pw: userPw,
    name: name,
    phone: phone,
  };

  if (options.projectId) {
    body.project_id = options.projectId;
  }
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
// 기본 사용법
try {
  const account = await signup(
    'user@example.com',
    'password123',
    '홍길동',
    '010-1234-5678'
  );
  console.log('회원가입 성공!', account);
  // 로그인 페이지로 이동 또는 자동 로그인
} catch (error) {
  console.error('회원가입 실패:', error.message);
}

// 프로젝트 사용자 + 추가 데이터
try {
  const account = await signup(
    'user@example.com',
    'password123',
    '홍길동',
    '010-1234-5678',
    {
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      termsAgreed: true,
      privacyAgreed: true,
      data: {
        company: 'ACME Corp',
        role: 'developer'
      }
    }
  );
  console.log('프로젝트 회원가입 성공!');
} catch (error) {
  console.error('회원가입 실패:', error.message);
}
*/

// ES Module export (필요시 사용)
// export { signup };