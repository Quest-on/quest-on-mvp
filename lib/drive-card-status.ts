/**
 * 교수 홈(드라이브) 시험·과제 카드의 상태 배지와, 그 카드가 "진행 중"·"마감" 필터 중
 * 어디에 잡히는지를 한 함수로 판정한다.
 *
 * 배지(`renderNodeStatus`)와 필터(`filteredExamNodes`)가 `exams.status` 를 따로
 * 읽고 있었다. 배지는 옛 값 `active` 만 진행 중으로 보고 `draft` 가 아니면 전부
 * "완료"로 떨어뜨렸고, 필터는 `active`·`completed` 만 봤다. 지금은 시작 라우트가
 * `running`, 종료 라우트가 `closed` 를 쓴다. 그래서 교수가 시험을 시작하면 카드에
 * "완료"가 뜨고, "진행 중"·"마감" 필터에는 시험이 하나도 잡히지 않았다(#567).
 *
 * 필터를 배지와 같은 판정에서 꺼내므로 같은 시각으로 판정하는 한 둘은 갈라지지 않는다.
 * 카드에 "진행 중"이 붙어 있으면 "진행 중" 필터에 나온다. 상태 값이 늘면 고칠 곳도 여기 하나다.
 * (화면은 필터 시각을 목록이 바뀔 때 잡고 배지 시각은 그릴 때 잡는다. 화면을 연 채 과제
 * 마감이 지나면 다음 조회 전까지 잠깐 다를 수 있다. 시험은 시각을 쓰지 않아 해당 없다.)
 */

/** 필터 칩의 값과 같다. "마감" 칩의 값이 `deadline` 이다. */
export type DriveStatusFilter = "in-progress" | "deadline";

/** 배지 색이 뜻하는 것. 실제 클래스는 화면이 고른다. */
export type DriveStatusTone = "success" | "warning" | "neutral";

export type DriveCardStatus = {
  /** null 이면 배지를 그리지 않는다. */
  readonly badge: {
    /** `instructor` 네임스페이스의 메시지 키. */
    readonly labelKey: string;
    readonly tone: DriveStatusTone;
  } | null;
  /** null 이면 "진행 중"·"마감" 어느 필터에도 잡히지 않는다. */
  readonly filter: DriveStatusFilter | null;
};

/** 드라이브 목록이 내려주는 `exams` 열 가운데 판정에 쓰는 것만. */
export type DriveCardExam = {
  status?: string | null;
  type?: string | null;
  deadline?: string | null;
  open_at?: string | null;
};

const IN_PROGRESS: DriveCardStatus = {
  badge: { labelKey: "drive.statusInProgress", tone: "success" },
  filter: "in-progress",
};

const CLOSED: DriveCardStatus = {
  badge: { labelKey: "drive.statusDeadlinePassed", tone: "neutral" },
  filter: "deadline",
};

const ARCHIVED: DriveCardStatus = {
  badge: { labelKey: "drive.statusArchived", tone: "neutral" },
  filter: "deadline",
};

const ASSIGNMENT_OPEN: DriveCardStatus = {
  badge: { labelKey: "drive.statusActive", tone: "success" },
  filter: "in-progress",
};

const ASSIGNMENT_SCHEDULED: DriveCardStatus = {
  badge: { labelKey: "drive.statusScheduled", tone: "warning" },
  filter: null,
};

const HIDDEN: DriveCardStatus = { badge: null, filter: null };

/**
 * 시험은 `exams.status` 로 판정한다. 기준은 그 값을 쓰는 쪽이다. 만들 때 `draft`,
 * 시작 라우트가 `running`, 종료 라우트가 `closed` 를 쓴다.
 */
function resolveExamStatus(status: string | null | undefined): DriveCardStatus {
  switch (status) {
    case "running":
      return IN_PROGRESS;
    case "entry_closed":
      // 입장만 막혔고 응시는 계속된다. 종료 라우트도 running 과 똑같이 받는다.
      // 카드에 "입장 마감"이라고 쓰면 "마감"으로 읽혀서 진행 중인 시험을 끝난
      // 것으로 오해한다. #567 이 막으려는 바로 그 오해다. 둘의 구분은 시험 상세
      // 화면의 배지(ExamStatusBadge)가 한다.
      return IN_PROGRESS;
    case "closed":
      return CLOSED;
    case "archived":
      // 학생 입장을 막는다는 점에서 closed 와 같다(isExamUnavailable). 그래서
      // "마감" 필터에 넣는다. 다만 교수가 일부러 치운 시험이라 배지는 따로 단다.
      return ARCHIVED;
    case "active":
      // 레거시 값. 운영 DB 에는 0건이지만 옛 행이 있으면 예전 뜻대로 읽는다.
      return IN_PROGRESS;
    case "completed":
      // 레거시 값. 위와 같다.
      return CLOSED;
    default:
      // draft · scheduled · joinable 은 시작 전이라 지금처럼 배지를 달지 않는다.
      // 모르는 값도 숨긴다. 예전에는 이런 값이 전부 "완료"로 떨어졌다.
      return HIDDEN;
  }
}

/**
 * 과제는 시작·종료 버튼이 없어서 status 가 만들 때의 draft 에 머문다. 그래서
 * 기간으로 판정한다. 배지는 #567 이전과 같고, 필터는 그 배지에서 꺼낸다. 마감
 * 전이면 "진행 중", 지나면 "마감"이다.
 */
function resolveAssignment(exam: DriveCardExam, now: number): DriveCardStatus {
  // 날짜가 깨져 있으면 NaN 이다. NaN 과의 비교는 늘 거짓이라 "안 지남"으로 읽힌다.
  const deadline = exam.deadline ? new Date(exam.deadline).getTime() : Number.NaN;
  if (now > deadline) return CLOSED;

  const openAt = exam.open_at ? new Date(exam.open_at).getTime() : null;
  if (openAt === null || now >= openAt) return ASSIGNMENT_OPEN;

  return ASSIGNMENT_SCHEDULED;
}

/** @param now 판정 기준 시각(ms). 과제의 마감·공개 시각과 비교할 때만 쓴다. */
export function resolveDriveCardStatus(
  exam: DriveCardExam | null | undefined,
  now: number = Date.now(),
): DriveCardStatus {
  if (!exam) return HIDDEN;

  // 화면의 다른 곳과 같은 기준이다. type 이 비어 있으면(옛 시험) 시험으로 본다.
  const isAssignment = Boolean(exam.type) && exam.type !== "exam";
  return isAssignment ? resolveAssignment(exam, now) : resolveExamStatus(exam.status);
}
