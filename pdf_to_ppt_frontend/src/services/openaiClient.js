"use strict";
/**
 * OpenAI client utilities for browser-only usage (no SDK).
 * Uses fetch() to call Chat Completions API.
 * Enhanced with:
 *  - Stronger prompts with JSON-schema-like guidance
 *  - response_format: { type: "json_object" } with graceful fallback if unsupported
 *  - Robust JSON parsing and sanitization
 *  - Schema enforcement & normalization for slide outlines
 *  - Safe default templates and theme ("azure") to ensure PPTX can always be generated
 */

import { getOpenAIKey } from "../config/env";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

// Allowed slide template names (LLM-facing, lowercase kebab-case)
const ALLOWED_TEMPLATES = [
  "title",
  "title-bullets",
  "image-right",
  "image-left",
  "two-column",
  "quote",
  "comparison",
  "section-divider",
  "chart",
  "image-card", // internal safe fallback
  "bullets"     // internal safe fallback
];

const DEFAULT_THEME = "azure";
const MAX_SLIDES = 25;
const MAX_BULLETS_PER_SLIDE = 8;
const MAX_BULLET_LEN = 180;
const MAX_TITLE_LEN = 120;

/* ----------------------------- Public APIs ----------------------------- */

// PUBLIC_INTERFACE
/**
 * chatWithOpenAI
 * Sends the chat history to OpenAI and returns assistant message text.
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @returns {Promise<string>}
 */
export async function chatWithOpenAI(messages) {
  const apiKey = ensureApiKey();
  const payload = {
    model: "gpt-4.1-mini",
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: 0.3
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI chat error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return content;
}

// PUBLIC_INTERFACE
/**
 * analyzeImageWithOpenAI
 * Sends an image and user context to OpenAI Vision model to decide inclusion and caption/title.
 * Ensures a valid object is always returned.
 * Returns a JSON object: { include: boolean, title?: string, caption?: string, rationale?: string }
 * @param {string} imageDataUrl - base64 data URL
 * @param {string} userContext - optional user guidance from chat
 * @returns {Promise<{ include: boolean, title?: string, caption?: string, rationale?: string }>}
 */
export async function analyzeImageWithOpenAI(imageDataUrl, userContext = "") {
  const apiKey = ensureApiKey();

  const schemaText = [
    'Return ONLY a JSON object with the following schema (no markdown):',
    '{',
    '  "include": boolean,',
    '  "title": string,           // short (<= 80 chars), may be empty if unknown',
    '  "caption": string,         // 1-2 sentence summary (<= 220 chars), may be empty',
    '  "rationale": string        // brief reason for include=true/false (<= 160 chars)',
    '}',
    'No other text. If fields are unknown, provide best-effort defaults.'
  ].join("\n");

  const systemPrompt = [
    "You decide if a PDF page image is useful enough to include in a slide deck.",
    "Criteria: clarity, data density, charts, diagrams, and business relevance.",
    "If content is low-value (e.g., cover, blank, page numbers only), set include=false.",
    userContext ? `User guidance: ${userContext}` : "",
    schemaText
  ].filter(Boolean).join("\n");

  const payload = {
    model: "gpt-4.1-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this page image and return only the JSON object." },
          { type: "image_url", image_url: { url: imageDataUrl } }
        ]
      }
    ],
    // Prefer JSON response if supported; will gracefully fallback if rejected
    response_format: { type: "json_object" }
  };

  const data = await callOpenAI(payload, { forceJson: true });
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  const raw = parseJsonLike(content);
  return enforceAnalyzeSchema(raw);
}

