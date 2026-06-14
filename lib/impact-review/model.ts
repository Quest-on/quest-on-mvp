import OpenAI from "openai";
import type { ModelFinding, ProviderResult, Severity } from "./types";
import { redactForLog } from "./redact";

export interface ProviderConfig {
  name: "kimi" | "glm" | "openai";
  apiKey: string;
  baseURL?: string;
  model: string;
}

/** 최소한의 chat 인터페이스 — 테스트는 fake를 주입한다. */
export interface ChatClient {
  chat: {
    completions: {
      create(args: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        response_format?: { type: "json_object" };
      }): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}

const env = (k: string) => process.env[k]?.trim() || undefined;

/**
 * IMPACT_REVIEW_PROVIDER=auto 일 때 kimi→glm→openai 순으로 키 있는 것 선택.
 * 명시 provider면 그것만. 키 전무면 null (deterministic-only).
 */
export function selectProviders(): ProviderConfig[] {
  const mode = (env("IMPACT_REVIEW_PROVIDER") || "auto").toLowerCase();
  const candidates: Record<string, () => ProviderConfig | null> = {
    kimi: () => {
      const apiKey = env("KIMI_API_KEY") || env("MOONSHOT_API_KEY");
      return apiKey
        ? {
            name: "kimi",
            apiKey,
            baseURL: env("KIMI_BASE_URL") || "https://api.moonshot.ai/v1",
            model: env("KIMI_MODEL") || "kimi-k2.7-code",
          }
        : null;
    },
    glm: () => {
      const apiKey = env("GLM_API_KEY") || env("ZHIPU_API_KEY");
      return apiKey
        ? {
            name: "glm",
            apiKey,
            baseURL: env("GLM_BASE_URL") || "https://api.z.ai/api/paas/v4",
            model: env("GLM_MODEL") || "glm-4.6",
          }
        : null;
    },
    openai: () => {
      const apiKey = env("OPENAI_API_KEY");
      return apiKey
        ? {
            name: "openai",
            apiKey,
            baseURL: env("OPENAI_BASE_URL"),
            model: env("OPENAI_MODEL") || "gpt-5.3-chat-latest",
          }
        : null;
    },
  };

  const order = mode === "auto" ? ["kimi", "glm", "openai"] : [mode];
  const out: ProviderConfig[] = [];
  for (const name of order) {
    const make = candidates[name];
    const cfg = make?.();
    if (cfg) out.push(cfg);
  }
  return out;
}

function makeClient(cfg: ProviderConfig): ChatClient {
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL }) as unknown as ChatClient;
}

export interface ReviewModelOptions {
  /** 테스트 주입용. 없으면 selectProviders()로 실제 클라이언트 생성. */
  clientFactory?: (cfg: ProviderConfig) => ChatClient;
  providers?: ProviderConfig[];
  confidenceThreshold?: number;
}

/** 모델 2차 리뷰. 폴백/재시도/리덕션 포함. 실패해도 throw 안 함. */
export async function reviewWithModel(
  promptInput: unknown,
  opts: ReviewModelOptions = {}
): Promise<ProviderResult> {
  const providers = opts.providers ?? selectProviders();
  if (providers.length === 0) {
    return { provider: "none", model: null, skipped: true, skippedReason: "no provider key", findings: [] };
  }
  const factory = opts.clientFactory ?? makeClient;

  for (const cfg of providers) {
    const client = factory(cfg);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await client.chat.completions.create({
          model: cfg.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(promptInput) },
          ],
        });
        const content = res.choices?.[0]?.message?.content ?? "";
        return {
          provider: cfg.name,
          model: cfg.model,
          skipped: false,
          findings: parseModelFindings(content),
        };
      } catch (err) {
        const msg = redactForLog(err);
        const retryable = /\b(429|5\d\d|timeout|ECONN|rate)/i.test(msg);
        if (attempt === 0 && retryable) continue;
        // 다음 provider로 폴백.
        console.error(`[impact-review] provider ${cfg.name} failed: ${msg}`);
        break;
      }
    }
  }
  return {
    provider: "none",
    model: null,
    skipped: true,
    skippedReason: "all providers failed",
    findings: [],
  };
}

export const SYSTEM_PROMPT =
  "You are a code-change impact reviewer. Review ONLY regression and cross-file impact risk. " +
  "Do NOT report style-only issues. Do NOT remove or downgrade deterministic findings. " +
  'Return JSON only: {"findings":[{"severity":"Critical|Warning|Suggestion","confidence":0-100,' +
  '"message":string,"location":{"path":string,"line":number?},"ruleIds":string[]?,"evidence":string[]?}]}';

export function parseModelFindings(content: string): ModelFinding[] {
  let obj: unknown;
  try {
    obj = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const arr = (obj as { findings?: unknown })?.findings;
  if (!Array.isArray(arr)) return [];
  const out: ModelFinding[] = [];
  for (const raw of arr) {
    const r = raw as Record<string, unknown>;
    const severity = r.severity as Severity;
    if (severity !== "Critical" && severity !== "Warning" && severity !== "Suggestion") continue;
    let confidence = Number(r.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));
    const loc = r.location as Record<string, unknown> | undefined;
    out.push({
      source: "model",
      severity,
      confidence,
      ruleIds: Array.isArray(r.ruleIds) ? (r.ruleIds as string[]) : [],
      message: String(r.message ?? ""),
      location:
        loc && typeof loc.path === "string"
          ? { path: loc.path, line: typeof loc.line === "number" ? loc.line : undefined }
          : undefined,
      evidence: Array.isArray(r.evidence) ? (r.evidence as string[]) : undefined,
    });
  }
  return out;
}
