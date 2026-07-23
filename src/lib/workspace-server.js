import "server-only";

import { get, del } from "@vercel/blob";
import { ensureTenantSchema } from "@/lib/access-control";
import { getSql } from "@/lib/database";
import { getSelectedOAuthFacebookConfig } from "@/lib/facebook-connections";
import { FacebookApiError } from "@/lib/facebook-server";
import { canManageOfficeTemplates, canWriteCampaign } from "@/lib/workspace-policy";

let workspaceSchemaPromise;

export function getEditorBlobToken() {
  return clean(
    process.env.EDITOR_READ_WRITE_TOKEN
      || process.env.EDITOR_BLOB_READ_WRITE_TOKEN,
  );
}

export function getEditorStorageReadiness() {
  const available = Boolean(getEditorBlobToken());
  return {
    available,
    missing: available ? [] : ["EDITOR_READ_WRITE_TOKEN"],
  };
}

export async function getWorkspaceContext(request, { permission = "read", pageId = "" } = {}) {
  const context = await getSelectedOAuthFacebookConfig(request, pageId, { requirePublish: false });
  if (!context?.officeId) throw new FacebookApiError("Choose an approved office before opening its workspace.", 403);
  if (permission === "campaign:write" && !canWriteCampaign(context.officeRole)) {
    throw new FacebookApiError("Your office role is read-only.", 403);
  }
  if (permission === "template:write" && !canManageOfficeTemplates(context.officeRole)) {
    throw new FacebookApiError("Office administrator access is required to manage templates.", 403);
  }
  return context;
}

export async function getOfficeWorkspace(request) {
  const context = await getWorkspaceContext(request);
  await ensureWorkspaceSchema();
  const sql = getSql();
  const [templates, campaigns, media] = await Promise.all([
    sql`
      SELECT id, name, kind, asset_url, width, height, suggested_layers, created_at, updated_at
      FROM dilg_templates
      WHERE office_id = ${context.officeId}
      ORDER BY updated_at DESC
    `,
    sql`
      SELECT id, title, caption, status, template_id, scheduled_for, destinations, cover,
             event_fields, text_layers, story_source_id, revision, facebook_data,
             created_at, updated_at
      FROM dilg_campaigns
      WHERE office_id = ${context.officeId}
      ORDER BY updated_at DESC
    `,
    sql`
      SELECT id, campaign_id, media_kind, media_type, name, asset_url, width, height,
             duration, size_bytes, edit, order_index
      FROM dilg_campaign_media
      WHERE office_id = ${context.officeId}
      ORDER BY campaign_id, order_index
    `,
  ]);

  return {
    ok: true,
    office: {
      id: context.officeId,
      name: context.officeName,
      role: context.officeRole,
      canEdit: canWriteCampaign(context.officeRole),
      canManageTemplates: canManageOfficeTemplates(context.officeRole),
    },
    assetStorage: getEditorStorageReadiness(),
    templates: templates.map((item) => mapTemplate(item, context.pageId)),
    campaigns: campaigns.map((item) => mapCampaign(
      item,
      media.filter((entry) => entry.campaign_id === item.id),
      context.pageId,
    )),
  };
}

