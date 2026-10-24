import { Sprout } from "lucide-react";
import Link from "next/link";
export function Brand({ href = "/app" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="MyLife 首页">
      <span className="brand-symbol">
        <Sprout size={23} strokeWidth={1.8} />
      </span>
      <span>
        my<span className="brand-life">life</span>
        <small>把成长，慢慢收藏</small>
      </span>
    </Link>
  );
}
