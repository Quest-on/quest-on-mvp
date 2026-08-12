/**
 * 중앙화된 Query Key 관리
 *
 * 사용 예시:
 * - useQuery({ queryKey: qk.instructor.exams(userId), ... })
 * - queryClient.invalidateQueries({ queryKey: qk.instructor.exams() })
 */

export const qk = {
  instructor: {
    /**
     * 강사가 생성한 시험 목록
     * @param userId - 강사 사용자 ID (optional, 부분 매칭 가능)
     */
    exams: (userId?: string) => {
      if (userId) {
        return ["instructor-exams", userId] as const;
      }
      return ["instructor-exams"] as const;
    },

    /**
     * 강사가 개설한 과목 목록
     * @param userId - 강사 사용자 ID (optional, 부분 매칭 가능)
     */
    courses: (userId?: string) => {
      if (userId) {
        return ["instructor-courses", userId] as const;
      }
      return ["instructor-courses"] as const;
    },

    /**
     * 시험 상세 데이터 (exam + sessions 병렬 로드)
     * @param examId - 시험 ID
     */
    examDetail: (examId: string) => ["instructor-exam-detail", examId] as const,

    /**
     * 시험별 학생 요약 (객관식/서술 진행)
     * @param examId - 시험 ID
     */
    studentSummaries: (examId: string) =>
      ["instructor-student-summaries", examId] as const,

    /**
     * 시험별 문제 목록 (lazy load)
     * @param examId - 시험 ID
     */
    examQuestions: (examId: string) => ["instructor-exam-questions", examId] as const,

    /**
     * 시험별 분석 데이터
     * @param examId - 시험 ID
     */
    examAnalytics: (examId: string) => ["exam-analytics", examId] as const,

    /**
     * 시험별 대기 중인 학생 목록 (실시간)
     * @param examId - 시험 ID
     */
    waitingStudents: (examId: string) =>
      ["instructor-waiting-students", examId] as const,

    /**
     * 지각 학생 목록 (late_pending 상태)
     * @param examId - 시험 ID
     */
    lateStudents: (examId: string) =>
      ["instructor-late-students", examId] as const,

    /**
     * 과제 상세 데이터
     * @param assignmentId - 과제 ID (exams 테이블의 type='assignment')
     */
    assignmentDetail: (assignmentId: string) => ["instructor-assignment-detail", assignmentId] as const,

    /**
     * 사례형 문항 강사–AI 채점 대화
     * @param sessionId - 세션 ID
     * @param qIdx - 문항 인덱스
     */
    caseGradeChat: (sessionId: string, qIdx: number) =>
      ["instructor-case-grade-chat", sessionId, qIdx] as const,

    bulkGradeSession: (examId: string) =>
      ["instructor-bulk-grade-session", examId] as const,

    bulkGradeChat: (examId: string) =>
      ["instructor-bulk-grade-chat", examId] as const,

    memory: (userId?: string) => {
      if (userId) {
        return ["instructor-memory", userId] as const;
      }
      return ["instructor-memory"] as const;
    },
  },

  student: {
    /**
     * 학생의 시험 세션 목록 (무한 스크롤)
     * @param userId - 학생 사용자 ID (optional, 부분 매칭 가능)
     */
    sessions: (userId?: string) => {
      if (userId) {
        return ["student-sessions", userId] as const;
      }
      return ["student-sessions"] as const;
    },

    /**
     * 학생의 통계 데이터
     * @param userId - 학생 사용자 ID (optional, 부분 매칭 가능)
     */
    stats: (userId?: string) => {
      if (userId) {
        return ["student-stats", userId] as const;
      }
      return ["student-stats"] as const;
    },

    assignmentQuiz: (sessionId: string, userId?: string) => {
      if (userId) {
        return ["student-assignment-quiz", sessionId, userId] as const;
      }
      return ["student-assignment-quiz", sessionId] as const;
    },

    /**
     * 마감된 과제의 본인 기록 읽기 전용 열람 (과제 정보·문제·채팅·최종답안·퀴즈)
     * @param code - 과제 코드 (exams.code)
     * @param userId - 학생 사용자 ID (optional, 부분 매칭 가능)
     */
    assignmentReview: (code: string, userId?: string) => {
      if (userId) {
        return ["student-assignment-review", code, userId] as const;
      }
      return ["student-assignment-review", code] as const;
    },
  },

  session: {
    /**
     * 세션별 채점 데이터
     * @param sessionId - 세션 ID (studentId로 사용됨)
     */
    grade: (sessionId: string) => ["session-grade", sessionId] as const,

    /**
     * 세션별 AI 요약 데이터
     * @param sessionId - 세션 ID (optional)
     */
    summary: (sessionId?: string) => {
      if (sessionId) {
        return ["session-summary", sessionId] as const;
      }
      return ["session-summary"] as const;
    },
  },

  drive: {
    /**
     * 드라이브 폴더 내용
     * @param folderId - 폴더 ID (null이면 루트)
     * @param userId - 사용자 ID (optional, 부분 매칭 가능)
     */
    folderContents: (folderId: string | null, userId?: string) => {
      if (userId) {
        return ["drive-folder-contents", folderId, userId] as const;
      }
      return ["drive-folder-contents", folderId] as const;
    },

    /**
     * 드라이브 브레드크럼
     * @param folderId - 폴더 ID
     */
    /**
     * 사이드바 폴더 트리 (useQuery 전용 — useInfiniteQuery 캐시와 분리)
     * @param folderId - 폴더 ID (null이면 루트)
     * @param userId - 사용자 ID (optional)
     */
    sidebarTree: (folderId: string | null, userId?: string) => {
      if (userId) {
        return ["drive-sidebar-tree", folderId, userId] as const;
      }
      return ["drive-sidebar-tree", folderId] as const;
    },

    breadcrumb: (folderId: string) => ["drive-breadcrumb", folderId] as const,
  },

  agent: {
    /**
     * 강사 AI 에이전트 런 목록
     */
    runs: () => ["agent-runs"] as const,

    /**
     * 단일 에이전트 런 (폴링 대상)
     * @param id - 런 ID
     */
    run: (id: string) => ["agent-run", id] as const,
  },

  admin: {
    aiUsageSummary: (options?: {
      range?: "7d" | "30d" | "90d";
      feature?: string;
      model?: string;
      examId?: string;
      status?: "success" | "error" | "timeout";
    }) => {
      const key = ["admin-ai-usage-summary"] as const;
      if (options) {
        return [...key, options] as const;
      }
      return key;
    },

    aiUsageBreakdown: (options?: {
      range?: "7d" | "30d" | "90d";
      feature?: string;
      model?: string;
      examId?: string;
      status?: "success" | "error" | "timeout";
    }) => {
      const key = ["admin-ai-usage-breakdown"] as const;
      if (options) {
        return [...key, options] as const;
      }
      return key;
    },

    aiUsageEvents: (options?: {
      range?: "7d" | "30d" | "90d";
      page?: number;
      limit?: number;
      feature?: string;
      model?: string;
      examId?: string;
      sessionId?: string;
      status?: "success" | "error" | "timeout";
    }) => {
      const key = ["admin-ai-usage-events"] as const;
      if (options) {
        return [...key, options] as const;
      }
      return key;
    },
  },
  /**
   * 동의 상태. 온보딩 게이트와 설정 화면이 같은 키를 쓴다.
   * 사용자별로 갈라야 계정 전환 시 이전 사용자의 상태가 남지 않는다.
   */
  consent: {
    status: (userId: string) => ["consent-status", userId] as const,
  },
} as const;
