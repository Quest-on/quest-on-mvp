import express from "express";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------- Local OAuth/OIDC compatibility stub ----------
//
// GoTrue's built-in Google provider hard-codes accounts.google.com and ignores
// config URL overrides. Local E2E therefore routes the real Google button's
// authorize request to the configurable Keycloak adapter. These endpoints
// provide a Google-compatible test identity while still exercising the full
// browser PKCE → GoTrue authorize → provider callback → app callback chain.
const OAUTH_STUB_EMAIL = "consent-google-e2e@example.test";

app.get("/oauth/keycloak/protocol/openid-connect/auth", (req, res) => {
  const redirectUri = String(req.query.redirect_uri ?? "");
  const state = String(req.query.state ?? "");
  if (!redirectUri || !state) {
    return res.status(400).json({ error: "missing_redirect_or_state" });
  }

  const callback = new URL(redirectUri);
  callback.searchParams.set("code", "local-google-oauth-code");
  callback.searchParams.set("state", state);
  return res.redirect(302, callback.toString());
});

app.post("/oauth/keycloak/protocol/openid-connect/token", (_req, res) => {
  return res.json({
    access_token: "local-google-access-token",
    token_type: "Bearer",
    expires_in: 3600,
  });
});

app.get("/oauth/keycloak/protocol/openid-connect/userinfo", (_req, res) => {
  return res.json({
    sub: "local-google-oauth-subject",
    email: OAUTH_STUB_EMAIL,
    email_verified: true,
    name: "Consent Google E2E",
  });
});

const PORT = Number(process.env.MOCK_SERVER_PORT) || 4010;

