export const ENTRY_TYPES = [
  {
    value: "quick",
    label: "随手记",
    description: "一句话，也值得留下",
    icon: "sparkles",
  },
  {
    value: "story",
    label: "写故事",
    description: "慢慢讲一件难忘的事",
    icon: "book",
  },
  {
    value: "work",
    label: "存作品",
    description: "收藏自己的小小创造",
    icon: "palette",
  },
  {
    value: "honor",
    label: "小里程碑",
    description: "为每一步进步留个纪念",
    icon: "flag",
  },
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number]["value"];
export type DatePrecision = "day" | "month" | "year" | "unknown";
export type Visibility = "family" | "public";
export const DEFAULT_ENTRY_TAGS = [
  "日常小事",
  "新的尝试",
  "我的作品",
  "运动一下",
  "读书时光",
  "小小进步",
] as const;
export const MAX_ENTRY_TAG_OPTIONS = 60;
export const THEMES = [
  {
    value: "usagi",
    name: "乌萨奇的阳光手账",
    description: "奶油白、乌萨奇黄与焦糖棕",
  },
  {
    value: "hachiware",
    name: "小八的晴空日记",
    description: "天空蓝与云朵白，留给好奇心一片晴空",
  },
  {
    value: "chiikawa",
    name: "吉伊的草莓信笺",
    description: "浅粉与奶油白，轻轻写下小心情",
  },
] as const;
export type ThemeId = (typeof THEMES)[number]["value"];
export interface GrowthProject {
  id: number;
  title: string;
  summary?: string | null;
  description?: string | null;
  status: "exploring" | "completed";
  visibility: Visibility;
  startedAt?: string | null;
  cover?: Media | number | null;
  owner?: Member | number;
  entryCount?: number;
  workCount?: number;
  createdAt?: string;
  updatedAt?: string;
}
export interface SpaceProfile {
  id?: number;
  displayName: string;
  bio: string;
  interests: { label: string }[];
  theme: ThemeId;
  avatar?: Media | null;
  cover?: Media | null;
  owner?: number;
  modules: {
    timeline: boolean;
    works: boolean;
    honors: boolean;
    projects: boolean;
  };
  stats?: { entries: number; works: number; honors: number; projects: number };
}
export interface AIConfiguration {
  enabled: boolean;
  endpoint: string;
  model: string;
  transcriptionModel: string;
  keyConfigured: boolean;
  consent: boolean;
}
export const DEFAULT_PROFILE: SpaceProfile = {
  displayName: "我的成长手记",
  bio: "关于探索、创造，和每一个小小的进步。",
  interests: [],
  theme: "usagi",
  modules: { timeline: true, works: true, honors: true, projects: true },
};
export interface AISuggestion {
  titles: string[];
  content: string;
  originalToken?: string;
}
export interface Member {
  id: number;
  email: string;
  name: string;
  role: "child" | "parent";
  familyId: string;
  allowPublicPublishing?: boolean;
}
export interface Media {
  id: number;
  filename: string;
  mimeType: string;
  filesize: number;
  url: string;
  alt?: string;
  processingStatus: "ready" | "queued" | "processing" | "failed";
  processingError?: string;
  originalSize?: number;
  preserveOriginal?: boolean;
  referenceCount?: number;
}
export interface Entry {
  id: number;
  type: EntryType;
  title?: string;
  content: string;
  originalText: string;
  reflection?: string;
  learning?: string;
  parentNote?: string;
  occurredAt?: string | null;
  datePrecision: DatePrecision;
  dateNote?: string;
  retrospective: boolean;
  tags?: { label: string }[];
  media?: (Media | number)[];
  coverMedia?: Media | number | null;
  projects?: (GrowthProject | number)[];
  mainProject?: GrowthProject | number | null;
  visibility: Visibility;
  publicRequested: boolean;
  reviewStatus: "none" | "pending" | "approved" | "rejected";
  status: "draft" | "saved" | "archived";
  author: number | Member;
  createdAt: string;
  updatedAt: string;
  revision: number;
  editedBy?: number | Member;
  editorName?: string;
}
export interface EntryInput {
  type: EntryType;
  title: string;
  content: string;
  reflection: string;
  learning: string;
  occurredAt: string | null;
  datePrecision: DatePrecision;
  dateNote: string;
  retrospective: boolean;
  tags: { label: string }[];
  media: number[];
  coverMedia?: number | null;
  projects?: number[];
  mainProject?: number | null;
  status: "draft" | "saved";
  visibility: Visibility;
  revision?: number;
  clientId: string;
  parentNote?: string;
  aiOriginalToken?: string;
}
export type PublicEntry = Pick<
  Entry,
  | "id"
  | "type"
  | "title"
  | "content"
  | "reflection"
  | "learning"
  | "occurredAt"
  | "datePrecision"
  | "dateNote"
  | "revision"
> & {
  retrospective?: boolean;
  tags?: { label: string }[];
  media: Media[];
  coverMedia?: Media | null;
  projects?: GrowthProject[];
};

export function entryCover(entry: {
  media?: (Media | number)[];
  coverMedia?: Media | number | null;
}) {
  if (
    entry.coverMedia &&
    typeof entry.coverMedia !== "number" &&
    entry.coverMedia.mimeType?.startsWith("image/")
  )
    return entry.coverMedia;
  return entry.media?.find(
    (m): m is Media =>
      typeof m !== "number" &&
      m.mimeType?.startsWith("image/") &&
      m.processingStatus === "ready",
  );
}
export function displayDate(
  entry: Pick<Entry, "occurredAt" | "datePrecision" | "dateNote">,
): string {
  if (!entry.occurredAt || entry.datePrecision === "unknown")
    return entry.dateNote || "时间待确认";
  const [y, m, d] = entry.occurredAt.slice(0, 10).split("-");
  if (entry.datePrecision === "year") return `${y} 年`;
  if (entry.datePrecision === "month") return `${y} 年 ${Number(m)} 月`;
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}
export function entryTitle(entry: {
  title?: string | null;
  content?: string | null;
  type: EntryType;
}): string {
  return (
    entry.title ||
    (entry.content || "").slice(0, 32) ||
    ENTRY_TYPES.find((t) => t.value === entry.type)?.label ||
    "一段成长记录"
  );
}