/**
 * PUBLIC_INTERFACE
 * planSlidesWithOpenAI
 * Builds a logical slide outline using extracted per-page text and structured blocks when available.
 * The model should:
 *  - Group related pages into slides and split dense content
 *  - Use structured page signals (headings, lists, paragraphs, font sizes) when provided
 *  - Suggest slide templates based on semantics (e.g., title-bullets, image-right, two-column)
 *  - Return a compact JSON outline
 *
 * Backward-compatible: If pages contain only {page,text} (no chunks), it falls back to text-only.
 * Ensures a normalized outline with safe defaults is always returned.
 *
 * Returns JSON:
 * {
 *   "theme": string,
 *   "title"?: string,
 *   "slides": [
 *     {
 *       "template": "title" | "title-bullets" | "image-right" | "image-left" | "two-column" | "quote" | "comparison" | "section-divider" | "chart",
 *       "title": string,
 *       "subtitle"?: string,
 *       "bullets"?: string[],
 *       "imagePages"?: number[],
 *       "notes"?: string,
 *       "sources"?: Array<{ page: number, chunks?: number[] }>
 *     }
 *   ],
 *   "summary"?: string
 * }
 *
 * @param {Array<{page:number, text:string, include?:boolean, title?:string, caption?:string, chunks?: Array<{type:'heading'|'paragraph'|'list', text:string, bbox?:any, font?:{size:number,family?:string,bold?:boolean,italic?:boolean}}>, stats?: {maxFont?:number, medianFont?:number, lineCount?:number}}>} pages
 * @param {string} userGuidance - concatenated user guidance from chat
 * @returns {Promise<{theme?: string, title?: string, slides: Array<{template?: string, title:string, bullets?:string[], imagePages?: number[], notes?: string, subtitle?:string, flow?:{steps?:string[]}, left?:{title?:string, bullets?:string[]}, right?:{title?:string, bullets?:string[]}}>, summary?: string}>}
 */
