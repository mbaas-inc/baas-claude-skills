/**
 * BaaS 비밀번호 변경 React Hook
 *
 * 사용법:
 * const { changePassword, isLoading, error, isSuccess } = useChangePassword();
 * await changePassword('oldpass123', 'newpass456');
 *
 * 인증된 사용자만 본인의 비밀번호를 변경할 수 있습니다.
 * SNS 로그인 계정(카카오/네이버/구글 등)은 비밀번호 변경이 불가합니다.
 */

import { useState, useCallback } from 'react';
import { BASE_URL } from './config';
import type { UseChangePasswordReturn } from './types';

// ============================================
// Hook 구현
// ============================================

/**
 * BaaS 비밀번호 변경 Hook
 *
 * 쿠키 기반 인증을 사용하므로 로그인 상태에서만 호출 가능합니다.
 *
 * @returns {UseChangePasswordReturn} 비밀번호 변경 함수와 상태
 *
 * @example
 * function ChangePasswordForm() {
 *   const { changePassword, isLoading, error, isSuccess, reset } = useChangePassword();
 *   const [currentPw, setCurrentPw] = useState('');
 *   const [newPw, setNewPw] = useState('');
 *
 *   const handleSubmit = async (e: React.FormEvent) => {
 *     e.preventDefault();
 *     try {
 *       await changePassword(currentPw, newPw);
 *       setCurrentPw('');
 *       setNewPw('');
 *     } catch (err) {
 *       // 에러는 error 상태로 자동 관리됨
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input
 *         type="password"
 *         value={currentPw}
 *         onChange={e => setCurrentPw(e.target.value)}
 *         placeholder="현재 비밀번호"
 *       />
 *       <input
 *         type="password"
 *         value={newPw}
 *         onChange={e => setNewPw(e.target.value)}
 *         placeholder="새 비밀번호 (8자 이상)"
 *       />
 *       {error && <p className="error">{error}</p>}
 *       {isSuccess && <p className="success">비밀번호가 변경되었습니다.</p>}
 *       <button type="submit" disabled={isLoading}>
 *         {isLoading ? '변경 중...' : '비밀번호 변경'}
 *       </button>
 *     </form>
 *   );
 * }
 */
export function useChangePassword(): UseChangePasswordReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      const response = await fetch(`${BASE_URL}/account/profile/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '비밀번호 변경에 실패했습니다');
      }

      setIsSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setIsSuccess(false);
  }, []);

  return { changePassword, isLoading, error, isSuccess, reset };
}
