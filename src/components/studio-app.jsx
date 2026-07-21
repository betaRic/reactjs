"use client";
/* eslint-disable @next/next/no-img-element */

import { AnimatePresence, motion } from "motion/react";
import { upload } from "@vercel/blob/client";
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
  Copy,
  Crop,
  Download,
  CloudUpload,
  ExternalLink,
  FileImage,
  Grid3X3,
  ImagePlus,
  Images,
  Newspaper,
  LayoutDashboard,
  Loader2,
  KeyRound,
  GripVertical,
  Menu,
  MessageSquareText,
  Move,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Smartphone,
  WandSparkles,
  Wifi,
  X,
  ZoomIn,
  ZoomOut,
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
const EMPTY_FACEBOOK_DIRECTORY = { loading: true, available: false, connected: false, missing: [], pages: [], selectedPageId: "", user: null };
const DEFAULT_PHOTO_EDIT = { zoom: 1, positionX: 50, positionY: 50, rotation: 0 };
const DEFAULT_EVENT_OVERLAY = { enabled: false, title: "", date: "", location: "", position: "bottom-left" };
const browserImageCache = new Map();
const rotatedImageCache = new WeakMap();

const emptyDraft = (templateId = "template-feed") => ({
  id: "",
  title: "",
  caption: "",
  status: "Draft",
  templateId,
  scheduledFor: "",
  destinations: ["feed", "story"],
  eventOverlay: { ...DEFAULT_EVENT_OVERLAY },
  images: [],
});

