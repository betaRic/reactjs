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
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  Download,
  ExternalLink,
  FileImage,
  ImagePlus,
  Images,
  LayoutDashboard,
  Loader2,
  KeyRound,
  GripVertical,
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
  Wifi,
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
const PUBLISH_KEY_STORAGE = "dilg-social-studio:publish-key";

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
  const [publishKey, setPublishKey] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setStudio(loadStudioState());
      setPublishKey(window.sessionStorage.getItem(PUBLISH_KEY_STORAGE) || "");
    });
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

  function updatePublishKey(value) {
    setPublishKey(value);
    if (value) window.sessionStorage.setItem(PUBLISH_KEY_STORAGE, value);
    else window.sessionStorage.removeItem(PUBLISH_KEY_STORAGE);
  }

  function saveCampaign(nextStatus = draft.status || "Draft", extra = {}) {
    const title = draft.title.trim();
    if (!title) {
      toast.error("Give this campaign a title first.");
      return;
    }
    const now = new Date().toISOString();
    const id = draft.id || createId("campaign");
    const campaign = {
      ...draft,
      ...extra,
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
    toast.success(
      extra.facebookPostId
        ? nextStatus === "Scheduled" ? "Post scheduled on Facebook." : "Post published to Facebook."
        : nextStatus === "Draft" ? "Draft saved to this device." : `Campaign marked ${nextStatus.toLowerCase()}.`,
    );
  }

  function submitForReview() {
    if (!draft.title.trim() || !draft.caption.trim() || draft.images.length === 0) {
      toast.error("Add a title, caption, and at least one image before review.");
      return;
    }
    saveCampaign("Ready for review");
  }

  async function publishCampaign() {
    if (!draft.title.trim() || !draft.caption.trim() || draft.images.length === 0) {
      toast.error("Add a title, caption, and at least one image before publishing.");
      return;
    }
    if (!publishKey) {
      toast.error("Add your session publishing key in Settings before posting.");
      return;
    }
    setPublishing(true);
    try {
      const template = studio.templates.find((item) => item.id === draft.templateId) || studio.templates[0];
      const mediaIds = [];
      for (let index = 0; index < draft.images.length; index += 1) {
        setPublishProgress(`Preparing photo ${index + 1} of ${draft.images.length}`);
        const photo = await renderTemplatedImage(draft.images[index].src, template?.image);
        const form = new FormData();
        form.set("photo", photo, `campaign-photo-${String(index + 1).padStart(2, "0")}.jpg`);
        setPublishProgress(`Uploading photo ${index + 1} of ${draft.images.length}`);
        const upload = await requestJson("/api/facebook/media", {
          method: "POST",
          headers: { "x-publish-key": publishKey },
          body: form,
        });
        mediaIds.push(upload.mediaId);
      }
      setPublishProgress(draft.scheduledFor ? "Scheduling on Facebook" : "Publishing to Facebook");
      const result = await requestJson("/api/facebook/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-publish-key": publishKey },
        body: JSON.stringify({
          message: draft.caption,
          mediaIds,
          scheduledFor: draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : "",
        }),
      });
      saveCampaign(result.scheduled ? "Scheduled" : "Published", {
        facebookPostId: result.postId,
        facebookPermalink: result.permalink || "",
      });
    } catch (error) {
      toast.error(error.message || "Facebook publishing failed.", { duration: 8000 });
    } finally {
      setPublishing(false);
      setPublishProgress("");
    }
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
    publishKey,
    setPublishKey: updatePublishKey,
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
            publishing={publishing}
            publishProgress={publishProgress}
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

