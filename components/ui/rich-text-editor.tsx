"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Button } from "./button";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table as TableIcon,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Trash2,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  testId?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className = "",
  contentClassName,
  testId,
}: RichTextEditorProps) {
  const t = useTranslations("common.richTextEditor");
  const resolvedPlaceholder = placeholder ?? t("placeholder");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: resolvedPlaceholder,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          contentClassName ??
          "prose max-w-none focus:outline-none min-h-[300px] p-4",
        ...(testId ? { "data-testid": testId } : {}),
      },
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`border rounded-md ${className}`}>
      {/* Toolbar */}
      <div className="border-b bg-muted p-2 flex flex-wrap gap-1">
        {/* Text Formatting */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? "bg-accent" : ""}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? "bg-accent" : ""}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive("underline") ? "bg-accent" : ""}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Headings */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          className={
            editor.isActive("heading", { level: 1 }) ? "bg-accent" : ""
          }
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={
            editor.isActive("heading", { level: 2 }) ? "bg-accent" : ""
          }
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          className={
            editor.isActive("heading", { level: 3 }) ? "bg-accent" : ""
          }
        >
          <Heading3 className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Lists */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive("bulletList") ? "bg-accent" : ""}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive("orderedList") ? "bg-accent" : ""}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Text Alignment */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={
            editor.isActive({ textAlign: "left" }) ? "bg-accent" : ""
          }
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={
            editor.isActive({ textAlign: "center" }) ? "bg-accent" : ""
          }
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={
            editor.isActive({ textAlign: "right" }) ? "bg-accent" : ""
          }
        >
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          className={
            editor.isActive({ textAlign: "justify" }) ? "bg-accent" : ""
          }
        >
          <AlignJustify className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Table */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title={t("insertTable")}
        >
          <TableIcon className="h-4 w-4" />
        </Button>

        {editor.isActive("table") && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              title={t("addColumnBefore")}
            >
              <span className="text-xs">{t("addColumnBeforeShort")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              title={t("addColumnAfter")}
            >
              <span className="text-xs">{t("addColumnAfterShort")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().addRowBefore().run()}
              title={t("addRowBefore")}
            >
              <span className="text-xs">{t("addRowBeforeShort")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title={t("addRowAfter")}
            >
              <span className="text-xs">{t("addRowAfterShort")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().deleteColumn().run()}
              title={t("deleteColumn")}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().deleteRow().run()}
              title={t("deleteRow")}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().deleteTable().run()}
              title={t("deleteTable")}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Undo/Redo */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor Content */}
      <div className="bg-background">
        <EditorContent editor={editor} placeholder={resolvedPlaceholder} />
      </div>
    </div>
  );
}
