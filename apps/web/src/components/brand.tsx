import Link from "next/link";
import { themeAssets } from "./theme";
export function Brand({ href = "/app" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="MyLife 首页">
      <img
        className="brand-mark"
        src={themeAssets.mark}
        width={44}
        height={44}
        alt=""
      />
      <span>
        <span className="brand-word">mylife</span>
        <small>把成长，慢慢收藏</small>
      </span>
    </Link>
  );
}