function Campaigns({ studio, openComposer, deleteCampaign }) {
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
                  <td><div className="row-actions"><button onClick={() => openComposer(campaign)} aria-label="Edit campaign"><PencilLine size={17} /></button>{campaign.status === "Approved" && <button onClick={() => openComposer(campaign)} aria-label="Open campaign to publish"><Send size={17} /></button>}<button className="danger" onClick={() => deleteCampaign(campaign.id)} aria-label="Delete campaign"><Trash2 size={17} /></button></div></td>
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
  const replaceRef = useRef(null);
  const [editor, setEditor] = useState(null);
  async function addTemplate(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const prepared = await prepareTemplateImage(file);
      const template = { id: createId("template"), name: file.name.replace(/\.[^.]+$/, ""), size: prepared.size, ratio: prepared.ratio, image: prepared.src, usage: 0, createdAt: new Date().toISOString() };
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
    const selected = studio.templates.find((item) => item.id === id);
    if (!selected || !window.confirm(`Delete “${selected.name}”? Campaigns using it will move to another template.`)) return;
    setStudio((current) => {
      const templates = current.templates.filter((item) => item.id !== id);
      const fallbackId = templates[0].id;
      return {
        ...current,
        templates,
        settings: {
          ...current.settings,
          defaultTemplateId: current.settings.defaultTemplateId === id ? fallbackId : current.settings.defaultTemplateId,
        },
        campaigns: current.campaigns.map((campaign) => campaign.templateId === id ? { ...campaign, templateId: fallbackId, updatedAt: new Date().toISOString() } : campaign),
        activity: [{ id: createId("activity"), type: "deleted", text: `${selected.name} template was deleted`, at: new Date().toISOString() }, ...current.activity],
      };
    });
    setEditor(null);
    toast.success("Template removed.");
  }
  async function replaceTemplateImage(event) {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    try {
      const prepared = await prepareTemplateImage(file);
      setEditor((current) => ({ ...current, image: prepared.src, size: prepared.size, ratio: prepared.ratio }));
      toast.success("New template image is ready to save.");
    } catch {
      toast.error("That template image could not be prepared.");
    } finally { event.target.value = ""; }
  }
  function saveTemplateEdit() {
    const name = editor?.name?.trim();
    if (!editor || !name) return toast.error("Template name is required.");
    setStudio((current) => ({
      ...current,
      templates: current.templates.map((item) => item.id === editor.id ? { ...item, ...editor, name, updatedAt: new Date().toISOString() } : item),
      activity: [{ id: createId("activity"), type: "created", text: `${name} template was updated`, at: new Date().toISOString() }, ...current.activity],
    }));
    setEditor(null);
    toast.success("Template updated.");
  }
  return (
    <div className="content-stack">
      <PageIntro title="Brand templates" text="Keep every post recognizable with approved frames and layouts." action="Upload template" onAction={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={addTemplate} />
      <div className="template-grid">
        {studio.templates.map((template) => {
          const isDefault = studio.settings.defaultTemplateId === template.id;
          const usage = studio.campaigns.filter((campaign) => campaign.templateId === template.id).length;
          return (
            <motion.article className="template-card" layout key={template.id}>
              <div className="template-preview"><img src={template.image} alt={`${template.name} preview`} />{isDefault && <span className="default-chip"><Check size={14} /> Default</span>}</div>
              <div className="template-meta"><div><strong>{template.name}</strong><span>{template.size} · {template.ratio}</span></div><button className="icon-button subtle" onClick={() => setEditor({ ...template })} aria-label={`Edit ${template.name}`}><PencilLine size={18} /></button></div>
              <div className="template-actions"><span>{usage} campaign{usage === 1 ? "" : "s"}</span>{!isDefault && <button onClick={() => setDefault(template.id)}>Make default</button>}<button onClick={() => setEditor({ ...template })}>Edit</button><button className="danger-link" onClick={() => removeTemplate(template.id)}>Delete</button></div>
            </motion.article>
          );
        })}
        <button className="template-upload-card" onClick={() => fileRef.current?.click()}><span><Upload size={22} /></span><strong>Add a new template</strong><small>Transparent PNG recommended · up to 10 MB</small></button>
      </div>
      <AnimatePresence>
        {editor && (
          <motion.div className="template-editor-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="template-editor" role="dialog" aria-modal="true" aria-label={`Edit ${editor.name}`} initial={{ opacity: 0, scale: .96, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 10 }}>
              <header><div><span className="section-kicker"><PencilLine size={14} /> Template editor</span><h3>Update template</h3></div><button className="icon-button" onClick={() => setEditor(null)} aria-label="Close template editor"><X size={19} /></button></header>
              <div className="template-editor-body">
                <div className="template-editor-preview"><img src={editor.image} alt="Updated template preview" /><button className="secondary-button" onClick={() => replaceRef.current?.click()}><Upload size={17} /> Replace image</button><input ref={replaceRef} type="file" accept="image/*" hidden onChange={replaceTemplateImage} /></div>
                <div className="template-editor-fields"><Field label="Template name"><input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></Field><div className="template-editor-details"><span>Canvas</span><strong>{editor.size} · {editor.ratio}</strong></div><p>Replacing the image keeps this template connected to existing campaigns. Use a transparent PNG when the campaign photo should remain visible behind the frame.</p></div>
              </div>
              <footer><button className="danger-button" onClick={() => removeTemplate(editor.id)}><Trash2 size={17} /> Delete template</button><div><button className="secondary-button" onClick={() => setEditor(null)}>Cancel</button><button className="primary-button" onClick={saveTemplateEdit}><Check size={17} /> Save changes</button></div></footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
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

function SettingsView({ studio, setStudio, publishKey, setPublishKey }) {
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
      <FacebookConnection publishKey={publishKey} setPublishKey={setPublishKey} />
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph amber"><ShieldCheck size={20} /></div><div><h3>Publishing workflow</h3><p>Control the checks content passes before publishing.</p></div></div>
        <ToggleRow title="Require approval" text="Campaigns must be marked approved before publishing." checked={settings.approvalRequired} onChange={(value) => setSettings({ ...settings, approvalRequired: value })} />
        <ToggleRow title="Workspace notifications" text="Show local reminders for scheduled campaigns." checked={settings.notifications} onChange={(value) => setSettings({ ...settings, notifications: value })} />
      </section>
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph emerald"><Download size={20} /></div><div><h3>Local data</h3><p>Everything is stored in this browser. Keep a backup when moving devices.</p></div></div>
        <div className="data-actions"><button className="secondary-button" onClick={exportData}><Download size={17} /> Export backup</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={17} /> Import backup</button><button className="danger-button" onClick={reset}><Trash2 size={17} /> Reset workspace</button><input ref={importRef} type="file" accept="application/json" hidden onChange={importData} /></div>
        <div className="security-note"><ShieldCheck size={18} /><span><strong>The Facebook Page token stays on the server.</strong> It is read only by secured Next.js routes from Vercel environment variables and is never sent to the browser or included in backups.</span></div>
      </section>
      <div className="settings-save"><button className="primary-button" onClick={save}><Check size={17} /> Save settings</button></div>
    </div>
  );
}

function FacebookConnection({ publishKey, setPublishKey }) {
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState(null);
  async function checkConnection() {
    setChecking(true);
    try {
      const result = await requestJson("/api/facebook/status", { headers: { "x-publish-key": publishKey } });
      setConnection(result);
      if (!result.configured) toast.error(`Vercel is missing: ${result.missing.join(", ")}`);
      else toast.success(`Connected to ${result.page.name}.`);
    } catch (error) {
      setConnection({ configured: true, connected: false, error: error.message });
      toast.error(error.message, { duration: 7000 });
    } finally { setChecking(false); }
  }
  return (
    <section className="settings-section panel facebook-connection-card">
      <div className="settings-title"><div className="settings-glyph sky"><Wifi size={20} /></div><div><h3>Facebook connection</h3><p>Secure live publishing through Meta’s Pages API and Vercel.</p></div>{connection?.connected && <span className="connection-badge connected"><CheckCircle2 size={15} /> Connected</span>}</div>
      <div className="connection-layout">
        <Field label="Session publishing key" hint="Never included in local backups"><div className="secure-input"><KeyRound size={17} /><input type="password" autoComplete="off" value={publishKey} onChange={(event) => setPublishKey(event.target.value)} placeholder="Enter the key configured in Vercel" /></div></Field>
        <button className="secondary-button connection-check" onClick={checkConnection} disabled={checking || !publishKey}>{checking ? <Loader2 className="spin" size={17} /> : <Wifi size={17} />} Test connection</button>
      </div>
      <p className="session-key-note">This key authorizes your current browser tab to use the server connection. It is stored only in session storage and clears when the browser session ends.</p>
      {connection?.connected && <div className="connected-page"><div className="connected-page-avatar">{connection.page.picture ? <img src={connection.page.picture} alt="" /> : <MessageSquareText size={20} />}</div><div><strong>{connection.page.name}</strong><span>Page ID {connection.page.id} · Graph API {connection.graphVersion}</span></div>{connection.page.link && <a href={connection.page.link} target="_blank" rel="noreferrer">Open Page <ExternalLink size={14} /></a>}</div>}
      {connection && !connection.connected && <div className="connection-error">{connection.configured === false ? `Server variables still needed: ${connection.missing.join(", ")}` : connection.error}</div>}
    </section>
  );
}

function Composer({ draft, setDraft, templates, settings, onClose, onSave, onReview, onPublish, publishing, publishProgress }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [draggedImageId, setDraggedImageId] = useState(null);
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
  function moveImage(id, direction) {
    setDraft((current) => {
      const images = [...current.images];
      const index = images.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= images.length) return current;
      [images[index], images[nextIndex]] = [images[nextIndex], images[index]];
      return { ...current, images };
    });
  }
  function placeImageBefore(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    setDraft((current) => {
      const sourceIndex = current.images.findIndex((item) => item.id === sourceId);
      const targetIndex = current.images.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const images = [...current.images];
      const [moved] = images.splice(sourceIndex, 1);
      const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      images.splice(adjustedTarget, 0, moved);
      return { ...current, images };
    });
  }
  return (
    <motion.div className="composer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="composer" role="dialog" aria-modal="true" aria-label={draft.id ? "Edit campaign" : "Create campaign"} initial={{ opacity: 0, scale: 0.98, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
        <header className="composer-header"><div><span className="section-kicker"><WandSparkles size={14} /> Campaign composer</span><h2>{draft.id ? "Edit campaign" : "Create a campaign"}</h2></div><button className="icon-button" onClick={onClose} disabled={publishing} aria-label="Close composer"><X size={20} /></button></header>
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
              {draft.images.length > 0 && (
                <>
                  <div className="media-order-hint"><GripVertical size={16} /><span>Drag photos to rearrange them, or use the arrow controls. The first photo becomes the cover.</span></div>
                  <div className="image-strip">
                    {draft.images.map((image, index) => (
                      <motion.div
                        layout
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className={clsx("image-thumb", draggedImageId === image.id && "is-dragging")}
                        key={image.id}
                        draggable
                        onDragStart={(event) => {
                          setDraggedImageId(image.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", image.id);
                        }}
                        onDragEnd={() => setDraggedImageId(null)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          placeImageBefore(event.dataTransfer.getData("text/plain") || draggedImageId, image.id);
                          setDraggedImageId(null);
                        }}
                      >
                        <img src={image.src} alt={image.name} />
                        {index === 0 && <span className="cover-badge">Cover</span>}
                        <div className="media-position" title="Drag to rearrange"><GripVertical size={14} /><span>{index + 1}</span></div>
                        <div className="media-controls">
                          <button type="button" onClick={() => moveImage(image.id, -1)} disabled={index === 0} aria-label={`Move ${image.name} left`}><ChevronLeft size={15} /></button>
                          <button type="button" onClick={() => moveImage(image.id, 1)} disabled={index === draft.images.length - 1} aria-label={`Move ${image.name} right`}><ChevronRight size={15} /></button>
                          <button type="button" className="remove-media" onClick={() => removeImage(image.id)} aria-label={`Remove ${image.name}`}><X size={15} /></button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </>
              )}
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
            <div className="preview-note"><ShieldCheck size={17} /><span>Live publishing uses the secure Meta connection configured in Vercel.</span></div>
          </aside>
        </div>
        <footer className="composer-footer"><div className="composer-save-area"><button className="text-button" onClick={onSave} disabled={publishing}>Save draft</button>{publishing && <span className="publish-progress"><Loader2 className="spin" size={15} /> {publishProgress}</span>}</div><div><button className="secondary-button" onClick={onReview} disabled={publishing}><BadgeCheck size={17} /> Submit for review</button><button className="primary-button" onClick={onPublish} disabled={publishing}>{publishing ? <Loader2 className="spin" size={17} /> : <Send size={17} />} {publishing ? "Publishing…" : draft.scheduledFor ? "Schedule on Facebook" : "Publish to Facebook"}</button></div></footer>
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

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || "The request could not be completed.");
    error.status = response.status;
    error.details = payload.details || null;
    throw error;
  }
  return payload;
}

async function renderTemplatedImage(sourceUrl, templateUrl) {
  const [source, template] = await Promise.all([loadBrowserImage(sourceUrl), templateUrl ? loadBrowserImage(templateUrl) : null]);
  const width = template?.naturalWidth || source.naturalWidth;
  const height = template?.naturalHeight || source.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const scale = Math.max(width / source.naturalWidth, height / source.naturalHeight);
  const drawWidth = source.naturalWidth * scale;
  const drawHeight = source.naturalHeight * scale;
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  if (template) context.drawImage(template, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The post image could not be prepared.")), "image/jpeg", .88));
}

async function prepareTemplateImage(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Template is too large");
  const source = await fileToDataUrl(file);
  const image = await loadBrowserImage(source);
  const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  return {
    src: canvas.toDataURL("image/webp", .9),
    size: `${width} × ${height}`,
    ratio: `${(width / height).toFixed(2)}:1`,
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadBrowserImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("An image could not be loaded."));
    image.src = source;
  });
}

async function compressImage(file, maxDimension = 1400, quality = 0.8) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Image is too large");
  const source = await fileToDataUrl(file);
  const bitmap = await loadBrowserImage(source);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.naturalWidth, bitmap.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(bitmap.naturalHeight * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
