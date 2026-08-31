import { getSupabaseServer } from "@/lib/supabase-server";

export type SchemaAudit = {
  missingTables: string[];
  missingColumns: string[];
  missingFunctions: string[];
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const REQUIRED_TABLES = [
  "ai_config_labels",
  "ai_config_versions",
  "ai_events",
  "onboarding_events",
  "plan_limits",
] as const;

const REQUIRED_COLUMNS = [
  { table: "ai_events", columns: ["config_version"] },
  { table: "exams", columns: ["is_demo", "first_published_at"] },
  { table: "profiles", columns: ["plan"] },
] as const;

const REQUIRED_FUNCTIONS = [
  {
    name: "admit_exam_session",
    args: {
      p_exam_id: NIL_UUID,
      p_student_id: "",
      p_status: "",
      p_fingerprint: "",
    },
  },
  {
    name: "increment_student_count",
    args: { p_exam_id: NIL_UUID },
  },
] as const;

type SchemaError = { code?: string; message?: string };

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as SchemaError).code === code
  );
}

function errorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const message = (error as SchemaError).message;
  return typeof message === "string" ? message.toLowerCase() : "";
}

function isMissingTableError(error: unknown): boolean {
  return hasErrorCode(error, "PGRST205") || hasErrorCode(error, "42P01");
}

function isMissingColumnError(error: unknown): boolean {
  return hasErrorCode(error, "PGRST204") || hasErrorCode(error, "42703");
}

async function auditColumns(
  supabase: ReturnType<typeof getSupabaseServer>,
  table: string,
  columns: readonly string[]
): Promise<string[]> {
  const { error } = await supabase.from(table).select(columns.join(", ")).limit(0);
  if (!error) return [];
  if (!isMissingColumnError(error)) throw error;

  const message = errorMessage(error);
  const namedColumns = columns.filter((column) => message.includes(column.toLowerCase()));
  if (namedColumns.length > 0) {
    return namedColumns.map((column) => `${table}.${column}`);
  }

  // PostgREST 오류가 컬럼명을 생략한 경우에도 정확한 누락 항목만 드러내기 위해 재확인한다.
  const results = await Promise.all(
    columns.map(async (column) => {
      const { error: columnError } = await supabase.from(table).select(column).limit(0);
      if (!columnError) return null;
      if (isMissingColumnError(columnError)) return `${table}.${column}`;
      throw columnError;
    })
  );
  return results.filter((column): column is string => column !== null);
}

export async function auditSchema(): Promise<SchemaAudit> {
  const supabase = getSupabaseServer();

  const [tables, columns, functions] = await Promise.all([
    Promise.all(
      REQUIRED_TABLES.map(async (table): Promise<string | null> => {
        const { error } = await supabase.from(table).select("*").limit(0);
        if (!error) return null;
        if (isMissingTableError(error)) return table;
        throw error;
      })
    ),
    Promise.all(
      REQUIRED_COLUMNS.map(({ table, columns }) => auditColumns(supabase, table, columns))
    ),
    Promise.all(
      REQUIRED_FUNCTIONS.map(async ({ name, args }): Promise<string | null> => {
        const { error } = await supabase.rpc(name, args);
        if (!error) return null;
        if (hasErrorCode(error, "PGRST202")) return name;
        throw error;
      })
    ),
  ]);

  return {
    missingTables: tables.filter((table): table is string => table !== null),
    missingColumns: columns.flat(),
    missingFunctions: functions.filter((name): name is string => name !== null),
  };
}

export function isSchemaAuditHealthy(audit: SchemaAudit): boolean {
  return (
    audit.missingTables.length === 0 &&
    audit.missingColumns.length === 0 &&
    audit.missingFunctions.length === 0
  );
}
