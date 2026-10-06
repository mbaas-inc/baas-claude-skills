/**
 * 파일 업로드 transport — presign 발급 후 S3 직접 PUT.
 *
 * 큰 바이너리가 CloudFront/Lambda 를 우회하도록 presigned URL 로 S3 에 직접 PUT 한다
 * (서버 경유 업로드의 413/403·지연 해소). 반환된 cdn_url 을 콘텐츠(동적 컬렉션 필드·
 * 게시글 등)에 저장해 영구 조회한다. category 는 저장 분류 화이트리스트다.
 */
import { BaasError, fetchOrNetworkError, request } from "./http";
import { getProjectId } from "./config";

/** 업로드 후 읽기 URL + 서명된 PUT 대상 */
export interface UploadTarget {
  /** S3 직접 PUT 용 presigned URL (단기·1회용) */
  presign_url: string;
  /** 인라인 표시용 영구 CDN URL (콘텐츠에 저장 — <img src> 등) */
  cdn_url: string;
  /** 첨부 다운로드용 CDN URL (attachment 헤더) */
  download_url: string;
  /** S3 key path (project prefix 제외) */
  key: string;
}

/** 저장 분류 — images 는 이미지 확장자·최대 10MB. board_attachment 는 File 레코드(file_id) 생성. */
export type UploadCategory =
  | "images"
  | "store"
  | "reservation"
  | "board_import"
  | "board_attachment";

export interface UploadOptions {
  /** 저장 분류 (기본 "images") */
  category?: UploadCategory;
  /** 원본 파일명 override (기본 file.name) */
  filename?: string;
}

export interface UploadResult extends UploadTarget {
  /** board_attachment 카테고리에서만 반환되는 게시글 연결용 File id */
  file_id?: number;
}

interface PresignResponse {
  original: UploadTarget;
  compressed?: UploadTarget | null;
  file_id?: number | null;
}

/**
 * 파일 1건을 업로드하고 읽기 URL(cdn_url 등)을 반환한다.
 *
 * 흐름: ① POST /upload/presign 로 서명 URL 발급 → ② presign_url 로 S3 직접 PUT.
 * 실패 시 BaasError(발급 단계) 또는 Error(S3 PUT 단계) 를 throw 한다.
 *
 * @example
 *   const { cdn_url } = await uploadFile(file);            // category 기본 images
 *   await createRecord("products", { image_url: cdn_url }); // 컬렉션 필드에 저장
 */
export async function uploadFile(
  file: File | Blob,
  opts: UploadOptions = {}
): Promise<UploadResult> {
  const category = opts.category || "images";
  const filename = opts.filename || (file as File).name || "upload";
  const contentType = file.type || "application/octet-stream";

  // ① presign 발급 — project_id 는 쿼리 파라미터(UUID)로 전달한다.
  const res = await request<PresignResponse>(
    `/upload/presign?project_id=${encodeURIComponent(getProjectId())}`,
    {
      method: "POST",
      body: { category, filename, content_type: contentType, size: file.size },
    }
  );

  // ② S3 직접 PUT
  await putToPresignedUrl(res.original.presign_url, file, contentType);

  return { ...res.original, file_id: res.file_id ?? undefined };
}

/** S3 직접 PUT — presign URL 자체가 서명돼 있어 credentials 를 붙이지 않는다.
 *  Content-Type 은 발급 때 서명한 값과 반드시 일치해야 한다(불일치 시 S3 가 403). */
async function putToPresignedUrl(url: string, file: File | Blob, contentType: string): Promise<void> {
  const put = await fetchOrNetworkError(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new BaasError(`파일을 올리지 못했어요. 잠시 후 다시 시도해 주세요. (HTTP ${put.status})`, "UPLOAD_FAILED", put.status);
  }
}

/**
 * serverFn 이 서버 SDK `storage.presign` 으로 받아 넘긴 업로드 대상 — 응답을 그대로 넘긴다(aiapp-service#904).
 * 누가 올려도 되는지는 그 serverFn 이 판정했다(소유자 전용 · 역할별 등).
 */
export interface ServerUploadTarget {
  /** S3 직접 PUT 용 주소 (단기·1회용) */
  upload_url: string;
  /** 발급 때 서명한 Content-Type — PUT 에 그대로 쓴다 */
  content_type: string;
  /** 인라인 표시용 영구 CDN URL */
  cdn_url: string;
  download_url?: string;
  key?: string;
}

/**
 * serverFn 이 발급한 업로드 대상으로 파일 1건을 올리고 그 대상을 돌려준다(성공 시 cdn_url 을 쓴다).
 * 앱 회원 로그인이 필요 없다 — 권한은 대상을 발급한 serverFn 이 이미 판정했다(관리자 화면의 사장님 업로드 등).
 */
export async function uploadToTarget(
  target: ServerUploadTarget,
  file: File | Blob
): Promise<ServerUploadTarget> {
  if (!target || !target.upload_url || !target.content_type) {
    throw new BaasError(
      "업로드 대상이 올바르지 않습니다(upload_url/content_type 누락) — serverFn 의 storage.presign 응답을 그대로 넘기세요.",
      "UPLOAD_TARGET_INVALID",
      400
    );
  }
  await putToPresignedUrl(target.upload_url, file, target.content_type);
  return target;
}
