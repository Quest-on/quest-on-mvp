"use client";

import { useTranslations } from "next-intl";

/**
 * 삭제·초기화가 실제로 무슨 일을 하는지 있는 그대로 말하는 블록.
 *
 * 서버의 DELETE 는 지우는 게 아니라 보관(archive) 이다. 완전 삭제인 것처럼 쓴 문구는
 * "지웠는데 다시 나타났다" 로 돌아오고, 그 한 번이 메모리 기능의 신뢰를 끝낸다.
 * 그래서 네 문장을 항상 같이 보여 준다: 사용 중단 · 원본 로그 존치 · 재학습 없음 · 성적 근거 보존.
 */
export type MemoryDisclosureVariant = "record" | "reset";

const KEYS: Record<MemoryDisclosureVariant, {
  stopsUse: string;
  logsRemain: string;
  evidenceKept: string;
  notErasure: string;
}> = {
  record: {
    stopsUse: "delete.stopsUse",
    logsRemain: "delete.logsRemain",
    evidenceKept: "delete.evidenceKept",
    notErasure: "delete.notErasure",
  },
  reset: {
    stopsUse: "controls.reset.confirmStopsUse",
    logsRemain: "controls.reset.confirmLogsRemain",
    evidenceKept: "controls.reset.confirmEvidenceKept",
    notErasure: "controls.reset.confirmNotErasure",
  },
};

export function MemoryDeletionDisclosure({
  variant,
}: {
  variant: MemoryDisclosureVariant;
}) {
  const t = useTranslations("instructor.memory");
  const keys = KEYS[variant];

  return (
    <div className="space-y-3 text-sm" data-testid="memory-deletion-disclosure">
      <ul className="space-y-2 rounded-md border border-border bg-muted/50 p-3 text-foreground">
        <li className="flex gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            &middot;
          </span>
          <span>{t(keys.stopsUse)}</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            &middot;
          </span>
          <span>{t(keys.logsRemain)}</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            &middot;
          </span>
          <span>{t(keys.evidenceKept)}</span>
        </li>
      </ul>
      <p className="font-medium text-destructive">{t(keys.notErasure)}</p>
    </div>
  );
}
