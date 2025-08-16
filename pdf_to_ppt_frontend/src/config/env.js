//
/*
 Runtime environment helpers for public (client-side) configuration.
 Supports both build-time CRA env (process.env.REACT_APP_*) and a runtime override via window.__RUNTIME_CONFIG__.
*/

// Capture build-time injected values (CRA replaces these literals at build time).
const BUILD_OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY ?? undefined;
// Some environments set a doubly-prefixed variable; support it as a fallback:
const BUILD_OPENAI_API_KEY_COMPAT = process.env.REACT_APP_REACT_APP_OPENAI_API_KEY ?? undefined;

// PUBLIC_INTERFACE
export function getOpenAIKey() {
  /**
   * Returns the OpenAI API key for client use.
   * Priority:
   *  1) window.__RUNTIME_CONFIG__.REACT_APP_OPENAI_API_KEY (runtime, no rebuild)
   *  2) window.__RUNTIME_CONFIG__.REACT_APP_REACT_APP_OPENAI_API_KEY (compat)
   *  3) BUILD_OPENAI_API_KEY (from .env at build time)
   *  4) BUILD_OPENAI_API_KEY_COMPAT (compat)
   *
   * Note: Client-side keys are visible to users—use a restricted key only.
   */
  try {
    if (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) {
      const cfg = window.__RUNTIME_CONFIG__;
      if (cfg.REACT_APP_OPENAI_API_KEY) return cfg.REACT_APP_OPENAI_API_KEY;
      if (cfg.REACT_APP_REACT_APP_OPENAI_API_KEY) return cfg.REACT_APP_REACT_APP_OPENAI_API_KEY;
    }
  } catch {
    // ignore if window isn't available
  }
  return BUILD_OPENAI_API_KEY ?? BUILD_OPENAI_API_KEY_COMPAT;
}
