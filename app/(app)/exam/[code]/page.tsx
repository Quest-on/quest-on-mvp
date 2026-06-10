"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { QuestionPanel } from "@/components/exam/QuestionPanel";
import { AnswerPanel } from "@/components/exam/AnswerPanel";
import { ObjectiveAnswerPanel } from "@/components/exam/ObjectiveAnswerPanel";
import { isObjectiveQuestion } from "@/lib/grading-helpers";
import { SubmitConfirmDialog } from "@/components/exam/SubmitConfirmDialog";
import { ExamChatSidebar } from "@/components/exam/ExamChatSidebar";
import { MainContentWrapper } from "@/components/exam/MainContentWrapper";
import { ExamDialogs } from "@/components/exam/ExamDialogs";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useExamChat } from "@/hooks/useExamChat";
import { useExamSession } from "@/hooks/useExamSession";
import { useExamGuards } from "@/hooks/useExamGuards";
import { useExamSubmission } from "@/hooks/useExamSubmission";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { CheckCircle2, WifiOff, AlertCircle } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { ExamHeader } from "@/components/ExamHeader";
import { ExamQuestionNav } from "@/components/exam/ExamQuestionNav";
import { ExamCenterToolbar } from "@/components/exam/ExamCenterToolbar";
import { SubmissionOverlay } from "@/components/exam/ExamLoading";
import { PreflightModal } from "@/components/exam/PreflightModal";
import { WaitingRoom } from "@/components/exam/WaitingRoom";
import { LateEntryWaiting } from "@/components/exam/LateEntryWaiting";
import { ObjectiveNavBar } from "@/components/exam/ObjectiveNavBar";
import { seededOptionOrder, examQuestionDisplayOrder } from "@/lib/shuffle";
import { useObjectiveKeyboardSelect } from "@/hooks/useObjectiveKeyboardSelect";

interface Question {
  id: string;
  text: string;
  type: string;
  points?: number;
  options?: string[];
  correctOptionIndex?: number;
  title?: string;
  ai_context?: string;
}

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: Question[];
  status: string;
  startTime?: string;
  endTime?: string;
  allow_draft_in_waiting?: boolean;
  allow_chat_in_waiting?: boolean;
}

function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  return html.replace(/<[^>]*>/g, "").trim().length === 0;
}

