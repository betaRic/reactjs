import { describe, expect, it } from "vitest";
import {
  createTextLayer,
  duotonePalette,
  facebookLayout,
  feedMedia,
  layerAppliesTo,
  migrateLegacyEventOverlay,
  normalizeTextLayer,
  resolveLayerText,
} from "./composition";

describe("composition text layers", () => {
  it("links the campaign title without adding banner styling", () => {
    const layer = createTextLayer("campaign_title", "cover");
    expect(resolveLayerText(layer, "Regional Assembly", {})).toBe("Regional Assembly");
    expect(layer).not.toHaveProperty("background");
    expect(layer).not.toHaveProperty("stripe");
  });

  it("uses normalized geometry and enforces layer scope", () => {
    const layer = normalizeTextLayer({ ...createTextLayer("custom", "selected_photo", "photo-2"), x: 130, y: -4, width: 200 });
    expect(layer.x).toBe(100);
    expect(layer.y).toBe(0);
    expect(layer.width).toBe(100);
    expect(layerAppliesTo(layer, "photo", "photo-2")).toBe(true);
    expect(layerAppliesTo(layer, "photo", "photo-1")).toBe(false);
    expect(layerAppliesTo(layer, "cover", "photo-2")).toBe(false);
  });

  it("migrates the legacy overlay into independent plain text layers", () => {
    const migrated = migrateLegacyEventOverlay({
      enabled: true,
      title: "Old event",
      date: "2026-07-23",
      location: "Koronadal City",
      positionX: 50,
      positionY: 75,
    });
    expect(migrated.eventFields).toMatchObject({ date: "2026-07-23", venue: "Koronadal City" });
    expect(migrated.layers.map((layer) => layer.source)).toEqual(["campaign_title", "date", "venue"]);
    expect(migrated.layers.every((layer) => !("background" in layer))).toBe(true);
  });
});

describe("cover and Facebook output", () => {
  it("always puts an enabled cover before event photos", () => {
    const draft = {
      cover: {
        enabled: true,
        sourceMode: "upload",
        media: { id: "cover-media", src: "/cover.jpg", type: "image" },
      },
      images: [
        { id: "photo-1", src: "/one.jpg", type: "image" },
        { id: "photo-2", src: "/two.jpg", type: "image" },
      ],
    };
    const ordered = feedMedia(draft);
    expect(ordered.map((item) => item.id)).toEqual(["cover", "photo-1", "photo-2"]);
    expect(ordered[0].compositionTarget).toBe("cover");
  });

  it.each([
    [1, "single", 1, undefined],
    [2, "two-columns", 2, undefined],
    [3, "three-hero-left", 3, undefined],
    [4, "four-grid", 4, undefined],
    [7, "four-grid", 4, 3],
  ])("predicts the %i-photo gallery", (count, kind, visible, overflow) => {
    expect(facebookLayout(count)).toEqual({ kind, visible, ...(overflow ? { overflow } : {}) });
  });
});

describe("duotone palettes", () => {
  it("keeps Cherry fixed and Auto deterministic", () => {
    expect(duotonePalette("cherry")).toEqual({ shadow: "#230710", highlight: "#f35369" });
    const sample = [[220, 30, 40], [30, 80, 200], [80, 190, 90]];
    expect(duotonePalette("auto", sample)).toEqual(duotonePalette("auto", sample));
    expect(duotonePalette("auto", sample).shadow).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps Auto duotone colorful for neutral photographs", () => {
    const palette = duotonePalette("auto", [[120, 120, 120], [210, 210, 210]]);
    const shadowChannels = palette.shadow.match(/[0-9a-f]{2}/gi);
    const highlightChannels = palette.highlight.match(/[0-9a-f]{2}/gi);
    expect(new Set(shadowChannels).size).toBeGreaterThan(1);
    expect(new Set(highlightChannels).size).toBeGreaterThan(1);
  });

  it("uses user-picked colors for Custom duotone", () => {
    expect(duotonePalette("custom", [[120, 120, 120]], {
      shadow: "#112233",
      highlight: "#ddeeff",
    })).toEqual({
      shadow: "#112233",
      highlight: "#ddeeff",
    });
  });
});
