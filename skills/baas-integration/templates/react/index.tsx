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

// Config & Utils
export { BASE_URL, getProjectId } from './config';
export { validatePhone, formatPhone } from './utils';

// Types (중앙 집중식 타입 관리)
export type {
  // Account Types
  TokenResponse,
  AccountResponse,
  SignupOptions,
  UseLoginReturn,
  UseSignupReturn,
  UseLogoutOptions,
  UseLogoutReturn,
  UseAccountInfoOptions,
  UseAccountInfoReturn,
  // Messaging Types
  RecipientCreateRequest,
  RecipientResponse,
  UseRecipientReturn,
  // Board Types
  FileResponse,
  PostListItem,
  PostListResponse,
  PostResponse,
  PostFetchOptions,
  UseNoticeReturn,
  FaqListItem,
  FaqListResponse,
  FaqResponse,
  FaqFetchOptions,
  UseFaqReturn
} from './types';

// Account Hooks
export { useLogin } from './useLogin';
export { useSignup } from './useSignup';
export { useLogout } from './useLogout';
export { useAccountInfo } from './useAccountInfo';

// Messaging Hooks
export { useRecipient } from './useRecipient';

// Board Hooks
export { useNotice } from './useNotice';
export { useFaq } from './useFaq';