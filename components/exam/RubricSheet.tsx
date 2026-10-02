"use client";

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
            {area && (
              <h3 className="break-words text-sm font-semibold text-foreground">{item.evaluationArea}</h3>
            )}
            {criteria && (
              <p
                className={cn(
                  "whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground",
                  area && "mt-1.5",
                )}
              >
                {item.detailedCriteria}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface RubricSheetProps {
  /** 서버가 내려 준 `exams.rubric` 그대로. 배열이 아닐 수 있어 여기서 걸러 낸다. */
  rubric?: unknown;
  /** `exams.rubric_public`. true 일 때만 보여 준다. */
  rubricPublic?: boolean | null;
  className?: string;
}

/**
 * 응시 중에 교수자가 공개한 평가 기준을 읽기 전용으로 보는 시트(버튼 + 시트).
 *
 * 볼 기준이 없으면(비공개, null, 문자열, 빈 배열) 아무것도 그리지 않는다 — 빈 시트를
 * 여는 버튼이 도구 막대에 남지 않게 한다. 판정은 `getPublicRubricItems` 하나다.
 */
export function RubricSheet({ rubric, rubricPublic, className }: RubricSheetProps) {
  const t = useTranslations("exam");
  const items = getPublicRubricItems(rubric, rubricPublic);

  if (items.length === 0) return null;

  return (
    <Sheet>
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
        {/* 닫기(X) 버튼이 제목 위에 겹치지 않게 오른쪽을 비운다. */}
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle>{t("rubric.title")}</SheetTitle>
          <SheetDescription>{t("rubric.description")}</SheetDescription>
        </SheetHeader>

        {/* 항목이 많거나 세부 기준이 길어도 머리말·닫기 버튼은 고정하고 목록만 스크롤한다. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/* 문제 본문과 같이 내부 복사로 표시해, 답안에 붙여 넣어도 외부 붙여넣기로 오인되지 않게 한다. */}
          <CopyProtector>
            <RubricList items={items} />
          </CopyProtector>
        </div>

        <SheetFooter className="shrink-0 border-t">
          <SheetClose asChild>
            <Button variant="outline">{t("rubric.close")}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
