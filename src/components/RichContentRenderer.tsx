import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface RichContentRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders text that may contain:
 * - LaTeX formulas wrapped in $$ ... $$ (block) or $ ... $ (inline)
 * - Images as ![alt](url)
 * - Plain text with unicode math/phonics symbols
 */
export default function RichContentRenderer({ content, className }: RichContentRendererProps) {
  const rendered = useMemo(() => {
    if (!content) return "";

    // Split on image markdown and latex patterns
    // Process: images → block latex → inline latex
    const parts: { type: "text" | "html"; value: string }[] = [];

    // First pass: extract images
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    const textParts: string[] = [];
    const imageParts: { index: number; alt: string; url: string }[] = [];

    while ((match = imgRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        textParts.push(content.substring(lastIndex, match.index));
      }
      textParts.push(`__IMG_${imageParts.length}__`);
      imageParts.push({ index: imageParts.length, alt: match[1], url: match[2] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      textParts.push(content.substring(lastIndex));
    }

    const joined = textParts.join("");

    // Second pass: process LaTeX in text
    // Block: $$...$$, Inline: $...$
    const latexRegex = /\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;
    let processed = "";
    lastIndex = 0;

    while ((match = latexRegex.exec(joined)) !== null) {
      processed += escapeHtml(joined.substring(lastIndex, match.index));
      const formula = match[1] ?? match[2];
      const isBlock = match[1] !== undefined;
      try {
        const html = katex.renderToString(formula, { throwOnError: false, displayMode: isBlock });
        processed += html;
      } catch {
        processed += `<code>${escapeHtml(formula)}</code>`;
      }
      lastIndex = match.index + match[0].length;
    }
    processed += escapeHtml(joined.substring(lastIndex));

    // Third pass: replace image placeholders
    imageParts.forEach((img) => {
      processed = processed.replace(
        `__IMG_${img.index}__`,
        `<img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.alt)}" class="my-2 max-w-full rounded-lg border border-border" style="max-height:300px" />`
      );
    });

    // Replace newlines with <br>
    processed = processed.replace(/\n/g, "<br/>");

    return processed;
  }, [content]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str: string) {
  return str.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
