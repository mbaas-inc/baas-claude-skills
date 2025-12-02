/**
 * BaaS 계정 정보 API 클라이언트 (JavaScript)
 *
 * 타입 정의: baas-common/references/types.ts 참조
 *
 * 사용법:
 * const account = await getAccountInfo();
 * console.log(account.name);
 */

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

// ============================================
// 계정 정보 조회 함수
// ============================================

/**
 * BaaS 계정 정보 API 호출
 *
 * @returns {Promise<Object>} 계정 정보
 * @returns {string} returns.id - 계정 UUID
 * @returns {string} returns.user_id - 로그인 ID
 * @returns {string} returns.name - 이름
 * @returns {string} returns.phone - 전화번호
 * @returns {boolean} returns.is_profile_completed - 프로필 완성 여부
 * @returns {string|null} returns.last_logged_at - 마지막 로그인
 * @returns {string} returns.created_at - 생성일시
 * @returns {Object} returns.data - 추가 데이터
 * @throws {Error} 조회 실패 시
 *
 * @example
 * // 계정 정보 조회
 * const account = await getAccountInfo();
 * console.log(`안녕하세요, ${account.name}님!`);
 */
async function getAccountInfo() {
  const response = await fetch(`${API_BASE_URL}/account/info`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 쿠키 전송 (필수!)
  });

  const result = await response.json();

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
  const role = account.data.role;
  const company = account.data.company;
  console.log(`${company}의 ${role}`);
} catch (error) {
  window.location.href = '/login';
}
*/

// ES Module export (필요시 사용)
// export { getAccountInfo };