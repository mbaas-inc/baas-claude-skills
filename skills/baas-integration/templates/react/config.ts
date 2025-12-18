/**
 * BaaS API 설정
 */

export const BASE_URL = 'https://api.aiapp.link';

/**
 * 환경변수에서 Project ID를 가져옵니다.
 * @returns Project ID
 * @throws 환경변수가 설정되지 않은 경우 에러
 */
export function getProjectId(): string {
  const projectId =
    process.env.REACT_APP_BAAS_PROJECT_ID ||
    process.env.NEXT_PUBLIC_BAAS_PROJECT_ID ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BAAS_PROJECT_ID);

  if (!projectId) {
    throw new Error(
      '[BaaS] project_id 환경변수가 설정되지 않았습니다.\n' +
      '- React CRA: REACT_APP_BAAS_PROJECT_ID\n' +
      '- Next.js: NEXT_PUBLIC_BAAS_PROJECT_ID\n' +
      '- Vite: VITE_BAAS_PROJECT_ID'
    );
  }
  return projectId;
}
