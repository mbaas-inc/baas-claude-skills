/**
 * BaaS FAQ 조회 React Hook
 *
 * 사용법:
 * const { posts, post, isLoading, error, fetchPosts, fetchPost } = useFaq();
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

import { useState, useCallback } from 'react';
import { BASE_URL, getProjectId } from './config';
import type {
  FaqListResponse,
  FaqResponse,
  FaqFetchOptions,
  UseFaqReturn
} from './types';

// ============================================
// Hook 구현
// ============================================

/**
 * BaaS FAQ 조회 Hook
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * FAQ는 title=질문, content=답변 구조입니다.
 *
 * @returns {UseFaqReturn} 조회 함수와 상태
 *
 * @example
 * function FaqList() {
 *   const { posts, isLoading, error, fetchPosts } = useFaq();
 *   const [expandedId, setExpandedId] = useState(null);
 *
 *   useEffect(() => {
 *     fetchPosts();
 *   }, []);
 *
 *   if (isLoading) return <p>로딩 중...</p>;
 *   if (error) return <p className="error">{error}</p>;
 *
 *   return (
 *     <div className="faq-list">
 *       {posts?.items.map(faq => (
 *         <div key={faq.id} className="faq-item">
 *           <button onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}>
 *             Q: {faq.title}
 *           </button>
 *           {expandedId === faq.id && <FaqAnswer faqId={faq.id} />}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 *
 * @example
 * function FaqAnswer({ faqId }) {
 *   const { post, isLoading, fetchPost } = useFaq();
 *
 *   useEffect(() => {
 *     fetchPost(faqId);
 *   }, [faqId]);
 *
 *   if (isLoading) return <p>로딩 중...</p>;
 *
 *   return (
 *     <div className="faq-answer">
 *       <p>A: {post?.content}</p>
 *     </div>
 *   );
 * }
 *
 * @example
 * // 검색 기능
 * function FaqSearch() {
 *   const { posts, fetchPosts, isLoading } = useFaq();
 *   const [keyword, setKeyword] = useState('');
 *
 *   const handleSearch = () => {
 *     fetchPosts({ keyword });
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         value={keyword}
 *         onChange={e => setKeyword(e.target.value)}
 *         placeholder="검색어를 입력하세요"
 *       />
 *       <button onClick={handleSearch} disabled={isLoading}>
 *         검색
 *       </button>
 *     </div>
 *   );
 * }
 */
export function useFaq(): UseFaqReturn {
  const [posts, setPosts] = useState<FaqListResponse | null>(null);
  const [post, setPost] = useState<FaqResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async (options: FaqFetchOptions = {}): Promise<FaqListResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.offset !== undefined) params.append('offset', String(options.offset));
      if (options.limit !== undefined) params.append('limit', String(options.limit));
      if (options.keyword) params.append('keyword', options.keyword);

      const queryString = params.toString();
      const url = `${BASE_URL}/public/board/faq/${getProjectId()}/posts${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || 'FAQ 목록 조회에 실패했습니다');
      }

      setPosts(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'FAQ 목록 조회에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPost = useCallback(async (postId: string): Promise<FaqResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/public/board/faq/${getProjectId()}/posts/${postId}`,
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

      setPost(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'FAQ 조회에 실패했습니다';
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
