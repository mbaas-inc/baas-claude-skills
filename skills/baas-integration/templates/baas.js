/**
 * BaaS API 통합 클라이언트 (JavaScript)
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

const API_BASE_URL = '/aiapp-baas';

/**
 * 환경변수에서 project_id를 가져옵니다.
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
// Account API 함수
// ============================================

/**
 * 회원가입
 *
 * @param {string} userId - 로그인 ID (이메일 형식 권장)
 * @param {string} userPw - 비밀번호 (8자 이상)
 * @param {string} name - 이름
 * @param {string} phone - 전화번호
 * @param {Object} [options] - 추가 옵션
 * @param {boolean} [options.terms_agreed] - 이용약관 동의
 * @param {boolean} [options.privacy_agreed] - 개인정보 동의
 * @param {Object} [options.data] - 추가 데이터
 * @returns {Promise<Object>} 생성된 계정 정보
 *
 * @example
 * const account = await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 */
export async function signup(userId, userPw, name, phone, options = {}) {
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
 * @param {string} userId - 로그인 ID
 * @param {string} userPw - 비밀번호
 * @returns {Promise<Object>} 토큰 정보
 *
 * @example
 * await login('user@example.com', 'password123');
 */
export async function login(userId, userPw) {
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
 * @returns {Promise<void>}
 *
 * @example
 * await logout();
 */
export async function logout() {
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
 * @returns {Promise<Object>} 계정 정보
 *
 * @example
 * const user = await getAccountInfo();
 * console.log(`안녕하세요, ${user.name}님!`);
 */
export async function getAccountInfo() {
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
 * @returns {Promise<{isLoggedIn: boolean, user: Object|null}>} 로그인 여부와 사용자 정보
 *
 * @example
 * const { isLoggedIn, user } = await checkAuth();
 * if (isLoggedIn) {
 *   console.log(`환영합니다, ${user.name}님!`);
 * }
 */
export async function checkAuth() {
  try {
    const user = await getAccountInfo();
    return { isLoggedIn: true, user };
  } catch {
    return { isLoggedIn: false, user: null };
  }
}

/**
 * 비밀번호 변경
 *
 * 인증된 사용자만 본인의 비밀번호를 변경할 수 있습니다.
 * SNS 로그인 계정(카카오/네이버/구글 등)은 비밀번호 변경이 불가합니다.
 *
 * @param {string} currentPassword - 현재 비밀번호
 * @param {string} newPassword - 새 비밀번호 (8자 이상)
 * @returns {Promise<void>}
 *
 * @example
 * try {
 *   await changePassword('oldpass123', 'newpass456');
 *   alert('비밀번호가 변경되었습니다.');
 * } catch (err) {
 *   alert(err.message);
 * }
 */
export async function changePassword(currentPassword, newPassword) {
  const response = await fetch(`${API_BASE_URL}/account/profile/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '비밀번호 변경에 실패했습니다');
  }
}

// ============================================
// Messaging API 함수
// ============================================

/**
 * 전화번호 형식 검증
 *
 * @param {string} phone - 검증할 전화번호
 * @returns {boolean} 유효한 형식인지 여부
 */
export function validatePhone(phone) {
  return /^010-\d{4}-\d{4}$/.test(phone);
}

/**
 * 전화번호 자동 포맷팅
 *
 * @param {string} value - 입력값
 * @returns {string} 포맷된 전화번호
 */
export function formatPhone(value) {
  const numbers = value.replace(/[^\d]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0,3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0,3)}-${numbers.slice(3,7)}-${numbers.slice(7,11)}`;
}

/**
 * 발송대상 등록
 *
 * @param {Object} request - 등록 요청 데이터
 * @param {string} request.name - 이름 (필수)
 * @param {string} request.phone - 전화번호 010-XXXX-XXXX (필수)
 * @param {string} [request.description] - 설명/메모 (선택)
 * @param {Object} [request.metadata] - 추가 데이터 객체 (선택, JSON으로 변환됨)
 * @returns {Promise<Object>} 생성된 발송대상 정보
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
export async function registerRecipient(request) {
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
 * @param {Object} [options] - 조회 옵션
 * @param {number} [options.offset=0] - 시작 위치
 * @param {number} [options.limit=20] - 조회 개수
 * @param {string} [options.keyword] - 검색어 (제목/내용)
 * @returns {Promise<Object>} 공지사항 목록
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
export async function getNoticePosts(options = {}) {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.append('offset', String(options.offset));
  if (options.limit !== undefined) params.append('limit', String(options.limit));
  if (options.keyword) params.append('keyword', options.keyword);

  const queryString = params.toString();
  const url = `${API_BASE_URL}/public/boards/notice/${getProjectId()}/posts${queryString ? `?${queryString}` : ''}`;

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
 * @param {string} postId - 게시글 ID (UUID)
 * @returns {Promise<Object>} 공지사항 상세 정보
 *
 * @example
 * const notice = await getNoticePost('550e8400-e29b-41d4-a716-446655440000');
 * console.log(notice.title, notice.content);
 */
export async function getNoticePost(postId) {
  const response = await fetch(
    `${API_BASE_URL}/public/boards/notice/${getProjectId()}/posts/${postId}`,
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
 * @param {Object} [options] - 조회 옵션
 * @param {number} [options.offset=0] - 시작 위치
 * @param {number} [options.limit=20] - 조회 개수
 * @param {string} [options.keyword] - 검색어 (제목/내용)
 * @returns {Promise<Object>} FAQ 목록 (title=질문)
 *
 * @example
 * // 기본 조회
 * const faqs = await getFaqPosts();
 *
 * @example
 * // 검색
 * const faqs = await getFaqPosts({ keyword: '배송' });
 */
export async function getFaqPosts(options = {}) {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.append('offset', String(options.offset));
  if (options.limit !== undefined) params.append('limit', String(options.limit));
  if (options.keyword) params.append('keyword', options.keyword);

  const queryString = params.toString();
  const url = `${API_BASE_URL}/public/boards/faq/${getProjectId()}/posts${queryString ? `?${queryString}` : ''}`;

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
 * @param {string} postId - 게시글 ID (UUID)
 * @returns {Promise<Object>} FAQ 상세 정보 (title=질문, content=답변)
 *
 * @example
 * const faq = await getFaqPost('550e8400-e29b-41d4-a716-446655440000');
 * console.log(`Q: ${faq.title}`);
 * console.log(`A: ${faq.content}`);
 */
export async function getFaqPost(postId) {
  const response = await fetch(
    `${API_BASE_URL}/public/boards/faq/${getProjectId()}/posts/${postId}`,
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
// Dynamic Board API 함수 (FREE/REVIEW)
// ============================================

/**
 * 동적 게시판 게시글 목록 조회 (인증 불필요)
 *
 * @param {string} boardId - 게시판 UUID (게시판 정보 JSON의 id)
 * @param {Object} [options] - 조회 옵션
 * @param {number} [options.offset=0] - 시작 위치
 * @param {number} [options.limit=20] - 조회 개수
 * @param {string} [options.keyword] - 검색어 (제목/내용)
 * @returns {Promise<Object>} 게시글 목록
 *
 * @example
 * const posts = await getBoardPosts('board-uuid', { limit: 10 });
 */
export async function getBoardPosts(boardId, options = {}) {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.append('offset', String(options.offset));
  if (options.limit !== undefined) params.append('limit', String(options.limit));
  if (options.keyword) params.append('keyword', options.keyword);

  const queryString = params.toString();
  const url = `${API_BASE_URL}/public/boards/${getProjectId()}/${boardId}/posts${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '게시글 목록 조회에 실패했습니다');
  }

  return result.data;
}

/**
 * 게시글 상세 조회 (조회수 자동 증가)
 *
 * @param {string} postId - 게시글 UUID
 * @returns {Promise<Object>} 게시글 상세 정보
 *
 * @example
 * const post = await getBoardPostDetail('post-uuid');
 */
export async function getBoardPostDetail(postId) {
  const response = await fetch(`${API_BASE_URL}/public/boards/posts/${postId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '게시글 조회에 실패했습니다');
  }

  return result.data;
}

/**
 * 게시글 작성 (로그인 필수)
 *
 * @param {string} boardId - 게시판 UUID (같은 타입 게시판이 여러 개일 수 있어 board_id로 지정)
 * @param {Object} data - 게시글 데이터
 * @param {string} data.title - 제목
 * @param {string} data.content - 내용
 * @param {number[]} [data.file_ids] - 첨부파일 ID 목록
 * @param {boolean} [data.is_hidden] - 숨김 여부
 * @param {number} [data.rating] - 별점 (1~5). REVIEW 게시판 전용
 * @returns {Promise<Object>} 생성된 게시글
 *
 * @example
 * const post = await createBoardPost(boardId, { title: '제목', content: '내용' });
 * // REVIEW 게시판: rating 포함
 * const review = await createBoardPost(boardId, { title: '후기', content: '좋아요', rating: 5 });
 */
export async function createBoardPost(boardId, data) {
  const response = await fetch(`${API_BASE_URL}/boards/${getProjectId()}/${boardId}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '게시글 작성에 실패했습니다');
  }

  return result.data;
}

/**
 * 게시글 수정 (작성자만)
 *
 * @param {string} postId - 게시글 UUID
 * @param {Object} data - 수정할 데이터
 * @returns {Promise<Object>} 수정된 게시글
 */
export async function updateBoardPost(postId, data) {
  const response = await fetch(`${API_BASE_URL}/boards/posts/${postId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '게시글 수정에 실패했습니다');
  }

  return result.data;
}

/**
 * 게시글 삭제 (작성자 또는 프로젝트 소유자)
 *
 * @param {string} postId - 게시글 UUID
 * @returns {Promise<boolean>} 삭제 성공 여부
 */
export async function deleteBoardPost(postId) {
  const response = await fetch(`${API_BASE_URL}/boards/posts/${postId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '게시글 삭제에 실패했습니다');
  }

  return result.data;
}

/**
 * 게시글 숨김 토글
 *
 * @param {string} postId - 게시글 UUID
 * @param {boolean} isHidden - true=숨김, false=해제
 * @returns {Promise<Object>} 숨김 처리된 게시글
 */
export async function toggleBoardPostHidden(postId, isHidden) {
  const response = await fetch(`${API_BASE_URL}/boards/posts/${postId}/hidden`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ is_hidden: isHidden }),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '숨김 처리에 실패했습니다');
  }

  return result.data;
}

/**
 * 댓글 목록 조회
 *
 * @param {string} postId - 게시글 UUID
 * @param {string} [sort='oldest'] - 정렬 ('oldest' | 'newest')
 * @returns {Promise<Object>} 댓글 목록 (계층 구조)
 *
 * @example
 * const comments = await getBoardComments('post-uuid');
 * comments.items.forEach(c => {
 *   console.log(c.author_name, c.content);
 *   c.replies.forEach(r => console.log('  ↳', r.author_name, r.content));
 * });
 */
export async function getBoardComments(postId, sort = 'oldest') {
  const response = await fetch(`${API_BASE_URL}/public/boards/posts/${postId}/comments?sort=${sort}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '댓글 목록 조회에 실패했습니다');
  }

  return result.data;
}

/**
 * 댓글 작성 (로그인 필수)
 *
 * @param {string} postId - 게시글 UUID
 * @param {Object} data - 댓글 데이터
 * @param {string} data.content - 댓글 내용
 * @param {string} [data.parent_id] - 부모 댓글 ID (대댓글인 경우)
 * @returns {Promise<Object>} 생성된 댓글
 *
 * @example
 * // 루트 댓글
 * await createBoardComment('post-uuid', { content: '댓글 내용' });
 *
 * // 대댓글 (1레벨만 지원)
 * await createBoardComment('post-uuid', { content: '답글', parent_id: 'comment-uuid' });
 */
export async function createBoardComment(postId, data) {
  const response = await fetch(`${API_BASE_URL}/boards/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '댓글 작성에 실패했습니다');
  }

  return result.data;
}

/**
 * 댓글 수정 (작성자만)
 *
 * @param {string} postId - 게시글 UUID
 * @param {string} commentId - 댓글 UUID
 * @param {Object} data - 수정할 내용
 * @param {string} data.content - 수정할 댓글 내용
 * @returns {Promise<Object>} 수정된 댓글
 */
export async function updateBoardComment(postId, commentId, data) {
  const response = await fetch(`${API_BASE_URL}/boards/posts/${postId}/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '댓글 수정에 실패했습니다');
  }

  return result.data;
}

/**
 * 댓글 삭제 (작성자 또는 프로젝트 소유자)
 *
 * @param {string} postId - 게시글 UUID
 * @param {string} commentId - 댓글 UUID
 * @returns {Promise<boolean>} 삭제 성공 여부
 */
export async function deleteBoardComment(postId, commentId) {
  const response = await fetch(`${API_BASE_URL}/boards/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '댓글 삭제에 실패했습니다');
  }

  return result.data;
}

/**
 * 댓글 숨김 토글
 *
 * @param {string} commentId - 댓글 UUID
 * @param {boolean} isHidden - true=숨김, false=해제
 * @returns {Promise<Object>} 숨김 처리된 댓글
 */
export async function toggleBoardCommentHidden(commentId, isHidden) {
  const response = await fetch(`${API_BASE_URL}/boards/comments/${commentId}/hidden`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ is_hidden: isHidden }),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '숨김 처리에 실패했습니다');
  }

  return result.data;
}

/**
 * 게시판 파일 업로드 (로그인 필수, 파일당 10MB 제한)
 *
 * presigned URL 방식: 작은 JSON으로 업로드 URL을 발급받고 파일은 S3로 직접 PUT 한다.
 * (큰 바이너리가 CloudFront Function 경로를 못 지나 413/403 나는 문제 해소)
 *
 * 흐름(파일당): ① POST /upload/presign → ② presign_url로 S3 PUT → ③ file_id 수집
 *
 * @param {File[]} files - 업로드할 파일 배열
 * @returns {Promise<Object>} 업로드된 파일 정보 ({ files: [{ id, file_name, url }] })
 *
 * @example
 * const uploaded = await uploadBoardFiles([file1, file2]);
 * const fileIds = uploaded.files.map(f => f.id);
 * await createBoardPost(boardId, { title: '제목', content: '내용', file_ids: fileIds });
 */
export async function uploadBoardFiles(files) {
  const uploaded = [];

  for (const file of files) {
    // ① presign 발급 (작은 JSON → CloudFront Function 경로 통과)
    const presignRes = await fetch(`${API_BASE_URL}/upload/presign?project_id=${getProjectId()}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'board_attachment',
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        size: file.size,
        with_compressed: false,
      }),
    });
    const presignJson = await presignRes.json();
    // presign 응답 envelope은 { result: true, data, message } — HTTP 상태로 성공 판정
    if (!presignRes.ok) {
      throw new Error(presignJson.message || '업로드 URL 발급에 실패했습니다');
    }
    const { original, file_id } = presignJson.data;

    // ② S3 직접 PUT (Content-Type은 presign 발급 시 값과 일치해야 함)
    const putRes = await fetch(original.presign_url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!putRes.ok) {
      throw new Error('S3 업로드에 실패했습니다');
    }

    // ③ file_id 수집 (게시글 생성 시 file_ids로 사용), url은 영구 조회용 CDN URL
    uploaded.push({ id: file_id, file_name: file.name, url: original.cdn_url });
  }

  return { files: uploaded };
}

/**
 * 게시글 신고 (로그인 필수)
 *
 * @param {string} postId - 게시글 UUID
 * @param {Object} data - 신고 데이터
 * @param {string} data.reason - 신고 사유 ('SPAM'|'ABUSE'|'HARASSMENT'|'INAPPROPRIATE'|'OTHER')
 * @param {string} [data.description] - 상세 사유
 * @returns {Promise<Object>} 신고 응답
 */
export async function reportBoardPost(postId, data) {
  const response = await fetch(`${API_BASE_URL}/boards/posts/${postId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '신고 접수에 실패했습니다');
  }

  return result.data;
}

/**
 * 댓글 신고 (로그인 필수)
 *
 * @param {string} commentId - 댓글 UUID
 * @param {Object} data - 신고 데이터
 * @param {string} data.reason - 신고 사유 ('SPAM'|'ABUSE'|'HARASSMENT'|'INAPPROPRIATE'|'OTHER')
 * @param {string} [data.description] - 상세 사유
 * @returns {Promise<Object>} 신고 응답
 */
export async function reportBoardComment(commentId, data) {
  const response = await fetch(`${API_BASE_URL}/boards/comments/${commentId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (result.result !== 'SUCCESS') {
    throw new Error(result.message || '신고 접수에 실패했습니다');
  }

  return result.data;
}