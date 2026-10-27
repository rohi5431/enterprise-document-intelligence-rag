import { useCallback, useRef, useState } from "react";
import { apiUploadDocument } from "../api";

const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg";

export function useComposerUpload(token: string) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected?.length) return;

      const fileList = Array.from(selected);
      setUploading(true);
      setStatus(null);
      setError(null);

      try {
        for (const file of fileList) {
          await apiUploadDocument(token, file);
        }
        setStatus(
          fileList.length === 1
            ? `"${fileList[0].name}" uploaded`
            : `${fileList.length} files uploaded`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [token]
  );

  const clearStatus = useCallback(() => {
    setStatus(null);
    setError(null);
  }, []);

  return {
    fileInputRef,
    uploading,
    status,
    error,
    openFilePicker,
    handleFileChange,
    clearStatus,
    accept: ACCEPTED_TYPES,
  };
}
