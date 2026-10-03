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

// ── Student chat message sanitizer (#523) ───────────────────────────────────────
//
// The three removal stages below (dangerous elements with content, dangerous void tags, any
// tag-shaped text) are the same rules as the regexes above, restricted to tag-shaped text, but
// written as left-to-right scans. `/<[^>]*>/`-style regexes rescan to the end of the input from
// every `<` that has no `>` after it, which is quadratic, and repeating them until the text stops
// changing multiplied that by the number of rounds (9-14 s for 10,000 characters). `/api/chat`
// validates the message before authentication and rate limiting, so that was reachable by anyone.
// Each scan below is O(n): it only ever moves forward, and a `<` with no `>` after it ends the scan.

/** Keep in sync with DANGEROUS_ELEMENTS_RE. */
const DANGEROUS_ELEMENT_NAMES: ReadonlySet<string> = new Set([
  "script", "style", "iframe", "noscript", "object", "embed", "applet", "form", "textarea", "select", "button",
]);
/** Keep in sync with DANGEROUS_VOID_RE. */
const DANGEROUS_VOID_NAMES: ReadonlySet<string> = new Set([
  "script", "style", "iframe", "noscript", "object", "embed", "applet", "img", "svg", "math", "link", "meta", "base",
]);

/**
 * Upper bound on removal rounds in `sanitizeChatMessage`. A normal message needs two: one that removes
 * its tags and one that confirms nothing is left. Only input built to be peeled one layer at a time
 * (`<<<b>b>b>img ...`) needs more.
 */
export const CHAT_SANITIZE_MAX_PASSES = 5;

const isAsciiLetter = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
/** `\w` without the unicode and ignore-case folding surprises: [A-Za-z0-9_]. */
const isNameChar = (c: number): boolean => isAsciiLetter(c) || (c >= 48 && c <= 57) || c === 95;
/**
 * The character after `<` that makes an HTML5 tokenizer start a tag (ASCII letter), an end tag (`/`),
 * a declaration or comment (`!`), or a processing instruction (`?`). After any other character
 * (space, digit, `=`, `>`, Hangul, ...) the `<` is plain text.
 */
const isTagStart = (c: number): boolean => isAsciiLetter(c) || c === 47 /* / */ || c === 33 /* ! */ || c === 63 /* ? */;

/** Lower-cased run of name characters starting at `from` (what `\b` after the name would end). */
function readName(s: string, from: number): string {
  let end = from;
  while (end < s.length && isNameChar(s.charCodeAt(end))) end++;
  return s.slice(from, end).toLowerCase();
}

const closeTagRes = new Map<string, RegExp>();
/** `</name\s*>`, case-insensitive. The regex is shared; callers set `lastIndex` before `exec`. */
function closeTagRe(name: string): RegExp {
  let re = closeTagRes.get(name);
  if (!re) {
    re = new RegExp(`</${name}\\s*>`, "gi");
    closeTagRes.set(name, re);
  }
  return re;
}

/**
 * Same result as `s.replace(DANGEROUS_ELEMENTS_RE, "")`: removes `<name ...>` through the first
 * `</name>` for the dangerous element names. If no `</name>` exists after an opening tag, none exists
 * after any later one either, so that name is not searched again.
 */
function removeDangerousElements(s: string): string {
  const lastGt = s.lastIndexOf(">");
  const noClose = new Set<string>();
  const pieces: string[] = [];
  let copyFrom = 0;
  let lt = s.indexOf("<");
  while (lt !== -1 && lt < lastGt) {
    if (isAsciiLetter(s.charCodeAt(lt + 1))) {
      const name = readName(s, lt + 1);
      if (DANGEROUS_ELEMENT_NAMES.has(name) && !noClose.has(name)) {
        const openEnd = s.indexOf(">", lt + 1); // exists: lt < lastGt
        const closeRe = closeTagRe(name);
        closeRe.lastIndex = openEnd + 1;
        const close = closeRe.exec(s);
        if (close) {
          pieces.push(s.slice(copyFrom, lt));
          copyFrom = close.index + close[0].length;
          lt = s.indexOf("<", copyFrom);
          continue;
        }
        noClose.add(name);
      }
    }
    lt = s.indexOf("<", lt + 1);
  }
  if (copyFrom === 0) return s;
  pieces.push(s.slice(copyFrom));
  return pieces.join("");
}

