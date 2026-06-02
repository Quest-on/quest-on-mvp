"use client";

import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import type { InstructorStudent } from "@/lib/types/exam";
import {
  dashboardStatus,
  dashboardStatusSortRank,
  type ExamStudentDashboardStatus,
  type ExamStudentSummary,
  type ExamStudentSummarySortOption,
} from "@/lib/types/student-summary";

export type StudentFilterSortOption =
  | ExamStudentSummarySortOption
  | "score"
  | "questionCount"
  | "answerLength";

type FilterableStudent = InstructorStudent | ExamStudentSummary;

function getName(student: FilterableStudent): string {
  return student.name;
}

function getEmail(student: FilterableStudent): string | undefined {
  if ("email" in student && typeof student.email === "string") {
    return student.email;
  }
  return undefined;
}

function getStudentNumber(student: FilterableStudent): string | undefined {
  if ("studentNumber" in student) return student.studentNumber;
  return (student as InstructorStudent).student_number;
}

function getSchool(student: FilterableStudent): string | undefined {
  return student.school ?? (student as InstructorStudent).school;
}

function getSubmittedAt(student: FilterableStudent): string | undefined {
  return student.submittedAt;
}

function getDashboardStatus(student: FilterableStudent): ExamStudentDashboardStatus | undefined {
  if ("overallStatus" in student) return dashboardStatus(student);
  return undefined;
}

function isInstructorStudent(student: FilterableStudent): student is InstructorStudent {
  return "isGraded" in student;
}

interface UseStudentFilteringOptions {
  students: FilterableStudent[];
  defaultSort?: StudentFilterSortOption;
}

export function useStudentFiltering({
  students,
  defaultSort = "name",
}: UseStudentFilteringOptions) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<StudentFilterSortOption>(defaultSort);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const filteredAndSortedStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      const query = debouncedSearchQuery.toLowerCase();
      const email = getEmail(student);
      return (
        getName(student).toLowerCase().includes(query) ||
        (email?.toLowerCase().includes(query) ?? false) ||
        getStudentNumber(student)?.toLowerCase().includes(query) ||
        getSchool(student)?.toLowerCase().includes(query)
      );
    });

    filtered.sort((a, b) => {
      switch (sortOption) {
        case "name":
          return getName(a).localeCompare(getName(b), "ko");
        case "studentNumber": {
          const aNum = getStudentNumber(a) ?? "";
          const bNum = getStudentNumber(b) ?? "";
          return aNum.localeCompare(bNum, "ko");
        }
        case "submittedAt": {
          const aTime = getSubmittedAt(a)
            ? new Date(getSubmittedAt(a)!).getTime()
            : 0;
          const bTime = getSubmittedAt(b)
            ? new Date(getSubmittedAt(b)!).getTime()
            : 0;
          return bTime - aTime;
        }
        case "overallStatus": {
          const aStatus = getDashboardStatus(a);
          const bStatus = getDashboardStatus(b);
          if (aStatus && !bStatus) return -1;
          if (!aStatus && bStatus) return 1;
          if (aStatus && bStatus) {
            return (
              dashboardStatusSortRank(aStatus) -
                dashboardStatusSortRank(bStatus) ||
              getName(a).localeCompare(getName(b), "ko")
            );
          }
          return getName(a).localeCompare(getName(b), "ko");
        }
        case "score": {
          if (!isInstructorStudent(a) || !isInstructorStudent(b)) return 0;
          if (a.score !== undefined && b.score === undefined) return -1;
          if (a.score === undefined && b.score !== undefined) return 1;
          if (a.score !== undefined && b.score !== undefined) {
            return b.score - a.score;
          }
          return 0;
        }
        case "questionCount": {
          if (!isInstructorStudent(a) || !isInstructorStudent(b)) return 0;
          if (a.questionCount !== undefined && b.questionCount === undefined)
            return -1;
          if (a.questionCount === undefined && b.questionCount !== undefined)
            return 1;
          if (
            a.questionCount !== undefined &&
            b.questionCount !== undefined
          ) {
            return b.questionCount - a.questionCount;
          }
          return 0;
        }
        case "answerLength": {
          if (!isInstructorStudent(a) || !isInstructorStudent(b)) return 0;
          if (a.answerLength !== undefined && b.answerLength === undefined)
            return -1;
          if (a.answerLength === undefined && b.answerLength !== undefined)
            return 1;
          if (a.answerLength !== undefined && b.answerLength !== undefined) {
            return b.answerLength - a.answerLength;
          }
          return 0;
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [students, debouncedSearchQuery, sortOption]);

  const gradedStudents = useMemo(() => {
    return filteredAndSortedStudents
      .filter((s): s is InstructorStudent => isInstructorStudent(s) && !!s.isGraded)
      .sort((a, b) => {
        if (a.finalScore !== undefined && b.finalScore === undefined) return -1;
        if (a.finalScore === undefined && b.finalScore !== undefined) return 1;
        if (a.finalScore !== undefined && b.finalScore !== undefined) {
          return b.finalScore - a.finalScore;
        }
        return 0;
      });
  }, [filteredAndSortedStudents]);

  const nonGradedStudents = useMemo(() => {
    return filteredAndSortedStudents.filter(
      (s) => isInstructorStudent(s) && !s.isGraded
    ) as InstructorStudent[];
  }, [filteredAndSortedStudents]);

  return {
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    filteredAndSortedStudents,
    gradedStudents,
    nonGradedStudents,
  };
}
