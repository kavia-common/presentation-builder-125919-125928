import { generatePptxFromOutline } from "./ppt";
import {
  getTheme,
  listThemes,
  accentColor as getAccentColor,
  titleTextStyle,
} from "./themes";
import * as ThemesMod from "./themes";

// Mock pptxgenjs to capture slide/background/text/shapes data
let CAPTURED;
function resetCapture() {
  CAPTURED = {
    slides: [], // { opts, texts:[], shapes:[], images:[] }
    texts: [],
    shapes: [],
    images: [],
  };
}

jest.mock("pptxgenjs", () => {
  resetCapture();

  const makeSlide = (opts) => {
    const slide = {
      opts,
      addText: (text, options = {}) => {
        CAPTURED.texts.push({ text, options });
      },
      addShape: (type, options = {}) => {
        CAPTURED.shapes.push({ type, options });
      },
      addImage: (cfg = {}) => {
        CAPTURED.images.push(cfg);
      },
      addNotes: () => {},
    };
    CAPTURED.slides.push({ opts, slide });
    return slide;
  };

  const PptxGenJS = function () {
    return {
      addSlide: (opts = {}) => makeSlide(opts),
      writeFile: async () => {},
      write: async () => new Blob(),
    };
  };

  // Expose capture store for tests
  PptxGenJS.__getCaptured = () => CAPTURED;
  PptxGenJS.__reset = resetCapture;

  return PptxGenJS;
});

