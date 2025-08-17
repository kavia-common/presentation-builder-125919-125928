import React from "react";
import {
  getTheme,
  getThemeInfo,
  accentColor as getAccentColor,
  titleTextStyle,
  bodyTextStyle,
  captionTextStyle,
} from "../services/themes";

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
 *  - Sample title styled using the same normalized text styles as PPT export
 *  - Accent divider
 *  - Sample card (background, border, readable text/caption)
 *  - Color chips (primary, accent, background, text, border)
 *  - A brief description of the theme
 *
 * Notes:
 *  - PPT export may auto-tune the accent color based on images. This preview shows the base theme tokens.
 */
export default function ThemePreview({ name = "azure", polished = false }) {
  const theme = getTheme(name);
  const info = getThemeInfo(name);

  // Helpers: convert PPT hex (no #) to CSS hex (#RRGGBB)
  const h = (hex) => `#${String(hex || "000000")}`;

  const colors = theme?.colors || {};
  const t = theme?.typography || {};
  const cardLine = theme?.cards?.line || {};
  const cardFill = theme?.cards?.fill || {};

  // Use the SAME normalization used by PPT rendering for accurate preview
  const titleStylePpt = titleTextStyle(theme);     // { fontSize, bold, color, ... }
  const bodyStylePpt = bodyTextStyle(theme);       // { fontSize, color, ... }
  const captionStylePpt = captionTextStyle(theme); // { fontSize, color, italic? }

  // Derive CSS styles from PPT styles
  const cssTitle = {
    fontSize: Math.max(28, titleStylePpt?.fontSize || 28),
    fontWeight: titleStylePpt?.bold ? 700 : 500,
    color: h(titleStylePpt?.color || colors.text),
  };
  const cssBody = {
    fontSize: Math.max(16, bodyStylePpt?.fontSize || 16),
    color: h(bodyStylePpt?.color || colors.text),
  };
  const cssCaption = {
    fontSize: Math.max(12, captionStylePpt?.fontSize || 12),
    color: h(captionStylePpt?.color || colors.muted),
    fontStyle: captionStylePpt?.italic ? "italic" : "normal",
  };

  const chips = [
    { key: "Primary", value: colors.primary },
    { key: "Accent", value: getAccentColor(theme) || colors.accent },
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
        {/* Title sample using PPT-normalized title style */}
        <div className="theme-preview-sample-title" style={cssTitle}>
          Sample Title (H1)
        </div>

        {/* Accent divider */}
        <div
          className="theme-preview-divider"
          role="separator"
          aria-label="Theme accent divider"
          style={{ background: h(getAccentColor(theme)) }}
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
                fontWeight: 700,
                fontSize: Math.max(18, (t?.h2?.fontSize || 20)),
                color: h((t?.h2?.color || bodyStylePpt?.color || colors.text)),
              }}
            >
              Card Title
            </div>
            <div className="theme-card-body" style={cssBody}>
              Body text uses the theme's normalized body typography. This preview demonstrates
              the same contrast adjustments used during PPT export on the current background.
            </div>
            <div className="theme-card-caption" style={cssCaption}>
              Caption text — helpful for notes or image labels.
            </div>
          </div>

          <div className="theme-tokens">
            <div className="token-row">
              <span className="token-key">Title size</span>
              <span className="token-val">{cssTitle.fontSize}px</span>
            </div>
            <div className="token-row">
              <span className="token-key">Body size</span>
              <span className="token-val">{cssBody.fontSize}px</span>
            </div>
            <div className="token-row">
              <span className="token-key">Caption size</span>
              <span className="token-val">{cssCaption.fontSize}px</span>
            </div>

            <div className="chip-list">
              {chips.map((c) => (
                <div className="chip" key={c.key}>
                  <span
                    className="chip-swatch"
                    style={{ background: h(c.value), borderColor: h(colors.border) }}
                  />
                  <span className="chip-label">{c.key}</span>
                  <span className="chip-hex">{h(c.value)}</span>
                </div>
              ))}
            </div>

            <div className="small" style={{ marginTop: 6 }}>
              Note: PPT export may auto-tune the accent color from images to maintain contrast.
              Preview shows base theme tokens.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
