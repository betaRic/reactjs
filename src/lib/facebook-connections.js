import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { bootstrapExistingStaffAdministrator, canRolePublish, ensureStaffIdentity, ensureTenantSchema, getStaffContext } from "@/lib/access-control";
import { getDatabaseReadiness, getSql } from "@/lib/database";
import { FacebookApiError } from "@/lib/facebook-server";

export const FACEBOOK_SESSION_COOKIE = "dilg_meta_session";
export const FACEBOOK_OAUTH_STATE_COOKIE = "dilg_meta_oauth_state";
export const FACEBOOK_SESSION_SECONDS = 60 * 60 * 12;

let schemaPromise;

export function getFacebookOAuthReadiness() {
  const missing = [];
  if (!clean(process.env.FACEBOOK_APP_ID)) missing.push("FACEBOOK_APP_ID");
  if (!clean(process.env.FACEBOOK_APP_SECRET)) missing.push("FACEBOOK_APP_SECRET");
  if (!clean(process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY)) missing.push("FACEBOOK_TOKEN_ENCRYPTION_KEY");
  missing.push(...getDatabaseReadiness().missing);
  return { available: missing.length === 0, missing };
}

export function getFacebookOAuthSettings(request) {
  const readiness = getFacebookOAuthReadiness();
  if (!readiness.available) {
    throw new FacebookApiError("Multi-Page Facebook connections are not configured on this deployment.", 503, { missing: readiness.missing });
  }
  const origin = clean(process.env.NEXT_PUBLIC_SITE_URL) || new URL(request.url).origin;
  return {
    appId: clean(process.env.FACEBOOK_APP_ID),
    appSecret: clean(process.env.FACEBOOK_APP_SECRET),
    graphVersion: clean(process.env.FACEBOOK_GRAPH_API_VERSION) || "v25.0",
    origin: origin.replace(/\/$/, ""),
    redirectUri: `${origin.replace(/\/$/, "")}/api/facebook/oauth/callback`,
  };
}

export function createOpaqueValue(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function safeValueEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function readRequestCookie(request, name) {
  const cookies = String(request.headers.get("cookie") || "").split(";");
  for (const entry of cookies) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(entry.slice(separator + 1).trim()); } catch { return ""; }
  }
  return "";
}

export async function getFacebookConnections(request) {
  const readiness = getFacebookOAuthReadiness();
  if (!readiness.available) return { available: false, connected: false, missing: readiness.missing, pages: [], selectedPageId: "" };
  const sessionId = validSessionId(readRequestCookie(request, FACEBOOK_SESSION_COOKIE));
  if (!sessionId) return { available: true, connected: false, missing: [], pages: [], selectedPageId: "" };
  await ensureSchema();
  const sql = getSql();
  await pruneExpiredSessions(sql);
  const sessionHash = hashSession(sessionId);
  const sessions = await sql`
    SELECT meta_user_id, user_name, selected_page_id
    FROM dilg_facebook_sessions
    WHERE session_hash = ${sessionHash} AND expires_at > NOW()
    LIMIT 1
  `;
  if (!sessions.length) return { available: true, connected: false, missing: [], pages: [], selectedPageId: "" };
  const connectedPages = await sql`
    SELECT page_id, page_name, picture_url, tasks
    FROM dilg_facebook_pages
    WHERE session_hash = ${sessionHash}
    ORDER BY page_name ASC
  `;
  await ensureStaffIdentity({
    metaUserId: sessions[0].meta_user_id,
    name: sessions[0].user_name,
    pages: connectedPages.map((page) => ({ id: page.page_id, name: page.page_name })),
  });
  const staff = await getStaffContext(sessions[0].meta_user_id);
  const membershipByPage = new Map(
    (staff?.status === "approved" ? staff.memberships : [])
      .filter((membership) => membership.pageId)
      .map((membership) => [membership.pageId, membership]),
  );
  const pages = connectedPages.filter((page) => membershipByPage.has(page.page_id));
  const selectedPageId = [sessions[0].selected_page_id, pages[0]?.page_id]
    .find((pageId) => pageId && pages.some((page) => page.page_id === pageId)) || "";
  return {
    available: true,
    connected: true,
    authenticated: true,
    missing: [],
    accountKey: createHash("sha256").update(`facebook-account:${sessions[0].meta_user_id}`).digest("hex").slice(0, 24),
    user: { name: sessions[0].user_name || "Facebook user" },
    staff: staff ? {
      status: staff.status,
      globalRole: staff.globalRole,
      isRegionalAdmin: staff.isRegionalAdmin,
      memberships: staff.memberships,
    } : { status: "pending", globalRole: "staff", isRegionalAdmin: false, memberships: [] },
    accessStatus: staff?.status || "pending",
    selectedPageId,
    pages: pages.map((page) => ({
      id: page.page_id,
      name: page.page_name,
      picture: page.picture_url || "",
      tasks: Array.isArray(page.tasks) ? page.tasks : [],
      officeId: membershipByPage.get(page.page_id)?.officeId || "",
      officeName: membershipByPage.get(page.page_id)?.officeName || page.page_name,
      role: membershipByPage.get(page.page_id)?.role || "viewer",
      canPublish: Boolean(membershipByPage.get(page.page_id)?.canPublish),
    })),
  };
}

