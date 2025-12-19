/**
 * BaaS API 통합 클라이언트 (TypeScript)
 *
 * Account + Messaging API를 모두 포함합니다.
 *
 * 사용법:
 * import { login, signup, logout, getAccountInfo, registerRecipient } from './baas';
 *
 * 환경변수 설정 필요:
 * - BAAS_PROJECT_ID (Node.js)
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

/**
 * 환경변수에서 project_id를 가져옵니다.
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
// 타입 정의 - Account
// ============================================

/** 회원가입 추가 옵션 */
interface SignupOptions {
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  data?: Record<string, unknown>;
}

/** 토큰 응답 */
interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

/** 계정 정보 */
interface AccountInfo {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  is_profile_completed: boolean;
  last_logged_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
}

// ============================================
// 타입 정의 - Board
// ============================================

/** 첨부파일 응답 */
interface FileResponse {
  id: number;
  file_name: string;
  url: string;
}

/** 게시글 목록 아이템 */
interface PostListItem {
  id: string;
  title: string;
  views: number;
  recommends: number;
  author_name: string;
  is_hidden: boolean;
  created_at: string;
}

/** 게시글 목록 응답 */
interface PostListResponse {
  items: PostListItem[];
  total_count: number;
  offset: number;
  limit: number;
}

/** 게시글 상세 응답 */
interface PostResponse {
  id: string;
  board_id: string;
  title: string;
  content: string;
  views: number;
  recommends: number;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string | null;
  attachments: FileResponse[];
}

/** 게시글 조회 옵션 */
interface PostFetchOptions {
  offset?: number;
  limit?: number;
  keyword?: string;
}

// ============================================
// 타입 정의 - Messaging
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
// Account API 함수
// ============================================

/**
 * 회원가입
 *
 * @param userId - 로그인 ID (이메일 형식 권장)
 * @param userPw - 비밀번호 (8자 이상)
 * @param name - 이름
 * @param phone - 전화번호
 * @param options - 추가 옵션 (약관 동의, 확장 데이터)
 * @returns 생성된 계정 정보
 *
 * @example
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 */
export async function signup(
  userId: string,
  userPw: string,
  name: string,
  phone: string,
  options: SignupOptions = {}
): Promise<AccountInfo> {
  const response = await fetch(`${API_BASE_URL}/account/signup-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
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

/**
 * 로그인
 *
 * 성공 시 서버가 쿠키에 JWT 토큰을 자동으로 설정합니다.
 *
 * @param userId - 로그인 ID
 * @param userPw - 비밀번호
 * @returns 토큰 정보
 *
 * @example
 * await login('user@example.com', 'password123');
 */
export async function login(userId: string, userPw: string): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
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

/**
 * 로그아웃
 *
 * 서버가 인증 쿠키를 자동으로 삭제합니다.
 *
 * @example
 * await logout();
 */
export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/account/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '로그아웃에 실패했습니다');
  }
}

/**
 * 계정 정보 조회
 *
 * 로그인된 사용자의 정보를 조회합니다.
 *
 * @returns 계정 정보
 *
 * @example
 * const user = await getAccountInfo();
 * console.log(`안녕하세요, ${user.name}님!`);
 */
export async function getAccountInfo(): Promise<AccountInfo> {
  const response = await fetch(`${API_BASE_URL}/account/info`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '계정 정보 조회에 실패했습니다');
  }

  return result.data;
}

/**
 * 로그인 상태 확인
 *
 * @returns 로그인 여부와 사용자 정보
 *
 * @example
 * const { isLoggedIn, user } = await checkAuth();
 * if (isLoggedIn) {
 *   console.log(`환영합니다, ${user.name}님!`);
 * }
 */
export async function checkAuth(): Promise<{ isLoggedIn: boolean; user: AccountInfo | null }> {
  try {
    const user = await getAccountInfo();
    return { isLoggedIn: true, user };
  } catch {
    return { isLoggedIn: false, user: null };
  }
}

// ============================================
// Messaging API 함수
// ============================================

/**
 * 전화번호 형식 검증
 *
 * @param phone - 검증할 전화번호
 * @returns 유효한 형식인지 여부
 */
export function validatePhone(phone: string): boolean {
  return /^010-\d{4}-\d{4}$/.test(phone);
}

/**
 * 전화번호 자동 포맷팅
 *
 * @param value - 입력값
 * @returns 포맷된 전화번호
 */
export function formatPhone(value: string): string {
  const numbers = value.replace(/[^\d]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0,3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0,3)}-${numbers.slice(3,7)}-${numbers.slice(7,11)}`;
}

/**
 * 발송대상 등록
 *
 * @param request - 등록 요청 데이터
 * @param request.name - 이름 (필수)
 * @param request.phone - 전화번호 010-XXXX-XXXX (필수)
 * @param request.description - 설명/메모 (선택)
 * @param request.metadata - 추가 데이터 객체 (선택, JSON으로 변환됨)
 * @returns 생성된 발송대상 정보
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
export async function registerRecipient(request: RecipientCreateRequest): Promise<RecipientResponse> {
  // 전화번호 형식 검증
  if (!validatePhone(request.phone)) {
    throw new Error('전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)');
  }

  const response = await fetch(`${API_BASE_URL}/recipient/${getProjectId()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
// Board API 함수
// ============================================

/**
 * 공지사항 목록 조회
 *
 * @param options - 조회 옵션 (페이지네이션, 검색)
 * @returns 공지사항 목록
 *
 * @example
 * // 기본 조회
 * const notices = await getNoticePosts();
 *
 * @example
 * // 페이지네이션 및 검색
 * const notices = await getNoticePosts({
 *   offset: 0,
 *   limit: 10,
 *   keyword: '업데이트'
 * });
 */
export async function getNoticePosts(options: PostFetchOptions = {}): Promise<PostListResponse> {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.append('offset', String(options.offset));
  if (options.limit !== undefined) params.append('limit', String(options.limit));
  if (options.keyword) params.append('keyword', options.keyword);

  const queryString = params.toString();
  const url = `${API_BASE_URL}/public/board/notice/${getProjectId()}/posts${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '공지사항 목록 조회에 실패했습니다');
  }

  return result.data;
}

/**
 * 공지사항 상세 조회
 *
 * @param postId - 게시글 ID (UUID)
 * @returns 공지사항 상세 정보
 *
 * @example
 * const notice = await getNoticePost('550e8400-e29b-41d4-a716-446655440000');
 * console.log(notice.title, notice.content);
 */
export async function getNoticePost(postId: string): Promise<PostResponse> {
  const response = await fetch(
    `${API_BASE_URL}/public/board/notice/${getProjectId()}/posts/${postId}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }
  );

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '공지사항 조회에 실패했습니다');
  }

  return result.data;
}

