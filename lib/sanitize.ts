/**
 * Server-side input sanitization utilities.
 * Strips all HTML tags to prevent XSS — no jsdom dependency needed.
 */

// Remove dangerous elements AND their content (script, style, iframe, noscript, etc.)
const DANGEROUS_ELEMENTS_RE = /<(script|style|iframe|noscript|object|embed|applet|form|textarea|select|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// Self-closing dangerous elements (img, svg, etc. with no closing tag)
const DANGEROUS_VOID_RE = /<(script|style|iframe|noscript|object|embed|applet|img|svg|math|link|meta|base)\b[^>]*\/?>/gi;
// All remaining HTML tags
const HTML_TAG_RE = /<[^>]*>/g;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
  "&#47;": "/",
};

const ENTITY_RE = /&(?:amp|lt|gt|quot|#39|#x27|#x2F|#47);/g;
const EMOJI_KEYCAP_RE = /[#*0-9]\uFE0F?\u20E3/gu;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const EMOJI_JOINER_RE = /[\uFE0E\uFE0F\u200D]/g;

/** Strips all HTML tags, returning plain text only */
export function sanitizeUserInput(input: string): string {
  let result = input;
  // 1. Remove dangerous elements with their content (multiple passes for nesting)
  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result.replace(DANGEROUS_ELEMENTS_RE, "");
  }
  // 2. Remove remaining dangerous void/self-closing elements
  result = result.replace(DANGEROUS_VOID_RE, "");
  // 3. Strip all remaining HTML tags (keep text content)
  result = result.replace(HTML_TAG_RE, "");
  // 4. Decode common HTML entities
  result = result.replace(ENTITY_RE, (match) => HTML_ENTITIES[match] || match);
  return result;
}

/** Removes emoji glyphs from AI-authored text while preserving regular words and punctuation. */
export function stripEmoji(input: string): string {
  return input
    .replace(EMOJI_KEYCAP_RE, "")
    .replace(EMOJI_RE, "")
    .replace(EMOJI_JOINER_RE, "");
}
