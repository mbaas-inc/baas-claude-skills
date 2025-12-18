/**
 * BaaS 공지사항 조회 React Hook
 *
 * 사용법:
 * const { posts, post, isLoading, error, fetchPosts, fetchPost } = useNotice();
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

import { useState, useCallback } from 'react';

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

/**
 * 환경변수에서 project_id를 가져옵니다.
 */
function getProjectId(): string {
  const projectId =
    process.env.REACT_APP_BAAS_PROJECT_ID ||
    process.env.NEXT_PUBLIC_BAAS_PROJECT_ID ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BAAS_PROJECT_ID);

  if (!projectId) {
    throw new Error(
      '[BaaS] project_id 환경변수 필요:\n' +
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

interface UseNoticeReturn {
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
// Hook 구현
// ============================================

/**
 * BaaS 공지사항 조회 Hook
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * @returns {UseNoticeReturn} 조회 함수와 상태
 *
 * @example
 * function NoticeList() {
 *   const { posts, isLoading, error, fetchPosts } = useNotice();
 *
 *   useEffect(() => {
 *     fetchPosts();
 *   }, []);
 *
 *   if (isLoading) return <p>로딩 중...</p>;
 *   if (error) return <p className="error">{error}</p>;
 *
 *   return (
 *     <ul>
 *       {posts?.items.map(notice => (
 *         <li key={notice.id}>
 *           <h3>{notice.title}</h3>
 *           <span>조회수: {notice.views}</span>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 *
 * @example
 * function NoticeDetail({ noticeId }) {
 *   const { post, isLoading, error, fetchPost } = useNotice();
 *
 *   useEffect(() => {
 *     fetchPost(noticeId);
 *   }, [noticeId]);
 *
 *   if (isLoading) return <p>로딩 중...</p>;
 *   if (error) return <p className="error">{error}</p>;
 *
 *   return (
 *     <article>
 *       <h1>{post?.title}</h1>
 *       <div dangerouslySetInnerHTML={{ __html: post?.content || '' }} />
 *     </article>
 *   );
 * }
 */
export function useNotice(): UseNoticeReturn {
  const [posts, setPosts] = useState<PostListResponse | null>(null);
  const [post, setPost] = useState<PostResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async (options: PostFetchOptions = {}): Promise<PostListResponse> => {
    setIsLoading(true);
    setError(null);

    try {
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

      setPosts(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '공지사항 목록 조회에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPost = useCallback(async (postId: string): Promise<PostResponse> => {
    setIsLoading(true);
    setError(null);

    try {
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

      setPost(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '공지사항 조회에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setPosts(null);
    setPost(null);
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    posts,
    post,
    isLoading,
    error,
    fetchPosts,
    fetchPost,
    reset
  };
}

export type {
  FileResponse,
  PostListItem,
  PostListResponse,
  PostResponse,
  PostFetchOptions,
  UseNoticeReturn
};
