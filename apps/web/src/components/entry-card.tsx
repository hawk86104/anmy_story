import Link from "next/link";
import { BookOpen, Flag, Mic, Palette, Sparkles } from "lucide-react";
import {
  ENTRY_TYPES,
  displayDate,
  entryCover,
  entryTitle,
  type Entry,
  type PublicEntry,
} from "@mylife/shared";
import { mediaUrl } from "@/lib/urls";

export function EntryArtwork({ entry }: { entry: Entry | PublicEntry }) {
  const cover = entryCover(entry);
  const Icon =
    { quick: Sparkles, story: BookOpen, work: Palette, honor: Flag }[
      entry.type
    ] || Mic;
  return cover ? (
    <img
      className="entry-artwork"
      src={mediaUrl(cover.url)}
      alt={cover.alt || entryTitle(entry)}
      loading="lazy"
    />
  ) : (
    <div className={`entry-artwork entry-artwork-fallback kind-${entry.type}`}>
      <Icon size={48} strokeWidth={1.3} />
      <span>
        {entry.type === "honor"
          ? "每一步，都算数"
          : entry.type === "work"
            ? "每一份喜欢，都有形状"
            : "把小小的日子，好好收藏"}
      </span>
    </div>
  );
}
export function EntryCard({
  entry,
  privateEntry = false,
}: {
  entry: Entry | PublicEntry;
  privateEntry?: boolean;
}) {
  return (
    <Link
      href={`${privateEntry ? "/app" : ""}/entries/${entry.id}`}
      className={`memory-card kind-${entry.type}`}
    >
      <EntryArtwork entry={entry} />
      <div className="memory-card-content">
        <div className="memory-card-meta">
          <span className={`site-tag kind-${entry.type}`}>
            {ENTRY_TYPES.find((t) => t.value === entry.type)?.label}
          </span>
          <time>{displayDate(entry)}</time>
        </div>
        <h3>{entryTitle(entry)}</h3>
        <p>
          {entry.content.slice(0, 100)}
          {entry.content.length > 100 ? "…" : ""}
        </p>
      </div>
    </Link>
  );
}
