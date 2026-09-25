"use client";

/**
 * AgentPanelProvider — AI 에이전트 우측 사이드바 패널의 열림 상태를 전역으로 관리.
 *
 * - open 상태를 localStorage("agent-panel-open")에 동기화 (초기값 false).
 * - 데스크톱 레이아웃의 gap-div/fixed-panel 제어에 사용.
 * - 모바일에선 Sheet 오버레이로 전환 (본문 reflow 없음).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
// AgentRunPhase 타입만 참조 — 구현은 AgentRunController에 있음
export type { AgentRunPhase } from "@/components/agent/AgentRunController";

const LS_KEY = "agent-panel-open";

interface AgentPanelContextValue {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  /** 에이전트가 아닌 다른 우측 드로어가 FAB 자리(우하단)를 쓰는 중이다. */
  cornerClaimed: boolean;
  /** 우하단을 점유한다. 돌려받은 함수를 부르면 놓는다. */
  claimCorner: () => () => void;
}

/**
 * FAB 을 숨길지 — 에이전트 패널이 열렸거나, 다른 우측 드로어가 우하단을 쓰는 중이면.
 *
 * 두 번째 조건이 없어서 CASE AI 가채점 패널의 전송 버튼을 FAB 이 덮었다(#495).
 */
export function shouldHideAgentFab(state: {
  panelOpen: boolean;
  cornerClaimed: boolean;
}): boolean {
  return state.panelOpen || state.cornerClaimed;
}

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null);

export function AgentPanelProvider({ children }: { children: ReactNode }) {
  // 초기값은 항상 false — SSR HTML과 클라이언트 첫 렌더가 일치해야 한다.
  // useState initializer 에서 localStorage 를 읽으면 SSR(false) ↔ CSR(true)
  // hydration mismatch 가 발생하므로, 마운트 후 effect 에서 1회 동기화한다.
  const [open, _setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(LS_KEY) === "true") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 localStorage 동기화
        _setOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const setOpen = useCallback((value: boolean) => {
    _setOpen(value);
    try {
      localStorage.setItem(LS_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  // 여러 드로어가 겹쳐 열릴 수 있으니 불리언이 아니라 점유 수를 센다.
  const [cornerClaims, setCornerClaims] = useState(0);
  const claimCorner = useCallback(() => {
    setCornerClaims((n) => n + 1);
    return () => setCornerClaims((n) => Math.max(0, n - 1));
  }, []);

  return (
    <AgentPanelContext.Provider
      value={{ open, toggle, setOpen, cornerClaimed: cornerClaims > 0, claimCorner }}
    >
      {children}
    </AgentPanelContext.Provider>
  );
}

export function useAgentPanel(): AgentPanelContextValue {
  const ctx = useContext(AgentPanelContext);
  if (!ctx) {
    throw new Error(
      "useAgentPanel() 은 <AgentPanelProvider> 하위에서만 사용할 수 있습니다.",
    );
  }
  return ctx;
}

/**
 * AgentPanelProvider 바깥에서도 안전하게 호출할 수 있는 variant.
 * context가 없으면 null 반환 — 조건부 렌더링에 사용.
 */
export function useAgentPanelOptional(): AgentPanelContextValue | null {
  return useContext(AgentPanelContext);
}

/**
 * 우측 전체를 덮는 드로어가 열려 있는 동안 에이전트 FAB 을 비키게 한다.
 * Provider 바깥에서 불려도 아무 일도 하지 않는다.
 */
export function useClaimAgentCorner(active: boolean): void {
  const claimCorner = useContext(AgentPanelContext)?.claimCorner;
  useEffect(() => {
    if (!active || !claimCorner) return;
    return claimCorner();
  }, [active, claimCorner]);
}
