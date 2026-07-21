export const STORAGE_KEY = "dilg-social-studio:v1";

const daysFromNow = (days, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export const INITIAL_STATE = {
  version: 2,
  settings: {
    organization: "DILG Region XII",
    pageName: "DILG Region XII",
    pageHandle: "@DILGRegionXII",
    defaultTemplateId: "template-feed",
    approvalRequired: true,
    notifications: true,
    compactMode: false,
  },
  templates: [
    {
      id: "template-feed",
      name: "Gensan Feed",
      size: "940 × 788",
      ratio: "4:3",
      image: "/templates/gensan-feed.png",
      usage: 12,
      createdAt: daysFromNow(-40),
    },
    {
      id: "template-landscape",
      name: "Facebook Landscape",
      size: "1200 × 630",
      ratio: "1.91:1",
      image: "/templates/gensan-landscape.png",
      usage: 8,
      createdAt: daysFromNow(-32),
    },
    {
      id: "template-wide",
      name: "Event Wide",
      size: "1920 × 1080",
      ratio: "16:9",
      image: "/templates/gensan-wide.png",
      usage: 4,
      createdAt: daysFromNow(-18),
    },
  ],
  campaigns: [
    {
      id: "campaign-1",
      title: "Barangay Disaster Preparedness Forum",
      caption:
        "Stronger communities begin with prepared citizens. Today, we joined barangay leaders and volunteers for a practical disaster preparedness forum focused on coordination, readiness, and responsive local governance.\n\n#DILGRegionXII #SerbisyongMatino #DisasterPreparedness",
      status: "Ready for review",
      templateId: "template-feed",
      scheduledFor: daysFromNow(0, 15),
      createdAt: daysFromNow(-2),
      updatedAt: daysFromNow(-1),
      images: [
        { id: "image-1", name: "forum-landscape.jpg", src: "/demo/sample-landscape.jpg" },
        { id: "image-2", name: "forum-square.jpg", src: "/demo/sample-square.jpg" },
      ],
    },
    {
      id: "campaign-2",
      title: "KALINISAN Community Clean-up",
      caption:
        "Clean surroundings reflect a community that cares. Thank you to every volunteer who showed up and worked together for cleaner, safer communities across Region XII.\n\n#KALINISAN #DILGRegionXII",
      status: "Scheduled",
      templateId: "template-landscape",
      scheduledFor: daysFromNow(1, 10),
      createdAt: daysFromNow(-5),
      updatedAt: daysFromNow(-2),
      images: [{ id: "image-3", name: "cleanup.jpg", src: "/demo/sample-square.jpg" }],
    },
    {
      id: "campaign-3",
      title: "Lupong Tagapamayapa Training",
      caption:
        "Building peaceful communities through capable and committed local mediators. Our Lupong Tagapamayapa members completed another focused learning session today.",
      status: "Published",
      templateId: "template-wide",
      scheduledFor: daysFromNow(-1, 14),
      publishedAt: daysFromNow(-1, 14),
      createdAt: daysFromNow(-8),
      updatedAt: daysFromNow(-1, 14),
      images: [{ id: "image-4", name: "training.jpg", src: "/demo/sample-portrait.jpg" }],
    },
    {
      id: "campaign-4",
      title: "Youth Leadership Dialogue",
      caption: "",
      status: "Draft",
      templateId: "template-feed",
      scheduledFor: "",
      createdAt: daysFromNow(-1),
      updatedAt: daysFromNow(-1),
      images: [],
    },
  ],
  activity: [
    { id: "activity-1", type: "published", text: "Lupong Tagapamayapa Training was published", at: daysFromNow(-1, 14) },
    { id: "activity-2", type: "scheduled", text: "KALINISAN Community Clean-up was scheduled", at: daysFromNow(-2, 16) },
    { id: "activity-3", type: "review", text: "Barangay Disaster Preparedness Forum is ready for review", at: daysFromNow(-2, 11) },
    { id: "activity-4", type: "created", text: "Youth Leadership Dialogue draft was created", at: daysFromNow(-3, 9) },
  ],
};

export function loadStudioState(scope = "") {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const scopedKey = getScopedStorageKey(scope);
    let saved = window.localStorage.getItem(scopedKey);
    if (!saved && scope && !window.localStorage.getItem(`${STORAGE_KEY}:scoped-migration-complete`)) {
      saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) window.localStorage.setItem(`${STORAGE_KEY}:scoped-migration-complete`, "true");
    }
    if (!saved) return INITIAL_STATE;
    const parsed = JSON.parse(saved);
    const settings = { ...INITIAL_STATE.settings, ...parsed.settings };
    if (settings.organization === "DILG General Santos City") settings.organization = "DILG Region XII";
    if (settings.pageName === "DILG General Santos City") settings.pageName = "DILG Region XII";
    if (settings.pageHandle === "@DILGGensan") settings.pageHandle = "@DILGRegionXII";
    return {
      ...INITIAL_STATE,
      ...parsed,
      version: INITIAL_STATE.version,
      settings,
      templates: Array.isArray(parsed.templates) ? parsed.templates : INITIAL_STATE.templates,
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : INITIAL_STATE.campaigns,
      activity: Array.isArray(parsed.activity) ? parsed.activity : INITIAL_STATE.activity,
    };
  } catch {
    return INITIAL_STATE;
  }
}

export function saveStudioState(state, scope = "") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getScopedStorageKey(scope), JSON.stringify(state));
}

function getScopedStorageKey(scope) {
  const safeScope = String(scope || "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 96);
  return safeScope ? `${STORAGE_KEY}:${safeScope}` : STORAGE_KEY;
}

export function createId(prefix) {
  const suffix = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function formatRelativeDate(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.round(diff / 86_400_000);
  if (days === 0) return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (days === 1) return `Tomorrow, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 7) return date.toLocaleDateString([], { weekday: "long", hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function statusTone(status) {
  return {
    Draft: "neutral",
    "Ready for review": "review",
    Approved: "approved",
    Scheduled: "scheduled",
    Published: "published",
  }[status] || "neutral";
}