export async function planSlidesWithOpenAI(pages, userGuidance = "") {
  const apiKey = ensureApiKey();

  // Limits to control token usage
  const MAX_PAGES = 30;
  const MAX_CHUNKS_PER_PAGE = 12;
  const MAX_TEXT_SNIPPET = 160;

  // Detect whether structured chunks are available on any page
  const hasStructured = Array.isArray(pages) && pages.some((p) => Array.isArray(p?.chunks) && p.chunks.length);

  // Create a compact representation optimized for LLM consumption.
  const compact = hasStructured
    ? pages
        .slice(0, MAX_PAGES)
        .map((p) => compactStructuredPage(p, { maxChunks: MAX_CHUNKS_PER_PAGE, maxText: MAX_TEXT_SNIPPET }))
        .join("\n---\n")
    : pages
        .slice(0, MAX_PAGES)
        .map((p) => {
          const t = (p.text || "").slice(0, 800);
          const meta = [
            p.include !== undefined ? `include_hint=${!!p.include}` : null,
            p.title ? `img_title="${p.title}"` : null,
            p.caption ? `img_caption="${p.caption}"` : null
          ]
            .filter(Boolean)
            .join(", ");
          return `Page ${p.page}${meta ? ` (${meta})` : ""}: ${t}`;
        })
        .join("\n---\n");

  const schemaText = [
    "Return ONLY JSON (no markdown) that matches this schema:",
    "{",
    '  "theme": string, // optional, if omitted default to "azure"',
    '  "title"?: string,',
    '  "summary"?: string, // 1-3 sentence narrative',
    '  "slides": [',
    "    {",
    `      "template"?: ${JSON.stringify(ALLOWED_TEMPLATES)},`,
    '      "title": string,',
    '      "subtitle"?: string,',
    '      "bullets"?: string[],',
    '      "imagePages"?: number[],',
    '      "notes"?: string,',
    '      "sources"?: Array<{ "page": number, "chunks"?: number[] }>',
    "    }",
    "  ]",
    "}",
    "If a field is unknown, provide a reasonable default. Titles must be concise and informative."
  ].join("\n");

  const templateOptions = ALLOWED_TEMPLATES.filter(
    (t) => t !== "image-card" && t !== "bullets"
  );

  const system = [
    "You are a presentation strategist that maps document structure to slide templates.",
    "From the provided pages, propose a concise slide deck outline:",
    "- Group related pages into logical slides; split dense content.",
    "- Prefer 5-12 slides unless content requires more.",
    "- Create concise, informative titles.",
    "- Provide 3-6 clear, action-oriented bullet points where applicable.",
    hasStructured
      ? "- You are given per-page STRUCTURE SIGNALS (headings, lists, paragraphs, font sizes). Use these to infer hierarchy and pick templates."
      : "- Only plain text is available; infer structure heuristically.",
    `- Choose "template" from: ${templateOptions.map((t) => `"${t}"`).join(", ")}.`,
    '- When possible, include "sources" referencing page numbers and the chunk indexes shown in brackets [#n] for traceability (omit if not present).',
    schemaText,
    userGuidance ? `User guidance: ${userGuidance}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const userInstruction = hasStructured
    ? `Build an outline from these pages using the provided STRUCTURE SIGNALS (headings H, lists L, paragraphs P). Return ONLY JSON.\n${compact}`
    : `Build an outline from these pages. Return ONLY JSON.\n${compact}`;

  const payload = {
    model: "gpt-4.1-mini",
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userInstruction }
    ],
    response_format: { type: "json_object" }
  };

  const data = await callOpenAI(payload, { forceJson: true });
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = parseJsonLike(content);

  // Normalize and ensure we always return a viable outline
  const normalized = normalizeOutline(parsed, pages, { defaultTheme: DEFAULT_THEME });
  return normalized;
}

// PUBLIC_INTERFACE
/**
 * refineSlidesWithOpenAI
 * Given the original pages and an initial outline, apply user feedback/modifications to produce a refined outline.
 * Returns the same JSON shape as planSlidesWithOpenAI, fully normalized with safe fallbacks.
 * @param {Array<{page:number, text:string}>} pages
 * @param {{theme?:string, title?:string, slides:Array<{title:string, bullets?:string[], imagePages?: number[], notes?: string, subtitle?: string, template?: string}>}} existingOutline
 * @param {string} userFeedback - freeform instructions from user chat
 * @returns {Promise<{theme?: string, title?: string, slides: Array<{title:string, bullets?:string[], imagePages?: number[], notes?: string, subtitle?: string, template?: string}>, summary?: string}>}
 */
export async function refineSlidesWithOpenAI(pages, existingOutline, userFeedback = "") {
  const apiKey = ensureApiKey();

  const MAX_PAGES = 30;
  const compact = pages
    .slice(0, MAX_PAGES)
    .map((p) => `Page ${p.page}: ${(p.text || "").slice(0, 500)}`)
    .join("\n");

  const outlineStr = JSON.stringify(existingOutline || {}).slice(0, 15000); // safeguard

  const schemaText = [
    "Return ONLY the full revised outline JSON with the schema used previously:",
    "{",
    '  "theme"?: string,',
    '  "title"?: string,',
    '  "summary"?: string,',
    '  "slides": [',
    "    {",
    `      "template"?: ${JSON.stringify(ALLOWED_TEMPLATES)},`,
    '      "title": string,',
    '      "subtitle"?: string,',
    '      "bullets"?: string[],',
    '      "imagePages"?: number[],',
    '      "notes"?: string,',
    '      "sources"?: Array<{ "page": number, "chunks"?: number[] }>',
    "    }",
    "  ]",
    "}"
  ].join("\n");

  const system = [
    "You refine slide outlines according to user feedback.",
    "Adjust titles, bullet density, ordering, and image references.",
    schemaText
  ].join("\n");

  const payload = {
    model: "gpt-4.1-mini",
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Here is the current outline JSON:\n${outlineStr}` },
      { role: "user", content: `Here are the document page texts for context:\n${compact}` },
      {
        role: "user",
        content: `Apply the following feedback and return ONLY JSON:\n${
          userFeedback || "No additional feedback. Improve clarity and concision."
        }`
      }
    ],
    response_format: { type: "json_object" }
  };

  const data = await callOpenAI(payload, { forceJson: true });
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = parseJsonLike(content);

  // Normalize with existing outline as a base fallback
  const normalized = normalizeOutline(parsed, pages, {
    defaultTheme: existingOutline?.theme || DEFAULT_THEME,
    fallbackExisting: existingOutline
  });
  return normalized;
}

