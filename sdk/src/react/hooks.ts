/**
 * 인증 동작 훅 — useLogin / useSignup / useLogout.
 * 상태(loading/error) + 동작만 제공. 성공 후 AuthProvider 갱신은 useAuth().refetch()/clear() 로.
 */
import { getReact } from "./host";
import { login as apiLogin, signup as apiSignup, logout as apiLogout } from "../core/auth";
import { useAuth } from "./AuthProvider";
import type { AccountInfo, SignupOptions } from "../core/types";

interface ActionState {
  loading: boolean;
  error: Error | null;
}

export function useLogin() {
  const React = getReact();
  const { refetch } = useAuth();
  const [state, setState] = React.useState<ActionState>({ loading: false, error: null });

  const login = React.useCallback(
    async (userId: string, userPw: string): Promise<boolean> => {
      setState({ loading: true, error: null });
      try {
        await apiLogin(userId, userPw);
        await refetch(); // 전역 인증 상태 갱신
        setState({ loading: false, error: null });
        return true;
      } catch (e) {
        setState({ loading: false, error: e as Error });
        return false;
      }
    },
    [refetch]
  );

  return { login, loading: state.loading, error: state.error };
}

export function useSignup() {
  const React = getReact();
  const [state, setState] = React.useState<ActionState>({ loading: false, error: null });

  const signup = React.useCallback(
    async (
      userId: string,
      userPw: string,
      name: string,
      phone: string,
      options: SignupOptions = {}
    ): Promise<AccountInfo | null> => {
      setState({ loading: true, error: null });
      try {
        const account = await apiSignup(userId, userPw, name, phone, options);
        setState({ loading: false, error: null });
        return account;
      } catch (e) {
        setState({ loading: false, error: e as Error });
        return null;
      }
    },
    []
  );

  return { signup, loading: state.loading, error: state.error };
}

export function useLogout() {
  const React = getReact();
  const { clear } = useAuth();
  const [state, setState] = React.useState<ActionState>({ loading: false, error: null });

  const logout = React.useCallback(async (): Promise<boolean> => {
    setState({ loading: true, error: null });
    try {
      await apiLogout();
      clear(); // 전역 인증 상태 초기화
      setState({ loading: false, error: null });
      return true;
    } catch (e) {
      setState({ loading: false, error: e as Error });
      return false;
    }
  }, [clear]);

  return { logout, loading: state.loading, error: state.error };
}
