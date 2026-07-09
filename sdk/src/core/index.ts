/** core 엔트리 — framework 무관 표면. */
export { init, getConfig, getProjectId, getBaseUrl } from "./config";
export { request, BaasError } from "./http";
export {
  signup,
  login,
  logout,
  getAccountInfo,
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
