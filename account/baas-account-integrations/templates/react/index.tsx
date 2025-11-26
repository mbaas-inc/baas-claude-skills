/**
 * BaaS 회원 인증 통합 React Hooks
 *
 * 타입 정의: baas-common/references/types.ts 참조
 *
 * 사용법:
 * import { useLogin, useSignup, useLogout, useAccountInfo } from './react';
 *
 * 환경변수 설정 필요 (로그인/회원가입):
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

export { useLogin } from './useLogin';
export type { TokenResponse, UseLoginReturn } from './useLogin';

export { useSignup } from './useSignup';
export type { SignupOptions, AccountResponse, UseSignupReturn } from './useSignup';

export { useLogout } from './useLogout';
export type { UseLogoutOptions, UseLogoutReturn } from './useLogout';

export { useAccountInfo } from './useAccountInfo';
export type { UseAccountInfoOptions, UseAccountInfoReturn } from './useAccountInfo';
