"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { internalCopyScope } from "@/lib/internal-copy";

/**
 * 시험 응시 화면의 내부 복사 범위(#560). 값은 세션 id 에서 만든 범위이고, 이 Provider 밖(시험 밖 화면)은 null 이다.
 * 복사 버튼은 범위가 있을 때만 표식을 붙이고, 답안 칸은 같은 범위의 표식만 내부 복사로 인정한다.
 */
const InternalCopyScopeContext = createContext<string | null>(null);

export function InternalCopyScopeProvider({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: ReactNode;
}) {
  const scope = useMemo(() => (sessionId ? internalCopyScope(sessionId) : null), [sessionId]);
  return (
    <InternalCopyScopeContext.Provider value={scope}>{children}</InternalCopyScopeContext.Provider>
  );
}

/** 지금 화면의 내부 복사 범위. 시험 응시 화면 밖이면 null. */
export function useInternalCopyScope(): string | null {
  return useContext(InternalCopyScopeContext);
}