// PUBLIC_INTERFACE
/**
 * formatOutlineForChat
 * Creates a human-readable summary of an outline for display in chat.
 * @param {{theme?:string, title?:string, slides:Array<{title:string, bullets?:string[], imagePages?:number[], notes?:string, template?:string}>, summary?:string}} outline
 * @returns {string}
 */
export function formatOutlineForChat(outline) {
  if (!outline || !Array.isArray(outline.slides)) return "No outline available.";
  const parts = [];
  const themeText = outline.theme ? `Theme: ${outline.theme}` : "";
  const titleText = outline.title ? `Title: ${outline.title}` : "";
  if (themeText || titleText) {
    parts.push([titleText, themeText].filter(Boolean).join(" — "));
  }
  if (outline.summary) {
    parts.push(`Summary: ${outline.summary}`);
  }
  outline.slides.forEach((s, idx) => {
    const header = `Slide ${idx + 1}${s.template ? ` [${s.template}]` : ""}: ${s.title || "Untitled"}`;
    const bullets = Array.isArray(s.bullets) ? s.bullets.map((b) => ` - ${b}`) : [];
    const images = s.imagePages && s.imagePages.length ? ` Images from pages: ${s.imagePages.join(", ")}` : null;
    parts.push([header, ...bullets, images].filter(Boolean).join("\n"));
  });
  parts.push(
    '\nReply with edits, e.g., "Combine slides 2 and 3", "Add a slide on risks", "Use page 7 chart instead".'
  );
  return parts.join("\n\n");
}

/* -------------------------- Internal utilities -------------------------- */

function ensureApiKey() {
  const key = getOpenAIKey();
  if (!key) {
    throw new Error("Missing REACT_APP_OPENAI_API_KEY");
  }
  return key;
}

/**
 * Call OpenAI Chat Completions API with optional forced JSON response.
 * If the API rejects response_format, automatically retries without it.
 * @param {object} payload
 * @param {{forceJson?: boolean}} options
 */
async function callOpenAI(payload, { forceJson = false } = {}) {
  const apiKey = ensureApiKey();

  // Attempt with provided payload first
  let firstRes = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (firstRes.ok) {
    return firstRes.json();
  }

  // If response_format unsupported, remove and retry once
  if (forceJson && firstRes.status === 400) {
    try {
      const bodyText = await firstRes.text();
      const looksLikeResponseFormatIssue =
        /response_format/i.test(bodyText) || /unsupported.*response/i.test(bodyText);
      if (looksLikeResponseFormatIssue) {
        const retryPayload = { ...payload };
        delete retryPayload.response_format;
        const retryRes = await fetch(OPENAI_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(retryPayload)
        });
        if (!retryRes.ok) {
          const text = await retryRes.text().catch(() => "");
          throw new Error(`OpenAI error (retry): ${retryRes.status} ${text}`);
        }
        return retryRes.json();
      }
    } catch {
      // fall through to error below
    }
  }

  const text = await firstRes.text().catch(() => "");
  throw new Error(`OpenAI error: ${firstRes.status} ${text}`);
}

/**
 * Build a compact textual representation for a single page using structured chunks.
 * Favor headings first, then lists, then paragraphs. Include minimal font info.
 * Each chunk line includes an index [#n] so the model can reference sources.
 */
