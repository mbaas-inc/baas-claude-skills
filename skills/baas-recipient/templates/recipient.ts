/**
 * BaaS 발송대상 등록 API 클라이언트 (TypeScript)
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
// 타입 정의
// ============================================

/** 발송대상 등록 요청 */
interface RecipientCreateRequest {
  name: string;
  phone: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** 발송대상 응답 */
interface RecipientResponse {
  id: string;
  project_id: string;
  name: string;
  phone: string;
  description: string | null;
  data: string;
  created_at: string;
  removed_at: string | null;
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 전화번호 형식 검증
 * @param phone - 검증할 전화번호
 * @returns 유효한 형식인지 여부
 */
export function validatePhone(phone: string): boolean {
  return /^010-\d{4}-\d{4}$/.test(phone);
}

/**
 * 전화번호 자동 포맷팅
 * @param value - 입력값
 * @returns 포맷된 전화번호
 */
export function formatPhone(value: string): string {
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
 * @param request - 등록 요청 데이터
 * @param request.name - 이름 (필수)
 * @param request.phone - 전화번호 010-XXXX-XXXX (필수)
 * @param request.description - 설명/메모 (선택)
 * @param request.metadata - 추가 데이터 객체 (선택, JSON으로 변환됨)
 * @returns 생성된 발송대상 정보
 * @throws Error - 등록 실패 시
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
 *
 * @example
 * // 문의 등록
 * const recipient = await registerRecipient({
 *   name: '홍길동',
 *   phone: '010-1234-5678',
 *   description: '제품 견적 문의',
 *   metadata: {
 *     type: 'inquiry',
 *     inquiryType: 'product',
 *     message: '대량 구매 견적 요청'
 *   }
 * });
 */
export async function registerRecipient(request: RecipientCreateRequest): Promise<RecipientResponse> {
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

export type { RecipientCreateRequest, RecipientResponse };