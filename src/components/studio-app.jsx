"use client";
/* eslint-disable @next/next/no-img-element */

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Download,
  FileImage,
  ImagePlus,
  Images,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { clsx } from "clsx";
import {
  createId,
  formatRelativeDate,
  INITIAL_STATE,
  loadStudioState,
  saveStudioState,
  statusTone,
  STORAGE_KEY,
  toDateTimeLocal,
} from "@/lib/studio-data";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "campaigns", label: "Campaigns", icon: FileImage },
  { id: "templates", label: "Templates", icon: Images },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];

const campaignFilters = ["All", "Draft", "Ready for review", "Scheduled", "Published"];

const emptyDraft = (templateId = "template-feed") => ({
  id: "",
  title: "",
  caption: "",
  status: "Draft",
  templateId,
  scheduledFor: "",
  images: [],
});

export default function StudioApp() {
  const [studio, setStudio] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setStudio(loadStudioState()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!studio) return;
    try {
      saveStudioState(studio);
    } catch {
      toast.error("This browser is out of local storage space. Remove a few large images and try again.");
    }
  }, [studio]);

  function openComposer(campaign) {
    const templateId = studio?.settings.defaultTemplateId || studio?.templates[0]?.id;
    setDraft(
      campaign
        ? { ...campaign, images: campaign.images.map((image) => ({ ...image })) }
        : emptyDraft(templateId),
    );
    setComposerOpen(true);
  }

  function saveCampaign(nextStatus = draft.status || "Draft") {
    const title = draft.title.trim();
    if (!title) {
      toast.error("Give this campaign a title first.");
      return;
    }
    const now = new Date().toISOString();
    const id = draft.id || createId("campaign");
    const campaign = {
      ...draft,
      id,
      status: nextStatus,
      createdAt: draft.createdAt || now,
      updatedAt: now,
      publishedAt: nextStatus === "Published" ? now : draft.publishedAt || "",
      scheduledFor: draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : "",
    };
    const action = draft.id ? "updated" : "created";
    setStudio((current) => ({
      ...current,
      campaigns: current.campaigns.some((item) => item.id === id)
        ? current.campaigns.map((item) => (item.id === id ? campaign : item))
        : [campaign, ...current.campaigns],
      activity: [
        {
          id: createId("activity"),
          type: nextStatus === "Published" ? "published" : nextStatus === "Scheduled" ? "scheduled" : "created",
          text: `${title} was ${nextStatus === "Draft" ? action : nextStatus.toLowerCase()}`,
          at: now,
        },
        ...current.activity,
      ].slice(0, 80),
    }));
    setComposerOpen(false);
    toast.success(nextStatus === "Draft" ? "Draft saved to this device." : `Campaign marked ${nextStatus.toLowerCase()}.`);
  }

  function submitForReview() {
    if (!draft.title.trim() || !draft.caption.trim() || draft.images.length === 0) {
      toast.error("Add a title, caption, and at least one image before review.");
      return;
    }
    saveCampaign("Ready for review");
  }

  function publishCampaign() {
    if (!draft.title.trim() || !draft.caption.trim() || draft.images.length === 0) {
      toast.error("Add a title, caption, and at least one image before publishing.");
      return;
    }
    saveCampaign(draft.scheduledFor ? "Scheduled" : "Published");
  }

  function updateCampaignStatus(campaignId, status) {
    const campaign = studio.campaigns.find((item) => item.id === campaignId);
    if (!campaign) return;
    const now = new Date().toISOString();
    setStudio((current) => ({
      ...current,
      campaigns: current.campaigns.map((item) =>
        item.id === campaignId
          ? { ...item, status, updatedAt: now, publishedAt: status === "Published" ? now : item.publishedAt }
          : item,
      ),
      activity: [
        { id: createId("activity"), type: status.toLowerCase(), text: `${campaign.title} was ${status.toLowerCase()}`, at: now },
        ...current.activity,
      ],
    }));
    toast.success(`${campaign.title} is now ${status.toLowerCase()}.`);
  }

  function deleteCampaign(campaignId) {
    const campaign = studio.campaigns.find((item) => item.id === campaignId);
    if (!campaign || !window.confirm(`Delete “${campaign.title}”? This only removes the local copy.`)) return;
    setStudio((current) => ({
      ...current,
      campaigns: current.campaigns.filter((item) => item.id !== campaignId),
      activity: [
        { id: createId("activity"), type: "deleted", text: `${campaign.title} was deleted`, at: new Date().toISOString() },
        ...current.activity,
      ],
    }));
    toast.success("Campaign removed.");
  }

  if (!studio) return <LoadingScreen />;

  const viewProps = {
    studio,
    setStudio,
    openComposer,
    setActiveView,
    updateCampaignStatus,
    deleteCampaign,
  };

  return (
    <div className="studio-shell">
      <Toaster richColors position="top-right" closeButton />
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        organization={studio.settings.organization}
        openComposer={() => openComposer()}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <main className="main-panel">
        <Topbar
          activeView={activeView}
          organization={studio.settings.organization}
          setMobileMenuOpen={setMobileMenuOpen}
          openComposer={() => openComposer()}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="page-frame"
          >
            {activeView === "overview" && <Overview {...viewProps} />}
            {activeView === "campaigns" && <Campaigns {...viewProps} />}
            {activeView === "templates" && <Templates {...viewProps} />}
            {activeView === "activity" && <ActivityView {...viewProps} />}
            {activeView === "settings" && <SettingsView {...viewProps} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <MobileNav activeView={activeView} setActiveView={setActiveView} />
      <AnimatePresence>
        {composerOpen && (
          <Composer
            draft={draft}
            setDraft={setDraft}
            templates={studio.templates}
            settings={studio.settings}
            onClose={() => setComposerOpen(false)}
            onSave={() => saveCampaign("Draft")}
            onReview={submitForReview}
            onPublish={publishCampaign}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Sidebar({ activeView, setActiveView, organization, openComposer, mobileMenuOpen, setMobileMenuOpen }) {
  const choose = (id) => {
    setActiveView(id);
    setMobileMenuOpen(false);
  };
  return (
    <>
      <aside className={clsx("sidebar", mobileMenuOpen && "is-open")}>
        <div className="brand-lockup">
          <div className="brand-mark"><img src="/brand/dilg-logo.png" alt="DILG seal" /></div>
          <div><strong>Social Studio</strong><span>DILG Gensan</span></div>
        </div>
        <button className="new-campaign-button" onClick={openComposer} type="button">
          <Plus size={18} /> New campaign
        </button>
        <nav className="side-navigation" aria-label="Primary navigation">
          <span className="nav-label">Workspace</span>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={clsx("nav-item", activeView === id && "active")} onClick={() => choose(id)} type="button">
              <Icon size={19} strokeWidth={activeView === id ? 2.4 : 1.9} />
              <span>{label}</span>
              {id === "campaigns" && <span className="nav-badge">4</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="storage-card">
            <div className="storage-icon"><ShieldCheck size={17} /></div>
            <div><strong>Private by default</strong><span>Saved only on this device</span></div>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">DG</div>
            <div><strong>{organization}</strong><span>Content team</span></div>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>
      {mobileMenuOpen && <button className="menu-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" />}
    </>
  );
}

function Topbar({ activeView, organization, setMobileMenuOpen, openComposer }) {
  const title = navigation.find((item) => item.id === activeView)?.label || "Overview";
  return (
    <header className="topbar">
      <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
      <div><span className="topbar-context">{organization}</span><h1>{title}</h1></div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button>
        <button className="topbar-create" onClick={openComposer}><Plus size={18} /> Create</button>
      </div>
    </header>
  );
}

function Overview({ studio, openComposer, setActiveView, updateCampaignStatus }) {
  const stats = useMemo(() => {
    const campaigns = studio.campaigns;
    return [
      { label: "Total campaigns", value: campaigns.length, change: "+3 this month", icon: FileImage, tone: "indigo" },
      { label: "Ready for review", value: campaigns.filter((item) => item.status === "Ready for review").length, change: "Needs attention", icon: CircleDashed, tone: "amber" },
      { label: "Scheduled", value: campaigns.filter((item) => item.status === "Scheduled").length, change: "Next 7 days", icon: CalendarClock, tone: "sky" },
      { label: "Published", value: campaigns.filter((item) => item.status === "Published").length, change: "This workspace", icon: CheckCircle2, tone: "emerald" },
    ];
  }, [studio.campaigns]);
  const queue = studio.campaigns
    .filter((item) => ["Ready for review", "Approved", "Scheduled"].includes(item.status))
    .sort((a, b) => new Date(a.scheduledFor || 0) - new Date(b.scheduledFor || 0))
    .slice(0, 4);
  const recent = [...studio.campaigns].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 4);

  return (
    <div className="content-stack">
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="section-kicker"><Sparkles size={14} /> Content command center</span>
          <h2>Good day, Content Team.</h2>
          <p>Plan, review, and publish community updates from one calm workspace.</p>
          <div className="welcome-actions">
            <button className="primary-button" onClick={openComposer}><Plus size={18} /> Create campaign</button>
            <button className="ghost-light-button" onClick={() => setActiveView("campaigns")}>View queue <ArrowRight size={17} /></button>
          </div>
        </div>
        <div className="welcome-visual" aria-hidden="true">
          <div className="orb orb-one" /><div className="orb orb-two" />
          <div className="floating-post post-back"><span /><span /><span /></div>
          <div className="floating-post post-front"><MessageSquareText size={22} /><div><strong>3 posts</strong><span>ready this week</span></div><Check size={18} /></div>
        </div>
      </section>

      <section className="stats-grid">
        {stats.map(({ label, value, change, icon: Icon, tone }, index) => (
          <motion.article className="metric-card" key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <div className={clsx("metric-icon", tone)}><Icon size={20} /></div>
            <div className="metric-value">{value}</div>
            <strong>{label}</strong><span>{change}</span>
          </motion.article>
        ))}
      </section>

      <div className="overview-grid">
        <section className="panel queue-panel">
          <PanelHeading eyebrow="Publishing queue" title="Next up" action="View all" onAction={() => setActiveView("campaigns")} />
          <div className="queue-list">
            {queue.length ? queue.map((campaign, index) => (
              <article className="queue-row" key={campaign.id}>
                <div className="queue-line"><span className={clsx("queue-dot", statusTone(campaign.status))} />{index < queue.length - 1 && <i />}</div>
                <img src={campaign.images[0]?.src || "/demo/sample-landscape.jpg"} alt="" />
                <div className="queue-copy"><strong>{campaign.title}</strong><span><Clock3 size={14} /> {formatRelativeDate(campaign.scheduledFor)}</span></div>
                <StatusBadge status={campaign.status} />
                {campaign.status === "Ready for review" && (
                  <button className="mini-action" onClick={() => updateCampaignStatus(campaign.id, "Approved")}>Approve</button>
                )}
              </article>
            )) : <EmptyState icon={CalendarClock} title="Your queue is clear" text="Schedule a campaign and it will appear here." />}
          </div>
        </section>

        <section className="panel activity-panel">
          <PanelHeading eyebrow="Live workspace" title="Recent activity" action="See history" onAction={() => setActiveView("activity")} />
          <div className="activity-list compact">
            {studio.activity.slice(0, 5).map((item) => <ActivityItem key={item.id} item={item} />)}
          </div>
        </section>
      </div>

      <section className="panel">
        <PanelHeading eyebrow="Your work" title="Recent campaigns" action="Browse campaigns" onAction={() => setActiveView("campaigns")} />
        <div className="campaign-card-grid">
          {recent.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} onOpen={() => openComposer(campaign)} />)}
        </div>
      </section>
    </div>
  );
}

function Campaigns({ studio, openComposer, deleteCampaign, updateCampaignStatus }) {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const campaigns = studio.campaigns.filter((item) => {
    const matchesFilter = filter === "All" || item.status === filter;
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || `${item.title} ${item.caption}`.toLowerCase().includes(needle);
    return matchesFilter && matchesQuery;
  });
  return (
    <div className="content-stack">
      <PageIntro title="Campaigns" text="Every draft, review, schedule, and published post in one place." action="New campaign" onAction={() => openComposer()} />
      <section className="panel campaign-browser">
        <div className="browser-toolbar">
          <div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns" /></div>
          <div className="filter-strip">
            {campaignFilters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
        </div>
        <div className="campaign-table-wrap">
          <table className="campaign-table">
            <thead><tr><th>Campaign</th><th>Status</th><th>Schedule</th><th>Media</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td><button className="campaign-cell" onClick={() => openComposer(campaign)}><img src={campaign.images[0]?.src || "/demo/sample-landscape.jpg"} alt="" /><span><strong>{campaign.title}</strong><small>Updated {formatRelativeDate(campaign.updatedAt)}</small></span></button></td>
                  <td><StatusBadge status={campaign.status} /></td>
                  <td><span className="table-muted">{formatRelativeDate(campaign.scheduledFor)}</span></td>
                  <td><span className="media-count"><Images size={16} /> {campaign.images.length}</span></td>
                  <td><div className="row-actions"><button onClick={() => openComposer(campaign)} aria-label="Edit campaign"><PencilLine size={17} /></button>{campaign.status === "Approved" && <button onClick={() => updateCampaignStatus(campaign.id, "Published")} aria-label="Publish campaign"><Send size={17} /></button>}<button className="danger" onClick={() => deleteCampaign(campaign.id)} aria-label="Delete campaign"><Trash2 size={17} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!campaigns.length && <EmptyState icon={Search} title="No campaigns found" text="Try a different search or status filter." />}
        </div>
      </section>
    </div>
  );
}

function Templates({ studio, setStudio }) {
  const fileRef = useRef(null);
  async function addTemplate(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const src = await compressImage(file, 1600, 0.86);
      const template = { id: createId("template"), name: file.name.replace(/\.[^.]+$/, ""), size: "Custom", ratio: "Custom", image: src, usage: 0, createdAt: new Date().toISOString() };
      setStudio((current) => ({ ...current, templates: [template, ...current.templates] }));
      toast.success("Template saved on this device.");
    } catch {
      toast.error("That image could not be added.");
    } finally {
      event.target.value = "";
    }
  }
  function setDefault(id) {
    setStudio((current) => ({ ...current, settings: { ...current.settings, defaultTemplateId: id } }));
    toast.success("Default template updated.");
  }
  function removeTemplate(id) {
    if (studio.templates.length <= 1) return toast.error("Keep at least one template in the workspace.");
    setStudio((current) => ({ ...current, templates: current.templates.filter((item) => item.id !== id) }));
    toast.success("Template removed.");
  }
  return (
    <div className="content-stack">
      <PageIntro title="Brand templates" text="Keep every post recognizable with approved frames and layouts." action="Upload template" onAction={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={addTemplate} />
      <div className="template-grid">
        {studio.templates.map((template) => {
          const isDefault = studio.settings.defaultTemplateId === template.id;
          return (
            <motion.article className="template-card" layout key={template.id}>
              <div className="template-preview"><img src={template.image} alt={`${template.name} preview`} />{isDefault && <span className="default-chip"><Check size={14} /> Default</span>}</div>
              <div className="template-meta"><div><strong>{template.name}</strong><span>{template.size} · {template.ratio}</span></div><button className="icon-button subtle" aria-label="Template options"><MoreHorizontal size={18} /></button></div>
              <div className="template-actions"><span>{template.usage || 0} campaigns</span>{!isDefault && <button onClick={() => setDefault(template.id)}>Make default</button>}{template.id.startsWith("template-") && !["template-feed", "template-landscape", "template-wide"].includes(template.id) ? <button className="danger-link" onClick={() => removeTemplate(template.id)}>Remove</button> : null}</div>
            </motion.article>
          );
        })}
        <button className="template-upload-card" onClick={() => fileRef.current?.click()}><span><Upload size={22} /></span><strong>Add a new template</strong><small>PNG or JPG, up to 10 MB</small></button>
      </div>
    </div>
  );
}

function ActivityView({ studio }) {
  return (
    <div className="content-stack narrow-content">
      <PageIntro title="Activity" text="A clear local history of what changed and when." />
      <section className="panel activity-history">
        <div className="activity-date-heading"><span>Recent</span><i /></div>
        <div className="activity-list">
          {studio.activity.map((item) => <ActivityItem key={item.id} item={item} />)}
        </div>
      </section>
    </div>
  );
}

function SettingsView({ studio, setStudio }) {
  const importRef = useRef(null);
  const [settings, setSettings] = useState(studio.settings);
  function save() {
    setStudio((current) => ({ ...current, settings }));
    toast.success("Workspace settings saved.");
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(studio, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `dilg-social-studio-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
    toast.success("Workspace backup downloaded.");
  }
  async function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.campaigns) || !Array.isArray(parsed.templates)) throw new Error();
      const nextStudio = { ...INITIAL_STATE, ...parsed, settings: { ...INITIAL_STATE.settings, ...parsed.settings } };
      setStudio(nextStudio);
      setSettings(nextStudio.settings);
      toast.success("Workspace backup restored.");
    } catch {
      toast.error("That file is not a valid Social Studio backup.");
    } finally { event.target.value = ""; }
  }
  function reset() {
    if (!window.confirm("Reset all local campaigns, templates, and settings to the sample workspace?")) return;
    window.localStorage.removeItem(STORAGE_KEY);
    const nextStudio = structuredClone(INITIAL_STATE);
    setStudio(nextStudio);
    setSettings(nextStudio.settings);
    toast.success("Local workspace reset.");
  }
  return (
    <div className="content-stack settings-width">
      <PageIntro title="Settings" text="Manage your page identity, workflow, and device-local data." />
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph indigo"><MessageSquareText size={20} /></div><div><h3>Workspace identity</h3><p>Shown throughout the studio and in post previews.</p></div></div>
        <div className="form-grid two-columns">
          <Field label="Organization"><input value={settings.organization} onChange={(event) => setSettings({ ...settings, organization: event.target.value })} /></Field>
          <Field label="Facebook page name"><input value={settings.pageName} onChange={(event) => setSettings({ ...settings, pageName: event.target.value })} /></Field>
          <Field label="Page handle"><input value={settings.pageHandle} onChange={(event) => setSettings({ ...settings, pageHandle: event.target.value })} /></Field>
          <Field label="Default template"><select value={settings.defaultTemplateId} onChange={(event) => setSettings({ ...settings, defaultTemplateId: event.target.value })}>{studio.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>
        </div>
      </section>
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph amber"><ShieldCheck size={20} /></div><div><h3>Publishing workflow</h3><p>Control the checks content passes before publishing.</p></div></div>
        <ToggleRow title="Require approval" text="Campaigns must be marked approved before publishing." checked={settings.approvalRequired} onChange={(value) => setSettings({ ...settings, approvalRequired: value })} />
        <ToggleRow title="Workspace notifications" text="Show local reminders for scheduled campaigns." checked={settings.notifications} onChange={(value) => setSettings({ ...settings, notifications: value })} />
      </section>
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph emerald"><Download size={20} /></div><div><h3>Local data</h3><p>Everything is stored in this browser. Keep a backup when moving devices.</p></div></div>
        <div className="data-actions"><button className="secondary-button" onClick={exportData}><Download size={17} /> Export backup</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={17} /> Import backup</button><button className="danger-button" onClick={reset}><Trash2 size={17} /> Reset workspace</button><input ref={importRef} type="file" accept="application/json" hidden onChange={importData} /></div>
        <div className="security-note"><ShieldCheck size={18} /><span><strong>No Facebook access token is stored here.</strong> For live Facebook publishing, connect a secure server-side Meta integration through a Next.js API route and Vercel environment variables.</span></div>
      </section>
      <div className="settings-save"><button className="primary-button" onClick={save}><Check size={17} /> Save settings</button></div>
    </div>
  );
}

function Composer({ draft, setDraft, templates, settings, onClose, onSave, onReview, onPublish }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const activeTemplate = templates.find((item) => item.id === draft.templateId) || templates[0];
  async function addImages(files) {
    const imageFiles = [...files].filter((file) => file.type.startsWith("image/")).slice(0, 8 - draft.images.length);
    if (!imageFiles.length) return;
    setUploading(true);
    try {
      const images = await Promise.all(imageFiles.map(async (file) => ({ id: createId("image"), name: file.name, src: await compressImage(file) })));
      setDraft((current) => ({ ...current, images: [...current.images, ...images] }));
      toast.success(`${images.length} image${images.length === 1 ? "" : "s"} added.`);
    } catch {
      toast.error("One of those images could not be added.");
    } finally { setUploading(false); }
  }
  function removeImage(id) { setDraft((current) => ({ ...current, images: current.images.filter((item) => item.id !== id) })); }
  return (
    <motion.div className="composer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="composer" role="dialog" aria-modal="true" aria-label={draft.id ? "Edit campaign" : "Create campaign"} initial={{ opacity: 0, scale: 0.98, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
        <header className="composer-header"><div><span className="section-kicker"><WandSparkles size={14} /> Campaign composer</span><h2>{draft.id ? "Edit campaign" : "Create a campaign"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close composer"><X size={20} /></button></header>
        <div className="composer-body">
          <div className="composer-form">
            <section className="composer-section">
              <div className="step-heading"><span>1</span><div><h3>Campaign details</h3><p>Name the campaign so your team can find it later.</p></div></div>
              <Field label="Campaign title"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Barangay Assembly Highlights" autoFocus /></Field>
            </section>
            <section className="composer-section">
              <div className="step-heading"><span>2</span><div><h3>Add your media</h3><p>Upload up to 8 photos. They are compressed and stored locally.</p></div></div>
              <button className="drop-zone" type="button" onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addImages(event.dataTransfer.files); }}>
                <span className="upload-glyph">{uploading ? <CircleDashed className="spin" size={23} /> : <ImagePlus size={23} />}</span><strong>{uploading ? "Preparing images…" : "Drop photos here or click to browse"}</strong><small>JPG, PNG, or WebP · maximum 8 images</small>
              </button>
              <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={(event) => addImages(event.target.files)} />
              {draft.images.length > 0 && <div className="image-strip">{draft.images.map((image, index) => <div className="image-thumb" key={image.id}><img src={image.src} alt={image.name} /><span>{index + 1}</span><button onClick={() => removeImage(image.id)} aria-label={`Remove ${image.name}`}><X size={14} /></button></div>)}</div>}
            </section>
            <section className="composer-section">
              <div className="step-heading"><span>3</span><div><h3>Write the caption</h3><p>Keep it clear, warm, and useful for the community.</p></div></div>
              <Field label="Post copy" hint={`${draft.caption.length} / 2,200`}><textarea rows={7} value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value.slice(0, 2200) })} placeholder="Share the story behind this update…" /></Field>
              <div className="caption-tools"><button onClick={() => setDraft({ ...draft, caption: `${draft.caption}${draft.caption ? "\n\n" : ""}#DILGGensan #SerbisyongMatino` })}># Add hashtags</button><button onClick={() => setDraft({ ...draft, caption: `${draft.caption}${draft.caption ? "\n\n" : ""}📍 General Santos City` })}>Add location</button></div>
            </section>
            <section className="composer-section">
              <div className="step-heading"><span>4</span><div><h3>Brand and schedule</h3><p>Select a frame and choose when this should go live.</p></div></div>
              <div className="form-grid two-columns"><Field label="Template"><select value={draft.templateId} onChange={(event) => setDraft({ ...draft, templateId: event.target.value })}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field><Field label="Publish date & time"><input type="datetime-local" value={toDateTimeLocal(draft.scheduledFor)} onChange={(event) => setDraft({ ...draft, scheduledFor: event.target.value })} /></Field></div>
            </section>
          </div>
          <aside className="preview-column">
            <div className="preview-heading"><span>Live preview</span><small>Facebook feed</small></div>
            <FacebookPreview draft={draft} settings={settings} template={activeTemplate} />
            <div className="preview-note"><ShieldCheck size={17} /><span>Preview only. Live posting needs a secure Meta connection.</span></div>
          </aside>
        </div>
        <footer className="composer-footer"><button className="text-button" onClick={onSave}>Save draft</button><div><button className="secondary-button" onClick={onReview}><BadgeCheck size={17} /> Submit for review</button><button className="primary-button" onClick={onPublish}><Send size={17} /> {draft.scheduledFor ? "Schedule post" : "Mark published"}</button></div></footer>
      </motion.section>
    </motion.div>
  );
}

function FacebookPreview({ draft, settings, template }) {
  const primaryImage = draft.images[0]?.src;
  return (
    <div className="facebook-preview">
      <div className="fb-post-header"><div className="fb-avatar"><img src="/brand/dilg-logo.png" alt="" /></div><div><strong>{settings.pageName}</strong><span>Just now · <span aria-label="Public">🌐</span></span></div><MoreHorizontal size={18} /></div>
      <div className={clsx("fb-caption", !draft.caption && "placeholder")}>{draft.caption || "Your caption will appear here as you write…"}</div>
      <div className="fb-media">
        {primaryImage ? <img className="fb-source" src={primaryImage} alt="Post preview" /> : <div className="fb-empty"><ImagePlus size={28} /><span>Add photos to preview the post</span></div>}
        {primaryImage && template?.image && <img className="fb-template" src={template.image} alt="" />}
        {draft.images.length > 1 && <span className="photo-count">+{draft.images.length - 1}</span>}
      </div>
      <div className="fb-engagement"><span>👍 ❤️ <small>24</small></span><span>5 comments · 2 shares</span></div>
      <div className="fb-actions"><button>👍 Like</button><button><MessageSquareText size={15} /> Comment</button><button>↗ Share</button></div>
    </div>
  );
}

function CampaignCard({ campaign, onOpen }) {
  return (
    <button className="campaign-card" onClick={onOpen}>
      <div className="campaign-card-image"><img src={campaign.images[0]?.src || "/demo/sample-landscape.jpg"} alt="" /><StatusBadge status={campaign.status} /></div>
      <div className="campaign-card-copy"><strong>{campaign.title}</strong><span><Clock3 size={14} /> {formatRelativeDate(campaign.scheduledFor || campaign.updatedAt)}</span></div>
    </button>
  );
}

function ActivityItem({ item }) {
  const Icon = item.type === "published" ? Send : item.type === "scheduled" ? CalendarClock : item.type === "review" ? BadgeCheck : item.type === "deleted" ? Trash2 : PencilLine;
  return <div className="activity-item"><span className={clsx("activity-icon", item.type)}><Icon size={16} /></span><div><strong>{item.text}</strong><span>{formatRelativeDate(item.at)}</span></div></div>;
}

function StatusBadge({ status }) { return <span className={clsx("status-badge", statusTone(status))}><i />{status}</span>; }

function PanelHeading({ eyebrow, title, action, onAction }) { return <div className="panel-heading"><div><span>{eyebrow}</span><h3>{title}</h3></div>{action && <button onClick={onAction}>{action}<ArrowRight size={15} /></button>}</div>; }

function PageIntro({ title, text, action, onAction }) { return <div className="page-intro"><div><h2>{title}</h2><p>{text}</p></div>{action && <button className="primary-button" onClick={onAction}><Plus size={17} />{action}</button>}</div>; }

function Field({ label, hint, children }) { return <label className="field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>; }

function ToggleRow({ title, text, checked, onChange }) { return <div className="toggle-row"><div><strong>{title}</strong><span>{text}</span></div><button className={clsx("toggle", checked && "on")} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><i /></button></div>; }

function EmptyState({ icon: Icon, title, text }) { return <div className="empty-state"><span><Icon size={23} /></span><strong>{title}</strong><p>{text}</p></div>; }

function MobileNav({ activeView, setActiveView }) {
  return <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.slice(0, 4).map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "active" : ""} onClick={() => setActiveView(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>;
}

function LoadingScreen() {
  return <div className="loading-screen"><div className="loading-brand"><img src="/brand/dilg-logo.png" alt="DILG" /><span /></div><strong>Opening Social Studio…</strong></div>;
}

async function compressImage(file, maxDimension = 1400, quality = 0.8) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Image is too large");
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const bitmap = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
  const scale = Math.min(1, maxDimension / Math.max(bitmap.naturalWidth, bitmap.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(bitmap.naturalHeight * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
