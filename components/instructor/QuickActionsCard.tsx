"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReportCardTemplate } from "@/components/report/ReportCardTemplate";
import type { QuestionSummaryData, StageGrading, SummaryData } from "@/lib/types/grading";

interface ReportData {
  exam: {
    title: string;
    code: string;
    questions: Array<{
      id: string;
      idx: number;
      type: string;
      prompt: string;
    }>;
    description?: string;
  };
  session: {
    submitted_at: string;
  };
  grades: Record<
    number,
    {
      id: string;
      q_idx: number;
      score: number;
      comment?: string;
      stage_grading?: StageGrading;
      ai_summary?: QuestionSummaryData | null;
    }
  >;
  overallScore: number | null;
  studentName: string;
  studentNumber?: string;
  school?: string;
  aiSummary?: SummaryData | null;
}

interface QuickActionsCardProps {
  sessionId: string;
  isGraded?: boolean;
  // Optional: If provided, use this data instead of fetching
  reportData?: ReportData;
}

function sanitizeCanvasClone(clonedDoc: Document) {
  try {
    const styleSheets = Array.from(clonedDoc.styleSheets);
    styleSheets.forEach((sheet) => {
      try {
        if (sheet.ownerNode && sheet.ownerNode.parentNode) {
          sheet.ownerNode.parentNode.removeChild(sheet.ownerNode);
        }
      } catch {
        // Ignore cross-origin or detached stylesheet errors.
      }
    });
  } catch {
    // Ignore stylesheet access errors.
  }

  const clonedElements = clonedDoc.querySelectorAll(
    `[data-pdf-template="true"], [data-pdf-page="true"]`
  );

  clonedElements.forEach((clonedElement) => {
    if (!clonedDoc.defaultView) return;
    const allElements = [
      clonedElement,
      ...clonedElement.querySelectorAll("*"),
    ];
    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      try {
        const computedStyle = clonedDoc.defaultView!.getComputedStyle(htmlEl);
        const bgColor = computedStyle.backgroundColor;
        const color = computedStyle.color;
        const borderColor = computedStyle.borderColor;

        if (
          bgColor &&
          !bgColor.includes("lab") &&
          bgColor !== "rgba(0, 0, 0, 0)" &&
          bgColor !== "transparent"
        ) {
          htmlEl.style.backgroundColor = bgColor;
        }
        if (color && !color.includes("lab")) {
          htmlEl.style.color = color;
        }
        if (
          borderColor &&
          !borderColor.includes("lab") &&
          borderColor !== "rgba(0, 0, 0, 0)" &&
          borderColor !== "transparent"
        ) {
          htmlEl.style.borderColor = borderColor;
        }
      } catch {
        // Ignore individual element style errors.
      }
    });
  });
}

function createPaginatedReportPages(template: HTMLElement) {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "-9999px";
  host.style.top = "0";
  host.style.width = "210mm";
  document.body.appendChild(host);

  const createPage = () => {
    const page = template.cloneNode(false) as HTMLElement;
    page.removeAttribute("data-pdf-template");
    page.setAttribute("data-pdf-page", "true");
    page.style.height = "297mm";
    page.style.minHeight = "297mm";
    page.style.margin = "0";
    page.style.overflow = "hidden";
    page.innerHTML = "";
    host.appendChild(page);
    return page;
  };

  const blocks = Array.from(
    template.querySelectorAll<HTMLElement>("[data-pdf-block='true']")
  );
  const pages: HTMLElement[] = [];
  let currentPage = createPage();
  pages.push(currentPage);

  blocks.forEach((block) => {
    const clonedBlock = block.cloneNode(true) as HTMLElement;
    currentPage.appendChild(clonedBlock);

    const overflowed = currentPage.scrollHeight > currentPage.clientHeight;
    if (overflowed && currentPage.children.length > 1) {
      currentPage.removeChild(clonedBlock);
      currentPage = createPage();
      pages.push(currentPage);
      currentPage.appendChild(clonedBlock);
    }
  });

  return { host, pages };
}

export function QuickActionsCard({
  sessionId,
  isGraded = false,
  reportData: providedReportData,
}: QuickActionsCardProps) {
  const t = useTranslations("authoring");
  const [downloading, setDownloading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(
    providedReportData || null
  );
  const reportTemplateRef = useRef<HTMLDivElement>(null);
  const effectiveReportData = providedReportData ?? reportData;

  const handleDownloadReportCard = async () => {
    if (!isGraded) {
      alert(t("quickActionsCard.alertNotGraded"));
      return;
    }

    try {
      setDownloading(true);

      // Use provided data or fetch if not available
      let dataToUse = providedReportData ?? reportData;
      if (!dataToUse) {
        const response = await fetch(
          `/api/student/session/${sessionId}/report`
        );
        if (!response.ok) {
          throw new Error(t("quickActionsCard.errorReportData"));
        }
        const data = await response.json();
        setReportData(data);
        dataToUse = data;
        // Wait a bit for state to update and component to render
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Ensure template is rendered
      if (!reportTemplateRef.current || !dataToUse) {
        throw new Error(t("quickActionsCard.errorTemplate"));
      }

      // Dynamically import libraries
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      // Wait a bit to ensure styles are loaded
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 297;
      const { host, pages } = createPaginatedReportPages(
        reportTemplateRef.current
      );

      try {
        for (const [index, page] of pages.entries()) {
          const canvas = await html2canvas(page, {
            scale: 2,
            logging: false,
            useCORS: true,
            backgroundColor: "#ffffff",
            foreignObjectRendering: false,
            onclone: sanitizeCanvasClone,
          });
          const imgData = canvas.toDataURL("image/png");
          if (index > 0) {
            pdf.addPage();
          }
          pdf.addImage(imgData, "PNG", 0, 0, imgWidth, pageHeight);
        }
      } finally {
        host.remove();
      }

      const filename = `${dataToUse.exam.title || "시험"}_${
        dataToUse.studentName || "학생"
      }_리포트카드.pdf`;
      pdf.save(filename);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : t("quickActionsCard.errorPdfGenerate")
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("quickActionsCard.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleDownloadReportCard}
            disabled={downloading || !isGraded}
          >
            {downloading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                {t("quickActionsCard.buttonGenerating")}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t("quickActionsCard.buttonDownloadPdf")}
              </>
            )}
          </Button>
          {/* <Button variant="outline" size="sm" className="w-full justify-start">
            <MessageSquare className="w-4 h-4 mr-2" />
            학생에게 메시지
          </Button> */}
        </CardContent>
      </Card>

      {/* Hidden Report Card Template for PDF Generation */}
      {effectiveReportData && (
        <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <ReportCardTemplate
            ref={reportTemplateRef}
            examTitle={effectiveReportData.exam.title}
            examCode={effectiveReportData.exam.code}
            examDescription={effectiveReportData.exam.description}
            studentName={effectiveReportData.studentName}
            studentNumber={effectiveReportData.studentNumber}
            school={effectiveReportData.school}
            submittedAt={effectiveReportData.session.submitted_at}
            overallScore={effectiveReportData.overallScore}
            questions={effectiveReportData.exam.questions}
            grades={effectiveReportData.grades}
            aiSummary={effectiveReportData.aiSummary}
          />
        </div>
      )}
    </>
  );
}
