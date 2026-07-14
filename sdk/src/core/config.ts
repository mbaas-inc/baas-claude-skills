/**
 * SDK 런타임 설정 — 프로젝트가 부팅 시 init() 으로 주입한다.
 *
 * project_id 해석: init 인자 → <meta name="baas-project-id"> → 전역 __BAAS_CONFIG__.
 * BASE_URL 기본값은 생성 앱의 프록시 경로(/aiapp-baas) — CloudFront 가 prefix 를 제거해
 * Lambda 는 /account/login 형태로 수신한다.
 */
export interface BaasConfig {
  baseUrl: string;
  projectId: string;
}

let _config: BaasConfig | null = null;

const DEFAULT_BASE_URL = "/aiapp-baas";

function readMeta(name: string): string | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`meta[name="${name}"]`);
  const v = el?.getAttribute("content")?.trim();
  return v && v !== "None" && v !== "null" && v !== "undefined" ? v : null;
}

/**
 * SDK 초기화. 앱 스캐폴드가 render 이전에 1회 호출한다.
 * projectId 를 명시하지 않으면 meta 태그/전역에서 해석한다.
 */
export function init(opts: { projectId?: string; baseUrl?: string } = {}): BaasConfig {
  const globalCfg =
    (typeof window !== "undefined" && (window as any).__BAAS_CONFIG__) || {};
  const projectId =
    opts.projectId ||
    readMeta("baas-project-id") ||
    globalCfg.PROJECT_ID ||
    "";
  const baseUrl = opts.baseUrl || globalCfg.BASE_URL || DEFAULT_BASE_URL;

  if (!projectId) {
    throw new Error(
      "[BaaS SDK] project_id 가 없습니다. init({ projectId }) 또는 <meta name=\"baas-project-id\"> 를 확인하세요."
    );
  }
  _config = { baseUrl: baseUrl.replace(/\/$/, ""), projectId };
  return _config;
}

export function getConfig(): BaasConfig {
  if (!_config) {
    throw new Error("[BaaS SDK] init() 가 호출되지 않았습니다. 앱 부팅 시 BaasSDK.init() 을 먼저 호출하세요.");
  }
  return _config;
}

export function getProjectId(): string {
  return getConfig().projectId;
}

export function getBaseUrl(): string {
  return getConfig().baseUrl;
}
