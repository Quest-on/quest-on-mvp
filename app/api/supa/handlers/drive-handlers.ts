import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { preferExamTitleForExamNode } from "@/lib/exam-node-title";

const supabase = getSupabaseServer();

export async function createFolder(data: { name: string; parent_id?: string | null }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get the maximum sort_order for this parent folder
    const parentId = data.parent_id || null;
    let sortQuery = supabase
      .from("exam_nodes")
      .select("sort_order")
      .eq("instructor_id", user.id);

    // Handle null parent_id (root level)
    if (parentId === null) {
      sortQuery = sortQuery.is("parent_id", null);
    } else {
      sortQuery = sortQuery.eq("parent_id", parentId);
    }

    const { data: existingNodes } = await sortQuery
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder =
      existingNodes && existingNodes.length > 0
        ? existingNodes[0].sort_order + 1
        : 0;

    const { data: folder, error } = await supabase
      .from("exam_nodes")
      .insert([
        {
          instructor_id: user.id,
          parent_id: data.parent_id || null,
          kind: "folder",
          name: data.name,
          sort_order: nextSortOrder,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return successJson({ folder });
  } catch (error) {
    logError("[createFolder] Failed to create folder", error, { path: "/api/supa/drive-handlers" });
    return errorJson("CREATE_FOLDER_FAILED", "Failed to create folder", 500);
  }
}

export async function getFolderContents(data: {
  folder_id?: string | null;
  examLimit?: number;
  examOffset?: number;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const parentId = data.folder_id || null;
    const examLimit = data.examLimit ?? 12;
    const examOffset = data.examOffset ?? 0;

    const examColumns = `
        id,
        title,
        code,
        description,
        duration,
        status,
        type,
        deadline,
        open_at,
        created_at,
        updated_at
    `;

    // 폴더 노드는 exam_id 가 없다. 여기서 inner join 을 쓰면 폴더가 통째로 사라진다.
    const folderSelectFields = `
      *,
      exams (
        ${examColumns}
      )
    `;

    // 시험 노드는 inner join 으로 좁힌다 (AC-17).
    //
    // 교수자 홈의 실제 목록은 `getInstructorExams` 가 아니라 이 쿼리다
    // (`components/instructor/InstructorHomeClient.tsx` → get_folder_contents).
    // 여기에 필터가 없으면 온보딩 데모가 목록·검색·`totalExamCount` 에 그대로
    // 나온다. 그리고 필터는 반드시 count/range 이전에 걸려야 한다 — 나중에
    // JS 로 걸러내면 페이지당 개수와 총계가 어긋난다.
    const examSelectFields = `
      *,
      exams!inner (
        ${examColumns},
        is_demo
      )
    `;

    // Always fetch all folder nodes
    let folderQuery = supabase
      .from("exam_nodes")
      .select(folderSelectFields)
      .eq("instructor_id", user.id)
      .eq("kind", "folder");
    if (parentId === null) {
      folderQuery = folderQuery.is("parent_id", null);
    } else {
      folderQuery = folderQuery.eq("parent_id", parentId);
    }
    let examQuery = supabase
      .from("exam_nodes")
      .select(examSelectFields, { count: "exact" })
      .eq("instructor_id", user.id)
      .eq("kind", "exam")
      .eq("exams.is_demo", false);
    if (parentId === null) {
      examQuery = examQuery.is("parent_id", null);
    } else {
      examQuery = examQuery.eq("parent_id", parentId);
    }

    // Stage A: folders + exams 병렬 (둘 다 독립적)
    const [folderResult, examResult] = await Promise.all([
      folderQuery.order("updated_at", { ascending: false }),
      examQuery.order("updated_at", { ascending: false }).range(examOffset, examOffset + examLimit - 1),
    ]);
    if (folderResult.error) throw folderResult.error;
    if (examResult.error) throw examResult.error;

    const folderNodes = folderResult.data || [];
    const examNodesRaw = (examResult.data || []).map(preferExamTitleForExamNode);
    const total = examResult.count ?? 0;
    const hasMoreExams = examOffset + examLimit < total;

    const folderIds = folderNodes.map((f) => f.id);
    const examIds = examNodesRaw.map((node) => node.exam_id).filter(Boolean) as string[];

    // Stage B: childCounts + sessions 병렬 (각각 Stage A 결과에 의존, 서로는 독립)
    const [childCountResult, sessionResult] = await Promise.all([
      folderIds.length > 0
        ? supabase
            .from("exam_nodes")
            // 폴더의 자식 수에서도 데모를 뺀다 (AC-17). 목록에 없는 시험이 개수에는
            // 잡히면 "3개"라고 적힌 폴더를 열었더니 2개인 상황이 된다. 자식에는
            // 폴더도 섞여 있어 inner join 을 못 쓰므로(폴더는 exams 가 없다)
            // 좌측 조인으로 받아 여기서 걸러낸다.
            .select("parent_id, exams (is_demo)")
            .in("parent_id", folderIds)
            .eq("instructor_id", user.id)
        : Promise.resolve({ data: null, error: null }),
      examIds.length > 0
        ? supabase.from("sessions").select("exam_id, student_id").in("exam_id", examIds)
        : Promise.resolve({ data: null, error: null }),
    ]);

    let foldersWithCounts = folderNodes;
    if (!childCountResult.error && childCountResult.data) {
      const countMap = new Map<string, number>();
      for (const row of childCountResult.data as Array<{
        parent_id: string;
        exams?: { is_demo?: boolean } | null;
      }>) {
        if (row.exams?.is_demo) continue;
        countMap.set(row.parent_id, (countMap.get(row.parent_id) || 0) + 1);
      }
      foldersWithCounts = foldersWithCounts.map((f) => ({
        ...f,
        child_count: countMap.get(f.id) || 0,
      }));
    }

    let examNodesWithCounts = examNodesRaw;
    if (sessionResult.error) {
      logError("Session count query error", sessionResult.error, { path: "/api/supa" });
    } else if (sessionResult.data) {
      const studentCountMap = new Map<string, Set<string>>();
      for (const session of sessionResult.data) {
        if (!session.exam_id || !session.student_id) continue;
        if (!studentCountMap.has(session.exam_id)) {
          studentCountMap.set(session.exam_id, new Set());
        }
        studentCountMap.get(session.exam_id)!.add(session.student_id);
      }
      examNodesWithCounts = examNodesWithCounts.map((node) => {
        if (node.exam_id) {
          const countSet = studentCountMap.get(node.exam_id);
          return { ...node, student_count: countSet ? countSet.size : 0 };
        }
        return node;
      });
    }

    return successJson({
      folders: foldersWithCounts,
      exams: examNodesWithCounts,
      hasMoreExams,
      totalExamCount: total,
    });
  } catch (error) {
    logError("[getFolderContents] Failed to get folder contents", error, { path: "/api/supa/drive-handlers" });
    return errorJson("GET_FOLDER_CONTENTS_FAILED", "Failed to get folder contents", 500);
  }
}

export async function getBreadcrumb(data: { folder_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Use recursive CTE to get all parent folders
    const { data: rpcData, error } = await supabase.rpc("get_breadcrumb_path", {
      folder_id: data.folder_id,
    });

    if (error) {
      // If RPC doesn't exist, use a simpler approach with multiple queries
      const breadcrumb: Array<{ id: string; name: string }> = [];
      let currentId: string | null = data.folder_id;

      while (currentId) {
        const { data: node, error: nodeError } = await supabase
          .from("exam_nodes")
          .select("id, name, parent_id")
          .eq("id", currentId)
          .eq("instructor_id", user.id)
          .single();

        if (nodeError || !node) break;

        breadcrumb.unshift({ id: node.id, name: node.name });
        currentId = node.parent_id as string | null;
      }

      return successJson({ breadcrumb });
    }

    return successJson({ breadcrumb: rpcData || [] });
  } catch (error) {
    logError("[getBreadcrumb] Failed to get breadcrumb", error, { path: "/api/supa/drive-handlers" });
    return errorJson("GET_BREADCRUMB_FAILED", "Failed to get breadcrumb", 500);
  }
}

export async function moveNode(data: {
  node_id: string;
  new_parent_id?: string | null;
  new_sort_order?: number;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const updateData: Record<string, unknown> = {};
    if (data.new_parent_id !== undefined) {
      updateData.parent_id = data.new_parent_id;
    }
    if (data.new_sort_order !== undefined) {
      updateData.sort_order = data.new_sort_order;
    }

    const { data: node, error } = await supabase
      .from("exam_nodes")
      .update(updateData)
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return successJson({ node });
  } catch (error) {
    logError("[moveNode] Failed to move node", error, { path: "/api/supa/drive-handlers" });
    return errorJson("MOVE_NODE_FAILED", "Failed to move node", 500);
  }
}

export async function updateNode(data: { node_id: string; name?: string; color?: string | null }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.color !== undefined) {
      updateData.color = data.color;
    }

    const { data: node, error } = await supabase
      .from("exam_nodes")
      .update(updateData)
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .select()
      .single();

    if (error) throw error;

    // If this is an exam node, also update the exam title
    if (node.kind === "exam" && node.exam_id && data.name) {
      await supabase
        .from("exams")
        .update({ title: data.name })
        .eq("id", node.exam_id)
        .eq("instructor_id", user.id);
    }

    return successJson({ node });
  } catch (error) {
    logError("[updateNode] Failed to update node", error, { path: "/api/supa/drive-handlers" });
    return errorJson("UPDATE_NODE_FAILED", "Failed to update node", 500);
  }
}