function compactStructuredPage(p, { maxChunks = 12, maxText = 160 } = {}) {
  const parts = [];
  const meta = [
    p.include !== undefined ? `include_hint=${!!p.include}` : null,
    p.title ? `img_title="${sanitizeInline(p.title)}"` : null,
    p.caption ? `img_caption="${sanitizeInline(p.caption)}"` : null
  ]
    .filter(Boolean)
    .join(", ");

  const statsBits = [];
  if (p?.stats?.maxFont) statsBits.push(`maxFont=${roundNum(p.stats.maxFont)}`);
  if (p?.stats?.medianFont) statsBits.push(`medianFont=${roundNum(p.stats.medianFont)}`);
  if (p?.stats?.lineCount) statsBits.push(`lines=${p.stats.lineCount}`);

  parts.push(`Page ${p.page}${meta ? ` (${meta})` : ""}${statsBits.length ? ` [${statsBits.join(", ")}]` : ""}`);

  const chunks = Array.isArray(p.chunks) ? p.chunks : [];
  // Order: headings, lists, paragraphs
  const ordered = [
    ...chunks.filter((c) => c.type === "heading"),
    ...chunks.filter((c) => c.type === "list"),
    ...chunks.filter((c) => c.type === "paragraph")
  ].slice(0, maxChunks);

  ordered.forEach((c, idx) => {
    const kind = c.type === "heading" ? "H" : c.type === "list" ? "L" : "P";
    const txt = sanitizeInline((c.text || "").replace(/\s+/g, " ").trim()).slice(0, maxText);
    const fontBits = [];
    if (c.font?.size) fontBits.push(`fs=${roundNum(c.font.size)}`);
    if (c.font?.bold) fontBits.push("bold");
    if (c.font?.italic) fontBits.push("italic");
    parts.push(` - ${kind}[#${idx}] ${txt}${fontBits.length ? ` (${fontBits.join(",")})` : ""}`);
  });

  // If there are no chunks (edge-case), fallback to text
  if (ordered.length === 0) {
    const fallback = (p.text || "").slice(0, 600);
    parts.push(` - P ${sanitizeInline(fallback)}`);
  }

  return parts.join("\n");
}

function roundNum(n) {
  const p = Math.pow(10, 2);
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
}

function sanitizeInline(s) {
  return String(s || "").replace(/[\r\n]+/g, " ").replace(/"/g, '\\"');
}

/* -------------------------- Parsing & Validation -------------------------- */

/**
 * Attempt to parse JSON with multiple strategies:
 * - Direct JSON.parse
 * - Extract from ```json ... ``` code fences
 * - Extract substring between first '{' and last '}' and parse
 * - Sanitize smart quotes and invisible chars
 */
function parseJsonLike(text) {
  if (text == null) return {};
  const raw = String(text).trim();

  // Try direct
  const direct = tryParseJson(raw);
  if (direct.ok) return direct.value;

  // Try fenced code block
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    const fenced = fenceMatch[1].trim();
    const fromFence = tryParseJson(fenced);
    if (fromFence.ok) return fromFence.value;
    const sanitizedFence = sanitizeJsonString(fenced);
    const fromFenceSan = tryParseJson(sanitizedFence);
    if (fromFenceSan.ok) return fromFenceSan.value;
  }

  // Try brace slice
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const mid = raw.slice(start, end + 1);
    const midTry = tryParseJson(mid);
    if (midTry.ok) return midTry.value;
    const midSan = sanitizeJsonString(mid);
    const midTrySan = tryParseJson(midSan);
    if (midTrySan.ok) return midTrySan.value;
  }

  // Last resort: sanitize whole string and try again
  const sanitized = sanitizeJsonString(raw);
  const sanTry = tryParseJson(sanitized);
  if (sanTry.ok) return sanTry.value;

  return {};
}

function tryParseJson(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

/**
 * Basic JSON sanitizer:
 * - Replace smart quotes with straight quotes
 * - Remove trailing commas before } or ]
 * - Strip BOM and zero-width chars
 */
function sanitizeJsonString(s) {
  let t = String(s || "");
  // Remove BOM / zero-width
  t = t.replace(/\uFEFF/g, "").replace(/[\u200B-\u200D\u2060\uFE0F]/g, "");
  // Smart quotes -> straight
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // Remove trailing commas in objects/arrays
  t = t.replace(/,\s*([}\]])/g, "$1");
  // Remove leading 'json\n' or 'JSON\n'
  t = t.replace(/^\s*json\s*[\r\n]+/i, "");
  return t;
}

/* ----------------------- Analyze schema enforcement ----------------------- */

function enforceAnalyzeSchema(obj) {
  const out = {
    include: !!obj?.include
  };
  const title = coerceString(obj?.title, 0, 80);
  const caption = coerceString(obj?.caption, 0, 220);
  const rationale = coerceString(obj?.rationale, 0, 160);
  if (title) out.title = title;
  if (caption) out.caption = caption;
  if (rationale) out.rationale = rationale;
  return out;
}

