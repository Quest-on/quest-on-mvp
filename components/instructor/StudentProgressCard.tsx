"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FileText, Activity } from "lucide-react";
import { StudentLiveMonitoring } from "./StudentLiveMonitoring";
import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDate } from "@/lib/i18n/format";

interface Student {
  id: string; // session ID
  name: string;
  email: string;
  status: "not-started" | "in-progress" | "completed";
  score?: number;
  submittedAt?: string;
  createdAt?: string;
  student_number?: string;
  school?: string;
}

interface StudentProgressCardProps {
  students: Student[];
  examId: string;
}

const getStudentStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800";
    case "in-progress":
      return "bg-yellow-100 text-yellow-800";
    case "not-started":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

// 경과 시간을 계산하고 포맷하는 컴포넌트
function ElapsedTime({ createdAt }: { createdAt: string | undefined }) {
  const t = useTranslations("grading");
  const [elapsedTime, setElapsedTime] = useState<string>("");

  useEffect(() => {
    if (!createdAt) {
      setElapsedTime("");
      return;
    }

    const updateElapsedTime = () => {
      const startTime = new Date(createdAt).getTime();
      const now = Date.now();
      const diffMs = now - startTime;

      if (diffMs < 0) {
        setElapsedTime(t("studentProgress.elapsedJustNow"));
        return;
      }

      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        setElapsedTime(t("studentProgress.elapsedDaysHours", { days: diffDays, hours: diffHours % 24 }));
      } else if (diffHours > 0) {
        setElapsedTime(t("studentProgress.elapsedHoursMinutes", { hours: diffHours, minutes: diffMinutes % 60 }));
      } else if (diffMinutes > 0) {
        setElapsedTime(t("studentProgress.elapsedMinutes", { minutes: diffMinutes }));
      } else {
        setElapsedTime(t("studentProgress.elapsedJustNow"));
      }
    };

    // 즉시 업데이트
    updateElapsedTime();

    // 페이지가 보일 때만 업데이트
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateElapsedTime();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 30초마다 업데이트 (실시간성 향상)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        updateElapsedTime();
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [createdAt]);

  if (!elapsedTime) return null;

  return <span>{t("studentProgress.elapsedSince", { elapsed: elapsedTime })}</span>;
}

export function StudentProgressCard({
  students,
  examId,
}: StudentProgressCardProps) {
  const t = useTranslations("grading");
  const locale = useLocale() as "ko" | "en";
  const [monitoringSessionId, setMonitoringSessionId] = useState<string | null>(
    null
  );
  const [monitoringStudent, setMonitoringStudent] = useState<Student | null>(
    null
  );

  const handleLiveMonitoring = (student: Student) => {
    setMonitoringStudent(student);
    setMonitoringSessionId(student.id);
  };

  const handleCloseMonitoring = () => {
    setMonitoringSessionId(null);
    setMonitoringStudent(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("studentProgress.cardTitle", { count: students.length })}</CardTitle>
          <CardDescription>{t("studentProgress.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md divide-y">
            {students.map((student) => (
              <div
                key={student.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <Avatar className="h-10 w-10 border">
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {student.name.slice(-2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium leading-none">
                        {student.name}
                      </h4>
                      <Badge
                        variant="secondary"
                        className={`text-xs font-normal ${getStudentStatusColor(
                          student.status
                        )}`}
                      >
                        {student.status === "in-progress" && (
                          <span className="relative flex h-2 w-2 mr-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-600 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-600"></span>
                          </span>
                        )}
                        {student.status === "completed"
                          ? t("studentProgress.statusCompleted")
                          : student.status === "in-progress"
                          ? t("studentProgress.statusInProgress")
                          : t("studentProgress.statusNotStarted")}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {student.email}
                    </div>
                    {(student.student_number || student.school) && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {student.student_number && (
                          <span>{student.student_number}</span>
                        )}
                        {student.student_number && student.school && (
                          <span className="text-muted-foreground/50">•</span>
                        )}
                        {student.school && <span>{student.school}</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-auto">
                  <div className="text-right min-w-[120px]">
                    {student.score !== undefined && student.score !== null && (
                      <div className="flex flex-col items-end">
                        <span className="font-semibold text-lg">
                          {t("studentProgress.scoreLabel", { score: student.score })}
                        </span>
                        {student.status === "completed" &&
                          student.submittedAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(student.submittedAt, locale)}
                            </span>
                          )}
                        {student.status === "in-progress" &&
                          student.createdAt && (
                            <div className="text-xs text-muted-foreground">
                              <ElapsedTime createdAt={student.createdAt} />
                            </div>
                          )}
                      </div>
                    )}
                    {student.status === "in-progress" &&
                      student.score === undefined &&
                      student.createdAt && (
                        <div className="text-xs text-muted-foreground">
                          <ElapsedTime createdAt={student.createdAt} />
                        </div>
                      )}
                  </div>

                  <div className="flex items-center gap-2">
                    {student.status === "in-progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50 h-8"
                        onClick={() => handleLiveMonitoring(student)}
                      >
                        <Activity className="w-3.5 h-3.5 mr-1" />
                        {t("studentProgress.monitoringButton")}
                      </Button>
                    )}
                    {student.status === "completed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-blue-600 border-blue-600 hover:bg-blue-50 h-8"
                        onClick={() =>
                          (window.location.href = `/instructor/${examId}/grade/${student.id}`)
                        }
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" />
                        {t("studentProgress.gradeButton")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {monitoringStudent && monitoringSessionId && (
        <StudentLiveMonitoring
          open={monitoringSessionId !== null}
          onOpenChange={(open) => {
            if (!open) handleCloseMonitoring();
          }}
          sessionId={monitoringSessionId}
          studentName={monitoringStudent.name}
          studentNumber={monitoringStudent.student_number}
          school={monitoringStudent.school}
        />
      )}
    </>
  );
}
