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
import AccessAdministration from "@/components/access-administration";
import CompositionEditor from "@/components/composition-editor";
import {
  createTextLayer,
  DEFAULT_COVER,
  DEFAULT_EVENT_FIELDS,
  duotonePalette,
  facebookLayout,
  feedMedia,
  isSquareTemplate,
  layerAppliesTo,
  normalizeCampaignComposition,
  normalizeCover,
  resolveCoverMedia,
  resolveLayerText,
} from "@/lib/composition";
import {
  createId,
  formatRelativeDate,
  hasSavedStudioState,
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
const PAGE_SELECTION_STORAGE = "dilg-social-studio:selected-page";
const EMPTY_FACEBOOK_DIRECTORY = { loading: true, available: false, connected: false, authenticated: false, missing: [], pages: [], selectedPageId: "", accountKey: "", user: null, staff: null, accessStatus: "" };
const DEFAULT_PHOTO_EDIT = { zoom: 1, positionX: 50, positionY: 50, rotation: 0 };
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
  cover: { ...DEFAULT_COVER },
  eventFields: { ...DEFAULT_EVENT_FIELDS },
  textLayers: [],
  storySourceId: "",
  revision: 0,
  images: [],
});

export default function StudioApp() {
  const [studio, setStudio] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [facebookDirectory, setFacebookDirectory] = useState(EMPTY_FACEBOOK_DIRECTORY);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState("");
  const [workspaceAccess, setWorkspaceAccess] = useState({ canEdit: false, canManageTemplates: false, assetStorage: { available: false, missing: [] } });
  const studioScopeRef = useRef("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      requestJson("/api/facebook/connections")
        .then((directory) => setFacebookDirectory(normalizeFacebookDirectory(directory)))
        .catch((error) => setFacebookDirectory({ ...EMPTY_FACEBOOK_DIRECTORY, loading: false, error: error.message }));

      const url = new URL(window.location.href);
      const facebookResult = url.searchParams.get("facebook");
      if (facebookResult) {
        if (facebookResult === "connected") toast.success("Account signed in. Choose the Facebook Page you want to manage.");
        else toast.error("Facebook sign-in could not be completed. Please try again or ask the regional administrator to check the Meta app settings.", { duration: 8000 });
        url.searchParams.delete("facebook");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (facebookDirectory.loading || !facebookDirectory.connected || facebookDirectory.accessStatus !== "approved" || !facebookDirectory.selectedPageId) {
      studioScopeRef.current = "";
      setStudio(null);
      return;
    }
    const nextScope = `${facebookDirectory.accountKey || "account"}:${facebookDirectory.selectedPageId}`;
    if (studioScopeRef.current === nextScope) return;
    studioScopeRef.current = nextScope;
    setComposerOpen(false);
    const localStudio = structuredClone(loadStudioState(nextScope));
    setStudio(localStudio);
    const selectedPageId = facebookDirectory.selectedPageId;
    requestJson("/api/workspace", { headers: { "x-facebook-page-id": selectedPageId } })
      .then(async (workspace) => {
        if (studioScopeRef.current !== nextScope) return;
        setWorkspaceAccess({
          ...workspace.office,
          assetStorage: workspace.assetStorage || { available: false, missing: [] },
        });
        const hasRemoteData = workspace.campaigns?.length || workspace.templates?.length;
        if (!hasRemoteData && hasSavedStudioState(nextScope) && window.confirm("A local workspace was found in this browser. Import its campaigns and templates into the shared office workspace now?")) {
          try {
            const migrated = await prepareLocalWorkspaceImport(localStudio, selectedPageId, workspace.office?.id);
            await requestJson("/api/workspace", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
              body: JSON.stringify({ pageId: selectedPageId, ...migrated }),
            });
            const refreshed = await requestJson("/api/workspace", { headers: { "x-facebook-page-id": selectedPageId } });
            if (studioScopeRef.current === nextScope) {
              saveStudioState({
                version: INITIAL_STATE.version,
                settings: localStudio.settings,
                templates: [],
                campaigns: [],
                activity: [],
              }, nextScope);
              setStudio((current) => ({
                ...current,
                templates: refreshed.templates,
                campaigns: refreshed.campaigns,
              }));
              toast.success("Local campaigns and templates were copied into the shared office workspace.");
            }
            return;
          } catch (error) {
            toast.error(error.message || "The local workspace could not be imported.", { duration: 8000 });
          }
        }
        setStudio((current) => ({
          ...current,
          templates: hasRemoteData ? workspace.templates : [],
          campaigns: hasRemoteData ? workspace.campaigns : [],
          settings: {
            ...current.settings,
            defaultTemplateId: workspace.templates?.some((item) => item.id === current.settings.defaultTemplateId)
              ? current.settings.defaultTemplateId
              : workspace.templates?.find((item) => item.kind !== "cover")?.id || "",
          },
        }));
      })
      .catch((error) => toast.error(error.message || "The shared office workspace could not be loaded.", { duration: 8000 }));
  }, [facebookDirectory.loading, facebookDirectory.connected, facebookDirectory.accessStatus, facebookDirectory.accountKey, facebookDirectory.selectedPageId]);

  function openComposer(campaign) {
    if (!workspaceAccess?.canEdit) {
      toast.info("Your Viewer role is read-only. Ask an office administrator to assign Editor access.");
      return;
    }
    const photoTemplates = studio?.templates.filter((item) => item.kind !== "cover") || [];
    const templateId = studio?.settings.defaultTemplateId || photoTemplates[0]?.id || "";
    const composition = normalizeCampaignComposition(campaign || {});
    setDraft(
      campaign
        ? {
            ...campaign,
            destinations: campaign.destinations?.length ? campaign.destinations : ["feed", "story"],
            ...composition,
            images: campaign.images.map((image) => ({ ...image, type: image.type || "image", edit: normalizePhotoEdit(image.edit) })),
          }
        : { ...emptyDraft(templateId), ...composition },
    );
    setComposerOpen(true);
  }

  async function refreshFacebookDirectory() {
    setFacebookDirectory((current) => ({ ...current, loading: true, error: "" }));
    try {
      const directory = await requestJson("/api/facebook/connections");
      setFacebookDirectory((current) => normalizeFacebookDirectory(directory, current.selectedPageId));
      return directory;
    } catch (error) {
      setFacebookDirectory((current) => ({ ...current, loading: false, error: error.message }));
      throw error;
    }
  }

  async function saveCampaign(nextStatus = draft.status || "Draft", extra = {}) {
    const title = draft.title.trim();
    if (!title) {
      toast.error("Give this campaign a title first.");
      return null;
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
    const selectedPageId = facebookDirectory.selectedPageId;
    try {
      const response = await requestJson("/api/workspace/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
        body: JSON.stringify({ pageId: selectedPageId, campaign }),
      });
      const savedCampaign = response.campaign;
      setStudio((current) => ({
        ...current,
        campaigns: current.campaigns.some((item) => item.id === id)
          ? current.campaigns.map((item) => (item.id === id ? savedCampaign : item))
          : [savedCampaign, ...current.campaigns],
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
      setDraft((current) => ({ ...current, revision: savedCampaign.revision }));
      setComposerOpen(false);
      toast.success(
        extra.facebookPostId || extra.facebookStoryId
          ? nextStatus === "Scheduled" ? "Post scheduled on Facebook." : "Post published to Facebook."
          : nextStatus === "Draft" ? "Draft saved to the shared office workspace." : `Campaign marked ${nextStatus.toLowerCase()}.`,
      );
      return savedCampaign;
    } catch (error) {
      if (error.status === 409) {
        toast.error("Another staff member updated this campaign. Choose which version to keep.", {
          duration: Infinity,
          action: {
            label: "Reload",
            onClick: async () => {
              try {
                const workspace = await requestJson("/api/workspace", { headers: { "x-facebook-page-id": selectedPageId } });
                const latest = workspace.campaigns.find((item) => item.id === campaign.id);
                if (!latest) throw new Error("The latest campaign is no longer available.");
                setStudio((current) => ({ ...current, templates: workspace.templates, campaigns: workspace.campaigns }));
                setDraft({ ...emptyDraft(latest.templateId), ...latest, ...normalizeCampaignComposition(latest) });
                toast.success("Latest shared version loaded.");
              } catch (reloadError) {
                toast.error(reloadError.message || "The latest version could not be loaded.");
              }
            },
          },
          cancel: {
            label: "Save as copy",
            onClick: async () => {
              try {
                const copy = copyCampaignWithNewIds(campaign, now);
                const copied = await requestJson("/api/workspace/campaigns", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
                  body: JSON.stringify({ pageId: selectedPageId, campaign: copy }),
                });
                setStudio((current) => ({ ...current, campaigns: [copied.campaign, ...current.campaigns] }));
                setComposerOpen(false);
                toast.success("Your edits were saved as a separate campaign.");
              } catch (copyError) {
                toast.error(copyError.message || "The copy could not be saved.");
              }
            },
          },
        });
      } else {
        toast.error(error.message || "The campaign could not be saved.", { duration: 8000 });
      }
      return null;
    }
  }

  async function submitForReview() {
    const destinations = draft.destinations?.length ? draft.destinations : [];
    if (!draft.title.trim() || (!draft.images.length && !resolveCoverMedia(draft)) || (destinations.includes("feed") && !draft.caption.trim())) {
      toast.error(destinations.includes("feed") ? "Add a title, Feed caption, and media before review." : "Add a title and media before review.");
      return;
    }
    await saveCampaign("Ready for review");
  }

  async function publishCampaign() {
    const activePage = facebookDirectory.pages.find((page) => page.id === facebookDirectory.selectedPageId);
    if (!activePage?.canPublish) {
      toast.error("Your assigned office role does not allow Facebook publishing.");
      return;
    }
    if (!draft.title.trim() || (!draft.images.length && !resolveCoverMedia(draft))) {
      toast.error("Add a title and at least one photo or video before publishing.");
      return;
    }
    const destinations = draft.destinations?.length ? draft.destinations : [];
    if (!destinations.length) {
      toast.error("Choose Facebook Feed, My Day, or both.");
      return;
    }
    if (!draft.images.some((item) => item.type === "video") && feedMedia(draft).length > 8) {
      toast.error("Facebook Feed supports eight attachments. Remove an event photo or disable the cover page.");
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
          headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedFacebookPage?.id || "" },
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
        const photoTemplate = studio.templates.find((item) => item.id === draft.templateId && (item.kind || "photo") === "photo") || null;
        const coverTemplate = studio.templates.find((item) => item.id === draft.cover?.templateId && item.kind === "cover") || null;
        const orderedMedia = feedMedia(draft).slice(0, 8);
        if (destinations.includes("feed")) {
          try {
            const mediaIds = [];
            for (let index = 0; index < orderedMedia.length; index += 1) {
              const media = orderedMedia[index];
              const isCover = media.compositionTarget === "cover";
              const renderMedia = isCover ? { ...media, edit: draft.cover?.edit || media.edit } : media;
              setPublishProgress(`Preparing Feed photo ${index + 1} of ${orderedMedia.length}`);
              const photo = await renderComposedImage(renderMedia, isCover ? coverTemplate?.image : photoTemplate?.image, {
                layers: draft.textLayers,
                campaignTitle: draft.title,
                eventFields: draft.eventFields,
                target: isCover ? "cover" : "photo",
                photoId: media.id,
                duotone: isCover ? draft.cover?.duotone : "none",
              });
              const form = new FormData();
              form.set("photo", photo, `campaign-photo-${String(index + 1).padStart(2, "0")}.jpg`);
              setPublishProgress(`Uploading Feed photo ${index + 1} of ${orderedMedia.length}`);
              const uploaded = await requestJson("/api/facebook/media", {
                method: "POST",
                headers: { "x-facebook-page-id": selectedFacebookPage?.id || "" },
                body: form,
              });
              mediaIds.push(uploaded.mediaId);
            }
            setPublishProgress(draft.scheduledFor ? "Scheduling Facebook Feed post" : "Publishing Facebook Feed post");
            results.feed = await requestJson("/api/facebook/publish", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedFacebookPage?.id || "" },
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
            const selectedStoryId = draft.storySourceId || (draft.cover?.enabled ? "cover" : draft.images[0]?.id);
            const isCover = selectedStoryId === "cover";
            const sourceMedia = isCover ? resolveCoverMedia(draft) : draft.images.find((item) => item.id === selectedStoryId) || draft.images[0];
            if (!sourceMedia) throw new Error("Choose a My Day source image.");
            const storyMedia = isCover ? { ...sourceMedia, edit: draft.cover?.edit || sourceMedia.edit } : sourceMedia;
            const storyPhoto = await renderStoryImage(storyMedia, isCover ? coverTemplate?.image : photoTemplate?.image, {
              layers: draft.textLayers,
              campaignTitle: draft.title,
              eventFields: draft.eventFields,
              target: isCover ? "cover" : "photo",
              photoId: sourceMedia.id,
              duotone: isCover ? draft.cover?.duotone : "none",
            });
            const form = new FormData();
            form.set("photo", storyPhoto, "campaign-story.jpg");
            setPublishProgress("Publishing Facebook My Day");
            results.story = await requestJson("/api/facebook/story/photo", {
              method: "POST",
              headers: { "x-facebook-page-id": selectedFacebookPage?.id || "" },
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
      await saveCampaign(scheduled ? "Scheduled" : "Published", {
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

  async function updateCampaignStatus(campaignId, status) {
    const campaign = studio.campaigns.find((item) => item.id === campaignId);
    if (!campaign) return;
    const now = new Date().toISOString();
    const updated = { ...campaign, status, updatedAt: now, publishedAt: status === "Published" ? now : campaign.publishedAt };
    try {
      const selectedPageId = facebookDirectory.selectedPageId;
      const response = await requestJson("/api/workspace/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
        body: JSON.stringify({ pageId: selectedPageId, campaign: updated }),
      });
      setStudio((current) => ({
        ...current,
        campaigns: current.campaigns.map((item) => item.id === campaignId ? response.campaign : item),
        activity: [
          { id: createId("activity"), type: status.toLowerCase(), text: `${campaign.title} was ${status.toLowerCase()}`, at: now },
          ...current.activity,
        ],
      }));
      toast.success(`${campaign.title} is now ${status.toLowerCase()}.`);
    } catch (error) {
      toast.error(error.message || "The campaign status could not be updated.");
    }
  }

  async function deleteCampaign(campaignId) {
    const campaign = studio.campaigns.find((item) => item.id === campaignId);
    if (!campaign || !window.confirm(`Delete “${campaign.title}” from this office workspace?`)) return;
    try {
      const selectedPageId = facebookDirectory.selectedPageId;
      await requestJson("/api/workspace/campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
        body: JSON.stringify({ pageId: selectedPageId, campaignId }),
      });
      setStudio((current) => ({
        ...current,
        campaigns: current.campaigns.filter((item) => item.id !== campaignId),
        activity: [
          { id: createId("activity"), type: "deleted", text: `${campaign.title} was deleted`, at: new Date().toISOString() },
          ...current.activity,
        ],
      }));
      toast.success("Campaign removed from the shared workspace.");
    } catch (error) {
      toast.error(error.message || "The campaign could not be deleted.");
    }
  }

  if (facebookDirectory.loading) return <LoadingScreen />;
  if (!facebookDirectory.available) return <AccountSetupScreen facebookDirectory={facebookDirectory} refreshFacebookDirectory={refreshFacebookDirectory} />;
  if (!facebookDirectory.connected) return <AccountSignInScreen />;
  if (facebookDirectory.accessStatus !== "approved" || facebookDirectory.pages.length === 0) return <StaffAccessScreen facebookDirectory={facebookDirectory} refreshFacebookDirectory={refreshFacebookDirectory} />;
  if (!studio) return <LoadingScreen />;

  const selectedFacebookPage = facebookDirectory.pages.find((page) => page.id === facebookDirectory.selectedPageId) || facebookDirectory.pages[0] || null;
  const activeOrganization = selectedFacebookPage?.name || studio.settings.organization;

  const viewProps = {
    studio,
    setStudio,
    workspaceAccess,
    selectedPageId: facebookDirectory.selectedPageId,
    openComposer,
    setActiveView,
    updateCampaignStatus,
    deleteCampaign,
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
        account={facebookDirectory.user}
        openComposer={() => openComposer()}
        canEdit={workspaceAccess.canEdit}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <main className="main-panel">
        <Topbar
          activeView={activeView}
          organization={activeOrganization}
          setMobileMenuOpen={setMobileMenuOpen}
          openComposer={() => openComposer()}
          canEdit={workspaceAccess.canEdit}
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
            facebookPage={selectedFacebookPage}
            workspaceAccess={workspaceAccess}
            canPublish={Boolean(selectedFacebookPage?.canPublish)}
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

function Sidebar({ activeView, setActiveView, organization, account, openComposer, canEdit, mobileMenuOpen, setMobileMenuOpen }) {
  const choose = (id) => {
    setActiveView(id);
    setMobileMenuOpen(false);
  };
  const accountName = account?.name || "DILG staff";
  const accountInitials = accountName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "DS";
  return (
    <>
      <aside className={clsx("sidebar", mobileMenuOpen && "is-open")}>
        <div className="brand-lockup">
          <div className="brand-mark"><img src="/brand/dilg-logo.png" alt="DILG seal" /></div>
          <div><strong>Social Studio</strong><span>{organization}</span></div>
        </div>
        {canEdit && <button className="new-campaign-button" onClick={openComposer} type="button">
          <Plus size={18} /> New campaign
        </button>}
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
            <div><strong>Private by default</strong><span>Shared only with this office</span></div>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">{accountInitials}</div>
            <div><strong>{accountName}</strong><span>{organization}</span></div>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>
      {mobileMenuOpen && <button className="menu-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" />}
    </>
  );
}

function Topbar({ activeView, organization, setMobileMenuOpen, openComposer, canEdit }) {
  const title = navigation.find((item) => item.id === activeView)?.label || "Overview";
  return (
    <header className="topbar">
      <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
      <div className="topbar-title"><img className="topbar-logo" src="/brand/dilg-logo.png" alt="" /><div><span className="topbar-context">{organization}</span><h1>{title}</h1></div></div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button>
        {canEdit && <button className="topbar-create" onClick={openComposer}><Plus size={18} /> Create</button>}
      </div>
    </header>
  );
}

function Overview({ studio, workspaceAccess, openComposer, setActiveView, updateCampaignStatus }) {
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
            {workspaceAccess.canEdit && <button className="primary-button" onClick={openComposer}><Plus size={18} /> Create campaign</button>}
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
                {workspaceAccess.canEdit && campaign.status === "Ready for review" && (
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

function Campaigns({ studio, workspaceAccess, openComposer, deleteCampaign }) {
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
      <PageIntro title="Campaigns" text="Every draft, review, schedule, and published post in one place." action={workspaceAccess.canEdit ? "New campaign" : ""} onAction={() => openComposer()} />
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
                  <td><div className="row-actions">{workspaceAccess.canEdit && <button onClick={() => openComposer(campaign)} aria-label="Edit campaign"><PencilLine size={17} /></button>}{workspaceAccess.canEdit && campaign.status === "Approved" && <button onClick={() => openComposer(campaign)} aria-label="Open campaign to publish"><Send size={17} /></button>}{workspaceAccess.canEdit && <button className="danger" onClick={() => deleteCampaign(campaign.id)} aria-label="Delete campaign"><Trash2 size={17} /></button>}</div></td>
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

function Templates({ studio, setStudio, workspaceAccess, selectedPageId }) {
  const fileRef = useRef(null);
  const replaceRef = useRef(null);
  const [editor, setEditor] = useState(null);
  const [uploadKind, setUploadKind] = useState("photo");
  const canManage = Boolean(workspaceAccess?.canManageTemplates);
  async function addTemplate(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const prepared = await prepareTemplateImage(file);
      const id = createId("template");
      const asset = await uploadWorkspaceImage(prepared.blob, {
        id,
        kind: "template",
        pageId: selectedPageId,
        officeId: workspaceAccess?.id,
        name: file.name,
      });
      const template = {
        id,
        name: file.name.replace(/\.[^.]+$/, ""),
        kind: uploadKind,
        width: prepared.width,
        height: prepared.height,
        size: prepared.size,
        ratio: prepared.ratio,
        image: prepared.src,
        assetUrl: asset.url,
        suggestedLayers: [],
        usage: 0,
        createdAt: new Date().toISOString(),
      };
      const response = await requestJson("/api/workspace/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
        body: JSON.stringify({ pageId: selectedPageId, template }),
      });
      setStudio((current) => ({ ...current, templates: [{ ...response.template, image: prepared.src }, ...current.templates] }));
      toast.success(`${uploadKind === "cover" ? "Cover" : "Photo"} template saved for this office.`);
    } catch (error) {
      toast.error(error.message || "That image could not be added.");
    } finally {
      event.target.value = "";
    }
  }
  function setDefault(id) {
    setStudio((current) => ({ ...current, settings: { ...current.settings, defaultTemplateId: id } }));
    toast.success("Default template updated.");
  }
  async function removeTemplate(id) {
    const selected = studio.templates.find((item) => item.id === id);
    if (!selected || !window.confirm(`Delete “${selected.name}”? Campaigns using it will move to another template.`)) return;
    try {
      await requestJson("/api/workspace/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
        body: JSON.stringify({ pageId: selectedPageId, templateId: id }),
      });
      setStudio((current) => {
        const templates = current.templates.filter((item) => item.id !== id);
        const fallbackId = templates.find((item) => item.kind !== "cover")?.id || "";
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
      toast.success("Template removed from this office.");
    } catch (error) {
      toast.error(error.message || "The template could not be deleted.");
    }
  }
  async function replaceTemplateImage(event) {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    try {
      const prepared = await prepareTemplateImage(file);
      const asset = await uploadWorkspaceImage(prepared.blob, {
        id: editor.id,
        kind: "template",
        pageId: selectedPageId,
        officeId: workspaceAccess?.id,
        name: file.name,
      });
      setEditor((current) => ({ ...current, image: prepared.src, assetUrl: asset.url, width: prepared.width, height: prepared.height, size: prepared.size, ratio: prepared.ratio }));
      toast.success("New template image is ready to save.");
    } catch (error) {
      toast.error(error.message || "That template image could not be prepared.");
    } finally { event.target.value = ""; }
  }
  async function saveTemplateEdit() {
    const name = editor?.name?.trim();
    if (!editor || !name) return toast.error("Template name is required.");
    try {
      const response = await requestJson("/api/workspace/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
        body: JSON.stringify({ pageId: selectedPageId, template: { ...editor, name } }),
      });
      setStudio((current) => ({
        ...current,
        templates: current.templates.map((item) => item.id === editor.id ? { ...response.template, image: editor.image } : item),
        activity: [{ id: createId("activity"), type: "created", text: `${name} template was updated`, at: new Date().toISOString() }, ...current.activity],
      }));
      setEditor(null);
      toast.success("Template updated for this office.");
    } catch (error) {
      toast.error(error.message || "The template could not be updated.");
    }
  }
  return (
    <div className="content-stack">
      <PageIntro title="Office templates" text="Photo and cover templates are private to this office. Templates stay locked while campaign text remains editable." action={canManage ? "Upload template" : ""} onAction={() => fileRef.current?.click()} />
      <div className="template-kind-toolbar">
        <div role="tablist" aria-label="Template type">
          <button type="button" className={uploadKind === "photo" ? "active" : ""} onClick={() => setUploadKind("photo")}>Photo templates</button>
          <button type="button" className={uploadKind === "cover" ? "active" : ""} onClick={() => setUploadKind("cover")}>Cover templates</button>
        </div>
        {!canManage && <span><ShieldCheck size={15} /> Office administrators manage this library.</span>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={addTemplate} />
      <div className="template-grid">
        {studio.templates.filter((template) => (template.kind || "photo") === uploadKind).map((template) => {
          const isDefault = studio.settings.defaultTemplateId === template.id;
          const usage = studio.campaigns.filter((campaign) => campaign.templateId === template.id).length;
          return (
            <motion.article className="template-card" layout key={template.id}>
              <div className="template-preview"><img src={template.image} alt={`${template.name} preview`} />{isDefault && <span className="default-chip"><Check size={14} /> Default</span>}<span className="template-kind-chip">{template.kind === "cover" ? "Cover" : "Photo"}</span></div>
              <div className="template-meta"><div><strong>{template.name}</strong><span>{template.size} · {template.ratio}</span></div>{canManage && <button className="icon-button subtle" onClick={() => setEditor({ ...template })} aria-label={`Edit ${template.name}`}><PencilLine size={18} /></button>}</div>
              <div className="template-actions"><span>{usage} campaign{usage === 1 ? "" : "s"}</span>{template.kind !== "cover" && !isDefault && <button onClick={() => setDefault(template.id)}>Make default</button>}{canManage && <button onClick={() => setEditor({ ...template })}>Edit</button>}{canManage && <button className="danger-link" onClick={() => removeTemplate(template.id)}>Delete</button>}</div>
            </motion.article>
          );
        })}
        {canManage && <button className="template-upload-card" onClick={() => fileRef.current?.click()}><span><Upload size={22} /></span><strong>Add a {uploadKind} template</strong><small>Transparent PNG recommended · up to 12 MB</small></button>}
        {!studio.templates.some((template) => (template.kind || "photo") === uploadKind) && !canManage && <EmptyState icon={Images} title={`No ${uploadKind} templates yet`} text="Ask your office administrator to upload an approved template." />}
      </div>
      <AnimatePresence>
        {editor && canManage && (
          <motion.div className="template-editor-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="template-editor" role="dialog" aria-modal="true" aria-label={`Edit ${editor.name}`} initial={{ opacity: 0, scale: .96, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 10 }}>
              <header><div><span className="section-kicker"><PencilLine size={14} /> Template editor</span><h3>Update template</h3></div><button className="icon-button" onClick={() => setEditor(null)} aria-label="Close template editor"><X size={19} /></button></header>
              <div className="template-editor-body">
                <div className="template-editor-preview"><img src={editor.image} alt="Updated template preview" /><button className="secondary-button" onClick={() => replaceRef.current?.click()}><Upload size={17} /> Replace image</button><input ref={replaceRef} type="file" accept="image/*" hidden onChange={replaceTemplateImage} /></div>
                <div className="template-editor-fields">
                  <Field label="Template name"><input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></Field>
                  <Field label="Template use"><select value={editor.kind || "photo"} onChange={(event) => setEditor({ ...editor, kind: event.target.value })}><option value="photo">Event photos</option><option value="cover">Cover pages only</option></select></Field>
                  {editor.kind === "cover" && (
                    <div className="cover-template-guides">
                      <strong>Suggested text positions</strong>
                      <p>These are starting points. Campaign users can still move every text layer.</p>
                      {["campaign_title", "date", "venue"].map((source) => <Field key={source} label={source === "campaign_title" ? "Campaign title" : source === "date" ? "Date" : "Venue"}><select value={suggestedPositionName(editor.suggestedLayers, source)} onChange={(event) => setEditor((current) => ({ ...current, suggestedLayers: updateSuggestedPosition(current.suggestedLayers, source, event.target.value) }))}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></Field>)}
                    </div>
                  )}
                  <div className="template-editor-details"><span>Canvas</span><strong>{editor.size} · {editor.ratio}</strong></div><p>Replacing the image keeps the template locked in campaigns. Event-specific text remains a separate editable layer.</p>
                </div>
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

function SettingsView({ studio, setStudio, workspaceAccess, selectedPageId, facebookDirectory, setFacebookDirectory, refreshFacebookDirectory }) {
  const importRef = useRef(null);
  const [settings, setSettings] = useState(studio.settings);
  function save() {
    setStudio((current) => ({ ...current, settings }));
    saveStudioState({ version: INITIAL_STATE.version, settings, templates: [], campaigns: [], activity: [] }, `${facebookDirectory.accountKey || "account"}:${selectedPageId}`);
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
      const migrated = await prepareLocalWorkspaceImport(parsed, selectedPageId, workspaceAccess?.id);
      await requestJson("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-facebook-page-id": selectedPageId },
        body: JSON.stringify({ pageId: selectedPageId, ...migrated }),
      });
      const refreshed = await requestJson("/api/workspace", { headers: { "x-facebook-page-id": selectedPageId } });
      const nextSettings = { ...INITIAL_STATE.settings, ...parsed.settings };
      setStudio((current) => ({ ...current, settings: nextSettings, templates: refreshed.templates, campaigns: refreshed.campaigns }));
      setSettings(nextSettings);
      toast.success("Legacy backup copied into this office’s shared workspace.");
    } catch (error) {
      toast.error(error.message || "That backup could not be imported.");
    } finally { event.target.value = ""; }
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
      <FacebookConnection facebookDirectory={facebookDirectory} setFacebookDirectory={setFacebookDirectory} refreshFacebookDirectory={refreshFacebookDirectory} />
      {facebookDirectory.staff?.isRegionalAdmin && <AccessAdministration onAccessChanged={() => refreshFacebookDirectory().catch(() => {})} />}
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph amber"><ShieldCheck size={20} /></div><div><h3>Publishing workflow</h3><p>Control the checks content passes before publishing.</p></div></div>
        <ToggleRow title="Require approval" text="Campaigns must be marked approved before publishing." checked={settings.approvalRequired} onChange={(value) => setSettings({ ...settings, approvalRequired: value })} />
        <ToggleRow title="Workspace notifications" text="Show local reminders for scheduled campaigns." checked={settings.notifications} onChange={(value) => setSettings({ ...settings, notifications: value })} />
      </section>
      <section className="settings-section panel">
        <div className="settings-title"><div className="settings-glyph emerald"><Download size={20} /></div><div><h3>Shared workspace backup</h3><p>Campaigns and templates are stored by office in Neon. Export a readable backup or import a legacy browser backup without replacing existing records.</p></div></div>
        <div className="data-actions"><button className="secondary-button" onClick={exportData}><Download size={17} /> Export backup</button><button className="secondary-button" onClick={() => importRef.current?.click()} disabled={!workspaceAccess?.canEdit}><Upload size={17} /> Import legacy backup</button><input ref={importRef} type="file" accept="application/json" hidden onChange={importData} /></div>
        <div className="security-note"><ShieldCheck size={18} /><span><strong>Office records and private images are checked on every request.</strong> Facebook tokens stay encrypted on the server, and imported records are copied only into the currently approved office.</span></div>
      </section>
      <div className="settings-save"><button className="primary-button" onClick={save}><Check size={17} /> Save settings</button></div>
    </div>
  );
}

function FacebookConnection({ facebookDirectory, setFacebookDirectory, refreshFacebookDirectory }) {
  const [checking, setChecking] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [connection, setConnection] = useState(null);
  const selectedPage = facebookDirectory.pages.find((page) => page.id === facebookDirectory.selectedPageId) || facebookDirectory.pages[0] || null;

  function choosePage(pageId) {
    if (!pageId || pageId === facebookDirectory.selectedPageId) return;
    window.sessionStorage.setItem(`${PAGE_SELECTION_STORAGE}:${facebookDirectory.accountKey}`, pageId);
    setFacebookDirectory((current) => ({ ...current, selectedPageId: pageId }));
    setConnection(null);
    toast.success(`Workspace changed to ${facebookDirectory.pages.find((page) => page.id === pageId)?.name || "the selected Page"}.`);
  }

  async function disconnect() {
    if (!window.confirm("Sign out of this account on this browser? Page access for this session will be removed.")) return;
    setSwitching(true);
    try {
      await requestJson("/api/facebook/connections", { method: "DELETE" });
      setFacebookDirectory({ ...EMPTY_FACEBOOK_DIRECTORY, loading: false, available: facebookDirectory.available, missing: facebookDirectory.missing });
      setConnection(null);
      toast.success("Account signed out.");
    } catch (error) {
      toast.error(error.message, { duration: 7000 });
    } finally { setSwitching(false); }
  }

  async function checkConnection() {
    setChecking(true);
    try {
      const result = await requestJson("/api/facebook/status", { headers: { "x-facebook-page-id": selectedPage?.id || "" } });
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
      <div className="settings-title"><div className="settings-glyph sky"><Wifi size={20} /></div><div><h3>Account and approved office</h3><p>Your office is assigned by a Regional Administrator and enforced again by the server on every publishing request.</p></div>{facebookDirectory.connected && <span className="connection-badge connected"><CheckCircle2 size={15} /> Approved</span>}</div>

      {facebookDirectory.loading ? (
        <div className="connection-loading"><Loader2 className="spin" size={19} /> Loading Facebook connection…</div>
      ) : facebookDirectory.available ? (
        facebookDirectory.connected ? (
          <div className="oauth-connected-layout">
            <div className="connected-user"><BadgeCheck size={18} /><span>Signed in as <strong>{facebookDirectory.user?.name || "Facebook user"}</strong> · {roleLabel(selectedPage?.role)}</span></div>
            {facebookDirectory.pages.length > 1 ? <div className="page-switcher">
              <Field label="Administrator-approved office" hint={`${facebookDirectory.pages.length} explicit assignments`}>
                <select value={selectedPage?.id || ""} onChange={(event) => choosePage(event.target.value)} disabled={switching}>
                  {facebookDirectory.pages.map((page) => <option key={page.id} value={page.id}>{page.officeName || page.name}</option>)}
                </select>
              </Field>
              {switching && <Loader2 className="spin page-switcher-loader" size={18} />}
            </div> : selectedPage ? <div className="fixed-office-assignment"><ShieldCheck size={17} /><div><span>Assigned office</span><strong>{selectedPage.officeName || selectedPage.name}</strong></div><small>Only a Regional Administrator can change this assignment.</small></div> : null}
            {selectedPage && <div className="connected-page"><div className="connected-page-avatar">{selectedPage.picture ? <img src={selectedPage.picture} alt="" /> : <MessageSquareText size={20} />}</div><div><strong>{selectedPage.name}</strong><span>Page ID {selectedPage.id} · {selectedPage.canPublish ? "publishing permitted" : "publishing restricted"} · server-verified office binding</span></div></div>}
            <div className="connection-actions">
              <button className="secondary-button" onClick={checkConnection} disabled={checking || switching}>{checking ? <Loader2 className="spin" size={17} /> : <Wifi size={17} />} Test selected Page</button>
              <a className="secondary-button" href="/api/facebook/oauth/start"><RefreshCcw size={17} /> Refresh Facebook permissions</a>
              <button className="danger-button" onClick={disconnect} disabled={switching}><Trash2 size={17} /> Sign out</button>
            </div>
          </div>
        ) : (
          <div className="oauth-connection-hero">
            <div><strong>Connect your authorized Facebook account</strong><p>Meta verifies Page access first. A Regional Administrator must then approve your identity and assign the exact office and role available in this application.</p></div>
            <a className="primary-button facebook-connect-button" href="/api/facebook/oauth/start"><ExternalLink size={17} /> Connect with Facebook</a>
          </div>
        )
      ) : (
        <FacebookAdminSetup missing={facebookDirectory.missing} onRefresh={refreshFacebookDirectory} />
      )}

      {connection?.connected && <div className="connected-page test-result"><div className="connected-page-avatar">{connection.page.picture ? <img src={connection.page.picture} alt="" /> : <MessageSquareText size={20} />}</div><div><strong>Connection test passed: {connection.page.name}</strong><span>Page ID {connection.page.id} · Graph API {connection.graphVersion} · secure account connection</span></div>{connection.page.link && <a href={connection.page.link} target="_blank" rel="noreferrer">Open Page <ExternalLink size={14} /></a>}</div>}
      {connection?.connected && <div className={clsx("video-storage-status", connection.videoStorageConfigured ? "ready" : "missing")}><CloudUpload size={17} /><div><strong>{connection.videoStorageConfigured ? "Video storage ready" : "Video storage not connected"}</strong><span>{connection.videoStorageConfigured ? `Vercel Blob ${connection.videoStorageMode === "oidc" ? "OIDC" : "storage"} can accept campaign videos.` : "Create a public Vercel Blob store to enable video uploads."}</span></div></div>}
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
  const requiredVariables = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_TOKEN_ENCRYPTION_KEY", "DATABASE_URL or POSTGRES_URL"];
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
          <div><strong>Connect one Postgres database to the Vercel project</strong><p>In Vercel Marketplace, add Neon and connect it to this project. The application accepts Neon&apos;s pooled <code>POSTGRES_URL</code> or <code>DATABASE_URL</code>; the database stores encrypted Page connections and server-approved office memberships.</p><a href="https://vercel.com/docs/postgres" target="_blank" rel="noreferrer">Open Vercel Postgres guide <ExternalLink size={14} /></a></div>
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

function Composer({ draft, setDraft, templates, settings, facebookPage, workspaceAccess, canPublish, onClose, onSave, onReview, onPublish, publishing, publishProgress }) {
  const fileRef = useRef(null);
  const coverFileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draggedImageId, setDraggedImageId] = useState(null);
  const [editingImageId, setEditingImageId] = useState(null);
  const [editingCover, setEditingCover] = useState(false);
  const [focusLayerId, setFocusLayerId] = useState("");
  const [customText, setCustomText] = useState("");
  const photoTemplates = templates.filter((item) => (item.kind || "photo") === "photo");
  const coverTemplates = templates.filter((item) => item.kind === "cover");
  const activeTemplate = photoTemplates.find((item) => item.id === draft.templateId) || null;
  const activeCoverTemplate = coverTemplates.find((item) => item.id === draft.cover?.templateId) || null;
  const hasVideo = draft.images.some((item) => item.type === "video");
  const editingImage = draft.images.find((item) => item.id === editingImageId && item.type !== "video");
  const coverMedia = resolveCoverMedia(draft);
  const maxEventPhotos = draft.cover?.enabled ? 7 : 8;
  const publishingIdentity = facebookPage?.name || settings.organization || "DILG Region XII";
  const organizationHashtag = `#${publishingIdentity.replace(/[^A-Za-z0-9]/g, "") || "DILGRegionXII"}`;
  const defaultLocation = publishingIdentity.replace(/^DILG\s*/i, "").trim() || "Region XII";

  function updateCover(changes) {
    setDraft((current) => ({ ...current, cover: { ...normalizeCover(current.cover), ...changes } }));
  }
  function updateEventFields(changes) {
    setDraft((current) => ({ ...current, eventFields: { ...DEFAULT_EVENT_FIELDS, ...current.eventFields, ...changes } }));
  }
  function openLayer(source, text = "") {
    let layer = draft.textLayers.find((item) => item.source === source);
    if (!layer) {
      const scope = draft.cover?.enabled ? "cover" : "all_photos";
      layer = createTextLayer(source, scope);
      if (source === "custom") layer.text = text || "Custom text";
      const suggestion = scope === "cover" ? activeCoverTemplate?.suggestedLayers?.find((item) => item.source === source) : null;
      if (suggestion) layer = { ...layer, ...suggestion, id: layer.id, source, scope };
      setDraft((current) => ({ ...current, textLayers: [...current.textLayers, layer] }));
    }
    setFocusLayerId(layer.id);
    if (layer.scope === "cover") {
      if (!coverMedia) return toast.info("Choose a cover image before placing this text.");
      setEditingCover(true);
    } else {
      const targetId = layer.scope === "selected_photo" ? layer.photoId : draft.images.find((item) => item.type !== "video")?.id;
      if (!targetId) return toast.info("Add a photo before placing this text.");
      setEditingImageId(targetId);
    }
  }
  async function addMedia(files) {
    const selected = [...files];
    const videoFiles = selected.filter((file) => file.type.startsWith("video/"));
    if (videoFiles.length) {
      if (selected.length !== 1 || draft.images.length || draft.cover?.enabled) return toast.error("A video campaign can contain one video and no cover page.");
      const file = videoFiles[0];
      if (!["video/mp4", "video/quicktime", "video/webm"].includes(file.type)) return toast.error("Use an MP4, MOV, or WebM video.");
      if (file.size > 500 * 1024 * 1024) return toast.error("Videos must be smaller than 500 MB.");
      setUploading(true);
      setUploadProgress(0);
      try {
        const metadata = await readVideoMetadata(file);
        const blob = await upload(`campaign-videos/${facebookPage?.id || "unselected"}/${Date.now()}-${sanitizeFileName(file.name)}`, file, {
          access: "public",
          handleUploadUrl: "/api/media/upload",
          clientPayload: JSON.stringify({ pageId: facebookPage?.id || "" }),
          multipart: file.size > 100 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
        });
        setDraft((current) => ({ ...current, images: [{ id: createId("video"), type: "video", name: file.name, src: blob.url, size: file.size, ...metadata }], storySourceId: "" }));
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
    const imageFiles = selected.filter((file) => file.type.startsWith("image/")).slice(0, Math.max(0, maxEventPhotos - draft.images.length));
    if (!imageFiles.length) return toast.error(`This campaign can use up to ${maxEventPhotos} event photos${draft.cover?.enabled ? " plus one cover page" : ""}.`);
    setUploading(true);
    try {
      const images = [];
      for (const file of imageFiles) {
        const id = createId("image");
        const prepared = await prepareCampaignImage(file);
        const asset = await uploadWorkspaceImage(prepared.blob, {
          id,
          kind: "campaign",
          pageId: facebookPage?.id,
          officeId: workspaceAccess?.id,
          name: file.name,
        });
        images.push({ id, type: "image", name: file.name, src: prepared.src, assetUrl: asset.url, width: prepared.width, height: prepared.height, edit: { ...DEFAULT_PHOTO_EDIT } });
      }
      setDraft((current) => ({ ...current, images: [...current.images, ...images], storySourceId: current.storySourceId || images[0]?.id || "" }));
      toast.success(`${images.length} image${images.length === 1 ? "" : "s"} added to the shared office workspace.`);
    } catch (error) {
      toast.error(error.message || "One of those images could not be added.", { duration: 7000 });
    } finally {
      setUploading(false);
    }
  }
  async function addCoverFile(file) {
    if (!file?.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const id = createId("cover");
      const prepared = await prepareCampaignImage(file);
      const asset = await uploadWorkspaceImage(prepared.blob, {
        id,
        kind: "cover",
        pageId: facebookPage?.id,
        officeId: workspaceAccess?.id,
        name: file.name,
      });
      updateCover({
        enabled: true,
        sourceMode: "upload",
        media: { id, type: "image", name: file.name, src: prepared.src, assetUrl: asset.url, width: prepared.width, height: prepared.height, edit: { ...DEFAULT_PHOTO_EDIT } },
        edit: { ...DEFAULT_PHOTO_EDIT },
      });
      setDraft((current) => ({ ...current, storySourceId: current.storySourceId || "cover" }));
      toast.success("Separate cover image added.");
    } catch (error) {
      toast.error(error.message || "The cover image could not be uploaded.", { duration: 7000 });
    } finally {
      setUploading(false);
    }
  }
  function removeImage(id) {
    if (editingImageId === id) setEditingImageId(null);
    setDraft((current) => {
      const images = current.images.filter((item) => item.id !== id);
      const cover = normalizeCover(current.cover);
      if (cover.sourceImageId === id) cover.sourceImageId = images.find((item) => item.type !== "video")?.id || "";
      return {
        ...current,
        images,
        cover,
        storySourceId: current.storySourceId === id ? (cover.enabled ? "cover" : images[0]?.id || "") : current.storySourceId,
      };
    });
  }
  function updatePhotoEdit(id, edit) {
    setDraft((current) => ({ ...current, images: current.images.map((item) => item.id === id ? { ...item, edit: normalizePhotoEdit(edit) } : item) }));
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
      images.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, moved);
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
              <div className="step-heading"><span>1</span><div><h3>Campaign details</h3><p>The Campaign title can also become a live, plain-text design layer.</p></div></div>
              <div className="linked-title-field">
                <Field label="Campaign title"><input value={draft.title} maxLength={160} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Barangay Assembly Highlights" autoFocus /></Field>
                <button className="secondary-button add-design-text" type="button" onClick={() => openLayer("campaign_title")}><TypeIcon /> {draft.textLayers.some((item) => item.source === "campaign_title") ? "Edit title in design" : "Add title to design"}</button>
              </div>
            </section>

            <section className="composer-section">
              <div className="step-heading"><span>2</span><div><h3>Add photos or a video</h3><p>Use up to {maxEventPhotos} event photos{draft.cover?.enabled ? " plus the cover page" : ""}, or one video.</p></div></div>
              {!workspaceAccess?.assetStorage?.available && <div className="editor-storage-warning"><ShieldCheck size={17} /><span><strong>Private editor storage is not connected.</strong> Add <code>EDITOR_BLOB_READ_WRITE_TOKEN</code> in Vercel before uploading photos or templates. The existing public video store remains separate.</span></div>}
              <button className="drop-zone" type="button" disabled={uploading} onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addMedia(event.dataTransfer.files); }}>
                <span className="upload-glyph">{uploading ? <CloudUpload className="upload-pulse" size={23} /> : <ImagePlus size={23} />}</span><strong>{uploading ? uploadProgress ? `Uploading video… ${uploadProgress}%` : "Preparing shared media…" : "Drop photos or a video here"}</strong><small>Photos are private to this office · JPG, PNG, WebP · Videos up to 500 MB</small>
              </button>
              <input ref={fileRef} hidden type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onChange={(event) => { addMedia(event.target.files); event.target.value = ""; }} />
              {draft.images.length > 0 && (
                <>
                  <div className="media-order-hint">{hasVideo ? <Video size={16} /> : <GripVertical size={16} />}<span>{hasVideo ? `Video ready · ${formatDuration(draft.images[0].duration)} · ${formatFileSize(draft.images[0].size)}` : "Drag event photos to rearrange their Facebook attachment order. Use Edit to adjust the image and text directly."}</span></div>
                  <div className="image-strip">
                    {draft.images.map((image, index) => (
                      <motion.div layout className={clsx("image-thumb", draggedImageId === image.id && "is-dragging")} key={image.id} draggable onDragStart={(event) => { setDraggedImageId(image.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", image.id); }} onDragEnd={() => setDraggedImageId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); placeImageBefore(event.dataTransfer.getData("text/plain") || draggedImageId, image.id); setDraggedImageId(null); }}>
                        {image.type === "video" ? <video src={image.src} muted playsInline preload="metadata" aria-label={image.name} /> : <img src={image.src} alt={image.name} />}
                        {index === 0 && !hasVideo && <span className="cover-badge">Photo 1</span>}
                        {image.type !== "video" && <button type="button" className="edit-photo-button" onClick={() => { setFocusLayerId(""); setEditingImageId(image.id); }} aria-label={`Edit ${image.name}`}><Crop size={14} /> Edit</button>}
                        <div className="media-position" title="Drag to rearrange"><GripVertical size={14} /><span>{index + 1}</span></div>
                        <div className="media-controls"><button type="button" onClick={() => moveImage(image.id, -1)} disabled={index === 0} aria-label={`Move ${image.name} left`}><ChevronLeft size={15} /></button><button type="button" onClick={() => moveImage(image.id, 1)} disabled={index === draft.images.length - 1} aria-label={`Move ${image.name} right`}><ChevronRight size={15} /></button><button type="button" className="remove-media" onClick={() => removeImage(image.id)} aria-label={`Remove ${image.name}`}><X size={15} /></button></div>
                      </motion.div>
                    ))}
                  </div>
                </>
              )}

              <div className={clsx("cover-page-panel", hasVideo && "is-disabled")}>
                <ToggleRow title="Add a cover page?" text={hasVideo ? "Cover pages are available for photo campaigns." : "Create a designed first attachment without changing the event photos."} checked={!hasVideo && draft.cover?.enabled} onChange={(enabled) => {
                  if (hasVideo) return;
                  if (enabled && draft.images.filter((item) => item.type !== "video").length > 7) return toast.error("Remove one event photo before adding a cover page. Facebook Feed supports eight attachments.");
                  updateCover({ enabled, sourceImageId: draft.cover?.sourceImageId || draft.images.find((item) => item.type !== "video")?.id || "" });
                  if (enabled) setDraft((current) => ({ ...current, storySourceId: current.storySourceId || "cover" }));
                }} />
                {!hasVideo && draft.cover?.enabled && (
                  <motion.div className="cover-page-controls" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                    <div className="segmented-control" aria-label="Cover source">
                      <button type="button" className={draft.cover.sourceMode === "existing" ? "active" : ""} onClick={() => updateCover({ sourceMode: "existing" })}>Use event photo</button>
                      <button type="button" className={draft.cover.sourceMode === "upload" ? "active" : ""} onClick={() => updateCover({ sourceMode: "upload" })}>Separate image</button>
                    </div>
                    {draft.cover.sourceMode === "existing" ? (
                      <Field label="Cover image"><select value={draft.cover.sourceImageId} onChange={(event) => updateCover({ sourceImageId: event.target.value })}><option value="">Choose an event photo</option>{draft.images.filter((item) => item.type !== "video").map((item, index) => <option value={item.id} key={item.id}>Photo {index + 1} · {item.name}</option>)}</select></Field>
                    ) : (
                      <div><button className="secondary-button" type="button" onClick={() => coverFileRef.current?.click()}><Upload size={17} /> {draft.cover.media ? "Replace cover image" : "Upload cover image"}</button><input ref={coverFileRef} hidden type="file" accept="image/*" onChange={(event) => { addCoverFile(event.target.files?.[0]); event.target.value = ""; }} />{draft.cover.media && <small className="selected-cover-name">{draft.cover.media.name}</small>}</div>
                    )}
                    <div className="form-grid two-columns">
                      <Field label="Cover template"><select value={draft.cover.templateId} onChange={(event) => updateCover({ templateId: event.target.value })}><option value="">Blank square</option>{coverTemplates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
                      <Field label="Cover color effect"><select value={draft.cover.duotone} onChange={(event) => updateCover({ duotone: event.target.value })}><option value="cherry">Cherry duotone</option><option value="auto">Auto duotone</option><option value="none">None</option></select></Field>
                    </div>
                    {activeCoverTemplate && !isSquareTemplate(activeCoverTemplate) && <div className="crop-warning"><Crop size={16} /> This cover template is not square. Facebook may crop it differently across devices.</div>}
                    <button className="primary-button edit-cover-button" type="button" disabled={!coverMedia} onClick={() => { setFocusLayerId(""); setEditingCover(true); }}><WandSparkles size={17} /> Edit cover directly</button>
                  </motion.div>
                )}
              </div>
            </section>

            <section className="composer-section">
              <div className="step-heading"><span>3</span><div><h3>Caption and design text</h3><p>Each detail is its own movable text layer. No background or decoration is added automatically.</p></div></div>
              <Field label="Post copy" hint={`${draft.caption.length} / 2,200`}><textarea rows={7} value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value.slice(0, 2200) })} placeholder="Share the story behind this update…" /></Field>
              <div className="caption-tools"><button onClick={() => setDraft({ ...draft, caption: `${draft.caption}${draft.caption ? "\n\n" : ""}${organizationHashtag} #SerbisyongMatino` })}># Add hashtags</button><button onClick={() => setDraft({ ...draft, caption: `${draft.caption}${draft.caption ? "\n\n" : ""}📍 ${defaultLocation}` })}>Add location</button></div>
              {!hasVideo && (
                <div className="structured-text-panel">
                  <StructuredTextField label="Date" type="date" value={draft.eventFields?.date || ""} onChange={(value) => updateEventFields({ date: value })} added={draft.textLayers.some((item) => item.source === "date")} onAdd={() => openLayer("date")} />
                  <StructuredTextField label="Venue" value={draft.eventFields?.venue || ""} placeholder={`e.g. ${defaultLocation}`} onChange={(value) => updateEventFields({ venue: value })} added={draft.textLayers.some((item) => item.source === "venue")} onAdd={() => openLayer("venue")} />
                  <StructuredTextField label="Subtitle" value={draft.eventFields?.subtitle || ""} placeholder="Optional event description" onChange={(value) => updateEventFields({ subtitle: value })} added={draft.textLayers.some((item) => item.source === "subtitle")} onAdd={() => openLayer("subtitle")} />
                  <div className="custom-text-row"><Field label="Custom text"><input value={customText} maxLength={240} onChange={(event) => setCustomText(event.target.value)} placeholder="Add another independent text layer" /></Field><button className="secondary-button" type="button" disabled={!customText.trim()} onClick={() => { openLayer("custom", customText.trim()); setCustomText(""); }}><Plus size={17} /> Add to design</button></div>
                </div>
              )}
            </section>

            <section className="composer-section">
              <div className="step-heading"><span>4</span><div><h3>Choose where to publish</h3><p>Send this campaign to the Facebook Feed, My Day, or both.</p></div></div>
              <div className={clsx("publishing-page-context", facebookPage && "is-connected")}><div className="connected-page-avatar">{facebookPage?.picture ? <img src={facebookPage.picture} alt="" /> : <MessageSquareText size={18} />}</div><div><strong>{facebookPage ? `Publishing as ${facebookPage.name}` : "No Facebook Page selected"}</strong><span>{facebookPage ? "The selected office and Page are enforced by the server for this campaign." : "Choose an authorized Facebook Page before composing this campaign."}</span></div></div>
              <div className="destination-grid">
                <button type="button" className={clsx("destination-card", draft.destinations?.includes("feed") && "selected")} aria-pressed={draft.destinations?.includes("feed")} onClick={() => toggleDestination("feed")}><span><Newspaper size={20} /></span><div><strong>Facebook Feed</strong><small>Permanent Page post</small></div><i>{draft.destinations?.includes("feed") && <Check size={14} />}</i></button>
                <button type="button" className={clsx("destination-card", draft.destinations?.includes("story") && "selected")} aria-pressed={draft.destinations?.includes("story")} onClick={() => toggleDestination("story")}><span><Smartphone size={20} /></span><div><strong>My Day / Story</strong><small>Visible for 24 hours</small></div><i>{draft.destinations?.includes("story") && <Check size={14} />}</i></button>
              </div>
              <div className="form-grid two-columns">
                <Field label="Photo template" hint={hasVideo ? "Photos only" : "Locked behind editable text"}><select disabled={hasVideo} value={draft.templateId || ""} onChange={(event) => setDraft({ ...draft, templateId: event.target.value })}><option value="">Blank square</option>{photoTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>
                <Field label="Feed publish date & time" hint="Leave blank to publish now"><input type="datetime-local" value={toDateTimeLocal(draft.scheduledFor)} onChange={(event) => setDraft({ ...draft, scheduledFor: event.target.value })} /></Field>
              </div>
              {activeTemplate && !isSquareTemplate(activeTemplate) && <div className="crop-warning"><Crop size={16} /> This photo template is not square. Check the mobile and desktop crop previews.</div>}
              {draft.destinations?.includes("story") && !hasVideo && <Field label="My Day source" hint="Choose the image used for the Story"><select value={draft.storySourceId || (draft.cover?.enabled ? "cover" : draft.images[0]?.id || "")} onChange={(event) => setDraft({ ...draft, storySourceId: event.target.value })}>{draft.cover?.enabled && <option value="cover">Cover page</option>}{draft.images.filter((item) => item.type !== "video").map((item, index) => <option value={item.id} key={item.id}>Event photo {index + 1} · {item.name}</option>)}</select></Field>}
              {draft.scheduledFor && draft.destinations?.includes("story") && <div className="schedule-warning"><CalendarClock size={16} /> Remove My Day or clear the schedule. Meta Stories can only publish immediately through this connection.</div>}
            </section>
          </div>
          <aside className="preview-column">
            <div className="preview-heading"><span>Live preview</span><small>Facebook feed</small></div>
            <FacebookPreview draft={draft} settings={settings} photoTemplate={activeTemplate} coverTemplate={activeCoverTemplate} facebookPage={facebookPage} />
            <div className="preview-note"><ShieldCheck size={17} /><span>Facebook may adjust the final multi-photo layout. Attachment order and exported designs are preserved.</span></div>
          </aside>
        </div>
        <footer className="composer-footer"><div className="composer-save-area"><button className="text-button" onClick={onSave} disabled={publishing}>Save draft</button>{publishing && <span className="publish-progress"><Loader2 className="spin" size={15} /> {publishProgress}</span>}</div><div><button className="secondary-button" onClick={onReview} disabled={publishing}><BadgeCheck size={17} /> Submit for review</button><button className="primary-button" onClick={onPublish} disabled={publishing || !canPublish} title={canPublish ? "" : "Your office role does not allow publishing"}>{publishing ? <Loader2 className="spin" size={17} /> : <Send size={17} />} {publishing ? "Publishing…" : canPublish ? draft.scheduledFor ? "Schedule on Facebook" : "Publish to Facebook" : "Publishing restricted"}</button></div></footer>
      </motion.section>
      <AnimatePresence>
        {editingImage && <CompositionEditor key={`photo-${editingImage.id}-${focusLayerId}`} media={editingImage} template={activeTemplate} layers={draft.textLayers} campaignTitle={draft.title} eventFields={draft.eventFields} target="photo" focusLayerId={focusLayerId} onMediaEdit={(edit) => updatePhotoEdit(editingImage.id, edit)} onLayersChange={(textLayers) => setDraft((current) => ({ ...current, textLayers }))} onClose={() => { setEditingImageId(null); setFocusLayerId(""); }} />}
        {editingCover && coverMedia && <CompositionEditor key={`cover-${coverMedia.id}-${focusLayerId}`} media={{ ...coverMedia, edit: draft.cover?.edit || coverMedia.edit }} template={activeCoverTemplate} layers={draft.textLayers} campaignTitle={draft.title} eventFields={draft.eventFields} target="cover" duotone={draft.cover?.duotone} focusLayerId={focusLayerId} onMediaEdit={(edit) => updateCover({ edit })} onLayersChange={(textLayers) => setDraft((current) => ({ ...current, textLayers }))} onClose={() => { setEditingCover(false); setFocusLayerId(""); }} />}
      </AnimatePresence>
    </motion.div>
  );
}

function TypeIcon() {
  return <span aria-hidden="true" className="type-icon">T</span>;
}

function StructuredTextField({ label, type = "text", value, placeholder, onChange, added, onAdd }) {
  return (
    <div className="structured-text-row">
      <Field label={label}><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></Field>
      <button className="secondary-button" type="button" onClick={onAdd}><TypeIcon /> {added ? "Edit in design" : "Add to design"}</button>
    </div>
  );
}

function suggestedPositionName(suggestions, source) {
  const suggestion = (Array.isArray(suggestions) ? suggestions : []).find((item) => item.source === source);
  const y = Number(suggestion?.y ?? (source === "campaign_title" ? 68 : 80));
  return y < 34 ? "top" : y < 66 ? "middle" : "bottom";
}

function updateSuggestedPosition(suggestions, source, position) {
  const yByPosition = {
    top: source === "campaign_title" ? 9 : source === "date" ? 21 : 28,
    middle: source === "campaign_title" ? 42 : source === "date" ? 55 : 62,
    bottom: source === "campaign_title" ? 69 : source === "date" ? 82 : 88,
  };
  const next = (Array.isArray(suggestions) ? suggestions : []).filter((item) => item.source !== source);
  return [...next, { source, x: 8, y: yByPosition[position] ?? 68, width: 84 }];
}

function ComposedPhotoPreview({ media, template, draft, target, duotone = "none", className }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let active = true;
    if (!media?.src) return undefined;
    Promise.all([loadBrowserImage(media.src), template?.image ? loadBrowserImage(template.image) : null]).then(([source, templateImage]) => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = templateImage?.naturalWidth || 1080;
      canvas.height = templateImage?.naturalHeight || 1080;
      paintPhotoComposition(canvas.getContext("2d"), source, templateImage, canvas.width, canvas.height, media.edit, {
        layers: draft.textLayers,
        campaignTitle: draft.title,
        eventFields: draft.eventFields,
        target,
        photoId: media.id,
        duotone,
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [media, template?.image, draft.textLayers, draft.title, draft.eventFields, target, duotone]);
  return <canvas ref={canvasRef} className={className} role="img" aria-label={`Composed ${target === "cover" ? "cover page" : "event photo"}`} />;
}

function FacebookPreview({ draft, settings, photoTemplate, coverTemplate, facebookPage }) {
  const [device, setDevice] = useState("mobile");
  const primaryMedia = draft.images[0];
  const isVideo = primaryMedia?.type === "video";
  const items = isVideo ? [] : feedMedia(draft);
  const primaryTemplate = items[0]?.compositionTarget === "cover" ? coverTemplate : photoTemplate;
  const orientation = Number(primaryTemplate?.width || 1) > Number(primaryTemplate?.height || 1) * 1.05 ? "landscape" : "square";
  const layout = facebookLayout(items.length, orientation);
  const pageName = facebookPage?.name || settings.pageName;
  const pagePicture = facebookPage?.picture || "/brand/dilg-logo.png";
  return (
    <>
      <div className="preview-device-switch" aria-label="Preview size"><button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")}>Mobile</button><button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")}>Desktop</button></div>
      <div className={clsx("facebook-preview", `is-${device}`)}>
        <div className="fb-post-header"><div className="fb-avatar"><img src={pagePicture} alt="" /></div><div><strong>{pageName}</strong><span>Just now · <span aria-label="Public">🌐</span></span></div><MoreHorizontal size={18} /></div>
        <div className={clsx("fb-caption", !draft.caption && "placeholder")}>{draft.caption || "Your caption will appear here as you write…"}</div>
        <div className={clsx("fb-media", `layout-${layout.kind}`)}>
          {isVideo ? <video className="fb-source" src={primaryMedia.src} controls playsInline preload="metadata" /> : items.length ? items.slice(0, layout.visible).map((item, index) => {
            const isCover = item.compositionTarget === "cover";
            const media = isCover ? { ...item, edit: draft.cover?.edit || item.edit } : item;
            return <div className="fb-grid-cell" key={`${item.id}-${index}`}><ComposedPhotoPreview className="fb-source" media={media} template={isCover ? coverTemplate : photoTemplate} draft={draft} target={isCover ? "cover" : "photo"} duotone={isCover ? draft.cover?.duotone : "none"} />{index === layout.visible - 1 && layout.overflow ? <span className="photo-count">+{layout.overflow}</span> : null}</div>;
          }) : <div className="fb-empty"><ImagePlus size={28} /><span>Add photos or a video to preview the post</span></div>}
        </div>
        <div className="fb-layout-disclaimer"><Crop size={14} /> Crop-safe approximation · Facebook may adjust the final layout</div>
        <div className="fb-engagement"><span>👍 ❤️ <small>24</small></span><span>5 comments · 2 shares</span></div>
        <div className="fb-actions"><button>👍 Like</button><button><MessageSquareText size={15} /> Comment</button><button>↗ Share</button></div>
      </div>
    </>
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

function AccountSetupScreen({ facebookDirectory, refreshFacebookDirectory }) {
  return (
    <main className="account-access-shell">
      <Toaster richColors position="top-right" closeButton />
      <div className="account-access-brand"><img src="/brand/dilg-logo.png" alt="DILG seal" /><div><strong>DILG Social Studio</strong><span>Region XII multi-office publishing</span></div></div>
      <section className="account-access-card setup-required-card">
        <div className="account-access-heading"><span className="section-kicker"><Settings size={14} /> One-time platform setup</span><h1>Prepare secure accounts for every Region XII office</h1><p>Once the regional administrator completes these steps, staff can sign in concurrently and work only with Facebook Pages they are authorized to manage.</p></div>
        <FacebookAdminSetup missing={facebookDirectory.missing} onRefresh={refreshFacebookDirectory} />
      </section>
    </main>
  );
}

function AccountSignInScreen() {
  return (
    <main className="account-access-shell">
      <Toaster richColors position="top-right" closeButton />
      <div className="account-access-brand"><img src="/brand/dilg-logo.png" alt="DILG seal" /><div><strong>DILG Social Studio</strong><span>Region XII multi-office publishing</span></div></div>
      <section className="account-access-card sign-in-card">
        <div className="sign-in-seal"><img src="/brand/dilg-logo.png" alt="" /></div>
        <span className="section-kicker"><ShieldCheck size={14} /> Secure staff account</span>
        <h1>Sign in to your office workspace</h1>
        <p>Use the Facebook account that has access to your official Province, City, or Regional Office Page. New staff must then be approved by a Regional Administrator.</p>
        <div className="account-isolation-list">
          <span><CheckCircle2 size={17} /><strong>Your own account session</strong><small>Other users cannot change your selected Page.</small></span>
          <span><CheckCircle2 size={17} /><strong>Administrator-assigned office</strong><small>You cannot select or approve your own office.</small></span>
          <span><CheckCircle2 size={17} /><strong>Two authorization checks</strong><small>Meta Page access and the Region XII staff directory must both allow publishing.</small></span>
        </div>
        <a className="primary-button account-sign-in-button" href="/api/facebook/oauth/start"><ExternalLink size={18} /> Continue with Facebook</a>
        <small className="account-privacy-note"><KeyRound size={14} /> Page tokens remain encrypted on the server and never enter browser storage.</small>
      </section>
    </main>
  );
}

function StaffAccessScreen({ facebookDirectory, refreshFacebookDirectory }) {
  const [busy, setBusy] = useState(false);
  const status = facebookDirectory.accessStatus || "pending";
  const isAdministrator = Boolean(facebookDirectory.staff?.isRegionalAdmin);
  const approvedWithoutOffice = status === "approved" && facebookDirectory.pages.length === 0;

  async function signOut() {
    setBusy(true);
    try {
      await requestJson("/api/facebook/connections", { method: "DELETE" });
      window.location.reload();
    } catch (error) {
      toast.error(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="account-access-shell staff-access-shell">
      <Toaster richColors position="top-right" closeButton />
      <div className="account-access-brand"><img src="/brand/dilg-logo.png" alt="DILG seal" /><div><strong>DILG Social Studio</strong><span>Region XII protected staff access</span></div></div>
      <section className="account-access-card staff-access-gate">
        <div className={`access-gate-icon ${status}`}><ShieldCheck size={28} /></div>
        <span className="section-kicker"><BadgeCheck size={14} /> Signed in as {facebookDirectory.user?.name || "Facebook user"}</span>
        <h1>{status === "suspended" ? "Your staff access is suspended" : approvedWithoutOffice ? "An office assignment is required" : "Your access request is awaiting approval"}</h1>
        <p>{status === "suspended"
          ? "A Regional Administrator has suspended this account. Facebook publishing and office workspaces remain blocked."
          : approvedWithoutOffice
            ? "Your identity is approved, but no verified Facebook Page and office membership are connected to this account yet."
            : "A Regional Administrator must assign your official office and role. Until then, no campaigns, templates, or Facebook publishing tools are available."}</p>
        <div className="account-isolation-list access-gate-checks">
          <span><CheckCircle2 size={17} /><strong>Facebook identity verified</strong><small>The server recognized this Facebook account.</small></span>
          <span><Clock3 size={17} /><strong>Office membership {status === "approved" ? "incomplete" : "pending"}</strong><small>Staff cannot approve or assign themselves.</small></span>
          <span><ShieldCheck size={17} /><strong>Publishing remains blocked</strong><small>Every API request enforces the approved office assignment.</small></span>
        </div>
        <div className="access-gate-actions">
          <button className="primary-button" onClick={() => refreshFacebookDirectory().catch(() => {})} disabled={busy}><RefreshCcw size={17} /> Check approval status</button>
          <button className="secondary-button" onClick={signOut} disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />} Sign out</button>
        </div>
        {isAdministrator && approvedWithoutOffice ? <AccessAdministration compact onAccessChanged={() => refreshFacebookDirectory().catch(() => {})} /> : null}
      </section>
    </main>
  );
}

function normalizeFacebookDirectory(directory, preferredPageId = "") {
  const pages = Array.isArray(directory?.pages) ? directory.pages : [];
  const accountKey = String(directory?.accountKey || "");
  const storedPageId = typeof window === "undefined" || !accountKey ? "" : window.sessionStorage.getItem(`${PAGE_SELECTION_STORAGE}:${accountKey}`) || "";
  const selectedPageId = [preferredPageId, storedPageId, directory?.selectedPageId, pages[0]?.id]
    .find((pageId) => pageId && pages.some((page) => page.id === pageId)) || "";
  if (typeof window !== "undefined" && accountKey && selectedPageId) window.sessionStorage.setItem(`${PAGE_SELECTION_STORAGE}:${accountKey}`, selectedPageId);
  return { ...EMPTY_FACEBOOK_DIRECTORY, ...directory, loading: false, pages, selectedPageId };
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

async function renderComposedImage(media, templateUrl, composition) {
  const [source, template] = await Promise.all([loadBrowserImage(media.src), templateUrl ? loadBrowserImage(templateUrl) : null]);
  const width = template?.naturalWidth || 1080;
  const height = template?.naturalHeight || 1080;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paintPhotoComposition(canvas.getContext("2d"), source, template, width, height, media.edit, composition);
  return canvasToBlob(canvas, "image/jpeg", .9);
}

async function renderStoryImage(media, templateUrl, composition) {
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
  paintPhotoComposition(context, source, template, frameWidth, frameHeight, media.edit, composition);
  context.restore();

  return canvasToBlob(canvas, "image/jpeg", .9);
}

function paintPhotoComposition(context, source, template, width, height, edit, composition = {}) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  if (composition.duotone && composition.duotone !== "none") {
    const filtered = document.createElement("canvas");
    filtered.width = Math.max(1, Math.round(width));
    filtered.height = Math.max(1, Math.round(height));
    drawEditedImageCover(filtered.getContext("2d"), source, 0, 0, filtered.width, filtered.height, edit);
    applyDuotone(filtered, composition.duotone);
    context.drawImage(filtered, 0, 0, width, height);
  } else {
    drawEditedImageCover(context, source, 0, 0, width, height, edit);
  }
  if (template) context.drawImage(template, 0, 0, width, height);
  drawTextLayers(context, width, height, composition);
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

function applyDuotone(canvas, mode) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const samples = [];
  const stride = Math.max(4, Math.floor(imageData.data.length / 2400 / 4) * 4);
  for (let index = 0; index < imageData.data.length; index += stride) {
    samples.push([imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]]);
  }
  const palette = duotonePalette(mode, samples);
  if (!palette) return;
  const shadow = hexToRgb(palette.shadow);
  const highlight = hexToRgb(palette.highlight);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance = (imageData.data[index] * .2126 + imageData.data[index + 1] * .7152 + imageData.data[index + 2] * .0722) / 255;
    imageData.data[index] = shadow[0] + (highlight[0] - shadow[0]) * luminance;
    imageData.data[index + 1] = shadow[1] + (highlight[1] - shadow[1]) * luminance;
    imageData.data[index + 2] = shadow[2] + (highlight[2] - shadow[2]) * luminance;
  }
  context.putImageData(imageData, 0, 0);
}

function drawTextLayers(context, width, height, composition) {
  const layers = Array.isArray(composition.layers) ? composition.layers : [];
  layers.filter((layer) => layerAppliesTo(layer, composition.target, composition.photoId)).forEach((layer) => {
    const text = resolveLayerText(layer, composition.campaignTitle, composition.eventFields);
    if (!text) return;
    const boxWidth = width * layer.width / 100;
    const fontSize = width * layer.fontSize / 100;
    const lineHeight = fontSize * layer.lineHeight;
    const alignOffset = layer.align === "center" ? boxWidth / 2 : layer.align === "right" ? boxWidth : 0;
    context.save();
    context.translate(width * layer.x / 100, height * layer.y / 100);
    context.rotate((Number(layer.rotation) || 0) * Math.PI / 180);
    context.font = `${layer.fontWeight || 700} ${fontSize}px ${layer.fontFamily || "Arial"}, sans-serif`;
    context.textBaseline = "top";
    context.textAlign = layer.align || "left";
    context.lineJoin = "round";
    context.fillStyle = layer.color || "#ffffff";
    if (layer.outline) {
      context.strokeStyle = "rgba(0,0,0,.58)";
      context.lineWidth = Math.max(2, width * .003);
    }
    wrapCanvasText(context, text, boxWidth).forEach((line, index) => {
      if (layer.outline) context.strokeText(line, alignOffset, index * lineHeight, boxWidth);
      context.fillText(line, alignOffset, index * lineHeight, boxWidth);
    });
    context.restore();
  });
}

function wrapCanvasText(context, text, maxWidth) {
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
  return lines;
}

async function prepareTemplateImage(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error("Template images must be smaller than 12 MB.");
  return prepareWorkspaceImage(file, 1920, .9);
}

async function prepareCampaignImage(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error("Photos must be smaller than 12 MB.");
  return prepareWorkspaceImage(file, 1800, .88);
}

async function prepareWorkspaceImage(file, maxDimension, quality) {
  const source = await fileToDataUrl(file);
  const image = await loadBrowserImage(source);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, "image/webp", quality);
  return {
    blob,
    src: canvas.toDataURL("image/webp", quality),
    width,
    height,
    size: `${width} × ${height}`,
    ratio: `${(width / height).toFixed(2)}:1`,
  };
}

async function uploadWorkspaceImage(blob, { id, kind, pageId, officeId, name }) {
  if (!pageId || !officeId) throw new Error("Choose an approved office and Facebook Page before uploading images.");
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  const filename = `${sanitizeFileName(name || `${kind}.${extension}`).replace(/\.[^.]+$/, "")}.${extension}`;
  const file = new File([blob], filename, { type: blob.type || "image/webp" });
  return upload(`office-media/${officeId}/${kind}/${id}-${filename}`, file, {
    access: "private",
    handleUploadUrl: "/api/workspace/upload",
    clientPayload: JSON.stringify({ pageId, kind }),
  });
}

async function prepareLocalWorkspaceImport(localStudio, pageId, officeId) {
  if (!officeId) throw new Error("The approved office could not be identified.");
  const seenTemplateIds = new Set();
  const templates = [];
  for (const sourceTemplate of Array.isArray(localStudio.templates) ? localStudio.templates : []) {
    if (!sourceTemplate?.id || seenTemplateIds.has(sourceTemplate.id)) continue;
    seenTemplateIds.add(sourceTemplate.id);
    const template = { ...sourceTemplate, kind: sourceTemplate.kind === "cover" ? "cover" : "photo" };
    template.assetUrl = await importWorkspaceAsset(template, { pageId, officeId, kind: "template" });
    if (!template.assetUrl) continue;
    templates.push(template);
  }
  const seenCampaignIds = new Set();
  const campaigns = [];
  for (const sourceCampaign of Array.isArray(localStudio.campaigns) ? localStudio.campaigns : []) {
    if (!sourceCampaign?.id || seenCampaignIds.has(sourceCampaign.id)) continue;
    seenCampaignIds.add(sourceCampaign.id);
    const composition = normalizeCampaignComposition(sourceCampaign);
    const images = [];
    const seenMediaIds = new Set();
    for (const sourceMedia of Array.isArray(sourceCampaign.images) ? sourceCampaign.images : []) {
      if (!sourceMedia?.id || seenMediaIds.has(sourceMedia.id)) continue;
      seenMediaIds.add(sourceMedia.id);
      const media = { ...sourceMedia, edit: normalizePhotoEdit(sourceMedia.edit) };
      media.assetUrl = await importWorkspaceAsset(media, { pageId, officeId, kind: media.type === "video" ? "video" : "campaign" });
      if (media.assetUrl) images.push(media);
    }
    const cover = { ...composition.cover };
    if (cover.media) {
      cover.media = { ...cover.media, edit: normalizePhotoEdit(cover.media.edit) };
      cover.media.assetUrl = await importWorkspaceAsset(cover.media, { pageId, officeId, kind: "cover" });
      if (!cover.media.assetUrl) cover.media = null;
    }
    campaigns.push({
      ...sourceCampaign,
      cover,
      eventFields: composition.eventFields,
      textLayers: composition.textLayers,
      storySourceId: composition.storySourceId,
      revision: 0,
      images,
      eventOverlay: undefined,
    });
  }
  return { templates, campaigns };
}

function copyCampaignWithNewIds(campaign, now = new Date().toISOString()) {
  const idMap = new Map();
  const images = (Array.isArray(campaign.images) ? campaign.images : []).map((item) => {
    const nextId = createId(item.type === "video" ? "video" : "image");
    idMap.set(item.id, nextId);
    return { ...item, id: nextId };
  });
  const cover = { ...normalizeCover(campaign.cover) };
  if (cover.sourceImageId) cover.sourceImageId = idMap.get(cover.sourceImageId) || "";
  if (cover.media) cover.media = { ...cover.media, id: createId("cover") };
  return {
    ...campaign,
    id: createId("campaign"),
    title: `${campaign.title} (copy)`,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    images,
    cover,
    storySourceId: campaign.storySourceId === "cover" ? "cover" : idMap.get(campaign.storySourceId) || "",
    textLayers: (Array.isArray(campaign.textLayers) ? campaign.textLayers : []).map((layer) => ({
      ...layer,
      id: createId("text"),
      photoId: layer.scope === "selected_photo" ? idMap.get(layer.photoId) || "" : "",
    })),
  };
}

async function importWorkspaceAsset(item, { pageId, officeId, kind }) {
  const existing = String(item.assetUrl || "");
  if (existing) return existing;
  const source = String(item.src || item.image || "");
  if (!source) return "";
  if (source.startsWith("/") || source.startsWith("http") && item.type === "video") return source;
  if (!source.startsWith("data:")) return source;
  const blob = await fetch(source).then((response) => response.blob());
  const uploaded = await uploadWorkspaceImage(blob, {
    id: item.id,
    kind,
    pageId,
    officeId,
    name: item.name || `${item.id}.webp`,
  });
  return uploaded.url;
}

function canvasToBlob(canvas, type = "image/webp", quality = .9) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The image could not be prepared.")), type, quality));
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

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hexToRgb(value) {
  const hex = String(value || "#000000").replace("#", "");
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) || 0);
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

function roleLabel(role) {
  if (role === "office_admin") return "Office administrator";
  if (role === "publisher") return "Publisher";
  if (role === "editor") return "Editor";
  return "Viewer";
}