function coerceString(val, minLen = 0, maxLen = 200) {
  let s = typeof val === "string" ? val : (val == null ? "" : String(val));
  s = s.replace(/\s+/g, " ").trim();
  if (s.length < minLen) return "";
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + "…";
  return s;
}

/* ----------------------- Outline normalization & fallbacks ----------------------- */

/**
 * Normalize an outline and ensure it is viable:
 * - Ensure slides is a non-empty array (fallback to pages-based slides if empty/invalid)
 * - Coerce theme to a known theme (default azure)
 * - Normalize each slide's fields (template, title, bullets, imagePages, notes)
 * - Cap slides and bullets length; sanitize strings
 * @param {object} outline
 * @param {Array<{page:number, text?:string, include?:boolean, title?:string, caption?:string}>} pages
 * @param {{defaultTheme?:string, fallbackExisting?:object}} options
 */
function normalizeOutline(outline, pages, { defaultTheme = DEFAULT_THEME, fallbackExisting = null } = {}) {
  const baseTheme = sanitizeTheme(outline?.theme) || sanitizeTheme(fallbackExisting?.theme) || defaultTheme;

  // Start with a shallow clone to avoid mutating input
  const normalized = {
    theme: baseTheme,
    title: coerceString(outline?.title || fallbackExisting?.title || "Generated Presentation", 0, MAX_TITLE_LEN),
    summary: coerceString(outline?.summary || fallbackExisting?.summary || "", 0, 320),
    slides: []
  };

  // Collect candidate slides from outline
  const rawSlides = Array.isArray(outline?.slides) ? outline.slides : [];
  const existingSlides = Array.isArray(fallbackExisting?.slides) ? fallbackExisting.slides : [];

  let slides = rawSlides.length ? rawSlides : existingSlides;

  // If still empty, build a minimal fallback plan from pages
  if (!Array.isArray(slides) || slides.length === 0) {
    slides = fallbackOutlineFromPages(pages);
  }

  // Normalize each slide
  const outSlides = [];
  for (let i = 0; i < slides.length && outSlides.length < MAX_SLIDES; i += 1) {
    const s = slides[i] || {};
    const norm = normalizeSlide(s, {
      index: outSlides.length,
      pages
    });
    if (norm) outSlides.push(norm);
  }

  // If no slides after normalization, force a 1-slide fallback
  if (outSlides.length === 0) {
    outSlides.push({
      template: "title-bullets",
      title: "Overview",
      bullets: buildBulletsFromPages(pages, 5)
    });
  }

  normalized.slides = outSlides;
  return normalized;
}

function sanitizeTheme(name) {
  if (!name) return "";
  const raw = String(name).trim().toLowerCase();
  // For now, only "azure" is defined; keep the API generic.
  return raw || "";
}

function normalizeSlide(slide, { index = 0, pages = [] } = {}) {
  const template = normalizeTemplateName(slide?.template);
  const title = coerceString(slide?.title, 0, MAX_TITLE_LEN) || `Slide ${index + 1}`;
  const subtitle = coerceString(slide?.subtitle, 0, 120);
  const notes = coerceString(slide?.notes, 0, 600);

  // Normalize bullets
  let bullets = Array.isArray(slide?.bullets) ? slide.bullets : [];
  bullets = bullets
    .map((b) => coerceString(b, 0, MAX_BULLET_LEN))
    .filter(Boolean)
    .slice(0, MAX_BULLETS_PER_SLIDE);

  // Normalize imagePages
  const imagePages = (Array.isArray(slide?.imagePages) ? slide.imagePages : [])
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  // Carry over optional blocks if present (refined renderer will infer)
  const flow = slide?.flow && typeof slide.flow === "object" ? { ...slide.flow } : undefined;
  if (flow && Array.isArray(flow.steps)) {
    flow.steps = flow.steps.map((s) => coerceString(s, 0, 120)).filter(Boolean).slice(0, 10);
  }
  const left =
    slide?.left && typeof slide.left === "object"
      ? {
          title: coerceString(slide.left.title, 0, 80),
          bullets: (Array.isArray(slide.left.bullets) ? slide.left.bullets : [])
            .map((b) => coerceString(b, 0, MAX_BULLET_LEN))
            .filter(Boolean)
            .slice(0, MAX_BULLETS_PER_SLIDE)
        }
      : undefined;
  const right =
    slide?.right && typeof slide.right === "object"
      ? {
          title: coerceString(slide.right.title, 0, 80),
          bullets: (Array.isArray(slide.right.bullets) ? slide.right.bullets : [])
            .map((b) => coerceString(b, 0, MAX_BULLET_LEN))
            .filter(Boolean)
            .slice(0, MAX_BULLETS_PER_SLIDE)
        }
      : undefined;

  const result = {
    template,
    title
  };
  if (subtitle) result.subtitle = subtitle;
  if (bullets.length) result.bullets = bullets;
  if (imagePages.length) result.imagePages = Array.from(new Set(imagePages));
  if (notes) result.notes = notes;
  if (flow?.steps?.length) result.flow = flow;
  if (left) result.left = left;
  if (right) result.right = right;

  return result;
}

