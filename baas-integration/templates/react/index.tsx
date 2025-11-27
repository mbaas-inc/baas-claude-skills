/**
 * BaaS API 통합 React Hooks
 *
 * Account + Messaging API를 모두 포함합니다.
 *
 * 사용법:
 * import { useLogin, useSignup, useLogout, useAccountInfo, useRecipient } from './react';
 *
 * 환경변수 설정 필요 (로그인/회원가입/발송대상):
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

// Account Hooks
export { useLogin } from './useLogin';
export type { TokenResponse, UseLoginReturn } from './useLogin';

export { useSignup } from './useSignup';
export type { SignupOptions, AccountResponse, UseSignupReturn } from './useSignup';

export { useLogout } from './useLogout';
export type { UseLogoutOptions, UseLogoutReturn } from './useLogout';

export { useAccountInfo } from './useAccountInfo';
export type { UseAccountInfoOptions, UseAccountInfoReturn } from './useAccountInfo';

// Messaging Hooks
export { useRecipient } from './useRecipient';
export type { RecipientCreateRequest, RecipientResponse, UseRecipientReturn } from './useRecipient';