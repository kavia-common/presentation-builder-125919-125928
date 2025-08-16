import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { pdfToImages, pdfToText } from './utils/pdf';
import { generatePptxFromOutline, generatePptx } from './services/ppt';
import { chatWithOpenAI, analyzeImageWithOpenAI, planSlidesWithOpenAI, refineSlidesWithOpenAI, formatOutlineForChat } from './services/openaiClient';
import { getOpenAIKey } from './config/env';

/**
 * App component
 * Provides:
 * - PDF upload
 * - Client-side PDF page rendering as images
 * - Extract text from each page
 * - LLM-based slide planning (group/split pages logically)
 * - Chat UI with OpenAI with preloaded proposed slide content for review
 * - Local PPTX generation and download (from outline) with user feedback incorporated
 */
function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const [pageImages, setPageImages] = useState([]); // { page: number, dataUrl: string }
  const [pageTexts, setPageTexts] = useState([]); // { page: number, text: string }
  const [analysis, setAnalysis] = useState([]); // per page results for images
  const [outline, setOutline] = useState(null); // planned slides outline JSON
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Hi! Upload a PDF and press Analyze. I will extract text and images, propose a slide outline, and show the draft here. You can reply with edits before I generate the final PPT.' }
  ]);
  const [userMessage, setUserMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [pptBuilding, setPptBuilding] = useState(false);
  const [pptReady, setPptReady] = useState(false);
  const lastBuildSlidesRef = useRef([]);

  const apiKeyAvailable = !!getOpenAIKey();

  // Busy indicator shared across flows: prevents cross-triggering UI actions.
  const isBusy = analyzing || pptBuilding;

  useEffect(() => {
    document.title = 'PDF to PPT Converter';
  }, []);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      resetWork();
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      resetWork();
    }
  };

  const resetWork = () => {
    setPageImages([]);
    setPageTexts([]);
    setAnalysis([]);
    setOutline(null);
    setProgress(0);
    setAnalyzing(false);
    setPptReady(false);
    lastBuildSlidesRef.current = [];
  };

  const handleAnalyze = useCallback(async () => {
    if (!pdfFile) return;
    if (!getOpenAIKey()) {
      alert('Missing OpenAI API key. Please set REACT_APP_OPENAI_API_KEY in .env or public/runtime-env.js and restart.');
      return;
    }
    if (pptBuilding) {
      alert('Please wait until PPT building completes before analyzing again.');
      return;
    }

    setAnalyzing(true);
    setProgress(0);
    setAnalysis([]);
    setOutline(null);
    try {
      // 1) Render images and extract texts
      const [images, texts] = await Promise.all([
        pdfToImages(pdfFile, 1024),
        pdfToText(pdfFile, 4000)
      ]);
      setPageImages(images);
      setPageTexts(texts);

      // 2) Per-page light analysis on images for include/title/caption signals
      const results = [];
      const userContext = chatHistory
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n');

      for (let i = 0; i < images.length; i += 1) {
        const img = images[i];
        // PUBLIC_INTERFACE
        const analysisResult = await analyzeImageWithOpenAI(img.dataUrl, userContext);
        results.push({
          page: img.page,
          imageDataUrl: img.dataUrl,
          ...analysisResult,
          include: analysisResult?.include ?? false,
        });
        setProgress(Math.round(((i + 1) / images.length) * 100));
        setAnalysis([...results]); // progressive update
      }

      // 3) Build a logical slide outline using texts + image analysis signals
      const pagesData = texts.map(t => {
        const a = results.find(r => r.page === t.page);
        return {
          page: t.page,
          text: t.text,
          include: a?.include,
          title: a?.title,
          caption: a?.caption
        };
      });

      // PUBLIC_INTERFACE
      const plan = await planSlidesWithOpenAI(pagesData, userContext);
      setOutline(plan);

      // 4) Preload chat with the proposed outline for user review
      const outlineText = formatOutlineForChat(plan);
      setChatHistory(prev => ([
        ...prev,
        { role: 'assistant', content: 'I analyzed your PDF and drafted the following slide outline:' },
        { role: 'assistant', content: outlineText }
      ]));
    } catch (err) {
      console.error(err);
      alert('Failed to analyze PDF. See console for details.');
    } finally {
      setAnalyzing(false);
    }
  }, [pdfFile, chatHistory, pptBuilding]);

  const selectedSlides = useMemo(() => {
    return analysis.filter(s => !!s.include);
  }, [analysis]);

  const toggleInclude = (page) => {
    setAnalysis(prev => prev.map(s => s.page === page ? ({ ...s, include: !s.include }) : s));
  };

  const handleBuildPPT = async () => {
    if (!outline || !outline.slides || outline.slides.length === 0) {
      // Backward compatibility: if no outline (user didn't analyze), fallback to selected slides image-based PPT
      if (selectedSlides.length === 0) {
        alert('No outline available and no slides selected. Please Analyze the PDF first or toggle at least one page.');
        return;
      }
      if (analyzing) {
        alert('Please wait for analysis to complete before generating the PPT.');
        return;
      }
      setPptBuilding(true);
      setPptReady(false);
      try {
        await generatePptx(selectedSlides, 'Generated Presentation');
        lastBuildSlidesRef.current = selectedSlides;
        setPptReady(true);
      } catch (e) {
        console.error(e);
        alert('Failed to generate PPT.');
      } finally {
        setPptBuilding(false);
      }
      return;
    }

    if (analyzing) {
      alert('Please wait for analysis to complete before generating the PPT.');
      return;
    }

    setPptBuilding(true);
    setPptReady(false);
    try {
      // Gather user feedback (all user messages)
      const userFeedback = chatHistory.filter(m => m.role === 'user').map(m => m.content).join('\n');

      const pages = pageTexts; // {page,text}
      // PUBLIC_INTERFACE
      const refined = await refineSlidesWithOpenAI(pages, outline, userFeedback);
      setOutline(refined);

      // Map images by page for embedding
      const imagesByPage = Object.fromEntries(pageImages.map(p => [p.page, p.dataUrl]));

      // PUBLIC_INTERFACE
      await generatePptxFromOutline(refined, imagesByPage, 'Generated Presentation');
      lastBuildSlidesRef.current = refined?.slides || [];
      setPptReady(true);

      // Append a confirmation message in chat
      setChatHistory(prev => ([
        ...prev,
        { role: 'assistant', content: 'Thanks! I applied your feedback and generated the PPT. Feel free to adjust further and regenerate.' }
      ]));
    } catch (e) {
      console.error(e);
      alert('Failed to generate PPT from outline.');
    } finally {
      setPptBuilding(false);
    }
  };

  const sendMessage = async (e) => {
    e?.preventDefault?.();
    if (!userMessage.trim()) return;
    if (!getOpenAIKey()) {
      alert('Missing OpenAI API key. Please set REACT_APP_OPENAI_API_KEY in .env or public/runtime-env.js and restart.');
      return;
    }

    // Insert/replace or prepend a system prompt asking LLM to reply in markdown.
    const systemMarkdownPrompt = {
      role: "system",
      content:
        "You are a helpful assistant. Format ALL of your responses using markdown. Use markdown for headings, bold, italics, lists, code, and tables as appropriate. Never return plain text."
    };
    // Ensure there is only one such system prompt at the front
    let newHistory;
    if (
      chatHistory.length > 0 &&
      chatHistory[0].role === "system" &&
      chatHistory[0].content &&
      chatHistory[0].content.includes("markdown")
    ) {
      newHistory = [...chatHistory, { role: "user", content: userMessage }];
      newHistory[0] = systemMarkdownPrompt;
    } else {
      newHistory = [systemMarkdownPrompt, ...chatHistory, { role: "user", content: userMessage }];
    }
    setChatHistory([...chatHistory, { role: 'user', content: userMessage }]);
    setUserMessage('');
    setSending(true);

    try {
      // PUBLIC_INTERFACE
      const assistantReply = await chatWithOpenAI(newHistory);
      setChatHistory([...chatHistory, { role: 'user', content: userMessage }, { role: 'assistant', content: assistantReply }]);
    } catch (err) {
      console.error(err);
      setChatHistory([...chatHistory, { role: 'user', content: userMessage }, { role: 'assistant', content: 'Sorry, something went wrong while contacting OpenAI.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="App">
      <div className="navbar">
        <span className="brand">PDF → PPT</span>
      </div>

      <main className="main">
        {/* Left: Conversion Panel */}
        <section className="panel">
          <div className="header">
            <h1 className="title">PDF to PPT Converter</h1>
            <p className="subtitle">Upload a PDF and let AI draft a logical, concise slide deck. Review and give edits in chat before generating.</p>
          </div>

          {!apiKeyAvailable && (
            <div className="key-warning">
              OpenAI key not found. Create a .env file with REACT_APP_OPENAI_API_KEY=your_key and restart.
              Client-side keys are visible to users—use a restricted key for demos only.
            </div>
          )}

          <div
            className={`upload ${dragOver ? 'dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input id="pdf-input" type="file" accept="application/pdf" onChange={onFileChange} />
            <label htmlFor="pdf-input" className="btn secondary">Choose PDF</label>
            <div className="hint">
              {pdfFile ? <>Selected: <strong>{pdfFile.name}</strong></> : 'Drag & drop your PDF here or click to select.'}
            </div>
          </div>

          <div className="actions">
            <button type="button" className="btn" onClick={handleAnalyze} disabled={!pdfFile || isBusy}>
              {analyzing ? 'Analyzing...' : 'Analyze PDF'}
            </button>
            <button type="button" className="btn muted" onClick={() => resetWork()} disabled={isBusy || (!pdfFile && pageImages.length === 0 && analysis.length === 0)}>
              Reset
            </button>
          </div>

          {analyzing && (
            <>
              <div className="progress" aria-label="analysis progress">
                <div style={{ width: `${progress}%` }} />
              </div>
              <div className="small">{progress}%</div>
            </>
          )}

          {analysis.length > 0 && (
            <>
              <div className="footer-actions">
                <div className="badge">{selectedSlides.length} of {analysis.length} selected</div>
                <button type="button" className="btn" onClick={handleBuildPPT} disabled={isBusy}>
                  {pptBuilding ? 'Building PPT...' : 'Generate PPT'}
                </button>
              </div>

              <div className="grid">
                {analysis.map((s) => (
                  <div className="card" key={s.page}>
                    <img className="thumb" src={s.imageDataUrl} alt={`Page ${s.page}`} />
                    <div className="card-body">
                      <div className="badge">Page {s.page}</div>
                      {s.title && <div style={{ fontWeight: 600 }}>{s.title}</div>}
                      {s.caption && <div className="caption">{s.caption}</div>}
                      {s.rationale && <div className="caption">Reason: {s.rationale}</div>}

                      <label className="toggle">
                        <input type="checkbox" checked={!!s.include} onChange={() => toggleInclude(s.page)} />
                        Include in PPT
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Right: Chat Panel */}
        <section className="panel">
          <div className="header">
            <h2 className="title">Chat</h2>
            <p className="subtitle">After analysis, I’ll post a proposed slide outline here. Reply with edits, then click “Generate PPT”.</p>
          </div>

          <div className="chat">
            <div className="chat-log" aria-label="chat log">
              {chatHistory.map((m, idx) => {
                // Render user messages as plain text, assistant messages with markdown
                if (m.role === 'assistant') {
                  return (
                    <div key={idx} className="msg assistant">
                      <ReactMarkdown
                        children={m.content}
                        linkTarget="_blank"
                        components={{
                          // Optionally customize, e.g., code, tables, etc.
                        }}
                      />
                    </div>
                  );
                } else if (m.role === 'user') {
                  return (
                    <div key={idx} className="msg user">
                      {m.content}
                    </div>
                  );
                } else {
                  // Could include system or other roles if visible
                  return null;
                }
              })}
            </div>

            <form className="chat-input" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder="Type changes like: “Merge slides 2-3 and add a KPI slide.”"
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                disabled={sending || isBusy}
              />
              <button className="btn" type="submit" disabled={sending || !userMessage.trim() || isBusy}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>

            <div className="help">Tip: Your chat feedback is applied to the outline before generating the PPT.</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
