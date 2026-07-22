"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  ["office_admin", "Office administrator"],
  ["publisher", "Publisher"],
  ["editor", "Editor"],
  ["viewer", "Viewer"],
];

export default function AccessAdministration({ compact = false, onAccessChanged }) {
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [officeDraft, setOfficeDraft] = useState({ name: "", officeType: "province" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      setDirectory(await requestJson("/api/admin/access"));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestJson("/api/admin/access")
      .then((result) => { if (active) setDirectory(result); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function perform(action, payload = {}, successMessage = "Access updated.") {
    const operation = `${action}:${payload.metaUserId || payload.officeId || "new"}`;
    setBusy(operation);
    try {
      await requestJson("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      toast.success(successMessage);
      await load();
      onAccessChanged?.();
    } catch (actionError) {
      toast.error(actionError.message, { duration: 7000 });
    } finally {
      setBusy("");
    }
  }

  async function createOffice(event) {
    event.preventDefault();
    if (!officeDraft.name.trim()) return;
    await perform("create_office", officeDraft, "Office created.");
    setOfficeDraft({ name: "", officeType: "province" });
  }

  const pendingCount = directory?.users?.filter((user) => user.status === "pending").length || 0;

  return (
    <section className={`access-admin ${compact ? "is-compact" : ""}`}>
      <div className="access-admin-heading">
        <div>
          <span className="section-kicker"><ShieldCheck size={15} /> Server-enforced access</span>
          <h3>Staff and office administration</h3>
          <p>Only a Regional Administrator can approve staff, assign an office, and choose their role. Staff cannot assign themselves.</p>
        </div>
        <button className="secondary-button" type="button" onClick={load} disabled={loading}><RefreshCcw className={loading ? "spin" : ""} size={16} /> Refresh</button>
      </div>

      {loading && !directory ? <div className="access-loading"><Loader2 className="spin" size={20} /> Loading protected staff directory…</div> : null}
      {error ? <div className="connection-error">{error}</div> : null}

      {directory ? (
        <>
          <div className="access-summary-grid">
            <Summary icon={Clock3} label="Awaiting approval" value={pendingCount} tone="amber" />
            <Summary icon={Users} label="Staff accounts" value={directory.users.length} tone="indigo" />
            <Summary icon={Building2} label="Active offices" value={directory.offices.filter((office) => office.active).length} tone="sky" />
          </div>

          <div className="access-admin-grid">
            <div className="access-admin-column">
              <div className="access-subheading"><div><h4>Staff access</h4><p>New Facebook identities remain blocked until approved here.</p></div></div>
              <div className="staff-access-list">
                {directory.users.map((user) => (
                  <StaffAccessCard
                    key={user.metaUserId}
                    user={user}
                    offices={directory.offices}
                    busy={busy}
                    perform={perform}
                  />
                ))}
              </div>
            </div>

            <div className="access-admin-column">
              <div className="access-subheading"><div><h4>Office registry</h4><p>A Facebook Page can be bound to only one Region XII office.</p></div></div>
              <div className="office-registry-list">
                {directory.offices.map((office) => (
                  <article className={`office-registry-row ${office.active ? "" : "is-inactive"}`} key={office.id}>
                    <div className="office-registry-icon"><Building2 size={18} /></div>
                    <div><strong>{office.name}</strong><span>{officeTypeLabel(office.officeType)} · {office.pageName || "Page not connected"}</span></div>
                    <span className={`access-state ${office.pageId ? "approved" : "pending"}`}>{office.pageId ? "Connected" : "Unlinked"}</span>
                  </article>
                ))}
              </div>
              <form className="create-office-form" onSubmit={createOffice}>
                <strong>Add another office</strong>
                <input value={officeDraft.name} onChange={(event) => setOfficeDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Official office name" maxLength={120} />
                <select value={officeDraft.officeType} onChange={(event) => setOfficeDraft((current) => ({ ...current, officeType: event.target.value }))}>
                  <option value="regional">Regional office</option>
                  <option value="province">Province</option>
                  <option value="city">City</option>
                  <option value="other">Other office</option>
                </select>
                <button className="secondary-button" disabled={!officeDraft.name.trim() || busy.startsWith("create_office")}><Plus size={16} /> Create office</button>
              </form>
            </div>
          </div>

          {!compact && directory.audit?.length ? (
            <div className="access-audit">
              <div className="access-subheading"><div><h4>Recent access audit</h4><p>Administrator changes recorded by the server.</p></div></div>
              <div className="access-audit-list">
                {directory.audit.slice(0, 12).map((entry) => (
                  <div key={entry.id}><ShieldCheck size={15} /><span><strong>{auditLabel(entry.action)}</strong>{entry.targetName ? ` · ${entry.targetName}` : ""}</span><time>{formatDate(entry.createdAt)}</time></div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function StaffAccessCard({ user, offices, busy, perform }) {
  const activeOffices = offices.filter((office) => office.active);
  const unassignedOffice = activeOffices.find((office) => !user.memberships.some((membership) => membership.officeId === office.id && membership.active));
  const [assignment, setAssignment] = useState({
    officeId: unassignedOffice?.id || activeOffices[0]?.id || "",
    role: "publisher",
    pageId: user.candidatePages[0]?.id || "",
  });
  const isBusy = busy.includes(user.metaUserId);
  const selectedOffice = activeOffices.find((office) => office.id === assignment.officeId);
  const requiresPage = !selectedOffice?.pageId;

  async function assign(event) {
    event.preventDefault();
    await perform(user.status === "pending" ? "approve_staff" : "add_membership", {
      metaUserId: user.metaUserId,
      officeId: assignment.officeId,
      role: assignment.role,
      pageId: requiresPage ? assignment.pageId : selectedOffice.pageId,
    }, user.status === "pending" ? "Staff account approved and assigned." : "Office assignment added.");
  }

  return (
    <article className={`staff-access-card status-${user.status}`}>
      <header>
        <div className="staff-avatar">{initials(user.name)}</div>
        <div><strong>{user.name}</strong><span>Facebook identity ending {user.metaUserId.slice(-6)}</span></div>
        <span className={`access-state ${user.status}`}>{statusLabel(user.status)}</span>
      </header>

      <div className="staff-meta-row">
        <span><KeyRound size={14} /> {user.globalRole === "regional_admin" ? "Regional Administrator" : "Staff account"}</span>
        <span><Clock3 size={14} /> Last seen {formatDate(user.lastSeenAt)}</span>
      </div>

      {user.candidatePages.length ? <div className="candidate-pages"><small>Facebook Pages verified for this account</small>{user.candidatePages.map((page) => <span key={page.id}><BadgeCheck size={13} /> {page.name}</span>)}</div> : <div className="access-warning"><ShieldX size={15} /> Refresh Facebook Pages before assigning this account.</div>}

      {user.memberships.some((membership) => membership.active) ? (
        <div className="membership-list">
          {user.memberships.filter((membership) => membership.active).map((membership) => {
            const office = offices.find((item) => item.id === membership.officeId);
            return <div key={membership.officeId}><div><CheckCircle2 size={15} /><span><strong>{office?.name || "Office"}</strong><small>{roleLabel(membership.role)}</small></span></div><button type="button" title="Remove assignment" onClick={() => perform("remove_membership", { metaUserId: user.metaUserId, officeId: membership.officeId }, "Office assignment removed.")} disabled={isBusy}><Trash2 size={15} /></button></div>;
          })}
        </div>
      ) : null}

      <form className="staff-assignment-form" onSubmit={assign}>
        <select value={assignment.officeId} onChange={(event) => setAssignment((current) => ({ ...current, officeId: event.target.value }))}>
          {activeOffices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
        </select>
        <select value={assignment.role} onChange={(event) => setAssignment((current) => ({ ...current, role: event.target.value }))}>
          {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {requiresPage ? (
          <select value={assignment.pageId} onChange={(event) => setAssignment((current) => ({ ...current, pageId: event.target.value }))}>
            <option value="">Choose verified Facebook Page</option>
            {user.candidatePages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
          </select>
        ) : <div className="bound-page-note"><CheckCircle2 size={14} /> {selectedOffice?.pageName || "Office Page already connected"}</div>}
        <button className="primary-button" disabled={isBusy || !assignment.officeId || (requiresPage && !assignment.pageId)}>{isBusy ? <Loader2 className="spin" size={16} /> : <UserCheck size={16} />} {user.status === "pending" ? "Approve and assign" : "Add assignment"}</button>
      </form>

      <div className="staff-security-actions">
        {user.status === "approved" ? <button type="button" className="danger-link" onClick={() => perform("set_staff_status", { metaUserId: user.metaUserId, status: "suspended" }, "Staff account suspended.")} disabled={isBusy}>Suspend access</button> : user.status === "suspended" ? <button type="button" onClick={() => perform("set_staff_status", { metaUserId: user.metaUserId, status: "approved" }, "Staff account restored.")} disabled={isBusy}>Restore access</button> : null}
        {user.globalRole === "regional_admin" ? <span><ShieldCheck size={14} /> Regional administrator</span> : <button type="button" onClick={() => perform("set_global_role", { metaUserId: user.metaUserId, globalRole: "regional_admin" }, "Regional Administrator access granted.")} disabled={isBusy}>Make Regional Admin</button>}
      </div>
    </article>
  );
}

function Summary({ icon: Icon, label, value, tone }) {
  return <div className={`access-summary ${tone}`}><Icon size={18} /><div><strong>{value}</strong><span>{label}</span></div></div>;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || "The access request could not be completed.");
  return payload;
}

function initials(name) {
  return String(name || "Staff").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function roleLabel(value) {
  return ROLE_OPTIONS.find(([role]) => role === value)?.[1] || "Viewer";
}

function officeTypeLabel(value) {
  return value === "regional" ? "Regional office" : value === "province" ? "Province" : value === "city" ? "City" : "Other office";
}

function statusLabel(value) {
  return value === "approved" ? "Approved" : value === "suspended" ? "Suspended" : "Pending";
}

function auditLabel(value) {
  return String(value || "Access updated").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "just now";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
