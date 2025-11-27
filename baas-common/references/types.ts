/**
 * BaaS API 공통 타입 정의
 *
 * 이 파일은 BaaS API와 통신할 때 사용하는 공통 타입을 정의합니다.
 * 다른 Skill에서 이 타입들을 참조하여 일관된 타입 사용을 보장합니다.
 *
 * 백엔드 동기화: 2025-11-26 (예외 핸들링 리팩토링 반영)
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

/** 에러 응답 (메타데이터 포함) */
export interface ErrorResponse {
  result: 'FAIL';
  errorCode: ErrorCode;
  message: string;
  /** 에러 발생 시간 (ISO 8601, KST) */
  timestamp?: string;
  /** 요청 추적 ID (UUID) - 디버깅에 활용 */
  request_id?: string;
  /** 요청 경로 */
  path?: string;
}

/** 검증 에러 상세 */
export interface ValidationErrorDetail {
  field: string;
  reason: string;
}

/** 검증 에러 응답 (필드별 상세 포함) */
export interface ValidationErrorResponse extends Omit<ErrorResponse, 'errorCode'> {
  errorCode: 'VALIDATION_ERROR';
  detail?: ValidationErrorDetail[];
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
  /**
   * 프로젝트 ID - 외부 에디터에서는 환경변수로 자동 주입 필수
   * getProjectId() 함수 사용 권장
   */
  project_id: string;
}

/** 회원가입 요청 */
export interface SignupRequest {
  user_id: string;      // 이메일 형식 권장
  user_pw: string;      // 8자 이상 필수
  name: string;         // 최대 32자
  phone: string;        // 예: "010-1234-5678", 최대 64자
  /**
   * 프로젝트 ID - 외부 에디터에서는 환경변수로 자동 주입 필수
   * getProjectId() 함수 사용 권장
   */
  project_id: string;
  is_reserved?: boolean;
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  /** 추가 사용자 데이터 (확장 포인트) */
  data?: Record<string, unknown>;
}

// ============================================
// 에러 코드 (백엔드 동기화)
// ============================================

export type ErrorCode =
  // === 인증/권한 ===
  | 'INVALID_USER'           // 사용자 인증 실패 (ID/PW 불일치) - 400
  | 'UNAUTHORIZED'           // 인증 필요 (로그인 필요) - 401
  | 'INVALID_TOKEN'          // 잘못된 토큰 - 401
  | 'TOKEN_EXPIRED'          // 토큰 만료 - 401
  // === 요청 오류 ===
  | 'NOT_FOUND'              // 리소스 없음 - 404
  | 'BAD_REQUEST'            // 잘못된 요청 - 400
  | 'INVALID_REQUEST'        // 잘못된 요청 형식 - 400
  | 'VALIDATION_ERROR'       // 유효성 검사 실패 - 400
  // === 상태 오류 ===
  | 'ALREADY_EXISTS'         // 이미 존재 (중복) - 409
  | 'ALREADY_COMPLETED'      // 이미 완료됨 - 400
  | 'EXPIRED'                // 만료됨 - 410
  // === 제한 ===
  | 'RATE_LIMIT_EXCEEDED'    // 요청 한도 초과 - 429
  | 'MAX_ATTEMPTS_EXCEEDED'  // 최대 시도 횟수 초과 - 429
  | 'INVALID_CODE'           // 잘못된 인증 코드 - 400
  // === 서버 오류 ===
  | 'INTERNAL_SERVER_ERROR'  // 서버 오류 - 500
  | 'NOT_IMPLEMENTED'        // 미구현 기능 - 501
  | 'EXTERNAL_SERVER_ERROR'  // 외부 서버 에러 - 502
  | 'WEBHOOK_ERROR'          // 웹훅 에러 - 500
  // === 기능별 ===
  | 'UNSUPPORTED_VENDOR'     // 미지원 벤더 - 400
  | 'UNSUPPORTED_METHOD'     // 미지원 메서드 - 405
  | 'FCM_SUBSCRIBE_FAILED';  // FCM 구독 실패 - 500

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

/** 검증 에러 응답인지 확인 */
export function isValidationErrorResponse(res: ErrorResponse): res is ValidationErrorResponse {
  return res.errorCode === 'VALIDATION_ERROR';
}

// ============================================
// 유틸리티 타입
// ============================================

/** API Base URL - 외부 에디터에서는 프로덕션 URL만 사용 */
export const API_BASE_URL = 'https://api.aiapp.link';

/** fetch 옵션 (credentials: include 필수) */
export interface BaaSFetchOptions extends Omit<RequestInit, 'credentials'> {
  credentials: 'include';
}
