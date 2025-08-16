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
    model: 'gpt-4o-mini',
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
    model: 'gpt-4o-mini',
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

// PUBLIC_INTERFACE
/**
 * planSlidesWithOpenAI
 * Builds a logical slide outline using extracted per-page text and (optionally) per-page analysis.
 * The model should group related pages into slides, split dense content, and propose titles and bullets.
 * Returns JSON: { slides: [ { title: string, bullets: string[], imagePages?: number[], notes?: string } ], summary?: string }
 * @param {Array<{page:number, text:string, include?:boolean, title?:string, caption?:string}>} pages
 * @param {string} userGuidance - concatenated user guidance from chat
 * @returns {Promise<{slides: Array<{title:string, bullets:string[], imagePages?: number[], notes?: string}>, summary?: string}>}
 */
export async function planSlidesWithOpenAI(pages, userGuidance = '') {
  const apiKey = ensureApiKey();

  // Compress the pages into a compact textual representation to reduce token usage.
  // Limit text per page and number of pages in prompt if needed.
  const MAX_PAGES = 30;
  const compact = pages
    .slice(0, MAX_PAGES)
    .map(p => {
      const t = (p.text || '').slice(0, 800);
      const meta = [
        p.include !== undefined ? `include_hint=${!!p.include}` : null,
        p.title ? `img_title="${p.title}"` : null,
        p.caption ? `img_caption="${p.caption}"` : null
      ].filter(Boolean).join(', ');
      return `Page ${p.page}${meta ? ` (${meta})` : ''}: ${t}`;
    })
    .join('\n---\n');

  const system = [
    'You are a presentation strategist.',
    'From the provided document pages, propose a slide deck outline:',
    '- Group related pages into logical slides.',
    '- Split dense content into multiple slides if appropriate.',
    '- Prefer 5-12 slides unless the content demands more.',
    '- Create concise, informative titles.',
    '- Provide 3-6 bullet points per slide (concise and action-oriented).',
    '- If a figure/chart is helpful, reference imagePages with page numbers to consider for that slide.',
    '- Output ONLY a JSON object with the following shape:',
    '{ "slides": [ { "title": "...", "bullets": ["..."], "imagePages": [<pageNumber>], "notes": "optional presenter notes" } ], "summary": "1-3 sentence narrative" }',
    userGuidance ? `User guidance: ${userGuidance}` : ''
  ].filter(Boolean).join('\n');

  const payload = {
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Build an outline from these pages:\n${compact}\nReturn only JSON.` }
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
    model: 'gpt-4o-mini',
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
