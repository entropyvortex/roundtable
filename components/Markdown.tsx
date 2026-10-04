"use client";

// ─────────────────────────────────────────────────────────────
// Markdown — react-markdown with the settings for model output
// ─────────────────────────────────────────────────────────────
// Model answers are untrusted: links open in a new tab without a
// referrer, and images are never fetched (react-markdown already
// renders no raw HTML and drops javascript: URLs).

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];
const disallowedElements = ["img"];
const components: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
  ),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      components={components}
      disallowedElements={disallowedElements}
      unwrapDisallowed
    >
      {children}
    </ReactMarkdown>
  );
}
