import type { ReactElement, ReactNode } from "react";
import Link from "next/link";

const LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts
    .filter((part) => part.length > 0)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>;
      }
      const linkMatch = part.match(LINK_PATTERN);
      // Only ever render internal, relative links (e.g. "/jobs/<id>") as
      // navigable — every quick-action formatter that produces these links
      // controls both the label and the target itself (no user input flows
      // into either), but anything not starting with "/" still degrades to
      // plain text rather than becoming a clickable external/protocol link.
      if (linkMatch && linkMatch[2].startsWith("/")) {
        return (
          <Link key={`${keyPrefix}-a-${i}`} href={linkMatch[2]} className="font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2 hover:no-underline">
            {linkMatch[1]}
          </Link>
        );
      }
      return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
    });
}

export function renderFormattedMessage(content: string): ReactElement {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let currentParagraph: string[] = [];
  let currentList: string[] = [];
  let blockKey = 0;

  function flushParagraph() {
    if (currentParagraph.length === 0) return;
    const text = currentParagraph.join(" ");
    blocks.push(<p key={`p-${blockKey}`}>{parseInline(text, `p-${blockKey}`)}</p>);
    blockKey++;
    currentParagraph = [];
  }

  function flushList() {
    if (currentList.length === 0) return;
    blocks.push(
      <ul key={`ul-${blockKey}`} className="list-disc pl-4">
        {currentList.map((item, i) => (
          <li key={i}>{parseInline(item, `li-${blockKey}-${i}`)}</li>
        ))}
      </ul>
    );
    blockKey++;
    currentList = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      currentList.push(bulletMatch[1]);
    } else if (trimmed === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      currentParagraph.push(trimmed);
    }
  }
  flushParagraph();
  flushList();

  return <>{blocks}</>;
}
