/**
 * AuthProvider / useAuth / RequireAuth — 인증 상태 전역 1회 조회 패턴.
 * host React 로 createElement(JSX 미사용) 하여 앱과 동일 인스턴스에서 동작.
 */
import type { ReactNode } from "react";
import { getReact } from "./host";
import { checkAuth, clearAuthCache } from "../core/auth";
import type { AccountInfo } from "../core/types";

export interface AuthContextValue {
  isLoggedIn: boolean;
  user: AccountInfo | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  clear: () => void;
}

// context 는 host React 로 1회만 생성(모듈 로드 시점엔 React 가 없을 수 있어 지연 생성)
let _ctx: any = null;
function ctx() {
  if (!_ctx) {
    const React = getReact();
    _ctx = React.createContext<AuthContextValue | null>(null);
    _ctx.displayName = "BaasAuthContext";
  }
  return _ctx;
}

export function AuthProvider(props: { children?: ReactNode }): any {
  const React = getReact();
  const [state, setState] = React.useState<{
    isLoggedIn: boolean;
    user: AccountInfo | null;
    loading: boolean;
    error: Error | null;
  }>({ isLoggedIn: false, user: null, loading: true, error: null });

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { isLoggedIn, user } = await checkAuth({ force: true });
      setState({ isLoggedIn, user, loading: false, error: null });
    } catch (e) {
      setState({ isLoggedIn: false, user: null, loading: false, error: e as Error });
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const value: AuthContextValue = {
    isLoggedIn: state.isLoggedIn,
    user: state.user,
    loading: state.loading,
    error: state.error,
    refetch: load,
    clear: () => {
      clearAuthCache();
      setState({ isLoggedIn: false, user: null, loading: false, error: null });
    },
  };

  return React.createElement(ctx().Provider, { value }, props.children);
}

export function useAuth(): AuthContextValue {
  const React = getReact();
  const value = React.useContext(ctx());
  if (!value) {
    throw new Error("[BaaS SDK] useAuth 는 <AuthProvider> 안에서만 사용할 수 있습니다.");
  }
  return value as AuthContextValue;
}

/**
 * 로그인 필수 화면 가드. 비로그인 시 fallback(기본 null) 렌더.
 * loading 중엔 loadingFallback(기본 null).
 */
export function RequireAuth(props: {
  children?: ReactNode;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}): any {
  const React = getReact();
  const { isLoggedIn, loading } = useAuth();
  if (loading) return (props.loadingFallback ?? null) as any;
  if (!isLoggedIn) return (props.fallback ?? null) as any;
  return React.createElement(React.Fragment, null, props.children);
}
