import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { preferExamTitleForExamNode } from "@/lib/exam-node-title";

const REPO_ROOT = path.resolve(__dirname, "..");

describe("exam node title sync", () => {
  it("uses exams.title as the canonical display name for exam nodes", () => {
    const node = preferExamTitleForExamNode({
      id: "node-1",
      kind: "exam",
      name: "Old title",
      exams: { title: "Updated title" },
    });

    expect(node.name).toBe("Updated title");
  });

  it("does not rewrite folder names", () => {
    const node = preferExamTitleForExamNode({
      id: "folder-1",
      kind: "folder",
      name: "Folder",
      exams: { title: "Exam title" },
    });

    expect(node.name).toBe("Folder");
  });

  it("keeps update_exam and exam_nodes.name in sync when title changes", () => {
    const source = readFileSync(
      path.join(REPO_ROOT, "app/api/supa/handlers/exam-handlers.ts"),
      "utf8"
    );
    const updateExamBody = source.slice(
      source.indexOf("export async function updateExam"),
      source.indexOf("export async function getExam")
    );

    expect(updateExamBody).toContain('typeof updateWithoutRubric.title === "string"');
    expect(updateExamBody).toContain('.from("exam_nodes")');
    expect(updateExamBody).toContain("name: updateWithoutRubric.title");
    expect(updateExamBody).toContain('.eq("exam_id", data.id)');
    expect(updateExamBody).toContain('.eq("kind", "exam")');
  });
});
