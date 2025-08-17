import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { pdfToImages, pdfToText } from './utils/pdf';
import { generatePptxFromOutline, generatePptx } from './services/ppt';
import { chatWithOpenAI, analyzeImageWithOpenAI, planSlidesWithOpenAI, refineSlidesWithOpenAI, formatOutlineForChat } from './services/openaiClient';
import { getOpenAIKey } from './config/env';
import { listThemes } from './services/themes';
import ThemePreview from './components/ThemePreview';

/**
 * App component
 * Provides:
 * - PDF upload
 * - Client-side PDF page rendering as images
 * - Extract text from each page
 * - LLM-based slide planning (group/split pages logically)
 * - Chat UI with OpenAI with preloaded proposed slide content for review
 * - Local PPTX generation and download (from outline) with user feedback incorporated
 * - Polished Mode + Theme: When enabled, nudge planning/refinement to use slide templates and selected theme; generation uses themed templates
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

  // Polished mode and Theme selection
  const [polishedMode, setPolishedMode] = useState(false);
  const [themeName, setThemeName] = useState('azure');
  const themeOptions = useMemo(() => {
    try {
      const list = listThemes();
      return Array.isArray(list) && list.length ? list : ['azure'];
    } catch {
      return ['azure'];
    }
  }, []);

  // Debug: track themeName and polishedMode changes
  useEffect(() => {
    console.log('[ThemeTrace] themeName state updated:', themeName);
  }, [themeName]);

  useEffect(() => {
    console.log('[ThemeTrace] polishedMode state updated:', polishedMode);
  }, [polishedMode]);

  const apiKeyAvailable = !!getOpenAIKey();

  // Auto Accent control + Strict Styles (debug/test)
  // - autoAccent: when true, accent can be auto-derived from images
  // - strictStyles: when true, forcibly lock styles (autoAccent=false) for fully locked exports
  const [autoAccent, setAutoAccent] = useState(true);
  const [strictStyles, setStrictStyles] = useState(false);

  // Initialize from URL/localStorage with sensible defaults
  // Supported URL params:
  //   ?autoAccent=false|0|no|off           -> disable auto accent
  //   ?strict=true|1|on|yes|lockedStyles   -> enable strict locked styles (forces autoAccent=false)
  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);

      // strictStyles: URL takes precedence, else localStorage, else default false
      const strictParam = qs.get('strict') ?? qs.get('lockedStyles') ?? qs.get('testMode');
      let strict = false;
      if (strictParam != null) {
        strict = /^(1|true|yes|on|locked|strict)$/i.test(String(strictParam));
      } else {
        const ls = typeof window !== 'undefined' ? window.localStorage?.getItem('strictStyles') : null;
        strict = ls === '1';
      }

      // autoAccent: URL takes precedence, else localStorage, else default true
      const aaParam = qs.get('autoAccent');
      let aa = true;
      if (aaParam == null) {
        const lsAA = typeof window !== 'undefined' ? window.localStorage?.getItem('autoAccent') : null;
        aa = lsAA == null ? true : lsAA !== '0';
      } else {
        aa = !/^(0|false|no|off)$/i.test(String(aaParam));
      }

      // Apply
      setStrictStyles(strict);
      // If strict, force autoAccent=false; otherwise use computed value
      setAutoAccent(strict ? false : aa);
    } catch {
      setStrictStyles(false);
      setAutoAccent(true);
    }
  }, []);

  // When strictStyles is enabled, ensure autoAccent is off
  useEffect(() => {
    if (strictStyles && autoAccent) {
      setAutoAccent(false);
    }
  }, [strictStyles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage and log
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('autoAccent', autoAccent ? '1' : '0');
      }
    } catch { /* ignore */ }
    console.log('[ThemeTrace] autoAccent flag (URL/init or UI):', autoAccent, 'URL:', typeof window !== 'undefined' ? window.location.search : '');
  }, [autoAccent]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('strictStyles', strictStyles ? '1' : '0');
      }
    } catch { /* ignore */ }
    console.log('[ThemeTrace] strictStyles flag (debug/test lock):', strictStyles);
  }, [strictStyles]);

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

      // Add planning guidance for polished mode and theme
      const planningGuidance = polishedMode
        ? `POLISHED MODE: ON.
Select and specify appropriate slide templates for each slide (e.g., "title-bullets", "image-right", "two-column", "comparison", "flowchart", "section-divider").
Set a top-level "theme":"${themeName}" field in the JSON output.`
        : `POLISHED MODE: OFF. Provide a straightforward outline; templates optional.`;

      // PUBLIC_INTERFACE
      const plan = await planSlidesWithOpenAI(
        pagesData,
        [userContext, planningGuidance].filter(Boolean).join('\n')
      );
      // If polished mode is on and theme not set, set it for generation
      if (polishedMode && plan && !plan.theme) {
        plan.theme = themeName;
      }
      console.log('[ThemeTrace] planSlidesWithOpenAI -> outline.theme:', plan?.theme, 'polishedMode:', polishedMode, 'selected themeName:', themeName);
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
  }, [pdfFile, chatHistory, pptBuilding, polishedMode, themeName]);

  const selectedSlides = useMemo(() => {
    return analysis.filter(s => !!s.include);
  }, [analysis]);

  const toggleInclude = (page) => {
    setAnalysis(prev => prev.map(s => s.page === page ? ({ ...s, include: !s.include }) : s));
  };

  const handleBuildPPT = async () => {
    // If no outline (user didn't analyze yet)
    if (!outline || !outline.slides || outline.slides.length === 0) {
      if (selectedSlides.length === 0) {
        alert('No outline available and no slides selected. Please Analyze the PDF first or toggle at least one page.');
        return;
      }
      if (analyzing) {
        alert('Please wait for analysis to complete before generating the PPT.');
        return;
      }

      // Backward compatibility: Polished Mode OFF -> legacy image-based PPT
      if (!polishedMode) {
        setPptBuilding(true);
        setPptReady(false);
        try {
          console.log('[ThemeTrace] Calling generatePptx (legacy) with themeName:', themeName, 'autoAccent:', autoAccent);
          await generatePptx(selectedSlides, 'Generated Presentation', { themeName, autoAccent });
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

      // Polished Mode ON but no outline: build a minimal template-aware outline from selected slides
      setPptBuilding(true);
      setPptReady(false);
      try {
        const imagesByPage = Object.fromEntries(pageImages.map(p => [p.page, p.dataUrl]));
        const minimalOutline = {
          theme: themeName,
          title: 'Generated Presentation',
          slides: selectedSlides.map(s => ({
            template: 'image-card',
            title: s.title || '',
            caption: s.caption || '',
            imagePages: [s.page]
          }))
        };
        // Build page metadata for captions from analysis
        const pageMeta = Object.fromEntries(analysis.map(a => [a.page, { title: a.title || "", caption: a.caption || "" }]));
        console.log('[ThemeTrace] Calling generatePptxFromOutline (minimal outline)', { enforcedThemeName: themeName, outlineTheme: minimalOutline?.theme, autoAccent });
        await generatePptxFromOutline(minimalOutline, imagesByPage, 'Generated Presentation', { themeName, pageMeta, autoAccent });
        lastBuildSlidesRef.current = minimalOutline.slides || [];
        setPptReady(true);
        setOutline(prev => prev && prev.slides?.length ? prev : minimalOutline);
        setChatHistory(prev => ([
          ...prev,
          { role: 'assistant', content: 'Generated a themed PPT using your currently selected pages.' }
        ]));
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
      const combinedFeedback = polishedMode
        ? `${userFeedback}\nPolished mode: ON. Use theme "${themeName}". Prefer crisp, modern templates (title-bullets, image-right, two-column, comparison, flowchart, section-divider). Ensure the returned JSON includes "theme":"${themeName}".`
        : userFeedback;

      const pages = pageTexts; // {page,text}
      // PUBLIC_INTERFACE
      const refinedRaw = await refineSlidesWithOpenAI(pages, { ...(outline || {}), ...(polishedMode ? { theme: themeName } : {}) }, combinedFeedback);
      const refined = polishedMode ? { ...refinedRaw, theme: themeName } : refinedRaw;
      setOutline(refined);

      // Map images by page for embedding
      const imagesByPage = Object.fromEntries(pageImages.map(p => [p.page, p.dataUrl]));

      // PUBLIC_INTERFACE
      const pageMeta = Object.fromEntries(analysis.map(a => [a.page, { title: a.title || "", caption: a.caption || "" }]));
      console.log('[ThemeTrace] Calling generatePptxFromOutline (refined)', { enforcedThemeName: themeName, outlineTheme: refined?.theme, autoAccent });
      await generatePptxFromOutline(refined, imagesByPage, 'Generated Presentation', { themeName, pageMeta, autoAccent });
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

          {/* Options: Polished Mode + Theme + Strict Styles (debug) + Auto Accent */}
          <div className="options">
            <label className="toggle">
              <input
                type="checkbox"
                checked={polishedMode}
                onChange={(e) => setPolishedMode(e.target.checked)}
                disabled={isBusy}
              />
              Polished Mode
            </label>

            <div className="option">
              <label htmlFor="theme-select" className="small">Theme</label>
              <select
                id="theme-select"
                className="select"
                value={themeName}
                onChange={(e) => { const v = e.target.value; console.log('[ThemeTrace] Theme select changed:', v); setThemeName(v); }}
                disabled={isBusy}
              >
                {themeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Debug/Test: Strict Styles lock (forces autoAccent=false) */}
            <label className="toggle" title="Debug: lock theme styles (disable auto accent derivation)">
              <input
                type="checkbox"
                checked={strictStyles}
                onChange={(e) => setStrictStyles(e.target.checked)}
                disabled={isBusy}
              />
              Strict Styles
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={autoAccent}
                onChange={(e) => setAutoAccent(e.target.checked)}
                disabled={isBusy || strictStyles}
              />
              Auto Accent
            </label>

            <div className="small">
              {polishedMode
                ? `Using "${themeName}" with template-aware rendering.`
                : 'Polished Mode off: simple generation is used if no outline.'}
              {' '}
              {strictStyles
                ? 'Strict Styles: ON (auto-accent disabled).'
                : (autoAccent ? 'Accent: Auto from images.' : 'Accent: Locked to theme (strict).')}
            </div>
          </div>

          <ThemePreview name={themeName} polished={polishedMode} />

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
                  {pptBuilding ? 'Building PPT...' : (polishedMode ? 'Generate Polished PPT' : 'Generate PPT')}
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
                placeholder='Type changes like: “Merge slides 2-3 and add a KPI slide.”'
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                disabled={sending || isBusy}
              />
              <button className="btn" type="submit" disabled={sending || !userMessage.trim() || isBusy}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>

            <div className="help">
              Tip: Your chat feedback is applied to the outline before generating the PPT.
              {polishedMode ? ` Theme: "${themeName}"` : ''}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
