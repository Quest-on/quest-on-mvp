"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Download, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  materialDownloadHref,
  readStudentMaterialItems,
  type StudentVisibleMaterial,
} from "@/lib/student-materials";
import { cn } from "@/lib/utils";

/** 파일(URL)별 내려받기 상태. 키가 없으면 아직 누르지 않은 파일이다. */
export type MaterialDownloadState = Readonly<Record<string, "pending" | "failed">>;

export type MaterialDownloadEvent =
  | { type: "request"; url: string }
  | { type: "frame-load"; url: string };

/**
 * 숨긴 iframe 의 load 이벤트로 내려받기 실패를 판정한다 (#546 재검토).
 *
 * 첨부 응답(Content-Disposition: attachment)은 iframe 에 문서를 만들지 않아 load 가 오지 않는다.
 * Storage 오류 JSON, CSP 차단, 네트워크 오류는 iframe 에 오류 문서를 만들어 load 가 온다(리뷰의
 * 헤드리스 Chromium 측정: 첨부 0회, 오류 문서와 CSP 차단 1회 이상). 그래서 누른 뒤 load 가 오면
 * 실패로 본다. 누르기 전의 load(iframe 을 처음 끼울 때의 about:blank)는 무시한다.
 * 상태가 그대로면 같은 객체를 돌려준다(호출자가 "실패가 새로 생겼는지"를 이것으로 안다).
 */
export function materialDownloadReducer(
  state: MaterialDownloadState,
  event: MaterialDownloadEvent,
): MaterialDownloadState {
  if (event.type === "request") {
    return state[event.url] === "pending" ? state : { ...state, [event.url]: "pending" };
  }
  return state[event.url] === "pending" ? { ...state, [event.url]: "failed" } : state;
}

interface DownloadTarget {
  item: StudentVisibleMaterial;
  /** `materialDownloadHref` 의 결과. Supabase 공개 객체에 `?download=<원래 이름>` 을 붙인 주소. */
  href: string;
}

/**
 * 숨긴 iframe 으로 내려받는다 (#546 리뷰 B1, 재검토).
 *
 * 같은 탭 `<a href>` 로는 브라우저가 이 클릭을 페이지 이동으로 처리한다. 첨부 응답에서도 `beforeunload`
 * 가 실행돼 세션이 비활성이 되고, 답안이 있으면 나가기 확인 창이 뜨고, Storage 오류 응답에는 시험 페이지가
 * 오류 JSON 화면으로 넘어간다. iframe 의 `src` 를 바꾸면 어떤 응답이든 최상위 창의 탐색이 아니므로
 * `beforeunload` 가 돌지 않는다. CSP `frame-src` 에 `https://*.supabase.co` 와 로컬 스택 출처가
 * 필요하다(next.config.ts).
 *
 * - iframe 은 파일마다 하나이고, 시트 밖(응시 화면의 도구 막대, 항상 마운트)에 그린다. 시트를 빨리
 *   닫아도 응답을 기다리던 내려받기가 끊기지 않고, 다른 파일을 이어 눌러도 앞 파일이 끊기지 않는다.
 * - `src` 는 React 속성으로 주지 않고 누를 때 직접 넣는다(다시 그릴 때 React 가 되돌리지 않게).
 *   같은 주소를 다시 넣어도 브라우저는 새로 요청한다(iframe.src = iframe.src 로 다시 읽는 것과 같다).
 *   주소에 조각(#)을 붙이지 않는다. 조각만 다른 주소는 문서 안 이동이라 다시 요청하지 않는다.
 *   src 를 먼저 비우지도 않는다. 비우면 iframe 이 about:blank 로 이동하며 load 를 한 번 더 내서 실패로
 *   잘못 읽힐 수 있다.
 * - 클릭 처리기 안에서 바로 `src` 를 넣는다. 사용자 동작 없이 시작한 교차 출처 iframe 내려받기는
 *   브라우저가 막을 수 있다.
 */
