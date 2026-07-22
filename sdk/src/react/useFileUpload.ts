/**
 * useFileUpload — 파일 업로드 훅. host React 사용(JSX 미사용).
 * 상태(isUploading/error) + upload 동작. presign+S3 PUT 은 코어 uploadFile 이 담당한다.
 * 에러는 다른 훅과 동일하게 state 로 노출하고 반환은 null(표시 방식은 앱 UX 소관).
 */
import { getReact } from "./host";
import { uploadFile } from "../core/storage";
import type { UploadOptions, UploadResult } from "../core/storage";

export function useFileUpload() {
  const React = getReact();
  const [isUploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const upload = React.useCallback(
    async (file: File | Blob, opts: UploadOptions = {}): Promise<UploadResult | null> => {
      setUploading(true);
      setError(null);
      try {
        return await uploadFile(file, opts);
      } catch (e) {
        setError(e as Error);
        return null;
      } finally {
        setUploading(false);
      }
    },
    []
  );

  return { upload, isUploading, error };
}
