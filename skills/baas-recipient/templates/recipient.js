/**
 * BaaS 발송대상 등록 API 클라이언트 (JavaScript)
 *
 * 사용법:
 * const recipient = await registerRecipient({
 *   name: '홍길동',
 *   phone: '010-1234-5678',
 *   description: '예약 문의',
 *   metadata: { type: 'reservation', date: '2024-12-25' }
 * });
 */

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

/**
 * 환경변수에서 project_id를 가져옵니다.
 * 외부 에디터에서 BaaS API 사용 시 반드시 환경변수 설정 필요
 * @returns {string} 프로젝트 ID
 * @throws {Error} 환경변수가 설정되지 않은 경우
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
// 유틸리티 함수
// ============================================

/**
 * 전화번호 형식 검증
 * @param {string} phone - 검증할 전화번호
 * @returns {boolean} 유효한 형식인지 여부
 */
function validatePhone(phone) {
  return /^010-\d{4}-\d{4}$/.test(phone);
}

/**
 * 전화번호 자동 포맷팅
 * @param {string} value - 입력값
 * @returns {string} 포맷된 전화번호
 */
function formatPhone(value) {
  const numbers = value.replace(/[^\d]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0,3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0,3)}-${numbers.slice(3,7)}-${numbers.slice(7,11)}`;
}

// ============================================
// 발송대상 등록 함수
// ============================================

/**
 * BaaS 발송대상 등록 API 호출
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * @param {Object} request - 등록 요청 데이터
 * @param {string} request.name - 이름 (필수)
 * @param {string} request.phone - 전화번호 010-XXXX-XXXX (필수)
 * @param {string} [request.description] - 설명/메모 (선택)
 * @param {Object} [request.metadata] - 추가 데이터 객체 (선택, JSON으로 변환됨)
 * @returns {Promise<Object>} 생성된 발송대상 정보
 * @throws {Error} 등록 실패 시
 *
 * @example
 * // 기본 등록
 * const recipient = await registerRecipient({
 *   name: '홍길동',
 *   phone: '010-1234-5678'
 * });
 *
 * @example
 * // 예약 정보 포함
 * const recipient = await registerRecipient({
 *   name: '홍길동',
 *   phone: '010-1234-5678',
 *   description: '12월 25일 저녁 7시 예약',
 *   metadata: {
 *     type: 'reservation',
 *     date: '2024-12-25',
 *     time: '19:00',
 *     partySize: 4
 *   }
 * });
 */
async function registerRecipient(request) {
  // 전화번호 형식 검증
  if (!validatePhone(request.phone)) {
    throw new Error('전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)');
  }

  const response = await fetch(`${API_BASE_URL}/recipient/${getProjectId()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      name: request.name,
      phone: request.phone,
      description: request.description || ' ',
      data: request.metadata ? JSON.stringify(request.metadata) : '{}'
    }),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '발송대상 등록에 실패했습니다');
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

// 기본 등록
try {
  const recipient = await registerRecipient({
    name: '홍길동',
    phone: '010-1234-5678'
  });
  console.log('등록 성공!', recipient);
} catch (error) {
  console.error('등록 실패:', error.message);
}

// 예약 등록
try {
  const recipient = await registerRecipient({
    name: '홍길동',
    phone: '010-1234-5678',
    description: '12월 25일 저녁 7시 예약',
    metadata: {
      type: 'reservation',
      date: '2024-12-25',
      time: '19:00',
      partySize: 4
    }
  });
  console.log('예약 접수 완료!');
} catch (error) {
  if (error.message.includes('이미 등록된')) {
    console.error('이미 등록된 전화번호입니다.');
  } else {
    console.error('등록 실패:', error.message);
  }
}
*/

// ES Module export
export { registerRecipient, validatePhone, formatPhone };