export async function saveOfficeCampaign(request, input = {}) {
  const context = await getWorkspaceContext(request, { permission: "campaign:write", pageId: input.pageId });
  await ensureWorkspaceSchema();
  const campaign = normalizeCampaignInput(input.campaign);
  if (!campaign.id || !campaign.title) throw new FacebookApiError("Campaign title is required.", 400);
  campaign.media.forEach((item) => assertOfficeAsset(item.assetUrl, context.officeId, { allowPublicVideo: item.type === "video" }));
  const sql = getSql();

  return sql.begin(async (transaction) => {
    const existing = await transaction`
      SELECT revision, office_id
      FROM dilg_campaigns
      WHERE id = ${campaign.id}
      FOR UPDATE
    `;
    if (existing.length && existing[0].office_id !== context.officeId) {
      throw new FacebookApiError("That campaign identifier is already in use. Save this campaign as a copy.", 409);
    }
    const requestedRevision = Number(campaign.revision || 0);
    if (existing.length && Number(existing[0].revision) !== requestedRevision) {
      throw new FacebookApiError("This campaign was updated by another staff member. Reload it or save your work as a copy.", 409, {
        currentRevision: Number(existing[0].revision),
      });
    }
    const requestedTemplateIds = [...new Set([campaign.templateId, clean(campaign.cover?.templateId)].filter(Boolean))];
    if (requestedTemplateIds.length) {
      const allowedTemplates = await transaction`
        SELECT id
        FROM dilg_templates
        WHERE office_id = ${context.officeId} AND id IN ${transaction(requestedTemplateIds)}
      `;
      if (allowedTemplates.length !== requestedTemplateIds.length) {
        throw new FacebookApiError("One of the selected templates is not available to this office.", 403);
      }
    }
    const nextRevision = existing.length ? requestedRevision + 1 : 1;
    await transaction`
      INSERT INTO dilg_campaigns (
        id, office_id, title, caption, status, template_id, scheduled_for, destinations,
        cover, event_fields, text_layers, story_source_id, revision, facebook_data,
        created_by, updated_by, created_at, updated_at
      )
      VALUES (
        ${campaign.id}, ${context.officeId}, ${campaign.title}, ${campaign.caption},
        ${campaign.status}, ${campaign.templateId || null}, ${campaign.scheduledFor || null},
        ${transaction.json(campaign.destinations)}, ${transaction.json(campaign.cover)},
        ${transaction.json(campaign.eventFields)}, ${transaction.json(campaign.textLayers)},
        ${campaign.storySourceId || ""}, ${nextRevision}, ${transaction.json(campaign.facebookData)},
        ${context.pageId}, ${context.pageId}, ${campaign.createdAt || new Date().toISOString()}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        caption = EXCLUDED.caption,
        status = EXCLUDED.status,
        template_id = EXCLUDED.template_id,
        scheduled_for = EXCLUDED.scheduled_for,
        destinations = EXCLUDED.destinations,
        cover = EXCLUDED.cover,
        event_fields = EXCLUDED.event_fields,
        text_layers = EXCLUDED.text_layers,
        story_source_id = EXCLUDED.story_source_id,
        revision = EXCLUDED.revision,
        facebook_data = EXCLUDED.facebook_data,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      WHERE dilg_campaigns.office_id = ${context.officeId}
    `;
    await transaction`
      DELETE FROM dilg_campaign_media
      WHERE campaign_id = ${campaign.id} AND office_id = ${context.officeId}
    `;
    for (const [index, item] of campaign.media.entries()) {
      await transaction`
        INSERT INTO dilg_campaign_media (
          id, campaign_id, office_id, media_kind, media_type, name, asset_url,
          width, height, duration, size_bytes, edit, order_index
        )
        VALUES (
          ${item.id}, ${campaign.id}, ${context.officeId}, ${item.mediaKind},
          ${item.type}, ${item.name}, ${item.assetUrl}, ${item.width}, ${item.height},
          ${item.duration}, ${item.size}, ${transaction.json(item.edit)}, ${index}
        )
      `;
    }
    const saved = await transaction`
      SELECT id, title, caption, status, template_id, scheduled_for, destinations, cover,
             event_fields, text_layers, story_source_id, revision, facebook_data,
             created_at, updated_at
      FROM dilg_campaigns
      WHERE id = ${campaign.id} AND office_id = ${context.officeId}
      LIMIT 1
    `;
    const savedMedia = await transaction`
      SELECT id, campaign_id, media_kind, media_type, name, asset_url, width, height,
             duration, size_bytes, edit, order_index
      FROM dilg_campaign_media
      WHERE campaign_id = ${campaign.id} AND office_id = ${context.officeId}
      ORDER BY order_index
    `;
    return mapCampaign(saved[0], savedMedia, context.pageId);
  });
}

export async function deleteOfficeCampaign(request, input = {}) {
  const context = await getWorkspaceContext(request, { permission: "campaign:write", pageId: input.pageId });
  await ensureWorkspaceSchema();
  const campaignId = clean(input.campaignId);
  if (!campaignId) throw new FacebookApiError("Choose a campaign to delete.", 400);
  const sql = getSql();
  const assets = await sql`
    SELECT asset_url
    FROM dilg_campaign_media
    WHERE campaign_id = ${campaignId} AND office_id = ${context.officeId}
  `;
  const removed = await sql`
    DELETE FROM dilg_campaigns
    WHERE id = ${campaignId} AND office_id = ${context.officeId}
    RETURNING id
  `;
  if (!removed.length) throw new FacebookApiError("That campaign was not found.", 404);
  await deleteUnreferencedPrivateAssets(sql, assets.map((item) => item.asset_url));
  return { ok: true };
}

