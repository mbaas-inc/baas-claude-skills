/**
 * BaaS API 공통 타입 정의
 *
 * 이 파일은 BaaS API와 통신할 때 사용하는 공통 타입을 정의합니다.
 * 다른 Skill에서 이 타입들을 참조하여 일관된 타입 사용을 보장합니다.
 */

// ============================================
// 공통 응답 타입
// ============================================

/** 성공 응답 */
export interface SuccessResponse<T> {
  result: 'SUCCESS';
  data: T;
  message?: string;
}

/** 에러 응답 */
export interface ErrorResponse {
  result: 'FAIL';
  errorCode: ErrorCode;
  message: string;
}

/** API 응답 유니온 타입 */
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// ============================================
// 공통 엔티티 타입
// ============================================

/** 계정 정보 응답 */
export interface AccountResponse {
  id: string;                       // UUID
  user_id: string;                  // 로그인 ID
  name: string;                     // 이름
  phone: string;                    // 전화번호
  is_profile_completed: boolean;    // 프로필 완성 여부
  last_logged_at: string | null;    // 마지막 로그인 (ISO 8601)
  created_at: string;               // 생성일시 (ISO 8601)
  data: Record<string, unknown>;    // 추가 데이터
}

/** 토큰 응답 */
export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

// ============================================
// 요청 타입
// ============================================

/** 로그인 요청 */
export interface LoginRequest {
  user_id: string;
  user_pw: string;
  project_id?: string;
}

/** 회원가입 요청 */
export interface SignupRequest {
  user_id: string;      // 이메일 형식 권장
  user_pw: string;      // 8자 이상 필수
  name: string;         // 최대 32자
  phone: string;        // 예: "010-1234-5678", 최대 64자
  project_id?: string;  // 프로젝트 사용자만 (UUID)
  is_reserved?: boolean;
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  data?: Record<string, unknown>;
}

// ============================================
// 에러 코드
// ============================================

export type ErrorCode =
  | 'INVALID_USER'           // 사용자 인증 실패 (ID/PW 불일치)
  | 'UNAUTHORIZED'           // 인증 필요 (로그인 필요)
  | 'NOT_FOUND'              // 리소스 없음
  | 'BAD_REQUEST'            // 잘못된 요청
  | 'VALIDATION_ERROR'       // 유효성 검사 실패
  | 'ALREADY_EXISTS'         // 이미 존재 (중복)
  | 'ALREADY_COMPLETED'      // 이미 완료됨
  | 'EXPIRED'                // 만료됨
  | 'RATE_LIMIT_EXCEEDED'    // 요청 한도 초과
  | 'INTERNAL_SERVER_ERROR'; // 서버 오류

// ============================================
// Type Guards
// ============================================

/** 성공 응답인지 확인 */
export function isSuccessResponse<T>(res: ApiResponse<T>): res is SuccessResponse<T> {
  return res.result === 'SUCCESS';
}

/** 에러 응답인지 확인 */
export function isErrorResponse<T>(res: ApiResponse<T>): res is ErrorResponse {
  return res.result === 'FAIL';
}

// ============================================
// 유틸리티 타입
// ============================================

/** API Base URL 타입 */
export type ApiBaseUrl = 'http://localhost:8000' | 'https://api.aiapp.link' | string;

/** fetch 옵션 (credentials: include 필수) */
export interface BaaSFetchOptions extends Omit<RequestInit, 'credentials'> {
  credentials: 'include';
}