export default function StudioApp() {
  const [studio, setStudio] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [publishKey, setPublishKey] = useState("");
  const [facebookDirectory, setFacebookDirectory] = useState(EMPTY_FACEBOOK_DIRECTORY);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setStudio(loadStudioState());
      setPublishKey(window.sessionStorage.getItem(PUBLISH_KEY_STORAGE) || "");
      requestJson("/api/facebook/connections")
        .then((directory) => setFacebookDirectory({ ...directory, loading: false }))
        .catch((error) => setFacebookDirectory({ ...EMPTY_FACEBOOK_DIRECTORY, loading: false, error: error.message }));

      const url = new URL(window.location.href);
      const facebookResult = url.searchParams.get("facebook");
      if (facebookResult) {
        setActiveView("settings");
        if (facebookResult === "connected") toast.success("Facebook connected. Choose the Page this workspace should publish to.");
        else toast.error("Facebook could not be connected. Please try again or ask an administrator to check the Meta app settings.", { duration: 8000 });
        url.searchParams.delete("facebook");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
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
        ? {
            ...campaign,
            destinations: campaign.destinations?.length ? campaign.destinations : ["feed", "story"],
            eventOverlay: normalizeEventOverlay(campaign.eventOverlay),
            images: campaign.images.map((image) => ({ ...image, type: image.type || "image", edit: normalizePhotoEdit(image.edit) })),
          }
        : emptyDraft(templateId),
    );
    setComposerOpen(true);
  }

  function updatePublishKey(value) {
    setPublishKey(value);
    if (value) window.sessionStorage.setItem(PUBLISH_KEY_STORAGE, value);
    else window.sessionStorage.removeItem(PUBLISH_KEY_STORAGE);
  }

  async function refreshFacebookDirectory() {
    setFacebookDirectory((current) => ({ ...current, loading: true, error: "" }));
    try {
      const directory = await requestJson("/api/facebook/connections");
      setFacebookDirectory({ ...directory, loading: false });
      return directory;
    } catch (error) {
      setFacebookDirectory((current) => ({ ...current, loading: false, error: error.message }));
      throw error;
    }
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
      extra.facebookPostId || extra.facebookStoryId
        ? nextStatus === "Scheduled" ? "Post scheduled on Facebook." : "Post published to Facebook."
        : nextStatus === "Draft" ? "Draft saved to this device." : `Campaign marked ${nextStatus.toLowerCase()}.`,
    );
  }

  function submitForReview() {
    const destinations = draft.destinations?.length ? draft.destinations : [];
    if (!draft.title.trim() || draft.images.length === 0 || (destinations.includes("feed") && !draft.caption.trim())) {
      toast.error(destinations.includes("feed") ? "Add a title, Feed caption, and media before review." : "Add a title and media before review.");
      return;
    }
    saveCampaign("Ready for review");
  }

  async function publishCampaign() {
    if (!draft.title.trim() || draft.images.length === 0) {
      toast.error("Add a title and at least one photo or video before publishing.");
      return;
    }
    const destinations = draft.destinations?.length ? draft.destinations : [];
    if (!destinations.length) {
      toast.error("Choose Facebook Feed, My Day, or both.");
      return;
    }
    if (destinations.includes("feed") && !draft.caption.trim()) {
      toast.error("Add a caption for the Facebook Feed post.");
      return;
    }
    if (draft.scheduledFor && destinations.includes("story")) {
      toast.error("Facebook My Day publishes immediately. Clear the schedule or choose Feed only.");
      return;
    }
    const video = draft.images.find((item) => item.type === "video");
    if (video && destinations.includes("story") && Number(video.duration || 0) > 60) {
      toast.error("Facebook My Day videos must be 60 seconds or shorter. Choose Feed only or upload a shorter video.");
      return;
    }
    setPublishing(true);
    try {
      const results = { feed: null, story: null };
      const errors = [];
      if (video) {
        setPublishProgress("Sending video to Facebook");
        const result = await requestJson("/api/facebook/video", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-publish-key": publishKey },
          body: JSON.stringify({
            title: draft.title,
            message: draft.caption,
            videoUrl: video.src,
            destinations,
            scheduledFor: draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : "",
          }),
        });
        results.feed = result.feed;
        results.story = result.story;
        errors.push(...(result.errors || []));
      } else {
        const template = studio.templates.find((item) => item.id === draft.templateId) || studio.templates[0];
        if (destinations.includes("feed")) {
          try {
            const mediaIds = [];
            for (let index = 0; index < draft.images.length; index += 1) {
              setPublishProgress(`Preparing Feed photo ${index + 1} of ${draft.images.length}`);
              const photo = await renderTemplatedImage(draft.images[index], template?.image, draft.eventOverlay, draft.title);
              const form = new FormData();
              form.set("photo", photo, `campaign-photo-${String(index + 1).padStart(2, "0")}.jpg`);
              setPublishProgress(`Uploading Feed photo ${index + 1} of ${draft.images.length}`);
              const uploaded = await requestJson("/api/facebook/media", {
                method: "POST",
                headers: { "x-publish-key": publishKey },
                body: form,
              });
              mediaIds.push(uploaded.mediaId);
            }
            setPublishProgress(draft.scheduledFor ? "Scheduling Facebook Feed post" : "Publishing Facebook Feed post");
            results.feed = await requestJson("/api/facebook/publish", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-publish-key": publishKey },
              body: JSON.stringify({
                message: draft.caption,
                mediaIds,
                scheduledFor: draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : "",
              }),
            });
          } catch (error) {
            errors.push({ destination: "feed", message: error.message });
          }
        }
        if (destinations.includes("story")) {
          try {
            setPublishProgress("Preparing Facebook My Day");
            const storyPhoto = await renderStoryImage(draft.images[0], template?.image, draft.eventOverlay, draft.title);
            const form = new FormData();
            form.set("photo", storyPhoto, "campaign-story.jpg");
            setPublishProgress("Publishing Facebook My Day");
            results.story = await requestJson("/api/facebook/story/photo", {
              method: "POST",
              headers: { "x-publish-key": publishKey },
              body: form,
            });
          } catch (error) {
            errors.push({ destination: "story", message: error.message });
          }
        }
      }
      if (!results.feed && !results.story) {
        throw new Error(errors.map((item) => `${destinationLabel(item.destination)}: ${item.message}`).join(" · ") || "Facebook publishing failed.");
      }
      const scheduled = Boolean(results.feed?.scheduled) && !results.story;
      saveCampaign(scheduled ? "Scheduled" : "Published", {
        facebookPostId: results.feed?.postId || "",
        facebookPermalink: results.feed?.permalink || "",
        facebookStoryId: results.story?.storyId || "",
        publishedDestinations: [results.feed && "feed", results.story && "story"].filter(Boolean),
        facebookPageId: selectedFacebookPage?.id || "",
        facebookPageName: selectedFacebookPage?.name || "",
      });
      if (errors.length) toast.warning(`Published partially. ${errors.map((item) => `${destinationLabel(item.destination)}: ${item.message}`).join(" · ")}`, { duration: 9000 });
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

  const selectedFacebookPage = facebookDirectory.pages.find((page) => page.id === facebookDirectory.selectedPageId) || facebookDirectory.pages[0] || null;
  const activeOrganization = selectedFacebookPage?.name || studio.settings.organization;

  const viewProps = {
    studio,
    setStudio,
    openComposer,
    setActiveView,
    updateCampaignStatus,
    deleteCampaign,
    publishKey,
    setPublishKey: updatePublishKey,
    facebookDirectory,
    setFacebookDirectory,
    refreshFacebookDirectory,
  };

  return (
    <div className="studio-shell">
      <Toaster richColors position="top-right" closeButton />
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        organization={activeOrganization}
        openComposer={() => openComposer()}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <main className="main-panel">
        <Topbar
          activeView={activeView}
          organization={activeOrganization}
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
            publishKey={publishKey}
            facebookPage={selectedFacebookPage}
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
          <div><strong>Social Studio</strong><span>{organization}</span></div>
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
      <div className="topbar-title"><img className="topbar-logo" src="/brand/dilg-logo.png" alt="" /><div><span className="topbar-context">{organization}</span><h1>{title}</h1></div></div>
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
                <CampaignMedia media={campaign.images[0]} />
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
                  <td><button className="campaign-cell" onClick={() => openComposer(campaign)}><CampaignMedia media={campaign.images[0]} /><span><strong>{campaign.title}</strong><small>Updated {formatRelativeDate(campaign.updatedAt)}</small></span></button></td>
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
      <PageIntro title="Brand templates" text="Upload the approved frame for each office. The included Gensan layouts are editable samples and can be replaced or deleted." action="Upload template" onAction={() => fileRef.current?.click()} />
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

function SettingsView({ studio, setStudio, publishKey, setPublishKey, facebookDirectory, setFacebookDirectory, refreshFacebookDirectory }) {
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
      <PageIntro title="Settings" text="Manage the Region XII connection, selected Facebook Page, workflow, and local workspace." />
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph indigo"><MessageSquareText size={20} /></div><div><h3>Workspace identity</h3><p>Shown throughout the studio and in post previews.</p></div></div>
        <div className="form-grid two-columns">
          <Field label="Organization"><input value={settings.organization} onChange={(event) => setSettings({ ...settings, organization: event.target.value })} /></Field>
          <Field label="Preview Page name" hint="Used only when no Page is connected"><input value={settings.pageName} onChange={(event) => setSettings({ ...settings, pageName: event.target.value })} /></Field>
          <Field label="Page handle"><input value={settings.pageHandle} onChange={(event) => setSettings({ ...settings, pageHandle: event.target.value })} /></Field>
          <Field label="Default template"><select value={settings.defaultTemplateId} onChange={(event) => setSettings({ ...settings, defaultTemplateId: event.target.value })}>{studio.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>
        </div>
      </section>
      <FacebookConnection publishKey={publishKey} setPublishKey={setPublishKey} facebookDirectory={facebookDirectory} setFacebookDirectory={setFacebookDirectory} refreshFacebookDirectory={refreshFacebookDirectory} />
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph amber"><ShieldCheck size={20} /></div><div><h3>Publishing workflow</h3><p>Control the checks content passes before publishing.</p></div></div>
        <ToggleRow title="Require approval" text="Campaigns must be marked approved before publishing." checked={settings.approvalRequired} onChange={(value) => setSettings({ ...settings, approvalRequired: value })} />
        <ToggleRow title="Workspace notifications" text="Show local reminders for scheduled campaigns." checked={settings.notifications} onChange={(value) => setSettings({ ...settings, notifications: value })} />
      </section>
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph emerald"><Download size={20} /></div><div><h3>Local data</h3><p>Everything is stored in this browser. Keep a backup when moving devices.</p></div></div>
        <div className="data-actions"><button className="secondary-button" onClick={exportData}><Download size={17} /> Export backup</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={17} /> Import backup</button><button className="danger-button" onClick={reset}><Trash2 size={17} /> Reset workspace</button><input ref={importRef} type="file" accept="application/json" hidden onChange={importData} /></div>
        <div className="security-note"><ShieldCheck size={18} /><span><strong>Facebook Page tokens stay on the server.</strong> Connected tokens are encrypted before database storage and are never sent to the browser or included in local backups. Legacy environment tokens also remain server-only.</span></div>
      </section>
      <div className="settings-save"><button className="primary-button" onClick={save}><Check size={17} /> Save settings</button></div>
    </div>
  );
}

function FacebookConnection({ publishKey, setPublishKey, facebookDirectory, setFacebookDirectory, refreshFacebookDirectory }) {
  const [checking, setChecking] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [connection, setConnection] = useState(null);
  const selectedPage = facebookDirectory.pages.find((page) => page.id === facebookDirectory.selectedPageId) || facebookDirectory.pages[0] || null;

  async function choosePage(pageId) {
    if (!pageId || pageId === facebookDirectory.selectedPageId) return;
    setSwitching(true);
    try {
      const directory = await requestJson("/api/facebook/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      setFacebookDirectory({ ...directory, loading: false });
      setConnection(null);
      toast.success(`Publishing Page changed to ${directory.pages.find((page) => page.id === pageId)?.name || "the selected Page"}.`);
    } catch (error) {
      toast.error(error.message, { duration: 7000 });
    } finally { setSwitching(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this Facebook account from this browser? Stored Page connections for this session will be removed.")) return;
    setSwitching(true);
    try {
      await requestJson("/api/facebook/connections", { method: "DELETE" });
      setFacebookDirectory({ ...EMPTY_FACEBOOK_DIRECTORY, loading: false, available: facebookDirectory.available, missing: facebookDirectory.missing });
      setConnection(null);
      toast.success("Facebook disconnected from this browser.");
    } catch (error) {
      toast.error(error.message, { duration: 7000 });
    } finally { setSwitching(false); }
  }

  async function checkConnection() {
    setChecking(true);
    try {
      const result = await requestJson("/api/facebook/status", { headers: { "x-publish-key": publishKey } });
      setConnection(result);
      if (!result.configured) toast.error(result.connectionRequired ? "Connect a Facebook Page before testing." : `Vercel is missing: ${result.missing.join(", ")}`);
      else if (!result.videoStorageConfigured) toast.warning(`Connected to ${result.page.name}. Add a public Vercel Blob store to enable video uploads.`);
      else toast.success(`Connected to ${result.page.name}.`);
    } catch (error) {
      setConnection({ configured: true, connected: false, error: error.message });
      toast.error(error.message, { duration: 7000 });
    } finally { setChecking(false); }
  }
  return (
    <section className="settings-section panel facebook-connection-card">
      <div className="settings-title"><div className="settings-glyph sky"><Wifi size={20} /></div><div><h3>Facebook Pages</h3><p>Connect once, then choose any Province or Regional Office Page you manage.</p></div>{facebookDirectory.connected && <span className="connection-badge connected"><CheckCircle2 size={15} /> Connected</span>}</div>

      {facebookDirectory.loading ? (
        <div className="connection-loading"><Loader2 className="spin" size={19} /> Loading Facebook connection…</div>
      ) : facebookDirectory.available ? (
        facebookDirectory.connected ? (
          <div className="oauth-connected-layout">
            <div className="connected-user"><BadgeCheck size={18} /><span>Connected as <strong>{facebookDirectory.user?.name || "Facebook user"}</strong></span></div>
            <div className="page-switcher">
              <Field label="Publishing Page" hint={`${facebookDirectory.pages.length} available`}>
                <select value={selectedPage?.id || ""} onChange={(event) => choosePage(event.target.value)} disabled={switching}>
                  {facebookDirectory.pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                </select>
              </Field>
              {switching && <Loader2 className="spin page-switcher-loader" size={18} />}
            </div>
            {selectedPage && <div className="connected-page"><div className="connected-page-avatar">{selectedPage.picture ? <img src={selectedPage.picture} alt="" /> : <MessageSquareText size={20} />}</div><div><strong>{selectedPage.name}</strong><span>Page ID {selectedPage.id} · selected for Feed and My Day publishing</span></div></div>}
            <div className="connection-actions">
              <button className="secondary-button" onClick={checkConnection} disabled={checking || switching}>{checking ? <Loader2 className="spin" size={17} /> : <Wifi size={17} />} Test selected Page</button>
              <a className="secondary-button" href="/api/facebook/oauth/start"><RefreshCcw size={17} /> Refresh Pages</a>
              <button className="danger-button" onClick={disconnect} disabled={switching}><Trash2 size={17} /> Disconnect</button>
            </div>
          </div>
        ) : (
          <div className="oauth-connection-hero">
            <div><strong>Connect your authorized Facebook account</strong><p>The app will show only Pages your account can manage. You can switch between Province, City, and Regional Office Pages before publishing.</p></div>
            <a className="primary-button facebook-connect-button" href="/api/facebook/oauth/start"><ExternalLink size={17} /> Connect with Facebook</a>
          </div>
        )
      ) : (
        <FacebookAdminSetup missing={facebookDirectory.missing} onRefresh={refreshFacebookDirectory} />
      )}

      <details className="legacy-connection">
        <summary>Temporary single-Page fallback — not for the regional rollout</summary>
        <div className="connection-layout">
          <Field label="Session publishing key" hint="Optional fallback"><div className="secure-input"><KeyRound size={17} /><input type="password" autoComplete="off" value={publishKey} onChange={(event) => setPublishKey(event.target.value)} placeholder="Enter the key configured in Vercel" /></div></Field>
          <button className="secondary-button connection-check" onClick={checkConnection} disabled={checking || (!publishKey && !facebookDirectory.connected)}>{checking ? <Loader2 className="spin" size={17} /> : <Wifi size={17} />} Test connection</button>
        </div>
        <p className="session-key-note">Use this only while the old single-Page environment-token setup is active. The key stays in session storage and clears when the browser session ends.</p>
      </details>

      {connection?.connected && <div className="connected-page test-result"><div className="connected-page-avatar">{connection.page.picture ? <img src={connection.page.picture} alt="" /> : <MessageSquareText size={20} />}</div><div><strong>Connection test passed: {connection.page.name}</strong><span>Page ID {connection.page.id} · Graph API {connection.graphVersion} · {connection.mode === "oauth" ? "secure account connection" : "legacy environment token"}</span></div>{connection.page.link && <a href={connection.page.link} target="_blank" rel="noreferrer">Open Page <ExternalLink size={14} /></a>}</div>}
      {connection?.connected && <div className={clsx("video-storage-status", connection.videoStorageConfigured ? "ready" : "missing")}><CloudUpload size={17} /><div><strong>{connection.videoStorageConfigured ? "Video storage ready" : "Video storage not connected"}</strong><span>{connection.videoStorageConfigured ? "Vercel Blob can accept campaign videos." : "Create a public Vercel Blob store to enable video uploads."}</span></div></div>}
      {connection && !connection.connected && <div className="connection-error">{connection.configured === false ? `Server variables still needed: ${connection.missing.join(", ")}` : connection.error}</div>}
      {facebookDirectory.error && <div className="connection-error">{facebookDirectory.error} <button type="button" onClick={() => refreshFacebookDirectory().catch(() => {})}>Try again</button></div>}
    </section>
  );
}

function FacebookAdminSetup({ missing = [], onRefresh }) {
  const [copied, setCopied] = useState("");
  const callbackUrl = typeof window === "undefined"
    ? "https://socialmedia-dilg12.vercel.app/api/facebook/oauth/callback"
    : `${window.location.origin}/api/facebook/oauth/callback`;
  const requiredVariables = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_TOKEN_ENCRYPTION_KEY", "DATABASE_URL"];
  const configuredCount = requiredVariables.filter((name) => !missing.includes(name)).length;

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      toast.success(`${label} copied.`);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      toast.error("Copying was blocked by the browser. Select and copy the value manually.");
    }
  }

  return (
    <div className="admin-setup-guide">
      <div className="regional-integration-model">
        <div><span>1</span><strong>One Region XII Meta app</strong><small>Shared secure infrastructure</small></div>
        <ArrowRight size={18} />
        <div><span>2</span><strong>Staff connect Facebook</strong><small>No Page tokens entered</small></div>
        <ArrowRight size={18} />
        <div><span>3</span><strong>Choose an authorized Page</strong><small>Province, city, or regional</small></div>
      </div>

      <div className="setup-guide-heading">
        <div><span className="section-kicker"><ShieldCheck size={14} /> Regional administrator setup</span><h4>Configure the connection once for every Region XII office</h4><p>These variables identify and protect the platform itself. They do not lock the app to Gensan or to any single Facebook Page.</p></div>
        <strong>{configuredCount} / {requiredVariables.length} ready</strong>
      </div>

      <div className="setup-variable-grid" aria-label="Server configuration status">
        {requiredVariables.map((name) => {
          const ready = !missing.includes(name);
          return <span key={name} className={clsx("setup-variable", ready && "ready")}>{ready ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />} {name}</span>;
        })}
      </div>

      <ol className="administrator-steps">
        <li>
          <span>1</span>
          <div><strong>Create one Meta app owned by the Region XII administrator</strong><p>Enable Facebook Login and request <code>pages_show_list</code>, <code>pages_manage_posts</code>, and <code>pages_read_engagement</code>. This one app can serve every office.</p><a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">Open Meta for Developers <ExternalLink size={14} /></a></div>
        </li>
        <li>
          <span>2</span>
          <div><strong>Add the production callback URL in Meta</strong><p>Use this exact URL under the Facebook Login valid OAuth redirect URIs.</p><div className="copy-setting"><code>{callbackUrl}</code><button type="button" onClick={() => copyValue(callbackUrl, "Callback URL")}>{copied === "Callback URL" ? <Check size={15} /> : <Copy size={15} />} {copied === "Callback URL" ? "Copied" : "Copy"}</button></div></div>
        </li>
        <li>
          <span>3</span>
          <div><strong>Connect one Postgres database to the Vercel project</strong><p>In Vercel Marketplace, add a Postgres provider such as Neon and connect it to this project. The integration supplies <code>DATABASE_URL</code>; the database safely separates each browser session and its authorized Pages.</p><a href="https://vercel.com/docs/postgres" target="_blank" rel="noreferrer">Open Vercel Postgres guide <ExternalLink size={14} /></a></div>
        </li>
        <li>
          <span>4</span>
          <div><strong>Add the three Meta security values in Vercel</strong><p>Open this project’s Settings → Environment Variables and add <code>FACEBOOK_APP_ID</code>, <code>FACEBOOK_APP_SECRET</code>, and a long random <code>FACEBOOK_TOKEN_ENCRYPTION_KEY</code>. Mark secrets as sensitive, apply them to Production, and redeploy.</p><a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Open Vercel dashboard <ExternalLink size={14} /></a></div>
        </li>
      </ol>

      <div className="setup-guide-footer">
        <div><KeyRound size={18} /><p><strong>Do not place these secrets or Facebook Page tokens in this screen.</strong> After setup, each office clicks “Connect with Facebook” and sees only Pages its staff account is allowed to manage.</p></div>
        <button className="secondary-button" type="button" onClick={() => onRefresh().catch(() => {})}><RefreshCcw size={16} /> Check setup again</button>
      </div>
    </div>
  );
}

function Composer({ draft, setDraft, templates, settings, publishKey, facebookPage, onClose, onSave, onReview, onPublish, publishing, publishProgress }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draggedImageId, setDraggedImageId] = useState(null);
  const [editingImageId, setEditingImageId] = useState(null);
  const activeTemplate = templates.find((item) => item.id === draft.templateId) || templates[0];
  const hasVideo = draft.images.some((item) => item.type === "video");
  const editingImage = draft.images.find((item) => item.id === editingImageId && item.type !== "video");
  const publishingIdentity = facebookPage?.name || settings.organization || "DILG Region XII";
  const organizationHashtag = `#${publishingIdentity.replace(/[^A-Za-z0-9]/g, "") || "DILGRegionXII"}`;
  const defaultLocation = publishingIdentity.replace(/^DILG\s*/i, "").trim() || "Region XII";
  async function addMedia(files) {
    const selected = [...files];
    const videoFiles = selected.filter((file) => file.type.startsWith("video/"));
    if (videoFiles.length) {
      if (selected.length !== 1 || draft.images.length) return toast.error("A video campaign can contain one video and no photos.");
      const file = videoFiles[0];
      if (!["video/mp4", "video/quicktime", "video/webm"].includes(file.type)) return toast.error("Use an MP4, MOV, or WebM video.");
      if (file.size > 500 * 1024 * 1024) return toast.error("Videos must be smaller than 500 MB.");
      setUploading(true);
      setUploadProgress(0);
      try {
        const metadata = await readVideoMetadata(file);
        const blob = await upload(`campaign-videos/${Date.now()}-${sanitizeFileName(file.name)}`, file, {
          access: "public",
          handleUploadUrl: "/api/media/upload",
          clientPayload: JSON.stringify({ publishKey }),
          multipart: file.size > 100 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
        });
        setDraft((current) => ({ ...current, images: [{ id: createId("video"), type: "video", name: file.name, src: blob.url, size: file.size, ...metadata }] }));
        toast.success("Video uploaded to secure media storage.");
      } catch (error) {
        toast.error(error.message || "The video could not be uploaded.", { duration: 7000 });
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
      return;
    }
    if (hasVideo) return toast.error("Remove the video before adding photos.");
    const imageFiles = selected.filter((file) => file.type.startsWith("image/")).slice(0, 8 - draft.images.length);
    if (!imageFiles.length) return;
    setUploading(true);
    try {
      const images = await Promise.all(imageFiles.map(async (file) => ({ id: createId("image"), type: "image", name: file.name, src: await compressImage(file), edit: { ...DEFAULT_PHOTO_EDIT } })));
      setDraft((current) => ({ ...current, images: [...current.images, ...images] }));
      toast.success(`${images.length} image${images.length === 1 ? "" : "s"} added.`);
    } catch {
      toast.error("One of those images could not be added.");
    } finally { setUploading(false); }
  }
  function removeImage(id) {
    if (editingImageId === id) setEditingImageId(null);
    setDraft((current) => ({ ...current, images: current.images.filter((item) => item.id !== id) }));
  }
  function updatePhotoEdit(id, edit) {
    setDraft((current) => ({ ...current, images: current.images.map((item) => item.id === id ? { ...item, edit: normalizePhotoEdit(edit) } : item) }));
  }
  function updateEventOverlay(changes) {
    setDraft((current) => ({ ...current, eventOverlay: { ...normalizeEventOverlay(current.eventOverlay), ...changes } }));
  }
  function toggleDestination(destination) {
    const current = draft.destinations?.length ? draft.destinations : [];
    const destinations = current.includes(destination) ? current.filter((item) => item !== destination) : [...current, destination];
    if (!destinations.length) return toast.error("Keep at least one publishing destination selected.");
    setDraft({ ...draft, destinations });
  }
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
              <div className="step-heading"><span>2</span><div><h3>Add photos or a video</h3><p>Use up to 8 photos, or one video for Feed and My Day.</p></div></div>
              <button className="drop-zone" type="button" disabled={uploading} onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addMedia(event.dataTransfer.files); }}>
                <span className="upload-glyph">{uploading ? <CloudUpload className="upload-pulse" size={23} /> : <ImagePlus size={23} />}</span><strong>{uploading ? uploadProgress ? `Uploading video… ${uploadProgress}%` : "Preparing media…" : "Drop photos or a video here"}</strong><small>Photos: JPG, PNG, WebP · Video: MP4, MOV, WebM up to 500 MB</small>
              </button>
              <input ref={fileRef} hidden type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onChange={(event) => { addMedia(event.target.files); event.target.value = ""; }} />
              {draft.images.length > 0 && (
                <>
                  <div className="media-order-hint">{hasVideo ? <Video size={16} /> : <GripVertical size={16} />}<span>{hasVideo ? `Video ready · ${formatDuration(draft.images[0].duration)} · ${formatFileSize(draft.images[0].size)}` : "Drag photos to rearrange them, or use the arrow controls. The first photo becomes the cover and My Day image."}</span></div>
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
                        {image.type === "video" ? <video src={image.src} muted playsInline preload="metadata" aria-label={image.name} /> : <img src={image.src} alt={image.name} />}
                        {index === 0 && <span className="cover-badge">Cover</span>}
                        {image.type !== "video" && <button type="button" className="edit-photo-button" onClick={() => setEditingImageId(image.id)} aria-label={`Edit crop for ${image.name}`}><Crop size={14} /> Edit</button>}
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
              <div className="step-heading"><span>3</span><div><h3>Caption and event details</h3><p>Write the post, then optionally add an event banner to every photo.</p></div></div>
              <Field label="Post copy" hint={`${draft.caption.length} / 2,200`}><textarea rows={7} value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value.slice(0, 2200) })} placeholder="Share the story behind this update…" /></Field>
              <div className="caption-tools"><button onClick={() => setDraft({ ...draft, caption: `${draft.caption}${draft.caption ? "\n\n" : ""}${organizationHashtag} #SerbisyongMatino` })}># Add hashtags</button><button onClick={() => setDraft({ ...draft, caption: `${draft.caption}${draft.caption ? "\n\n" : ""}📍 ${defaultLocation}` })}>Add location</button></div>
              <div className={clsx("event-overlay-panel", hasVideo && "is-disabled")}>
                <ToggleRow title="Event information overlay" text={hasVideo ? "Available for photo campaigns" : "Add the same event banner above every photo without changing the template."} checked={!hasVideo && draft.eventOverlay?.enabled} onChange={(enabled) => !hasVideo && updateEventOverlay({ enabled })} />
                {!hasVideo && draft.eventOverlay?.enabled && (
                  <motion.div className="event-overlay-fields" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                    <Field label="Event title" hint="Uses campaign title if blank"><input value={draft.eventOverlay.title} maxLength={120} onChange={(event) => updateEventOverlay({ title: event.target.value })} placeholder={draft.title || "Event title"} /></Field>
                    <Field label="Event date"><input type="date" value={draft.eventOverlay.date} onChange={(event) => updateEventOverlay({ date: event.target.value })} /></Field>
                    <Field label="Location"><input value={draft.eventOverlay.location} maxLength={80} onChange={(event) => updateEventOverlay({ location: event.target.value })} placeholder={`e.g. ${defaultLocation}`} /></Field>
                    <Field label="Banner placement"><select value={normalizeEventOverlay(draft.eventOverlay).position} onChange={(event) => updateEventOverlay({ position: event.target.value })}><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option></select></Field>
                  </motion.div>
                )}
              </div>
            </section>
            <section className="composer-section">
              <div className="step-heading"><span>4</span><div><h3>Choose where to publish</h3><p>Send this campaign to the Facebook Feed, My Day, or both.</p></div></div>
              <div className={clsx("publishing-page-context", facebookPage && "is-connected")}>
                <div className="connected-page-avatar">{facebookPage?.picture ? <img src={facebookPage.picture} alt="" /> : <MessageSquareText size={18} />}</div>
                <div><strong>{facebookPage ? `Publishing as ${facebookPage.name}` : "No multi-Page destination selected"}</strong><span>{facebookPage ? "This Page will receive every selected destination below." : "Connect or select a Facebook Page in Settings. The legacy single-Page connection remains available as a fallback."}</span></div>
              </div>
              <div className="destination-grid">
                <button type="button" className={clsx("destination-card", draft.destinations?.includes("feed") && "selected")} aria-pressed={draft.destinations?.includes("feed")} onClick={() => toggleDestination("feed")}><span><Newspaper size={20} /></span><div><strong>Facebook Feed</strong><small>Permanent Page post</small></div><i>{draft.destinations?.includes("feed") && <Check size={14} />}</i></button>
                <button type="button" className={clsx("destination-card", draft.destinations?.includes("story") && "selected")} aria-pressed={draft.destinations?.includes("story")} onClick={() => toggleDestination("story")}><span><Smartphone size={20} /></span><div><strong>My Day / Story</strong><small>Visible for 24 hours</small></div><i>{draft.destinations?.includes("story") && <Check size={14} />}</i></button>
              </div>
              {draft.destinations?.includes("story") && <p className="destination-note">My Day uses the first photo or the selected video. Story text is not supported by Meta, so the caption is used on the Feed post only. My Day publishes immediately.</p>}
              <div className="form-grid two-columns"><Field label="Template" hint={hasVideo ? "Photos only" : "Applied before publishing"}><select disabled={hasVideo} value={draft.templateId} onChange={(event) => setDraft({ ...draft, templateId: event.target.value })}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field><Field label="Feed publish date & time" hint="Leave blank to publish now"><input type="datetime-local" value={toDateTimeLocal(draft.scheduledFor)} onChange={(event) => setDraft({ ...draft, scheduledFor: event.target.value })} /></Field></div>
              {draft.scheduledFor && draft.destinations?.includes("story") && <div className="schedule-warning"><CalendarClock size={16} /> Remove My Day or clear the schedule. Meta Stories can only publish immediately through this connection.</div>}
            </section>
          </div>
          <aside className="preview-column">
            <div className="preview-heading"><span>Live preview</span><small>Facebook feed</small></div>
            <FacebookPreview draft={draft} settings={settings} template={activeTemplate} facebookPage={facebookPage} />
            <div className="preview-note"><ShieldCheck size={17} /><span>Live publishing uses the secure Meta connection configured in Vercel.</span></div>
          </aside>
        </div>
        <footer className="composer-footer"><div className="composer-save-area"><button className="text-button" onClick={onSave} disabled={publishing}>Save draft</button>{publishing && <span className="publish-progress"><Loader2 className="spin" size={15} /> {publishProgress}</span>}</div><div><button className="secondary-button" onClick={onReview} disabled={publishing}><BadgeCheck size={17} /> Submit for review</button><button className="primary-button" onClick={onPublish} disabled={publishing}>{publishing ? <Loader2 className="spin" size={17} /> : <Send size={17} />} {publishing ? "Publishing…" : draft.scheduledFor ? "Schedule on Facebook" : "Publish to Facebook"}</button></div></footer>
      </motion.section>
      <AnimatePresence>
        {editingImage && <PhotoEditor media={editingImage} template={activeTemplate} eventOverlay={draft.eventOverlay} campaignTitle={draft.title} onChange={(edit) => updatePhotoEdit(editingImage.id, edit)} onClose={() => setEditingImageId(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}

function PhotoEditor({ media, template, eventOverlay, campaignTitle, onChange, onClose }) {
  const edit = normalizePhotoEdit(media.edit);
  const [gridVisible, setGridVisible] = useState(false);
  function change(key, value) { onChange({ ...edit, [key]: value }); }
  function rotate(amount) { change("rotation", (edit.rotation + amount + 360) % 360); }
  function zoom(amount) { change("zoom", clamp(edit.zoom + amount, 1, 3)); }
  return (
    <motion.div className="photo-editor-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section className="photo-editor" role="dialog" aria-modal="true" aria-label={`Edit ${media.name}`} initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }}>
        <header><div><span className="section-kicker"><Crop size={14} /> Direct photo editor</span><h3>Move the photo into place</h3><p>Drag the image, scroll or pinch to zoom, and use arrow keys for precise nudging. The template stays locked.</p></div><button className="icon-button" onClick={onClose} aria-label="Close photo editor"><X size={19} /></button></header>
        <div className="photo-editor-body">
          <div className="photo-editor-stage">
            <div className={clsx("photo-editor-canvas-wrap", gridVisible && "show-grid")}>
              <InteractivePhotoCanvas media={media} template={template} eventOverlay={eventOverlay} campaignTitle={campaignTitle} onChange={onChange} />
              {gridVisible && <div className="crop-grid" aria-hidden="true"><i /><i /><i /><i /></div>}
              <div className="drag-cue" aria-hidden="true"><Move size={18} /><span>Drag photo</span></div>
            </div>
            <div className="direct-edit-toolbar" role="toolbar" aria-label="Photo editing tools">
              <div className="zoom-tool"><button type="button" onClick={() => zoom(-.1)} disabled={edit.zoom <= 1} aria-label="Zoom out"><ZoomOut size={18} /></button><output>{Math.round(edit.zoom * 100)}%</output><button type="button" onClick={() => zoom(.1)} disabled={edit.zoom >= 3} aria-label="Zoom in"><ZoomIn size={18} /></button></div>
              <span className="toolbar-divider" />
              <button type="button" onClick={() => rotate(-90)} title="Rotate left"><RotateCcw size={18} /><span>Left</span></button>
              <button type="button" onClick={() => rotate(90)} title="Rotate right"><RotateCw size={18} /><span>Right</span></button>
              <button type="button" onClick={() => onChange({ ...edit, positionX: 50, positionY: 50 })} title="Center photo"><Move size={18} /><span>Center</span></button>
              <button type="button" className={gridVisible ? "active" : ""} aria-pressed={gridVisible} onClick={() => setGridVisible((current) => !current)} title="Toggle alignment grid"><Grid3X3 size={18} /><span>Grid</span></button>
            </div>
            <div className="direct-edit-help"><span><Move size={15} /> Drag to reposition</span><span><ZoomIn size={15} /> Scroll or pinch to zoom</span><span>⌨ Arrow keys nudge · Shift moves farther</span></div>
          </div>
        </div>
        <footer><button className="secondary-button" onClick={() => onChange({ ...DEFAULT_PHOTO_EDIT })}><RefreshCcw size={17} /> Reset photo</button><button className="primary-button" onClick={onClose}><Check size={17} /> Done editing</button></footer>
      </motion.section>
    </motion.div>
  );
}

function InteractivePhotoCanvas({ media, template, eventOverlay, campaignTitle, onChange }) {
  const canvasRef = useRef(null);
  const assetsRef = useRef(null);
  const editRef = useRef(normalizePhotoEdit(media.edit));
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const wheelHandlerRef = useRef(null);
  const [assets, setAssets] = useState(null);
  const [interacting, setInteracting] = useState(false);
  const edit = useMemo(() => normalizePhotoEdit(media.edit), [media.edit]);
  const overlay = useMemo(() => normalizeEventOverlay(eventOverlay), [eventOverlay]);

  useEffect(() => { editRef.current = edit; }, [edit]);
  useEffect(() => {
    let active = true;
    Promise.all([loadBrowserImage(media.src), template?.image ? loadBrowserImage(template.image) : null]).then(([source, templateImage]) => {
      if (!active) return;
      const nextAssets = { source, templateImage };
      assetsRef.current = nextAssets;
      setAssets(nextAssets);
    }).catch(() => {});
    return () => { active = false; };
  }, [media.src, template?.image]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !assets) return;
    const width = assets.templateImage?.naturalWidth || assets.source.naturalWidth;
    const height = assets.templateImage?.naturalHeight || assets.source.naturalHeight;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    paintPhotoComposition(canvas.getContext("2d"), assets.source, assets.templateImage, width, height, edit, overlay, campaignTitle);
  }, [assets, edit, overlay, campaignTitle]);

  function emitEdit(next) {
    const normalized = normalizePhotoEdit(next);
    editRef.current = normalized;
    onChange(normalized);
  }
  function canvasPoint(clientX, clientY) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * canvas.width / rect.width, y: (clientY - rect.top) * canvas.height / rect.height };
  }
  function beginGesture() {
    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      const [first, second] = points;
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      gestureRef.current = { kind: "pinch", distance: Math.hypot(second.x - first.x, second.y - first.y), anchor: canvasPoint(midpoint.x, midpoint.y), edit: editRef.current };
    } else if (points.length === 1) {
      gestureRef.current = { kind: "drag", point: points[0], edit: editRef.current };
    } else gestureRef.current = null;
  }
  function handlePointerDown(event) {
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setInteracting(true);
    beginGesture();
  }
  function handlePointerMove(event) {
    if (!pointersRef.current.has(event.pointerId) || !assetsRef.current) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    const canvas = canvasRef.current;
    if (points.length >= 2) {
      if (!gesture || gesture.kind !== "pinch") { beginGesture(); return; }
      const [first, second] = points;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const midpoint = canvasPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
      const nextZoom = clamp(gesture.edit.zoom * distance / Math.max(gesture.distance, 1), 1, 3);
      emitEdit(zoomPhotoEditAtAnchor(assetsRef.current.source, canvas.width, canvas.height, gesture.edit, nextZoom, gesture.anchor, midpoint));
    } else if (points.length === 1 && gesture?.kind === "drag") {
      const rect = canvas.getBoundingClientRect();
      const deltaX = (points[0].x - gesture.point.x) * canvas.width / rect.width;
      const deltaY = (points[0].y - gesture.point.y) * canvas.height / rect.height;
      emitEdit(panPhotoEditByPixels(assetsRef.current.source, canvas.width, canvas.height, gesture.edit, deltaX, deltaY));
    }
  }
  function handlePointerEnd(event) {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setInteracting(pointersRef.current.size > 0);
    beginGesture();
  }
  function handleWheel(event) {
    if (!assetsRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const anchor = canvasPoint(event.clientX, event.clientY);
    const nextZoom = clamp(editRef.current.zoom * Math.exp(-event.deltaY * .0015), 1, 3);
    emitEdit(zoomPhotoEditAtAnchor(assetsRef.current.source, canvas.width, canvas.height, editRef.current, nextZoom, anchor, anchor));
  }
  useEffect(() => { wheelHandlerRef.current = handleWheel; });
  useEffect(() => {
    const canvas = canvasRef.current;
    const listener = (event) => wheelHandlerRef.current?.(event);
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, []);
  function handleKeyDown(event) {
    if (!assetsRef.current) return;
    const canvas = canvasRef.current;
    const step = event.shiftKey ? 18 : 5;
    const movement = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (movement) {
      event.preventDefault();
      emitEdit(panPhotoEditByPixels(assetsRef.current.source, canvas.width, canvas.height, editRef.current, movement[0], movement[1]));
    } else if (["+", "=", "-", "_"].includes(event.key)) {
      event.preventDefault();
      const anchor = { x: canvas.width / 2, y: canvas.height / 2 };
      const amount = ["+", "="].includes(event.key) ? .1 : -.1;
      emitEdit(zoomPhotoEditAtAnchor(assetsRef.current.source, canvas.width, canvas.height, editRef.current, clamp(editRef.current.zoom + amount, 1, 3), anchor, anchor));
    }
  }

  return <canvas ref={canvasRef} className={clsx("photo-editor-canvas", interacting && "is-interacting")} tabIndex={0} role="img" aria-label="Interactive photo crop. Drag to move, scroll or pinch to zoom, and use arrow keys to nudge." onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd} onKeyDown={handleKeyDown} />;
}