export async function saveOfficeTemplate(request, input = {}) {
  const context = await getWorkspaceContext(request, { permission: "template:write", pageId: input.pageId });
  await ensureWorkspaceSchema();
  const template = normalizeTemplateInput(input.template);
  if (!template.id || !template.name) throw new FacebookApiError("Template name is required.", 400);
  assertOfficeAsset(template.assetUrl, context.officeId);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO dilg_templates (
      id, office_id, name, kind, asset_url, width, height, suggested_layers,
      created_by, updated_by, created_at, updated_at
    )
    VALUES (
      ${template.id}, ${context.officeId}, ${template.name}, ${template.kind},
      ${template.assetUrl}, ${template.width}, ${template.height},
      ${sql.json(template.suggestedLayers)}, ${context.pageId}, ${context.pageId},
      ${template.createdAt || new Date().toISOString()}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      asset_url = EXCLUDED.asset_url,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      suggested_layers = EXCLUDED.suggested_layers,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    WHERE dilg_templates.office_id = ${context.officeId}
    RETURNING id, name, kind, asset_url, width, height, suggested_layers, created_at, updated_at
  `;
  if (!rows.length) throw new FacebookApiError("A template with that identifier belongs to another office.", 409);
  return mapTemplate(rows[0], context.pageId);
}

export async function deleteOfficeTemplate(request, input = {}) {
  const context = await getWorkspaceContext(request, { permission: "template:write", pageId: input.pageId });
  await ensureWorkspaceSchema();
  const templateId = clean(input.templateId);
  const sql = getSql();
  const rows = await sql`
    DELETE FROM dilg_templates
    WHERE id = ${templateId} AND office_id = ${context.officeId}
    RETURNING asset_url
  `;
  if (!rows.length) throw new FacebookApiError("That template was not found.", 404);
  await sql`
    UPDATE dilg_campaigns
    SET template_id = NULL, updated_at = NOW(), revision = revision + 1
    WHERE office_id = ${context.officeId} AND template_id = ${templateId}
  `;
  await deletePrivateAssets(rows.map((item) => item.asset_url));
  return { ok: true };
}

export async function importOfficeWorkspace(request, input = {}) {
  const context = await getWorkspaceContext(request, { permission: "campaign:write", pageId: input.pageId });
  const templates = Array.isArray(input.templates) ? input.templates : [];
  const campaigns = Array.isArray(input.campaigns) ? input.campaigns : [];
  const imported = { campaigns: 0, templates: 0 };
  if (canManageOfficeTemplates(context.officeRole)) {
    for (const template of templates) {
      await saveOfficeTemplate(request, { pageId: input.pageId, template });
      imported.templates += 1;
    }
  }
  for (const campaign of campaigns) {
    await saveOfficeCampaign(request, { pageId: input.pageId, campaign: { ...campaign, revision: 0 } });
    imported.campaigns += 1;
  }
  return { ok: true, imported };
}

export async function streamOfficeAsset(request, kind, id) {
  const pageId = clean(new URL(request.url).searchParams.get("pageId"));
  const context = await getWorkspaceContext(request, { pageId });
  await ensureWorkspaceSchema();
  const sql = getSql();
  let rows = [];
  if (kind === "template") {
    rows = await sql`
      SELECT asset_url
      FROM dilg_templates
      WHERE id = ${clean(id)} AND office_id = ${context.officeId}
      LIMIT 1
    `;
  } else {
    rows = await sql`
      SELECT asset_url
      FROM dilg_campaign_media
      WHERE id = ${clean(id)} AND office_id = ${context.officeId}
      LIMIT 1
    `;
  }
  if (!rows.length) throw new FacebookApiError("That workspace asset was not found.", 404);
  const assetUrl = clean(rows[0].asset_url);
  if (assetUrl.startsWith("/")) return Response.redirect(new URL(assetUrl, request.url));
  const token = getEditorBlobToken();
  if (!token) throw new FacebookApiError("Private editor media storage is not configured.", 503, getEditorStorageReadiness());
  const result = await get(assetUrl, { access: "private", token });
  if (!result || result.statusCode !== 200 || !result.stream) throw new FacebookApiError("That workspace asset is unavailable.", 404);
  const headers = new Headers(result.headers);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Content-Disposition", "inline");
  return new Response(result.stream, { status: 200, headers });
}

export async function ensureWorkspaceSchema() {
  if (!workspaceSchemaPromise) {
    const sql = getSql();
    workspaceSchemaPromise = (async () => {
      await ensureTenantSchema();
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_templates (
          id TEXT PRIMARY KEY,
          office_id TEXT NOT NULL REFERENCES dilg_offices(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'cover')),
          asset_url TEXT NOT NULL,
          width INTEGER NOT NULL DEFAULT 1080,
          height INTEGER NOT NULL DEFAULT 1080,
          suggested_layers JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_by TEXT NOT NULL DEFAULT '',
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_campaigns (
          id TEXT PRIMARY KEY,
          office_id TEXT NOT NULL REFERENCES dilg_offices(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          caption TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Draft',
          template_id TEXT,
          scheduled_for TIMESTAMPTZ,
          destinations JSONB NOT NULL DEFAULT '["feed","story"]'::jsonb,
          cover JSONB NOT NULL DEFAULT '{}'::jsonb,
          event_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
          text_layers JSONB NOT NULL DEFAULT '[]'::jsonb,
          story_source_id TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 1,
          facebook_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_by TEXT NOT NULL DEFAULT '',
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_campaign_media (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL REFERENCES dilg_campaigns(id) ON DELETE CASCADE,
          office_id TEXT NOT NULL REFERENCES dilg_offices(id) ON DELETE CASCADE,
          media_kind TEXT NOT NULL DEFAULT 'photo' CHECK (media_kind IN ('photo', 'cover')),
          media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
          name TEXT NOT NULL DEFAULT '',
          asset_url TEXT NOT NULL,
          width INTEGER NOT NULL DEFAULT 0,
          height INTEGER NOT NULL DEFAULT 0,
          duration DOUBLE PRECISION NOT NULL DEFAULT 0,
          size_bytes BIGINT NOT NULL DEFAULT 0,
          edit JSONB NOT NULL DEFAULT '{}'::jsonb,
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS dilg_templates_office_idx ON dilg_templates(office_id, updated_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS dilg_campaigns_office_idx ON dilg_campaigns(office_id, updated_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS dilg_campaign_media_campaign_idx ON dilg_campaign_media(campaign_id, order_index)`;
    })().catch((error) => {
      workspaceSchemaPromise = null;
      if (error instanceof FacebookApiError) throw error;
      throw new FacebookApiError("The shared office workspace could not be initialized.", 503, {
        cause: error?.code || "database_error",
      });
    });
  }
  return workspaceSchemaPromise;
}

