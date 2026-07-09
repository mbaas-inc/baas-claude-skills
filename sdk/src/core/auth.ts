/**
 * 인증 API + 인증 상태 캐시.
 * checkAuth() 는 앱에서 여러 번 불려도 실제 /account/info 요청은 1회로 합쳐진다.
 */
import { request, BaasError } from "./http";
import { getProjectId } from "./config";
import type { AccountInfo, AuthState, SignupOptions, TokenResponse } from "./types";

export async function signup(
  userId: string,
  userPw: string,
  name: string,
  phone: string,
  options: SignupOptions = {}
): Promise<AccountInfo> {
  return request<AccountInfo>("/account/signup-project", {
    method: "POST",
    body: { user_id: userId, user_pw: userPw, name, phone, project_id: getProjectId(), ...options },
  });
}

export async function login(userId: string, userPw: string): Promise<TokenResponse> {
  const data = await request<TokenResponse>("/account/login", {
    method: "POST",
    body: { user_id: userId, user_pw: userPw, project_id: getProjectId() },
  });
  clearAuthCache();
  return data;
}

export async function logout(): Promise<void> {
  await request<unknown>("/account/logout", { method: "POST" });
  clearAuthCache();
}

export async function getAccountInfo(): Promise<AccountInfo> {
  return request<AccountInfo>("/account/info", { method: "GET", allow401: true });
}

// ── 인증 상태 캐시 (화면마다 /account/info 반복 방지) ──
let authCache: AuthState | null = null;
let authCachePromise: Promise<AuthState> | null = null;

export function clearAuthCache(): void {
  authCache = null;
  authCachePromise = null;
}

/**
 * 로그인 상태 확인. 비로그인 401 은 에러가 아닌 { isLoggedIn: false } 정상 신호.
 */
export async function checkAuth(options: { force?: boolean } = {}): Promise<AuthState> {
  if (options.force) clearAuthCache();
  if (authCache) return authCache;
  if (authCachePromise) return authCachePromise;

  authCachePromise = (async () => {
    try {
      const user = await getAccountInfo();
      authCache = { isLoggedIn: true, user };
    } catch (e) {
      if (e instanceof BaasError && e.status === 401) {
        authCache = { isLoggedIn: false, user: null };
      } else {
        authCachePromise = null;
        throw e; // 네트워크/서버 오류는 삼키지 않는다 (호출부가 재시도/에러 UI 판단)
      }
    } finally {
      authCachePromise = null;
    }
    return authCache!;
  })();

  return authCachePromise;
}
