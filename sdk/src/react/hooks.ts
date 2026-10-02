/**
 * 인증 동작 훅 — useLogin / useSignup / useSmsLogin / useLogout.
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
import {
  requestSmsLoginCode as apiRequestSmsLoginCode,
  loginWithSms as apiLoginWithSms,
  signupWithSms as apiSignupWithSms,
} from "../core/smsLogin";
import { useAuth } from "./AuthProvider";
import type { AuthConfig, SignupTerms } from "../core/signup";
import type { SmsLoginResult, SmsSignupInput, SmsSignupResult } from "../core/smsLogin";
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

/**
 * 문자 인증 로그인 — 발송 → 인증 → (가입된 번호) 로그인 / (미가입) 추가 정보 입력 후 가입.
 *
 * step 으로 화면을 고른다: "phone"(번호 입력) → "code"(인증번호 입력) →
 * "signup"(미가입 — 이름·약관 등 추가 정보 입력) → "done"(로그인됨) / "pending"(승인 대기).
 * 로그인·가입 성공 시 전역 인증 상태를 직접 갱신한다(useAuth().refetch 불필요).
 */
export function useSmsLogin() {
  const React = getReact();
  const { refetch } = useAuth();
  const [state, setState] = React.useState<ActionState>({ loading: false, error: null });
  const [step, setStep] = React.useState<"phone" | "code" | "signup" | "done" | "pending">("phone");
  const [phone, setPhone] = React.useState("");
  const [remainingAttempts, setRemainingAttempts] = React.useState<number | null>(null);

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

  /** 인증번호 발송(재발송 포함). 60초 내 재요청은 429 → error 로 안내한다. */
  const sendCode = React.useCallback(
    (nextPhone: string) => run(async () => {
      await apiRequestSmsLoginCode(nextPhone);
      setPhone(nextPhone);
      setRemainingAttempts(null);
      setStep("code");
      return true;
    }, false),
    [run]
  );

  /** 인증번호 확인. 가입된 번호면 로그인까지 끝내고 step="done", 미가입이면 step="signup". */
  const verify = React.useCallback(
    (code: string) => run(async () => {
      const result = await apiLoginWithSms(phone, code);
      if (!result.verified) {
        setRemainingAttempts(result.remaining_attempts ?? null);
      } else if (result.registered) {
        await refetch();
        setStep("done");
      } else {
        setStep("signup");
      }
      return result;
    }, null as SmsLoginResult | null),
    [run, phone, refetch]
  );

  /** 미가입 번호의 가입. ACTIVE 면 바로 로그인(step="done"), 승인제면 step="pending". */
  const signup = React.useCallback(
    (input: Omit<SmsSignupInput, "phone">) => run(async () => {
      const result = await apiSignupWithSms({ ...input, phone });
      if (result.access_token) {
        await refetch();
        setStep("done");
      } else {
        setStep("pending");
      }
      return result;
    }, null as SmsSignupResult | null),
    [run, phone, refetch]
  );

  /** 번호를 다시 입력하게 처음으로 돌린다. */
  const reset = React.useCallback(() => {
    setStep("phone");
    setRemainingAttempts(null);
    setState({ loading: false, error: null });
  }, []);

  return {
    step,
    phone,
    remainingAttempts,
    sendCode,
    verify,
    signup,
    reset,
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
