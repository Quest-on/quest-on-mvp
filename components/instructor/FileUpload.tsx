"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, Upload, FolderOpen, X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

type ExtractionStatus = "uploading" | "extracting" | "done" | "failed";

interface StatusConfig {
  label: string;
  barWidth: string;
  barColor: string;
  textColor: string;
  pulse: boolean;
}

function getStatusConfig(status: ExtractionStatus, labels: Record<ExtractionStatus, string>): StatusConfig {
  switch (status) {
    case "uploading":
      return {
        label: labels.uploading,
        barWidth: "w-2/5",
        barColor: "bg-amber-400",
        textColor: "text-amber-600 dark:text-amber-400",
        pulse: true,
      };
    case "extracting":
      return {
        label: labels.extracting,
        barWidth: "w-3/4",
        barColor: "bg-blue-500",
        textColor: "text-blue-600 dark:text-blue-400",
        pulse: true,
      };
    case "done":
      return {
        label: labels.done,
        barWidth: "w-full",
        barColor: "bg-emerald-500",
        textColor: "text-emerald-600 dark:text-emerald-400",
        pulse: false,
      };
    case "failed":
      return {
        label: labels.failed,
        barWidth: "w-full",
        barColor: "bg-red-500",
        textColor: "text-red-600 dark:text-red-400",
        pulse: false,
      };
  }
}

interface FileUploadProps {
  files: File[];
  disabledFiles: Set<number>;
  canAddMoreFiles: boolean;
  isDragOver: boolean;
  totalSize: number;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragAreaClick: () => void;
  onRemoveFile: (index: number) => void;
  getFileIcon: (fileName: string) => ReactNode;
  existingFiles?: Array<{ url: string; name: string; index: number }>;
  onRemoveExistingFile?: (index: number) => void;
  extractionStatus?: Map<string, ExtractionStatus>;
}

export function FileUpload({
  files,
  disabledFiles,
  canAddMoreFiles,
  isDragOver,
  totalSize,
  onFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragAreaClick,
  onRemoveFile,
  getFileIcon,
  existingFiles = [],
  onRemoveExistingFile,
  extractionStatus,
}: FileUploadProps) {
  const t = useTranslations("authoring");
  const statusLabels: Record<ExtractionStatus, string> = {
    uploading: t("fileUpload.statusUploading"),
    extracting: t("fileUpload.statusExtracting"),
    done: t("fileUpload.statusDone"),
    failed: t("fileUpload.statusFailed"),
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("fileUpload.cardTitle")}
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                {t("fileUpload.tooltipContent")}
              </p>
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardDescription>
          {t("fileUpload.cardDescription")}
          {!canAddMoreFiles && t("fileUpload.capacityExceeded")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <Input
            id="materials"
            type="file"
            multiple
            accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.hwp,.hwpx,.jpg,.jpeg,.png,.gif,.webp"
            onChange={onFileSelect}
            className="hidden"
            disabled={!canAddMoreFiles}
          />
          <div
            className={`text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg transition-all duration-200 ${
              isDragOver
                ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                : canAddMoreFiles
                ? "border-border cursor-pointer hover:border-muted-foreground hover:bg-muted/50"
                : "border-muted cursor-not-allowed bg-muted/50 text-muted-foreground"
            }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onDragAreaClick}
          >
            <div className="flex flex-col items-center gap-2">
              {isDragOver ? (
                <FolderOpen className="w-8 h-8 text-blue-500" />
              ) : (
                <Upload className="w-8 h-8 text-muted-foreground" />
              )}
              <div className="text-sm font-medium">
                {isDragOver
                  ? t("fileUpload.dropHint")
                  : t("fileUpload.uploadHint")}
              </div>
            </div>
          </div>
        </div>

        {(existingFiles.length > 0 || files.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t("fileUpload.uploadedFilesLabel")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("fileUpload.totalSize", { size: (totalSize / 1024 / 1024).toFixed(1) })}
              </span>
            </div>
            <div className="space-y-1">
              {/* 기존 파일들 */}
              {existingFiles.map((file) => (
                <div
                  key={file.index}
                  className="flex items-center justify-between p-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                >
                  <div className="flex items-center gap-2">
                    {getFileIcon(file.name)}
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("fileUpload.existingFile")}
                    </span>
                  </div>
                  {onRemoveExistingFile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => onRemoveExistingFile(file.index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {/* 새로 추가된 파일들 */}
              {files.map((file, index) => {
                const isDisabled = disabledFiles.has(index);
                const status = extractionStatus?.get(file.name);
                const cfg = status ? getStatusConfig(status, statusLabels) : null;
                const isInProgress = status === "uploading" || status === "extracting";

                return (
                  <div
                    key={index}
                    className={`rounded-md overflow-hidden border transition-colors duration-300 ${
                      isDisabled
                        ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                        : status === "done"
                        ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                        : status === "failed"
                        ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                        : isInProgress
                        ? "bg-muted/30 border-border"
                        : "bg-muted/50 border-transparent"
                    }`}
                  >
                    {/* Main row */}
                    <div className="flex items-center justify-between px-2 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Icon area: spinner while in-progress, file icon otherwise */}
                        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                          {isInProgress ? (
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          ) : status === "done" ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : status === "failed" ? (
                            <XCircle className="w-5 h-5 text-red-500" />
                          ) : (
                            getFileIcon(file.name)
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span
                            className={`text-sm font-medium truncate ${
                              isDisabled ? "text-red-600 dark:text-red-400" : ""
                            }`}
                          >
                            {file.name}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            ({(file.size / 1024 / 1024).toFixed(1)}MB)
                          </span>
                          {isDisabled && (
                            <span className="text-xs text-red-500 font-medium shrink-0">
                              {t("fileUpload.disabledFile")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {/* Status label */}
                        {cfg && (
                          <span className={`text-xs font-medium ${cfg.textColor}`}>
                            {cfg.label}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          onClick={() => onRemoveFile(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {cfg && (
                      <div className="h-1 w-full bg-muted">
                        <div
                          className={`h-full transition-all duration-700 ease-in-out ${cfg.barWidth} ${cfg.barColor} ${
                            cfg.pulse ? "animate-pulse" : ""
                          }`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
