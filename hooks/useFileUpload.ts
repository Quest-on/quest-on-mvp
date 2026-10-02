"use client";

import { useState, useCallback, useRef } from "react";
import { uploadFile, type UploadResult } from "@/lib/upload-client";
import toast from "react-hot-toast";

export type FileStatus = "uploading" | "extracting" | "done" | "failed";

interface UploadedFile {
  url: string;
  fileName: string;
  meta?: UploadResult["meta"];
}

interface ExtractedText {
  text: string;
  fileName: string;
}

// Text-extractable extensions (must also be in lib/upload-allowlist.ts UPLOAD_ALLOWED_EXTENSIONS)
const TEXT_EXTRACTABLE = new Set(["pdf", "docx", "pptx"]);

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

interface UseFileUploadOptions {
  /** Pre-existing uploaded URLs (for edit page) */
  initialUrls?: string[];
  /** Pre-existing extracted texts (for edit page) */
  initialTexts?: Map<string, { text: string; fileName: string }>;
}

export function useFileUpload(options?: UseFileUploadOptions) {
  // Map<fileName, UploadedFile>
  const [uploadedFiles, setUploadedFiles] = useState<Map<string, UploadedFile>>(
    () => new Map()
  );

  // Map<url, ExtractedText>
  const [extractedTexts, setExtractedTexts] = useState<
    Map<string, ExtractedText>
  >(() => options?.initialTexts ?? new Map());

  // Map<fileName, FileStatus>
  const [fileStatus, setFileStatus] = useState<Map<string, FileStatus>>(
    () => new Map()
  );

  // Track existing material URLs (from edit page)
  const [existingUrls, setExistingUrls] = useState<string[]>(
    () => options?.initialUrls ?? []
  );

  // Track in-flight uploads to prevent duplicates (ref avoids stale closure)
  const inFlightRef = useRef<Set<string>>(new Set());

  const setStatus = useCallback((fileName: string, status: FileStatus) => {
    setFileStatus((prev) => {
      const next = new Map(prev);
      next.set(fileName, status);
      return next;
    });
  }, []);

  /**
   * Upload a file to Supabase and optionally extract text.
   * Called on file selection (not on form submit).
   */
  const upload = useCallback(
    async (file: File) => {
      const fileName = file.name;

      // Prevent duplicate uploads using ref (no stale closure issue)
      if (inFlightRef.current.has(fileName)) return;
      inFlightRef.current.add(fileName);

      setStatus(fileName, "uploading");

      try {
        // Upload via server or signed URL depending on size
        const result = await uploadFile(file);

        setUploadedFiles((prev) => {
          const next = new Map(prev);
          next.set(fileName, {
            url: result.url,
            fileName,
            meta: result.meta,
          });
          return next;
        });

        // Extract text if applicable
        const ext = getExtension(fileName);
        if (TEXT_EXTRACTABLE.has(ext)) {
          setStatus(fileName, "extracting");

          try {
            const extractResponse = await fetch("/api/extract-text", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileUrl: result.url,
                fileName,
                mimeType: file.type,
              }),
            });

            if (extractResponse.ok) {
              const extractResult = await extractResponse.json();
              if (extractResult.text) {
                setExtractedTexts((prev) => {
                  const next = new Map(prev);
                  next.set(result.url, { text: extractResult.text, fileName });
                  return next;
                });
              }
            }

            setStatus(fileName, "done");
          } catch {
            // Text extraction failure is non-fatal
            setStatus(fileName, "done");
            toast.error(
              `${fileName}: 텍스트 추출에 실패했습니다. AI 문제 생성 품질이 저하될 수 있습니다.`
            );
          }
        } else {
          setStatus(fileName, "done");
        }
      } catch (error) {
        setStatus(fileName, "failed");
        const message =
          error instanceof Error ? error.message : "업로드 실패";
        toast.error(`${fileName}: ${message}`);
      } finally {
        inFlightRef.current.delete(fileName);
      }
    },
    [setStatus]
  );

  /**
   * Get all uploaded URLs (existing + newly uploaded) for form submission.
   */
  const getUploadedUrls = useCallback((): string[] => {
    const newUrls = Array.from(uploadedFiles.values()).map((f) => f.url);
    return [...existingUrls, ...newUrls];
  }, [uploadedFiles, existingUrls]);

  /**
   * Get materials_text array for form submission.
   */
  const getMaterialsText = useCallback((): Array<{
    url: string;
    text: string;
    fileName: string;
  }> => {
    return Array.from(extractedTexts.entries()).map(
      ([url, { text, fileName }]) => ({
        url,
        text,
        fileName,
      })
    );
  }, [extractedTexts]);

  /**
   * Remove a newly uploaded file by fileName.
   */
  const removeFile = useCallback(
    (fileName: string) => {
      // Remove in-flight tracking
      inFlightRef.current.delete(fileName);

      // Remove from uploadedFiles (use functional updater to get current value)
      setUploadedFiles((prev) => {
        const uploadedEntry = prev.get(fileName);
        // Also remove associated extracted text
        if (uploadedEntry) {
          setExtractedTexts((prevTexts) => {
            const next = new Map(prevTexts);
            next.delete(uploadedEntry.url);
            return next;
          });
        }
        const next = new Map(prev);
        next.delete(fileName);
        return next;
      });

      // Remove status
      setFileStatus((prev) => {
        const next = new Map(prev);
        next.delete(fileName);
        return next;
      });
    },
    []
  );

  /**
   * Remove an existing material URL (edit page).
   */
  const removeExistingUrl = useCallback(
    (index: number) => {
      setExistingUrls((prev) => {
        const removedUrl = prev[index];
        // Also remove extracted text for this URL
        if (removedUrl) {
          setExtractedTexts((prevTexts) => {
            const next = new Map(prevTexts);
            next.delete(removedUrl);
            return next;
          });
        }
        return prev.filter((_, i) => i !== index);
      });
    },
    []
  );

  /**
   * Initialize existing data (for edit page after fetch).
   */
  const initExistingData = useCallback(
    (
      urls: string[],
      texts?: Array<{ url: string; text: string; fileName: string }>
    ) => {
      setExistingUrls(urls);
      if (texts && texts.length > 0) {
        setExtractedTexts((prev) => {
          const next = new Map(prev);
          for (const item of texts) {
            if (item.url && item.text) {
              next.set(item.url, {
                text: item.text,
                fileName: item.fileName || "파일",
              });
            }
          }
          return next;
        });
      }
    },
    []
  );

  /**
   * Check if any file is currently uploading or extracting.
   */
  const isProcessing = Array.from(fileStatus.values()).some(
    (s) => s === "uploading" || s === "extracting"
  );

  return {
    uploadedFiles,
    extractedTexts,
    fileStatus,
    existingUrls,
    isProcessing,
    upload,
    getUploadedUrls,
    getMaterialsText,
    removeFile,
    removeExistingUrl,
    initExistingData,
  };
}
