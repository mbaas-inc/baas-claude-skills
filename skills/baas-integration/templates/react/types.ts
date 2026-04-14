/**
 * BaaS API React Hooks 타입 정의
 *
 * 모든 훅에서 사용하는 타입을 정의합니다.
 */

// ============================================
// 공통 타입
// ============================================

/** 계정 정보 응답 */
export interface AccountResponse {
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
// useLogin 타입
// ============================================

/** 로그인 토큰 응답 */
export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

/** useLogin 반환 타입 */
export interface UseLoginReturn {
  /** 로그인 함수 */
  login: (userId: string, userPw: string) => Promise<TokenResponse>;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 토큰 데이터 */
  data: TokenResponse | null;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// useSignup 타입
// ============================================

/** 회원가입 추가 옵션 */
export interface SignupOptions {
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  data?: Record<string, unknown>;
}

/** useSignup 반환 타입 */
export interface UseSignupReturn {
  /** 회원가입 함수 */
  signup: (userId: string, userPw: string, name: string, phone: string, options?: SignupOptions) => Promise<AccountResponse>;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 생성된 계정 데이터 */
  data: AccountResponse | null;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// useLogout 타입
// ============================================

/** useLogout 옵션 */
export interface UseLogoutOptions {
  /** 로그아웃 성공 후 리다이렉트 URL */
  redirectTo?: string;
  /** 로그아웃 성공 후 콜백 */
  onSuccess?: () => void;
  /** 로그아웃 실패 후 콜백 */
  onError?: (error: Error) => void;
}

/** useLogout 반환 타입 */
export interface UseLogoutReturn {
  /** 로그아웃 함수 */
  logout: () => Promise<void>;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// useAccountInfo 타입
// ============================================

/** useAccountInfo 옵션 */
export interface UseAccountInfoOptions {
  /** 자동 조회 여부 (기본: true) */
  enabled?: boolean;
  /** 인증 실패 시 리다이렉트 URL */
  redirectOnUnauthorized?: string;
  /** 에러 발생 시 콜백 */
  onError?: (error: Error) => void;
}

/** useAccountInfo 반환 타입 */
export interface UseAccountInfoReturn {
  /** 계정 데이터 */
  data: AccountResponse | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 데이터 재조회 */
  refetch: () => Promise<AccountResponse | null>;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// useRecipient 타입
// ============================================

/** 발송대상 등록 요청 */
export interface RecipientCreateRequest {
  name: string;
  phone: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** 발송대상 응답 */
export interface RecipientResponse {
  id: string;
  project_id: string;
  name: string;
  phone: string;
  description: string | null;
  data: string;
  created_at: string;
  removed_at: string | null;
}

/** useRecipient 반환 타입 */
export interface UseRecipientReturn {
  /** 발송대상 등록 함수 */
  register: (request: RecipientCreateRequest) => Promise<RecipientResponse>;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 등록된 발송대상 데이터 */
  data: RecipientResponse | null;
  /** 상태 초기화 */
  reset: () => void;
  /** 전화번호 검증 */
  validatePhone: (phone: string) => boolean;
  /** 전화번호 포맷팅 */
  formatPhone: (value: string) => string;
}

// ============================================
// useNotice 타입
// ============================================

/** 첨부파일 응답 */
export interface FileResponse {
  id: number;
  file_name: string;
  url: string;
}

/** 게시글 목록 아이템 */
export interface PostListItem {
  id: string;
  title: string;
  views: number;
  recommends: number;
  author_name: string;
  is_hidden: boolean;
  created_at: string;
}

/** 게시판 설정 (런타임) */
export interface BoardSettings {
  allow_comment: boolean;
  is_board_enabled: boolean;
  require_login: boolean;
  allow_attachment: boolean;
}

/** 게시글 목록 응답 */
export interface PostListResponse {
  items: PostListItem[];
  total_count: number;
  offset: number;
  limit: number;
  board_settings: BoardSettings | null;
}

/** 게시글 상세 응답 */
export interface PostResponse {
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
  board_settings: BoardSettings | null;
}

/** 게시글 조회 옵션 */
export interface PostFetchOptions {
  offset?: number;
  limit?: number;
  keyword?: string;
}

/** useNotice 반환 타입 */
export interface UseNoticeReturn {
  /** 공지사항 목록 */
  posts: PostListResponse | null;
  /** 공지사항 상세 */
  post: PostResponse | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 공지사항 목록 조회 함수 */
  fetchPosts: (options?: PostFetchOptions) => Promise<PostListResponse>;
  /** 공지사항 상세 조회 함수 */
  fetchPost: (postId: string) => Promise<PostResponse>;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// useFaq 타입
// ============================================

/** FAQ 목록 아이템 (title=질문, content=답변) */
export interface FaqListItem {
  id: string;
  title: string;
  content: string;
  views: number;
  recommends: number;
  author_name: string;
  category_id: string;
  category_name: string;
  is_hidden: boolean;
  created_at: string;
}

/** FAQ 목록 응답 */
export interface FaqListResponse {
  items: FaqListItem[];
  total_count: number;
  offset: number;
  limit: number;
  board_settings: BoardSettings | null;
}

/** FAQ 상세 응답 (title=질문, content=답변) */
export interface FaqResponse {
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
  board_settings: BoardSettings | null;
}

/** FAQ 조회 옵션 */
export interface FaqFetchOptions {
  offset?: number;
  limit?: number;
  keyword?: string;
}

/** useFaq 반환 타입 */
export interface UseFaqReturn {
  /** FAQ 목록 */
  posts: FaqListResponse | null;
  /** FAQ 상세 */
  post: FaqResponse | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** FAQ 목록 조회 함수 */
  fetchPosts: (options?: FaqFetchOptions) => Promise<FaqListResponse>;
  /** FAQ 상세 조회 함수 */
  fetchPost: (postId: string) => Promise<FaqResponse>;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// useBoard 타입 (동적 게시판 — FREE/REVIEW)
// ============================================

/** 동적 게시판 게시글 목록 아이템 */
export interface BoardPostListItem {
  id: string;
  title: string;
  content?: string;
  views: number;
  author_name: string;
  is_hidden: boolean;
  created_at: string;
}

/** 동적 게시판 게시글 목록 응답 */
export interface BoardPostListResponse {
  items: BoardPostListItem[];
  total_count: number;
  offset: number;
  limit: number;
  board_settings: BoardSettings | null;
}

/** 동적 게시판 게시글 상세 응답 */
export interface BoardPostDetail {
  id: string;
  board_id: string;
  title: string;
  content: string;
  views: number;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string | null;
  attachments: FileResponse[];
  board_settings: BoardSettings | null;
}

/** 게시글 작성 요청 */
export interface BoardPostCreateRequest {
  title: string;
  content: string;
  file_ids?: number[];
  is_hidden?: boolean;
}

/** 게시글 수정 요청 */
export interface BoardPostUpdateRequest {
  title?: string;
  content?: string;
  file_ids?: number[];
}

/** 게시글 목록 조회 옵션 */
export interface BoardPostFetchOptions {
  offset?: number;
  limit?: number;
  keyword?: string;
}

/** 첨부파일 업로드 응답 */
export interface BoardFileUploadResponse {
  files: FileResponse[];
}

/** 신고 접수 요청 */
export interface BoardReportCreateRequest {
  reason: 'SPAM' | 'ABUSE' | 'HARASSMENT' | 'INAPPROPRIATE' | 'OTHER';
  description?: string;
}

/** 신고 응답 */
export interface BoardReportResponse {
  id: string;
  project_id: string;
  target_type: 'POST' | 'COMMENT';
  target_id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
}

/** useBoard 반환 타입 */
export interface UseBoardReturn {
  /** 게시글 목록 */
  posts: BoardPostListResponse | null;
  /** 게시글 상세 */
  post: BoardPostDetail | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 게시글 목록 조회 (공개 API, 인증 불필요) */
  fetchPosts: (boardId: string, options?: BoardPostFetchOptions) => Promise<BoardPostListResponse>;
  /** 게시글 상세 조회 (선택적 인증) */
  fetchPost: (postId: string) => Promise<BoardPostDetail>;
  /** 게시글 작성 (인증 필수) */
  createPost: (boardType: 'FREE' | 'REVIEW', data: BoardPostCreateRequest) => Promise<BoardPostDetail>;
  /** 게시글 수정 (작성자만) */
  updatePost: (postId: string, data: BoardPostUpdateRequest) => Promise<BoardPostDetail>;
  /** 게시글 삭제 (작성자 또는 소유자) */
  deletePost: (postId: string) => Promise<boolean>;
  /** 게시글 숨김 토글 */
  toggleHidden: (postId: string, isHidden: boolean) => Promise<BoardPostDetail>;
  /** 파일 업로드 */
  uploadFiles: (files: File[]) => Promise<BoardFileUploadResponse>;
  /** 게시글 신고 */
  reportPost: (postId: string, data: BoardReportCreateRequest) => Promise<BoardReportResponse>;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// useComments 타입 (동적 게시판 댓글)
// ============================================

/** 댓글 응답 */
export interface BoardComment {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  parent_id: string | null;
  content: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string | null;
}

/** 루트 댓글 + 대댓글 목록 */
export interface BoardCommentWithReplies {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  content: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string | null;
  replies: BoardComment[];
}

/** 댓글 목록 응답 */
export interface BoardCommentListResponse {
  items: BoardCommentWithReplies[];
  total_count: number;
}

/** 댓글 작성 요청 */
export interface BoardCommentCreateRequest {
  content: string;
  parent_id?: string;
}

/** 댓글 수정 요청 */
export interface BoardCommentUpdateRequest {
  content: string;
}

/** useComments 반환 타입 */
export interface UseCommentsReturn {
  /** 댓글 목록 */
  comments: BoardCommentListResponse | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 댓글 목록 조회 */
  fetchComments: (postId: string, sort?: 'oldest' | 'newest') => Promise<BoardCommentListResponse>;
  /** 댓글 작성 (인증 필수) */
  createComment: (postId: string, data: BoardCommentCreateRequest) => Promise<BoardComment>;
  /** 댓글 수정 (작성자만) */
  updateComment: (postId: string, commentId: string, data: BoardCommentUpdateRequest) => Promise<BoardComment>;
  /** 댓글 삭제 (작성자 또는 소유자) */
  deleteComment: (postId: string, commentId: string) => Promise<boolean>;
  /** 댓글 숨김 토글 */
  toggleHidden: (commentId: string, isHidden: boolean) => Promise<BoardComment>;
  /** 댓글 신고 */
  reportComment: (commentId: string, data: BoardReportCreateRequest) => Promise<BoardReportResponse>;
  /** 상태 초기화 */
  reset: () => void;
}
