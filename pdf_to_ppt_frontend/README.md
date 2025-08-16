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

2) Configure environment
- Copy .env.example to .env and set REACT_APP_OPENAI_API_KEY

3) Run
- npm start
- Open http://localhost:3000

## Notes

- PDF images are represented as full rendered pages for simplicity (important pages will be chosen by the LLM).
- The LLM is called twice:
  - For free-form chat (to collect your guidance)
  - For each page image (returns JSON with include/title/caption/rationale)
- You can toggle inclusion per page before generating the PPT.

## Security

Client-side API keys are visible to users. Avoid using production keys and configure usage limits.