function useMaterialDownloads(
  targets: DownloadTarget[],
  onFailure: (target: DownloadTarget) => void,
): {
  frames: ReactNode;
  download: (target: DownloadTarget) => void;
  failedUrls: ReadonlySet<string>;
} {
  const frameByUrl = useRef(new Map<string, HTMLIFrameElement>());
  const stateRef = useRef<MaterialDownloadState>({});
  const [state, setState] = useState<MaterialDownloadState>({});

  // 이벤트 처리기에서만 부른다. 상태가 바뀌었으면 true.
  const apply = useCallback((event: MaterialDownloadEvent) => {
    const next = materialDownloadReducer(stateRef.current, event);
    if (next === stateRef.current) return false;
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  const download = useCallback(
    ({ item, href }: DownloadTarget) => {
      const frame = frameByUrl.current.get(item.url);
      if (!frame) {
        // iframe 은 내려받을 수 있는 파일마다 미리 그려 두므로 여기 올 일은 없다. 그래도 시험 화면은 떠나지 않는다.
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      apply({ type: "request", url: item.url });
      frame.setAttribute("src", href);
    },
    [apply],
  );

  const frames = targets.map((target) => (
    <iframe
      key={target.item.url}
      ref={(node) => {
        if (node) frameByUrl.current.set(target.item.url, node);
        else frameByUrl.current.delete(target.item.url);
      }}
      title=""
      aria-hidden="true"
      tabIndex={-1}
      className="sr-only"
      onLoad={() => {
        if (apply({ type: "frame-load", url: target.item.url })) onFailure(target);
      }}
    />
  ));

  const failedUrls = new Set(Object.keys(state).filter((url) => state[url] === "failed"));
  return { frames, download, failedUrls };
}

interface MaterialsListProps {
  items: StudentVisibleMaterial[];
  /** 내려받기에 실패한 파일의 URL. 그 파일 아래에 알림과 새 탭 링크를 보인다. */
  failedUrls: ReadonlySet<string>;
  /** Supabase 공개 객체의 내려받기를 시작한다(숨긴 iframe). */
  onDownload: (target: DownloadTarget) => void;
}

/** 공개 자료를 파일마다 이름, 형식, 내려받기 버튼으로 나열한다. 입력 요소는 없다. */
export function MaterialsList({ items, failedUrls, onDownload }: MaterialsListProps) {
  const t = useTranslations("exam");
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const format = item.extension ? item.extension.toUpperCase() : t("materials.formatUnknown");
        // Supabase 공개 객체면 ?download=<원래 이름> 을 숨긴 iframe 으로 연다(위 useMaterialDownloads 주석).
        // 그 밖의 주소는 그 파라미터를 모르는 서버라 새 탭으로 연다.
        const downloadHref = materialDownloadHref(item.url, item.fileName);
        const failed = downloadHref !== null && failedUrls.has(item.url);
        return (
          <li key={item.url} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <FileTypeIcon fileName={item.fileName} />
              <div className="min-w-0 flex-1">
                <p className="type-field-label break-all text-foreground">{item.fileName}</p>
                <p className="type-meta mt-1">{t("materials.format", { format })}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px] shrink-0 gap-1.5"
                onClick={() => {
                  if (downloadHref) onDownload({ item, href: downloadHref });
                  else window.open(item.url, "_blank", "noopener,noreferrer");
                }}
                aria-label={t("materials.downloadAriaLabel", { name: item.fileName })}
              >
                <Download className="size-4 shrink-0" aria-hidden="true" />
                <span>{t("materials.download")}</span>
              </Button>
            </div>
            {failed && (
              // 다시 누르면 알림이 사라졌다가, 또 실패하면 다시 나타나 스크린 리더가 다시 읽는다.
              <Alert variant="destructive" className="mt-3">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>
                  <p>{t("materials.downloadFailed")}</p>
                  {/* 새 탭은 시험 탭을 떠나지 않는다. 같은 주소라 원래 이름으로 받는다. */}
                  <a
                    href={downloadHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("materials.openInNewTabAriaLabel", { name: item.fileName })}
                    className="font-medium underline underline-offset-4"
                  >
                    {t("materials.openInNewTab")}
                  </a>
                </AlertDescription>
              </Alert>
            )}
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
export function MaterialsSheetPanel({ items, failedUrls, onDownload }: MaterialsListProps) {
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
        파일이 많아도 머리말과 닫기 버튼은 고정하고 목록만 스크롤한다. 목록 안에 버튼이 있어 Tab 으로
        닿지만, 평가 기준 시트와 같이 스크롤 영역 자체에도 포커스를 줘서 키보드로 스크롤할 수 있게 한다.
      */}
      <div
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <MaterialsList items={items} failedUrls={failedUrls} onDownload={onDownload} />
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
 *
 * 내려받기 iframe 은 시트 밖, 이 컴포넌트의 뿌리에 둔다. 시트 내용(SheetContent)은 닫히면 사라지지만
 * 이 컴포넌트는 응시 화면의 도구 막대에 늘 붙어 있다. 실패하면 시트 안 그 파일 아래에 알림이 남고,
 * 그때 시트가 닫혀 있으면 화면 위쪽 알림(toast)으로도 알린다.
 */
export function MaterialsSheet({ materials, defaultOpen = false, className }: MaterialsSheetProps) {
  const t = useTranslations("exam");
  const [open, setOpen] = useState(defaultOpen);
  // load 처리기가 "지금 시트가 열려 있나"를 읽는다. 이벤트 처리기에서만 읽고 쓴다.
  const openRef = useRef(defaultOpen);
  const items = readStudentMaterialItems(materials);
  const targets = items.flatMap((item) => {
    const href = materialDownloadHref(item.url, item.fileName);
    return href ? [{ item, href }] : [];
  });

  const notifyIfClosed = useCallback(
    ({ item, href }: DownloadTarget) => {
      // 시트가 열려 있으면 목록 안의 알림으로 충분하다.
      if (openRef.current) return;
      toast.error(
        (shown) => (
          <span className="grid gap-1">
            <span className="type-field-label break-all">{item.fileName}</span>
            <span>{t("materials.downloadFailed")}</span>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("materials.openInNewTabAriaLabel", { name: item.fileName })}
              className="font-medium underline underline-offset-4"
              onClick={() => toast.dismiss(shown.id)}
            >
              {t("materials.openInNewTab")}
            </a>
          </span>
        ),
        // 같은 파일이 또 실패하면 알림을 하나로 바꿔 쓴다. 링크를 누를 시간을 준다.
        { id: `material-download-failed:${item.url}`, duration: 10_000 },
      );
    },
    [t],
  );

  const { frames, download, failedUrls } = useMaterialDownloads(targets, notifyIfClosed);

  if (items.length === 0) return null;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          openRef.current = next;
          setOpen(next);
        }}
      >
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
          <MaterialsSheetPanel items={items} failedUrls={failedUrls} onDownload={download} />
        </SheetContent>
      </Sheet>
      {/* 숨긴 내려받기 iframe(sr-only 라 도구 막대 배치에 끼지 않는다). 시트를 닫아도 남는다. */}
      {frames}
    </>
  );
}
