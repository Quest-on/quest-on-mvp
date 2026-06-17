"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getGradeDisplayScore, resolveQuestionQIdx } from "@/lib/grade-utils";

interface Question {
  id: string;
  idx: number;
  type: string;
  prompt: string;
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
  grade_type?: string;
  stage_grading?: {
    answer?: { score?: number };
  };
}

type FilterType = "all" | "multiple-choice" | "true-false" | "case";

interface QuestionNavigationProps {
  questions: Question[];
  selectedQuestionIdx: number;
  onSelectQuestion: (idx: number) => void;
  grades: Record<number, Grade>;
  hideScores?: boolean;
  /** questions[i]의 전역 q_idx. CASE만 필터링해 넘길 때 필수. */
  questionGlobalIndices?: number[];
  /** URL questionType 파라미터로부터 초기 선택할 탭. */
  initialFilter?: string;
}

function getTypePrefix(type: string): string {
  if (type === "multiple-choice") return "사지선다";
  if (type === "true-false") return "OX";
  return "CASE";
}

function isCaseType(type: string): boolean {
  return type === "case" || type === "essay" || type === "short-answer";
}

function normalizeFilter(raw?: string): FilterType {
  if (raw === "multiple-choice") return "multiple-choice";
  if (raw === "true-false") return "true-false";
  if (raw === "case") return "case";
  return "all";
}

/** 문제 유형별 번호를 붙인 레이블 배열 반환. 예: ["사지선다 1", "사지선다 2", "OX 1", "CASE 1"] */
function buildQuestionLabels(questions: Question[]): string[] {
  const counters: Record<string, number> = {};
  return questions.map((q) => {
    const prefix = getTypePrefix(q.type);
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix} ${counters[prefix]}`;
  });
}

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "모두" },
  { key: "multiple-choice", label: "사지선다" },
  { key: "true-false", label: "OX" },
  { key: "case", label: "Case" },
];

export function QuestionNavigation({
  questions,
  selectedQuestionIdx,
  onSelectQuestion,
  grades,
  hideScores = false,
  questionGlobalIndices,
  initialFilter,
}: QuestionNavigationProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>(() =>
    normalizeFilter(initialFilter)
  );

  if (!questions || !Array.isArray(questions)) {
    return (
      <div className="mb-6">
        <div className="text-red-600">문제를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const labels = buildQuestionLabels(questions);

  const distinctQuestionTypes = new Set(
    questions.map((q) => (isCaseType(q.type) ? "case" : q.type)),
  );
  const hasMultipleQuestionTypes = distinctQuestionTypes.size > 1;

  // 실제 탭에 표시할 유형만 (해당 유형 문제가 1개 이상 있을 때)
  const availableTabs = FILTER_TABS.filter((tab) => {
    if (tab.key === "all") return true;
    return questions.some((q) =>
      tab.key === "case" ? isCaseType(q.type) : q.type === tab.key
    );
  });

  // 필터에 맞는 (배열 인덱스, question) 쌍
  const visibleQuestions = questions
    .map((q, arrIdx) => ({ q, arrIdx, label: labels[arrIdx] }))
    .filter(({ q }) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "case") return isCaseType(q.type);
      return q.type === activeFilter;
    });

  return (
    <div className="mb-6 space-y-3">
      {hasMultipleQuestionTypes && availableTabs.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {availableTabs.map((tab) => (
            <Button
              key={tab.key}
              variant={activeFilter === tab.key ? "default" : "outline"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => {
                setActiveFilter(tab.key);
                // 탭 전환 시 해당 유형의 첫 번째 문제로 자동 이동
                if (tab.key === "all") {
                  if (questions.length > 0) onSelectQuestion(0);
                } else {
                  const firstIdx = questions.findIndex((q) =>
                    tab.key === "case" ? isCaseType(q.type) : q.type === tab.key
                  );
                  if (firstIdx !== -1) onSelectQuestion(firstIdx);
                }
              }}
              aria-pressed={activeFilter === tab.key}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {visibleQuestions.map(({ q, arrIdx, label }) => {
          const globalIndex = questionGlobalIndices?.[arrIdx] ?? arrIdx;
          const qIdx = resolveQuestionQIdx(q, globalIndex);
          const grade = grades[qIdx];
          const displayScore = getGradeDisplayScore(grade);
          return (
            <Button
              key={q.id || arrIdx}
              variant={selectedQuestionIdx === arrIdx ? "default" : "outline"}
              size="sm"
              onClick={() => onSelectQuestion(arrIdx)}
              aria-current={selectedQuestionIdx === arrIdx ? "true" : undefined}
              data-testid={`question-nav-${arrIdx}`}
            >
              {label}
              {displayScore !== null && !hideScores && (
                <Badge
                  variant="secondary"
                  className="ml-2 bg-green-100 text-green-800"
                >
                  {displayScore}점
                </Badge>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export { buildQuestionLabels, getTypePrefix };
