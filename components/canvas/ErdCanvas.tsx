"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TableNode } from "./TableNode";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { ErdNode, ErdEdge, ErdState } from "@/lib/types/workspace";

const nodeTypes = { table: TableNode };

interface ErdCanvasProps {
  initialState: ErdState;
  onChange: (state: ErdState) => void;
  readOnly?: boolean;
}

/** Convert our ErdNode type to React Flow Node */
function toFlowNodes(erdNodes: ErdNode[]): Node[] {
  return erdNodes.map((n) => ({
    id: n.id,
    type: "table",
    position: n.position,
    data: n.data,
  }));
}

/** Convert our ErdEdge type to React Flow Edge */
function toFlowEdges(erdEdges: ErdEdge[]): Edge[] {
  return erdEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: "hsl(var(--primary))" },
  }));
}

/** Convert React Flow nodes back to our ErdNode type */
function fromFlowNodes(nodes: Node[]): ErdNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: "table" as const,
    position: n.position,
    data: n.data as ErdNode["data"],
  }));
}

/** Convert React Flow edges back to our ErdEdge type */
function fromFlowEdges(edges: Edge[]): ErdEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: typeof e.label === "string" ? e.label : undefined,
  }));
}

export function ErdCanvas({ initialState, onChange, readOnly = false }: ErdCanvasProps) {
  const t = useTranslations("assignment");
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initialState.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initialState.edges));

  const emitChange = useCallback(
    (updatedNodes: Node[], updatedEdges: Edge[]) => {
      onChange({
        nodes: fromFlowNodes(updatedNodes),
        edges: fromFlowEdges(updatedEdges),
      });
    },
    [onChange]
  );

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Use setTimeout to get the updated state after React processes the change
      setTimeout(() => {
        setNodes((current) => {
          emitChange(current, edges);
          return current;
        });
      }, 0);
    },
    [onNodesChange, setNodes, edges, emitChange]
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      setTimeout(() => {
        setEdges((current) => {
          emitChange(nodes, current);
          return current;
        });
      }, 0);
    },
    [onEdgesChange, setEdges, nodes, emitChange]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge(
          { ...params, animated: true, style: { stroke: "hsl(var(--primary))" } },
          eds
        );
        emitChange(nodes, newEdges);
        return newEdges;
      });
    },
    [setEdges, nodes, emitChange]
  );

  const addTable = useCallback(() => {
    const newNode: Node = {
      id: `table-${Date.now()}`,
      type: "table",
      position: { x: Math.random() * 400 + 50, y: Math.random() * 300 + 50 },
      data: {
        tableName: "new_table",
        columns: [
          { name: "id", type: "INT", isPrimary: true },
        ],
      },
    };
    setNodes((nds) => {
      const updated = [...nds, newNode];
      emitChange(updated, edges);
      return updated;
    });
  }, [setNodes, edges, emitChange]);

  const deleteSelected = useCallback(() => {
    setNodes((nds) => {
      const remaining = nds.filter((n) => !n.selected);
      setEdges((eds) => {
        const remainingEdges = eds.filter((e) => !e.selected);
        emitChange(remaining, remainingEdges);
        return remainingEdges;
      });
      return remaining;
    });
  }, [setNodes, setEdges, emitChange]);

  return (
    <div className="h-full w-full flex flex-col">
      {!readOnly && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-card/50">
          <Button type="button" variant="outline" size="sm" onClick={addTable} className="h-7 gap-1 text-xs">
            <Plus className="w-3 h-3" />
            {t("erdCanvas.addTable")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={deleteSelected} className="h-7 gap-1 text-xs">
            <Trash2 className="w-3 h-3" />
            {t("erdCanvas.deleteSelected")}
          </Button>
        </div>
      )}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={readOnly ? undefined : handleNodesChange}
          onEdgesChange={readOnly ? undefined : handleEdgesChange}
          onConnect={readOnly ? undefined : onConnect}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
