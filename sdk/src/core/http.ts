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

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** 401 을 에러가 아닌 정상 신호로 취급(비로그인 판별용) */
  allow401?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
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
