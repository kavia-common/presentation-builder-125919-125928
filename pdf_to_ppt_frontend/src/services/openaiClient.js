/**
 * OpenAI client utilities for browser-only usage (no SDK).
 * Uses fetch() to call Chat Completions API.
 */

import { getOpenAIKey } from "../config/env";

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

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
    model: 'gpt-4.1-mini',
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: 0.3
  };
  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI chat error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  return content;
}

// PUBLIC_INTERFACE
/**
 * analyzeImageWithOpenAI
 * Sends an image and user context to OpenAI Vision model to decide inclusion and caption/title.
 * Returns a JSON object: { include: boolean, title?: string, caption?: string, rationale?: string }
 * @param {string} imageDataUrl - base64 data URL
 * @param {string} userContext - optional user guidance from chat
 * @returns {Promise<{ include: boolean, title?: string, caption?: string, rationale?: string }>}
 */
export async function analyzeImageWithOpenAI(imageDataUrl, userContext = '') {
  const apiKey = ensureApiKey();

  const systemPrompt = [
    'You are selecting which PDF page images are useful to include in a slide deck.',
    'Assess importance based on clarity, data density, charts, diagrams, and relevance to business/insights.',
    'You MUST return a single JSON object with these keys:',
    '{ "include": true|false, "title": "short title", "caption": "1-2 sentence summary", "rationale": "brief reason" }',
    'Keep captions concise and useful.',
    'If content is low-value (e.g., cover pages, blank pages, page numbers only), set include=false.',
    userContext ? `User guidance: ${userContext}` : '',
  ].filter(Boolean).join('\n');

  const payload = {
    model: 'gpt-4.1-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this page image and return only the JSON object.' },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      }
    ]
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI vision error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '{}';
  return safeParseJson(content);
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
 *
 * Returns JSON:
 * {
 *   "slides": [
 *     {
 *       "template": "title" | "title-bullets" | "image-right" | "image-left" | "two-column" | "quote" | "comparison" | "section-divider" | "chart",
 *       "title": string,
 *       "bullets": string[],
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
 * @returns {Promise<{slides: Array<{template?: string, title:string, bullets:string[], imagePages?: number[], notes?: string, sources?: Array<{page:number, chunks?: number[]}>}>, summary?: string}>}
 */
export async function planSlidesWithOpenAI(pages, userGuidance = '') {
  const apiKey = ensureApiKey();

  // Limits to control token usage
  const MAX_PAGES = 30;
  const MAX_CHUNKS_PER_PAGE = 12;
  const MAX_TEXT_SNIPPET = 160;

  // Detect whether structured chunks are available on any page
  const hasStructured = Array.isArray(pages) && pages.some(p => Array.isArray(p?.chunks) && p.chunks.length);

  // Create a compact representation optimized for LLM consumption.
  const compact = hasStructured
    ? pages
        .slice(0, MAX_PAGES)
        .map((p) => compactStructuredPage(p, { maxChunks: MAX_CHUNKS_PER_PAGE, maxText: MAX_TEXT_SNIPPET }))
        .join('\n---\n')
    : pages
        .slice(0, MAX_PAGES)
        .map((p) => {
          const t = (p.text || '').slice(0, 800);
          const meta = [
            p.include !== undefined ? `include_hint=${!!p.include}` : null,
            p.title ? `img_title="${p.title}"` : null,
            p.caption ? `img_caption="${p.caption}"` : null
          ].filter(Boolean).join(', ');
          return `Page ${p.page}${meta ? ` (${meta})` : ''}: ${t}`;
        })
        .join('\n---\n');

  const templateOptions = [
    'title',
    'title-bullets',
    'image-right',
    'image-left',
    'two-column',
    'quote',
    'comparison',
    'section-divider',
    'chart'
  ];

  const system = [
    'You are a presentation strategist that maps document structure to slide templates.',
    'From the provided pages, propose a concise slide deck outline:',
    '- Group related pages into logical slides; split dense content.',
    '- Prefer 5-12 slides unless content requires more.',
    '- Create concise, informative titles.',
    '- Provide 3-6 clear, action-oriented bullet points where applicable.',
    hasStructured
      ? '- You are given per-page STRUCTURE SIGNALS (headings, lists, paragraphs, font sizes). Use these to infer hierarchy and pick templates.'
      : '- Only plain text is available; infer structure heuristically.',
    '- If a figure/chart is helpful, set imagePages with page numbers for that slide.',
    `- Choose a "template" from: ${templateOptions.map((t) => `"${t}"`).join(', ')}.`,
    '- When possible, include "sources" referencing page numbers and the chunk indexes shown in brackets [#n] for traceability (omit if not present).',
    '- Output ONLY JSON with this shape:',
    '{ "slides": [ { "template": "title-bullets", "title": "...", "bullets": ["..."], "imagePages": [<pageNumber>], "notes": "optional", "sources":[{"page":1,"chunks":[0,2]}] } ], "summary": "1-3 sentence narrative" }',
    userGuidance ? `User guidance: ${userGuidance}` : ''
  ].filter(Boolean).join('\n');

  const userInstruction = hasStructured
    ? `Build an outline from these pages using the provided STRUCTURE SIGNALS (headings H, lists L, paragraphs P). Return ONLY JSON.\n${compact}`
    : `Build an outline from these pages. Return ONLY JSON.\n${compact}`;

  const payload = {
    model: 'gpt-4.1-mini',
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userInstruction }
    ]
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI plan error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '{}';
  const parsed = safeParseJson(content);

  // Ensure structure
  if (!parsed || !Array.isArray(parsed.slides)) {
    return { slides: [] };
  }
  return parsed;
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
  ].filter(Boolean).join(', ');

  const statsBits = [];
  if (p?.stats?.maxFont) statsBits.push(`maxFont=${roundNum(p.stats.maxFont)}`);
  if (p?.stats?.medianFont) statsBits.push(`medianFont=${roundNum(p.stats.medianFont)}`);
  if (p?.stats?.lineCount) statsBits.push(`lines=${p.stats.lineCount}`);

  parts.push(`Page ${p.page}${meta ? ` (${meta})` : ''}${statsBits.length ? ` [${statsBits.join(', ')}]` : ''}`);

  const chunks = Array.isArray(p.chunks) ? p.chunks : [];
  // Order: headings, lists, paragraphs
  const ordered = [
    ...chunks.filter(c => c.type === 'heading'),
    ...chunks.filter(c => c.type === 'list'),
    ...chunks.filter(c => c.type === 'paragraph')
  ].slice(0, maxChunks);

  ordered.forEach((c, idx) => {
    const kind = c.type === 'heading' ? 'H' : c.type === 'list' ? 'L' : 'P';
    const txt = sanitizeInline((c.text || '').replace(/\s+/g, ' ').trim()).slice(0, maxText);
    const fontBits = [];
    if (c.font?.size) fontBits.push(`fs=${roundNum(c.font.size)}`);
    if (c.font?.bold) fontBits.push('bold');
    if (c.font?.italic) fontBits.push('italic');
    parts.push(` - ${kind}[#${idx}] ${txt}${fontBits.length ? ` (${fontBits.join(',')})` : ''}`);
  });

  // If there are no chunks (edge-case), fallback to text
  if (ordered.length === 0) {
    const fallback = (p.text || '').slice(0, 600);
    parts.push(` - P ${sanitizeInline(fallback)}`);
  }

  return parts.join('\n');
}

function roundNum(n) {
  const p = Math.pow(10, 2);
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
}

function sanitizeInline(s) {
  return String(s || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"');
}

// PUBLIC_INTERFACE
/**
 * refineSlidesWithOpenAI
 * Given the original pages and an initial outline, apply user feedback/modifications to produce a refined outline.
 * Returns the same JSON shape as planSlidesWithOpenAI.
 * @param {Array<{page:number, text:string}>} pages
 * @param {{slides:Array<{title:string, bullets:string[], imagePages?: number[], notes?: string}>}} existingOutline
 * @param {string} userFeedback - freeform instructions from user chat
 * @returns {Promise<{slides: Array<{title:string, bullets:string[], imagePages?: number[], notes?: string}>, summary?: string}>}
 */
export async function refineSlidesWithOpenAI(pages, existingOutline, userFeedback = '') {
  const apiKey = ensureApiKey();

  const MAX_PAGES = 30;
  const compact = pages
    .slice(0, MAX_PAGES)
    .map(p => `Page ${p.page}: ${(p.text || '').slice(0, 500)}`)
    .join('\n');

  const outlineStr = JSON.stringify(existingOutline).slice(0, 15000); // safeguard

  const system = [
    'You refine slide outlines according to user feedback.',
    'Adjust titles, bullet density, ordering, and image references.',
    'Output ONLY the full revised outline JSON with the same schema as before.'
  ].join('\n');

  const payload = {
    model: 'gpt-4.1-mini',
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Here is the current outline JSON:\n${outlineStr}` },
      { role: 'user', content: `Here are the document page texts for context:\n${compact}` },
      { role: 'user', content: `Apply the following feedback and return ONLY JSON:\n${userFeedback || 'No additional feedback. Improve clarity and concision.'}` }
    ]
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI refine error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '{}';
  const parsed = safeParseJson(content);
  if (!parsed || !Array.isArray(parsed.slides)) {
    return existingOutline;
  }
  return parsed;
}

function ensureApiKey() {
  const key = getOpenAIKey();
  if (!key) {
    throw new Error('Missing REACT_APP_OPENAI_API_KEY');
  }
  return key;
}

function safeParseJson(text) {
  // Attempt direct JSON.parse, else extract between first { and last }
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch { /* ignore */ }
    }
  }
  return { include: false };
}

// PUBLIC_INTERFACE
/**
 * formatOutlineForChat
 * Creates a human-readable summary of an outline for display in chat.
 * @param {{slides:Array<{title:string, bullets:string[], imagePages?:number[], notes?:string}>, summary?:string}} outline
 * @returns {string}
 */
export function formatOutlineForChat(outline) {
  if (!outline || !Array.isArray(outline.slides)) return 'No outline available.';
  const parts = [];
  if (outline.summary) {
    parts.push(`Summary: ${outline.summary}`);
  }
  outline.slides.forEach((s, idx) => {
    parts.push([
      `Slide ${idx + 1}: ${s.title || 'Untitled'}`,
      ...(Array.isArray(s.bullets) ? s.bullets.map(b => ` - ${b}`) : []),
      (s.imagePages && s.imagePages.length ? ` Images from pages: ${s.imagePages.join(', ')}` : null)
    ].filter(Boolean).join('\n'));
  });
  parts.push('\nReply with edits, e.g., "Combine slides 2 and 3", "Add a slide on risks", "Use page 7 chart instead".');
  return parts.join('\n\n');
}
