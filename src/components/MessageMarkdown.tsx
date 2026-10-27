import { Fragment, memo, useState, type ReactNode } from "react";
import type { GroupMember, JaUser } from "../lib/types";

export interface MarkdownMentionContext {
  memberByUsername: Map<string, GroupMember>;
  myUsername: string;
  onOpenProfile: (user: JaUser) => void;
}

function isSafeLinkUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

function SpoilerSpan({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      className={`md-spoiler ${revealed ? "revealed" : ""}`}
      title={revealed ? "Tap to hide spoiler" : "Tap to reveal spoiler"}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setRevealed((v) => !v);
        }
      }}
    >
      <span className="md-spoiler-inner">{children}</span>
    </span>
  );
}

const CODE_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "async",
  "await",
  "import",
  "from",
  "export",
  "default",
  "class",
  "interface",
  "type",
  "extends",
  "implements",
  "new",
  "try",
  "catch",
  "finally",
  "throw",
  "true",
  "false",
  "null",
  "undefined",
  "def",
  "elif",
  "None",
  "True",
  "False",
  "fn",
  "pub",
  "struct",
  "enum",
  "match",
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "UPDATE",
]);

function highlightCodeLine(line: string, lineIdx: number): ReactNode {
  const tokenRegex =
    /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("//") || token.startsWith("#")) {
      parts.push(
        <span key={`${lineIdx}-c-${k++}`} className="md-tok-comment">
          {token}
        </span>,
      );
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
      parts.push(
        <span key={`${lineIdx}-s-${k++}`} className="md-tok-string">
          {token}
        </span>,
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={`${lineIdx}-n-${k++}`} className="md-tok-number">
          {token}
        </span>,
      );
    } else if (CODE_KEYWORDS.has(token)) {
      parts.push(
        <span key={`${lineIdx}-kw-${k++}`} className="md-tok-keyword">
          {token}
        </span>,
      );
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts;
}

