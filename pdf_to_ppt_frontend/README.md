# PDF to PPT Frontend

A lightweight React frontend that:
- Uploads a PDF and renders each page in-browser using pdf.js
- Chats with OpenAI for guidance and selection criteria
- Sends each page image to an LLM to decide inclusion and produce captions
- Generates a PowerPoint locally with pptxgenjs and prompts download

No backend or authentication. Use a restricted client-side API key for demos only.

## Quick start

1) Install deps
- npm install

2) Configure environment (choose one)
- Option A (build-time, requires rebuild): Copy .env.example to .env in pdf_to_ppt_frontend and set:
  REACT_APP_OPENAI_API_KEY=your_key
- Option B (runtime, no rebuild): Copy public/runtime-env.example.js to public/runtime-env.js and set:
  window.__RUNTIME_CONFIG__ = { REACT_APP_OPENAI_API_KEY: "your_key" }

3) Run
- npm start
- Open http://localhost:3000

If the app shows a warning that the OpenAI key is missing, ensure:
- The .env file is located at pdf_to_ppt_frontend/.env (not the monorepo root), and you restarted the dev server after editing; or
- The runtime file exists at pdf_to_ppt_frontend/public/runtime-env.js and sets window.__RUNTIME_CONFIG__.REACT_APP_OPENAI_API_KEY.

## Notes

- PDF images are represented as full rendered pages for simplicity (important pages will be chosen by the LLM).
- The LLM is called twice:
  - For free-form chat (to collect your guidance)
  - For each page image (returns JSON with include/title/caption/rationale)
- You can toggle inclusion per page before generating the PPT.

## Security

Client-side API keys are visible to users. Avoid using production keys and configure usage limits.
