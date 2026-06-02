import { describe, expect, it } from "vitest";
import {
  buildBulkGradeStudentIdentities,
  studentIdsNeedingAppUserFallback,
} from "@/lib/bulk-grade-identities";

describe("buildBulkGradeStudentIdentities", () => {
  const sessions = [
    {
      id: "session-a",
      student_id: "student-alpha-1",
      submitted_at: "2026-05-31T00:00:00.000Z",
    },
    {
      id: "session-b",
      student_id: "student-beta-2",
      submitted_at: "2026-05-31T00:01:00.000Z",
    },
    {
      id: "session-c",
      student_id: "student-gamma-3",
      submitted_at: "2026-05-31T00:02:00.000Z",
    },
  ];

  it("prefers student_profiles over app user info", () => {
    const identities = buildBulkGradeStudentIdentities(
      sessions.slice(0, 1),
      [
        {
          student_id: "student-alpha-1",
          name: "김민지",
          student_number: "2026-1001",
          school: "Quest University",
        },
      ],
      new Map([
        [
          "student-alpha-1",
          { name: "App User Name", email: "alpha@example.edu" },
        ],
      ]),
    );

    expect(identities).toEqual([
      {
        sessionId: "session-a",
        studentId: "student-alpha-1",
        name: "김민지",
        studentNumber: "2026-1001",
        school: "Quest University",
        email: "alpha@example.edu",
        submittedAt: "2026-05-31T00:00:00.000Z",
      },
    ]);
  });

  it("falls back to real app user names, then stable Student prefix", () => {
    const identities = buildBulkGradeStudentIdentities(
      sessions.slice(1),
      [{ student_id: "student-beta-2", name: "   " }],
      new Map([
        [
          "student-beta-2",
          { name: "Beta App User", email: "beta@example.edu" },
        ],
        [
          "student-gamma-3",
          {
            name: "User student-",
            email: "student-gamma-3@example.com",
          },
        ],
      ]),
    );

    expect(identities).toEqual([
      {
        sessionId: "session-b",
        studentId: "student-beta-2",
        name: "Beta App User",
        email: "beta@example.edu",
        submittedAt: "2026-05-31T00:01:00.000Z",
      },
      {
        sessionId: "session-c",
        studentId: "student-gamma-3",
        name: "Student student-",
        submittedAt: "2026-05-31T00:02:00.000Z",
      },
    ]);
    expect(identities[1].email).toBeUndefined();
  });

  it("requests app user data only for students without profile names", () => {
    expect(
      studentIdsNeedingAppUserFallback(
        [
          "student-alpha-1",
          "11111111-1111-4111-8111-111111111111",
          "22222222-2222-4222-8222-222222222222",
        ],
        [
          { student_id: "student-alpha-1", name: "김민지" },
          {
            student_id: "11111111-1111-4111-8111-111111111111",
            name: "   ",
          },
        ],
      ),
    ).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });
});
