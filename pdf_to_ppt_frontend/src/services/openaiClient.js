/**
 * OpenAI client utilities for browser-only usage (no SDK).
 * Uses fetch() to call Chat Completions API.
 */

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

// PUBLIC_INTERFACE
/**
 * chatWithOpenAI
 * Sends the chat history to OpenAI and returns assistant message text.
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @returns {Promise<string>}
 */
export async function chatWithOpenAI(messages) {
  ensureApiKey();
  const payload = {
    model: 'gpt-4o-mini',
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: 0.3
  };
  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
  ensureApiKey();

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
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
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

function ensureApiKey() {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing REACT_APP_OPENAI_API_KEY');
  }
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