function ComposedPhotoPreview({ media, template, eventOverlay, campaignTitle, className }) {
  const canvasRef = useRef(null);
  const edit = useMemo(() => normalizePhotoEdit(media?.edit), [media?.edit]);
  const overlay = useMemo(() => normalizeEventOverlay(eventOverlay), [eventOverlay]);
  useEffect(() => {
    let active = true;
    if (!media?.src) return undefined;
    Promise.all([loadBrowserImage(media.src), template?.image ? loadBrowserImage(template.image) : null]).then(([source, templateImage]) => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = templateImage?.naturalWidth || source.naturalWidth;
      canvas.height = templateImage?.naturalHeight || source.naturalHeight;
      paintPhotoComposition(canvas.getContext("2d"), source, templateImage, canvas.width, canvas.height, edit, overlay, campaignTitle);
    }).catch(() => {});
    return () => { active = false; };
  }, [media?.src, template?.image, edit, overlay, campaignTitle]);
  return <canvas ref={canvasRef} className={className} role="img" aria-label="Edited photo with template and event overlay" />;
}

function FacebookPreview({ draft, settings, template, facebookPage }) {
  const primaryMedia = draft.images[0];
  const primaryImage = primaryMedia?.src;
  const isVideo = primaryMedia?.type === "video";
  const pageName = facebookPage?.name || settings.pageName;
  const pagePicture = facebookPage?.picture || "/brand/dilg-logo.png";
  return (
    <div className="facebook-preview">
      <div className="fb-post-header"><div className="fb-avatar"><img src={pagePicture} alt="" /></div><div><strong>{pageName}</strong><span>Just now · <span aria-label="Public">🌐</span></span></div><MoreHorizontal size={18} /></div>
      <div className={clsx("fb-caption", !draft.caption && "placeholder")}>{draft.caption || "Your caption will appear here as you write…"}</div>
      <div className="fb-media">
        {isVideo ? <video className="fb-source" src={primaryImage} controls playsInline preload="metadata" /> : primaryImage ? <ComposedPhotoPreview className="fb-source" media={primaryMedia} template={template} eventOverlay={draft.eventOverlay} campaignTitle={draft.title} /> : <div className="fb-empty"><ImagePlus size={28} /><span>Add photos or a video to preview the post</span></div>}
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
      <div className="campaign-card-image"><CampaignMedia media={campaign.images[0]} /><StatusBadge status={campaign.status} /></div>
      <div className="campaign-card-copy"><strong>{campaign.title}</strong><span><Clock3 size={14} /> {formatRelativeDate(campaign.scheduledFor || campaign.updatedAt)}</span></div>
    </button>
  );
}

