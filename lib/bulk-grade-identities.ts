import type { UserInfo } from "@/lib/app-users";

export type BulkGradeSubmittedSession = {
  id: string;
  student_id: string;
  submitted_at: string | null;
};

export type BulkGradeStudentProfile = {
  student_id: string;
  name?: string | null;
  student_number?: string | null;
  school?: string | null;
};

export type BulkGradeStudentIdentity = {
  sessionId: string;
  studentId: string;
  name: string;
  studentNumber?: string;
  school?: string;
  email?: string;
  submittedAt: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function studentIdsNeedingAppUserFallback(
  studentIds: string[],
  profiles: BulkGradeStudentProfile[],
): string[] {
  const profileNameByStudentId = new Map<string, string>();
  for (const profile of profiles) {
    profileNameByStudentId.set(profile.student_id, profile.name?.trim() ?? "");
  }

  return studentIds.filter(
    (studentId) =>
      UUID_PATTERN.test(studentId) && !profileNameByStudentId.get(studentId),
  );
}

function syntheticAppUserName(studentId: string): string {
  return `User ${studentId.slice(0, 8)}`;
}

function syntheticAppUserEmail(studentId: string): string {
  return `${studentId}@example.com`;
}

function realAppUserName(info: UserInfo | undefined, studentId: string): string | undefined {
  if (!info?.name || info.name === syntheticAppUserName(studentId)) {
    return undefined;
  }
  return info.name;
}

function realAppUserEmail(info: UserInfo | undefined, studentId: string): string | undefined {
  if (!info?.email || info.email === syntheticAppUserEmail(studentId)) {
    return undefined;
  }
  return info.email;
}

function realProfileName(profile: BulkGradeStudentProfile | undefined): string | undefined {
  return profile?.name?.trim() || undefined;
}

export function buildBulkGradeStudentIdentities(
  sessions: BulkGradeSubmittedSession[],
  profiles: BulkGradeStudentProfile[],
  userInfoMap: Map<string, UserInfo>,
): BulkGradeStudentIdentity[] {
  const profileMap = new Map<string, BulkGradeStudentProfile>();
  for (const profile of profiles) {
    profileMap.set(profile.student_id, profile);
  }

  return sessions.map((session) => {
    const studentId = session.student_id;
    const profile = profileMap.get(studentId);
    const appUser = userInfoMap.get(studentId);
    const name =
      realProfileName(profile) ||
      realAppUserName(appUser, studentId) ||
      `Student ${studentId.slice(0, 8)}`;

    return {
      sessionId: session.id,
      studentId,
      name,
      studentNumber: profile?.student_number || undefined,
      school: profile?.school || undefined,
      email: realAppUserEmail(appUser, studentId),
      submittedAt: session.submitted_at,
    };
  });
}
