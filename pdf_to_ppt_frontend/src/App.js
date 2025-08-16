import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { pdfToImages } from './utils/pdf';
import { generatePptx } from './services/ppt';
import { chatWithOpenAI, analyzeImageWithOpenAI } from './services/openaiClient';

/**
 * App component
 * Provides:
 * - PDF upload
 * - Client-side PDF page rendering as images
 * - Image-by-image LLM analysis (include? title? caption?)
 * - Chat UI with OpenAI
 * - Local PPTX generation and download
 */
function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const [pageImages, setPageImages] = useState([]); // { page: number, dataUrl: string }
  const [analysis, setAnalysis] = useState([]); // per page results
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Hi! Upload a PDF and press Analyze to pick the most important visuals for your slides. You can also chat with me to guide the tone and selection.' }
  ]);
  const [userMessage, setUserMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [pptBuilding, setPptBuilding] = useState(false);
  const [pptReady, setPptReady] = useState(false);
  const lastBuildSlidesRef = useRef([]);

  const apiKeyAvailable = !!process.env.REACT_APP_OPENAI_API_KEY;

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
    setAnalysis([]);
    setProgress(0);
    setAnalyzing(false);
    setPptReady(false);
    lastBuildSlidesRef.current = [];
  };

  const handleAnalyze = useCallback(async () => {
    if (!pdfFile) return;
    if (!process.env.REACT_APP_OPENAI_API_KEY) {
      alert('Missing OpenAI API key. Please set REACT_APP_OPENAI_API_KEY in .env.');
      return;
    }

    setAnalyzing(true);
    setProgress(0);
    setAnalysis([]);
    try {
      const images = await pdfToImages(pdfFile, 1024);
      setPageImages(images);

      const results = [];
      const userContext = chatHistory
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n');

      for (let i = 0; i < images.length; i += 1) {
        const img = images[i];
        // Ask the LLM to judge and describe each page image
        // to determine if it should be included
        // PUBLIC_INTERFACE
        const analysisResult = await analyzeImageWithOpenAI(img.dataUrl, userContext);
        results.push({
          page: img.page,
          imageDataUrl: img.dataUrl,
          ...analysisResult,
          include: analysisResult?.include ?? false,
        });
        setProgress(Math.round(((i + 1) / images.length) * 100));
        setAnalysis([...results]); // update progressively
      }
    } catch (err) {
      console.error(err);
      alert('Failed to analyze PDF. See console for details.');
    } finally {
      setAnalyzing(false);
    }
  }, [pdfFile, chatHistory]);

  const selectedSlides = useMemo(() => {
    return analysis.filter(s => !!s.include);
  }, [analysis]);

  const toggleInclude = (page) => {
    setAnalysis(prev => prev.map(s => s.page === page ? ({ ...s, include: !s.include }) : s));
  };

  const handleBuildPPT = async () => {
    if (selectedSlides.length === 0) {
      alert('No slides selected. Toggle at least one to include.');
      return;
    }
    setPptBuilding(true);
    setPptReady(false);
    try {
      // PUBLIC_INTERFACE
      await generatePptx(selectedSlides, 'Generated Presentation');
      lastBuildSlidesRef.current = selectedSlides;
      setPptReady(true);
    } catch (e) {
      console.error(e);
      alert('Failed to generate PPT.');
    } finally {
      setPptBuilding(false);
    }
  };

  const sendMessage = async (e) => {
    e?.preventDefault?.();
    if (!userMessage.trim()) return;
    if (!process.env.REACT_APP_OPENAI_API_KEY) {
      alert('Missing OpenAI API key. Please set REACT_APP_OPENAI_API_KEY in .env.');
      return;
    }

    const newHistory = [...chatHistory, { role: 'user', content: userMessage }];
    setChatHistory(newHistory);
    setUserMessage('');
    setSending(true);

    try {
      // PUBLIC_INTERFACE
      const assistantReply = await chatWithOpenAI(newHistory);
      setChatHistory([...newHistory, { role: 'assistant', content: assistantReply }]);
    } catch (err) {
      console.error(err);
      setChatHistory([...newHistory, { role: 'assistant', content: 'Sorry, something went wrong while contacting OpenAI.' }]);
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
            <p className="subtitle">Upload a PDF, let AI pick the best visuals, and download your presentation.</p>
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
            <button className="btn" onClick={handleAnalyze} disabled={!pdfFile || analyzing}>
              {analyzing ? 'Analyzing...' : 'Analyze PDF'}
            </button>
            <button className="btn muted" onClick={() => resetWork()} disabled={!pdfFile && pageImages.length === 0 && analysis.length === 0}>
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
                <button className="btn" onClick={handleBuildPPT} disabled={pptBuilding}>
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
            <p className="subtitle">Guide the selection criteria. Example: “Focus on charts with KPIs and skip raw tables.”</p>
          </div>

          <div className="chat">
            <div className="chat-log" aria-label="chat log">
              {chatHistory.map((m, idx) => (
                <div key={idx} className={`msg ${m.role === 'user' ? 'user' : 'assistant'}`}>
                  {m.content}
                </div>
              ))}
            </div>

            <form className="chat-input" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder="Type a message for the assistant..."
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
              />
              <button className="btn" type="submit" disabled={sending || !userMessage.trim()}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>

            <div className="help">Tip: Your chat guidance is used when evaluating which pages/images to include.</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
