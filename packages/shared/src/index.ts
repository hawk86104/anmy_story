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
  status: "draft" | "saved";
  visibility: Visibility;
  revision?: number;
  clientId: string;
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
export function entryTitle(
  entry: Pick<Entry, "title" | "content" | "type">,
): string {
  return (
    entry.title ||
    entry.content.slice(0, 32) ||
    ENTRY_TYPES.find((t) => t.value === entry.type)?.label ||
    "一段成长记录"
  );
}
