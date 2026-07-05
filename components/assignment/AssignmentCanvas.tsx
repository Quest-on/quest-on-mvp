"use client";

import { useTranslations } from "next-intl";
import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { useEffect } from "react";
import StarterKit from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  FileText,
  Download,
  X,
  Code,
  Table2,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const lowlight = createLowlight(common);

const CODE_LANGUAGES = [
  { value: "", label: "Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
];

// Custom code block NodeView with inline language selector
function CodeBlockNodeView({ node, updateAttributes }: NodeViewProps) {
  const currentLang = node.attrs.language || "";
  const langLabel = CODE_LANGUAGES.find((l) => l.value === currentLang)?.label || "Plain Text";

  return (
    <NodeViewWrapper className="code-block-wrapper relative my-3">
      {/* Language selector overlay */}
      <div
        contentEditable={false}
        className="absolute top-2 right-2 z-10"
      >
        <select
          value={currentLang}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          className="h-6 text-[10px] font-medium rounded-md border border-white/20 bg-black/10 dark:bg-white/10 backdrop-blur-sm px-1.5 py-0 outline-none cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
      {/* Language label (left) */}
      {currentLang && (
        <div
          contentEditable={false}
          className="absolute top-2 left-3 z-10 text-[10px] font-medium text-muted-foreground/60 select-none"
        >
          {langLabel}
        </div>
      )}
      <pre className={currentLang ? "pt-8" : ""}>
        <NodeViewContent className="hljs" />
      </pre>
    </NodeViewWrapper>
  );
}

// CodeBlockLowlight with custom NodeView + case-normalized language parsing
const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
  addAttributes() {
    const parentAttrs = (this.parent?.() ?? {}) as { language?: Record<string, unknown> };
    return {
      ...parentAttrs,
      language: {
        ...(parentAttrs.language ?? {}),
        // Normalize language to lowercase so lowlight can match it
        // (AI may generate ```Python or ```JavaScript with mixed case)
        parseHTML: (element) => {
          const prefix = "language-";
          const classes = [...(element.firstElementChild?.classList ?? [])];
          const found = classes.find((c) => c.startsWith(prefix));
          return found ? found.slice(prefix.length).toLowerCase() : null;
        },
      },
    };
  },
});

interface AssignmentCanvasProps {
  content: string;
  onChange: (content: string) => void;
  isSubmitted: boolean;
  onClose: () => void;
  title: string;
  examType?: string;
}

export function AssignmentCanvas({
  content,
  onChange,
  isSubmitted,
  onClose,
  title,
}: AssignmentCanvasProps) {
  const t = useTranslations("assignment");
  const editor = useEditor({
    immediatelyRender: false,
    editable: !isSubmitted,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({
        placeholder: t("canvas.placeholder"),
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CustomCodeBlock.configure({ lowlight }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "focus:outline-none min-h-[400px] p-4 prose prose-sm dark:prose-invert max-w-none",
      },
    },
  });

  // Sync external content changes (e.g., from AI canvas_update)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      queueMicrotask(() => {
        editor.commands.setContent(content);
      });
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isSubmitted);
    }
  }, [isSubmitted, editor]);

  const handleDownloadPdf = async () => {
    const editorEl = document.querySelector(".ProseMirror");
    if (!editorEl) return;
    const canvas = await html2canvas(editorEl as HTMLElement);
    const pdf = new jsPDF("p", "mm", "a4");
    const imgData = canvas.toDataURL("image/png");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(t("canvas.pdfFilename", { title: title || t("canvas.pdfFallbackTitle") }));
  };

  // Prevent focus loss on toolbar button clicks
  const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault();

  if (!editor) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {t("canvas.loading")}
      </div>
    );
  }

  const isInCodeBlock = editor.isActive("codeBlock");
  const isInTable = editor.isActive("table");

  const activeClass = "bg-primary/10 text-primary";
  const inactiveClass = "";

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="border-b bg-background px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{t("canvas.headerLabel")}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDownloadPdf}
            className="gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Toolbar */}
      {!isSubmitted && (
        <div className="border-b bg-muted/30 px-3 py-1.5 flex flex-wrap items-center gap-0.5 shrink-0">
          {/* Text formatting */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive("bold") ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title={t("canvas.toolBold")}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive("italic") ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title={t("canvas.toolItalic")}
          >
            <Italic className="h-4 w-4" />
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Headings */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive("heading", { level: 1 }) ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title={t("canvas.toolHeading1")}
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive("heading", { level: 2 }) ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title={t("canvas.toolHeading2")}
          >
            <Heading2 className="h-4 w-4" />
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Lists */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive("bulletList") ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title={t("canvas.toolBulletList")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive("orderedList") ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title={t("canvas.toolOrderedList")}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Alignment */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive({ textAlign: "left" }) ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            title={t("canvas.toolAlignLeft")}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive({ textAlign: "center" }) ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            title={t("canvas.toolAlignCenter")}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${editor.isActive({ textAlign: "right" }) ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            title={t("canvas.toolAlignRight")}
          >
            <AlignRight className="h-4 w-4" />
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Code block */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-8 gap-1.5 px-2.5 ${isInCodeBlock ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title={t("canvas.toolCodeBlock")}
          >
            <Code className="h-3.5 w-3.5" />
            <span className="text-xs">{t("canvas.toolCodeLabel")}</span>
          </Button>

          {/* Code language selector in toolbar — visible when in code block */}
          {isInCodeBlock && (
            <select
              value={editor.getAttributes("codeBlock").language || ""}
              onChange={(e) =>
                editor.chain().focus().updateAttributes("codeBlock", { language: e.target.value }).run()
              }
              onMouseDown={preventFocusLoss}
              className="h-7 text-xs rounded-md border border-border bg-background px-2 py-0 outline-none focus:ring-1 focus:ring-primary/50"
            >
              {CODE_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          )}

          <div className="w-px h-5 bg-border mx-1" />

          {/* Table insert */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-8 gap-1.5 px-2.5 ${isInTable ? activeClass : inactiveClass}`}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title={t("canvas.toolTableInsert")}
          >
            <Table2 className="h-3.5 w-3.5" />
            <span className="text-xs">{t("canvas.toolTableLabel")}</span>
          </Button>
        </div>
      )}

      {/* Table sub-toolbar — only when cursor is in table */}
      {!isSubmitted && isInTable && (
        <div className="border-b bg-blue-50/50 dark:bg-blue-950/20 px-3 py-1 flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground mr-1.5">{t("canvas.tableEditLabel")}</span>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title={t("canvas.tableAddColumn")}
          >
            <Plus className="h-3 w-3" />
            {t("canvas.tableAddColumnLabel")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title={t("canvas.tableAddRow")}
          >
            <Plus className="h-3 w-3" />
            {t("canvas.tableAddRowLabel")}
          </Button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            title={t("canvas.tableDeleteColumn")}
          >
            <Minus className="h-3 w-3" />
            {t("canvas.tableDeleteColumnLabel")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().deleteRow().run()}
            title={t("canvas.tableDeleteRow")}
          >
            <Minus className="h-3 w-3" />
            {t("canvas.tableDeleteRowLabel")}
          </Button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            onMouseDown={preventFocusLoss}
            onClick={() => {
              editor.chain().focus().deleteTable().run();
              // Fallback: if table is the only content and deleteTable fails
              if (editor.isActive("table")) {
                editor.commands.clearContent();
              }
            }}
            title={t("canvas.tableDelete")}
          >
            <Trash2 className="h-3 w-3" />
            {t("canvas.tableDeleteLabel")}
          </Button>
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto bg-background">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