function mapTemplate(item, pageId) {
  const width = Number(item.width || 1080);
  const height = Number(item.height || 1080);
  return {
    id: item.id,
    name: item.name,
    kind: item.kind || "photo",
    assetUrl: item.asset_url,
    image: assetSource(item.asset_url, "template", item.id, pageId),
    width,
    height,
    size: `${width} × ${height}`,
    ratio: ratioLabel(width, height),
    suggestedLayers: Array.isArray(item.suggested_layers) ? item.suggested_layers : [],
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapCampaign(item, mediaRows, pageId) {
  const media = mediaRows.map((entry) => ({
    id: entry.id,
    type: entry.media_type || "image",
    mediaKind: entry.media_kind || "photo",
    name: entry.name || "",
    assetUrl: entry.asset_url,
    src: assetSource(entry.asset_url, "media", entry.id, pageId),
    width: Number(entry.width || 0),
    height: Number(entry.height || 0),
    duration: Number(entry.duration || 0),
    size: Number(entry.size_bytes || 0),
    edit: entry.edit || {},
  }));
  const images = media.filter((entry) => entry.mediaKind !== "cover");
  const coverMedia = media.find((entry) => entry.mediaKind === "cover") || null;
  const facebookData = item.facebook_data || {};
  return {
    id: item.id,
    title: item.title,
    caption: item.caption || "",
    status: item.status || "Draft",
    templateId: item.template_id || "",
    scheduledFor: item.scheduled_for || "",
    destinations: Array.isArray(item.destinations) ? item.destinations : ["feed", "story"],
    cover: { ...(item.cover || {}), media: coverMedia },
    eventFields: item.event_fields || {},
    textLayers: Array.isArray(item.text_layers) ? item.text_layers : [],
    storySourceId: item.story_source_id || "",
    revision: Number(item.revision || 1),
    images,
    ...facebookData,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function normalizeCampaignInput(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const cover = input.cover && typeof input.cover === "object" ? { ...input.cover } : {};
  const coverMedia = normalizeMedia(cover.media, "cover");
  delete cover.media;
  const images = (Array.isArray(input.images) ? input.images : []).map((item) => normalizeMedia(item, "photo")).filter(Boolean);
  const facebookData = {};
  [
    "publishedAt", "facebookPostId", "facebookStoryId", "facebookPermalink",
    "publishedDestinations", "facebookPageId", "facebookPageName",
  ].forEach((key) => {
    if (input[key] !== undefined) facebookData[key] = input[key];
  });
  return {
    id: clean(input.id).slice(0, 160),
    title: clean(input.title).slice(0, 180),
    caption: String(input.caption || "").slice(0, 5000),
    status: clean(input.status) || "Draft",
    templateId: clean(input.templateId),
    scheduledFor: validDate(input.scheduledFor),
    destinations: (Array.isArray(input.destinations) ? input.destinations : ["feed", "story"]).filter((item) => ["feed", "story"].includes(item)),
    cover,
    eventFields: input.eventFields && typeof input.eventFields === "object" ? input.eventFields : {},
    textLayers: Array.isArray(input.textLayers) ? input.textLayers.slice(0, 40) : [],
    storySourceId: clean(input.storySourceId),
    revision: Number(input.revision || 0),
    facebookData,
    media: [...(coverMedia ? [coverMedia] : []), ...images],
    createdAt: validDate(input.createdAt),
  };
}

function normalizeTemplateInput(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    id: clean(input.id).slice(0, 160),
    name: clean(input.name).slice(0, 120),
    kind: input.kind === "cover" ? "cover" : "photo",
    assetUrl: clean(input.assetUrl || input.image),
    width: Math.max(1, Number(input.width || parseCanvasSize(input.size)[0] || 1080)),
    height: Math.max(1, Number(input.height || parseCanvasSize(input.size)[1] || 1080)),
    suggestedLayers: Array.isArray(input.suggestedLayers) ? input.suggestedLayers.slice(0, 12) : [],
    createdAt: validDate(input.createdAt),
  };
}

function normalizeMedia(value, mediaKind) {
  if (!value || typeof value !== "object") return null;
  const assetUrl = clean(value.assetUrl || (String(value.src || "").startsWith("/") ? value.src : ""));
  if (!clean(value.id) || !assetUrl) return null;
  return {
    id: clean(value.id).slice(0, 160),
    mediaKind,
    type: value.type === "video" ? "video" : "image",
    name: clean(value.name).slice(0, 240),
    assetUrl,
    width: Math.max(0, Number(value.width || 0)),
    height: Math.max(0, Number(value.height || 0)),
    duration: Math.max(0, Number(value.duration || 0)),
    size: Math.max(0, Number(value.size || 0)),
    edit: value.edit && typeof value.edit === "object" ? value.edit : {},
  };
}

function assetSource(assetUrl, kind, id, pageId) {
  if (String(assetUrl || "").startsWith("/")) return assetUrl;
  return `/api/workspace/assets/${kind}/${encodeURIComponent(id)}?pageId=${encodeURIComponent(pageId || "")}`;
}

async function deletePrivateAssets(urls) {
  const token = getEditorBlobToken();
  const targets = [...new Set(urls.map(clean).filter((item) => item && !item.startsWith("/")))];
  if (!token || !targets.length) return;
  try {
    await del(targets, { token });
  } catch {
    // Database deletion remains authoritative; orphan cleanup can be retried later.
  }
}

async function deleteUnreferencedPrivateAssets(sql, urls) {
  const unreferenced = [];
  for (const assetUrl of [...new Set(urls.map(clean).filter(Boolean))]) {
    const rows = await sql`
      SELECT (
        EXISTS (SELECT 1 FROM dilg_campaign_media WHERE asset_url = ${assetUrl})
        OR EXISTS (SELECT 1 FROM dilg_templates WHERE asset_url = ${assetUrl})
      ) AS referenced
    `;
    if (!rows[0]?.referenced) unreferenced.push(assetUrl);
  }
  await deletePrivateAssets(unreferenced);
}

function parseCanvasSize(value) {
  const match = String(value || "").match(/(\d+)\s*[×x]\s*(\d+)/i);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function ratioLabel(width, height) {
  if (width === height) return "1:1";
  return `${(width / height).toFixed(2)}:1`;
}

function validDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function clean(value) {
  return String(value || "").trim();
}

function assertOfficeAsset(assetUrl, officeId, { allowPublicVideo = false } = {}) {
  const value = clean(assetUrl);
  if (!value) throw new FacebookApiError("A workspace media file is missing.", 400);
  if (value.startsWith("/")) {
    if (["/demo/", "/templates/", "/brand/"].some((prefix) => value.startsWith(prefix))) return;
    throw new FacebookApiError("That local asset path is not allowed.", 400);
  }
  let pathname = "";
  try {
    const url = new URL(value);
    if (allowPublicVideo && url.protocol === "https:") return;
    pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    throw new FacebookApiError("That workspace asset URL is invalid.", 400);
  }
  if (!pathname.startsWith(`office-media/${officeId}/`)) {
    throw new FacebookApiError("That private image does not belong to this office.", 403);
  }
}