// ---------- Error simulation middleware ----------
app.use((req, res, next) => {
  const errorMode = req.headers["x-mock-error"] as string | undefined;
  if (!errorMode) return next();

  switch (errorMode) {
    case "rate_limit":
      return res.status(429).json({
        error: { message: "Rate limit exceeded", type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
    case "server_error":
      return res.status(500).json({
        error: { message: "Internal server error", type: "server_error" },
      });
    case "timeout":
      return setTimeout(() => res.status(504).json({ error: { message: "Timeout" } }), 30_000);
    case "malformed":
      return res.status(200).send("not valid json {{{");
    default:
      return next();
  }
});

// ---------- Helpers ----------

function getSystemPrompt(body: Record<string, unknown>): string {
  const messages = body?.messages as Array<{ role: string; content: string }> | undefined;
  if (!messages) return "";
  const systemMsg = messages.find((m) => m.role === "system");
  return systemMsg?.content ?? "";
}

function chatCompletionResponse(content: string) {
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "gpt5.2-chat-latest",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

// ---------- POST /v1/chat/completions ----------
app.post("/v1/chat/completions", (req, res) => {
  const isJsonMode = req.body?.response_format?.type === "json_object";

  if (!isJsonMode) {
    const sysPrompt = getSystemPrompt(req.body);
    if (
      sysPrompt.includes("사례형 시험 문항을 채점") ||
      sysPrompt.includes("grade a case-based exam question")
    ) {
      return res.json(
        chatCompletionResponse(
          "답안은 핵심 개념을 잘 이해하고 있습니다. 논리 전개가 명확하나 일부 세부 근거가 부족합니다.\n\n**추천 점수: 85**",
        ),
      );
    }

    // Non-JSON mode: grading / feedback response
    const content = JSON.stringify({
      score: 75,
      comment: "Good understanding of core concepts with room for improvement.",
      stage_grading: {
        chat: { score: 70, reasoning: "Adequate conversation quality" },
        answer: { score: 80, reasoning: "Solid answer with minor gaps" },
      },
    });
    return res.json(chatCompletionResponse(content));
  }

  // JSON mode — route by system prompt keyword
  const sysPrompt = getSystemPrompt(req.body);

  if (sysPrompt.includes("편집 어시스턴트")) {
    // adjust-question
    return res.json(chatCompletionResponse(JSON.stringify({
      questionText: "수정된 사례형 문제: AI 기술이 의료 산업에 미치는 영향을 분석하고, 구체적인 사례를 들어 설명하시오.",
      explanation: "지시에 따라 문제를 더 구체적이고 분석적인 형태로 수정했습니다.",
    })));
  }

  if (
    sysPrompt.includes("케이스 기반 수업을 진행하는 경험 많은 교수") ||
    sysPrompt.includes("Quest-On의 채팅 기반 리서치 과제")
  ) {
    // generate-summary (case-based assignment + chat-based research)
    // 키워드는 lib/prompts.ts의 buildAssignmentGradingSummaryPrompt 등과 정합
    return res.json(chatCompletionResponse(JSON.stringify({
      sentiment: "positive",
      summary: "학생은 핵심 개념에 대한 이해도가 높으며, 논리적 전개가 우수합니다.",
      strengths: ["개념 이해도가 높음", "논리적 전개력이 우수함", "구체적 사례 활용"],
      weaknesses: ["일부 세부사항 누락", "결론 부분 보강 필요"],
      keyQuotes: ["다형성은 OOP의 핵심 원칙입니다", "상속보다 합성을 선호해야 합니다"],
    })));
  }

  if (sysPrompt.includes("전문 평가위원")) {
    // auto-grade (unified grading expects chat_score/answer_score fields)
    // Must be checked BEFORE the rubric handler because grading prompts also contain "루브릭"
    return res.json(chatCompletionResponse(JSON.stringify({
      chat_score: 70,
      chat_comment: "Adequate conversation quality with good questions asked.",
      answer_score: 80,
      answer_comment: "Solid answer with minor gaps in explanation.",
      overall_comment: "Good understanding of core concepts with room for improvement.",
      rubric_scores: {},
      sentiment: "positive",
      summary: "학생은 핵심 개념에 대한 이해도가 높으며, 논리적 전개가 우수합니다.",
      strengths: ["개념 이해도가 높음", "논리적 전개력이 우수함"],
      weaknesses: ["일부 세부사항 누락"],
      keyQuotes: ["다형성은 OOP의 핵심 원칙입니다", "상속보다 합성을 선호해야 합니다"],
    })));
  }

  // True/False (O·X) objective question generation/adjustment.
  // Must be checked BEFORE the MCQ and "출제 전문가" handlers because the TF
  // prompt also contains "출제 전문가" and "객관식 문제" 같은 키워드가 겹친다.
  if (
    sysPrompt.includes("O·X(참/거짓) 문제") ||
    sysPrompt.includes("True/False (O·X)")
  ) {
    return res.json(chatCompletionResponse(JSON.stringify({
      questions: [
        {
          text: "다형성(polymorphism)은 객체지향 프로그래밍의 핵심 원칙 중 하나이다.",
          type: "true-false",
          options: ["O", "X"],
          correctOptionIndex: 0,
          rationale: "다형성은 OOP의 4대 원칙(캡슐화, 상속, 다형성, 추상화) 중 하나로 분류된다.",
        },
      ],
    })));
  }

  // 4-option multiple choice generation/adjustment.
  if (
    sysPrompt.includes("4지선다 객관식 문제") ||
    sysPrompt.includes("4-option multiple-choice")
  ) {
    return res.json(chatCompletionResponse(JSON.stringify({
      questions: [
        {
          text: "다음 중 객체지향 프로그래밍의 핵심 원칙이 아닌 것은?",
          type: "multiple-choice",
          options: ["캡슐화", "상속", "다형성", "정규화"],
          correctOptionIndex: 3,
          rationale: "정규화는 데이터베이스 설계 원칙이며, OOP의 4대 원칙은 캡슐화·상속·다형성·추상화이다.",
        },
      ],
    })));
  }

  if (sysPrompt.includes("출제 전문가")) {
    // generate-questions (case question generation)
    return res.json(chatCompletionResponse(JSON.stringify({
      questions: [
        {
          text: "Explain the concept of polymorphism in Object-Oriented Programming with examples.",
          type: "essay",
        },
        {
          text: "Compare and contrast inheritance and composition. When would you use each?",
          type: "essay",
        },
      ],
    })));
  }

  // Default: question generation
  return res.json(chatCompletionResponse(JSON.stringify({
    questions: [
      {
        text: "Explain the concept of polymorphism in Object-Oriented Programming with examples.",
        type: "essay",
      },
      {
        text: "Compare and contrast inheritance and composition. When would you use each?",
        type: "essay",
      },
    ],
  })));
});

// ---------- POST /v1/responses ----------
app.post("/v1/responses", (req, res) => {
  const responseId = `resp-mock-${Date.now()}`;
  const mockText = "This is a mock AI response for testing. The concept involves understanding the fundamental principles discussed in class.";

  if (req.body?.stream === true) {
    // SSE streaming mode
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send text in chunks
    const chunks = mockText.match(/.{1,20}/g) || [mockText];
    for (const chunk of chunks) {
      res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: chunk })}\n\n`);
    }

    // Send completed event
    const completedResponse = {
      id: responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      // 이슈 #118: 요청 모델을 그대로 반향한다. 고정값이면 "이벤트에 기록된
      // 모델 == 프로필이 요청한 모델" 을 검증할 수 없어 관측 테스트가 무의미해진다.
      model: (req.body?.model as string) ?? "gpt5.2-chat-latest",
      status: "completed",
      output: [
        {
          type: "message",
          id: `msg-mock-${Date.now()}`,
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: mockText, annotations: [] }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    };
    res.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: completedResponse })}\n\n`);
    res.end();
    return;
  }

  // Non-streaming JSON response
  res.json({
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: "gpt5.2-chat-latest",
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [
      {
        type: "message",
        id: `msg-mock-${Date.now()}`,
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: mockText,
            annotations: [],
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  });
});

// ---------- POST /v1/embeddings ----------
app.post("/v1/embeddings", (req, res) => {
  const input = req.body.input;
  const inputs = Array.isArray(input) ? input : [input];

  res.json({
    object: "list",
    data: inputs.map((_: unknown, i: number) => ({
      object: "embedding",
      index: i,
      embedding: Array.from({ length: 1536 }, () =>
        Number((Math.random() * 2 - 1).toFixed(6))
      ),
    })),
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 10, total_tokens: 10 },
  });
});

// ---------- Health check ----------
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ---------- Catch-all for unhandled routes ----------
app.all("/{*path}", (req, res) => {
  console.warn(`[mock-server] Unhandled: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Not found in mock server" });
});

app.listen(PORT, () => {
  // This message is checked by global-setup.ts
  console.log(`Mock server listening on port ${PORT}`);
});
