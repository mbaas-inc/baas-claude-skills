/**
 * fetch 코어 — envelope 언랩·에러 매핑·SDK 버전 헤더·credentials 를 한 곳에서.
 * 모든 백엔드 호출은 이 함수를 거친다(부패 방지 계층의 실체).
 */
import { getBaseUrl } from "./config";
import { SDK_VERSION } from "../version";
import type { Envelope } from "./types";

export class BaasError extends Error {
  errorCode: string | null;
  status: number;
  constructor(message: string, errorCode: string | null, status: number) {
    super(message);
    this.name = "BaasError";
    this.errorCode = errorCode;
    this.status = status;
  }
}

/**
 * 서버에 닿지 못했을 때(오프라인·DNS·CORS·연결 끊김) 화면에 보일 문구.
 * 브라우저 fetch 는 이때 `TypeError("Failed to fetch")` 를 던지고, 그 영문이 훅의 `error.message`
 * 로 그대로 화면에 나왔다 — 앱마다 처리하게 두지 않고 여기서 한국어 `BaasError` 로 바꾼다.
 */
export const NETWORK_ERROR_MESSAGE = "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.";

/** fetch 가 응답 없이 실패하면 `BaasError(NETWORK_ERROR, status 0)` 로 바꿔 던진다. */
export async function fetchOrNetworkError(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new BaasError(NETWORK_ERROR_MESSAGE, "NETWORK_ERROR", 0);
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** 401 을 에러가 아닌 정상 신호로 취급(비로그인 판별용) */
  allow401?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetchOrNetworkError(url, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Baas-Sdk-Version": SDK_VERSION, // 서버 로그로 프로젝트별 실사용 버전 파악
    },
    credentials: "include",
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  let env: Envelope<T> | null = null;
  try {
    env = (await res.json()) as Envelope<T>;
  } catch {
    // 비-JSON 응답
  }

  if (res.status === 401 && opts.allow401) {
    throw new BaasError(env?.message || "unauthorized", env?.errorCode || "UNAUTHORIZED", 401);
  }

  if (!env || env.result !== "SUCCESS") {
    throw new BaasError(
      env?.message || `요청 실패 (HTTP ${res.status})`,
      env?.errorCode || null,
      res.status
    );
  }
  return env.data as T;
}
