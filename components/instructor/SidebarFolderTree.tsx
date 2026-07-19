"use client";

import { useState, memo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Folder, FolderOpen, FileText } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface FolderNode {
  id: string;
  name: string;
  kind: "folder" | "exam";
  exam_id?: string | null;
}

async function fetchFolderContents(
  folderId: string | null,
  signal?: AbortSignal
) {
  const response = await fetch("/api/supa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get_folder_contents",
      data: { folder_id: folderId },
    }),
    signal,
  });
  if (!response.ok) throw new Error("Failed to load folder contents");
  const data = await response.json();
  return [...(data.folders || []), ...(data.exams || [])] as FolderNode[];
}

const SidebarFolderNode = memo(function SidebarFolderNode({
  folder,
  userId,
}: {
  folder: FolderNode;
  userId?: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations("instructor");

  const { data: children = [], isLoading } = useQuery({
    queryKey: qk.drive.sidebarTree(folder.id, userId),
    queryFn: ({ signal }) => fetchFolderContents(folder.id, signal),
    enabled: isOpen,
    staleTime: 1000 * 60,
  });

  const subFolders = children.filter((n) => n.kind === "folder");
  const subFiles = children.filter((n) => n.kind === "exam");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <SidebarMenuItem>
        <div className="flex items-center w-full">
          <SidebarMenuButton
            className="flex-1 min-w-0"
            onClick={() => router.push(`/instructor?folder=${folder.id}`)}
          >
            {isOpen ? (
              <FolderOpen className="size-4 shrink-0" />
            ) : (
              <Folder className="size-4 shrink-0" />
            )}
            <span className="truncate">{folder.name}</span>
          </SidebarMenuButton>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "p-1 rounded-sm shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200",
                isOpen && "rotate-90"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <ChevronRight className="size-3.5" />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub>
            {isLoading && (
              <SidebarMenuSubItem>
                <span className="px-2 py-1 text-xs text-muted-foreground">
                  {t("sidebar.folderLoading")}
                </span>
              </SidebarMenuSubItem>
            )}
            {isOpen &&
              !isLoading &&
              subFiles.length === 0 &&
              subFolders.length === 0 && (
                <SidebarMenuSubItem>
                  <span className="px-2 py-1 text-xs text-muted-foreground">
                    {t("sidebar.nodeEmpty")}
                  </span>
                </SidebarMenuSubItem>
              )}
            {subFiles.map((file) => (
              <SidebarMenuSubItem key={file.id}>
                <SidebarMenuSubButton
                  onClick={() =>
                    file.exam_id && router.push(`/instructor/${file.exam_id}`)
                  }
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{file.name}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
            {subFolders.map((child) => (
              <SidebarFolderNode
                key={child.id}
                folder={child}
                userId={userId}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
});

export function SidebarFolderTree({ userId }: { userId?: string }) {
  const t = useTranslations("instructor");
  const { data: rootItems = [], isLoading } = useQuery({
    queryKey: qk.drive.sidebarTree(null, userId),
    queryFn: ({ signal }) => fetchFolderContents(null, signal),
    enabled: !!userId,
    staleTime: 1000 * 60,
  });

  const rootFolders = rootItems.filter((n) => n.kind === "folder");

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>FOLDERS</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {isLoading && (
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled
                className="text-muted-foreground text-xs"
              >
                {t("sidebar.folderLoading")}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isLoading && rootFolders.length === 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled
                className="text-muted-foreground text-xs"
              >
                {t("sidebar.folderEmpty")}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {rootFolders.map((folder) => (
            <SidebarFolderNode
              key={folder.id}
              folder={folder}
              userId={userId}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
