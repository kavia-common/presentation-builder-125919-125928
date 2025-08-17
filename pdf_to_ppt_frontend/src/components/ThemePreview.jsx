import React from "react";
import { getTheme, getThemeInfo, accentColor } from "../services/themes";

/**
 * PUBLIC_INTERFACE
 * ThemePreview
 * Renders a live visual preview and descriptive summary of a selected theme.
 *
 * Props:
 *  - name: string (theme name from registry)
 *  - polished?: boolean (optional indicator; if true, shows a hint badge)
 *
 * The preview includes:
 *  - Sample title styled using theme.typography.title
 *  - Accent divider
 *  - Sample card (background, border, readable text/caption)
 *  - Color chips (primary, accent, background, text, border)
 *  - A brief description of the theme
 */
export default function ThemePreview({ name = "azure", polished = false }) {
  const theme = getTheme(name);
  const info = getThemeInfo(name);

  // Helpers to translate hex without # to CSS hex
  const h = (hex) => `#${String(hex || "000000")}`;

  const colors = theme?.colors || {};
  const t = theme?.typography || {};

  const titleFontSize = Math.max(28, t?.title?.fontSize || t?.h1?.fontSize || 28);
  const bodyFontSize = Math.max(16, t?.body?.fontSize || 16);
  const captionFontSize = Math.max(12, t?.caption?.fontSize || 12);

  const cardLine = theme?.cards?.line || {};
  const cardFill = theme?.cards?.fill || {};

  const chips = [
    { key: "Primary", value: colors.primary },
    { key: "Accent", value: colors.accent },
    { key: "Background", value: colors.background },
    { key: "Text", value: colors.text },
    { key: "Border", value: colors.border },
  ].filter((c) => !!c.value);

  return (
    <div
      className="theme-preview"
      role="region"
      aria-label={`Preview for theme ${info?.name || name}`}
      style={{
        borderColor: h(colors.border),
        background: h(colors.background),
        color: h(colors.text),
      }}
    >
      <div className="theme-preview-header">
        <div className="theme-preview-title">
          Theme: <strong>{info?.name || name}</strong>
          {polished ? <span className="badge" style={{ marginLeft: 8 }}>Polished Mode</span> : null}
        </div>
        {info?.description ? (
          <div className="theme-preview-desc">{info.description}</div>
        ) : null}
      </div>

      <div className="theme-preview-canvas">
        {/* Title sample */}
        <div
          className="theme-preview-sample-title"
          style={{
            fontSize: titleFontSize,
            fontWeight: (t?.title?.bold ?? true) ? 700 : 500,
            color: h(t?.title?.color || colors.text),
          }}
        >
          Sample Title (H1)
        </div>
        {/* Accent divider */}
        <div
          className="theme-preview-divider"
          style={{ background: h(accentColor(theme)) }}
        />

        {/* Sample content row: card + tokens */}
        <div className="theme-preview-row">
          <div
            className="theme-card"
            style={{
              background: h(cardFill?.color || colors.background),
              borderColor: h(cardLine?.color || colors.border),
            }}
          >
            <div
              className="theme-card-title"
              style={{
                fontSize: Math.max(18, t?.h2?.fontSize || 20),
                fontWeight: (t?.h2?.bold ?? true) ? 700 : 500,
                color: h(t?.h2?.color || colors.text),
              }}
            >
              Card Title
            </div>
            <div
              className="theme-card-body"
              style={{
                fontSize: bodyFontSize,
                color: h(t?.body?.color || colors.text),
              }}
            >
              Body text uses the theme's body typography. This preview demonstrates readable
              contrast on the current background.
            </div>
            <div
              className="theme-card-caption"
              style={{
                fontSize: captionFontSize,
                color: h(t?.caption?.color || colors.muted),
              }}
            >
              Caption text — helpful for notes or image labels.
            </div>
          </div>

          <div className="theme-tokens">
            <div className="token-row">
              <span className="token-key">Title size</span>
              <span className="token-val">{titleFontSize}px</span>
            </div>
            <div className="token-row">
              <span className="token-key">Body size</span>
              <span className="token-val">{bodyFontSize}px</span>
            </div>
            <div className="token-row">
              <span className="token-key">Caption size</span>
              <span className="token-val">{captionFontSize}px</span>
            </div>

            <div className="chip-list">
              {chips.map((c) => (
                <div className="chip" key={c.key}>
                  <span className="chip-swatch" style={{ background: h(c.value), borderColor: h(colors.border) }} />
                  <span className="chip-label">{c.key}</span>
                  <span className="chip-hex">{h(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
