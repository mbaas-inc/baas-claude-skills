/**
 * BaaS 전역 인증 상태 Provider
 *
 * 인증 상태는 앱 루트에서 1회만 조회합니다.
 * AuthProvider가 /account/info를 호출하는 앱의 유일한 지점이며,
 * 각 화면은 useAuth()로 전역 상태를 읽기만 합니다.
 * (화면마다 useAccountInfo()를 직접 호출하면 페이지 이동 시마다
 *  /account/info가 중복 호출되고 비로그인 시 401이 반복 발생합니다)
 *
 * 사용법:
 * 1. 앱 루트를 <AuthProvider>로 감싼다
 * 2. 화면에서는 const { user, isLoggedIn, isLoading } = useAuth();
 * 3. 로그인 성공 직후 await refetch(), 로그아웃 직후 clear()
 * 4. 로그인 필수 화면은 <RequireAuth>로 감싼다
 */

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';
import { useAccountInfo } from './useAccountInfo';
import type { AuthContextValue } from './types';

// ============================================
// Context
// ============================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================
// AuthProvider
// ============================================

/**
 * 전역 인증 상태 Provider
 *
 * 마운트 시 /account/info를 1회 호출해 로그인 여부를 판단하고,
 * 결과를 Context로 하위 전체에 공유합니다.
 * 비로그인 401은 에러가 아닌 정상 신호이므로 user=null로 처리됩니다.
 *
 * @example
 * // 앱 루트 래핑 (Vite/CRA: main.tsx, Next.js Pages: _app.tsx, App Router: layout.tsx)
 * import { AuthProvider } from './react';
 *
 * createRoot(document.getElementById('root')!).render(
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 * );
 *
 * @example
 * // 로그인 성공 직후 전역 상태 갱신
 * function LoginPage() {
 *   const { login } = useLogin();
 *   const { refetch } = useAuth();
 *
 *   const handleLogin = async (userId: string, userPw: string) => {
 *     await login(userId, userPw);
 *     await refetch(); // 전역 인증 상태 갱신
 *   };
 * }
 *
 * @example
 * // 로그아웃 직후 전역 상태 초기화
 * function LogoutButton() {
 *   const { clear } = useAuth();
 *   const { logout } = useLogout({ onSuccess: () => clear() });
 *
 *   return <button onClick={logout}>로그아웃</button>;
 * }
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // 앱에서 유일한 useAccountInfo 직접 호출 지점
  const { data: user, isLoading, error, refetch, reset } = useAccountInfo();

  const value: AuthContextValue = {
    user,
    isLoggedIn: user !== null,
    isLoading,
    error,
    refetch,
    clear: reset,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================
// useAuth
// ============================================

/**
 * 전역 인증 상태 Hook
 *
 * 화면에서 로그인 여부/사용자 정보가 필요할 때 사용합니다.
 * API를 호출하지 않고 AuthProvider가 보관한 상태를 읽기만 합니다.
 *
 * @example
 * function Header() {
 *   const { user, isLoggedIn, isLoading } = useAuth();
 *
 *   if (isLoading) return null;
 *   return isLoggedIn ? <span>{user.name}님</span> : <a href="/login">로그인</a>;
 * }
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth는 <AuthProvider> 내부에서만 사용할 수 있습니다');
  }
  return context;
}

// ============================================
// RequireAuth (로그인 가드)
// ============================================

interface RequireAuthProps {
  children: ReactNode;
  /** 비로그인 시 이동할 경로 (기본: /login) */
  redirectTo?: string;
  /** 비로그인 시 리다이렉트 대신 표시할 UI */
  fallback?: ReactNode;
  /** 초기 인증 확인 중 표시할 UI */
  loadingFallback?: ReactNode;
}

/**
 * 로그인 필수 화면 가드
 *
 * 초기 인증 확인이 끝날 때까지 대기한 후,
 * 비로그인이면 redirectTo로 이동(또는 fallback 표시)합니다.
 * 라우터에 의존하지 않으므로 어떤 프레임워크에서도 사용 가능합니다.
 *
 * @example
 * // 기본 사용법 - 비로그인 시 /login으로 이동
 * <RequireAuth>
 *   <MyPage />
 * </RequireAuth>
 *
 * @example
 * // react-router 사용 시 <Navigate> 변형
 * import { Navigate } from 'react-router-dom';
 *
 * function ProtectedRoute({ children }: { children: ReactNode }) {
 *   const { isLoggedIn, isLoading } = useAuth();
 *   if (isLoading) return <div>로딩 중...</div>;
 *   return isLoggedIn ? children : <Navigate to="/login" replace />;
 * }
 */
export function RequireAuth({
  children,
  redirectTo = '/login',
  fallback,
  loadingFallback = null,
}: RequireAuthProps) {
  const { isLoggedIn, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isLoggedIn && !fallback) {
      window.location.href = redirectTo;
    }
  }, [isLoading, isLoggedIn, fallback, redirectTo]);

  if (isLoading) return <>{loadingFallback}</>;
  if (!isLoggedIn) return <>{fallback ?? null}</>;
  return <>{children}</>;
}
