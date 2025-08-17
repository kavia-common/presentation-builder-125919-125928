import { generatePptxFromOutline } from "./ppt";
import {
  getTheme,
  listThemes,
  accentColor as getAccentColor,
  titleTextStyle,
} from "./themes";

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
  });

  test("emerald themed export applies background and title color correctly", async () => {
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
    // Background tokens applied to slides via slideOptionsForTheme
    cap.slides.forEach((s) => {
      expect(s.opts).toBeDefined();
      expect(s.opts.bkgd).toBe(theme.colors.background);
    });

    // Title text style color applied on title slide addText options
    const titleTextCall = cap.texts.find((t) => t.text === "Deck Title");
    expect(titleTextCall).toBeTruthy();
    const expectedTitleColor = titleTextStyle(theme).color; // hex without '#'
    expect(titleTextCall.options.color).toBe(expectedTitleColor);

    // Accent line on TITLE_BULLETS template should match accent token
    const accentHex = getAccentColor(theme); // hex without '#'
    // Find a shape line with line.color === accentHex
    const accentLine = cap.shapes.find(
      (s) => s.type === "line" && s.options?.line?.color === accentHex
    );
    expect(accentLine).toBeTruthy();
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
      });
    }
  });
});
