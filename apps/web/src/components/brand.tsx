import Link from "next/link";
import { ThemeBrandMark } from "./theme";
export function Brand({ href = "/app", neutral = false }: { href?: string; neutral?: boolean }) {
  return (
    <Link className="brand" href={href} aria-label="MyLife 首页">
      <ThemeBrandMark neutral={neutral} />
      <span>
        <span className="brand-word">mylife</span>
        <small>把成长，慢慢收藏</small>
      </span>
    </Link>
  );
}