function CampaignMedia({ media }) {
  const isVideo = media?.type === "video";
  return (
    <span className={clsx("campaign-media", isVideo && "is-video")} aria-hidden="true">
      {isVideo
        ? <video src={media.src} muted playsInline preload="metadata" />
        : <img src={media?.src || "/demo/sample-landscape.jpg"} alt="" />}
      {isVideo && <span className="video-marker"><Video size={14} /> Video</span>}
    </span>
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

async function renderTemplatedImage(media, templateUrl, eventOverlay, campaignTitle) {
  const [source, template] = await Promise.all([loadBrowserImage(media.src), templateUrl ? loadBrowserImage(templateUrl) : null]);
  const width = template?.naturalWidth || source.naturalWidth;
  const height = template?.naturalHeight || source.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paintPhotoComposition(canvas.getContext("2d"), source, template, width, height, media.edit, eventOverlay, campaignTitle);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The post image could not be prepared.")), "image/jpeg", .88));
}

async function renderStoryImage(media, templateUrl, eventOverlay, campaignTitle) {
  const [source, template] = await Promise.all([loadBrowserImage(media.src), templateUrl ? loadBrowserImage(templateUrl) : null]);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");

  context.fillStyle = "#111329";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.filter = "blur(34px) brightness(.55)";
  drawEditedImageCover(context, source, -70, -70, canvas.width + 140, canvas.height + 140, media.edit);
  context.restore();
  context.fillStyle = "rgba(13, 16, 38, .34)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const ratio = (template?.naturalWidth || source.naturalWidth) / (template?.naturalHeight || source.naturalHeight);
  let frameWidth = 960;
  let frameHeight = frameWidth / ratio;
  if (frameHeight > 1340) {
    frameHeight = 1340;
    frameWidth = frameHeight * ratio;
  }
  const frameX = (canvas.width - frameWidth) / 2;
  const frameY = (canvas.height - frameHeight) / 2;

  context.save();
  context.shadowColor = "rgba(0, 0, 0, .42)";
  context.shadowBlur = 42;
  context.shadowOffsetY = 18;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.roundRect(frameX, frameY, frameWidth, frameHeight, 24);
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.roundRect(frameX, frameY, frameWidth, frameHeight, 24);
  context.clip();
  context.translate(frameX, frameY);
  paintPhotoComposition(context, source, template, frameWidth, frameHeight, media.edit, eventOverlay, campaignTitle);
  context.restore();

  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The Story image could not be prepared.")), "image/jpeg", .9));
}

function paintPhotoComposition(context, source, template, width, height, edit, eventOverlay, campaignTitle) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  drawEditedImageCover(context, source, 0, 0, width, height, edit);
  if (template) context.drawImage(template, 0, 0, width, height);
  drawEventOverlay(context, width, height, eventOverlay, campaignTitle);
}

function drawEditedImageCover(context, image, x, y, width, height, editValue) {
  const geometry = getPhotoGeometry(image, width, height, editValue, x, y);
  context.drawImage(geometry.source, geometry.drawX, geometry.drawY, geometry.drawWidth, geometry.drawHeight);
}

function getPhotoGeometry(image, width, height, editValue, x = 0, y = 0) {
  const edit = normalizePhotoEdit(editValue);
  const source = getRotatedImage(image, edit.rotation);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * edit.zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = x + (width - drawWidth) * (edit.positionX / 100);
  const drawY = y + (height - drawHeight) * (edit.positionY / 100);
  return { source, drawWidth, drawHeight, drawX, drawY };
}

function panPhotoEditByPixels(image, width, height, editValue, deltaX, deltaY) {
  const edit = normalizePhotoEdit(editValue);
  const geometry = getPhotoGeometry(image, width, height, edit);
  const overflowX = Math.max(0, geometry.drawWidth - width);
  const overflowY = Math.max(0, geometry.drawHeight - height);
  return normalizePhotoEdit({
    ...edit,
    positionX: overflowX > .5 ? (-(geometry.drawX + deltaX) / overflowX) * 100 : 50,
    positionY: overflowY > .5 ? (-(geometry.drawY + deltaY) / overflowY) * 100 : 50,
  });
}

function zoomPhotoEditAtAnchor(image, width, height, editValue, nextZoom, anchorFrom, anchorTo) {
  const edit = normalizePhotoEdit(editValue);
  const current = getPhotoGeometry(image, width, height, edit);
  const sourceX = (anchorFrom.x - current.drawX) / current.drawWidth;
  const sourceY = (anchorFrom.y - current.drawY) / current.drawHeight;
  const next = normalizePhotoEdit({ ...edit, zoom: nextZoom });
  const nextGeometry = getPhotoGeometry(image, width, height, next);
  const overflowX = Math.max(0, nextGeometry.drawWidth - width);
  const overflowY = Math.max(0, nextGeometry.drawHeight - height);
  const desiredX = anchorTo.x - sourceX * nextGeometry.drawWidth;
  const desiredY = anchorTo.y - sourceY * nextGeometry.drawHeight;
  return normalizePhotoEdit({
    ...next,
    positionX: overflowX > .5 ? (-desiredX / overflowX) * 100 : 50,
    positionY: overflowY > .5 ? (-desiredY / overflowY) * 100 : 50,
  });
}

function getRotatedImage(image, rotationValue) {
  const rotation = ((Math.round(Number(rotationValue) / 90) * 90) % 360 + 360) % 360;
  if (!rotation) return image;
  let rotations = rotatedImageCache.get(image);
  if (!rotations) {
    rotations = new Map();
    rotatedImageCache.set(image, rotations);
  }
  if (rotations.has(rotation)) return rotations.get(rotation);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = rotation % 180 ? height : width;
  canvas.height = rotation % 180 ? width : height;
  const context = canvas.getContext("2d");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  rotations.set(rotation, canvas);
  return canvas;
}

function drawEventOverlay(context, width, height, overlayValue, campaignTitle) {
  const overlay = normalizeEventOverlay(overlayValue);
  const title = (overlay.title || campaignTitle || "").trim();
  const meta = [formatEventDate(overlay.date), overlay.location.trim()].filter(Boolean).join("  ·  ");
  if (!overlay.enabled || (!title && !meta)) return;

  const marginX = width * .04;
  const marginY = height * .045;
  const boxWidth = width * .72;
  const paddingX = Math.max(18, width * .032);
  const paddingY = Math.max(14, width * .018);
  const stripeHeight = Math.max(7, width * .007);
  const titleSize = clamp(width * .032, 24, 48);
  const titleLineHeight = titleSize * 1.1;
  const metaSize = clamp(titleSize * .48, 14, 22);
  context.font = `800 ${titleSize}px Arial, sans-serif`;
  const titleLines = title ? wrapCanvasText(context, title.toUpperCase(), boxWidth - paddingX * 2, 2) : [];
  const boxHeight = stripeHeight + paddingY * 2 + titleLines.length * titleLineHeight + (meta ? metaSize * 1.45 : 0);

  const [, horizontal] = overlay.position.split("-");
  const boxX = horizontal === "right" ? width - marginX - boxWidth : horizontal === "center" ? (width - boxWidth) / 2 : marginX;
  const boxY = overlay.position.startsWith("top") ? marginY : height - marginY - boxHeight;
  context.save();
  context.fillStyle = "rgba(9, 12, 27, .92)";
  context.beginPath();
  context.roundRect(boxX, boxY, boxWidth, boxHeight, Math.max(10, width * .012));
  context.fill();
  drawBrandStripe(context, boxX, boxY, boxWidth, stripeHeight);

  let textY = boxY + stripeHeight + paddingY + titleSize;
  context.fillStyle = "#ffffff";
  context.font = `800 ${titleSize}px Arial, sans-serif`;
  titleLines.forEach((line) => {
    context.fillText(line, boxX + paddingX, textY);
    textY += titleLineHeight;
  });
  if (meta) {
    context.fillStyle = "#f2c94c";
    context.font = `700 ${metaSize}px Arial, sans-serif`;
    context.fillText(fitCanvasText(context, meta, boxWidth - paddingX * 2), boxX + paddingX, textY + metaSize * .35);
  }
  context.restore();
}

function drawBrandStripe(context, x, y, width, height) {
  const colors = ["#11113d", "#073166", "#06499a", "#780b10", "#b61925", "#d72d37", "#f29b26", "#ffd51f"];
  const segment = width / colors.length;
  colors.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(x + index * segment, y, segment + 1, height);
  });
}

