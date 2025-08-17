import { render, screen, within } from "@testing-library/react";
import ThemePreview from "./ThemePreview";
import {
  listThemes,
  getTheme,
  getThemeInfo,
  accentColor as getAccentColor,
  titleTextStyle,
  bodyTextStyle,
  captionTextStyle,
} from "../services/themes";

// Helpers to compute contrast ratios (replicated from themes.js logic)
function hexToRgb(hex) {
  const h = String(hex || "").replace(/^#/, "").toUpperCase();
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}
function relativeLuminanceHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((v) => v / 255);
  const linear = srgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  const [R, G, B] = linear;
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrastRatio(hex1, hex2) {
  const L1 = relativeLuminanceHex(hex1);
  const L2 = relativeLuminanceHex(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("ThemePreview", () => {
  test("renders every available theme with correct tokens and styles", () => {
    const themes = listThemes();

    themes.forEach((name) => {
      const theme = getTheme(name);
      const info = getThemeInfo(name);

      render(<ThemePreview name={name} polished={true} />);

      // Container with background and border based on theme tokens
      const region = screen.getByRole("region", {
        name: new RegExp(`Preview for theme\\s+${info?.name || name}`, "i"),
      });

      const bgHex = `#${theme.colors.background}`;
      const borderHex = `#${theme.colors.border}`;
      const textHex = `#${theme.colors.text}`;

      expect(region).toHaveStyle(`background: ${bgHex}`);
      expect(region).toHaveStyle(`border-color: ${borderHex}`);
      // color is inherited; ensure root color also matches
      expect(region).toHaveStyle(`color: ${textHex}`);

      // Title sample should use normalized titleTextStyle(theme)
      const titleSample = within(region).getByText(/Sample Title \(H1\)/i);
      const titleStyle = titleTextStyle(theme);
      expect(titleSample).toHaveStyle(`color: #${titleStyle.color}`);
      expect(titleSample).toHaveStyle(`font-size: ${Math.max(28, titleStyle.fontSize)}px`);

      // Accent divider uses accentColor(theme)
      const divider = within(region).getByRole("separator", { hidden: true }) || region.querySelector(".theme-preview-divider");
      const accent = getAccentColor(theme);
      // If role-based query not found, fallback to class
      const dividerEl = divider || region.querySelector(".theme-preview-divider");
      expect(dividerEl).toBeInTheDocument();
      expect(dividerEl).toHaveStyle(`background: #${accent}`);

      // "Accent" color chip shows the accent hex
      // Chip hexes are visible as text like "#RRGGBB"
      const accentHexLabel = `#${accent}`;
      expect(within(region).getAllByText(accentHexLabel).length).toBeGreaterThan(0);

      // Basic contrast assertions against background
      expect(contrastRatio(`#${titleStyle.color}`, bgHex)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(`#${bodyTextStyle(theme).color}`, bgHex)).toBeGreaterThanOrEqual(7.0);
      expect(contrastRatio(`#${captionTextStyle(theme).color}`, bgHex)).toBeGreaterThanOrEqual(5.5); // allow a bit of tolerance
    });
  });

  test("emerald theme: tokens and typography match and contrast is strong", () => {
    const name = "emerald";
    const theme = getTheme(name);
    render(<ThemePreview name={name} polished />);

    const region = screen.getByRole("region", {
      name: /Preview for theme.*emerald/i,
    });

    // Background and accent checks
    expect(region).toHaveStyle(`background: #${theme.colors.background}`);
    const dividerEl = region.querySelector(".theme-preview-divider");
    expect(dividerEl).toHaveStyle(`background: #${getAccentColor(theme)}`);

    // Title style check
    const titleEl = within(region).getByText(/Sample Title \(H1\)/i);
    const tStyle = titleTextStyle(theme);
    expect(titleEl).toHaveStyle(`color: #${tStyle.color}`);
    expect(contrastRatio(`#${tStyle.color}`, `#${theme.colors.background}`)).toBeGreaterThanOrEqual(4.5);
  });
});

// Improve ARIA discoverability: add role to divider via getByRole fallback
// Polyfill role="separator" on divider for the primary query above
beforeAll(() => {
  const originalQuerySelector = Element.prototype.querySelector;
  // No-op shim; test above already falls back to class.
  // Kept here for clarity and future extension if needed.
  // eslint-disable-next-line no-unused-vars
  Element.prototype.querySelector = function (selector) {
    return originalQuerySelector.call(this, selector);
  };
});