function hasQuestionAnswer(text: string, questionType?: string): boolean {
  if (isObjectiveQuestion(questionType)) {
    if (!text) return false;
    const parsed = Number.parseInt(text, 10);
    return Number.isInteger(parsed) && parsed >= 0;
  }
  return !isHtmlEmpty(text);
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, profile, isLoaded } = useAppUser();
  const examCode = params.code as string;

  // --- Shared state owned by the page (used by multiple hooks) ---
  const [exam, setExam] = useState<Exam | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // UI state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [hasOpenedQuestion, setHasOpenedQuestion] = useState(true);
  const [isQuestionVisible, setIsQuestionVisible] = useState(true);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const setCurrentQuestionWithReveal = useCallback((value: SetStateAction<number>) => {
    setCurrentQuestion(value);
    setIsQuestionVisible(true);
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  // --- Hooks (called unconditionally, same order every render) ---

  // 1. Auto-save — uses page-owned sessionId
  const autoSave = useAutoSave({
    sessionId,
    examExists: !!exam,
    intervalMs: 30000,
    localStorageKey: `exam_answers_${examCode}`,
  });

  // 2. Chat — uses page-owned exam & sessionId
  const examChat = useExamChat({
    exam,
    userId: user?.id,
    sessionId,
    currentQuestion,
    scrollToBottom,
  });

  // 3. Session lifecycle — receives setters for page-owned state
  const session = useExamSession({
    examCode,
    examId: exam?.id ?? null,
    user,
    isLoaded,
    setExam,
    setSessionId,
    setDraftAnswers: autoSave.setDraftAnswers,
    setChatHistory: examChat.setChatHistory,
    saveViaBeacon: autoSave.saveViaBeacon,
  });

  // 4. Submission
  const submission = useExamSubmission({
    exam,
    examCode,
    sessionId,
    userId: user?.id,
    currentQuestion,
    draftAnswers: autoSave.draftAnswers,
    chatHistory: examChat.chatHistory,
    manualSave: autoSave.manualSave,
    setIsSubmitted: session.setIsSubmitted,
  });

  // 5. Browser guards
  useExamGuards({
    sessionId,
    exam,
    isSubmitted: session.isSubmitted,
    draftAnswers: autoSave.draftAnswers,
    user,
    examCode,
    currentQuestion,
    isOnline: autoSave.isOnline,
    setShowExitConfirm,
  });

  // --- Derived values ---
  const isMac =
    typeof window !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const saveShortcut = isMac ? (
    <>
      <Kbd>⌘</Kbd>+<Kbd>S</Kbd>
    </>
  ) : (
    <>
      <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd>
    </>
  );

  const filteredChatHistory = examChat.chatHistory.filter(
    (msg) => msg.qIdx === currentQuestion
  );

  // 객관식/OX 문제는 구조화된 선택만 받고 AI 튜터 채팅을 노출하지 않는다 (제품 결정 #2).
  const currentQuestionType = exam?.questions?.[currentQuestion]?.type;
  const isCurrentObjective = isObjectiveQuestion(currentQuestionType);

  // 시험 단위로 한 번만 계산 — sidebar-width 게이팅, Preflight/Waiting 프롭 전달(추후)에 사용.
  const examHasEssay = useMemo(
    () => exam?.questions?.some((q) => !isObjectiveQuestion(q.type)) ?? false,
    [exam]
  );

  // 문제 표시 순서(표시위치 → 원본 q_idx). MCQ/OX만 sessionId로 셔플, CASE는 맨 뒤.
  // currentQuestion 상태는 항상 원본 인덱스를 유지하며, 이 매핑은 순수 표시용이다.
  const questionDisplayOrder = useMemo(
    () => (exam && sessionId ? examQuestionDisplayOrder(sessionId, exam.questions) : null),
    [exam, sessionId],
  );
  const totalQuestions = exam?.questions.length ?? 0;
  const displayPos = questionDisplayOrder
    ? questionDisplayOrder.indexOf(currentQuestion)
    : currentQuestion;

  // CASE(비객관식)는 표시순서 맨 뒤에 연속 배치된다(lib/shuffle.ts). 첫 CASE의 표시위치.
  // CASE 블록 내에서만 '이전' 이동을 허용하기 위한 경계값(CASE 없으면 -1).
  const firstCasePos = useMemo(() => {
    if (!exam || !questionDisplayOrder) return -1;
    return questionDisplayOrder.findIndex(
      (origIdx) => !isObjectiveQuestion(exam.questions[origIdx].type),
    );
  }, [exam, questionDisplayOrder]);

  // 셔플된 표시 순서의 첫 문제로 1회만 진입한다(원본 0이 아닐 수 있음).
  const didInitDisplayStartRef = useRef(false);
  useEffect(() => {
    if (didInitDisplayStartRef.current) return;
    if (!questionDisplayOrder || questionDisplayOrder.length === 0) return;
    didInitDisplayStartRef.current = true;
    // 비동기 로드된 셔플 순서로 첫 문제를 1회 동기화(ref 가드로 cascading 없음).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentQuestion(questionDisplayOrder[0]);
  }, [questionDisplayOrder]);

  // 좌측 네비는 표시 순서로 나열하되, 각 항목 데이터는 원본 인덱스로 조회한다.
  const questionNavItems = useMemo(() => {
    if (!exam) return [];
    const order = questionDisplayOrder ?? exam.questions.map((_, i) => i);
    return order.map((orig) => {
      const q = exam.questions[orig];
      return {
        type: q.type,
        hasAnswer: hasQuestionAnswer(autoSave.draftAnswers[orig]?.text || "", q.type),
        hasChat:
          !isObjectiveQuestion(q.type) &&
          examChat.chatHistory.some((msg) => msg.qIdx === orig),
      };
    });
  }, [exam, questionDisplayOrder, autoSave.draftAnswers, examChat.chatHistory]);

  // 객관식 문제에서는 SidebarProvider 전역 Ctrl/Cmd+B 단축키가 보이지 않는 사이드바 상태를
  // 토글하지 못하도록 캡처 단계에서 차단한다.
  useEffect(() => {
    if (!isCurrentObjective) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "b" || event.key === "B")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [isCurrentObjective]);

  // 객관식 선택지 표시 순서 — sessionId + 문제 id 로 시드한 결정론적 순열.
  // 저장 값은 항상 원본 인덱스이며, 이 순서는 순수 표시용이다.
  // 메모 키는 sessionId / 문제 id / 선택지 "개수"로만 잡는다.
  // options 배열은 매 렌더 새 참조라 의존성으로 쓰면 안 된다.
  const currentQuestionId = exam?.questions?.[currentQuestion]?.id;
  const currentOptionCount =
    exam?.questions?.[currentQuestion]?.options?.length ?? 0;
  const objectiveDisplayOrder = useMemo(() => {
    // sessionId 가 아직 없으면 undefined → 패널이 원본 순서로 폴백.
    // multiple-choice 만 섞는다 (true-false 는 패널에서 항등 처리).
    if (
      !sessionId ||
      !currentQuestionId ||
      currentQuestionType !== "multiple-choice" ||
      currentOptionCount < 2
    ) {
      return undefined;
    }
    return seededOptionOrder(sessionId + currentQuestionId, currentOptionCount);
  }, [sessionId, currentQuestionId, currentQuestionType, currentOptionCount]);

  // 객관식/OX 문제에서 숫자 키(1~N)로 선택지를 선택할 수 있도록 키보드 리스너를 등록한다.
  useObjectiveKeyboardSelect({
    enabled: isCurrentObjective && !!currentQuestionId,
    type: currentQuestionType,
    optionCount: currentOptionCount,
    displayOrder: objectiveDisplayOrder,
    onSelect: (value) => {
      if (currentQuestionId) autoSave.updateAnswer(currentQuestionId, value);
    },
    onNext: () => {
      // 단방향 + 선택 강제: 현재 객관식 답을 선택해야만 엔터로 다음(표시순서) 이동.
      if (!questionNavItems[displayPos]?.hasAnswer) return;
      if (questionDisplayOrder && displayPos < totalQuestions - 1) {
        setCurrentQuestionWithReveal(questionDisplayOrder[displayPos + 1]);
      }
    },
  });

  // --- Early returns ---

  if (!isLoaded || session.examLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-20 sm:w-20 border-4 border-primary border-t-transparent mx-auto"></div>
          <div className="space-y-2">
            <p className="text-lg sm:text-xl font-semibold text-foreground">
              {!isLoaded ? "사용자 인증 중..." : "시험을 불러오는 중..."}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground">잠시만 기다려주세요</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-destructive" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold">로그인이 필요합니다</CardTitle>
            <CardDescription className="text-sm sm:text-base">시험을 보려면 먼저 로그인해주세요.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(`/exam/${examCode}`)}`}
              onClick={() => { try { localStorage.setItem("onboarding_redirect", `/exam/${examCode}`); } catch {} }}
            >
              <Button size="lg" className="min-h-[48px] px-8">로그인하기</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-destructive" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold">시험을 찾을 수 없습니다</CardTitle>
            <CardDescription className="text-sm sm:text-base">시험 코드를 확인해주세요.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/join"><Button size="lg" className="min-h-[48px] px-8">다시 시도하기</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Preflight & Waiting Room ---

  const handlePreflightAccept = async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/session/${sessionId}/preflight`, { method: "POST" });
      if (response.ok) {
        const body = await response.json();
        session.setShowPreflight(false);

        if (body.status) {
          session.setSessionStatus(body.status);
        }

        if (body.sessionStartTime) {
          session.setSessionStartTime(body.sessionStartTime);
        }

        if (body.timeRemaining !== undefined) {
          session.setTimeRemaining(body.timeRemaining);
        }

        if (body.status === "in_progress") {
          session.setIsInWaitingRoom(false);
        } else {
          session.setIsInWaitingRoom(true);
        }
      } else {
        let errorData: Record<string, string> = {};
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          try { errorData = await response.json(); } catch {}
        } else {
          const text = await response.text().catch(() => "");
          errorData = { message: text || "알 수 없는 오류" };
        }
        toast.error(`시험 입장 확인에 실패했습니다: ${errorData.details || errorData.message || errorData.error || "알 수 없는 오류"}`);
      }
    } catch {
      toast.error("시험 입장 확인 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  const handleGateStart = (gateState: {
    sessionStatus?: string;
    sessionStartTime?: string | null;
    timeRemaining?: number | null;
  }) => {
    session.setIsInWaitingRoom(false);
    session.setIsLateEntry(false);

    if (gateState.sessionStatus) {
      session.setSessionStatus(gateState.sessionStatus);
    } else {
      session.setSessionStatus("in_progress");
    }

    if (gateState.sessionStartTime) {
      session.setSessionStartTime(gateState.sessionStartTime);
    }

    if (gateState.timeRemaining !== undefined) {
      session.setTimeRemaining(gateState.timeRemaining);
    }

    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: ["session-heartbeat", sessionId] });
    }
  };

  if (session.isSubmitted) {
    return <SubmittedScreen examCode={examCode} duration={exam.duration} profile={profile} router={router} />;
  }

  if (session.showPreflight) {
    return (
      <>
        <PreflightModal
          open={session.showPreflight && !submission.showPreflightCancelConfirm}
          onAccept={handlePreflightAccept}
          onCancel={() => submission.setShowPreflightCancelConfirm(true)}
          examTitle={exam.title}
          examDuration={exam.duration}
          examDescription={exam.description}
          examHasEssay={examHasEssay}
        />
        <AlertDialog open={submission.showPreflightCancelConfirm} onOpenChange={submission.setShowPreflightCancelConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>시험을 취소하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                시험 입장을 취소하면 학생 대시보드로 이동합니다. 나중에 다시 시험 코드를 입력하여 입장할 수 있습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>시험에 계속 참여하기</AlertDialogCancel>
              <AlertDialogAction onClick={() => router.push("/student")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                시험 입장 취소
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (session.isLateEntry || session.sessionStatus === "late_pending") {
    return (
      <LateEntryWaiting
        examTitle={exam.title}
        examCode={examCode}
        sessionId={sessionId || undefined}
        examId={exam.id}
        examDuration={exam.duration}
        questionCount={exam.questions?.length}
        onGateStart={handleGateStart}
      />
    );
  }

  if (session.isInWaitingRoom || session.sessionStatus === "waiting") {
    return (
      <WaitingRoom
        examTitle={exam.title}
        examCode={examCode}
        allowDraftInWaiting={exam.allow_draft_in_waiting || false}
        allowChatInWaiting={exam.allow_chat_in_waiting || false}
        onGateStart={handleGateStart}
        sessionId={sessionId || undefined}
        examId={exam.id}
        studentId={user.id}
        examHasEssay={examHasEssay}
        examDuration={exam.duration}
        questionCount={exam.questions?.length}
      />
    );
  }

  // --- Main exam UI ---

  return (
    <div className="flex h-screen w-full bg-background">
      <ExamQuestionNav
        questions={questionNavItems}
        currentQuestion={displayPos}
        onExit={() => setShowExitConfirm(true)}
      />

      <div className="flex flex-1 flex-col min-h-0 min-w-0 pb-[72px] md:pb-0">
        <SidebarProvider
          defaultOpen={true}
          className="flex flex-1 min-h-0 flex-row-reverse"
          style={
            {
              "--sidebar-width": examHasEssay ? "40vw" : "0px",
              "--sidebar-width-icon": "3rem",
            } as React.CSSProperties & { [key: string]: string }
          }
        >
      {!isCurrentObjective && (
        <ExamChatSidebar
          chatHistory={filteredChatHistory}
          chatMessage={examChat.chatMessage}
          setChatMessage={examChat.setChatMessage}
          sendChatMessage={examChat.sendChatMessage}
          isLoading={examChat.isLoading}
          isTyping={examChat.isTyping}
          sessionError={session.sessionError}
          setSessionError={session.setSessionError}
          chatEndRef={chatEndRef}
          currentQuestion={currentQuestion}
        />
      )}

      <SidebarInset className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <SubmissionOverlay isSubmitting={submission.isSubmitting} />
          {!autoSave.isOnline && (
            <div className="bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>네트워크 연결이 끊어졌습니다. 연결이 복원되면 답안이 자동 저장됩니다.</span>
            </div>
          )}

            <ExamCenterToolbar
              examTitle={exam.title}
              duration={exam.duration}
              sessionStartTime={session.sessionStartTime}
              timeRemaining={session.timeRemaining}
              onTimeExpired={async () => {
                if (!sessionId || !exam || session.isSubmitted) return;
                await submission.handleTimeExpired();
              }}
              onSubmit={submission.handleSubmitClick}
              isSubmitting={submission.isSubmitting}
              showQuestionToggle={!isCurrentObjective}
              isQuestionVisible={isQuestionVisible}
              onToggleQuestion={() => {
                setIsQuestionVisible(!isQuestionVisible);
                if (!hasOpenedQuestion) setHasOpenedQuestion(true);
              }}
            />

            <MainContentWrapper>
              <div className="flex h-full min-h-0 flex-col bg-background">

              {/* Question & Answer */}
              {isCurrentObjective ? (
                // 객관식/OX: 문제 + 선택지를 한 화면에 항상 동시 노출. Resizable / 접기 토글 / 채팅 없음.
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="shrink-0">
                      <QuestionPanel
                        question={exam.questions[currentQuestion]}
                        questionNumber={displayPos + 1}
                      />
                    </div>
                    <div className="shrink-0">
                      <ObjectiveAnswerPanel
                        type={exam.questions[currentQuestion].type}
                        options={exam.questions[currentQuestion].options}
                        displayOrder={objectiveDisplayOrder}
                        value={autoSave.draftAnswers[currentQuestion]?.text || ""}
                        onChange={(value) => autoSave.updateAnswer(exam.questions[currentQuestion].id, value)}
                        variant={
                          exam.questions[currentQuestion].type === "true-false"
                            ? "row-1x2"
                            : "list"
                        }
                      />
                    </div>
                  </div>
                  <ObjectiveNavBar
                    currentIndex={displayPos}
                    total={totalQuestions}
                    onNavigate={(nextPos) => {
                      if (questionDisplayOrder?.[nextPos] !== undefined)
                        setCurrentQuestionWithReveal(questionDisplayOrder[nextPos]);
                    }}
                    canNext={questionNavItems[displayPos]?.hasAnswer ?? false}
                    className="shrink-0"
                  />
                </div>
              ) : (
                // CASE/서술형: 단방향 진행을 위해 하단에 '다음' 바를 둔다(작성 무관 진행).
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col">
                    {isQuestionVisible ? (
                      <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
                        <ResizablePanel defaultSize={40} minSize={20} maxSize={70}>
                          <QuestionPanel question={exam.questions[currentQuestion]} questionNumber={displayPos + 1} />
                        </ResizablePanel>
                        <ResizableHandle withHandle />
                        <ResizablePanel defaultSize={60} minSize={30}>
                          <AnswerPanel
                            value={autoSave.draftAnswers[currentQuestion]?.text || ""}
                            onChange={(value) => autoSave.updateAnswer(exam.questions[currentQuestion].id, value)}
                            onPaste={submission.handlePaste}
                            isSaving={autoSave.isSaving}
                            lastSaved={autoSave.lastSaved}
                            saveError={autoSave.saveError}
                            saveShortcut={saveShortcut}
                          />
                        </ResizablePanel>
                      </ResizablePanelGroup>
                    ) : (
                      <AnswerPanel
                        value={autoSave.draftAnswers[currentQuestion]?.text || ""}
                        onChange={(value) => autoSave.updateAnswer(exam.questions[currentQuestion].id, value)}
                        onPaste={submission.handlePaste}
                        isSaving={autoSave.isSaving}
                        lastSaved={autoSave.lastSaved}
                        saveError={autoSave.saveError}
                        saveShortcut={saveShortcut}
                      />
                    )}
                  </div>
                  <ObjectiveNavBar
                    currentIndex={displayPos}
                    total={totalQuestions}
                    onNavigate={(nextPos) => {
                      if (questionDisplayOrder?.[nextPos] !== undefined)
                        setCurrentQuestionWithReveal(questionDisplayOrder[nextPos]);
                    }}
                    canNext
                    canPrev={firstCasePos >= 0 && displayPos > firstCasePos}
                    onPrev={() => {
                      const prevOrig = questionDisplayOrder?.[displayPos - 1];
                      if (prevOrig === undefined) return;
                      // 단방향 보호(이중 가드): CASE 블록 내에서만 뒤로 이동.
                      // 목적지가 객관식이면 절대 이동하지 않는다(객관식 누수 차단).
                      if (isObjectiveQuestion(exam.questions[prevOrig].type)) return;
                      setCurrentQuestionWithReveal(prevOrig);
                    }}
                    className="shrink-0"
                  />
                </div>
              )}
            </div>
          </MainContentWrapper>

            <SubmitConfirmDialog
              open={submission.showSubmitConfirm}
              onOpenChange={submission.setShowSubmitConfirm}
              onConfirm={submission.handleSubmit}
            />
      </SidebarInset>

      <ExamDialogs
        showExitConfirm={showExitConfirm}
        setShowExitConfirm={setShowExitConfirm}
        onExitConfirm={async () => { await autoSave.manualSave(); router.push("/student"); }}
        unansweredDialog={submission.unansweredDialog}
        setUnansweredDialog={submission.setUnansweredDialog}
        setCurrentQuestion={setCurrentQuestionWithReveal}
        displayOrder={questionDisplayOrder ?? undefined}
        setShowSubmitConfirm={submission.setShowSubmitConfirm}
        autoSubmitFailed={submission.autoSubmitFailed}
        setAutoSubmitFailed={submission.setAutoSubmitFailed}
        onAutoSubmitRetry={() => { submission.setAutoSubmitFailed(false); submission.handleSubmit(); }}
        onAutoSubmitExit={async () => { await autoSave.manualSave(); router.push("/student"); }}
        manualSubmitFailed={submission.manualSubmitFailed}
        setManualSubmitFailed={submission.setManualSubmitFailed}
        onManualSubmitRetry={() => { submission.setManualSubmitFailed(false); submission.handleSubmit(); }}
        submitErrorMessage={submission.submitErrorMessage}
      />
        </SidebarProvider>
      </div>
    </div>
  );
}

function SubmittedScreen({
  examCode,
  duration,
  profile,
  router,
}: {
  examCode: string;
  duration: number;
  profile: { avatarUrl?: string | null; fullName?: string | null; email?: string | null } | null;
  router: ReturnType<typeof useRouter>;
}) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown <= 0) {
      router.push("/student");
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, router]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExamHeader examCode={examCode} duration={duration} currentStep="exam" user={profile ? { avatarUrl: profile.avatarUrl, fullName: profile.fullName, email: profile.email ?? undefined } : null} />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <Card data-testid="exam-submitted-state" className="max-w-2xl w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">답안이 성공적으로 제출되었습니다!</CardTitle>
            <CardDescription className="text-sm sm:text-base">수고하셨습니다. 시험이 종료되었습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-4">
              <p className="text-sm sm:text-base text-muted-foreground">
                제출이 완료되었습니다. AI가 답안을 채점하고 있으며, 보통 1~2분 내에 완료됩니다.
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{countdown}초</span> 뒤 대시보드로 이동합니다.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
