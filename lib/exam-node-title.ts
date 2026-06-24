export type ExamNodeTitleRow = {
  kind?: string | null;
  name?: string | null;
  exams?: {
    title?: string | null;
  } | null;
};

export function preferExamTitleForExamNode<T extends ExamNodeTitleRow>(node: T): T {
  if (
    node.kind !== "exam" ||
    !node.exams ||
    typeof node.exams.title !== "string" ||
    node.exams.title.length === 0
  ) {
    return node;
  }

  return {
    ...node,
    name: node.exams.title,
  };
}
