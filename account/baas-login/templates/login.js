/**
 * BaaS 로그인 API 클라이언트 (JavaScript)
 *
 * 사용법:
 * const token = await login('user@example.com', 'password123');
 */

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
 * @param {string} userId - 로그인 ID
 * @param {string} userPw - 비밀번호
 * @param {string} [projectId] - 프로젝트 ID (선택, 프로젝트 사용자만)
 * @returns {Promise<{access_token: string, token_type: 'bearer'}>} 토큰 정보
 * @throws {Error} 로그인 실패 시
 *
 * @example
 * // 기본 로그인
 * const token = await login('user@example.com', 'password123');
 *
 * // 프로젝트 사용자 로그인
 * const token = await login('user@example.com', 'password123', 'project-uuid');
 */
async function login(userId, userPw, projectId = null) {
  const body = {
    user_id: userId,
    user_pw: userPw,
  };

  if (projectId) {
    body.project_id = projectId;
  }

  const response = await fetch(`${API_BASE_URL}/account/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 쿠키 자동 저장 (필수!)
    body: JSON.stringify(body),
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
// 기본 사용법
try {
  const token = await login('user@example.com', 'password123');
  console.log('로그인 성공!', token);
  // 이후 API 호출 시 credentials: 'include' 포함하면 자동 인증
} catch (error) {
  console.error('로그인 실패:', error.message);
}

// 프로젝트 사용자 로그인
try {
  const token = await login(
    'project-user@example.com',
    'password123',
    '550e8400-e29b-41d4-a716-446655440000'
  );
  console.log('프로젝트 로그인 성공!');
} catch (error) {
  console.error('로그인 실패:', error.message);
}
*/

// ES Module export (필요시 사용)
// export { login };