describe("PPT export theme application", () => {
  beforeEach(() => {
    const Pptx = require("pptxgenjs");
    Pptx.__reset();
    jest.restoreAllMocks();
  });

  test("emerald themed export applies background (both keys) and title color correctly", async () => {
    const themeName = "emerald";
    const outline = {
      theme: themeName,
      title: "Deck Title",
      slides: [
        {
          title: "Intro",
          bullets: ["Point A", "Point B"],
        },
      ],
    };

    await generatePptxFromOutline(outline, {}, "Deck Title", { themeName });

    const Pptx = require("pptxgenjs");
    const cap = Pptx.__getCaptured();

    const theme = getTheme(themeName);

    // First slide = title slide, second = content slide
    expect(cap.slides.length).toBeGreaterThanOrEqual(2);
    // Background tokens applied to slides via slideOptionsForTheme (both keys)
    cap.slides.forEach((s) => {
      expect(s.opts).toBeDefined();
      expect(s.opts.bkgd).toBe(theme.colors.background);
      expect(s.opts.background).toBe(theme.colors.background);
    });

    // Title text style color applied on title slide addText options
    const titleTextCall = cap.texts.find((t) => t.text === "Deck Title");
    expect(titleTextCall).toBeTruthy();
    const expectedTitleColor = titleTextStyle(theme).color; // hex without '#'
    expect(titleTextCall.options.color).toBe(expectedTitleColor);

    // Accent line on TITLE_BULLETS template should match accent token
    const accentHex = getAccentColor(theme); // hex without '#'
    const accentLine = cap.shapes.find(
      (s) => s.type === "line" && s.options?.line?.color === accentHex
    );
    expect(accentLine).toBeTruthy();
  });

  test("autoAccent=false bypasses deriveThemeWithAutoAccent and keeps accent unchanged even with images", async () => {
    const themeName = "emerald";
    const baseTheme = getTheme(themeName);
    const baseAccent = baseTheme.colors.accent;

    const deriveSpy = jest.spyOn(ThemesMod, "deriveThemeWithAutoAccent");

    const outline = {
      theme: themeName,
      title: "Deck",
      slides: [
        {
          title: "With Image & Bullets",
          bullets: ["A", "B"],
          imagePages: [1],
        },
      ],
    };

    // 1x1 PNG data URL (valid)
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Yp2KywAAAAASUVORK5CYII=";

    const Pptx = require("pptxgenjs");
    Pptx.__reset();
    await generatePptxFromOutline(
      outline,
      { 1: dataUrl },
      "Deck",
      { themeName, autoAccent: false }
    );

    // deriveThemeWithAutoAccent should NOT be called when autoAccent=false
    expect(deriveSpy).not.toHaveBeenCalled();

    const cap = Pptx.__getCaptured();

    // Find an accent line from template (IMAGE_RIGHT or TITLE_BULLETS)
    const accentLine = cap.shapes.find(
      (s) => s.type === "line" && s.options?.line?.color
    );
    expect(accentLine).toBeTruthy();
    expect(accentLine.options.line.color).toBe(baseAccent);
  });

  test("all themes: background token is used when generating slides (no images)", async () => {
    const all = listThemes();
    for (const name of all) {
      const outline = {
        theme: name,
        title: "T",
        slides: [{ title: "S", bullets: ["a"] }],
      };
      const Pptx = require("pptxgenjs");
      Pptx.__reset();

      await generatePptxFromOutline(outline, {}, "T", { themeName: name });

      const cap = Pptx.__getCaptured();
      const theme = getTheme(name);
      expect(cap.slides.length).toBeGreaterThanOrEqual(2);
      cap.slides.forEach((s) => {
        expect(s.opts.bkgd).toBe(theme.colors.background);
        expect(s.opts.background).toBe(theme.colors.background);
      });
    }
  });

  test("all themes with images: autoAccent=false -> accent lines match user-selected tokens exactly", async () => {
    const all = listThemes();
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Yp2KywAAAAASUVORK5CYII=";

    for (const name of all) {
      const outline = {
        theme: name,
        title: "Deck",
        slides: [
          {
            title: "Slide",
            bullets: ["Item 1"],
            imagePages: [1], // ensures candidate image exists
          },
        ],
      };
      const Pptx = require("pptxgenjs");
      Pptx.__reset();

      // autoAccent disabled
      await generatePptxFromOutline(outline, { 1: dataUrl }, "Deck", {
        themeName: name,
        autoAccent: false,
      });

      const cap = Pptx.__getCaptured();
      const theme = getTheme(name);
      const expectedAccent = theme.colors.accent;

      // Should have a line with accent color drawn by the template
      const line = cap.shapes.find(
        (s) => s.type === "line" && s.options?.line?.color === expectedAccent
      );

      expect(line).toBeTruthy();
    }
  });

  test("emerald bullets tokens applied in TITLE_BULLETS (bulletColor, bulletSize, indents) and spacing respected", async () => {
    const themeName = "emerald";
    const outline = {
      theme: themeName,
      title: "T",
      slides: [
        { template: "title-bullets", title: "Intro", bullets: ["Point A", "Point B"] }
      ],
    };
    const Pptx = require("pptxgenjs");
    Pptx.__reset();

    await generatePptxFromOutline(outline, {}, "T", { themeName });

    const cap = Pptx.__getCaptured();
    const theme = getTheme(themeName);
    const spacingX = theme.spacing.pageMarginX;

    // Find the bullets addText call (options.bullet === true)
    const bulletsTextCall = cap.texts.find((t) => t?.options?.bullet === true);
    expect(bulletsTextCall).toBeTruthy();

    // Verify bullet tokens mapping
    expect(bulletsTextCall.options.bulletColor).toBe(theme.bullets.bulletColor);
    expect(bulletsTextCall.options.bulletSize).toBe(theme.bullets.bulletSize);
    expect(bulletsTextCall.options.indentLevel).toBe(theme.bullets.indentLevel);
    expect(bulletsTextCall.options.indent).toBe(theme.bullets.indentLevel);

    // Verify spacing influenced left x (uses mx + 0.2 in renderer)
    expect(bulletsTextCall.options.x).toBeCloseTo(spacingX + 0.2, 5);
  });

  test("card tokens (fill, line, shadow, shape) used in COMPARISON template", async () => {
    const themeName = "emerald";
    const outline = {
      theme: themeName,
      title: "Deck",
      slides: [
        {
          template: "comparison",
          title: "Compare",
          left: { title: "A", bullets: ["a1", "a2"] },
          right: { title: "B", bullets: ["b1", "b2"] },
        }
      ],
    };
    const Pptx = require("pptxgenjs");
    Pptx.__reset();

    await generatePptxFromOutline(outline, {}, "Deck", { themeName });

    const cap = Pptx.__getCaptured();
    const theme = getTheme(themeName);

    // Expect at least two card shapes with theme-driven style
    const cardShapes = cap.shapes.filter((s) => s.type === (theme.cards.shape || "roundRect"));
    expect(cardShapes.length).toBeGreaterThanOrEqual(2);

    const aCard = cardShapes[0]?.options;
    expect(aCard).toBeTruthy();
    expect(aCard.fill?.color).toBe(theme.cards.fill.color);
    expect(aCard.line?.color).toBe(theme.cards.line.color);
    if (theme.cards.line.width != null) {
      expect(aCard.line.width).toBe(theme.cards.line.width);
    }
    // shadow can be undefined for some themes; if present, ensure type matches
    if (theme.cards.shadow) {
      expect(aCard.shadow?.type).toBe(theme.cards.shadow.type);
    }
  });
});
