/**
 * 동적 게시판(FREE/REVIEW) transport — 읽기는 공개(/public/boards), 쓰기는 회원(/boards).
 * board_id 는 baas-cli 로 생성해 앱에 주입된 값을 넘긴다(프로젝트마다 다름).
 */
import { request } from "./http";
import { getProjectId } from "./config";

/**
 * 게시판이 정의한 분류 그룹. 관리자가 게시판 설정에서 등록한다.
 * 축이 하나면 name 이 "카테고리"(기본값)라 UI 에서 라벨을 생략해도 된다.
 */
export interface CategoryGroup {
  name: string;
  values: string[];
}

/** 게시글이 선택한 분류 — { 그룹명: [값, ...] }. 게시판 정의의 부분집합. */
export type PostCategories = Record<string, string[]>;

/** 게시판 설정 — UI 조건부 렌더링 판단에 쓴다. */
export interface BoardSettings {
  allow_comment?: boolean;
  is_board_enabled?: boolean;
  allow_attachment?: boolean;
  require_login?: boolean;
  /** 분류 그룹 정의. 미설정이면 null — 필터 UI 렌더 여부를 이 값으로 판단한다. */
  categories?: CategoryGroup[] | null;
  board_type?: string;
  [key: string]: unknown;
}

export interface BoardPost {
  id: string;
  title: string;
  content?: string;
  author_name?: string;
  views?: number;
  created_at?: string;
  /** 선택된 분류. 게시판에 분류가 없거나 글이 선택하지 않았으면 null. */
  categories?: PostCategories | null;
  [key: string]: unknown;
}

export interface PostListResult {
  items: BoardPost[];
  total?: number;
  board_settings?: BoardSettings | null;
  [key: string]: unknown;
}

export interface PostListOptions {
  offset?: number;
  limit?: number;
  keyword?: string;
  /** 이 값을 선택한 게시글만 조회 */
  category?: string;
  /** category 가 속한 분류 그룹. 지정하면 그룹 안에서만 매칭한다. */
  category_group?: string;
}

export interface PostCreateInput {
  title: string;
  content: string;
  file_ids?: string[];
  /** 선택할 분류 — 게시판 정의(board_settings.categories)의 부분집합이어야 한다. */
  categories?: PostCategories | null;
  [key: string]: unknown;
}

/** 목록 쿼리스트링 조립 — 동적 게시판과 공지/FAQ 가 공유한다. */
export function buildPostListQuery(options: PostListOptions): string {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.append("offset", String(options.offset));
  if (options.limit !== undefined) params.append("limit", String(options.limit));
  if (options.keyword) params.append("keyword", options.keyword);
  if (options.category) params.append("category", options.category);
  if (options.category_group) params.append("category_group", options.category_group);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listPosts(boardId: string, options: PostListOptions = {}): Promise<PostListResult> {
  return request<PostListResult>(
    `/public/boards/${getProjectId()}/${boardId}/posts${buildPostListQuery(options)}`
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
