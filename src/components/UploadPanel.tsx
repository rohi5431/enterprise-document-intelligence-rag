/**
 * UploadPanel — Multi-file upload hook with per-file progress tracking.
 *
 * Supports parallel upload of multiple files with status tracking for each file.
 * Used both from the composer bar (paperclip) and from DocumentsPage.
 */
import { useCallback, useRef, useState } from "react";
import { apiUploadDocument } from "../api";

export type FileUploadState = {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  docId?: number;
  alreadyExists?: boolean;
  message?: string;
};

const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.tiff,.bmp,.webp";

export function useComposerUpload(token: string, onUploadComplete?: () => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected?.length) return [];

      const fileList = Array.from(selected);
      const results: FileUploadState[] = [];
      setUploading(true);
      setStatus(null);
      setError(null);

      // Initialize per-file tracking state
      const initialStates: FileUploadState[] = fileList.map((f) => ({
        name: f.name,
        status: "pending",
      }));
      setFileStates(initialStates);

      let successCount = 0;
      let errorCount = 0;

      // Upload files sequentially (to avoid overwhelming the server)
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];

        // Mark as uploading
        setFileStates((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "uploading" } : s))
        );

        try {
          const res = await apiUploadDocument(token, file);
          successCount++;
          const alreadyExists = !!(res as any).already_exists;
          results.push({
            name: file.name,
            status: "done",
            docId: res.id,
            alreadyExists,
            message: (res as any).message,
          });
          setFileStates((prev) =>
            prev.map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    status: "done",
                    docId: res.id,
                    alreadyExists,
                    message: (res as any).message,
                  }
                : s
            )
          );
        } catch (err) {
          errorCount++;
          const errMsg = err instanceof Error ? err.message : "Upload failed";
          results.push({ name: file.name, status: "error", error: errMsg });
          setFileStates((prev) =>
            prev.map((s, idx) =>
              idx === i ? { ...s, status: "error", error: errMsg } : s
            )
          );
        }
      }

      // Summary status
      if (errorCount === 0) {
        const hasExisting = results.some((r) => r.alreadyExists);
        if (hasExisting && fileList.length === 1) {
          setStatus(`ℹ️ "${fileList[0].name}" is already present (duplicate upload prevented).`);
        } else {
          setStatus(
            fileList.length === 1
              ? `✓ "${fileList[0].name}" uploaded successfully`
              : `✓ ${successCount} of ${fileList.length} files uploaded successfully`
          );
        }
        // Notify caller that uploads completed successfully
        onUploadComplete?.();
      } else {
        setError(
          `${errorCount} file(s) failed — ${successCount} succeeded`
        );
      }

      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Auto-clear file states after 6 seconds
      setTimeout(() => setFileStates([]), 6000);
      return results;
    },
    [token, onUploadComplete]
  );

  const clearStatus = useCallback(() => {
    setStatus(null);
    setError(null);
    setFileStates([]);
  }, []);

  return {
    fileInputRef,
    uploading,
    fileStates,
    status,
    error,
    openFilePicker,
    handleFileChange,
    clearStatus,
    accept: ACCEPTED_TYPES,
  };
}
