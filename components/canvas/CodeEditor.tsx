"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { CodeLanguage } from "@/lib/types/workspace";

function EditorLoadingFallback() {
  const t = useTranslations("assignment");
  return (
    <div className="flex items-center justify-center h-full bg-muted/30 rounded-md">
      <span className="text-sm text-muted-foreground">{t("codeEditor.loading")}</span>
    </div>
  );
}

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((mod) => mod.default), {
  ssr: false,
  loading: () => <EditorLoadingFallback />,
});

interface CodeEditorProps {
  code: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({ code, language, onChange, readOnly = false }: CodeEditorProps) {
  return (
    <div className="h-full w-full overflow-hidden rounded-md border border-border">
      <MonacoEditor
        height="100%"
        language={language === "plaintext" ? "plaintext" : language}
        value={code}
        onChange={(value) => onChange(value ?? "")}
        theme="vs-dark"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 8 },
        }}
      />
    </div>
  );
}
