"use client";

import { useId, useState } from "react";
import { Download, Paperclip } from "lucide-react";
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
import { FileTypeIcon } from "@/components/instructor/FileTypeIcon";
import { readStudentMaterialItems, type StudentVisibleMaterial } from "@/lib/student-materials";
import { cn } from "@/lib/utils";

interface MaterialsListProps {
  items: StudentVisibleMaterial[];
}

/** 공개 자료를 파일마다 이름, 형식, 내려받기 링크로 나열한다. 입력 요소는 없다. */
export function MaterialsList({ items }: MaterialsListProps) {
  const t = useTranslations("exam");
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const format = item.extension ? item.extension.toUpperCase() : t("materials.formatUnknown");
        return (
          <li
            key={item.url}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
          >
            <FileTypeIcon fileName={item.fileName} />
            <div className="min-w-0 flex-1">
              <p className="type-field-label break-all text-foreground">{item.fileName}</p>
              <p className="type-meta mt-1">{t("materials.format", { format })}</p>
            </div>
            {/*
              공개 버킷의 URL 이라 다른 출처다. 브라우저는 다른 출처 링크의 download 이름을 무시하고 새 탭에서
              연다. 표 파일은 그 탭에서 바로 내려받아지고, PDF 처럼 볼 수 있는 파일은 새 탭에 열린다.
              어느 쪽이든 시험 화면은 그대로 남는다.
            */}
            <Button asChild variant="outline" size="sm" className="min-h-[40px] shrink-0 gap-1.5">
              <a
                href={item.url}
                download={item.fileName}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("materials.downloadAriaLabel", { name: item.fileName })}
              >
                <Download className="size-4 shrink-0" aria-hidden="true" />
                <span>{t("materials.download")}</span>
              </a>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 시트 안쪽: 머리말, 스크롤되는 목록, 닫기. 반드시 `Sheet` 안에서 쓴다(제목과 설명이
 * Radix 의 Dialog 문맥을 쓴다). 구조는 평가 기준 시트(RubricSheetPanel)와 같다.
 */
export function MaterialsSheetPanel({ items }: MaterialsListProps) {
  const t = useTranslations("exam");
  const headingId = useId();

  return (
    <>
      {/* 닫기(X) 버튼이 제목 위에 겹치지 않게 오른쪽을 비운다. */}
      <SheetHeader className="shrink-0 border-b pr-12">
        <SheetTitle>
          {/* Radix 가 시트 제목 h2 에 붙이는 id 는 건드리지 않는다(시트의 이름이 끊긴다). 스크롤 영역의 이름은 이 span 이 맡는다. */}
          <span id={headingId}>{t("materials.title")}</span>
        </SheetTitle>
        <SheetDescription>{t("materials.description")}</SheetDescription>
      </SheetHeader>

      {/*
        파일이 많아도 머리말과 닫기 버튼은 고정하고 목록만 스크롤한다. 목록 안에 링크가 있어 Tab 으로
        닿지만, 평가 기준 시트와 같이 스크롤 영역 자체에도 포커스를 줘서 키보드로 스크롤할 수 있게 한다.
      */}
      <div
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <MaterialsList items={items} />
      </div>

      <SheetFooter className="shrink-0 border-t">
        <SheetClose asChild>
          <Button variant="outline">{t("materials.close")}</Button>
        </SheetClose>
      </SheetFooter>
    </>
  );
}

interface MaterialsSheetProps {
  /** 서버가 내려 준 `exam.student_materials`(공개 파일 항목) 그대로. 모양은 여기서 다시 확인한다. */
  materials?: unknown;
  /** 처음부터 열어 둔다. 기본은 닫힘이다(응시 화면은 쓰지 않는다 - 서버 렌더 테스트용이다). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * 응시 중에 교수자가 공개한 자료를 내려받는 시트(버튼 + 시트) (#544).
 *
 * 공개한 파일이 없으면 아무것도 그리지 않는다. 빈 시트를 여는 버튼이 도구 막대에 남지 않게 한다.
 * 판정은 `readStudentMaterialItems` 하나다.
 */
export function MaterialsSheet({ materials, defaultOpen = false, className }: MaterialsSheetProps) {
  const t = useTranslations("exam");
  const [open, setOpen] = useState(defaultOpen);
  const items = readStudentMaterialItems(materials);

  if (items.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* 평가 기준 버튼과 같은 윤곽선 버튼. 좁은 화면에서는 아이콘과 개수만 남긴다. */}
        <Button
          variant="outline"
          size="sm"
          className={cn("min-h-[40px] shrink-0 gap-1.5", className)}
          aria-label={t("materials.buttonAriaLabel", { count: items.length })}
        >
          <Paperclip className="size-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{t("materials.button")}</span>
          <span className="type-meta tabular-nums" aria-hidden="true">
            {items.length}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <MaterialsSheetPanel items={items} />
      </SheetContent>
    </Sheet>
  );
}
