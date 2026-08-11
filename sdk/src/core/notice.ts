/** 공지사항/FAQ (정적 게시판, 공개 읽기 전용) + 게시글 댓글. */
import { request } from "./http";
import { getProjectId } from "./config";
import { buildPostListQuery } from "./board";
import type { PostListResult, BoardPost, PostListOptions } from "./board";

// 통합 엔드포인트 사용 — 레거시 /public/boards/{notice|faq}/{pid}/posts 는
// category 파라미터를 받지 않아 필터가 조용히 무시된다.
function listStatic(kind: "NOTICE" | "FAQ", options: PostListOptions): Promise<PostListResult> {
  return request<PostListResult>(
    `/public/boards/${getProjectId()}/${kind}/posts${buildPostListQuery(options)}`
  );
}

export const listNoticePosts = (o: PostListOptions = {}) => listStatic("NOTICE", o);
export const listFaqPosts = (o: PostListOptions = {}) => listStatic("FAQ", o);

// 상세는 board_type 무관 공용 엔드포인트 — 동적 게시판의 getPost 와 같은 경로다.
export const getNoticePost = (postId: string) =>
  request<BoardPost>(`/public/boards/posts/${postId}`);
export const getFaqPost = (postId: string) =>
  request<BoardPost>(`/public/boards/posts/${postId}`);

// ── 댓글 (동적 게시판 게시글) ──
export interface Comment {
  id: string;
  content: string;
  author_name?: string;
  created_at?: string;
  [key: string]: unknown;
}

export const listComments = (postId: string, sort = "latest") =>
  request<Comment[]>(`/public/boards/posts/${postId}/comments?sort=${sort}`);
export const createComment = (postId: string, data: { content: string; [k: string]: unknown }) =>
  request<Comment>(`/boards/posts/${postId}/comments`, { method: "POST", body: data });
export const updateComment = (postId: string, commentId: string, data: { content: string }) =>
  request<Comment>(`/boards/posts/${postId}/comments/${commentId}`, { method: "PUT", body: data });
export const deleteComment = (postId: string, commentId: string) =>
  request<boolean>(`/boards/posts/${postId}/comments/${commentId}`, { method: "DELETE" });