function normalizeTemplateName(key) {
  const raw = String(key || "").trim().toLowerCase();
  const map = {
    title: "title",
    "title-only": "title",
    title_bullets: "title-bullets",
    "title-bullets": "title-bullets",
    bullets: "bullets",
    image: "image-card",
    "image-card": "image-card",
    image_left: "image-left",
    "image-left": "image-left",
    image_right: "image-right",
    "image-right": "image-right",
    "two-column": "two-column",
    two_column: "two-column",
    flowchart: "flowchart", // renderer will map to FLOWCHART
    quote: "quote",
    comparison: "comparison",
    "section-divider": "section-divider",
    section_divider: "section-divider",
    chart: "chart"
  };
  const mapped = map[raw] || raw;
  if (ALLOWED_TEMPLATES.includes(mapped)) return mapped;

  // Heuristics: prefer safe fallbacks
  if (/image/.test(raw)) return "image-card";
  if (/two.*col/.test(raw)) return "two-column";
  if (/title.*bullet/.test(raw)) return "title-bullets";
  if (/title/.test(raw)) return "title";
  return "title-bullets";
}

/**
 * Build a minimal outline when the LLM response is missing/invalid:
 * - Prefer included pages; else use first few pages
 * - Use image-card when image context matters; otherwise title-bullets
 */
function fallbackOutlineFromPages(pages) {
  const safePages = Array.isArray(pages) ? pages : [];
  const included = safePages.filter((p) => !!p.include);
  const source = included.length ? included : safePages.slice(0, 8);

  if (!source.length) {
    return [
      {
        template: "title-bullets",
        title: "Overview",
        bullets: []
      }
    ];
  }

  const slides = source.map((p) => {
    const hasImgHints = p.title || p.caption;
    const textBullets = buildBulletsFromText(p.text || "", 5);
    return {
      template: hasImgHints ? "image-card" : textBullets.length ? "title-bullets" : "image-card",
      title: coerceString(p.title, 0, 80) || `Page ${p.page}`,
      bullets: textBullets,
      imagePages: [p.page],
      notes: coerceString(p.caption, 0, 150)
    };
  });

  // Cap slides in fallback
  return slides.slice(0, 12);
}

function buildBulletsFromPages(pages, maxCount = 5) {
  const firstWithText = (Array.isArray(pages) ? pages : []).find((p) => (p.text || "").trim());
  if (!firstWithText) return [];
  return buildBulletsFromText(firstWithText.text || "", maxCount);
}

function buildBulletsFromText(text, maxCount = 5) {
  if (!text) return [];
  // Split by lines or sentence-ish boundaries; keep concise items
  const items = String(text)
    .split(/\n+/g)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z(])/g))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && s.length >= 8)
    .slice(0, maxCount);
  return items.map((s) => coerceString(s, 0, MAX_BULLET_LEN));
}

/* --------------------------------- Exports compatibility (legacy helpers retained) --------------------------------- */

// Backwards-compatible safeParseJson (unused in new flow but kept for compatibility)
function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* ignore */
      }
    }
  }
  return { include: false };
}
