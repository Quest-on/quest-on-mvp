"use client";

import React, { forwardRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { QuestionSummaryData, StageGrading, SummaryData } from "@/lib/types/grading";
import { formatDateTime, formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

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
  stage_grading?: StageGrading;
  ai_summary?: QuestionSummaryData | null;
}

export interface ReportCardProps {
  examTitle: string;
  examCode: string;
  examDescription?: string | null;
  studentName: string;
  studentNumber?: string;
  school?: string;
  submittedAt: string;
  overallScore: number | null;
  questions: Question[];
  grades: Record<number, Grade>;
  aiSummary?: SummaryData | null;
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

export const ReportCardTemplate = forwardRef<HTMLDivElement, ReportCardProps>(
  (
    {
      examTitle,
      examCode,
      examDescription,
      studentName,
      studentNumber,
      school,
      submittedAt,
      overallScore,
      questions,
      grades,
      aiSummary,
    },
    ref
  ) => {
    const t = useTranslations("report.reportCard");
    const locale = useLocale() as Locale;

    function getGrade(score: number): string {
      if (score >= 90) return t("gradeA");
      if (score >= 80) return t("gradeB");
      if (score >= 70) return t("gradeC");
      if (score >= 60) return t("gradeD");
      return t("gradeF");
    }

    const formattedDate = formatDateTime(submittedAt, locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div
        ref={ref}
        data-pdf-template="true"
        style={{
          width: "210mm",
          minHeight: "297mm",
          backgroundColor: "#ffffff",
          color: "#1e293b",
          padding: "40px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: "0 auto",
          boxSizing: "border-box",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      >
        {/* Header */}
        <div
          data-pdf-block="true"
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "32px",
            borderBottom: "2px solid #2563eb",
            paddingBottom: "24px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qlogo_icon.png"
            alt={t("logoAlt")}
            style={{
              width: "50px",
              height: "50px",
              marginRight: "24px",
              borderRadius: "4px",
            }}
          />
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "#0f172a",
                marginBottom: "4px",
                margin: "0 0 4px 0",
              }}
            >
              {t("heading")}
            </h1>
            <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
              {examTitle}
            </p>
          </div>
        </div>

        {/* Info Grid */}
        <div
          data-pdf-block="true"
          style={{
            display: "flex",
            gap: "24px",
            marginBottom: "32px",
          }}
        >
          {/* Student Info */}
          <div
            style={{
              flex: 1,
              backgroundColor: "#f8fafc",
              padding: "24px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                color: "#2563eb",
                marginBottom: "16px",
                borderBottom: "1px solid #cbd5e1",
                paddingBottom: "8px",
                margin: "0 0 16px 0",
              }}
            >
              {t("studentInfo.title")}
            </h3>
            <div style={{ display: "flex", marginBottom: "8px" }}>
              <span
                style={{
                  width: "64px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#64748b",
                }}
              >
                {t("studentInfo.name")}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "10px",
                  color: "#334155",
                }}
              >
                {studentName}
              </span>
            </div>
            {studentNumber && (
              <div style={{ display: "flex", marginBottom: "8px" }}>
                <span
                  style={{
                    width: "64px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    color: "#64748b",
                  }}
                >
                  {t("studentInfo.studentNumber")}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: "10px",
                    color: "#334155",
                  }}
                >
                  {studentNumber}
                </span>
              </div>
            )}
            {school && (
              <div style={{ display: "flex", marginBottom: "8px" }}>
                <span
                  style={{
                    width: "64px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    color: "#64748b",
                  }}
                >
                  {t("studentInfo.school")}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: "10px",
                    color: "#334155",
                  }}
                >
                  {school}
                </span>
              </div>
            )}
            <div style={{ display: "flex" }}>
              <span
                style={{
                  width: "64px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#64748b",
                }}
              >
                {t("studentInfo.submittedAt")}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "10px",
                  color: "#334155",
                }}
              >
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Exam Info */}
          <div
            style={{
              flex: 1,
              backgroundColor: "#f8fafc",
              padding: "24px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                color: "#2563eb",
                marginBottom: "16px",
                borderBottom: "1px solid #cbd5e1",
                paddingBottom: "8px",
                margin: "0 0 16px 0",
              }}
            >
              {t("examInfo.title")}
            </h3>
            <div style={{ display: "flex", marginBottom: "8px" }}>
              <span
                style={{
                  width: "64px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#64748b",
                }}
              >
                {t("examInfo.examCode")}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "10px",
                  color: "#334155",
                }}
              >
                {examCode}
              </span>
            </div>
            <div style={{ display: "flex" }}>
              <span
                style={{
                  width: "64px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#64748b",
                }}
              >
                {t("examInfo.description")}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "10px",
                  color: "#334155",
                }}
              >
                {examDescription
                  ? stripHtml(examDescription).substring(0, 30) +
                    (examDescription.length > 30 ? "..." : "")
                  : t("examInfo.noDescription")}
              </span>
            </div>
          </div>
        </div>

        {/* Overall Score */}
        {overallScore !== null && (
          <div
            data-pdf-block="true"
            style={{
              marginBottom: "32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              backgroundColor: "#eff6ff",
              padding: "32px",
              borderRadius: "12px",
              border: "1px solid #bfdbfe",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "#1e40af",
                marginBottom: "8px",
                margin: "0 0 8px 0",
              }}
            >
              {t("overallScore.title")}
            </h3>
            <div
              style={{
                fontSize: "48px",
                fontWeight: "bold",
                color: "#2563eb",
                marginBottom: "8px",
                margin: "0 0 8px 0",
              }}
            >
              {t("overallScore.scorePoints", { score: overallScore })}
            </div>
            <div
              style={{
                marginTop: "8px",
                padding: "4px 16px",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "bold",
                borderRadius: "9999px",
              }}
            >
              {getGrade(overallScore)}
            </div>
          </div>
        )}

        {/* AI Summary */}
        {aiSummary && (
          <div data-pdf-block="true" style={{ marginBottom: "32px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "bold",
                color: "#0f172a",
                marginBottom: "16px",
                borderLeft: "4px solid #2563eb",
                paddingLeft: "12px",
                margin: "0 0 16px 0",
              }}
            >
              {t("aiSummary.title")}
            </h3>
            <div
              style={{
                backgroundColor: "#fffbeb",
                padding: "24px",
                borderRadius: "8px",
                border: "1px solid #fcd34d",
              }}
            >
              {aiSummary.summary && (
                <p
                  style={{
                    fontSize: "10px",
                    color: "#78350f",
                    lineHeight: 1.6,
                    marginBottom: "16px",
                    margin: "0 0 16px 0",
                  }}
                >
                  {stripHtml(aiSummary.summary)}
                </p>
              )}

              {aiSummary.strengths && aiSummary.strengths.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <h4
                    style={{
                      fontSize: "10px",
                      fontWeight: "bold",
                      color: "#92400e",
                      marginBottom: "8px",
                      margin: "0 0 8px 0",
                    }}
                  >
                    {t("aiSummary.strengths")}
                  </h4>
                  <ul style={{ listStyle: "disc inside", padding: 0, margin: 0 }}>
                    {aiSummary.strengths.map((strength, idx) => (
                      <li
                        key={idx}
                        style={{
                          fontSize: "10px",
                          color: "#78350f",
                          marginBottom: "4px",
                        }}
                      >
                        {stripHtml(strength)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiSummary.weaknesses && aiSummary.weaknesses.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <h4
                    style={{
                      fontSize: "10px",
                      fontWeight: "bold",
                      color: "#92400e",
                      marginBottom: "8px",
                      margin: "0 0 8px 0",
                    }}
                  >
                    {t("aiSummary.weaknesses")}
                  </h4>
                  <ul style={{ listStyle: "disc inside", padding: 0, margin: 0 }}>
                    {aiSummary.weaknesses.map((weakness, idx) => (
                      <li
                        key={idx}
                        style={{
                          fontSize: "10px",
                          color: "#78350f",
                          marginBottom: "4px",
                        }}
                      >
                        {stripHtml(weakness)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiSummary.aiDependency?.summary && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px",
                    backgroundColor: "rgba(255, 255, 255, 0.6)",
                    borderRadius: "6px",
                    border: "1px solid #fde68a",
                  }}
                >
                  <h4
                    style={{
                      fontSize: "10px",
                      fontWeight: "bold",
                      color: "#92400e",
                      margin: "0 0 6px 0",
                    }}
                  >
                    {t("aiSummary.aiDependency")}
                  </h4>
                  <p
                    style={{
                      fontSize: "9px",
                      color: "#78350f",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {stripHtml(aiSummary.aiDependency.summary)}
                  </p>
                </div>
              )}

              {aiSummary.keyQuotes && aiSummary.keyQuotes.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  {aiSummary.keyQuotes.map((quote, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "12px",
                        backgroundColor: "rgba(255, 255, 255, 0.5)",
                        borderLeft: "4px solid #d97706",
                        borderRadius: "4px",
                        marginBottom: "8px",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "9px",
                          fontStyle: "italic",
                          color: "#92400e",
                          margin: 0,
                        }}
                      >
                        &quot;{stripHtml(quote)}&quot;
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Questions Detail */}
        <div style={{ marginBottom: "32px" }}>
          <h3
            data-pdf-block="true"
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              color: "#0f172a",
              marginBottom: "16px",
              borderLeft: "4px solid #2563eb",
              paddingLeft: "12px",
              margin: "0 0 16px 0",
            }}
          >
            {t("questionsDetail.title")}
          </h3>
          <div>
            {questions.map((question, idx) => {
              const grade = grades[idx];
              if (!grade) return null;

              return (
                <div
                  data-pdf-block="true"
                  key={question.id || idx}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    overflow: "hidden",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      backgroundColor: "#f8fafc",
                      padding: "12px 16px",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#334155",
                      }}
                    >
                      {t("questionsDetail.questionLabel", { index: idx + 1 })}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#2563eb",
                      }}
                    >
                      {t("questionsDetail.scorePoints", { score: grade.score })}
                    </span>
                  </div>
                  <div style={{ padding: "16px" }}>
                    <p
                      style={{
                        fontSize: "10px",
                        color: "#475569",
                        lineHeight: 1.5,
                        marginBottom: "16px",
                        margin: "0 0 16px 0",
                      }}
                    >
                      {stripHtml(question.prompt)}
                    </p>
                    {grade.comment && (
                      <div
                        style={{
                          backgroundColor: "#f0fdf4",
                          padding: "12px",
                          borderRadius: "6px",
                          border: "1px solid #bbf7d0",
                        }}
                      >
                        <h4
                          style={{
                            fontSize: "9px",
                            fontWeight: "bold",
                            color: "#166534",
                            marginBottom: "4px",
                            margin: "0 0 4px 0",
                          }}
                        >
                          {t("questionsDetail.evaluationComment")}
                        </h4>
                        <p
                          style={{
                            fontSize: "9px",
                            color: "#14532d",
                            lineHeight: 1.4,
                            margin: 0,
                          }}
                        >
                          {stripHtml(grade.comment)}
                        </p>
                      </div>
                    )}
                    {(grade.stage_grading?.chat ||
                      grade.stage_grading?.answer ||
                      grade.ai_summary) && (
                      <div
                        style={{
                          marginTop: "12px",
                          backgroundColor: "#eff6ff",
                          padding: "12px",
                          borderRadius: "6px",
                          border: "1px solid #bfdbfe",
                        }}
                      >
                        <h4
                          style={{
                            fontSize: "9px",
                            fontWeight: "bold",
                            color: "#1e40af",
                            margin: "0 0 8px 0",
                          }}
                        >
                          {t("questionsDetail.aiEvaluation.title")}
                        </h4>
                        {grade.stage_grading?.chat && (
                          <p
                            style={{
                              fontSize: "9px",
                              color: "#1e3a8a",
                              lineHeight: 1.4,
                              margin: "0 0 8px 0",
                            }}
                          >
                            <strong>{t("questionsDetail.aiEvaluation.chatLabel")}</strong>{" "}
                            {grade.stage_grading.chat.score}점
                            {grade.stage_grading.chat.comment
                              ? ` - ${stripHtml(grade.stage_grading.chat.comment)}`
                              : ""}
                          </p>
                        )}
                        {grade.stage_grading?.answer && (
                          <p
                            style={{
                              fontSize: "9px",
                              color: "#1e3a8a",
                              lineHeight: 1.4,
                              margin: "0 0 8px 0",
                            }}
                          >
                            <strong>{t("questionsDetail.aiEvaluation.answerLabel")}</strong>{" "}
                            {grade.stage_grading.answer.score}점
                            {grade.stage_grading.answer.comment
                              ? ` - ${stripHtml(grade.stage_grading.answer.comment)}`
                              : ""}
                          </p>
                        )}
                        {grade.stage_grading?.answer?.ai_dependency?.summary && (
                          <p
                            style={{
                              fontSize: "9px",
                              color: "#1e3a8a",
                              lineHeight: 1.4,
                              margin: "0 0 8px 0",
                            }}
                          >
                            <strong>{t("questionsDetail.aiEvaluation.aiDependency")}</strong>{" "}
                            {stripHtml(
                              grade.stage_grading.answer.ai_dependency.summary
                            )}
                          </p>
                        )}
                        {grade.ai_summary?.summary && (
                          <p
                            style={{
                              fontSize: "9px",
                              color: "#1e3a8a",
                              lineHeight: 1.4,
                              margin: 0,
                            }}
                          >
                            <strong>{t("questionsDetail.aiEvaluation.aiSummary")}</strong>{" "}
                            {stripHtml(grade.ai_summary.summary)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          data-pdf-block="true"
          style={{
            textAlign: "center",
            fontSize: "10px",
            color: "#94a3b8",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "16px",
            marginTop: "48px",
          }}
        >
          {t("footer", { date: formatDate(new Date(), locale) })}
        </div>
      </div>
    );
  }
);

ReportCardTemplate.displayName = "ReportCardTemplate";