/**
 * FAQ 목록 조회
 *
 * @param options - 조회 옵션 (페이지네이션, 검색)
 * @returns FAQ 목록 (title=질문)
 *
 * @example
 * // 기본 조회
 * const faqs = await getFaqPosts();
 *
 * @example
 * // 검색
 * const faqs = await getFaqPosts({ keyword: '배송' });
 */
export async function getFaqPosts(options: PostFetchOptions = {}): Promise<PostListResponse> {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.append('offset', String(options.offset));
  if (options.limit !== undefined) params.append('limit', String(options.limit));
  if (options.keyword) params.append('keyword', options.keyword);

  const queryString = params.toString();
  const url = `${API_BASE_URL}/public/board/faq/${getProjectId()}/posts${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || 'FAQ 목록 조회에 실패했습니다');
  }

  return result.data;
}

/**
 * FAQ 상세 조회
 *
 * @param postId - 게시글 ID (UUID)
 * @returns FAQ 상세 정보 (title=질문, content=답변)
 *
 * @example
 * const faq = await getFaqPost('550e8400-e29b-41d4-a716-446655440000');
 * console.log(`Q: ${faq.title}`);
 * console.log(`A: ${faq.content}`);
 */
export async function getFaqPost(postId: string): Promise<PostResponse> {
  const response = await fetch(
    `${API_BASE_URL}/public/board/faq/${getProjectId()}/posts/${postId}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }
  );

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || 'FAQ 조회에 실패했습니다');
  }

  return result.data;
}

// ============================================
// 타입 export
// ============================================

export type {
  SignupOptions,
  TokenResponse,
  AccountInfo,
  RecipientCreateRequest,
  RecipientResponse,
  FileResponse,
  PostListItem,
  PostListResponse,
  PostResponse,
  PostFetchOptions
};
