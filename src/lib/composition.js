export const DEFAULT_PHOTO_EDIT = Object.freeze({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 });
export const DEFAULT_EVENT_FIELDS = Object.freeze({ date: "", venue: "", subtitle: "" });
export const DEFAULT_COVER = Object.freeze({
  enabled: false,
  sourceMode: "existing",
  sourceImageId: "",
  templateId: "",
  duotone: "cherry",
  media: null,
  edit: DEFAULT_PHOTO_EDIT,
});

const LAYER_SOURCES = new Set(["campaign_title", "date", "venue", "subtitle", "custom"]);
const LAYER_SCOPES = new Set(["cover", "all_photos", "selected_photo"]);
const TEXT_ALIGNS = new Set(["left", "center", "right"]);
const FONT_FAMILIES = new Set(["Arial", "Inter", "Georgia", "Montserrat", "Poppins"]);

export function createTextLayer(source = "campaign_title", scope = "cover", photoId = "", id = "") {
  const resolvedSource = LAYER_SOURCES.has(source) ? source : "custom";
  return {
    id: id || `text-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    source: resolvedSource,
    text: resolvedSource === "custom" ? "Custom text" : "",
    scope: LAYER_SCOPES.has(scope) ? scope : "cover",
    photoId: scope === "selected_photo" ? String(photoId || "") : "",
    x: 8,
    y: resolvedSource === "campaign_title" ? 68 : 80,
    width: 84,
    rotation: 0,
    fontFamily: "Arial",
    fontSize: resolvedSource === "campaign_title" ? 5.4 : 3.2,
    fontWeight: resolvedSource === "campaign_title" ? 800 : 700,
    color: "#ffffff",
    align: "left",
    lineHeight: 1.08,
    letterSpacing: 0,
    outline: true,
  };
}

export function normalizeTextLayer(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const scope = LAYER_SCOPES.has(input.scope) ? input.scope : "cover";
  const source = LAYER_SOURCES.has(input.source) ? input.source : "custom";
  return {
    id: String(input.id || `text-${Math.random().toString(36).slice(2)}-${Date.now()}`),
    source,
    text: String(input.text || (source === "custom" ? "Custom text" : "")).slice(0, 240),
    scope,
    photoId: scope === "selected_photo" ? String(input.photoId || "") : "",
    x: clamp(numberOr(input.x, 8), 0, 100),
    y: clamp(numberOr(input.y, 68), 0, 100),
    width: clamp(numberOr(input.width, 84), 8, 100),
    rotation: normalizeRotation(input.rotation),
    fontFamily: FONT_FAMILIES.has(input.fontFamily) ? input.fontFamily : "Arial",
    fontSize: clamp(numberOr(input.fontSize, source === "campaign_title" ? 5.4 : 3.2), 1.4, 18),
    fontWeight: [400, 500, 600, 700, 800, 900].includes(Number(input.fontWeight)) ? Number(input.fontWeight) : 700,
    color: validColor(input.color) ? input.color : "#ffffff",
    align: TEXT_ALIGNS.has(input.align) ? input.align : "left",
    lineHeight: clamp(numberOr(input.lineHeight, 1.08), 0.8, 2),
    letterSpacing: clamp(numberOr(input.letterSpacing, 0), -2, 20),
    outline: input.outline !== false,
  };
}

export function normalizePhotoEdit(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    zoom: clamp(numberOr(input.zoom, 1), 1, 3),
    positionX: clamp(numberOr(input.positionX, 50), 0, 100),
    positionY: clamp(numberOr(input.positionY, 50), 0, 100),
    rotation: normalizeRightAngle(input.rotation),
  };
}

export function normalizeCover(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    enabled: Boolean(input.enabled),
    sourceMode: input.sourceMode === "upload" ? "upload" : "existing",
    sourceImageId: String(input.sourceImageId || ""),
    templateId: String(input.templateId || ""),
    duotone: ["none", "cherry", "auto"].includes(input.duotone) ? input.duotone : "cherry",
    edit: normalizePhotoEdit(input.edit),
    media: input.media && typeof input.media === "object"
      ? { ...input.media, type: "image", edit: normalizePhotoEdit(input.media.edit) }
      : null,
  };
}

export function normalizeCampaignComposition(campaign = {}) {
  const input = campaign && typeof campaign === "object" ? campaign : {};
  const legacy = migrateLegacyEventOverlay(input.eventOverlay, input.title);
  const layers = Array.isArray(input.textLayers) && input.textLayers.length
    ? input.textLayers.map(normalizeTextLayer)
    : legacy.layers;
  return {
    cover: normalizeCover(input.cover),
    eventFields: {
      date: String(input.eventFields?.date || legacy.eventFields.date || ""),
      venue: String(input.eventFields?.venue || legacy.eventFields.venue || ""),
      subtitle: String(input.eventFields?.subtitle || ""),
    },
    textLayers: layers,
    storySourceId: String(input.storySourceId || ""),
  };
}

export function resolveLayerText(layerValue, campaignTitle, eventFields = {}) {
  const layer = normalizeTextLayer(layerValue);
  if (layer.source === "campaign_title") return String(campaignTitle || "").trim();
  if (layer.source === "date") return formatEventDate(eventFields.date);
  if (layer.source === "venue") return String(eventFields.venue || "").trim();
  if (layer.source === "subtitle") return String(eventFields.subtitle || "").trim();
  return String(layer.text || "").trim();
}

export function layerAppliesTo(layerValue, target, photoId = "") {
  const layer = normalizeTextLayer(layerValue);
  if (target === "cover") return layer.scope === "cover";
  if (layer.scope === "all_photos") return true;
  return layer.scope === "selected_photo" && layer.photoId === String(photoId || "");
}

export function resolveCoverMedia(draft = {}) {
  const cover = normalizeCover(draft.cover);
  if (!cover.enabled) return null;
  if (cover.sourceMode === "upload" && cover.media?.src) return cover.media;
  return (Array.isArray(draft.images) ? draft.images : []).find((item) => item.id === cover.sourceImageId)
    || (Array.isArray(draft.images) ? draft.images.find((item) => item.type !== "video") : null)
    || null;
}

export function feedMedia(draft = {}) {
  const images = (Array.isArray(draft.images) ? draft.images : []).filter((item) => item.type !== "video");
  const coverMedia = resolveCoverMedia(draft);
  return [
    ...(coverMedia ? [{ ...coverMedia, id: "cover", compositionTarget: "cover" }] : []),
    ...images.map((item) => ({ ...item, compositionTarget: "photo" })),
  ];
}

export function facebookLayout(count, orientation = "square") {
  if (count <= 1) return { kind: "single", visible: Math.min(count, 1) };
  if (count === 2) return { kind: orientation === "landscape" ? "two-stacked" : "two-columns", visible: 2 };
  if (count === 3) return { kind: orientation === "landscape" ? "three-hero-top" : "three-hero-left", visible: 3 };
  if (count === 4) return { kind: "four-grid", visible: 4 };
  return { kind: "four-grid", visible: 4, overflow: count - 4 };
}

export function duotonePalette(mode, pixels = []) {
  if (mode === "none") return null;
  if (mode === "cherry") return { shadow: "#230710", highlight: "#f35369" };
  const sample = Array.isArray(pixels) ? pixels : [];
  if (!sample.length) return { shadow: "#101b35", highlight: "#5fc8d9" };
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (const pixel of sample) {
    if (!Array.isArray(pixel) || pixel.length < 3) continue;
    red += Number(pixel[0]) || 0;
    green += Number(pixel[1]) || 0;
    blue += Number(pixel[2]) || 0;
    count += 1;
  }
  if (!count) return { shadow: "#101b35", highlight: "#5fc8d9" };
  const average = [red / count, green / count, blue / count];
  const max = Math.max(...average, 1);
  const normalized = average.map((channel) => channel / max);
  const shadow = normalized.map((channel) => Math.round(10 + channel * 35));
  const highlight = normalized.map((channel) => Math.round(145 + channel * 95));
  return { shadow: rgbToHex(shadow), highlight: rgbToHex(highlight) };
}

export function migrateLegacyEventOverlay(value, campaignTitle = "") {
  const input = value && typeof value === "object" ? value : {};
  if (!input.enabled) return { eventFields: { ...DEFAULT_EVENT_FIELDS }, layers: [] };
  const titleLayer = createTextLayer("campaign_title", "all_photos");
  const x = Number.isFinite(Number(input.positionX)) ? Number(input.positionX) : 0;
  const y = Number.isFinite(Number(input.positionY)) ? Number(input.positionY) : 100;
  titleLayer.x = clamp(5 + x * 0.15, 2, 72);
  titleLayer.y = clamp(8 + y * 0.72, 2, 88);
  titleLayer.color = "#ffffff";
  const layers = [normalizeTextLayer(titleLayer)];
  if (input.date) {
    const dateLayer = createTextLayer("date", "all_photos");
    dateLayer.x = titleLayer.x;
    dateLayer.y = clamp(titleLayer.y + 10, 0, 94);
    dateLayer.fontSize = 2.6;
    layers.push(normalizeTextLayer(dateLayer));
  }
  if (input.location) {
    const venueLayer = createTextLayer("venue", "all_photos");
    venueLayer.x = titleLayer.x;
    venueLayer.y = clamp(titleLayer.y + 16, 0, 96);
    venueLayer.fontSize = 2.6;
    layers.push(normalizeTextLayer(venueLayer));
  }
  return {
    eventFields: {
      date: String(input.date || ""),
      venue: String(input.location || ""),
      subtitle: "",
    },
    layers,
    legacyTitle: String(input.title || campaignTitle || ""),
  };
}

export function formatEventDate(value) {
  if (!value) return "";
  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return String(value);
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parts[0], parts[1] - 1, parts[2]));
}

export function isSquareTemplate(template) {
  if (!template) return true;
  const width = Number(template.width || parseCanvasSize(template.size)[0] || 1);
  const height = Number(template.height || parseCanvasSize(template.size)[1] || 1);
  return Math.abs(width / height - 1) < 0.02;
}

function parseCanvasSize(value) {
  const match = String(value || "").match(/(\d+)\s*[×x]\s*(\d+)/i);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRightAngle(value) {
  return ((Math.round(numberOr(value, 0) / 90) * 90) % 360 + 360) % 360;
}

function normalizeRotation(value) {
  return ((numberOr(value, 0) % 360) + 360) % 360;
}

function validColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function rgbToHex(rgb) {
  return `#${rgb.map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
