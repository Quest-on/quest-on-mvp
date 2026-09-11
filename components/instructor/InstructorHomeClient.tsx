"use client";
import { resolveCodeGate, type InstructorQuotaResponse } from "@/components/instructor/ExamCode";

import { Button } from "@/components/ui/button";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  Plus,
  FileText,
  Clock,
  Loader2,
  Menu,
  LayoutDashboard,
  FolderOpen,
  List,
  Folder,
  Search,
  LayoutGrid,
  MoreVertical,
  Copy,
  Files as FilesIcon,
  Trash2,
  FolderPlus,
  Edit,
  Home,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Palette,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SUPPORT_EMAIL } from "@/lib/contact";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import {
  Files,
  FilesHighlight,
  FolderItem,
  FolderHeader,
  FolderTrigger,
  FolderContent,
  FolderHighlight,
  Folder as FilesFolder,
  FolderIcon,
  FolderLabel,
  FileHighlight,
  File as FilesFile,
  FileIcon,
  FileLabel,
} from "@/components/animate-ui/primitives/radix/files";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/animate-ui/components/base/alert-dialog";
import { useTranslations, useLocale } from "next-intl";
import { formatDate as i18nFormatDate } from "@/lib/i18n/format";

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
  color?: string | null;
  student_count?: number;
  child_count?: number;
  exams?: {
    id: string;
    title: string;
    code: string;
    description: string;
    duration: number;
    status: string;
    type?: string | null;
    deadline?: string | null;
    open_at?: string | null;
    /** 발행 한도 판정용 (이슈 #84). 데모는 한도를 소모하지 않는다. */
    is_demo?: boolean;
    /** 이미 학생을 받은 시험에는 발행 한도를 재적용하지 않는다. */
    first_published_at?: string | null;
    created_at: string;
    updated_at: string;
  } | null;
}

type ExamFilterType =
  | "all"
  | "exam"
  | "assignment"
  | "deadline"
  | "in-progress";

// Labels are resolved inside the component using t()
const EXAM_FILTER_OPTION_VALUES: ExamFilterType[] = ["all", "exam", "assignment", "deadline", "in-progress"];

const FOLDER_CARD_STEP_PX = 226; // folder card width (210) + gap (16)

function getFolderCardsPerStep(viewportWidth: number) {
  if (viewportWidth < 640) return 1;
  if (viewportWidth < 1100) return 2;
  return 3;
}

const FOLDER_COLORS = [
  { value: "blue",   labelKey: "drive.colorBlue"   as const, back: "hsl(215 60% 72%)", body: "hsl(214 80% 96%)", darkBack: "hsl(215 50% 40%)", darkBody: "hsl(214 28% 19%)" },
  { value: "teal",   labelKey: "drive.colorTeal"   as const, back: "hsl(172 45% 60%)", body: "hsl(172 50% 95%)", darkBack: "hsl(172 40% 32%)", darkBody: "hsl(172 22% 18%)" },
  { value: "green",  labelKey: "drive.colorGreen"  as const, back: "hsl(145 40% 62%)", body: "hsl(145 45% 95%)", darkBack: "hsl(145 35% 32%)", darkBody: "hsl(145 20% 18%)" },
  { value: "yellow", labelKey: "drive.colorYellow" as const, back: "hsl(45 65% 65%)",  body: "hsl(45 75% 95%)",  darkBack: "hsl(45 55% 36%)",  darkBody: "hsl(45 20% 18%)" },
  { value: "red",    labelKey: "drive.colorRed"    as const, back: "hsl(0 55% 68%)",   body: "hsl(0 65% 96%)",   darkBack: "hsl(0 48% 38%)",   darkBody: "hsl(0 20% 18%)" },
  { value: "purple", labelKey: "drive.colorPurple" as const, back: "hsl(270 40% 70%)", body: "hsl(270 50% 96%)", darkBack: "hsl(270 35% 38%)", darkBody: "hsl(270 20% 18%)" },
  { value: "pink",   labelKey: "drive.colorPink"   as const, back: "hsl(330 50% 72%)", body: "hsl(330 55% 96%)", darkBack: "hsl(330 42% 40%)", darkBody: "hsl(330 20% 18%)" },
  { value: "gray",   labelKey: "drive.colorGray"   as const, back: "hsl(220 10% 72%)", body: "hsl(220 8% 96%)",  darkBack: "hsl(220 8% 35%)",  darkBody: "hsl(220 8% 18%)" },
];

