import { describe, it, expect } from "vitest";
import { sanitizeUserInput, stripEmoji } from "@/lib/sanitize";

describe("sanitizeUserInput", () => {
  it("returns plain text unchanged", () => {
    expect(sanitizeUserInput("Hello, world!")).toBe("Hello, world!");
  });

  it("strips <script> tags with content", () => {
    expect(sanitizeUserInput('<script>alert("xss")</script>')).toBe("");
  });

  it("strips <script> tags case-insensitive", () => {
    expect(sanitizeUserInput("<SCRIPT>alert(1)</SCRIPT>")).toBe("");
  });

  it("removes onclick event handler and strips tags", () => {
    const result = sanitizeUserInput('<div onclick="alert(1)">test</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("test");
  });

  it("removes onerror event handler", () => {
    const result = sanitizeUserInput('<img onerror="alert(1)" src="x">');
    expect(result).not.toContain("onerror");
  });

  it("strips javascript: URI from href", () => {
    const result = sanitizeUserInput(
      '<a href="javascript:alert(1)">click</a>'
    );
    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  it("removes dangerous tags like iframe", () => {
    expect(
      sanitizeUserInput('<iframe src="evil.com"></iframe>')
    ).toBe("");
  });

  it("strips CSS expression from style attribute", () => {
    const result = sanitizeUserInput(
      '<div style="width: expression(alert(1))">test</div>'
    );
    expect(result).not.toContain("expression");
    expect(result).toContain("test");
  });

  it("strips all HTML tags (plain text output only)", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeUserInput(html)).toBe("Hello world");
  });

  it("handles unicode content unchanged", () => {
    const unicode = "안녕하세요 テスト";
    expect(sanitizeUserInput(unicode)).toBe(unicode);
  });

  it("handles nested malicious payloads", () => {
    const payload = '<img src=x onerror="alert(1)"><svg onload="alert(2)">';
    const result = sanitizeUserInput(payload);
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("onload");
    expect(result).not.toContain("<");
  });

  it("handles data: URI attacks", () => {
    const result = sanitizeUserInput(
      '<a href="data:text/html,<script>alert(1)</script>">click</a>'
    );
    expect(result).not.toContain("data:");
    expect(result).toContain("click");
  });

  it("handles mutation XSS vectors", () => {
    // DOMPurify handles mutation-based XSS that regex cannot
    const result = sanitizeUserInput('<noscript><p title="</noscript><img src=x onerror=alert(1)>">');
    expect(result).not.toContain("onerror");
  });
});

describe("stripEmoji", () => {
  it("removes emoji while keeping text", () => {
    expect(stripEmoji("좋아요 ✅ 핵심만 봅니다 🎯")).toBe("좋아요  핵심만 봅니다 ");
  });

  it("removes keycap emoji sequences", () => {
    expect(stripEmoji("1️⃣ 먼저 확인")).toBe(" 먼저 확인");
  });
});
