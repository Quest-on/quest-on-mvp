"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  Files,
  FilesHighlight,
  FolderItem,
  FolderHeader,
  FolderTrigger,
  FolderContent,
  FolderHighlight,
  Folder,
  FolderIcon,
  FolderLabel,
  FileHighlight,
  File,
  FileIcon,
  FileLabel,
} from "@/components/animate-ui/primitives/radix/files";
import { Folder as FolderIconLucide, FolderOpen, FileText, AlertCircle } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import { useTranslations } from "next-intl";

interface ExamNode {
  id: string;
  instructor_id: string;
  parent_id: string | null;
  kind: "folder" | "exam";
  name: string;
  sort_order: number;
  exam_id: string | null;
  created_at: string;
  updated_at: string;
  student_count?: number;
  exams?: {
    id: string;
    title: string;
    code: string;
    description: string;
    duration: number;
    status: string;
    created_at: string;
    updated_at: string;
  } | null;
}

interface FileTreeProps {
  userId?: string;
  currentFolderId?: string | null;
  onFolderClick?: (folderId: string | null) => void;
  onFileClick?: (examId: string) => void;
  className?: string;
}

function FolderTreeItem({
  folder,
  userId,
  currentFolderId,
  onFolderClick,
  onFileClick,
  draggedNode,
  setDraggedNode,
  dragOverNodeId,
  setDragOverNodeId,
  isMoving,
  setIsMoving,
  queryClient,
  level = 0,
}: {
  folder: ExamNode;
  userId?: string;
  currentFolderId?: string | null;
  onFolderClick?: (folderId: string | null) => void;
  onFileClick?: (examId: string) => void;
  draggedNode: ExamNode | null;
  setDraggedNode: (node: ExamNode | null) => void;
  dragOverNodeId: string | null;
  setDragOverNodeId: (id: string | null) => void;
  isMoving: boolean;
  setIsMoving: (moving: boolean) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  level?: number;
}) {
  const t = useTranslations("instructor");
  const {
    data: children = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: qk.drive.folderContents(folder.id, userId),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_folder_contents",
          data: { folder_id: folder.id },
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error("Failed to load folder contents");
      }

      const data = await response.json();
      return data.nodes || [];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 1, // 1분 캐시
  });

  const folders = useMemo(
    () => children.filter((node: ExamNode) => node.kind === "folder"),
    [children]
  );
  const files = useMemo(
    () => children.filter((node: ExamNode) => node.kind === "exam"),
    [children]
  );

  // 하위 폴더에 파일이 있는지 확인 (깊이 2 이상인 경우)
  const hasNestedFiles = useMemo(() => {
    if (level >= 1 && files.length > 0) {
      return true;
    }
    return false;
  }, [level, files.length]);

  const handleFolderClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFolderClick?.(folder.id);
    },
    [folder.id, onFolderClick]
  );

  const handleFileClick = useCallback(
    (examId: string) => {
      onFileClick?.(examId);
    },
    [onFileClick]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: ExamNode) => {
      setDraggedNode(node);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", node.id);
    },
    [setDraggedNode]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedNode(null);
    setDragOverNodeId(null);
  }, [setDraggedNode, setDragOverNodeId]);

  const handleDragOver = useCallback(
    (e: React.DragEvent, node: ExamNode) => {
      if (node.kind !== "folder") {
        return;
      }

      if (
        !draggedNode ||
        draggedNode.id === node.id ||
        draggedNode.parent_id === node.id
      ) {
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverNodeId(node.id);
    },
    [draggedNode, setDragOverNodeId]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverNodeId(null);
  }, [setDragOverNodeId]);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetNode: ExamNode) => {
      e.preventDefault();
      setDragOverNodeId(null);

      if (targetNode.kind !== "folder") {
        return;
      }

      if (
        !draggedNode ||
        draggedNode.id === targetNode.id ||
        draggedNode.parent_id === targetNode.id
      ) {
        return;
      }

      if (draggedNode.kind === "folder") {
        if (targetNode.parent_id === draggedNode.id) {
          toast.error(t("drive.toastMoveSelfError"));
          return;
        }
      }

      try {
        setIsMoving(true);
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "move_node",
            data: {
              node_id: draggedNode.id,
              new_parent_id: targetNode.id,
            },
          }),
        });

        if (response.ok) {
          toast.success(
            t("drive.toastMovedTo", { name: draggedNode.name, target: targetNode.name })
          );
          // 모든 관련 쿼리 무효화
          queryClient.invalidateQueries({
            queryKey: qk.drive.folderContents(null, userId),
          });
          queryClient.invalidateQueries({
            queryKey: qk.drive.folderContents(folder.id, userId),
          });
          queryClient.invalidateQueries({
            queryKey: qk.drive.folderContents(targetNode.id, userId),
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = extractErrorMessage(
            errorData,
            t("drive.toastMoveFail"),
            response.status
          );
          toast.error(errorMessage, {
            duration: 5000,
          });
        }
      } catch (error) {
        const errorMessage = getErrorMessage(error, t("drive.toastMoveFail"));
        toast.error(errorMessage, {
          duration: 5000,
        });
      } finally {
        setIsMoving(false);
        setDraggedNode(null);
      }
    },
    [
      draggedNode,
      setDragOverNodeId,
      setIsMoving,
      setDraggedNode,
      queryClient,
      userId,
      folder.id,
    ]
  );

  const getDragHandlers = useCallback(
    (node: ExamNode) => ({
      draggable: !isMoving && node.kind === "folder",
      onDragStart: (e: React.DragEvent) => handleDragStart(e, node),
      onDragEnd: handleDragEnd,
      onDragOver: (e: React.DragEvent) => handleDragOver(e, node),
      onDragLeave: handleDragLeave,
      onDrop: (e: React.DragEvent) => handleDrop(e, node),
    }),
    [
      isMoving,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDragLeave,
      handleDrop,
    ]
  );

  const isDragSource = draggedNode?.id === folder.id;
  const isDragTarget = dragOverNodeId === folder.id;

  return (
    <FolderItem value={folder.id}>
      <FolderHeader>
        <FolderTrigger className="w-full text-start">
          <FolderHighlight>
            <Folder
              {...getDragHandlers(folder)}
              className={cn(
                "flex items-center gap-2 p-2 text-sm transition-colors",
                isDragSource && "opacity-50",
                isDragTarget && "ring-2 ring-primary ring-offset-2",
                currentFolderId === folder.id
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              onClick={handleFolderClick}
            >
              <FolderIcon
                closeIcon={<FolderIconLucide className="size-4" />}
                openIcon={<FolderOpen className="size-4" />}
              />
              <FolderLabel className="truncate">{folder.name}</FolderLabel>
            </Folder>
          </FolderHighlight>
        </FolderTrigger>
      </FolderHeader>
      <div className="relative ml-8 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-[1px] before:bg-border/50">
        <FolderContent className="pl-2">
          {isLoading ? (
            <div className="py-1 text-xs text-muted-foreground pl-2">
              {t("fileTree.loading")}
            </div>
          ) : isError ? (
            /* 오류일 때 빈 트리를 조용히 그리면 자료가 없는 것처럼 보인다. (#241) */
            <button
              type="button"
              onClick={() => refetch()}
              className="flex w-full items-center gap-1.5 py-1 pl-2 text-xs text-destructive"
            >
              <AlertCircle className="size-3.5" />
              <span>{t("fileTree.loadError")}</span>
            </button>
          ) : (
            <>
              {/* 파일들을 먼저 표시 */}
              {level === 0
                ? // 최상위 레벨: 파일들을 모두 표시
                  files.map((file: ExamNode) => {
                    const fileDragHandlers = getDragHandlers(file);
                    const isFileDragSource = draggedNode?.id === file.id;
                    return (
                      <FileHighlight key={file.id}>
                        <File
                          {...fileDragHandlers}
                          className={cn(
                            "flex items-center gap-2 p-2 text-sm transition-colors cursor-pointer",
                            isFileDragSource && "opacity-50",
                            "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                          onClick={() => {
                            if (file.exam_id && !isMoving) {
                              handleFileClick(file.exam_id);
                            }
                          }}
                        >
                          <FileIcon>
                            <FileText className="size-4" />
                          </FileIcon>
                          <FileLabel className="truncate">
                            {file.name}
                          </FileLabel>
                        </File>
                      </FileHighlight>
                    );
                  })
                : // 하위 레벨 (level >= 1): 파일이 있으면 "..." 표시
                  files.length > 0 && (
                    <FileHighlight>
                      <File className="flex items-center gap-2 p-2 text-sm text-sidebar-foreground/50">
                        <FileIcon>
                          <FileText className="size-4 opacity-50" />
                        </FileIcon>
                        <FileLabel className="text-xs">...</FileLabel>
                      </File>
                    </FileHighlight>
                  )}
              {/* 하위 폴더들 */}
              {folders.length > 0 && (
                <Files>
                  {folders.map((childFolder: ExamNode) => (
                    <FolderTreeItem
                      key={childFolder.id}
                      folder={childFolder}
                      userId={userId}
                      currentFolderId={currentFolderId}
                      onFolderClick={onFolderClick}
                      onFileClick={onFileClick}
                      draggedNode={draggedNode}
                      setDraggedNode={setDraggedNode}
                      dragOverNodeId={dragOverNodeId}
                      setDragOverNodeId={setDragOverNodeId}
                      isMoving={isMoving}
                      setIsMoving={setIsMoving}
                      queryClient={queryClient}
                      level={level + 1}
                    />
                  ))}
                </Files>
              )}
            </>
          )}
        </FolderContent>
      </div>
    </FolderItem>
  );
}

export function FileTree({
  userId,
  currentFolderId: propCurrentFolderId,
  onFolderClick,
  onFileClick,
  className,
}: FileTreeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAppUser();
  const queryClient = useQueryClient();
  const effectiveUserId = userId || user?.id;
  const t = useTranslations("instructor");

  // URL 쿼리 파라미터에서 currentFolderId를 읽거나 prop에서 가져옴
  const currentFolderId = propCurrentFolderId ?? searchParams.get("folder");

  // 드래그 앤 드롭 상태
  const [draggedNode, setDraggedNode] = useState<ExamNode | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const {
    data: rootNodes = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: qk.drive.folderContents(null, effectiveUserId),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_folder_contents",
          data: { folder_id: null },
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error("Failed to load root folder contents");
      }

      const data = await response.json();
      return data.nodes || [];
    },
    enabled: !!effectiveUserId,
    staleTime: 1000 * 60 * 1, // 1분 캐시
  });

  const rootFolders = useMemo(
    () => rootNodes.filter((node: ExamNode) => node.kind === "folder"),
    [rootNodes]
  );
  const rootFiles = useMemo(
    () => rootNodes.filter((node: ExamNode) => node.kind === "exam"),
    [rootNodes]
  );

  const handleFolderClick = useCallback(
    (folderId: string | null) => {
      onFolderClick?.(folderId);
      // drive 페이지로 리다이렉트하지 않고 현재 페이지에서 폴더만 변경
      // URL 업데이트는 선택사항 (필요시 쿼리 파라미터로 관리)
    },
    [onFolderClick]
  );

  const handleFileClick = useCallback(
    (examId: string) => {
      onFileClick?.(examId);
      router.push(`/instructor/${examId}`);
    },
    [onFileClick, router]
  );

  const handleDragStart = useCallback((e: React.DragEvent, node: ExamNode) => {
    setDraggedNode(node);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedNode(null);
    setDragOverNodeId(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, node: ExamNode) => {
      if (node.kind !== "folder") {
        return;
      }

      if (
        !draggedNode ||
        draggedNode.id === node.id ||
        draggedNode.parent_id === node.id
      ) {
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverNodeId(node.id);
    },
    [draggedNode]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverNodeId(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetNode: ExamNode) => {
      e.preventDefault();
      setDragOverNodeId(null);

      if (targetNode.kind !== "folder") {
        return;
      }

      if (
        !draggedNode ||
        draggedNode.id === targetNode.id ||
        draggedNode.parent_id === targetNode.id
      ) {
        return;
      }

      if (draggedNode.kind === "folder") {
        if (targetNode.parent_id === draggedNode.id) {
          toast.error(t("drive.toastMoveSelfError"));
          return;
        }
      }

      try {
        setIsMoving(true);
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "move_node",
            data: {
              node_id: draggedNode.id,
              new_parent_id: targetNode.id,
            },
          }),
        });

        if (response.ok) {
          toast.success(
            t("drive.toastMovedTo", { name: draggedNode.name, target: targetNode.name })
          );
          // 모든 관련 쿼리 무효화
          queryClient.invalidateQueries({
            queryKey: qk.drive.folderContents(null, effectiveUserId),
          });
          queryClient.invalidateQueries({
            queryKey: qk.drive.folderContents(targetNode.id, effectiveUserId),
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = extractErrorMessage(
            errorData,
            t("drive.toastMoveFail"),
            response.status
          );
          toast.error(errorMessage, {
            duration: 5000,
          });
        }
      } catch (error) {
        const errorMessage = getErrorMessage(error, t("drive.toastMoveFail"));
        toast.error(errorMessage, {
          duration: 5000,
        });
      } finally {
        setIsMoving(false);
        setDraggedNode(null);
      }
    },
    [draggedNode, queryClient, effectiveUserId]
  );

  const getDragHandlers = useCallback(
    (node: ExamNode) => ({
      draggable: !isMoving && node.kind === "folder",
      onDragStart: (e: React.DragEvent) => handleDragStart(e, node),
      onDragEnd: handleDragEnd,
      onDragOver: (e: React.DragEvent) => handleDragOver(e, node),
      onDragLeave: handleDragLeave,
      onDrop: (e: React.DragEvent) => handleDrop(e, node),
    }),
    [
      isMoving,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDragLeave,
      handleDrop,
    ]
  );

  if (isLoading) {
    return (
      <div className={cn("p-4 text-sm text-muted-foreground", className)}>
        {t("fileTree.loading")}
      </div>
    );
  }

  // 오류를 빈 상태로 보여주면 안 된다. isError 를 안 보면 조회 실패가
  // "폴더 없음" 으로 렌더돼 자료가 사라진 것처럼 읽힌다. (#241)
  if (isError) {
    return (
      <div className={cn("p-4", className)}>
        <ErrorAlert
          message={t("fileTree.loadError")}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (rootFolders.length === 0 && rootFiles.length === 0) {
    return (
      <div className={cn("p-4 text-sm text-muted-foreground", className)}>
        {t("fileTree.noFolders")}
      </div>
    );
  }

  return (
    <div className={cn("overflow-y-auto", className)}>
      <FilesHighlight className="bg-accent pointer-events-none">
        <Files className="p-1">
          {rootFolders.map((folder: ExamNode) => (
            <FolderTreeItem
              key={folder.id}
              folder={folder}
              userId={effectiveUserId}
              currentFolderId={currentFolderId}
              onFolderClick={handleFolderClick}
              onFileClick={handleFileClick}
              draggedNode={draggedNode}
              setDraggedNode={setDraggedNode}
              dragOverNodeId={dragOverNodeId}
              setDragOverNodeId={setDragOverNodeId}
              isMoving={isMoving}
              setIsMoving={setIsMoving}
              queryClient={queryClient}
              level={0}
            />
          ))}
          {rootFiles.map((file: ExamNode) => {
            const fileDragHandlers = getDragHandlers(file);
            const isFileDragSource = draggedNode?.id === file.id;
            return (
              <FileHighlight key={file.id}>
                <File
                  {...fileDragHandlers}
                  className={cn(
                    "flex items-center gap-2 p-2 text-sm transition-colors cursor-pointer",
                    isFileDragSource && "opacity-50",
                    "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  onClick={() => {
                    if (file.exam_id && !isMoving) {
                      handleFileClick(file.exam_id);
                    }
                  }}
                >
                  <FileIcon>
                    <FileText className="size-4" />
                  </FileIcon>
                  <FileLabel className="truncate">{file.name}</FileLabel>
                </File>
              </FileHighlight>
            );
          })}
        </Files>
      </FilesHighlight>
    </div>
  );
}
