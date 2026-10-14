/** core 엔트리 — framework 무관 표면. */
export { init, getConfig, getProjectId, getBaseUrl } from "./config";
export { request, BaasError } from "./http";
export {
  signup,
  login,
  logout,
  getAccountInfo,
  changePassword,
  checkAuth,
  clearAuthCache,
} from "./auth";
export {
  getAuthConfig,
  getSignupTerms,
  requestSignupEmailCode,
  confirmSignupEmailCode,
  getSnsProviders,
  completeProfile,
} from "./signup";
export { requestSmsLoginCode, loginWithSms, signupWithSms } from "./smsLogin";
export {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  aggregateRecords,
  incrementRecord,
  restoreRecord,
  batchRecords,
  runTransaction,
  listPublicRecords,
  getPublicRecord,
} from "./collection";
export { uploadFile, uploadToTarget } from "./storage";
export { getPurchaseTerms, beginPaymentWidget, getPaymentRedirectResult } from "./payment";
export { normalizePhone, formatPhone } from "./phone";
export { SDK_VERSION } from "../version";
export type {
  Envelope,
  TokenResponse,
  AccountInfo,
  SignupOptions,
  AuthState,
} from "./types";
export type {
  AuthConfig,
  SignupTerms,
  TermsDocument,
  SnsProvider,
  VerifyCodeResult,
  CompleteProfileInput,
} from "./signup";
export type { SmsCodeSent, SmsLoginResult, SmsSignupInput, SmsSignupResult } from "./smsLogin";
export type {
  DynRecord,
  DynRecordDetail,
  FieldDefinition,
  RecordListResult,
  RecordFilter,
  RecordListOptions,
  AggregateOp,
  AggregateBucket,
  AggregateResult,
  BatchInput,
  BatchItemResult,
  BatchResult,
  TxnOperation,
  TxnResult,
} from "./collection";
export type {
  UploadTarget,
  UploadCategory,
  UploadOptions,
  UploadResult,
  ServerUploadTarget,
} from "./storage";
export type {
  PurchaseTerms,
  CustomPaymentSession,
  PaymentWidgetParams,
  CustomPaymentWidgetHandle,
  PaymentRedirectResult,
} from "./payment";
