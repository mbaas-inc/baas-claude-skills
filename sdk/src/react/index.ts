/**
 * react 엔트리 — IIFE 로 빌드되어 window.BaasSDK 로 노출된다.
 * core 표면 + react 표면을 한 객체로 합쳐 제공(앱은 <script> 한 줄로 전부 사용).
 */
import * as core from "../core/index";
import { AuthProvider, useAuth, RequireAuth } from "./AuthProvider";
import { useLogin, useSignup, useLogout } from "./hooks";
import { useBoard } from "./useBoard";

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
  listPosts: core.listPosts,
  getPost: core.getPost,
  createPost: core.createPost,
  updatePost: core.updatePost,
  deletePost: core.deletePost,
  // react
  AuthProvider,
  useAuth,
  RequireAuth,
  useLogin,
  useSignup,
  useLogout,
  useBoard,
};

export { AuthProvider, useAuth, RequireAuth, useLogin, useSignup, useLogout, useBoard };
export * from "../core/index";
