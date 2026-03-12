/**
 * BaaS 동적 게시판 댓글 React Hook
 *
 * 댓글 CRUD + 숨김 토글 + 신고 기능을 제공합니다.
 * 댓글은 1레벨 대댓글만 지원합니다 (parent_id).
 *
 * 사용법:
 * const { comments, fetchComments, createComment } = useComments();
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

import { useState, useCallback } from 'react';
import { BASE_URL } from './config';
import type {
  BoardComment,
  BoardCommentListResponse,
  BoardCommentCreateRequest,
  BoardCommentUpdateRequest,
  BoardReportCreateRequest,
  BoardReportResponse,
  UseCommentsReturn
} from './types';

/**
 * BaaS 동적 게시판 댓글 Hook
 *
 * @returns {UseCommentsReturn} 댓글 CRUD 함수와 상태
 *
 * @example
 * function CommentSection({ postId }) {
 *   const { comments, isLoading, fetchComments, createComment } = useComments();
 *
 *   useEffect(() => {
 *     fetchComments(postId);
 *   }, [postId]);
 *
 *   const handleSubmit = async (content) => {
 *     await createComment(postId, { content });
 *     await fetchComments(postId); // 목록 새로고침
 *   };
 *
 *   return (
 *     <div>
 *       {comments?.items.map(comment => (
 *         <div key={comment.id}>
 *           <p><strong>{comment.author_name}</strong>: {comment.content}</p>
 *           {comment.replies.map(reply => (
 *             <div key={reply.id} style={{ marginLeft: 24 }}>
 *               <p><strong>{reply.author_name}</strong>: {reply.content}</p>
 *             </div>
 *           ))}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 *
 * @example
 * function ReplyForm({ postId, parentId }) {
 *   const { createComment } = useComments();
 *
 *   const handleReply = async (content) => {
 *     // parent_id를 포함하면 대댓글로 생성됩니다 (1레벨만 지원)
 *     await createComment(postId, { content, parent_id: parentId });
 *   };
 *
 *   return <form onSubmit={handleReply}>{/* UI */}</form>;
 * }
 */
export function useComments(): UseCommentsReturn {
  const [comments, setComments] = useState<BoardCommentListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async (postId: string, sort: 'oldest' | 'newest' = 'oldest'): Promise<BoardCommentListResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/posts/${postId}/comments?sort=${sort}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '댓글 목록 조회에 실패했습니다');
      }

      setComments(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '댓글 목록 조회에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createComment = useCallback(async (postId: string, data: BoardCommentCreateRequest): Promise<BoardComment> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/posts/${postId}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '댓글 작성에 실패했습니다');
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '댓글 작성에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateComment = useCallback(async (postId: string, commentId: string, data: BoardCommentUpdateRequest): Promise<BoardComment> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/posts/${postId}/comments/${commentId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '댓글 수정에 실패했습니다');
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '댓글 수정에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteComment = useCallback(async (postId: string, commentId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/posts/${postId}/comments/${commentId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '댓글 삭제에 실패했습니다');
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '댓글 삭제에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleHidden = useCallback(async (commentId: string, isHidden: boolean): Promise<BoardComment> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/comments/${commentId}/hidden`,
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

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '숨김 처리에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reportComment = useCallback(async (commentId: string, data: BoardReportCreateRequest): Promise<BoardReportResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/boards/comments/${commentId}/report`,
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
    setComments(null);
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    comments,
    isLoading,
    error,
    fetchComments,
    createComment,
    updateComment,
    deleteComment,
    toggleHidden,
    reportComment,
    reset
  };
}
