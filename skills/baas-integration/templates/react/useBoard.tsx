/**
 * BaaS 동적 게시판 React Hook (FREE/REVIEW)
 *
 * 게시글 CRUD + 파일 업로드 + 신고 기능을 제공합니다.
 * 읽기는 인증 불필요(/public/board/), 쓰기는 로그인 필수(/boards/).
 *
 * 사용법:
 * const { posts, post, fetchPosts, createPost, uploadFiles } = useBoard();
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

import { useState, useCallback } from 'react';
import { BASE_URL, getProjectId } from './config';
import type {
  BoardPostListResponse,
  BoardPostDetail,
  BoardPostCreateRequest,
  BoardPostUpdateRequest,
  BoardPostFetchOptions,
  BoardFileUploadResponse,
  BoardReportCreateRequest,
  BoardReportResponse,
  UseBoardReturn
} from './types';

/**
 * BaaS 동적 게시판 Hook
 *
 * 게시판 정보 JSON에서 id(board_id)와 board_type을 확인 후 사용합니다.
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * @returns {UseBoardReturn} CRUD 함수와 상태
 *
 * @example
 * function BoardList({ boardId }) {
 *   const { posts, isLoading, error, fetchPosts } = useBoard();
 *
 *   useEffect(() => {
 *     fetchPosts(boardId, { limit: 20 });
 *   }, [boardId]);
 *
 *   if (isLoading) return <p>로딩 중...</p>;
 *   if (error) return <p className="error">{error}</p>;
 *
 *   return (
 *     <ul>
 *       {posts?.items.map(post => (
 *         <li key={post.id}>
 *           <h3>{post.title}</h3>
 *           <span>조회수: {post.views}</span>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 *
 * @example
 * function CreatePostForm({ boardType }) {
 *   const { createPost, uploadFiles, isLoading } = useBoard();
 *
 *   const handleSubmit = async (title, content, files) => {
 *     let fileIds;
 *     if (files?.length) {
 *       const uploaded = await uploadFiles(files);
 *       fileIds = uploaded.files.map(f => f.id);
 *     }
 *     await createPost(boardType, { title, content, file_ids: fileIds });
 *   };
 *
 *   return <form onSubmit={handleSubmit}>{/* UI */}</form>;
 * }
 */
export function useBoard(): UseBoardReturn {
  const [posts, setPosts] = useState<BoardPostListResponse | null>(null);
  const [post, setPost] = useState<BoardPostDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async (boardId: string, options: BoardPostFetchOptions = {}): Promise<BoardPostListResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.offset !== undefined) params.append('offset', String(options.offset));
      if (options.limit !== undefined) params.append('limit', String(options.limit));
      if (options.keyword) params.append('keyword', options.keyword);

      const queryString = params.toString();
      const url = `${BASE_URL}/public/board/${getProjectId()}/${boardId}/posts${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '게시글 목록 조회에 실패했습니다');
      }

      setPosts(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시글 목록 조회에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPost = useCallback(async (postId: string): Promise<BoardPostDetail> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/public/board/posts/${postId}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '게시글 조회에 실패했습니다');
      }

      setPost(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시글 조회에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPost = useCallback(async (boardType: 'FREE' | 'REVIEW', data: BoardPostCreateRequest): Promise<BoardPostDetail> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/${getProjectId()}/posts?type=${boardType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '게시글 작성에 실패했습니다');
      }

      setPost(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시글 작성에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePost = useCallback(async (postId: string, data: BoardPostUpdateRequest): Promise<BoardPostDetail> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/posts/${postId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '게시글 수정에 실패했습니다');
      }

      setPost(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시글 수정에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deletePost = useCallback(async (postId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/posts/${postId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '게시글 삭제에 실패했습니다');
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시글 삭제에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleHidden = useCallback(async (postId: string, isHidden: boolean): Promise<BoardPostDetail> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/posts/${postId}/hidden`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ is_hidden: isHidden }),
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '숨김 처리에 실패했습니다');
      }

      setPost(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '숨김 처리에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadFiles = useCallback(async (files: File[]): Promise<BoardFileUploadResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await fetch(
        `${BASE_URL}/boards/files?project_id=${getProjectId()}`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '파일 업로드에 실패했습니다');
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '파일 업로드에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reportPost = useCallback(async (postId: string, data: BoardReportCreateRequest): Promise<BoardReportResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/posts/${postId}/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '신고 접수에 실패했습니다');
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '신고 접수에 실패했습니다';
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
    createPost,
    updatePost,
    deletePost,
    toggleHidden,
    uploadFiles,
    reportPost,
    reset
  };
}
