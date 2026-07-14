/**
 * react 엔트리 — IIFE 로 빌드되어 window.BaasSDK 로 노출된다.
 * core 표면 + react 표면을 한 객체로 합쳐 제공(앱은 <script> 한 줄로 전부 사용).
 */
import * as core from "../core/index";
import { AuthProvider, useAuth, RequireAuth } from "./AuthProvider";
import { useLogin, useSignup, useLogout } from "./hooks";
import { useBoard } from "./useBoard";
import { useCollection } from "./useCollection";
import {
  useRecipient,
  useNotice,
  useFaq,
  useComments,
  useSurvey,
  useReservation,
  useStore,
} from "./moreHooks";

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
  // board (dynamic)
  listPosts: core.listPosts,
  getPost: core.getPost,
  createPost: core.createPost,
  updatePost: core.updatePost,
  deletePost: core.deletePost,
  // collection (동적 컬렉션 레코드)
  listRecords: core.listRecords,
  getRecord: core.getRecord,
  createRecord: core.createRecord,
  updateRecord: core.updateRecord,
  deleteRecord: core.deleteRecord,
  listPublicRecords: core.listPublicRecords,
  getPublicRecord: core.getPublicRecord,
  // notice/faq/comments
  listNoticePosts: core.listNoticePosts,
  getNoticePost: core.getNoticePost,
  listFaqPosts: core.listFaqPosts,
  getFaqPost: core.getFaqPost,
  listComments: core.listComments,
  createComment: core.createComment,
  updateComment: core.updateComment,
  deleteComment: core.deleteComment,
  // recipient / survey / reservation / store
  registerRecipient: core.registerRecipient,
  listSurveys: core.listSurveys,
  getSurvey: core.getSurvey,
  submitSurveyResponse: core.submitSurveyResponse,
  listTargets: core.listTargets,
  getTarget: core.getTarget,
  getAvailableSlots: core.getAvailableSlots,
  getSlotRange: core.getSlotRange,
  createBooking: core.createBooking,
  prepareBooking: core.prepareBooking,
  confirmBooking: core.confirmBooking,
  listMyBookings: core.listMyBookings,
  getBooking: core.getBooking,
  updateBooking: core.updateBooking,
  cancelBooking: core.cancelBooking,
  getStoreConfig: core.getStoreConfig,
  listProducts: core.listProducts,
  listCategories: core.listCategories,
  getProduct: core.getProduct,
  getStoreTerms: core.getStoreTerms,
  prepareOrder: core.prepareOrder,
  confirmOrder: core.confirmOrder,
  listMyOrders: core.listMyOrders,
  getOrder: core.getOrder,
  confirmPurchase: core.confirmPurchase,
  cancelOrder: core.cancelOrder,
  // react hooks
  AuthProvider,
  useAuth,
  RequireAuth,
  useLogin,
  useSignup,
  useLogout,
  useBoard,
  useCollection,
  useRecipient,
  useNotice,
  useFaq,
  useComments,
  useSurvey,
  useReservation,
  useStore,
};

export {
  AuthProvider, useAuth, RequireAuth, useLogin, useSignup, useLogout, useBoard, useCollection,
  useRecipient, useNotice, useFaq, useComments, useSurvey, useReservation, useStore,
};
export * from "../core/index";
