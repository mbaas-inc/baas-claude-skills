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
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
} from "./board";
export {
  listNoticePosts,
  getNoticePost,
  listFaqPosts,
  getFaqPost,
  listComments,
  createComment,
  updateComment,
  deleteComment,
} from "./notice";
export {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  listPublicRecords,
  getPublicRecord,
} from "./collection";
export { uploadFile } from "./storage";
export { getPurchaseTerms } from "./payment";
export { registerRecipient } from "./recipient";
export { listSurveys, getSurvey, submitSurveyResponse } from "./survey";
export {
  listTargets,
  getTarget,
  getAvailableSlots,
  getSlotRange,
  createBooking,
  prepareBooking,
  startBooking,
  confirmBooking,
  listMyBookings,
  getBooking,
  updateBooking,
  cancelBooking,
  beginReservationWidgetCheckout,
  getReservationCheckoutContext,
  clearReservationCheckoutContext,
} from "./reservation";
export {
  getStoreConfig,
  listProducts,
  listCategories,
  getProduct,
  prepareOrder,
  startOrder,
  confirmOrder,
  listMyOrders,
  getOrder,
  confirmPurchase,
  cancelOrder,
  beginStoreWidgetCheckout,
  getStoreCheckoutContext,
  clearStoreCheckoutContext,
} from "./store";
export { SDK_VERSION } from "../version";
export type {
  Envelope,
  TokenResponse,
  AccountInfo,
  SignupOptions,
  AuthState,
} from "./types";
export type {
  BoardPost,
  PostListResult,
  PostListOptions,
  PostCreateInput,
} from "./board";
export type { Comment } from "./notice";
export type {
  DynRecord,
  RecordListResult,
  RecordFilter,
  RecordListOptions,
} from "./collection";
export type {
  UploadTarget,
  UploadCategory,
  UploadOptions,
  UploadResult,
} from "./storage";
export type { PurchaseTerms } from "./payment";
export type { RecipientInput } from "./recipient";
export type { Survey } from "./survey";
export type {
  ReservationTarget,
  ReservationWidgetCheckoutParams,
  ReservationWidgetHandle,
  ReservationCheckoutContext,
} from "./reservation";
export type {
  StoreConfig,
  Product,
  StoreWidgetCheckoutParams,
  StoreWidgetHandle,
  StoreCheckoutContext,
} from "./store";
