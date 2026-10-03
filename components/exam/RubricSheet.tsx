"use client";

import { useId, useState } from "react";
import { ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CopyProtector } from "@/components/exam/CopyProtector";
import { getPublicRubricItems } from "@/lib/exam-rubric";
import type { RubricItem } from "@/lib/types/exam";
import { cn } from "@/lib/utils";

interface RubricListProps {
  items: RubricItem[];
}

/** 평가 기준 항목을 읽기 전용으로 나열한다. 입력 요소는 없다. */
export function RubricList({ items }: RubricListProps) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const area = item.evaluationArea.trim();
        const criteria = item.detailedCriteria.trim();
        return (
          <li key={`${item.id ?? "item"}-${index}`} className="rounded-lg border border-border bg-card p-4">
            {area && <h3 className="type-field-label break-words text-foreground">{item.evaluationArea}</h3>}
            {criteria && (
              <p className={cn("type-hint whitespace-pre-wrap break-words leading-relaxed", area && "mt-1.5")}>
                {item.detailedCriteria}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 시트 안쪽: 머리말, 스크롤되는 목록, 닫기. 반드시 `Sheet` 안에서 쓴다(제목과 설명이
 * Radix 의 Dialog 문맥을 쓴다).
 */
export function RubricSheetPanel({ items }: RubricListProps) {
  const t = useTranslations("exam");
  const headingId = useId();

  return (
    <>
      {/* 닫기(X) 버튼이 제목 위에 겹치지 않게 오른쪽을 비운다. */}
      <SheetHeader className="shrink-0 border-b pr-12">
        <SheetTitle>
          {/* Radix 가 시트 제목 h2 에 붙이는 id 는 건드리지 않는다. 덮어쓰면 시트의 이름(aria-labelledby)이 끊기고
              개발 모드에서 "DialogContent 에 제목이 없다" 경고가 난다. 스크롤 영역의 이름은 이 span 이 맡는다. */}
          <span id={headingId}>{t("rubric.title")}</span>
        </SheetTitle>
        <SheetDescription>{t("rubric.description")}</SheetDescription>
      </SheetHeader>

      {/*
        항목이 많거나 세부 기준이 길어도 머리말·닫기 버튼은 고정하고 목록만 스크롤한다.

        tabIndex={0}: 안에 포커스를 받는 요소가 없어서, 이게 없으면 키보드 사용자는 이 목록을 스크롤할 수 없다
        (브라우저에 따라 스크롤 영역에 Tab 이 닿지 않는다). 또 Radix 포커스 가둠은 tabIndex >= 0 인 요소만
        포커스 후보로 고르므로(@radix-ui/react-focus-scope 의 getTabbableCandidates), 이게 없으면 시트가 열릴 때
        첫 포커스도 목록이 아니라 닫기 버튼으로 간다. 포커스 링은 Button 과 같은 토큰이고, 화면 가장자리에서
        잘리지 않게 inset 으로 그린다.
      */}
      <div
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        {/* 문제 본문과 같이 내부 복사로 표시한다(CopyProtector). */}
        <CopyProtector>
          <RubricList items={items} />
        </CopyProtector>
      </div>

      <SheetFooter className="shrink-0 border-t">
        <SheetClose asChild>
          <Button variant="outline">{t("rubric.close")}</Button>
        </SheetClose>
      </SheetFooter>
    </>
  );
}

interface RubricSheetProps {
  /** 서버가 내려 준 `exams.rubric` 그대로. 배열이 아닐 수 있어 여기서 걸러 낸다. */
  rubric?: unknown;
  /** `exams.rubric_public`. true 일 때만 보여 준다. */
  rubricPublic?: boolean | null;
  /** 처음부터 열어 둔다. 기본은 닫힘이다(응시 화면은 쓰지 않는다 — 서버 렌더 테스트용이다). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * 응시 중에 교수자가 공개한 평가 기준을 읽기 전용으로 보는 시트(버튼 + 시트).
 *
 * 볼 기준이 없으면(비공개, null, 문자열, 빈 배열) 아무것도 그리지 않는다 — 빈 시트를
 * 여는 버튼이 도구 막대에 남지 않게 한다. 판정은 `getPublicRubricItems` 하나다.
 */
export function RubricSheet({ rubric, rubricPublic, defaultOpen = false, className }: RubricSheetProps) {
  const t = useTranslations("exam");
  const [open, setOpen] = useState(defaultOpen);
  const items = getPublicRubricItems(rubric, rubricPublic);

  if (items.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* "문제 보기" 토글보다 눈에 덜 띄게 기본 윤곽선만 쓴다. 좁은 화면에서는 아이콘만 남긴다. */}
        <Button
          variant="outline"
          size="sm"
          className={cn("min-h-[40px] shrink-0 gap-1.5", className)}
          aria-label={t("rubric.buttonAriaLabel")}
        >
          <ListChecks className="size-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{t("rubric.button")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <RubricSheetPanel items={items} />
      </SheetContent>
    </Sheet>
  );
}