function wrapCanvasText(context, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const limited = lines.slice(0, maxLines);
  let last = limited[maxLines - 1];
  while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  limited[maxLines - 1] = `${last.trim()}…`;
  return limited;
}

function fitCanvasText(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted.trim()}…`;
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
  if (browserImageCache.has(source)) return browserImageCache.get(source);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      browserImageCache.delete(source);
      reject(new Error("An image could not be loaded."));
    };
    image.src = source;
  });
  browserImageCache.set(source, promise);
  return promise;
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

function normalizePhotoEdit(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const rotation = ((Math.round(Number(input.rotation || 0) / 90) * 90) % 360 + 360) % 360;
  return {
    zoom: clamp(Number(input.zoom) || 1, 1, 3),
    positionX: clamp(Number.isFinite(Number(input.positionX)) ? Number(input.positionX) : 50, 0, 100),
    positionY: clamp(Number.isFinite(Number(input.positionY)) ? Number(input.positionY) : 50, 0, 100),
    rotation,
  };
}

function normalizeEventOverlay(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const legacyPosition = input.position === "top" ? "top-left" : input.position === "bottom" ? "bottom-left" : input.position;
  const positions = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];
  return {
    enabled: Boolean(input.enabled),
    title: String(input.title || ""),
    date: String(input.date || ""),
    location: String(input.location || ""),
    position: positions.includes(legacyPosition) ? legacyPosition : DEFAULT_EVENT_OVERLAY.position,
  };
}

function formatEventDate(value) {
  if (!value) return "";
  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return String(value);
  return new Intl.DateTimeFormat("en-PH", { month: "long", day: "numeric", year: "numeric" }).format(new Date(parts[0], parts[1] - 1, parts[2]));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => URL.revokeObjectURL(source);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      const width = Number(video.videoWidth);
      const height = Number(video.videoHeight);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0 || !width || !height) {
        reject(new Error("The video metadata could not be read."));
        return;
      }
      resolve({ duration, width, height });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("That video cannot be read by this browser."));
    };
    video.src = source;
  });
}

function sanitizeFileName(name) {
  const safe = String(name || "campaign-video.mp4")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (safe || "campaign-video.mp4").slice(-120);
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function formatFileSize(bytes) {
  const megabytes = Number(bytes || 0) / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}

function destinationLabel(destination) {
  return destination === "story" ? "My Day" : "Facebook Feed";
}