export async function deleteNode(data: { node_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get the node first to check if it's a folder
    const { data: node, error: fetchError } = await supabase
      .from("exam_nodes")
      .select("kind, exam_id")
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .single();

    if (fetchError) throw fetchError;

    // If it's a folder, check if it has children
    if (node.kind === "folder") {
      const { data: children, error: childrenError } = await supabase
        .from("exam_nodes")
        .select("id")
        .eq("parent_id", data.node_id)
        .eq("instructor_id", user.id);

      if (childrenError) throw childrenError;

      if (children && children.length > 0) {
        return errorJson("FOLDER_NOT_EMPTY", "Cannot delete folder with contents", 400);
      }
    }

    // Delete the node (CASCADE will handle exam deletion if needed)
    const { error: deleteError } = await supabase
      .from("exam_nodes")
      .delete()
      .eq("id", data.node_id)
      .eq("instructor_id", user.id);

    if (deleteError) throw deleteError;

    return successJson({});
  } catch (error) {
    logError("[deleteNode] Failed to delete node", error, { path: "/api/supa/drive-handlers" });
    return errorJson("DELETE_NODE_FAILED", "Failed to delete node", 500);
  }
}

export async function getInstructorDrive() {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get root level nodes (parent_id is null)
    return await getFolderContents({ folder_id: null });
  } catch (error) {
    logError("[getInstructorDrive] Failed to get instructor drive", error, { path: "/api/supa/drive-handlers" });
    return errorJson("GET_DRIVE_FAILED", "Failed to get instructor drive", 500);
  }
}
