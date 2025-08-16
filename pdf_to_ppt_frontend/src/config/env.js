//
// Runtime environment helpers for public (client-side) configuration.
// Supports both build-time CRA env (process.env.REACT_APP_*) and a runtime override via window.__RUNTIME_CONFIG__.
//

// Capture build-time injected value (CRA replaces this literal at build time).
const BUILD_OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY ?? undefined;

// PUBLIC_INTERFACE
export function getOpenAIKey() {
  /**
   * Returns the OpenAI API key for client use.
   * Priority:
   *  1) window.__RUNTIME_CONFIG__.REACT_APP_OPENAI_API_KEY (runtime, no rebuild)
   *  2) BUILD_OPENAI_API_KEY (from .env at build time)
   *
   * Note: Client-side keys are visible to users—use a restricted key only.
   */
  try {
    if (typeof window !== "undefined" && window.__RUNTIME_CONFIG__ && window.__RUNTIME_CONFIG__.REACT_APP_OPENAI_API_KEY) {
      return window.__RUNTIME_CONFIG__.REACT_APP_OPENAI_API_KEY;
    }
  } catch {
    // ignore if window isn't available
  }
  return BUILD_OPENAI_API_KEY;
}
