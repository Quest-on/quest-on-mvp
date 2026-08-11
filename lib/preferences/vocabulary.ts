import { z } from "zod";

/**
 * Closed predicate vocabulary for instructor preference memory.
 * These eight predicates are the only storable observations about how an instructor assesses.
 */

export type Predicate =
  | "grading.partial_credit_mode"
  | "grading.score_precision"
  | "grading.criterion_weighting"
  | "grading.edge_case_rule"
  | "feedback.granularity"
  | "feedback.length"
  | "feedback.orientation"
  | "feedback.register";

export const PREDICATES: Predicate[] = [
  "grading.partial_credit_mode",
  "grading.score_precision",
  "grading.criterion_weighting",
  "grading.edge_case_rule",
  "feedback.granularity",
  "feedback.length",
  "feedback.orientation",
  "feedback.register",
];

export const PREDICATE_SET = new Set(PREDICATES);

/**
 * Metadata table for each predicate.
 * Carries value type, affectsScore flag, and allowed enum values (if applicable).
 */
export interface PredicateMetadata {
  predicate: Predicate;
  valueType: "enum" | "number" | "text";
  affectsScore: boolean;
  allowedValues?: string[];
}

export const PREDICATE_TABLE: Record<Predicate, PredicateMetadata> = {
  "grading.partial_credit_mode": {
    predicate: "grading.partial_credit_mode",
    valueType: "enum",
    affectsScore: true,
    allowedValues: ["none", "fixed_levels", "continuous_range", "elementwise", "pass_fail"],
  },
  "grading.score_precision": {
    predicate: "grading.score_precision",
    valueType: "number",
    affectsScore: true,
  },
  "grading.criterion_weighting": {
    predicate: "grading.criterion_weighting",
    valueType: "enum",
    affectsScore: true,
    allowedValues: ["equal", "custom"],
  },
  "grading.edge_case_rule": {
    predicate: "grading.edge_case_rule",
    valueType: "text",
    affectsScore: true,
  },
  "feedback.granularity": {
    predicate: "feedback.granularity",
    valueType: "enum",
    affectsScore: false,
    allowedValues: ["overall", "criterion", "both"],
  },
  "feedback.length": {
    predicate: "feedback.length",
    valueType: "enum",
    affectsScore: false,
    allowedValues: ["brief", "moderate", "detailed"],
  },
  "feedback.orientation": {
    predicate: "feedback.orientation",
    valueType: "enum",
    affectsScore: false,
    allowedValues: ["verdict", "corrective", "actionable"],
  },
  "feedback.register": {
    predicate: "feedback.register",
    valueType: "enum",
    affectsScore: false,
    allowedValues: ["plain", "formal", "disciplinary"],
  },
};

/**
 * Value type schemas for each predicate.
 * Maps predicate to its Zod validator.
 */
const createValueSchema = (predicate: Predicate): z.ZodType => {
  const meta = PREDICATE_TABLE[predicate];

  if (meta.valueType === "enum" && meta.allowedValues) {
    return z.enum(meta.allowedValues as [string, ...string[]]);
  } else if (meta.valueType === "number") {
    return z.number();
  } else if (meta.valueType === "text") {
    return z.string();
  }

  throw new Error(`Unknown value type for predicate ${predicate}`);
};

/**
 * Evidence object schema: sourceTable, refId, span, quote.
 */
export const evidenceSchema = z.object({
  sourceTable: z.enum(["bulk_grading_messages", "grading_chats", "derived_criteria"]),
  refId: z.string().uuid(),
  span: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).refine(
    ([start, end]) => start < end,
    {
      message: "span start must be less than end",
    }
  ),
  quote: z.string().min(1, "quote must not be empty"),
});

export type Evidence = z.infer<typeof evidenceSchema>;

/**
 * Commitment level for a candidate observation.
 */
export const commitmentSchema = z.enum(["asserted", "tentative", "hypothetical", "reported", "negated"]);
export type Commitment = z.infer<typeof commitmentSchema>;

/**
 * Candidate record: a proposed observation awaiting storage.
 * Must validate against the closed vocabulary and type constraints.
 */
export const candidateRecordSchema = z.discriminatedUnion("predicate", [
  z.object({
    predicate: z.literal("grading.partial_credit_mode"),
    value: z.enum(["none", "fixed_levels", "continuous_range", "elementwise", "pass_fail"]),
    valueText: z.string(),
    evidence: evidenceSchema,
    commitment: commitmentSchema,
    isExplicit: z.boolean(),
  }),
  z.object({
    predicate: z.literal("grading.score_precision"),
    value: z.number(),
    valueText: z.string(),
    evidence: evidenceSchema,
    commitment: commitmentSchema,
    isExplicit: z.boolean(),
  }),
  z.object({
    predicate: z.literal("grading.criterion_weighting"),
    value: z.enum(["equal", "custom"]),
    valueText: z.string(),
    evidence: evidenceSchema,
    commitment: commitmentSchema,
    isExplicit: z.boolean(),
  }),
  z.object({
    predicate: z.literal("grading.edge_case_rule"),
    value: z.string(),
    valueText: z.string(),
    evidence: evidenceSchema,
    commitment: commitmentSchema,
    isExplicit: z.boolean(),
  }),
  z.object({
    predicate: z.literal("feedback.granularity"),
    value: z.enum(["overall", "criterion", "both"]),
    valueText: z.string(),
    evidence: evidenceSchema,
    commitment: commitmentSchema,
    isExplicit: z.boolean(),
  }),
  z.object({
    predicate: z.literal("feedback.length"),
    value: z.enum(["brief", "moderate", "detailed"]),
    valueText: z.string(),
    evidence: evidenceSchema,
    commitment: commitmentSchema,
    isExplicit: z.boolean(),
  }),
  z.object({
    predicate: z.literal("feedback.orientation"),
    value: z.enum(["verdict", "corrective", "actionable"]),
    valueText: z.string(),
    evidence: evidenceSchema,
    commitment: commitmentSchema,
    isExplicit: z.boolean(),
  }),
  z.object({
    predicate: z.literal("feedback.register"),
    value: z.enum(["plain", "formal", "disciplinary"]),
    valueText: z.string(),
    evidence: evidenceSchema,
    commitment: commitmentSchema,
    isExplicit: z.boolean(),
  }),
]);

export type CandidateRecord = z.infer<typeof candidateRecordSchema>;
