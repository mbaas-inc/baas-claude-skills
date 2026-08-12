/**
 * 인증 동작 훅 — useLogin / useSignup / useLogout.
 * 상태(loading/error) + 동작만 제공. 성공 후 AuthProvider 갱신은 useAuth().refetch()/clear() 로.
 */
import { getReact } from "./host";
import { login as apiLogin, signup as apiSignup, logout as apiLogout } from "../core/auth";
import {
  getAuthConfig as apiGetAuthConfig,
  getSignupTerms as apiGetSignupTerms,
  requestSignupEmailCode as apiRequestSignupEmailCode,
  confirmSignupEmailCode as apiConfirmSignupEmailCode,
} from "../core/signup";
import { useAuth } from "./AuthProvider";
import type { AuthConfig, SignupTerms } from "../core/signup";
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

/**
 * 가입 — 절차 전체를 한 훅이 소유한다(설정 조회 → 약관 → 이메일 인증 → 가입).
 *
 * config 가 null 이면 아직 안 읽은 상태다. fetchConfig() 결과의
 * signup_verification 이 "EMAIL" 일 때만 코드 입력 UI 를 렌더한다 — 하드코딩 금지.
 */
export function useSignup() {
  const React = getReact();
  const [state, setState] = React.useState<ActionState>({ loading: false, error: null });
  const [config, setConfig] = React.useState<AuthConfig | null>(null);
  const [terms, setTerms] = React.useState<SignupTerms | null>(null);
  const [verified, setVerified] = React.useState(false);

  const run = React.useCallback(async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    setState({ loading: true, error: null });
    try {
      const result = await fn();
      setState({ loading: false, error: null });
      return result;
    } catch (e) {
      setState({ loading: false, error: e as Error });
      return fallback;
    }
  }, []);

  const fetchConfig = React.useCallback(
    () => run(async () => {
      const c = await apiGetAuthConfig();
      setConfig(c);
      return c;
    }, null as AuthConfig | null),
    [run]
  );

  const fetchTerms = React.useCallback(
    () => run(async () => {
      const t = await apiGetSignupTerms();
      setTerms(t);
      return t;
    }, null as SignupTerms | null),
    [run]
  );

  /** 인증 코드 발송. 60초 내 재요청 시 429 → error 로 안내한다. */
  const sendCode = React.useCallback(
    (email: string) => run(async () => {
      await apiRequestSignupEmailCode(email);
      return true;
    }, false),
    [run]
  );

  /** 코드 확인. 성공 시 verified=true 가 되어야 가입 버튼을 활성화한다. */
  const verifyCode = React.useCallback(
    (email: string, code: string) => run(async () => {
      const result = await apiConfirmSignupEmailCode(email, code);
      const ok = result?.verified !== false;
      setVerified(ok);
      return ok;
    }, false),
    [run]
  );

  const signup = React.useCallback(
    async (
      userId: string,
      userPw: string,
      name: string,
      phone: string,
      options: SignupOptions = {}
    ): Promise<AccountInfo | null> =>
      run(() => apiSignup(userId, userPw, name, phone, options), null as AccountInfo | null),
    [run]
  );

  return {
    signup,
    config,
    terms,
    verified,
    fetchConfig,
    fetchTerms,
    sendCode,
    verifyCode,
    loading: state.loading,
    error: state.error,
  };
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
