import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

/** ReactMarkdown escapes raw HTML and rejects unsafe URL schemes by default. */
export function MarkdownContent({ content, className = "" }: { content?: string | null; className?: string }) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, title, children }) => href ? <a href={href} title={title} target={/^https?:\/\//i.test(href) ? "_blank" : undefined} rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
          img: ({ src, alt, title }) => typeof src === "string" && src ? <img src={src} alt={alt || ""} title={title} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt || "图片不可用"}</span>,
          table: ({ children }) => <div className="markdown-table-wrap" role="region" aria-label="表格" tabIndex={0}><table>{children}</table></div>,
        }}
      >{content || ""}</ReactMarkdown>
    </div>
  );
}