export async function getSelectedOAuthFacebookConfig(request, pageId = "", { requirePublish = true } = {}) {
  const readiness = getFacebookOAuthReadiness();
  if (!readiness.available) return null;
  const sessionId = validSessionId(readRequestCookie(request, FACEBOOK_SESSION_COOKIE));
  if (!sessionId) return null;
  await ensureSchema();
  const sql = getSql();
  const sessionHash = hashSession(sessionId);
  const requestedPageId = clean(pageId || request.headers.get("x-facebook-page-id"));
  const rows = await sql`
    SELECT p.page_id, p.page_name, p.page_token, p.picture_url, m.role, o.id AS office_id, o.name AS office_name
    FROM dilg_facebook_sessions s
    JOIN dilg_staff_users u
      ON u.meta_user_id = s.meta_user_id
      AND u.status = 'approved'
    JOIN dilg_office_memberships m
      ON m.meta_user_id = s.meta_user_id
      AND m.active = TRUE
    JOIN dilg_offices o
      ON o.id = m.office_id
      AND o.active = TRUE
    JOIN dilg_facebook_pages p
      ON p.session_hash = s.session_hash
      AND p.page_id = o.facebook_page_id
      AND (${requestedPageId} = '' OR p.page_id = ${requestedPageId})
    WHERE s.session_hash = ${sessionHash} AND s.expires_at > NOW()
    ORDER BY CASE WHEN p.page_id = s.selected_page_id THEN 0 ELSE 1 END, p.page_name ASC
    LIMIT 1
  `;
  if (!rows.length && requestedPageId) throw new FacebookApiError("That Facebook Page is not available to this approved office account.", 403);
  if (!rows.length) return null;
  if (requirePublish && !canRolePublish(rows[0].role)) {
    throw new FacebookApiError("Your assigned office role does not allow Facebook publishing.", 403);
  }
  return {
    configured: true,
    mode: "account",
    pageId: rows[0].page_id,
    pageName: rows[0].page_name,
    pagePicture: rows[0].picture_url || "",
    officeId: rows[0].office_id,
    officeName: rows[0].office_name,
    officeRole: rows[0].role,
    canPublish: canRolePublish(rows[0].role),
    accessToken: decryptToken(rows[0].page_token),
    graphVersion: clean(process.env.FACEBOOK_GRAPH_API_VERSION) || "v25.0",
    missing: [],
  };
}

