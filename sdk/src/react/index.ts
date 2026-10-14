/**
 * react 엔트리 — IIFE 로 빌드되어 window.BaasSDK 로 노출된다.
 * core 표면 + react 표면을 한 객체로 합쳐 제공(앱은 <script> 한 줄로 전부 사용).
 */
import * as core from "../core/index";
import { AuthProvider, useAuth, RequireAuth } from "./AuthProvider";
import { useLogin, useSignup, useSmsLogin, useLogout } from "./hooks";
import { useCollection } from "./useCollection";
import { useFileUpload } from "./useFileUpload";
import { usePayment } from "./moreHooks";

export const BaasSDK = {
  version: core.SDK_VERSION,
  // core
  init: core.init,
  getProjectId: core.getProjectId,
  request: core.request,
  BaasError: core.BaasError,
  login: core.login,
  signup: core.signup,
  logout: core.logout,
  getAccountInfo: core.getAccountInfo,
  checkAuth: core.checkAuth,
  clearAuthCache: core.clearAuthCache,
  changePassword: core.changePassword,
  // signup (가입 절차 — 설정/약관/이메일 인증/SNS 제공자)
  getAuthConfig: core.getAuthConfig,
  getSignupTerms: core.getSignupTerms,
  requestSignupEmailCode: core.requestSignupEmailCode,
  confirmSignupEmailCode: core.confirmSignupEmailCode,
  getSnsProviders: core.getSnsProviders,
  completeProfile: core.completeProfile,
  // sms login (문자 인증 로그인 — 발송/인증·로그인/미가입 가입)
  requestSmsLoginCode: core.requestSmsLoginCode,
  loginWithSms: core.loginWithSms,
  signupWithSms: core.signupWithSms,
  // collection (동적 컬렉션 레코드)
  listRecords: core.listRecords,
  getRecord: core.getRecord,
  createRecord: core.createRecord,
  updateRecord: core.updateRecord,
  deleteRecord: core.deleteRecord,
  listPublicRecords: core.listPublicRecords,
  getPublicRecord: core.getPublicRecord,
  // storage (파일 업로드 — presign→S3 PUT, cdn_url 반환)
  uploadFile: core.uploadFile,
  uploadToTarget: core.uploadToTarget,
  // phone (형식 유틸 — formatPhone: 입력 자동 하이픈 / normalizePhone: 전송 정규화)
  normalizePhone: core.normalizePhone,
  formatPhone: core.formatPhone,
  // payment (결제 공통 — 약관 조회 · 커스텀 결제 위젯. 금액은 커스텀 백엔드(serverFn) 소유)
  getPurchaseTerms: core.getPurchaseTerms,
  beginPaymentWidget: core.beginPaymentWidget,
  getPaymentRedirectResult: core.getPaymentRedirectResult,
  // react hooks
  AuthProvider,
  useAuth,
  RequireAuth,
  useLogin,
  useSignup,
  useSmsLogin,
  useLogout,
  useCollection,
  useFileUpload,
  usePayment,
};

export {
  AuthProvider, useAuth, RequireAuth, useLogin, useSignup, useSmsLogin, useLogout, useCollection,
  useFileUpload, usePayment,
};
export * from "../core/index";
