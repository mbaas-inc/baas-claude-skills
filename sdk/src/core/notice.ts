/** 공지사항/FAQ (정적 게시판, 공개 읽기 전용) + 게시글 댓글. */
import { request } from "./http";
import { getProjectId } from "./config";
import type { PostListResult, BoardPost, PostListOptions } from "./board";

function listStatic(kind: "notice" | "faq", options: PostListOptions): Promise<PostListResult> {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.append("offset", String(options.offset));
  if (options.limit !== undefined) params.append("limit", String(options.limit));
  if (options.keyword) params.append("keyword", options.keyword);
  const qs = params.toString();
  return request<PostListResult>(
    `/public/boards/${kind}/${getProjectId()}/posts${qs ? `?${qs}` : ""}`
  );
}

export const listNoticePosts = (o: PostListOptions = {}) => listStatic("notice", o);
export const getNoticePost = (postId: string) =>
  request<BoardPost>(`/public/boards/notice/${getProjectId()}/posts/${postId}`);
export const listFaqPosts = (o: PostListOptions = {}) => listStatic("faq", o);
export const getFaqPost = (postId: string) =>
  request<BoardPost>(`/public/boards/faq/${getProjectId()}/posts/${postId}`);

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