function CodeBlockView({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => undefined);
  };

  const lines = code.split("\n");

  return (
    <div
      className="md-codeblock"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="md-codeblock-head">
        <span className="md-codeblock-lang">{lang || "code"}</span>
        <button type="button" className="md-codeblock-copy" onClick={handleCopy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="md-codeblock-pre">
        <code>
          {lines.map((line, i) => (
            <Fragment key={i}>
              {highlightCodeLine(line, i)}
              {i < lines.length - 1 ? "\n" : ""}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}

function renderTextWithMentionsAndLineBreaks(
  raw: string,
  mine: boolean,
  mentionContext: MarkdownMentionContext | undefined,
  keyPrefix: string,
): ReactNode[] {
  const lines = raw.split("\n");
  const out: ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      out.push(<br key={`${keyPrefix}-br-${lineIdx}`} />);
    }
    if (!mentionContext) {
      if (line) out.push(line);
      return;
    }

    const parts = line.split(/(@everyone|@[a-z0-9._]{3,20})\b/gi);
    parts.forEach((part, partIdx) => {
      if (!part) return;
      if (!part.startsWith("@")) {
        out.push(part);
        return;
      }
      const handle = part.slice(1).toLowerCase();
      if (handle === "everyone") {
        out.push(
          <span
            key={`${keyPrefix}-m-${lineIdx}-${partIdx}`}
            className={`mention-pill mention-everyone ${mine ? "in-mine" : "mention-me"}`}
          >
            {part}
          </span>,
        );
        return;
      }
      const member = mentionContext.memberByUsername.get(handle);
      const isMe = Boolean(
        mentionContext.myUsername && handle === mentionContext.myUsername.toLowerCase(),
      );
      if (!member && !isMe) {
        out.push(part);
        return;
      }
      out.push(
        <button
          key={`${keyPrefix}-m-${lineIdx}-${partIdx}`}
          type="button"
          className={`mention-pill ${isMe && !mine ? "mention-me" : ""} ${mine ? "in-mine" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            if (member) mentionContext.onOpenProfile(member);
          }}
        >
          {part}
        </button>,
      );
    });
  });

  return out;
}

function parseInlineMarkdown(
  input: string,
  mine: boolean,
  mentionContext: MarkdownMentionContext | undefined,
  keyPrefix: string,
  depth = 0,
): ReactNode[] {
  if (!input) return [];
  if (depth > 8) {
    return renderTextWithMentionsAndLineBreaks(input, mine, mentionContext, keyPrefix);
  }

  // Combined ordered tokenizer for inline markdown constructs
  const inlinePattern =
    /\\([\\`*_{}[\]()#+\-.!|~>=^])|`([^`\n]+)`|\|\|([\s\S]+?)\|\||\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|==([\s\S]+?)==|\*([^\s*](?:[\s\S]*?[^\s*])?)\*|(?<![A-Za-z0-9_])_([^\s_](?:[\s\S]*?[^\s_])?)_(?![A-Za-z0-9_])|\^([^\s^]{1,32})\^|(https?:\/\/[^\s<]+)/g;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        ...renderTextWithMentionsAndLineBreaks(
          input.slice(lastIndex, match.index),
          mine,
          mentionContext,
          `${keyPrefix}-t-${tokenIdx}`,
        ),
      );
    }

    const k = `${keyPrefix}-i-${tokenIdx++}`;

    if (match[1] !== undefined) {
      // Escaped punctuation
      nodes.push(match[1]);
    } else if (match[2] !== undefined) {
      // Inline `code`
      nodes.push(
        <code key={k} className="md-inline-code">
          {match[2]}
        </code>,
      );
    } else if (match[3] !== undefined) {
      // ||Spoiler||
      nodes.push(
        <SpoilerSpan key={k}>
          {parseInlineMarkdown(match[3], mine, mentionContext, k, depth + 1)}
        </SpoilerSpan>,
      );
    } else if (match[4] !== undefined && match[5] !== undefined) {
      // [label](url)
      const href = match[5];
      if (isSafeLinkUrl(href)) {
        nodes.push(
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="md-link"
            onClick={(e) => e.stopPropagation()}
          >
            {parseInlineMarkdown(match[4], mine, mentionContext, k, depth + 1)}
          </a>,
        );
      } else {
        nodes.push(match[0]);
      }
    } else if (match[6] !== undefined) {
      // ***bold italic***
      nodes.push(
        <strong key={k}>
          <em>{parseInlineMarkdown(match[6], mine, mentionContext, k, depth + 1)}</em>
        </strong>,
      );
    } else if (match[7] !== undefined) {
      // **bold**
      nodes.push(
        <strong key={k}>
          {parseInlineMarkdown(match[7], mine, mentionContext, k, depth + 1)}
        </strong>,
      );
    } else if (match[8] !== undefined) {
      // __underline__
      nodes.push(
        <u key={k} className="md-underline">
          {parseInlineMarkdown(match[8], mine, mentionContext, k, depth + 1)}
        </u>,
      );
    } else if (match[9] !== undefined) {
      // ~~strikethrough~~
      nodes.push(
        <del key={k} className="md-strike">
          {parseInlineMarkdown(match[9], mine, mentionContext, k, depth + 1)}
        </del>,
      );
    } else if (match[10] !== undefined) {
      // ==highlight==
      nodes.push(
        <mark key={k} className="md-mark">
          {parseInlineMarkdown(match[10], mine, mentionContext, k, depth + 1)}
        </mark>,
      );
    } else if (match[11] !== undefined) {
      // *italic*
      nodes.push(
        <em key={k}>{parseInlineMarkdown(match[11], mine, mentionContext, k, depth + 1)}</em>,
      );
    } else if (match[12] !== undefined) {
      // _italic_
      nodes.push(
        <em key={k}>{parseInlineMarkdown(match[12], mine, mentionContext, k, depth + 1)}</em>,
      );
    } else if (match[13] !== undefined) {
      // ^superscript^
      nodes.push(
        <sup key={k} className="md-sup">
          {match[13]}
        </sup>,
      );
    } else if (match[14] !== undefined) {
      // Auto-linked bare URL (trim trailing punctuation)
      let rawUrl = match[14];
      let trailing = "";
      while (/[.,!?;:]$/.test(rawUrl) || (rawUrl.endsWith(")") && !rawUrl.includes("("))) {
        trailing = rawUrl.slice(-1) + trailing;
        rawUrl = rawUrl.slice(0, -1);
      }
      if (isSafeLinkUrl(rawUrl)) {
        nodes.push(
          <a
            key={k}
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="md-link"
            onClick={(e) => e.stopPropagation()}
          >
            {rawUrl}
          </a>,
        );
        if (trailing) nodes.push(trailing);
      } else {
        nodes.push(match[14]);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    nodes.push(
      ...renderTextWithMentionsAndLineBreaks(
        input.slice(lastIndex),
        mine,
        mentionContext,
        `${keyPrefix}-tail`,
      ),
    );
  }

  return nodes;
}

type TableAlign = "left" | "center" | "right";

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") && !trimmed.includes("-")) return false;
  const cells = splitTableCells(trimmed);
  return cells.length >= 2 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function parseTableAlignments(line: string): TableAlign[] {
  return splitTableCells(line).map((c) => {
    if (c.startsWith(":") && c.endsWith(":")) return "center";
    if (c.endsWith(":")) return "right";
    return "left";
  });
}

interface ParsedListItem {
  indent: number;
  ordered: boolean;
  startNum?: number;
  checked?: boolean;
  content: string;
}

function parseListLine(line: string): ParsedListItem | null {
  const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
  if (!match) return null;
  const indent = match[1].replace(/\t/g, "  ").length;
  const marker = match[2];
  const ordered = /^\d/.test(marker);
  const startNum = ordered ? Number.parseInt(marker, 10) : undefined;
  let content = match[3];
  let checked: boolean | undefined;

  const taskMatch = /^\[([ xX])\]\s+(.*)$/.exec(content);
  if (taskMatch) {
    checked = taskMatch[1].toLowerCase() === "x";
    content = taskMatch[2];
  }

  return { indent, ordered, startNum, checked, content };
}

function renderListItems(
  items: ParsedListItem[],
  mine: boolean,
  mentionContext: MarkdownMentionContext | undefined,
  keyPrefix: string,
): ReactNode {
  if (items.length === 0) return null;
  const first = items[0];
  const Tag = first.ordered ? "ol" : "ul";

  const elements: ReactNode[] = [];
  let idx = 0;

  while (idx < items.length) {
    const cur = items[idx];
    const nested: ParsedListItem[] = [];
    let nextIdx = idx + 1;
    while (nextIdx < items.length && items[nextIdx].indent > cur.indent) {
      nested.push(items[nextIdx]);
      nextIdx++;
    }

    elements.push(
      <li
        key={`${keyPrefix}-li-${idx}`}
        className={cur.checked !== undefined ? "md-task-item" : undefined}
      >
        {cur.checked !== undefined && (
          <span
            className={`md-task-box ${cur.checked ? "checked" : ""}`}
            aria-hidden="true"
          >
            {cur.checked ? "✓" : ""}
          </span>
        )}
        <span className={cur.checked ? "md-task-done" : undefined}>
          {parseInlineMarkdown(
            cur.content,
            mine,
            mentionContext,
            `${keyPrefix}-lic-${idx}`,
          )}
        </span>
        {nested.length > 0 &&
          renderListItems(nested, mine, mentionContext, `${keyPrefix}-sub-${idx}`)}
      </li>,
    );

    idx = nextIdx;
  }

  return (
    <Tag
      key={keyPrefix}
      className={`md-list ${first.ordered ? "ordered" : "unordered"}`}
      {...(first.ordered && first.startNum && first.startNum !== 1
        ? { start: first.startNum }
        : {})}
    >
      {elements}
    </Tag>
  );
}

function parseBlocks(
  rawText: string,
  mine: boolean,
  mentionContext: MarkdownMentionContext | undefined,
  keyPrefix = "b",
): ReactNode[] {
  const normalized = rawText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockId = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines between blocks
    if (!line.trim()) {
      i++;
      continue;
    }

    // 1. Fenced code block: ```lang or ~~~lang
    const fenceMatch = /^(\s*)(```|~~~)([A-Za-z0-9_+-]*)\s*$/.exec(line);
    if (fenceMatch) {
      const fenceChars = fenceMatch[2];
      const lang = fenceMatch[3] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fenceChars)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push(
        <CodeBlockView
          key={`${keyPrefix}-code-${blockId++}`}
          lang={lang}
          code={codeLines.join("\n")}
        />,
      );
      continue;
    }

    // 2. Discord-style multi-line quote: >>> rest of message
    if (/^>>>\s?/.test(line)) {
      const firstLine = line.replace(/^>>>\s?/, "");
      const rest = [firstLine, ...lines.slice(i + 1)].join("\n");
      blocks.push(
        <blockquote key={`${keyPrefix}-mlq-${blockId++}`} className="md-blockquote">
          {parseBlocks(rest, mine, mentionContext, `${keyPrefix}-mlq-${blockId}`)}
        </blockquote>,
      );
      break;
    }

    // 3. Single/grouped > blockquote
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`${keyPrefix}-q-${blockId++}`} className="md-blockquote">
          {parseBlocks(
            quoteLines.join("\n"),
            mine,
            mentionContext,
            `${keyPrefix}-qi-${blockId}`,
          )}
        </blockquote>,
      );
      continue;
    }

    // 4. Headings (# .. ######)
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const content = headingMatch[2].replace(/\s+#+\s*$/, "");
      const k = `${keyPrefix}-h-${blockId++}`;
      const children = parseInlineMarkdown(content, mine, mentionContext, k);
      if (level === 1) blocks.push(<h1 key={k} className="md-h1">{children}</h1>);
      else if (level === 2) blocks.push(<h2 key={k} className="md-h2">{children}</h2>);
      else if (level === 3) blocks.push(<h3 key={k} className="md-h3">{children}</h3>);
      else if (level === 4) blocks.push(<h4 key={k} className="md-h4">{children}</h4>);
      else if (level === 5) blocks.push(<h5 key={k} className="md-h5">{children}</h5>);
      else blocks.push(<h6 key={k} className="md-h6">{children}</h6>);
      i++;
      continue;
    }

    // 5. Subtext (-# small muted text)
    const subtextMatch = /^-#\s+(.+)$/.exec(line);
    if (subtextMatch) {
      const k = `${keyPrefix}-sub-${blockId++}`;
      blocks.push(
        <p key={k} className="md-subtext">
          {parseInlineMarkdown(subtextMatch[1], mine, mentionContext, k)}
        </p>,
      );
      i++;
      continue;
    }

    // 6. Horizontal Rule (---, ***, ___)
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push(<hr key={`${keyPrefix}-hr-${blockId++}`} className="md-hr" />);
      i++;
      continue;
    }

    // 7. GFM Table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = splitTableCells(line);
      const alignments = parseTableAlignments(lines[i + 1]);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        bodyRows.push(splitTableCells(lines[i]));
        i++;
      }
      const k = `${keyPrefix}-tbl-${blockId++}`;
      blocks.push(
        <div key={k} className="md-table-wrap" onClick={(e) => e.stopPropagation()}>
          <table className="md-table">
            <thead>
              <tr>
                {headers.map((h, colIdx) => (
                  <th
                    key={colIdx}
                    style={{ textAlign: alignments[colIdx] ?? "left" }}
                  >
                    {parseInlineMarkdown(h, mine, mentionContext, `${k}-th-${colIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            {bodyRows.length > 0 && (
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {headers.map((_, colIdx) => (
                      <td
                        key={colIdx}
                        style={{ textAlign: alignments[colIdx] ?? "left" }}
                      >
                        {parseInlineMarkdown(
                          row[colIdx] ?? "",
                          mine,
                          mentionContext,
                          `${k}-td-${rIdx}-${colIdx}`,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>,
      );
      continue;
    }

    // 8. Lists (unordered, ordered, nested, task lists)
    if (parseListLine(line)) {
      const listItems: ParsedListItem[] = [];
      while (i < lines.length) {
        const parsed = parseListLine(lines[i]);
        if (!parsed) break;
        listItems.push(parsed);
        i++;
      }
      const k = `${keyPrefix}-lst-${blockId++}`;
      blocks.push(renderListItems(listItems, mine, mentionContext, k));
      continue;
    }

    // 9. Standard Paragraph (collect consecutive non-special lines)
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (
        !next.trim() ||
        /^(\s*)(```|~~~)/.test(next) ||
        /^>{1,3}\s?/.test(next) ||
        /^#{1,6}\s+/.test(next) ||
        /^-#\s+/.test(next) ||
        /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(next.trim()) ||
        Boolean(parseListLine(next)) ||
        (next.includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(next);
      i++;
    }
    const k = `${keyPrefix}-p-${blockId++}`;
    blocks.push(
      <p key={k} className="md-p">
        {parseInlineMarkdown(paraLines.join("\n"), mine, mentionContext, k)}
      </p>,
    );
  }

  return blocks;
}

export const MessageMarkdown = memo(function MessageMarkdown({
  text,
  mine = false,
  className,
  mentionContext,
}: {
  text: string;
  mine?: boolean;
  className?: string;
  mentionContext?: MarkdownMentionContext;
}) {
  const blocks = parseBlocks(text, mine, mentionContext);
  return (
    <div className={`md-body ${mine ? "mine" : "theirs"} ${className ?? ""}`}>
      {blocks}
    </div>
  );
});
