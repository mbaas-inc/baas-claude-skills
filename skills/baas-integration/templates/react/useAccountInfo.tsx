/**
 * BaaS 계정 정보 React Hook
 *
 * 사용법:
 * const { data: account, isLoading, error, refetch } = useAccountInfo();
 * // account?.name
 */

import { useState, useEffect, useCallback } from 'react';

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

// ============================================
// 타입 정의
// ============================================

interface AccountResponse {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  is_profile_completed: boolean;
  last_logged_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
}

interface UseAccountInfoOptions {
  /** 자동 조회 여부 (기본: true) */
  enabled?: boolean;
  /** 인증 실패 시 리다이렉트 URL */
  redirectOnUnauthorized?: string;
  /** 에러 발생 시 콜백 */
  onError?: (error: Error) => void;
}

interface UseAccountInfoReturn {
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
// Hook 구현
// ============================================

/**
 * BaaS 계정 정보 Hook
 *
 * @param {UseAccountInfoOptions} [options] - 옵션
 * @returns {UseAccountInfoReturn} 계정 정보와 상태
 *
 * @example
 * // 기본 사용법 - 마운트 시 자동 조회
 * function ProfilePage() {
 *   const { data: account, isLoading, error } = useAccountInfo();
 *
 *   if (isLoading) return <div>로딩 중...</div>;
 *   if (error) return <div>에러: {error}</div>;
 *   if (!account) return <div>로그인이 필요합니다</div>;
 *
 *   return (
 *     <div>
 *       <h1>안녕하세요, {account.name}님!</h1>
 *       <p>이메일: {account.user_id}</p>
 *     </div>
 *   );
 * }
 *
 * @example
 * // 옵션 사용
 * function Dashboard() {
 *   const { data: account, refetch } = useAccountInfo({
 *     redirectOnUnauthorized: '/login'
 *   });
 *
 *   return (
 *     <div>
 *       {account && <span>환영합니다, {account.name}님</span>}
 *       <button onClick={refetch}>새로고침</button>
 *     </div>
 *   );
 * }
 */
export function useAccountInfo(options: UseAccountInfoOptions = {}): UseAccountInfoReturn {
  const { enabled = true, redirectOnUnauthorized, onError } = options;
  const [data, setData] = useState<AccountResponse | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchAccountInfo = useCallback(async (): Promise<AccountResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/account/info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        if (result.errorCode === 'UNAUTHORIZED' && redirectOnUnauthorized) {
          window.location.href = redirectOnUnauthorized;
          return null;
        }
        throw new Error(result.message || '계정 정보를 가져올 수 없습니다');
      }

      setData(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '계정 정보를 가져올 수 없습니다';
      setError(message);
      onError?.(err instanceof Error ? err : new Error(message));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [redirectOnUnauthorized, onError]);

  const reset = useCallback(() => {
    setData(null);
    setIsLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (enabled) {
      fetchAccountInfo();
    }
  }, [enabled, fetchAccountInfo]);

  return { data, isLoading, error, refetch: fetchAccountInfo, reset };
}

export type { AccountResponse, UseAccountInfoOptions, UseAccountInfoReturn };