export async function saveFacebookConnections({ sessionId, user, pages }) {
  const validPages = pages.filter((page) => page.id && page.name && page.accessToken);
  if (!validPages.length) throw new FacebookApiError("No manageable Facebook Pages were returned for this account.", 400);
  await ensureSchema();
  const sql = getSql();
  await pruneExpiredSessions(sql);
  const sessionHash = hashSession(sessionId);
  const existing = await sql`SELECT selected_page_id FROM dilg_facebook_sessions WHERE session_hash = ${sessionHash} LIMIT 1`;
  const selectedPageId = validPages.some((page) => page.id === existing[0]?.selected_page_id) ? existing[0].selected_page_id : validPages[0].id;
  const expiresAt = new Date(Date.now() + FACEBOOK_SESSION_SECONDS * 1000);
  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO dilg_facebook_sessions (session_hash, meta_user_id, user_name, selected_page_id, expires_at, updated_at)
      VALUES (${sessionHash}, ${user.id}, ${user.name || "Facebook user"}, ${selectedPageId}, ${expiresAt}, NOW())
      ON CONFLICT (session_hash) DO UPDATE SET
        meta_user_id = EXCLUDED.meta_user_id,
        user_name = EXCLUDED.user_name,
        selected_page_id = EXCLUDED.selected_page_id,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `;
    await transaction`DELETE FROM dilg_facebook_pages WHERE session_hash = ${sessionHash}`;
    for (const page of validPages) {
      await transaction`
        INSERT INTO dilg_facebook_pages (session_hash, page_id, page_name, page_token, picture_url, tasks, updated_at)
        VALUES (${sessionHash}, ${page.id}, ${page.name}, ${encryptToken(page.accessToken)}, ${page.picture || ""}, ${transaction.json(page.tasks || [])}, NOW())
      `;
    }
  });
  await ensureStaffIdentity({ metaUserId: user.id, name: user.name, pages: validPages });
  return { selectedPageId };
}

export async function getFacebookSessionIdentity(request) {
  const sessionId = validSessionId(readRequestCookie(request, FACEBOOK_SESSION_COOKIE));
  if (!sessionId || !getFacebookOAuthReadiness().available) return null;
  await ensureSchema();
  const sql = getSql();
  const sessionHash = hashSession(sessionId);
  const sessions = await sql`
    SELECT meta_user_id, user_name, expires_at
    FROM dilg_facebook_sessions
    WHERE session_hash = ${sessionHash} AND expires_at > NOW()
    LIMIT 1
  `;
  if (!sessions.length) return null;
  const connectedPages = await sql`
    SELECT page_id, page_name
    FROM dilg_facebook_pages
    WHERE session_hash = ${sessionHash}
  `;
  await ensureStaffIdentity({
    metaUserId: sessions[0].meta_user_id,
    name: sessions[0].user_name,
    pages: connectedPages.map((page) => ({ id: page.page_id, name: page.page_name })),
  });
  return {
    metaUserId: sessions[0].meta_user_id,
    name: sessions[0].user_name,
    expiresAt: sessions[0].expires_at,
    sessionHash,
  };
}

export async function deleteFacebookConnection(request) {
  const sessionId = validSessionId(readRequestCookie(request, FACEBOOK_SESSION_COOKIE));
  if (!sessionId || !getFacebookOAuthReadiness().available) return;
  await ensureSchema();
  await getSql()`DELETE FROM dilg_facebook_sessions WHERE session_hash = ${hashSession(sessionId)}`;
}

async function pruneExpiredSessions(sql) {
  await sql`DELETE FROM dilg_facebook_sessions WHERE expires_at <= NOW()`;
}

async function ensureSchema() {
  if (!schemaPromise) {
    const sql = getSql();
    schemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_facebook_sessions (
          session_hash TEXT PRIMARY KEY,
          meta_user_id TEXT NOT NULL,
          user_name TEXT NOT NULL DEFAULT '',
          selected_page_id TEXT,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_facebook_pages (
          session_hash TEXT NOT NULL REFERENCES dilg_facebook_sessions(session_hash) ON DELETE CASCADE,
          page_id TEXT NOT NULL,
          page_name TEXT NOT NULL,
          page_token TEXT NOT NULL,
          picture_url TEXT NOT NULL DEFAULT '',
          tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (session_hash, page_id)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS dilg_facebook_pages_session_idx ON dilg_facebook_pages(session_hash)`;
      await sql`UPDATE dilg_facebook_sessions SET expires_at = LEAST(expires_at, NOW() + INTERVAL '12 hours')`;
      await ensureTenantSchema();
      await bootstrapExistingStaffAdministrator();
    })().catch((error) => {
      schemaPromise = null;
      throw new FacebookApiError("The Facebook connection database could not be initialized.", 503, { cause: error?.code || "database_error" });
    });
  }
  return schemaPromise;
}

function encryptToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value) {
  try {
    const [version, ivValue, tagValue, encryptedValue] = String(value || "").split(".");
    if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("invalid token");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new FacebookApiError("A stored Facebook connection could not be decrypted. Reconnect the Page.", 503);
  }
}

function encryptionKey() {
  return createHash("sha256").update(clean(process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY)).digest();
}

function hashSession(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validSessionId(value) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(String(value || "")) ? value : "";
}

function clean(value) {
  return String(value || "").trim();
}
