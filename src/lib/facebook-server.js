import "server-only";

import { timingSafeEqual } from "node:crypto";

const DEFAULT_GRAPH_VERSION = "v25.0";
const GRAPH_ORIGIN = "https://graph.facebook.com";
const MAX_ATTEMPTS = 3;

export class FacebookApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = "FacebookApiError";
    this.status = status;
    this.details = details;
  }
}

export function getFacebookConfig({ allowMissing = false } = {}) {
  const config = {
    pageId: clean(process.env.FACEBOOK_PAGE_ID),
    accessToken: clean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN),
    publishKey: clean(process.env.FACEBOOK_PUBLISH_KEY),
    graphVersion: clean(process.env.FACEBOOK_GRAPH_API_VERSION) || DEFAULT_GRAPH_VERSION,
  };
  const missing = [];
  if (!config.pageId) missing.push("FACEBOOK_PAGE_ID");
  if (!config.accessToken) missing.push("FACEBOOK_PAGE_ACCESS_TOKEN");
  if (!config.publishKey) missing.push("FACEBOOK_PUBLISH_KEY");
  if (missing.length && !allowMissing) {
    throw new FacebookApiError("Facebook publishing is not configured on this deployment.", 503, { missing });
  }
  return { ...config, configured: missing.length === 0, missing };
}

export function requirePublishAccess(request, config) {
  const supplied = clean(request.headers.get("x-publish-key"));
  if (!supplied || !safeEqual(supplied, config.publishKey)) {
    throw new FacebookApiError("The publishing key is missing or incorrect.", 401);
  }
}

export async function getPageIdentity(config) {
  return graphRequest(config, `${config.pageId}`, {
    search: { fields: "id,name,link,picture.type(square)" },
    label: "Check Facebook Page connection",
  });
}

export async function uploadUnpublishedPhoto(config, file) {
  const form = new FormData();
  form.set("published", "false");
  form.set("source", file, clean(file.name) || "campaign-photo.jpg");
  const result = await graphRequest(config, `${config.pageId}/photos`, {
    method: "POST",
    body: form,
    label: "Upload Facebook photo",
  });
  if (!result.id) throw new FacebookApiError("Meta did not return an ID for the uploaded photo.", 502);
  return result;
}

export async function createPagePost(config, { message, mediaIds, scheduledFor }) {
  const body = new URLSearchParams();
  body.set("message", clean(message));
  mediaIds.forEach((id, index) => body.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: id })));

  let scheduled = false;
  if (scheduledFor) {
    const scheduleDate = new Date(scheduledFor);
    const minimum = Date.now() + 10 * 60 * 1000;
    if (!Number.isFinite(scheduleDate.getTime())) throw new FacebookApiError("The scheduled date is invalid.", 400);
    if (scheduleDate.getTime() < minimum) {
      throw new FacebookApiError("Facebook scheduled posts must be at least 10 minutes in the future.", 400);
    }
    body.set("published", "false");
    body.set("scheduled_publish_time", String(Math.floor(scheduleDate.getTime() / 1000)));
    scheduled = true;
  }

  const result = await graphRequest(config, `${config.pageId}/feed`, {
    method: "POST",
    body,
    label: scheduled ? "Schedule Facebook post" : "Publish Facebook post",
  });
  if (!result.id) throw new FacebookApiError("Meta did not return an ID for the post.", 502);

  let permalink = "";
  if (!scheduled) {
    try {
      const post = await graphRequest(config, result.id, {
        search: { fields: "id,permalink_url,created_time" },
        label: "Read published Facebook post",
      });
      permalink = post.permalink_url || "";
    } catch {
      // Publishing already succeeded; a missing permalink must not turn it into a false failure.
    }
  }
  return { postId: result.id, permalink, scheduled };
}

export function toRouteError(error) {
  const status = Number(error?.status) || 500;
  const message = error instanceof FacebookApiError ? error.message : "The Facebook request could not be completed.";
  return Response.json({ ok: false, error: message, details: error?.details || null }, { status });
}

async function graphRequest(config, path, { method = "GET", body, search = {}, label = "Facebook request" } = {}) {
  const url = new URL(`${GRAPH_ORIGIN}/${config.graphVersion}/${String(path).replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${config.accessToken}` },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && !payload.error) return payload;
      const graphError = payload.error || {};
      const retryable = response.status === 429 || response.status >= 500 || graphError.is_transient;
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      lastError = new FacebookApiError(graphError.message || `${label} failed.`, status, {
        code: graphError.code || null,
        subcode: graphError.error_subcode || null,
        type: graphError.type || "",
        fbtraceId: graphError.fbtrace_id || "",
      });
      if (!retryable || attempt === MAX_ATTEMPTS) throw lastError;
    } catch (error) {
      if (error instanceof FacebookApiError && error.status < 500) throw error;
      lastError = error instanceof FacebookApiError
        ? error
        : new FacebookApiError(`${label} could not reach Meta.`, 502);
      if (attempt === MAX_ATTEMPTS) throw lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 450 * 2 ** (attempt - 1)));
  }
  throw lastError || new FacebookApiError(`${label} failed.`, 502);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function clean(value) {
  return String(value || "").trim();
}
