"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { CodeEditor } from "./CodeEditor";
import { ErdCanvas } from "./ErdCanvas";
import type {
  WorkspaceState,
  CanvasConfig,
  ErdState,
  CodeLanguage,
} from "@/lib/types/workspace";

interface HybridWorkspaceProps {
  workspaceState: WorkspaceState;
  canvasConfig: CanvasConfig;
  onWorkspaceChange: (state: WorkspaceState) => void;
  readOnly?: boolean;
  chatPanel: React.ReactNode;
}

export function HybridWorkspace({
  workspaceState,
  canvasConfig,
  onWorkspaceChange,
  readOnly = false,
  chatPanel,
}: HybridWorkspaceProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitChange = useCallback(
    (partial: Partial<WorkspaceState>) => {
      // Debounce updates to prevent excessive re-renders
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onWorkspaceChange({
          ...workspaceState,
          ...partial,
          lastUpdated: new Date().toISOString(),
        });
      }, 300);
    },
    [workspaceState, onWorkspaceChange]
  );

  const handleCodeChange = useCallback(
    (code: string) => emitChange({ code }),
    [emitChange]
  );

  const handleErdChange = useCallback(
    (erd: ErdState) => emitChange({ erd }),
    [emitChange]
  );

  const t = useTranslations("assignment");
  const showCode = canvasConfig.codeEnabled !== false;
  const showErd = canvasConfig.erdEnabled !== false;
  const isHybrid = showCode && showErd && canvasConfig.secondaryCanvas;

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Left: AI Chat Panel */}
      <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
        {chatPanel}
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right: Workspace Panels */}
      <ResizablePanel defaultSize={65} minSize={40}>
        {isHybrid ? (
          /* Dual view: Code on top, ERD on bottom */
          <ResizablePanelGroup direction="vertical" className="h-full">
            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("hybridWorkspace.codeLabel", { language: workspaceState.language })}
                  </span>
                  {!readOnly && (
                    <select
                      value={workspaceState.language}
                      onChange={(e) =>
                        emitChange({ language: e.target.value as CodeLanguage })
                      }
                      className="ml-auto text-xs rounded border border-border bg-background px-2 py-0.5"
                    >
                      <option value="sql">SQL</option>
                      <option value="python">Python</option>
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="java">Java</option>
                      <option value="c">C</option>
                      <option value="cpp">C++</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="plaintext">Plain Text</option>
                    </select>
                  )}
                </div>
                <div className="flex-1">
                  <CodeEditor
                    code={workspaceState.code}
                    language={workspaceState.language}
                    onChange={handleCodeChange}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="h-full flex flex-col">
                <div className="px-3 py-1.5 border-b border-border bg-card/50">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("hybridWorkspace.erdLabel")}
                  </span>
                </div>
                <div className="flex-1">
                  <ErdCanvas
                    initialState={workspaceState.erd}
                    onChange={handleErdChange}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : showCode ? (
          /* Code only */
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("hybridWorkspace.codeLabel", { language: workspaceState.language })}
              </span>
              {!readOnly && (
                <select
                  value={workspaceState.language}
                  onChange={(e) =>
                    emitChange({ language: e.target.value as CodeLanguage })
                  }
                  className="ml-auto text-xs rounded border border-border bg-background px-2 py-0.5"
                >
                  <option value="sql">SQL</option>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="java">Java</option>
                  <option value="c">C</option>
                  <option value="cpp">C++</option>
                  <option value="go">Go</option>
                  <option value="rust">Rust</option>
                  <option value="plaintext">Plain Text</option>
                </select>
              )}
            </div>
            <div className="flex-1">
              <CodeEditor
                code={workspaceState.code}
                language={workspaceState.language}
                onChange={handleCodeChange}
                readOnly={readOnly}
              />
            </div>
          </div>
        ) : showErd ? (
          /* ERD only */
          <div className="h-full flex flex-col">
            <div className="px-3 py-1.5 border-b border-border bg-card/50">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("hybridWorkspace.erdLabel")}
              </span>
            </div>
            <div className="flex-1">
              <ErdCanvas
                initialState={workspaceState.erd}
                onChange={handleErdChange}
                readOnly={readOnly}
              />
            </div>
          </div>
        ) : null}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
