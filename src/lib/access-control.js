import "server-only";

import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/database";
import { FacebookApiError } from "@/lib/facebook-server";

export const STAFF_STATUSES = ["pending", "approved", "suspended"];
export const GLOBAL_ROLES = ["staff", "regional_admin"];
export const OFFICE_ROLES = ["office_admin", "publisher", "editor", "viewer"];
export const PUBLISHING_ROLES = ["office_admin", "publisher"];

const DEFAULT_OFFICES = [
  ["regional-office-xii", "DILG Regional Office XII", "regional"],
  ["cotabato-province", "DILG Cotabato Province", "province"],
  ["south-cotabato", "DILG South Cotabato", "province"],
  ["sarangani", "DILG Sarangani Province", "province"],
  ["sultan-kudarat", "DILG Sultan Kudarat", "province"],
  ["general-santos", "DILG General Santos City", "city"],
];

let tenantSchemaPromise;

export async function ensureTenantSchema() {
  if (!tenantSchemaPromise) {
    const sql = getSql();
    tenantSchemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_staff_users (
          meta_user_id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
          global_role TEXT NOT NULL DEFAULT 'staff' CHECK (global_role IN ('staff', 'regional_admin')),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_offices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          office_type TEXT NOT NULL DEFAULT 'other' CHECK (office_type IN ('regional', 'province', 'city', 'other')),
          facebook_page_id TEXT UNIQUE,
          facebook_page_name TEXT NOT NULL DEFAULT '',
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_office_memberships (
          meta_user_id TEXT NOT NULL REFERENCES dilg_staff_users(meta_user_id) ON DELETE CASCADE,
          office_id TEXT NOT NULL REFERENCES dilg_offices(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('office_admin', 'publisher', 'editor', 'viewer')),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (meta_user_id, office_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS dilg_access_audit (
          id BIGSERIAL PRIMARY KEY,
          actor_meta_user_id TEXT,
          action TEXT NOT NULL,
          target_meta_user_id TEXT,
          office_id TEXT,
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS dilg_memberships_user_idx ON dilg_office_memberships(meta_user_id) WHERE active = TRUE`;
      await sql`CREATE INDEX IF NOT EXISTS dilg_access_audit_created_idx ON dilg_access_audit(created_at DESC)`;
      for (const [id, name, officeType] of DEFAULT_OFFICES) {
        await sql`
          INSERT INTO dilg_offices (id, name, office_type)
          VALUES (${id}, ${name}, ${officeType})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    })().catch((error) => {
      tenantSchemaPromise = null;
      throw new FacebookApiError("The staff access database could not be initialized.", 503, { cause: error?.code || "database_error" });
    });
  }
  return tenantSchemaPromise;
}

export async function ensureStaffIdentity({ metaUserId, name, pages = [] }) {
  const userId = clean(metaUserId);
  if (!userId) throw new FacebookApiError("Facebook did not return a valid staff identity.", 400);
  await ensureTenantSchema();
  const sql = getSql();
  return sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(1200122026)`;
    const existing = await transaction`
      SELECT meta_user_id, name, status, global_role
      FROM dilg_staff_users
      WHERE meta_user_id = ${userId}
      LIMIT 1
    `;
    if (existing.length) {
      const updated = await transaction`
        UPDATE dilg_staff_users
        SET name = ${clean(name) || existing[0].name || "Facebook user"}, last_seen_at = NOW(), updated_at = NOW()
        WHERE meta_user_id = ${userId}
        RETURNING meta_user_id, name, status, global_role
      `;
      return updated[0];
    }

    const adminCount = await transaction`
      SELECT COUNT(*)::int AS count
      FROM dilg_staff_users
      WHERE global_role = 'regional_admin' AND status = 'approved'
    `;
    const bootstrapAdmin = Number(adminCount[0]?.count || 0) === 0;
    const inserted = await transaction`
      INSERT INTO dilg_staff_users (meta_user_id, name, status, global_role)
      VALUES (${userId}, ${clean(name) || "Facebook user"}, ${bootstrapAdmin ? "approved" : "pending"}, ${bootstrapAdmin ? "regional_admin" : "staff"})
      RETURNING meta_user_id, name, status, global_role
    `;

    if (bootstrapAdmin) {
      for (const page of validPageSummaries(pages)) {
        const officeId = matchDefaultOffice(page.name) || `office-${safeId(page.id)}`;
        await transaction`
          INSERT INTO dilg_offices (id, name, office_type, facebook_page_id, facebook_page_name)
          VALUES (${officeId}, ${page.name}, ${inferOfficeType(page.name)}, ${page.id}, ${page.name})
          ON CONFLICT (id) DO UPDATE SET
            facebook_page_id = COALESCE(dilg_offices.facebook_page_id, EXCLUDED.facebook_page_id),
            facebook_page_name = CASE WHEN dilg_offices.facebook_page_id IS NULL THEN EXCLUDED.facebook_page_name ELSE dilg_offices.facebook_page_name END,
            updated_at = NOW()
        `;
        await transaction`
          INSERT INTO dilg_office_memberships (meta_user_id, office_id, role)
          VALUES (${userId}, ${officeId}, 'office_admin')
          ON CONFLICT (meta_user_id, office_id) DO UPDATE SET role = 'office_admin', active = TRUE, updated_at = NOW()
        `;
      }
      await writeAudit(transaction, {
        actorMetaUserId: userId,
        action: "bootstrap_regional_administrator",
        targetMetaUserId: userId,
        details: { connectedPages: validPageSummaries(pages).length },
      });
    } else {
      await writeAudit(transaction, {
        actorMetaUserId: userId,
        action: "staff_access_requested",
        targetMetaUserId: userId,
        details: { connectedPages: validPageSummaries(pages).length },
      });
    }
    return inserted[0];
  });
}

export async function bootstrapExistingStaffAdministrator() {
  await ensureTenantSchema();
  const sql = getSql();
  const administrators = await sql`
    SELECT meta_user_id
    FROM dilg_staff_users
    WHERE global_role = 'regional_admin' AND status = 'approved'
    LIMIT 1
  `;
  if (administrators.length) return administrators[0];
  const sessions = await sql`
    SELECT session_hash, meta_user_id, user_name
    FROM dilg_facebook_sessions
    WHERE expires_at > NOW()
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (!sessions.length) return null;
  const pages = await sql`
    SELECT page_id, page_name
    FROM dilg_facebook_pages
    WHERE session_hash = ${sessions[0].session_hash}
    ORDER BY page_name ASC
  `;
  return ensureStaffIdentity({
    metaUserId: sessions[0].meta_user_id,
    name: sessions[0].user_name,
    pages: pages.map((page) => ({ id: page.page_id, name: page.page_name })),
  });
}

export async function getStaffContext(metaUserId) {
  await ensureTenantSchema();
  const sql = getSql();
  const users = await sql`
    SELECT meta_user_id, name, status, global_role
    FROM dilg_staff_users
    WHERE meta_user_id = ${clean(metaUserId)}
    LIMIT 1
  `;
  if (!users.length) return null;
  const memberships = await sql`
    SELECT m.office_id, m.role, o.name AS office_name, o.office_type, o.facebook_page_id, o.facebook_page_name
    FROM dilg_office_memberships m
    JOIN dilg_offices o ON o.id = m.office_id
    WHERE m.meta_user_id = ${users[0].meta_user_id} AND m.active = TRUE AND o.active = TRUE
    ORDER BY o.name ASC
  `;
  return {
    metaUserId: users[0].meta_user_id,
    name: users[0].name,
    status: users[0].status,
    globalRole: users[0].global_role,
    isRegionalAdmin: users[0].global_role === "regional_admin" && users[0].status === "approved",
    memberships: memberships.map(mapMembership),
  };
}

export async function getAdminDirectory(actorMetaUserId) {
  await requireRegionalAdministrator(actorMetaUserId);
  const sql = getSql();
  const [offices, users, memberships, candidatePages, audit] = await Promise.all([
    sql`
      SELECT id, name, office_type, facebook_page_id, facebook_page_name, active, created_at, updated_at
      FROM dilg_offices
      ORDER BY active DESC, name ASC
    `,
    sql`
      SELECT meta_user_id, name, status, global_role, last_seen_at, created_at, updated_at
      FROM dilg_staff_users
      ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, name ASC
    `,
    sql`
      SELECT meta_user_id, office_id, role, active
      FROM dilg_office_memberships
      ORDER BY created_at ASC
    `,
    sql`
      SELECT DISTINCT s.meta_user_id, p.page_id, p.page_name, p.picture_url
      FROM dilg_facebook_sessions s
      JOIN dilg_facebook_pages p ON p.session_hash = s.session_hash
      WHERE s.expires_at > NOW()
      ORDER BY s.meta_user_id, p.page_name
    `,
    sql`
      SELECT a.id, a.action, a.target_meta_user_id, a.office_id, a.details, a.created_at,
             COALESCE(actor.name, 'System') AS actor_name,
             COALESCE(target.name, '') AS target_name
      FROM dilg_access_audit a
      LEFT JOIN dilg_staff_users actor ON actor.meta_user_id = a.actor_meta_user_id
      LEFT JOIN dilg_staff_users target ON target.meta_user_id = a.target_meta_user_id
      ORDER BY a.created_at DESC
      LIMIT 30
    `,
  ]);
  return {
    offices: offices.map(mapOffice),
    users: users.map((user) => ({
      metaUserId: user.meta_user_id,
      name: user.name,
      status: user.status,
      globalRole: user.global_role,
      lastSeenAt: user.last_seen_at,
      createdAt: user.created_at,
      memberships: memberships.filter((item) => item.meta_user_id === user.meta_user_id).map((item) => ({
        officeId: item.office_id,
        role: item.role,
        active: item.active,
      })),
      candidatePages: candidatePages.filter((page) => page.meta_user_id === user.meta_user_id).map((page) => ({
        id: page.page_id,
        name: page.page_name,
        picture: page.picture_url || "",
      })),
    })),
    audit: audit.map((item) => ({
      id: String(item.id),
      action: item.action,
      actorName: item.actor_name,
      targetName: item.target_name,
      officeId: item.office_id || "",
      details: item.details || {},
      createdAt: item.created_at,
    })),
  };
}

export async function applyAdminAction(actorMetaUserId, input = {}) {
  const actor = await requireRegionalAdministrator(actorMetaUserId);
  const action = clean(input.action);
  const sql = getSql();

  if (action === "create_office") {
    const name = clean(input.name).slice(0, 120);
    const officeType = validValue(input.officeType, ["regional", "province", "city", "other"], "other");
    if (!name) throw new FacebookApiError("Enter an office name.", 400);
    const id = `office-${randomBytes(10).toString("hex")}`;
    await sql`
      INSERT INTO dilg_offices (id, name, office_type)
      VALUES (${id}, ${name}, ${officeType})
    `;
    await writeAudit(sql, { actorMetaUserId: actor.metaUserId, action, officeId: id, details: { name, officeType } });
    return { ok: true, officeId: id };
  }

  if (action === "update_office") {
    const officeId = clean(input.officeId);
    const name = clean(input.name).slice(0, 120);
    const officeType = validValue(input.officeType, ["regional", "province", "city", "other"], "other");
    if (!officeId || !name) throw new FacebookApiError("Choose an office and enter its name.", 400);
    const updated = await sql`
      UPDATE dilg_offices
      SET name = ${name}, office_type = ${officeType}, active = ${input.active !== false}, updated_at = NOW()
      WHERE id = ${officeId}
      RETURNING id
    `;
    if (!updated.length) throw new FacebookApiError("That office was not found.", 404);
    await writeAudit(sql, { actorMetaUserId: actor.metaUserId, action, officeId, details: { name, officeType, active: input.active !== false } });
    return { ok: true };
  }

  if (["approve_staff", "add_membership"].includes(action)) {
    const targetMetaUserId = clean(input.metaUserId);
    const officeId = clean(input.officeId);
    const role = validValue(input.role, OFFICE_ROLES, "viewer");
    const pageId = clean(input.pageId);
    if (!targetMetaUserId || !officeId) throw new FacebookApiError("Choose a staff member and office.", 400);
    const office = await assertUserAndOffice(sql, targetMetaUserId, officeId);
    const authorizedPageId = pageId || office.facebook_page_id || "";
    if (!authorizedPageId) throw new FacebookApiError("Choose the staff member's Facebook Page for this office.", 400);
    await bindVerifiedPage(sql, targetMetaUserId, officeId, authorizedPageId);
    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE dilg_staff_users
        SET status = 'approved', updated_at = NOW()
        WHERE meta_user_id = ${targetMetaUserId}
      `;
      await transaction`
        INSERT INTO dilg_office_memberships (meta_user_id, office_id, role)
        VALUES (${targetMetaUserId}, ${officeId}, ${role})
        ON CONFLICT (meta_user_id, office_id) DO UPDATE SET role = EXCLUDED.role, active = TRUE, updated_at = NOW()
      `;
      await writeAudit(transaction, { actorMetaUserId: actor.metaUserId, action, targetMetaUserId, officeId, details: { role, pageId: authorizedPageId } });
    });
    return { ok: true };
  }

  if (action === "remove_membership") {
    const targetMetaUserId = clean(input.metaUserId);
    const officeId = clean(input.officeId);
    await sql`
      UPDATE dilg_office_memberships
      SET active = FALSE, updated_at = NOW()
      WHERE meta_user_id = ${targetMetaUserId} AND office_id = ${officeId}
    `;
    await writeAudit(sql, { actorMetaUserId: actor.metaUserId, action, targetMetaUserId, officeId });
    return { ok: true };
  }

  if (action === "set_staff_status") {
    const targetMetaUserId = clean(input.metaUserId);
    const status = validValue(input.status, STAFF_STATUSES, "pending");
    if (targetMetaUserId === actor.metaUserId && status !== "approved") throw new FacebookApiError("You cannot suspend your own administrator account.", 400);
    const updated = await sql`
      UPDATE dilg_staff_users
      SET status = ${status}, updated_at = NOW()
      WHERE meta_user_id = ${targetMetaUserId}
      RETURNING meta_user_id
    `;
    if (!updated.length) throw new FacebookApiError("That staff account was not found.", 404);
    await writeAudit(sql, { actorMetaUserId: actor.metaUserId, action, targetMetaUserId, details: { status } });
    return { ok: true };
  }

  if (action === "set_global_role") {
    const targetMetaUserId = clean(input.metaUserId);
    const globalRole = validValue(input.globalRole, GLOBAL_ROLES, "staff");
    if (targetMetaUserId === actor.metaUserId && globalRole !== "regional_admin") throw new FacebookApiError("Another Regional Administrator must change your administrator role.", 400);
    const updated = await sql`
      UPDATE dilg_staff_users
      SET global_role = ${globalRole}, status = CASE WHEN ${globalRole} = 'regional_admin' THEN 'approved' ELSE status END, updated_at = NOW()
      WHERE meta_user_id = ${targetMetaUserId}
      RETURNING meta_user_id
    `;
    if (!updated.length) throw new FacebookApiError("That staff account was not found.", 404);
    await writeAudit(sql, { actorMetaUserId: actor.metaUserId, action, targetMetaUserId, details: { globalRole } });
    return { ok: true };
  }

  throw new FacebookApiError("That administrator action is not supported.", 400);
}

export async function requireRegionalAdministrator(metaUserId) {
  const context = await getStaffContext(metaUserId);
  if (!context || !context.isRegionalAdmin) throw new FacebookApiError("Regional Administrator access is required.", 403);
  return context;
}

export function canRolePublish(role) {
  return PUBLISHING_ROLES.includes(role);
}

async function bindVerifiedPage(sql, metaUserId, officeId, pageId) {
  const pages = await sql`
    SELECT p.page_id, p.page_name
    FROM dilg_facebook_sessions s
    JOIN dilg_facebook_pages p ON p.session_hash = s.session_hash
    WHERE s.meta_user_id = ${metaUserId} AND s.expires_at > NOW() AND p.page_id = ${pageId}
    LIMIT 1
  `;
  if (!pages.length) throw new FacebookApiError("That Facebook Page is not available to the selected staff account.", 403);
  const office = await sql`SELECT facebook_page_id FROM dilg_offices WHERE id = ${officeId} LIMIT 1`;
  if (!office.length) throw new FacebookApiError("That office was not found.", 404);
  if (office[0].facebook_page_id && office[0].facebook_page_id !== pageId) {
    throw new FacebookApiError("That office is already connected to a different Facebook Page.", 409);
  }
  try {
    await sql`
      UPDATE dilg_offices
      SET facebook_page_id = ${pageId}, facebook_page_name = ${pages[0].page_name}, updated_at = NOW()
      WHERE id = ${officeId}
    `;
  } catch (error) {
    if (error?.code === "23505") throw new FacebookApiError("That Facebook Page is already assigned to another office.", 409);
    throw error;
  }
}

async function assertUserAndOffice(sql, metaUserId, officeId) {
  const [users, offices] = await Promise.all([
    sql`SELECT meta_user_id FROM dilg_staff_users WHERE meta_user_id = ${metaUserId} LIMIT 1`,
    sql`SELECT id, facebook_page_id FROM dilg_offices WHERE id = ${officeId} AND active = TRUE LIMIT 1`,
  ]);
  if (!users.length) throw new FacebookApiError("That staff account was not found.", 404);
  if (!offices.length) throw new FacebookApiError("That office was not found or is inactive.", 404);
  return offices[0];
}

async function writeAudit(sql, { actorMetaUserId = null, action, targetMetaUserId = null, officeId = null, details = {} }) {
  await sql`
    INSERT INTO dilg_access_audit (actor_meta_user_id, action, target_meta_user_id, office_id, details)
    VALUES (${actorMetaUserId}, ${action}, ${targetMetaUserId}, ${officeId}, ${sql.json(details || {})})
  `;
}

function mapMembership(item) {
  return {
    officeId: item.office_id,
    officeName: item.office_name,
    officeType: item.office_type,
    pageId: item.facebook_page_id || "",
    pageName: item.facebook_page_name || "",
    role: item.role,
    canPublish: canRolePublish(item.role),
  };
}

function mapOffice(item) {
  return {
    id: item.id,
    name: item.name,
    officeType: item.office_type,
    pageId: item.facebook_page_id || "",
    pageName: item.facebook_page_name || "",
    active: item.active,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function validPageSummaries(pages) {
  return (Array.isArray(pages) ? pages : [])
    .map((page) => ({ id: clean(page?.id), name: clean(page?.name) }))
    .filter((page) => page.id && page.name);
}

function matchDefaultOffice(name) {
  const value = clean(name).toLowerCase();
  if (/\b(region|regional)\b.*\b(xii|12)\b|\b(xii|12)\b.*\b(region|regional)\b/.test(value)) return "regional-office-xii";
  if (/gensan|general santos/.test(value)) return "general-santos";
  if (/south cotabato/.test(value)) return "south-cotabato";
  if (/sultan kudarat/.test(value)) return "sultan-kudarat";
  if (/sarangani/.test(value)) return "sarangani";
  if (/cotabato/.test(value)) return "cotabato-province";
  return "";
}

function inferOfficeType(name) {
  const value = clean(name).toLowerCase();
  if (/region|regional/.test(value)) return "regional";
  if (/city|gensan|kidapawan|koronadal|tacurong/.test(value)) return "city";
  if (/province|cotabato|sarangani|kudarat/.test(value)) return "province";
  return "other";
}

function safeId(value) {
  return clean(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || randomBytes(8).toString("hex");
}

function validValue(value, allowed, fallback) {
  const cleaned = clean(value);
  return allowed.includes(cleaned) ? cleaned : fallback;
}

function clean(value) {
  return String(value || "").trim();
}
