/**
 * 동적 게시판(FREE/REVIEW) transport — 읽기는 공개(/public/boards), 쓰기는 회원(/boards).
 * board_id 는 baas-cli 로 생성해 앱에 주입된 값을 넘긴다(프로젝트마다 다름).
 */
import { request } from "./http";
import { getProjectId } from "./config";

export interface BoardPost {
  id: string;
  title: string;
  content?: string;
  author_name?: string;
  views?: number;
  created_at?: string;
  [key: string]: unknown;
}

export interface PostListResult {
  items: BoardPost[];
  total?: number;
  [key: string]: unknown;
}

export interface PostListOptions {
  offset?: number;
  limit?: number;
  keyword?: string;
}

export interface PostCreateInput {
  title: string;
  content: string;
  file_ids?: string[];
  [key: string]: unknown;
}

export function listPosts(boardId: string, options: PostListOptions = {}): Promise<PostListResult> {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.append("offset", String(options.offset));
  if (options.limit !== undefined) params.append("limit", String(options.limit));
  if (options.keyword) params.append("keyword", options.keyword);
  const qs = params.toString();
  return request<PostListResult>(
    `/public/boards/${getProjectId()}/${boardId}/posts${qs ? `?${qs}` : ""}`
  );
}

export function getPost(postId: string): Promise<BoardPost> {
  return request<BoardPost>(`/public/boards/posts/${postId}`);
}

export function createPost(boardId: string, data: PostCreateInput): Promise<BoardPost> {
  return request<BoardPost>(`/boards/${getProjectId()}/${boardId}/posts`, {
    method: "POST",
    body: data,
  });
}

export function updatePost(postId: string, data: Partial<PostCreateInput>): Promise<BoardPost> {
  return request<BoardPost>(`/boards/posts/${postId}`, { method: "PUT", body: data });
}

export function deletePost(postId: string): Promise<boolean> {
  return request<boolean>(`/boards/posts/${postId}`, { method: "DELETE" });
}