/**
 * Same result as `s.replace(/<(?=[A-Za-z/!?])[^>]*>/g, "")` (every tag-shaped span up to the first
 * `>`, newlines included). With `onlyNames`, same as `DANGEROUS_VOID_RE`: only spans whose tag name is
 * in the set.
 */
function removeTagSpans(s: string, onlyNames?: ReadonlySet<string>): string {
  const lastGt = s.lastIndexOf(">");
  const pieces: string[] = [];
  let copyFrom = 0;
  let lt = s.indexOf("<");
  while (lt !== -1 && lt < lastGt) {
    const next = s.charCodeAt(lt + 1);
    const matches =
      isTagStart(next) &&
      (onlyNames === undefined || (isAsciiLetter(next) && onlyNames.has(readName(s, lt + 1))));
    if (matches) {
      const gt = s.indexOf(">", lt + 1); // exists: lt < lastGt
      pieces.push(s.slice(copyFrom, lt));
      copyFrom = gt + 1;
      lt = s.indexOf("<", copyFrom);
    } else {
      lt = s.indexOf("<", lt + 1);
    }
  }
  if (copyFrom === 0) return s;
  pieces.push(s.slice(copyFrom));
  return pieces.join("");
}

/** One round: dangerous elements with content, then dangerous void tags, then any tag-shaped text. */
function removeChatTagsOnce(s: string): string {
  return removeTagSpans(removeTagSpans(removeDangerousElements(s), DANGEROUS_VOID_NAMES));
}

/**
 * Sanitizer for student chat messages (`/api/chat` `message`).
 *
 * `sanitizeUserInput` treats everything between `<` and `>` as a tag, so a comparison like
 * `income < 3000 and age > 40` loses the text in the middle (#523). Chat messages are only
 * ever rendered as React text (or through react-markdown without raw HTML), never as HTML,
 * so this variant removes tag-shaped text only (`<` followed by a letter, `/`, `!` or `?`, up to
 * the next `>`, line breaks included). Everything else is kept verbatim.
 *
 * Removing a tag can splice its neighbours into a new one (`<<b>img src=x onerror=1>` becomes
 * `<img src=x onerror=1>`), so the removal repeats until the text stops changing. That takes one
 * round per layer, so the rounds are capped at `CHAT_SANITIZE_MAX_PASSES`; a message that has not
 * settled by then is hostile and is handled by the strict `sanitizeUserInput` instead (which removes
 * everything between `<` and `>` and needs no repetition). Cost is O(n) per round.
 *
 * What it guarantees: for input without HTML entities, the result contains no tag-shaped text.
 * Entity decoding comes after tag removal, exactly as in `sanitizeUserInput`, so an entity-encoded
 * tag (`&lt;img src=x onerror=1&gt;`) is decoded into text that looks like a tag, same as before.
 * That text is harmless only because every place that shows a chat message renders it as text.
 *
 * Known limits: tag-looking input typed by a student (`<NA>`, `<b>`, `x<y and y>z`) is removed, and
 * a `<` directly followed by a letter removes everything up to the next `>`, across lines.
 */
export function sanitizeChatMessage(input: string): string {
  let result = input;
  for (let pass = 0; pass < CHAT_SANITIZE_MAX_PASSES; pass++) {
    const next = removeChatTagsOnce(result);
    if (next === result) {
      return result.replace(ENTITY_RE, (match) => HTML_ENTITIES[match] || match);
    }
    result = next;
  }
  return sanitizeUserInput(input);
}

/** Removes emoji glyphs from AI-authored text while preserving regular words and punctuation. */
export function stripEmoji(input: string): string {
  return input
    .replace(EMOJI_KEYCAP_RE, "")
    .replace(EMOJI_RE, "")
    .replace(EMOJI_JOINER_RE, "");
}