export default function InstructorHome() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user, profile } = useAppUser();
  const queryClient = useQueryClient();
  const t = useTranslations("instructor");
  const locale = useLocale() as "ko" | "en";
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<ExamNode | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState<ExamNode | null>(null);
  const [editName, setEditName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [examFilter, setExamFilter] = useState<ExamFilterType>("all");
  const [draggedNode, setDraggedNode] = useState<ExamNode | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const folderScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollFoldersLeft, setCanScrollFoldersLeft] = useState(false);
  const [canScrollFoldersRight, setCanScrollFoldersRight] = useState(false);


  // TanStack Query로 폴더 내용 가져오기 (무한 스크롤 페이지네이션)
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError: isExamListError,
    refetch: refetchExamList,
  } = useInfiniteQuery({
    queryKey: qk.drive.folderContents(currentFolderId, user?.id),
    queryFn: async ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) => {
      const limit = pageParam === 0 ? 12 : 8;
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_folder_contents",
          data: { folder_id: currentFolderId, examLimit: limit, examOffset: pageParam },
        }),
        signal,
      });

      if (!response.ok) {
        let errorData: { error?: string; details?: string } = {};
        try {
          const text = await response.text();
          if (text) errorData = JSON.parse(text);
        } catch {
          errorData = { error: `서버 오류 (${response.status}): ${response.statusText}` };
        }
        const errorMessage =
          errorData.error ||
          errorData.details ||
          `폴더 내용을 불러오는데 실패했습니다. (${response.status})`;
        throw new Error(errorMessage);
      }

      return response.json() as Promise<{
        folders: ExamNode[];
        exams: ExamNode[];
        hasMoreExams: boolean;
        totalExamCount: number;
      }>;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMoreExams) return undefined;
      return allPages.reduce((sum, p) => sum + p.exams.length, 0);
    },
    initialPageParam: 0,
    enabled: !!(isLoaded && isSignedIn),
    staleTime: 1000 * 60 * 1,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: "always",
  });

  // 브레드크럼 쿼리
  const { data: breadcrumbData } = useQuery({
    queryKey: qk.drive.breadcrumb(currentFolderId || ""),
    queryFn: async ({ signal }) => {
      if (!currentFolderId) {
        return [];
      }
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_breadcrumb",
          data: { folder_id: currentFolderId },
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error("브레드크럼을 불러오는데 실패했습니다.");
      }

      const data = await response.json();
      return data.breadcrumb || [];
    },
    enabled: !!(isLoaded && isSignedIn && currentFolderId),
    staleTime: 1000 * 60 * 5, // 5분 캐시
  });

  const breadcrumb = breadcrumbData || [];

  // Scroll to top on mount (한 번만 실행)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, []); // 빈 의존성 배열로 마운트 시 한 번만 실행

  // Derive flat folder and exam lists from infinite pages
  const allFolderNodes = useMemo<ExamNode[]>(
    () => infiniteData?.pages[0]?.folders ?? [],
    [infiniteData]
  );
  const allExamNodes = useMemo<ExamNode[]>(() => {
    const seen = new Set<string>();
    return (infiniteData?.pages.flatMap((p) => p.exams) ?? []).filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });
  }, [infiniteData]);

  const folderNodes = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const folders = query
      ? allFolderNodes.filter((n) => n.name.toLowerCase().includes(query))
      : allFolderNodes;
    return [...folders].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [allFolderNodes, searchQuery]);

  const examNodes = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const exams = query
      ? allExamNodes.filter((n) => n.name.toLowerCase().includes(query))
      : allExamNodes;
    return [...exams].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [allExamNodes, searchQuery]);

  // 온보딩이 만든 데모. 있으면 착지 화면이 그걸 다음 걸음으로 가리킨다(#212).
  //
  // 예전에는 examNodes 에서 찾았는데, 드라이브 조회가 AC-17 때문에
  // .eq("exams.is_demo", false) 로 데모를 걸러낸다(drive-handlers.ts:141).
  // 그래서 이 안내는 한 번도 뜬 적이 없는 죽은 코드였다. 목록에 끼우는
  // 대신 id 만 따로 받는다.
  const { data: demoStatus } = useQuery({
    queryKey: qk.instructor.demoStatus(),
    queryFn: async () => {
      const res = await fetch("/api/onboarding/demo/status");
      if (!res.ok) return null;
      return (await res.json()) as {
        completed: boolean;
        examId: string | null;
      } | null;
    },
  });
  const demoExamId = demoStatus?.examId ?? null;
  const isDemoCompleted = demoStatus?.completed === true;

  const filteredExamNodes = useMemo(() => {
    if (examFilter === "all") {
      return examNodes;
    }

    const now = Date.now();

    return examNodes.filter((node) => {
      const examType = node.exams?.type;
      const status = node.exams?.status;
      const hasDeadline = Boolean(node.exams?.deadline);
      const deadlineTime = node.exams?.deadline
        ? new Date(node.exams.deadline).getTime()
        : Number.NaN;
      const isDeadlinePassed = hasDeadline && !Number.isNaN(deadlineTime) && deadlineTime < now;
      const isInProgress =
        status === "active" ||
        (hasDeadline && !Number.isNaN(deadlineTime) && deadlineTime >= now);

      const isNonExamType = examType && examType !== "exam";

      switch (examFilter) {
        case "exam":
          return !isNonExamType;
        case "assignment":
          return !!isNonExamType;
        case "deadline":
          return status === "completed" || isDeadlinePassed;
        case "in-progress":
          return isInProgress;
        default:
          return true;
      }
    });
  }, [examNodes, examFilter]);

  const isFiltering = searchQuery.trim().length > 0;
  const isExamFilterActive = examFilter !== "all";
  const hasResults = folderNodes.length > 0 || filteredExamNodes.length > 0;

  // Intersection Observer sentinel for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 삭제 후 데이터 새로고침 (TanStack Query 캐시 무효화)
  const refetchFolderContents = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: qk.drive.folderContents(currentFolderId, user?.id),
    });
  }, [queryClient, currentFolderId, user?.id]);

  const formatDate = useCallback(
    (dateString: string) => {
      try {
        return i18nFormatDate(dateString, locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      } catch {
        return "";
      }
    },
    [locale]
  );

  // 발행 한도. 교수자가 코드를 건네기 전에 알아야 한다(이슈 #84).
  const { data: quotaData } = useQuery<InstructorQuotaResponse>({
    queryKey: qk.instructor.quota(),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/instructor/quota", { signal });
      if (!response.ok) throw new Error("quota");
      return response.json() as Promise<InstructorQuotaResponse>;
    },
  });

  const handleCopyExamCode = async (code?: string, gateBlocked?: boolean) => {
    if (!code) {
      toast.error(t("drive.toastExamCodeMissing"));
      return;
    }
    // 발행 한도에 도달한 미발행 시험의 코드는 복사시키지 않는다 (이슈 #84).
    // 복사해 수업 자료에 붙인 뒤에 막으면, 수업 중에 학생 전원이 튕긴다.
    if (gateBlocked) {
      toast.error(t("drive.toastExamCodeBlocked", { email: SUPPORT_EMAIL }));
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("drive.toastExamCodeCopied"), {
        id: "copy-exam-code", // 중복 방지
      });
    } catch {
      toast.error(t("drive.toastExamCodeCopyFail"), {
        id: "copy-exam-code-error",
      });
    }
  };

  const handleCopyExam = async (node: ExamNode) => {
    if (node.kind !== "exam" || !node.exam_id) {
      toast.error(t("drive.toastCannotCopyExam"));
      return;
    }

    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "copy_exam",
          data: { exam_id: node.exam_id },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error ||
          errorData.details ||
          t("drive.toastCannotCopyExam");
        toast.error(errorMessage, {
          duration: 5000,
        });
        return;
      }

      toast.success(t("drive.toastExamCopied"), {
        id: "copy-exam-success",
      });

      // Refresh folder contents
      refetchFolderContents();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("drive.toastCannotCopyExam");
      toast.error(errorMessage, {
        duration: 5000,
      });
    }
  };

  const handleDeleteClick = (node: ExamNode) => {
    setNodeToDelete(node);
    setDeleteConfirmInput("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteNode = async (node: ExamNode) => {
    setIsDeleting(true);
    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete_node",
          data: { node_id: node.id },
        }),
      });

      if (response.ok) {
        toast.success(t("drive.toastDeleted"));
        setDeleteDialogOpen(false);
        setNodeToDelete(null);
        setDeleteConfirmInput("");
        refetchFolderContents(); // TanStack Query 캐시 무효화 및 재조회
      } else {
        const errorData = await response.json().catch(() => ({}));
        // 에러 메시지 추출 (여러 필드 확인)
        const errorMsg =
          errorData.error ||
          errorData.message ||
          errorData.details ||
          `HTTP ${response.status}: ${response.statusText}`;

        // 영어 메시지인 경우 기본 한글 메시지 사용
        const isEnglish =
          errorMsg && /[a-zA-Z]/.test(errorMsg) && !/[가-힣]/.test(errorMsg);
        toast.error(
          isEnglish
            ? `${t("drive.toastMoveFail")}. (${errorMsg})`
            : errorMsg || t("drive.toastMoveFail"),
          {
            duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
          }
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isEnglish =
        /[a-zA-Z]/.test(errorMessage) && !/[가-힣]/.test(errorMessage);
      toast.error(
        isEnglish
          ? `${t("drive.toastMoveFail")}. (${errorMessage})`
          : errorMessage || t("drive.toastMoveFail"),
        {
          duration: 5000,
        }
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const renderNodeStatus = (node: ExamNode) => {
    if (node.kind !== "exam" || !node.exams) {
      return null;
    }

    const examType = node.exams.type;
    const isNonExamType = examType && examType !== "exam";

    // For non-exam types (assignments), derive status from time window
    if (isNonExamType) {
      const now = new Date();
      const deadline = node.exams.deadline ? new Date(node.exams.deadline) : null;
      const openAt = node.exams.open_at ? new Date(node.exams.open_at) : null;

      if (deadline && now > deadline) {
        return (
          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground">
            {t("drive.statusDeadlinePassed")}
          </span>
        );
      }
      if (!openAt || now >= openAt) {
        return (
          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-success-subtle text-success-text dark:text-success-solid">
            {t("drive.statusActive")}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-warning-subtle text-warning-text dark:text-warning-solid">
          {t("drive.statusScheduled")}
        </span>
      );
    }

    // Existing exam logic
    const statusLabel =
      node.exams.status === "active"
        ? t("drive.statusActive")
        : node.exams.status === "draft"
        ? t("drive.statusDraft")
        : t("drive.statusCompleted");

    if (node.exams.status === "draft") {
      return null;
    }

    const badgeClasses =
      node.exams.status === "active"
        ? "bg-success-subtle text-success-text dark:text-success-solid"
        : "bg-secondary text-secondary-foreground";

    return (
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badgeClasses}`}
      >
        {statusLabel}
      </span>
    );
  };

  const renderStudentCount = (node: ExamNode) => {
    if (node.kind !== "exam") {
      return null;
    }
    const studentCount = node.student_count ?? 0;
    return (
      <span className="type-meta">
        {t("drive.studentCount", { count: studentCount })}
      </span>
    );
  };

  const handleEditClick = (node: ExamNode) => {
    if (node.kind === "exam") {
      // 시험/과제인 경우 편집 페이지로 이동
      if (node.exam_id) {
        if (node.exams?.type && node.exams.type !== "exam") {
          router.push(`/instructor/assignment/${node.exam_id}/edit`);
        } else {
          router.push(`/instructor/${node.exam_id}/edit`);
        }
      }
    } else {
      // 폴더인 경우 이름 편집 다이얼로그 열기
      setNodeToEdit(node);
      setEditName(node.name);
      setIsEditDialogOpen(true);
    }
  };

  const handleUpdateNode = async () => {
    if (!nodeToEdit || !editName.trim()) {
      toast.error(t("drive.toastNameRequired"));
      return;
    }

    if (editName.trim() === nodeToEdit.name) {
      setIsEditDialogOpen(false);
      return;
    }

    try {
      setIsUpdating(true);
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_node",
          data: {
            node_id: nodeToEdit.id,
            name: editName.trim(),
          },
        }),
      });

      if (response.ok) {
        toast.success(t("drive.toastRenamed"));
        setIsEditDialogOpen(false);
        setNodeToEdit(null);
        setEditName("");
        // Invalidate folder contents query
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
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
      setIsUpdating(false);
    }
  };

  const handleColorChange = async (nodeId: string, color: string | null) => {
    const queryKey = qk.drive.folderContents(currentFolderId, user?.id);
    const previousData = queryClient.getQueryData(queryKey);

    // Optimistic update
    queryClient.setQueryData(queryKey, (old: unknown) => {
      if (!old || typeof old !== "object" || !("pages" in old)) return old;
      const data = old as { pages: Array<{ folders: ExamNode[]; exams: ExamNode[]; hasMoreExams: boolean; totalExamCount: number }>; pageParams: number[] };
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          folders: page.folders.map((f) =>
            f.id === nodeId ? { ...f, color } : f
          ),
        })),
      };
    });

    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_node",
          data: { node_id: nodeId, color },
        }),
      });

      if (!response.ok) {
        queryClient.setQueryData(queryKey, previousData);
        toast.error(t("drive.toastColorChangeFail"));
      }
    } catch {
      queryClient.setQueryData(queryKey, previousData);
      toast.error(t("drive.toastColorChangeFail"));
    }
  };

  const renderNodeActions = (node: ExamNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-40 group-hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px]"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("drive.menuOpen")}
        >
          <MoreVertical className="w-4 h-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleEditClick(node);
          }}
        >
          <Edit className="w-4 h-4 mr-2" aria-hidden="true" />
          {t("drive.menuEdit")}
        </DropdownMenuItem>
        {node.kind === "folder" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="[&>svg:last-child]:hidden">
              <Palette className="w-4 h-4 mr-2" aria-hidden="true" />
              {t("drive.menuColorChange")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="p-2 min-w-0">
              <div className="grid grid-cols-5 gap-1.5">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColorChange(node.id, c.value);
                    }}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110",
                      node.color === c.value || (!node.color && c.value === "blue")
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    )}
                    style={{ background: c.back }}
                    title={t(c.labelKey)}
                  />
                ))}
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {node.kind === "exam" && node.exams?.code && (
          <>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                // 발행 한도에 걸린 미발행 시험은 코드를 복사시키지 않는다.
                // 이 인자를 안 넘기면 게이트가 있어도 없는 것과 같다.
                handleCopyExamCode(
                  node.exams?.code,
                  resolveCodeGate({
                    isDemo: node.exams?.is_demo,
                    alreadyPublished: !!node.exams?.first_published_at,
                    publishesRemaining: quotaData?.publishesRemaining ?? null,
                  }) === "blocked"
                );
              }}
            >
              <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
              {t("drive.menuExamCode")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopyExam(node);
              }}
            >
              <FilesIcon className="w-4 h-4 mr-2" aria-hidden="true" />
              {t("drive.menuCopy")}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteClick(node);
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
          {t("drive.menuDelete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const getViewButtonClasses = (mode: "grid" | "list") =>
    cn(
      "p-1.5 rounded-md transition-colors",
      viewMode === mode
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground"
    );

  // 그리드 뷰 스켈레톤 컴포넌트
  const GridCardSkeleton = () => (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Icon area */}
      <div className="flex items-center justify-center py-10 px-6">
        <Skeleton className="h-14 w-14 rounded-lg" />
      </div>
      {/* Info area */}
      <div className="flex flex-col gap-1.5 border-t bg-muted/40 px-4 py-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between mt-0.5">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      {/* Menu button */}
      <div className="absolute right-2 top-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
    </div>
  );

  // 리스트 뷰 스켈레톤 컴포넌트
  const ListItemSkeleton = () => (
    <div className="group flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3">
      <div className="flex items-center gap-4 flex-1">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-1" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  );

  // 시험 상세는 sessions까지 포함한 완전한 payload가 필요하므로 hover prefetch 비활성화.
  // (이전 구현은 동일 queryKey에 students: []를 저장해 상세 화면 stale 상태를 유발함)
  const handleExamNodeHover = useCallback(
    (node: ExamNode) => {
      if (node.kind === "folder" || !node.exam_id) return;
    },
    []
  );

  // 노드 클릭 핸들러 최적화
  const handleNodeClick = useCallback(
    (node: ExamNode) => {
      if (node.kind === "folder") {
        // 폴더 클릭 시 하위 내용 표시 (부분 렌더링)
        setCurrentFolderId(node.id);
      } else if (node.exam_id) {
        if (node.exams?.type && node.exams.type !== "exam") {
          router.push(`/instructor/assignment/${node.exam_id}`);
        } else {
          router.push(`/instructor/${node.exam_id}`);
        }
      }
    },
    [router]
  );

  const handleBreadcrumbClick = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
  }, []);

  const handleCreateFolder = async () => {
    try {
      setIsCreatingFolder(true);
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_folder",
          data: {
            name: t("drive.newFolder"),
            parent_id: currentFolderId,
          },
        }),
      });

      if (response.ok) {
        toast.success(t("drive.toastFolderCreated"));
        // Invalidate folder contents query
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          t("drive.toastFolderCreateFail"),
          response.status
        );
        toast.error(errorMessage, {
          duration: 5000,
        });
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error, t("drive.toastFolderCreateFail"));
      toast.error(errorMessage, {
        duration: 5000,
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const renderCreateFolderCard = useCallback(
    () => (
      <button
        type="button"
        onClick={handleCreateFolder}
        disabled={isCreatingFolder}
        className={cn(
          "folder-card folder-card--empty group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01]",
          "disabled:cursor-not-allowed disabled:opacity-70"
        )}
        aria-label={t("drive.newFolder")}
      >
        <div className="folder-card__back" aria-hidden />
        <div className="folder-card__body">
          <div className="flex h-full flex-col items-center justify-center gap-2">
            {isCreatingFolder ? (
              <Loader2 className="h-6 w-6 text-primary/80 animate-spin" strokeWidth={1.75} />
            ) : (
              <Plus className="h-6 w-6 text-primary/80" strokeWidth={1.75} />
            )}
            <p className="text-sm font-semibold text-primary/85">{t("drive.newFolderButton")}</p>
          </div>
        </div>
      </button>
    ),
    [handleCreateFolder, isCreatingFolder]
  );

  const updateFolderScrollButtons = useCallback(() => {
    const container = folderScrollRef.current;
    if (!container) {
      setCanScrollFoldersLeft(false);
      setCanScrollFoldersRight(false);
      return;
    }

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    setCanScrollFoldersLeft(container.scrollLeft > 2);
    setCanScrollFoldersRight(container.scrollLeft < maxScrollLeft - 2);
  }, []);

  const handleFolderRowSlide = useCallback((direction: "left" | "right") => {
    const container = folderScrollRef.current;
    if (!container) return;

    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : container.clientWidth;
    const cardsPerStep = getFolderCardsPerStep(viewportWidth);
    const distance =
      FOLDER_CARD_STEP_PX * cardsPerStep * (direction === "right" ? 1 : -1);

    container.scrollBy({ left: distance, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const container = folderScrollRef.current;
    if (!container) return;

    const syncButtons = () => updateFolderScrollButtons();

    syncButtons();
    container.addEventListener("scroll", syncButtons, { passive: true });
    window.addEventListener("resize", syncButtons);

    return () => {
      container.removeEventListener("scroll", syncButtons);
      window.removeEventListener("resize", syncButtons);
    };
  }, [folderNodes.length, updateFolderScrollButtons]);

  const handleDragStart = (e: React.DragEvent, node: ExamNode) => {
    setDraggedNode(node);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.id);
    if (e.dataTransfer.setDragImage) {
      const isDark = document.documentElement.classList.contains("dark");

      const iconSvg =
        node.kind === "exam"
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               style="flex-shrink:0">
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
               <polyline points="14 2 14 8 20 8"/>
               <line x1="16" y1="13" x2="8" y2="13"/>
               <line x1="16" y1="17" x2="8" y2="17"/>
               <polyline points="10 9 9 9 8 9"/>
             </svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               style="flex-shrink:0">
               <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
             </svg>`;

      const ghost = document.createElement("div");
      ghost.innerHTML = `${iconSvg}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${node.name}</span>`;
      Object.assign(ghost.style, {
        position: "absolute",
        top: "-1000px",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        borderRadius: "8px",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
        background: isDark ? "#1e2130" : "#ffffff",
        color: isDark ? "#e2e8f0" : "#1a202c",
        fontSize: "13px",
        fontWeight: "500",
        maxWidth: "220px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        pointerEvents: "none",
      });

      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 16, 16);
      setTimeout(() => document.body.removeChild(ghost), 0);
    }
  };

  const handleDragEnd = () => {
    setDraggedNode(null);
    setDragOverNodeId(null);
  };

  const handleDragOver = (e: React.DragEvent, node: ExamNode) => {
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

    if (draggedNode.kind === "folder") {
      if (node.parent_id === draggedNode.id) {
        return;
      }
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverNodeId(node.id);
  };

  const handleDragLeave = () => {
    setDragOverNodeId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetNode: ExamNode) => {
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
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
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
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    if (!draggedNode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedNode) return;

    if (draggedNode.parent_id === null) {
      return;
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
            new_parent_id: null,
          },
        }),
      });

      if (response.ok) {
        toast.success(t("drive.toastMovedToRoot", { name: draggedNode.name }));
        queryClient.invalidateQueries({
          queryKey: qk.drive.folderContents(currentFolderId, user?.id),
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
  };

  const getDragHandlers = (node: ExamNode) => ({
    draggable: !isMoving,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, node),
    onDragEnd: handleDragEnd,
    onDragOver: (e: React.DragEvent) => handleDragOver(e, node),
    onDragLeave: handleDragLeave,
    onDrop: (e: React.DragEvent) => handleDrop(e, node),
  });

  // Folder card: the card itself IS the folder shape (tab + fold + body)
  const renderFolderCard = useCallback(
    (node: ExamNode) => {
      const dragHandlers = getDragHandlers(node);
      const isDragSource = draggedNode?.id === node.id;
      const isDragTarget = dragOverNodeId === node.id;
      const hasFiles = (node.child_count ?? 0) > 0;
      const colorDef = FOLDER_COLORS.find((c) => c.value === node.color) || FOLDER_COLORS[0];

      return (
        <div
          key={node.id}
          {...dragHandlers}
          className={cn(
            "folder-card cursor-grab transition-all duration-200 group",
            isDragSource && "opacity-50 scale-95 cursor-grabbing",
            isDragTarget && "ring-2 ring-primary ring-offset-2",
            isMoving && "pointer-events-none opacity-60"
          )}
          onClick={() => {
            if (isMoving) return;
            handleNodeClick(node);
          }}
        >
          <div
            className="folder-card__back"
            aria-hidden
            style={{ "--folder-bg": colorDef.back, "--folder-bg-dark": colorDef.darkBack } as React.CSSProperties}
          />
          {hasFiles && <div className="folder-card__paper" aria-hidden />}
          <div
            className="folder-card__body relative"
            style={{ "--folder-body": colorDef.body || undefined, "--folder-body-dark": colorDef.darkBody || undefined } as React.CSSProperties}
          >
            <div
              className="absolute right-1 top-1 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {renderNodeActions(node)}
            </div>
            {/* Folder name — centered where meta rows used to be */}
            <div className="flex flex-col items-center justify-center gap-2 h-full">
              <Folder className="w-6 h-6 text-primary/70 shrink-0" strokeWidth={1.5} />
              <p className="font-semibold text-foreground truncate text-sm w-full text-center px-2">
                {node.name}
              </p>
              {/*
                이름만으로는 구분이 안 된다. 실제 계정에 "새 폴더" 가 10개 있었다.
                child_count 는 서버가 이미 세어 보낸다(drive-handlers.ts:194).
              */}
              <p className="type-hint text-center">
                {(node.child_count ?? 0) > 0
                  ? t("drive.folderItems", { count: node.child_count ?? 0 })
                  : t("drive.folderEmpty")}
              </p>
            </div>
          </div>
        </div>
      );
    },
    [
      t,
      formatDate,
      handleNodeClick,
      renderNodeActions,
      getDragHandlers,
      draggedNode,
      dragOverNodeId,
      isMoving,
    ]
  );

  const renderGridNode = useCallback(
    (node: ExamNode) => {
      const isFolder = node.kind === "folder";
      const dragHandlers = getDragHandlers(node);
      const isDragSource = draggedNode?.id === node.id;
      const isDragTarget = dragOverNodeId === node.id && node.kind === "folder";

      return (
        <div
          key={node.id}
          {...dragHandlers}
          className={cn(
            "relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 group",
            isDragSource ? "opacity-50 scale-95 cursor-grabbing" : "cursor-grab",
            isDragTarget && "ring-2 ring-primary ring-offset-2",
            isMoving && "pointer-events-none opacity-60",
            node.kind === "exam" && draggedNode
              ? "cursor-not-allowed"
              : "hover:shadow-md"
          )}
          onClick={() => {
            if (isMoving) return;
            handleNodeClick(node);
          }}
          onMouseEnter={() => handleExamNodeHover(node)}
        >
          {/* Icon area */}
          <div className="relative flex items-center justify-center py-10 px-6">
            {isFolder ? (
              <Folder className="h-14 w-14 text-muted-foreground/60" strokeWidth={1.5} />
            ) : (
              <FileText className="h-14 w-14 text-muted-foreground/60" strokeWidth={1.5} />
            )}
            {/* Type badge for exams/assignments */}
            {!isFolder && node.exams?.type && node.exams.type !== "exam" && (
              <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                {t("drive.assignmentBadge")}
              </span>
            )}
            {/* Three-dot menu */}
            <div
              className="absolute right-2 top-2"
              onClick={(e) => e.stopPropagation()}
            >
              {renderNodeActions(node)}
            </div>
          </div>
          {/* Info area */}
          <div className="flex flex-col gap-1.5 border-t bg-muted/40 px-4 py-3">
            <h3 className="text-sm font-medium text-foreground truncate">
              {node.name}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isFolder ? (
                <>
                  {/*
                    폴더 이름만으로는 구분이 안 된다. 실제 계정에 "새 폴더" 가 10개
                    있었다. 안에 몇 개가 들었는지가 유일하게 남는 단서다.
                    child_count 는 서버가 이미 세어 보내는데 화면이 안 썼다.
                  */}
                  <span>
                    {(node.child_count ?? 0) > 0
                      ? t("drive.folderItems", { count: node.child_count ?? 0 })
                      : t("drive.folderEmpty")}
                  </span>
                  <span aria-hidden="true">,</span>
                  <span>{formatDate(node.updated_at)}</span>
                </>
              ) : (
                <>
                  {node.exams?.code && (
                    <span className="exam-code font-mono">{node.exams.code}</span>
                  )}
                  {node.exams?.type && node.exams.type !== "exam" && node.exams?.deadline ? (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t("drive.deadline", { date: formatDate(node.exams.deadline) })}
                    </span>
                  ) : (
                    <span>{formatDate(node.created_at)}</span>
                  )}
                </>
              )}
            </div>
            {!isFolder && (
              <div className="flex items-center justify-between mt-0.5">
                <div>{renderNodeStatus(node)}</div>
                {renderStudentCount(node)}
              </div>
            )}
          </div>
        </div>
      );
    },
    [
      formatDate,
      handleNodeClick,
      handleExamNodeHover,
      renderNodeActions,
      renderNodeStatus,
      renderStudentCount,
      getDragHandlers,
      draggedNode,
      dragOverNodeId,
      isMoving,
    ]
  );

  // 재귀적으로 폴더 트리를 렌더링하는 컴포넌트 (리스트뷰용)
  const FolderTreeItem = memo(
    ({
      folder,
      userId,
      onFolderClick,
      onFileClick,
      level = 0,
    }: {
      folder: ExamNode;
      userId?: string;
      onFolderClick: (folderId: string) => void;
      onFileClick: (examId: string) => void;
      level?: number;
    }) => {
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
          return [...(data.folders || []), ...(data.exams || [])];
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 1,
      });

      const folders = useMemo(
        () => children.filter((node: ExamNode) => node.kind === "folder"),
        [children]
      );
      const files = useMemo(
        () => children.filter((node: ExamNode) => node.kind === "exam"),
        [children]
      );

      return (
        <FolderItem value={folder.id}>
          <FolderHeader>
            <FolderTrigger className="w-full text-start">
              <FolderHighlight>
                <FilesFolder
                  className="flex items-center gap-2 p-2 pointer-events-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFolderClick(folder.id);
                  }}
                >
                  <FolderIcon
                    closeIcon={<Folder className="size-4" />}
                    openIcon={<FolderOpen className="size-4" />}
                  />
                  <FolderLabel className="text-sm">{folder.name}</FolderLabel>
                </FilesFolder>
              </FolderHighlight>
            </FolderTrigger>
          </FolderHeader>
          <div className="relative ml-8 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-[1px] before:bg-border/50">
            <FolderContent className="pl-2">
              {isLoading ? (
                <div className="py-1 text-xs text-muted-foreground">
                  {t("sidebar.folderLoading")}
                </div>
              ) : isError ? (
                /* 오류일 때 빈 트리를 조용히 그리면 자료가 없는 것처럼 보인다. (#241) */
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="flex w-full items-center gap-1.5 py-1 text-xs text-destructive"
                >
                  <AlertCircle className="size-3.5" />
                  <span>{t("fileTree.loadError")}</span>
                  <span className="ml-auto underline">{t("sidebar.folderRetry")}</span>
                </button>
              ) : (
                <>
                  {level === 0
                    ? // 최상위 레벨: 파일들을 모두 표시
                      files.map((file: ExamNode) => (
                        <FileHighlight key={file.id}>
                          <FilesFile
                            className="flex items-center gap-2 p-2 pointer-events-none cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (file.exam_id) {
                                onFileClick(file.exam_id);
                              }
                            }}
                          >
                            <FileIcon>
                              <FileText className="size-4" />
                            </FileIcon>
                            <FileLabel className="text-sm">
                              {file.name}
                            </FileLabel>
                          </FilesFile>
                        </FileHighlight>
                      ))
                    : // 하위 레벨 (level >= 1): 파일이 있으면 "..." 표시
                      files.length > 0 && (
                        <FileHighlight>
                          <FilesFile className="flex items-center gap-2 p-2 pointer-events-none">
                            <FileIcon>
                              <FileText className="size-4 opacity-50" />
                            </FileIcon>
                            <FileLabel className="type-meta">
                              ...
                            </FileLabel>
                          </FilesFile>
                        </FileHighlight>
                      )}
                  {folders.length > 0 && (
                    <Files>
                      {folders.map((childFolder: ExamNode) => (
                        <FolderTreeItem
                          key={childFolder.id}
                          folder={childFolder}
                          userId={userId}
                          onFolderClick={onFolderClick}
                          onFileClick={onFileClick}
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
  );

  FolderTreeItem.displayName = "FolderTreeItem";

  // 폴더 하위 내용을 가져오는 컴포넌트 (리스트뷰용)
  const FolderChildren = memo(
    ({
      folderId,
      userId,
      onFolderClick,
      onFileClick,
    }: {
      folderId: string;
      userId?: string;
      onFolderClick: (folderId: string) => void;
      onFileClick: (examId: string) => void;
    }) => {
      const {
        data: children = [],
        isLoading,
        isError,
        refetch,
      } = useQuery({
        queryKey: qk.drive.folderContents(folderId, userId),
        queryFn: async ({ signal }) => {
          const response = await fetch("/api/supa", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "get_folder_contents",
              data: { folder_id: folderId },
            }),
            signal,
          });

          if (!response.ok) {
            throw new Error("Failed to load folder contents");
          }

          const data = await response.json();
          return [...(data.folders || []), ...(data.exams || [])];
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 1,
      });

      if (isLoading) {
        return (
          <div className="pl-12 py-2 text-xs text-muted-foreground">
            {t("sidebar.folderLoading")}
          </div>
        );
      }

      // 오류를 빈 상태로 보여주면 안 된다. (#241)
      if (isError) {
        return (
          <button
            type="button"
            onClick={() => refetch()}
            className="flex w-full items-center gap-1.5 pl-12 py-2 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5" />
            <span>{t("fileTree.loadError")}</span>
            <span className="ml-auto underline">{t("sidebar.folderRetry")}</span>
          </button>
        );
      }

      if (children.length === 0) {
        return (
          <div className="pl-12 py-2 text-xs text-muted-foreground">
            {t("fileTree.noFolders")}
          </div>
        );
      }

      const folders = children.filter(
        (node: ExamNode) => node.kind === "folder"
      );
      const files = children.filter((node: ExamNode) => node.kind === "exam");

      return (
        <div className="relative ml-8 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-[1px] before:bg-border/50">
          <FilesHighlight className="bg-accent pointer-events-none">
            <Files className="pl-2">
              {files.map((file: ExamNode) => (
                <FileHighlight key={file.id}>
                  <FilesFile
                    className="flex items-center gap-2 p-2 pointer-events-none cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (file.exam_id) {
                        onFileClick(file.exam_id);
                      }
                    }}
                  >
                    <FileIcon>
                      <FileText className="size-4" />
                    </FileIcon>
                    <FileLabel className="text-sm">{file.name}</FileLabel>
                  </FilesFile>
                </FileHighlight>
              ))}
              {folders.map((folder: ExamNode) => (
                <FolderTreeItem
                  key={folder.id}
                  folder={folder}
                  userId={userId}
                  onFolderClick={onFolderClick}
                  onFileClick={onFileClick}
                  level={0}
                />
              ))}
            </Files>
          </FilesHighlight>
        </div>
      );
    }
  );

  FolderChildren.displayName = "FolderChildren";

  const renderListNode = useCallback(
    (node: ExamNode) => {
      const statusBadge = renderNodeStatus(node);
      const dragHandlers = getDragHandlers(node);
      const isDragSource = draggedNode?.id === node.id;
      const isDragTarget = dragOverNodeId === node.id && node.kind === "folder";
      const isExpanded = expandedFolders.has(node.id);

      if (node.kind === "folder") {
        return (
          <Collapsible
            key={node.id}
            open={isExpanded}
            onOpenChange={(open) => {
              const newExpanded = new Set(expandedFolders);
              if (open) {
                newExpanded.add(node.id);
              } else {
                newExpanded.delete(node.id);
              }
              setExpandedFolders(newExpanded);
            }}
          >
            <div
              {...dragHandlers}
              className={`group flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3 transition ${
                isDragSource ? "opacity-50 cursor-grabbing" : "cursor-grab"
              } ${isDragTarget ? "ring-2 ring-primary bg-primary/5" : ""} ${
                isMoving ? "pointer-events-none opacity-60" : ""
              } hover:shadow-sm`}
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-4 flex-1 cursor-pointer">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background/80">
                    <Folder className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-foreground truncate">
                      {node.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(node.updated_at)}</span>
                      <span>{t("drive.folderLabel")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                    {renderNodeActions(node)}
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {isExpanded && (
                  <FolderChildren
                    folderId={node.id}
                    userId={user?.id}
                    onFolderClick={setCurrentFolderId}
                    onFileClick={(examId) =>
                      router.push(`/instructor/${examId}`)
                    }
                  />
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      }

      return (
        <div
          key={node.id}
          {...dragHandlers}
          className={`group flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3 transition ${
            isDragSource ? "opacity-50 cursor-grabbing" : "cursor-grab"
          } ${isDragTarget ? "ring-2 ring-primary bg-primary/5" : ""} ${
            isMoving ? "pointer-events-none opacity-60" : ""
          } hover:shadow-sm`}
          onClick={() => {
            if (isMoving) return;
            handleNodeClick(node);
          }}
          onMouseEnter={() => handleExamNodeHover(node)}
        >
          <div className="flex items-center gap-4 flex-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background/80">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm text-foreground truncate">
                  {node.name}
                </p>
                {node.exams?.type && node.exams.type !== "exam" && (
                  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground shrink-0">
                    {t("drive.assignmentBadge")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {node.exams?.code && <span>{node.exams.code}</span>}
                {node.exams?.type && node.exams.type !== "exam" && node.exams?.deadline ? (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {t("drive.deadline", { date: formatDate(node.exams.deadline) })}
                  </span>
                ) : (
                  <span>{t("drive.created", { date: formatDate(node.created_at) })}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {statusBadge && (
              <span className="hidden sm:inline-flex">{statusBadge}</span>
            )}
            {renderStudentCount(node)}
            {renderNodeActions(node)}
          </div>
        </div>
      );
    },
    [
      formatDate,
      handleNodeClick,
      handleExamNodeHover,
      renderNodeActions,
      renderNodeStatus,
      renderStudentCount,
      getDragHandlers,
      draggedNode,
      dragOverNodeId,
      isMoving,
      expandedFolders,
      router,
      user?.id,
    ]
  );

  return (
    <>
    <div className="w-full max-w-7xl mx-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
                  {/* Simple greeting */}
                  <p className="text-lg font-medium text-foreground">
                    {t("home.greeting", { name: profile?.fullName || "강사" })}
                  </p>

                  {/*
                    착지 후 다음 걸음. 온보딩을 막 끝낸 사람에게 화면이 다음 할 일을
                    말해주지 않으면 만든 데모가 어디 있는지도 모른 채 멈춘다. (#212)
                  */}
                  {demoExamId ? (
                    <div className="rounded-lg border border-info-border bg-info-surface p-4">
                      <p className="type-field-label text-info-text">{t("home.nextStepTitle")}</p>
                      <p className="type-hint mt-1">
                        {isDemoCompleted
                          ? t("home.nextStepAfterDemo")
                          : t("home.nextStepDemo")}
                      </p>
                      <Link href={isDemoCompleted ? "/instructor/new" : `/instructor/${demoExamId}`}>
                        <Button variant="outline" size="sm" className="mt-3">
                          {isDemoCompleted
                            ? t("home.nextStepAfterDemoCta")
                            : t("home.nextStepDemoCta")}
                        </Button>
                      </Link>
                    </div>
                  ) : null}

                  {/* 시험 관리 */}
                  <section className="space-y-4 min-w-0 overflow-x-hidden">
                    {/* Toolbar: new + search + view toggle — single row */}
                    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          {/*
                            주 행동은 하나여야 한다. 빈 화면에서는 아래 "시험 만들기"
                            CTA 가 다음 할 일이고, 이 드롭다운은 상시 보이는 보조
                            진입점이다. 둘 다 강조하면 눈이 갈라진다. (#212)
                          */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 shrink-0"
                          >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">{t("drive.newItem")}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          <DropdownMenuItem
                            onSelect={() => {
                              void handleCreateFolder();
                            }}
                          >
                            <FolderPlus className="w-4 h-4 mr-2" />{t("drive.newFolder")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => router.push("/instructor/new")}
                          >
                            <FileText className="w-4 h-4 mr-2" />{t("drive.newExam")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => router.push("/instructor/assignment/new")}
                          >
                            <FileText className="w-4 h-4 mr-2" />{t("drive.newAssignment")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <div className="relative order-3 min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t("drive.searchPlaceholder")}
                          className="pl-9 h-9"
                        />
                      </div>

                      <div className="flex items-center gap-0.5 border rounded-lg p-1 shrink-0">
                        <button
                          type="button"
                          className={getViewButtonClasses("grid")}
                          onClick={() => setViewMode("grid")}
                          aria-pressed={viewMode === "grid"}
                          aria-label={t("drive.gridView")}
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className={getViewButtonClasses("list")}
                          onClick={() => setViewMode("list")}
                          aria-pressed={viewMode === "list"}
                          aria-label={t("drive.listView")}
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                      {/* 브레드크럼 */}
                      {(currentFolderId || breadcrumb.length > 0) && (
                        <div className="flex items-center space-x-2 text-sm">
                          <button
                            onClick={() => handleBreadcrumbClick(null)}
                            className="flex items-center text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2"
                          >
                            <Home className="w-4 h-4 mr-1" />
                            {t("drive.rootBreadcrumb")}
                          </button>
                          {breadcrumb.map(
                            (item: { id: string; name: string }) => (
                              <div
                                key={item.id}
                                className="flex items-center space-x-2"
                              >
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                <button
                                  onClick={() => handleBreadcrumbClick(item.id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2"
                                >
                                  {item.name}
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* 콘텐츠: 폴더 행 + 시험 영역 */}
                      {isLoading ? (
                        <>
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("drive.sectionFolders")}
                            </p>
                            <div className="overflow-x-auto pb-2">
                              <div className="flex gap-4 min-w-max">
                                {[...Array(4)].map((_, i) => (
                                  <div key={i} className="folder-card opacity-70">
                                    <div className="folder-card__back" />
                                    <div className="folder-card__body">
                                      <div className="flex items-center gap-2">
                                        <Skeleton className="h-4 w-4 rounded" />
                                        <Skeleton className="h-4 w-20" />
                                      </div>
                                      <div className="space-y-2 mt-auto">
                                        <Skeleton className="h-3 w-full" />
                                        <Skeleton className="h-3 w-full" />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("drive.sectionExams")}
                            </p>
                            {viewMode === "grid" ? (
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {[...Array(4)].map((_, i) => (
                                  <GridCardSkeleton key={i} />
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-2" aria-busy="true" aria-live="polite">
                                {[...Array(4)].map((_, i) => (
                                  <ListItemSkeleton key={i} />
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      ) : isExamListError && !hasResults ? (
                        /*
                          오류는 "보여줄 게 없을 때" 만 낸다. React Query 는 재조회가
                          실패해도 이전 data 를 들고 있으므로, hasResults 가 true 면
                          가진 목록을 계속 보여주는 편이 낫다 - 있는 데이터를 오류로
                          덮으면 사용자는 더 잃는다.

                          반대로 가진 게 없는데 실패하면 "아직 시험이나 폴더가
                          없습니다" 가 떠서 출제한 시험이 사라진 것처럼 읽힌다. (#241)
                        */
                        <ErrorAlert
                          message={t("drive.loadError")}
                          onRetry={() => refetchExamList()}
                        />
                      ) : !hasResults ? (
                        <div className="text-center py-16 border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-card/40">
                          <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground mb-2">
                            {isFiltering
                              ? t("drive.noResults")
                              : demoExamId
                                ? t("home.demoOnlyEmpty")
                                : t("drive.empty")}
                          </p>
                          <p className="text-sm text-muted-foreground mb-6">
                            {isFiltering
                              ? t("drive.noResultsHint")
                              : demoExamId
                                ? t("home.demoOnlyEmptyHint")
                                : t("drive.emptyHint")}
                          </p>
                          {!isFiltering && (
                            <div className="flex items-center justify-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-[44px]"
                                onClick={() => {
                                  void handleCreateFolder();
                                }}
                                disabled={isCreatingFolder}
                              >
                                {isCreatingFolder ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <FolderPlus className="w-4 h-4 mr-2" />
                                )}
                                {t("drive.newFolder")}
                              </Button>
                              <Link href="/instructor/new">
                                <Button size="sm" className="min-h-[44px]">
                                  <Plus className="w-4 h-4 mr-2" />
                                  {t("drive.makeExam")}
                                </Button>
                              </Link>
                              <Link href="/instructor/assignment/new">
                                <Button size="sm" variant="outline" className="min-h-[44px]">
                                  <Plus className="w-4 h-4 mr-2" />
                                  {t("drive.makeAssignment")}
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="space-y-10"
                          onDragOver={handleRootDragOver}
                          onDrop={handleRootDrop}
                        >
                          {/* 폴더: 가로 스크롤 카드 행 */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t("drive.sectionFolders")}
                              </p>
                              <span className="type-meta">
                                {t("drive.folderCount", { count: folderNodes.length })}
                              </span>
                            </div>
                            <div className="relative w-full max-w-full min-w-0 overflow-x-hidden group/folder-carousel">
                              <button
                                type="button"
                                onClick={() => handleFolderRowSlide("left")}
                                disabled={!canScrollFoldersLeft}
                                className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border/80 bg-background/95 p-2 text-foreground shadow-sm backdrop-blur transition hover:bg-accent opacity-0 pointer-events-none group-hover/folder-carousel:opacity-100 group-hover/folder-carousel:pointer-events-auto disabled:opacity-40 disabled:pointer-events-none"
                                aria-label={t("drive.prevFolders")}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFolderRowSlide("right")}
                                disabled={!canScrollFoldersRight}
                                className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border/80 bg-background/95 p-2 text-foreground shadow-sm backdrop-blur transition hover:bg-accent opacity-0 pointer-events-none group-hover/folder-carousel:opacity-100 group-hover/folder-carousel:pointer-events-auto disabled:opacity-40 disabled:pointer-events-none"
                                aria-label={t("drive.nextFolders")}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                              <div
                                ref={folderScrollRef}
                                className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain pb-2 pl-12 pr-12 scrollbar-thin"
                              >
                                <div className="inline-flex min-w-max gap-4 pr-2">
                                  {folderNodes.map((node) => renderFolderCard(node))}
                                  {renderCreateFolderCard()}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 시험/과제: 그리드/리스트 선택 */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t("drive.sectionExamsAssignments")}
                              </p>
                              <span className="type-meta">
                                {t("drive.examCount", { count: filteredExamNodes.length })}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {EXAM_FILTER_OPTION_VALUES.map((value) => {
                                const filterLabelKey: Record<ExamFilterType, string> = {
                                  all: "drive.filterAll",
                                  exam: "drive.filterExam",
                                  assignment: "drive.filterAssignment",
                                  deadline: "drive.filterDeadline",
                                  "in-progress": "drive.filterInProgress",
                                };
                                return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setExamFilter(value)}
                                  className={cn(
                                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                    examFilter === value
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                                  )}
                                  aria-pressed={examFilter === value}
                                >
                                  {t(filterLabelKey[value])}
                                </button>
                                );
                              })}
                            </div>
                            {filteredExamNodes.length > 0 ? (
                              viewMode === "grid" ? (
                                <>
                                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {filteredExamNodes.map((node) => renderGridNode(node))}
                                  </div>
                                  <div ref={sentinelRef} />
                                  {isFetchingNextPage && (
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                      {[...Array(4)].map((_, i) => (
                                        <GridCardSkeleton key={i} />
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="space-y-2">
                                    {filteredExamNodes.map((node) => renderListNode(node))}
                                  </div>
                                  <div ref={sentinelRef} />
                                  {isFetchingNextPage && (
                                    <div className="space-y-2" aria-busy="true" aria-live="polite">
                                      {[...Array(4)].map((_, i) => (
                                        <ListItemSkeleton key={i} />
                                      ))}
                                    </div>
                                  )}
                                </>
                              )
                            ) : (
                              <>
                                <div ref={sentinelRef} />
                                <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-card/40 py-6 text-center text-sm text-muted-foreground">
                                  {isFiltering || isExamFilterActive
                                    ? t("drive.noExamsFiltered")
                                    : t("drive.noExams")}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                  </section>
                </div>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setDeleteDialogOpen(open);
            if (!open) setDeleteConfirmInput("");
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              {nodeToDelete?.kind === "exam" ? t("drive.deleteExamTitle") : t("drive.deleteFolderTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("drive.deleteConfirmIrreversible")}{" "}
              {nodeToDelete?.kind === "exam" ? (
                <>
                  {t("drive.deleteConfirmExam", { name: nodeToDelete.name })}
                </>
              ) : (
                <>
                  {t("drive.deleteConfirmFolder", { name: nodeToDelete?.name ?? "" })}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {nodeToDelete?.kind === "exam" && (
            <div className="py-2">
              <Input
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder={nodeToDelete.name}
                disabled={isDeleting}
                autoFocus
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    deleteConfirmInput === nodeToDelete.name
                  ) {
                    handleDeleteNode(nodeToDelete);
                  }
                }}
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("drive.deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => nodeToDelete && handleDeleteNode(nodeToDelete)}
              disabled={
                isDeleting ||
                (nodeToDelete?.kind === "exam" &&
                  deleteConfirmInput !== nodeToDelete.name)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("drive.deleteDeleting")}
                </>
              ) : (
                t("drive.deleteConfirmButton")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* 편집 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("drive.editDialogTitle")}</DialogTitle>
            <DialogDescription>
              {nodeToEdit?.kind === "folder"
                ? t("drive.editFolderDesc")
                : t("drive.editNameDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                {nodeToEdit?.kind === "folder" ? t("drive.editFolderLabel") : t("drive.editNameLabel")}
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={
                  nodeToEdit?.kind === "folder"
                    ? t("drive.editFolderPlaceholder")
                    : t("drive.editNamePlaceholder")
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUpdateNode();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setNodeToEdit(null);
                setEditName("");
              }}
            >
              {t("drive.editCancel")}
            </Button>
            <Button
              onClick={handleUpdateNode}
              disabled={isUpdating || !editName.trim()}
            >
              {isUpdating ? t("drive.editSaving") : t("drive.editSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
