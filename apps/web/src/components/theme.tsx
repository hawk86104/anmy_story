import type { ReactNode } from "react";

export const themeAssets = {
  banner: "/themes/usagi/meadow.webp",
  sticker: "/themes/usagi/sticker.webp",
  mark: "/themes/usagi/mark.webp",
};
export function Usagi({
  className = "",
  size = 180,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      className={`usagi-sticker ${className}`}
      src={themeAssets.sticker}
      width={size}
      height={size}
      alt="抱着手账的乌萨奇"
      loading="lazy"
    />
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="usagi-empty">
      <Usagi size={150} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
