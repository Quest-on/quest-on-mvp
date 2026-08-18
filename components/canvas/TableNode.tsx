"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { Handle, Position } from "@xyflow/react";
import type { ErdColumn } from "@/lib/types/workspace";

interface TableNodeData {
  tableName: string;
  columns: ErdColumn[];
}

function TableNodeComponent({ data }: { data: TableNodeData }) {
  const t = useTranslations("assignment");
  return (
    <div className="rounded-lg border-2 border-border bg-card shadow-md min-w-[200px]">
      {/* Table header */}
      <div className="bg-primary/10 px-3 py-2 rounded-t-lg border-b border-border">
        <span className="text-sm font-bold text-primary">{data.tableName}</span>
      </div>

      {/* Columns */}
      <div className="divide-y divide-border">
        {data.columns.map((col, idx) => (
          <div
            key={`${col.name}-${idx}`}
            className="flex items-center gap-2 px-3 py-1.5 text-xs"
          >
            {col.isPrimary && (
              <span className="text-warning-text font-bold" title="Primary Key">PK</span>
            )}
            {col.isForeignKey && (
              <span className="text-info-text font-bold" title="Foreign Key">FK</span>
            )}
            <span className="font-medium">{col.name}</span>
            <span className="text-muted-foreground ml-auto">{col.type}</span>
          </div>
        ))}
        {data.columns.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground italic">
            {t("tableNode.noColumns")}
          </div>
        )}
      </div>

      {/* Handles for edges */}
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
