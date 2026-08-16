"use client";

import * as React from "react";
import Image from "next/image";
import {
  FileText,
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  User,
  Clock,
  Calendar,
  CheckCircle2,
  Plus,
  Brain,
  Search,
  Folder,
  MoreVertical,
  ChevronRight,
  TrendingUp,
  MessageSquare,
  Activity,
  ArrowLeft,
  Sparkles,
  Quote,
  Minus,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Pie,
  PieChart,
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

// Custom Sidebar Component (독립적으로 작동)
function CustomSidebar({
  role,
  currentView,
  onViewChange,
}: {
  role: "instructor" | "student";
  currentView: string;
  onViewChange: (view: string) => void;
}) {
  const instructorNavItems = [
    {
      title: "대시보드",
      view: "dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "새 시험 생성",
      view: "new",
      icon: Plus,
    },
  ];

  const studentNavItems = [
    {
      title: "대시보드",
      view: "dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "새 시험 시작",
      view: "join",
      icon: Plus,
    },
  ];

  const navItems = role === "instructor" ? instructorNavItems : studentNavItems;

  return (
    <div className="bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col w-64">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center justify-start">
          <Image
            src="/qstn_logo_svg.svg"
            alt="Quest-On Logo"
            width={32}
            height={32}
            sizes="32px"
            className="w-8 h-8 shrink-0"
            loading="lazy"
          />
          <span className="text-base font-bold text-sidebar-foreground ml-2">
            Quest-On
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 p-2 space-y-1 overflow-y-auto"
        aria-label="주요 네비게이션"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              className={cn(
                "flex items-center space-x-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 min-h-[36px] w-full text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{item.title}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// Browser Window Component
function BrowserWindow({
  children,
  title,
  url,
  label,
  role,
  currentView,
  onViewChange,
}: {
  children: React.ReactNode;
  title: string;
  url: string;
  label?: string;
  role?: "instructor" | "student";
  currentView?: string;
  onViewChange?: (view: string) => void;
}) {
  return (
    <div className="w-full">
      <div className="bg-white rounded-lg shadow-2xl overflow-hidden border border-zinc-200">
        {/* Browser Chrome */}
        <div className="bg-zinc-100 px-3 py-1.5 border-b border-zinc-200">
          <div className="flex items-center gap-1.5 mb-1.5">
            {/* Window Controls */}
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
            </div>
            {/* Address Bar */}
            <div className="flex-1 bg-white rounded-md px-2 py-1 text-[10px] text-zinc-600 border border-zinc-300">
              {url}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-medium text-zinc-700">{title}</div>
            </div>
            <div className="flex items-center gap-1.5">
              {label && (
                <div className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                  {label}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Browser Content with Sidebar */}
        <div className="flex bg-white min-h-[600px] max-h-[750px]">
          {/* Custom Sidebar */}
          {role && currentView && (
            <CustomSidebar
              role={role}
              currentView={currentView}
              onViewChange={onViewChange || (() => {})}
            />
          )}
          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
          {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// 강사 대시보드 UI
const InstructorDashboardContent = ({ onExamClick }: { onExamClick: (examId: string) => void }) => (
  <div className="p-4 space-y-4 bg-background min-h-[400px] text-xs">
        {/* Header */}
    <div className="mb-4">
      <h1 className="text-lg font-bold text-foreground mb-1">강사 콘솔</h1>
      <p className="text-[10px] text-muted-foreground">
        환영합니다, 강사님! AI 기반 인터랙티브 시험을 생성하고 관리하세요
      </p>
    </div>

    {/* Welcome Card */}
    <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold mb-1">안녕하세요, 강사님!</h2>
      <p className="text-[10px] text-primary-foreground/90">
        AI 기반 인터랙티브 시험을 생성하고 관리하세요
      </p>
    </div>

    {/* 시험 관리 */}
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-primary" />
          시험 관리
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>총 3개</span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-card/80 border border-border rounded-lg p-3 mb-3">
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 bg-pink-700 text-white rounded-md text-[10px] hover:bg-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-700 focus-visible:ring-offset-2 dark:bg-pink-600 dark:hover:bg-pink-700 dark:focus-visible:ring-pink-400 flex items-center gap-1.5">
            <Plus className="w-3 h-3" />새 항목
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="시험 및 폴더 검색"
              className="w-full pl-7 pr-2 py-1.5 border border-border rounded-md text-[10px] bg-background"
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Exam Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div 
          className="border border-border rounded-xl p-3 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => onExamClick("exam-info")}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-[10px] truncate">
                국제경영론 25-1 중간고사
              </h4>
              <p className="text-[9px] text-muted-foreground">ABC123</p>
            </div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
              활성
            </span>
            <span className="text-[9px] text-muted-foreground">학생 12명</span>
          </div>
        </div>

        <div className="border border-border rounded-xl p-3 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Folder className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-[10px] truncate">2025-1학기</h4>
              <p className="text-[9px] text-muted-foreground">폴더</p>
            </div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// 강사 시험 출제 UI
const InstructorCreateExamContent = () => (
  <div className="p-4 space-y-4 bg-background min-h-[400px] text-xs">
    <div className="mb-4">
      <h1 className="text-lg font-bold text-foreground mb-1">
            새로운 시험 만들기
          </h1>
      <p className="text-[10px] text-muted-foreground">
        문제와 설정으로 새로운 시험을 구성하세요
      </p>
        </div>

    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          {/* Exam Info */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-foreground">
                시험 제목
              </label>
              <input
                type="text"
                value="국제경영론 25-1 중간고사"
                readOnly
            className="w-full px-2 py-1.5 border border-border rounded-md bg-background text-[10px]"
              />
            </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-foreground">
                  시험 코드
                </label>
            <div className="flex gap-1.5">
                  <input
                    type="text"
                    value="ABC123"
                    readOnly
                className="flex-1 px-2 py-1.5 border border-border rounded-md bg-muted text-[10px] font-mono"
                  />
                  <button
                    type="button"
                className="px-2 py-1.5 bg-primary text-primary-foreground rounded-md text-[10px] hover:bg-primary/90"
                  >
                    생성
                  </button>
                </div>
              </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-foreground">
                  시험 시간
                </label>
                <input
                  type="number"
                  value="60"
                  readOnly
              className="w-full px-2 py-1.5 border border-border rounded-md bg-background text-[10px]"
                />
              </div>
            </div>
          </div>

          {/* Question */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-foreground">문제</label>
            <textarea
              value="그린휠의 마케팅 전략을 제시하세요."
              readOnly
          className="w-full px-2 py-1.5 border border-border rounded-md bg-background text-[10px] min-h-[80px] resize-none"
        />
      </div>

      {/* Submit Button */}
      <div className="flex gap-3 pt-3">
        <button className="px-3 py-1.5 border border-border rounded-md text-[10px] hover:bg-muted">
          취소
        </button>
        <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-[10px] hover:bg-primary/90">
          출제하기
        </button>
      </div>
    </div>
  </div>
);

// 강사 시험 정보 UI
const InstructorExamInfoContent = ({ onStudentClick }: { onStudentClick?: () => void }) => {
  // 데모용 차트 데이터
  const averageScore = 85;
  const averageQuestions = 3.5;
  const averageAnswerLength = 450;
  const averageExamDuration = 45;

  const stageData = [
    { stage: "Clarification", score: 82 },
    { stage: "답안 작성", score: 88 },
    { stage: "Reflection", score: 85 },
  ];

  const questionTypeData = [
    { name: "개념", value: 45, fill: "#0F74FF" },
    { name: "계산", value: 25, fill: "#3B9EFF" },
    { name: "전략", value: 20, fill: "#6BC5FF" },
    { name: "기타", value: 10, fill: "#9DD5FF" },
  ];

  const rubricData = [
    { area: "논리성", score: 4.2, fullMark: 5 },
    { area: "구체성", score: 3.8, fullMark: 5 },
    { area: "창의성", score: 4.0, fullMark: 5 },
    { area: "완성도", score: 4.5, fullMark: 5 },
  ];

  const chartConfig = {
    count: { label: "학생 수", color: "#0F74FF" },
    score: { label: "점수", color: "#0F74FF" },
  };

  return (
    <div className="p-4 space-y-3 bg-background min-h-[400px] text-xs overflow-y-auto">
      {/* Header */}
      <div className="mb-3">
        <h1 className="text-lg font-bold text-foreground mb-1">
          국제경영론 25-1 중간고사
        </h1>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            시험 코드: ABC123
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            60분
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border border-border rounded-lg p-2 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5">
            <TrendingUp className="w-2.5 h-2.5" />
            <span>평균 점수</span>
          </div>
          <div className="text-base font-semibold">{averageScore}점</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5">
            <MessageSquare className="w-2.5 h-2.5" />
            <span>평균 질문</span>
          </div>
          <div className="text-base font-semibold">{averageQuestions}개</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5">
            <FileText className="w-2.5 h-2.5" />
            <span>평균 길이</span>
          </div>
          <div className="text-base font-semibold">{averageAnswerLength}자</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5">
            <Clock className="w-2.5 h-2.5" />
            <span>평균 시간</span>
          </div>
          <div className="text-base font-semibold">{averageExamDuration}분</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-2">
        {/* 단계별 성과 비교 */}
        <div className="bg-card border border-border rounded-lg p-2">
          <h3 className="text-[10px] font-semibold mb-1 text-center">단계별 성과</h3>
          <ChartContainer config={chartConfig} className="h-[100px]">
            <BarChart data={stageData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 7 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={false} axisLine={false} width={0} domain={[0, 100]} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent formatter={(value) => `${value}점`} />}
              />
              <Bar dataKey="score" fill="#0F74FF" radius={2} />
            </BarChart>
          </ChartContainer>
        </div>

        {/* 질문 유형별 분포 */}
        <div className="bg-card border border-border rounded-lg p-2">
          <h3 className="text-[10px] font-semibold mb-1 text-center">질문 유형</h3>
          <ChartContainer config={chartConfig} className="h-[100px]">
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => [`${value}개`, name]}
                  />
                }
              />
              <Pie
                data={questionTypeData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={20}
                outerRadius={35}
              >
                {questionTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>

        {/* 루브릭 항목별 역량 */}
        <div className="bg-card border border-border rounded-lg p-2">
          <h3 className="text-[10px] font-semibold mb-1 text-center">루브릭 역량</h3>
          <ChartContainer config={chartConfig} className="h-[100px]">
            <RadarChart data={rubricData}>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value) => [`${value}/5점`, ""]}
                  />
                }
              />
              <PolarAngleAxis
                dataKey="area"
                tick={{ fontSize: 7, fill: "#666" }}
                tickFormatter={(value) => value.substring(0, 3)}
              />
              <PolarGrid />
              <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} axisLine={false} />
              <Radar
                dataKey="score"
                stroke="#0F74FF"
                fill="#0F74FF"
                fillOpacity={0.6}
                dot={{ r: 2 }}
              />
            </RadarChart>
          </ChartContainer>
        </div>

        {/* 학생 통계 */}
        <div className="bg-card border border-border rounded-lg p-2">
          <h3 className="text-[10px] font-semibold mb-1 text-center">학생 현황</h3>
          <div className="space-y-1.5 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">참여 학생</span>
              <span className="text-[10px] font-semibold">12명</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">완료</span>
              <span className="text-[10px] font-semibold">8명</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">진행 중</span>
              <span className="text-[10px] font-semibold">4명</span>
            </div>
          </div>
        </div>
      </div>

      {/* Student List */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">학생 목록</h3>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="검색..."
              className="px-2 py-1 border border-border rounded-md text-[10px] w-32"
              readOnly
            />
          </div>
        </div>

      <div className="space-y-1.5">
        {[
          { name: "김학생", status: "완료", score: 92 },
          { name: "이학생", status: "완료", score: 85 },
          { name: "박학생", status: "진행 중", score: null },
        ].map((student, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2 border border-border rounded-lg hover:bg-muted/50 cursor-pointer"
            onClick={() => {
              if (student.status === "완료" && onStudentClick) {
                onStudentClick();
              }
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="font-medium text-[10px]">{student.name}</div>
                <div className="text-[9px] text-muted-foreground">
                  {student.status === "완료" ? "제출 완료" : "시험 진행 중"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {student.score !== null && (
                <span className="text-[10px] font-semibold text-foreground">
                  {student.score}점
                </span>
              )}
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  student.status === "완료"
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {student.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
};

// 강사 시험 채점 UI
const InstructorGradingContent = () => {
  // 데모용 데이터
  const examDuration = 120;
  const avgDuration = 90;
  const questionCount = 3;
  const avgQuestionCount = 5;
  const answerLength = 450;
  const avgAnswerLength = 600;

  const distributionData = [
    { name: "시험 소요 시간", value: examDuration, avg: avgDuration },
    { name: "AI 질문 수", value: questionCount, avg: avgQuestionCount },
    { name: "답안 길이", value: answerLength, avg: avgAnswerLength },
  ];

  return (
    <div className="p-4 space-y-3 bg-background min-h-[400px] text-xs overflow-y-auto">
      {/* Header */}
      <div className="mb-3">
        <button className="mb-2 px-2 py-1 border border-border rounded-md text-[9px] hover:bg-muted flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" />
          시험으로 돌아가기
        </button>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-base font-bold text-foreground mb-1">김학생 학생 채점</h1>
            <div className="space-y-0.5 text-[9px] text-muted-foreground">
              <p>제출일: 2025. 1. 15. 오후 3:43:08</p>
              <p>학번: 202365041</p>
              <p>학교: 경기과학기술대학교</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-foreground">92</div>
            <div className="text-[9px] text-muted-foreground">전체 점수</div>
          </div>
        </div>
      </div>

      {/* 시험 응시 데이터 */}
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <h3 className="text-[10px] font-semibold mb-2">시험 응시 데이터</h3>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[9px] text-muted-foreground mb-0.5">① 시험 소요 시간</div>
            <div className="text-[10px] font-semibold">{examDuration}분</div>
            <div className="text-[8px] text-muted-foreground">전체 평균: {avgDuration}분</div>
          </div>
          <div>
            <div className="text-[9px] text-muted-foreground mb-0.5">② 교차 점수</div>
            <div className="text-[10px] font-semibold">{questionCount}개</div>
            <div className="text-[8px] text-muted-foreground">전체 평균: {avgQuestionCount}개</div>
          </div>
          <div>
            <div className="text-[9px] text-muted-foreground mb-0.5">③ 답안 길이</div>
            <div className="text-[10px] font-semibold">{answerLength}자</div>
            <div className="text-[8px] text-muted-foreground">전체 평균: {avgAnswerLength}자</div>
          </div>
        </div>
      </div>

      {/* 전체 분포에서의 위치 */}
      <div className="bg-card border border-border rounded-lg p-3">
        <h3 className="text-[10px] font-semibold mb-2">전체 분포에서의 위치</h3>
        <div className="grid grid-cols-3 gap-2">
          {distributionData.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-[8px] text-muted-foreground">{item.name}</div>
              <ChartContainer config={{ value: { label: "", color: "#0F74FF" } }} className="h-[60px]">
                <BarChart data={[{ name: "학생", value: item.value }, { name: "평균", value: item.avg }]}>
                  <XAxis dataKey="name" tick={{ fontSize: 7 }} tickLine={false} axisLine={false} />
                  <YAxis tick={false} axisLine={false} width={0} />
                  <Bar dataKey="value" fill="#0F74FF" radius={2} />
                </BarChart>
              </ChartContainer>
            </div>
          ))}
        </div>
      </div>

      {/* 불여넣기 활동 */}
      <div className="bg-card border border-border rounded-lg p-3">
        <h3 className="text-[10px] font-semibold mb-1">불여넣기 활동</h3>
        <div className="text-[9px] text-muted-foreground">전체 불여넣기: 1회</div>
      </div>

      {/* AI 종합 평가 */}
      <div className="bg-card border-2 border-primary/10 rounded-lg overflow-hidden">
        <div className="bg-muted/30 p-2 border-b">
          <h3 className="text-[10px] font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-600" />
            AI 종합 평가
          </h3>
        </div>
        <div className="p-3 space-y-2">
          <div>
            <h4 className="text-[9px] font-medium text-muted-foreground mb-1">종합 의견</h4>
            <p className="text-[9px] leading-relaxed">
              학생의 답안은 평가 루브릭의 세 항목을 충실히 충족했습니다. 논리적 구조와 구체적 사례가 잘 제시되었습니다.
            </p>
          </div>
          <div className="bg-yellow-50/50 p-2 rounded border border-yellow-100">
            <h4 className="text-[9px] font-medium text-yellow-700 mb-1 flex items-center gap-1">
              <Quote className="w-2.5 h-2.5" /> 핵심 인용구
            </h4>
            <p className="text-[8px] italic text-gray-700">
              "그린휠의 경쟁우위를 파악하고 타겟 고객층을 설정해야 합니다."
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-50/50 p-2 rounded border border-blue-100">
              <h4 className="text-[9px] font-medium text-blue-700 mb-1 flex items-center gap-1">
                <Plus className="w-2.5 h-2.5" /> 강점
              </h4>
              <ul className="text-[8px] space-y-0.5">
                <li>• 논리적 구조</li>
                <li>• 구체적 사례</li>
              </ul>
            </div>
            <div className="bg-orange-50/50 p-2 rounded border border-orange-100">
              <h4 className="text-[9px] font-medium text-orange-700 mb-1 flex items-center gap-1">
                <Minus className="w-2.5 h-2.5" /> 개선점
              </h4>
              <ul className="text-[8px] space-y-0.5">
                <li>• 더 깊은 분석</li>
                <li>• 추가 사례</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 문제 1 - 좌우 레이아웃 */}
      <div className="grid grid-cols-3 gap-3">
        {/* 왼쪽: 학생 응시 내용 */}
        <div className="col-span-2 space-y-2">
          <div className="bg-card border border-border rounded-lg p-3 space-y-2">
            <h3 className="text-[10px] font-semibold">문제 1</h3>
            <div>
              <h4 className="text-[9px] font-medium mb-0.5">문제</h4>
              <p className="text-[9px] text-muted-foreground">
                그린휠의 마케팅 전략을 제시하세요.
              </p>
            </div>
            <div>
              <h4 className="text-[9px] font-medium mb-0.5">AI와의 대화 기록</h4>
              <div className="bg-muted/30 p-2 rounded space-y-1">
                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-[8px] max-w-[80%]">
                    경쟁사 제품 대비 그린휠의 제품은 얼마나 가벼워?
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-muted text-foreground rounded px-1.5 py-0.5 text-[8px] max-w-[80%]">
                    그린휠 E-Prime One은 평균 17kg으로 경쟁사 평균 대비 약 20% 경량화 되었습니다.
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-[9px] font-medium mb-0.5">최종 답안</h4>
              <div className="bg-muted/30 p-2 rounded text-[9px]">
                그린휠의 경쟁우위를 파악하고 타겟 고객층을 설정해야 합니다. MZ세대를 타겟으로 한 프리미엄 브랜드 포지셔닝과 디지털 마케팅을 중심으로 전략을 구성합니다.
              </div>
            </div>
            <div>
              <h4 className="text-[9px] font-medium mb-0.5 flex items-center gap-1">
                <Copy className="w-2.5 h-2.5" /> 내부 복사 활동
              </h4>
              <div className="text-[8px] text-muted-foreground">▪ 1차 내부 복사 (오후 03:42:31)</div>
            </div>
          </div>
        </div>

        {/* 오른쪽: 채점 패널 */}
        <div className="space-y-2">
          <div className="bg-card border border-border rounded-lg p-3">
            <h4 className="text-[9px] font-medium mb-2">문제 1 채점</h4>
            <div className="space-y-2">
              <div>
                <label className="text-[8px] text-muted-foreground">종합 점수 (0-100)</label>
                <input
                  type="number"
                  value="92"
                  readOnly
                  className="w-full px-2 py-1 border border-border rounded-md bg-background text-[9px] mt-0.5"
                />
                <div className="text-[8px] text-muted-foreground mt-0.5">
                  가채점 점수: 92점
                </div>
              </div>
              <button className="w-full px-2 py-1 bg-primary text-primary-foreground rounded-md text-[9px] hover:bg-primary/90">
                저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 학생 대시보드 UI
const StudentDashboardContent = ({ onExamClick }: { onExamClick: (examId: string) => void }) => (
  <div className="p-4 space-y-4 bg-background min-h-[400px] text-xs">
    {/* Header */}
    <div className="mb-4">
      <h1 className="text-lg font-bold text-foreground mb-1">학생 대시보드</h1>
      <p className="text-[10px] text-muted-foreground">
        환영합니다! 시험을 시작하거나 결과를 확인하세요
      </p>
    </div>

    {/* Welcome Card */}
    <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold mb-1">안녕하세요, 학생님!</h2>
      <p className="text-[10px] text-primary-foreground/90">
        새로운 시험을 시작하거나 진행 중인 시험을 계속하세요
      </p>
    </div>

    {/* Quick Actions */}
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div className="bg-card border border-border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Plus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-[10px]">새 시험 시작</div>
            <div className="text-[9px] text-muted-foreground">시험 코드 입력</div>
          </div>
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="font-semibold text-[10px]">시험 기록</div>
            <div className="text-[9px] text-muted-foreground">
              완료한 시험 보기
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Exam History */}
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-primary" />
          시험 기록
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>총 2개의 시험</span>
          </div>
        </div>

      <div className="space-y-1.5">
        {[
          {
            title: "국제경영론 25-1 중간고사",
            code: "ABC123",
            score: 92,
            status: "평가 완료",
            id: "report",
          },
          {
            title: "마케팅 전략론 기말고사",
            code: "XYZ789",
            score: null,
            status: "평가 대기중",
            id: "take-exam",
          },
        ].map((exam, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 cursor-pointer"
            onClick={() => {
              if (exam.status === "평가 완료") {
                onExamClick("report");
              } else {
                onExamClick("take-exam");
              }
            }}
          >
            <div className="flex-1">
              <div className="font-medium text-[10px] mb-0.5">{exam.title}</div>
              <div className="text-[9px] text-muted-foreground">{exam.code}</div>
            </div>
            <div className="flex items-center gap-2">
              {exam.score !== null && (
                <div className="text-right">
                  <div className="text-base font-bold text-foreground">
                    {exam.score}
                  </div>
                  <div className="text-[9px] text-muted-foreground">점</div>
                </div>
              )}
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  exam.status === "평가 완료"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {exam.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// 학생 시험 응시 UI
const StudentExamContent = () => (
  <div className="p-4 space-y-3 bg-background min-h-[400px] flex flex-col text-xs h-full">
    {/* Header */}
    <div className="border-b border-border pb-3 mb-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">국제경영론 25-1 중간고사</h2>
          <p className="text-[9px] text-muted-foreground">시험 코드: ABC123</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-medium">45:30 남음</span>
          </div>
          <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-[10px] hover:bg-primary/90">
            시험 제출하기
          </button>
        </div>
            </div>
          </div>

    {/* Question & Answer Layout */}
    <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
      {/* Left: Question */}
      <div className="col-span-2 space-y-3 flex flex-col min-h-0">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[9px] font-semibold">
              문제 1
            </span>
            <span className="text-[9px] text-muted-foreground">서술형 문제</span>
          </div>
          <h3 className="font-semibold mb-1.5 text-[10px]">문제</h3>
          <p className="text-[10px] text-muted-foreground">
            그린휠의 마케팅 전략을 제시하세요.
          </p>
        </div>

        {/* Answer Editor */}
        <div className="bg-card border border-border rounded-lg p-3 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold">답안 작성</label>
            <div className="flex items-center gap-1.5 text-[9px] text-green-600">
              <CheckCircle2 className="w-3 h-3" />
              <span>저장됨</span>
            </div>
          </div>
          <div className="bg-background border border-border rounded-md p-3 flex-1 overflow-y-auto">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              그린휠의 경쟁우위를 파악하고 타겟 고객층을 설정해야 합니다.
              경량화된 제품 특성을 중심으로 차별화된 마케팅 전략이 필요합니다.
              MZ세대를 타겟으로 한 프리미엄 브랜드 포지셔닝과 디지털 마케팅을
              중심으로 전략을 구성합니다.
            </p>
          </div>
        </div>
      </div>

      {/* Right: Chat */}
      <div className="flex flex-col min-h-0">
        <div className="bg-card border border-border rounded-lg p-3 flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Brain className="w-3 h-3 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-[10px]">AI 어시스턴트</h4>
              <p className="text-[9px] text-muted-foreground">2/5 질문</p>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto mb-2 min-h-0">
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-2 py-1.5 max-w-[85%] text-[9px]">
                경쟁사 제품 대비 그린휠의 제품은 얼마나 가벼워?
              </div>
            </div>
          <div className="flex justify-start">
              <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm px-2 py-1.5 max-w-[85%] text-[9px]">
                그린휠 E-Prime One은 평균 17kg으로 경쟁사 평균 대비 약 20%
                경량화 되었습니다.
              </div>
          </div>
        </div>

          <div className="pt-2 border-t border-border">
            <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="메시지를 입력하세요..."
                className="flex-1 px-2 py-1.5 border border-border rounded-full text-[9px] bg-background"
                readOnly
            />
              <button className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90">
                <ChevronRight className="w-3 h-3" />
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// 학생 시험 결과 UI
const StudentReportContent = () => (
  <div className="p-4 space-y-4 bg-background min-h-[400px] text-xs">
        {/* Header */}
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
          <div>
          <h1 className="text-lg font-bold text-foreground mb-1">
            국제경영론 25-1 중간고사
          </h1>
          <p className="text-[10px] text-muted-foreground">시험 코드: ABC123</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-green-600 mb-0.5">92</div>
          <div className="text-[10px] text-muted-foreground">종합 점수</div>
        </div>
      </div>
    </div>

    {/* Question Navigation */}
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5">
      {[1, 2, 3].map((num) => (
        <button
          key={num}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap flex items-center gap-1.5 ${
            num === 1
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          문제 {num}
          {num === 1 && (
            <span className="px-1 py-0.5 bg-primary-foreground/20 rounded text-[9px]">
              92
            </span>
          )}
        </button>
      ))}
    </div>

    {/* Content Grid */}
    <div className="grid grid-cols-3 gap-4">
      {/* Left: Question, Chat, Answer */}
      <div className="col-span-2 space-y-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="font-semibold mb-1.5 text-[10px]">문제</h3>
          <p className="text-[10px] text-muted-foreground">
            그린휠의 마케팅 전략을 제시하세요.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="font-semibold mb-2 text-[10px]">AI와의 대화</h3>
          <div className="space-y-1.5">
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-2 py-1.5 max-w-[80%] text-[9px]">
                경쟁사 제품 대비 그린휠의 제품은 얼마나 가벼워?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm px-2 py-1.5 max-w-[80%] text-[9px]">
                그린휠 E-Prime One은 평균 17kg으로 경쟁사 평균 대비 약 20%
                경량화 되었습니다.
              </div>
          </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="font-semibold mb-1.5 text-[10px]">내 답안</h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            그린휠의 경쟁우위를 파악하고 타겟 고객층을 설정해야 합니다. MZ세대를
            타겟으로 한 프리미엄 브랜드 포지셔닝과 디지털 마케팅을 중심으로
            전략을 구성합니다.
          </p>
        </div>
            </div>

      {/* Right: Evaluation */}
      <div className="space-y-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="font-semibold mb-2 text-[10px]">평가 결과</h3>
          <div className="space-y-2">
            <div>
              <div className="text-xl font-bold text-foreground mb-0.5">92</div>
              <div className="text-[9px] text-muted-foreground">점수</div>
            </div>
            <div>
              <div className="text-[9px] font-medium text-muted-foreground mb-0.5">
                강사 코멘트
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                전반적으로 논리적이며 마케팅 이론의 구조를 충실히 따르고
                있습니다. 3C와 SWOT 분석이 구체적으로 연결되어 높은 설득력을
                가집니다.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="font-semibold mb-2 text-[9px]">시험 정보</h3>
          <div className="space-y-1.5 text-[9px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">시험 코드</span>
              <span className="font-mono">ABC123</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">제출 일시</span>
              <span>2025.01.15</span>
          </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">질문 횟수</span>
              <span>2회</span>
            </div>
          </div>
        </div>
          </div>
        </div>
      </div>
);


export default function DemoExperienceSection({
  mode = "light",
}: {
  mode?: "light" | "dark";
}) {
  const isDark = mode === "dark";

  return (
    <section
      className={cn(
        "w-full py-16 lg:py-24",
        isDark ? "bg-black" : "bg-gradient-to-b from-white to-zinc-50"
      )}
    >
      <div className="container mx-auto px-4 lg:px-6">
        {/* Header */}
        <div className="mx-auto mb-12 lg:mb-16 max-w-4xl text-center">
          <h2
            className={cn(
              "text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl animate-fade-in-up-sm mb-4",
              isDark ? "text-white" : "text-[#1F1F1F]"
            )}
            style={{ letterSpacing: "-0.01em" }}
          >
            Quest-On 체험하기
          </h2>
          <p
            className={cn(
              "text-base md:text-lg leading-[1.6] animate-fade-in-up-sm",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}
            style={{ animationDelay: "0.1s", letterSpacing: "-0.3px" }}
          >
            4단계로 간단하게 시작하는 혁신적인 평가 시스템
          </p>
        </div>

        {/* Browser Windows */}
        <div className="max-w-7xl mx-auto">
          <DemoSteps mode={mode} />
        </div>
      </div>
    </section>
  );
}

function DemoSteps({
  mode,
}: {
  mode: "light" | "dark";
}) {
  const [instructorView, setInstructorView] = React.useState("dashboard");
  const [studentView, setStudentView] = React.useState("dashboard");

  // 현재 뷰에 따라 표시할 콘텐츠 결정
  const getInstructorContent = () => {
    if (instructorView === "dashboard") {
      return <InstructorDashboardContent onExamClick={(examId) => {
        if (examId === "exam-info") {
          setInstructorView("exam-info");
        } else if (examId === "grade") {
          setInstructorView("grade");
        }
      }} />;
    } else if (instructorView === "new") {
      return <InstructorCreateExamContent />;
    } else if (instructorView === "exam-info") {
      return <InstructorExamInfoContent onStudentClick={() => setInstructorView("grade")} />;
    } else if (instructorView === "grade") {
      return <InstructorGradingContent />;
    }
    return <InstructorDashboardContent onExamClick={() => {}} />;
  };

  const getStudentContent = () => {
    if (studentView === "dashboard") {
      return <StudentDashboardContent onExamClick={(examId) => {
        if (examId === "take-exam") {
          setStudentView("take-exam");
        } else if (examId === "report") {
          setStudentView("report");
        }
      }} />;
    } else if (studentView === "join") {
      return <StudentExamContent />;
    } else if (studentView === "take-exam") {
      return <StudentExamContent />;
    } else if (studentView === "report") {
      return <StudentReportContent />;
    }
    return <StudentDashboardContent onExamClick={() => {}} />;
  };

  const getInstructorTitle = () => {
    if (instructorView === "dashboard") return "강사 대시보드";
    if (instructorView === "new") return "새 시험 만들기";
    if (instructorView === "exam-info") return "시험 정보";
    if (instructorView === "grade") return "시험 채점";
    return "강사 대시보드";
  };

  const getStudentTitle = () => {
    if (studentView === "dashboard") return "학생 대시보드";
    if (studentView === "join") return "시험 참여";
    if (studentView === "take-exam") return "시험 응시";
    if (studentView === "report") return "시험 결과";
    return "학생 대시보드";
  };

  const getInstructorUrl = () => {
    if (instructorView === "dashboard") return "quest-on.com/instructor";
    if (instructorView === "new") return "quest-on.com/instructor/new";
    if (instructorView === "exam-info") return "quest-on.com/instructor/exam/ABC123";
    if (instructorView === "grade") return "quest-on.com/instructor/exam/ABC123/grade";
    return "quest-on.com/instructor";
  };

  const getStudentUrl = () => {
    if (studentView === "dashboard") return "quest-on.com/student";
    if (studentView === "join") return "quest-on.com/join";
    if (studentView === "take-exam") return "quest-on.com/exam/ABC123";
    if (studentView === "report") return "quest-on.com/student/report/123";
    return "quest-on.com/student";
  };

  return (
    <div className="w-full space-y-6">
      {/* Dual Browser Layout */}
      <div className="space-y-6">
        {/* Instructor Browser (Top) */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              강사 화면
            </span>
          </div>
                <BrowserWindow
            title={getInstructorTitle()}
            url={getInstructorUrl()}
            label="강사"
            role="instructor"
            currentView={instructorView}
            onViewChange={setInstructorView}
          >
            {getInstructorContent()}
                </BrowserWindow>
        </div>

        {/* Student Browser (Bottom) */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-foreground">
              학생 화면
            </span>
      </div>
          <BrowserWindow
            title={getStudentTitle()}
            url={getStudentUrl()}
            label="학생"
            role="student"
            currentView={studentView}
            onViewChange={setStudentView}
          >
            {getStudentContent()}
          </BrowserWindow>
        </div>
      </div>
    </div>
  );
}
