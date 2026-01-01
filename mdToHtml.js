(function () {
  "use strict";

  /**
   * mdToHtml.js
   * A modern Markdown -> HTML renderer with progressive enhancement.
   *
   * - If `markdown-it` is present (recommended), this file will use it to render
   *   CommonMark-compliant Markdown plus popular extensions (GFM-ish).
   * - If `markdown-it` is NOT present, it falls back to a lightweight built-in parser
   *   that supports most day-to-day Markdown features (headings, lists, tables, code,
   *   blockquotes, emphasis, links/images, task lists, strikethrough, autolinks, etc.).
   *
   * SECURITY NOTE:
   * - By default, raw HTML inside Markdown is NOT rendered (safe-by-default).
   * - You may enable it via options: { allowHtml: true } (only if you trust the Markdown).
   *
   * Usage (recommended, full feature):
   *   <script src="https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js"></script>
   *   <script src="mdToHtml.js"></script>
   *   const html = window.mdToHtml(markdownText, { allowHtml: false });
   *
   * Usage (fallback):
   *   <script src="mdToHtml.js"></script>
   *   const html = window.mdToHtml(markdownText);
   */

  /* =========================================================
   * Utilities
   * ========================================================= */

  function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
  }

  function unescapeHtml(str) {
    // Only used internally for safe slices; not intended as a general decoder.
    return String(str)
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
  }

  function normalizeNewlines(md) {
    return String(md == null ? "" : md).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function isAbsoluteUrl(url) {
    return /^(https?:\/\/|mailto:|tel:)/i.test(url);
  }

  function escapeAttr(str) {
    // Escape attribute values (safe for quotes)
    return escapeHtml(str).replace(/`/g, "&#96;");
  }

  function safeLinkHref(href, allowUnsafeLinks) {
    const h = String(href || "").trim();
    if (!h) return "";
    if (allowUnsafeLinks) return h;

    // Disallow javascript:, data: (except images maybe), vbscript:
    // Allow: http(s), mailto, tel, relative, hash.
    const lower = h.toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) return "";
    if (lower.startsWith("data:")) return ""; // safest default
    return h;
  }

  function addRelTargetToLinks(html, opts) {
    // Best-effort: rewrite <a ...> tags to include rel/target if desired.
    if (!opts || !opts.linkTargetBlank) return html;
    return html.replace(/<a\b([^>]*?)>/gi, function (m, attrs) {
      // If target already set, keep it; else set.
      let a = attrs;
      if (!/\btarget\s*=\s*["'][^"']*["']/i.test(a)) {
        a += ' target="_blank"';
      }
      // Ensure rel contains noopener noreferrer
      const relMatch = a.match(/\brel\s*=\s*["']([^"']*)["']/i);
      if (relMatch) {
        const relVal = relMatch[1];
        const parts = relVal.split(/\s+/).filter(Boolean);
        if (parts.indexOf("noopener") === -1) parts.push("noopener");
        if (parts.indexOf("noreferrer") === -1) parts.push("noreferrer");
        const newRel = parts.join(" ");
        a = a.replace(relMatch[0], 'rel="' + escapeAttr(newRel) + '"');
      } else {
        a += ' rel="noopener noreferrer"';
      }
      return "<a" + a + ">";
    });
  }

  /* =========================================================
   * Preferred renderer: markdown-it (if present)
   * ========================================================= */

  function renderWithMarkdownIt(md, options) {
    const opts = options || {};
    const mdItFactory = (typeof window !== "undefined" ? window.markdownit : undefined) ||
        (typeof markdownit !== "undefined" ? markdownit : undefined);

    if (!mdItFactory) return null;

    const allowHtml = !!opts.allowHtml;
    const linkify = (opts.linkify !== false); // default true
    const typographer = !!opts.typographer;

    // Create instance
    const mdIt = mdItFactory({
      html: allowHtml,
      linkify: linkify,
      typographer: typographer,
      breaks: !!opts.breaks,   // treat \n as <br>
    });

    // Enable CommonMark features + GFM-ish additions
    // markdown-it already supports: headings, lists, blockquotes, code, emphasis,
    // links/images, autolinks, tables (basic), strikethrough (via core rule), etc.
    // But strikethrough is not enabled by default on some builds; explicitly enable.
    if (typeof mdIt.enable === "function") {
      mdIt.enable(["table", "strikethrough"]);
    }

    // Plugins (optional): if you include them on the page they will be used automatically.
    // This keeps mdToHtml.js dependency-free while allowing full modern MD support.
    const maybeUse = (globalName, pluginFnName) => {
      const g = (typeof window !== "undefined" ? window[globalName] : undefined);
      if (typeof g === "function") {
        try { mdIt.use(g); } catch (e) { /* ignore */ }
        return true;
      }
      // Some plugins export object with default
      if (g && typeof g.default === "function") {
        try { mdIt.use(g.default); } catch (e) { /* ignore */ }
        return true;
      }
      // Alternative: plugin attached under a name
      if (g && pluginFnName && typeof g[pluginFnName] === "function") {
        try { mdIt.use(g[pluginFnName]); } catch (e) { /* ignore */ }
        return true;
      }
      return false;
    };

    // Common useful plugins (load them if present):
    // - markdown-it-footnote, markdown-it-task-lists, markdown-it-deflist,
    // - markdown-it-sub, markdown-it-sup, markdown-it-mark, markdown-it-abbr,
    // - markdown-it-attrs, markdown-it-container
    maybeUse("markdownitFootnote");
    maybeUse("markdownitTaskLists");
    maybeUse("markdownitDeflist");
    maybeUse("markdownitSub");
    maybeUse("markdownitSup");
    maybeUse("markdownitMark");
    maybeUse("markdownitAbbr");
    maybeUse("markdownitAttrs");
    maybeUse("markdownitContainer");

    // Safe link policy: validate hrefs (prevent javascript:)
    // Override link_open renderer rule.
    if (!opts.allowUnsafeLinks) {
      const defaultRender = mdIt.renderer.rules.link_open || function (tokens, idx, _o, _e, self) {
        return self.renderToken(tokens, idx, _o);
      };
      mdIt.renderer.rules.link_open = function (tokens, idx, _o, env, self) {
        const token = tokens[idx];
        const hrefIdx = token.attrIndex("href");
        if (hrefIdx >= 0) {
          const href = token.attrs[hrefIdx][1];
          const safe = safeLinkHref(href, false);
          token.attrs[hrefIdx][1] = safe || "#";
        }
        return defaultRender(tokens, idx, _o, env, self);
      };
    }

    let html = mdIt.render(normalizeNewlines(md));
    html = addRelTargetToLinks(html, { linkTargetBlank: opts.linkTargetBlank !== false });
    return html;
  }

  /* =========================================================
   * Fallback renderer: lightweight parser (no deps)
   * ========================================================= */

  function splitLines(md) {
    return normalizeNewlines(md).split("\n");
  }

  function parseFence(line) {
    // ```lang or ~~~lang
    const m = line.match(/^(\s*)(```|~~~)\s*([A-Za-z0-9_-]+)?\s*$/);
    if (!m) return null;
    return { indent: m[1].length, marker: m[2], lang: m[3] || "" };
  }

  function isThematicBreak(line) {
    const t = line.trim();
    // CommonMark: 3+ of *, -, _ with spaces allowed
    return /^(\*\s*){3,}$/.test(t) || /^(-\s*){3,}$/.test(t) || /^(_\s*){3,}$/.test(t);
  }

  function parseAtxHeading(line) {
    // # Heading ### (closing #'s allowed)
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) return null;
    return { level: m[1].length, text: m[2] };
  }

  function parseSetextHeading(lines, i) {
    // Heading\n----- or =====
    if (i + 1 >= lines.length) return null;
    const l1 = lines[i];
    const l2 = lines[i + 1];
    if (!l1.trim()) return null;
    const t = l2.trim();
    if (!/^=+$/.test(t) && !/^-+$/.test(t)) return null;
    return { level: /^=+$/.test(t) ? 1 : 2, text: l1.trim(), nextIndex: i + 2 };
  }

  function parseBlockquote(lines, i) {
    if (!/^\s*>/.test(lines[i])) return null;
    const buf = [];
    let j = i;
    while (j < lines.length) {
      const line = lines[j];
      if (!/^\s*>/.test(line)) break;
      buf.push(line.replace(/^\s*>\s?/, ""));
      j++;
    }
    return { type: "blockquote", lines: buf, nextIndex: j };
  }

  function parseList(lines, i) {
    // Supports basic nesting using indentation (best effort)
    const start = lines[i];
    const u = start.match(/^(\s*)([-+*])\s+(.+)$/);
    const o = start.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
    if (!u && !o) return null;

    const isOrdered = !!o;
    const indent0 = (u ? u[1].length : o[1].length);
    const items = [];

    let j = i;
    while (j < lines.length) {
      const line = lines[j];
      if (!line.trim()) break;

      const mu = line.match(/^(\s*)([-+*])\s+(.+)$/);
      const mo = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);

      if (isOrdered) {
        if (!mo) break;
        const ind = mo[1].length;
        if (ind !== indent0) break;
        items.push(mo[3]);
      } else {
        if (!mu) break;
        const ind = mu[1].length;
        if (ind !== indent0) break;
        items.push(mu[3]);
      }
      j++;
    }

    return { type: "list", ordered: isOrdered, items: items, nextIndex: j };
  }

  function parseTable(lines, i) {
    // GitHub-style pipe table:
    // | a | b |
    // |---|---|
    // | 1 | 2 |
    const headerLine = lines[i];
    const sepLine = (i + 1 < lines.length) ? lines[i + 1] : "";
    if (!headerLine.includes("|")) return null;
    const sep = sepLine.trim();
    if (!/^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(sep)) return null;

    const parseRow = (row) => {
      let r = row.trim();
      if (r.startsWith("|")) r = r.slice(1);
      if (r.endsWith("|")) r = r.slice(0, -1);
      return r.split("|").map(c => c.trim());
    };

    const headers = parseRow(headerLine);
    const aligns = parseRow(sepLine).map(c => {
      const t = c.trim();
      const left = t.startsWith(":");
      const right = t.endsWith(":");
      if (left && right) return "center";
      if (right) return "right";
      if (left) return "left";
      return "";
    });

    const rows = [];
    let j = i + 2;
    while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
      rows.push(parseRow(lines[j]));
      j++;
    }

    return { type: "table", headers, aligns, rows, nextIndex: j };
  }

  function parseIndentedCode(lines, i) {
    // 4-space indented code block
    if (!/^( {4,}|\t)/.test(lines[i])) return null;
    const buf = [];
    let j = i;
    while (j < lines.length) {
      const line = lines[j];
      if (!/^( {4,}|\t)/.test(line) && line.trim()) break;
      if (!line.trim() && buf.length === 0) { j++; continue; } // leading blanks
      buf.push(line.replace(/^( {4}|\t)/, ""));
      j++;
    }
    return { type: "code", lang: "", content: buf.join("\n"), nextIndex: j };
  }

  function parseParagraph(lines, i) {
    const buf = [];
    let j = i;
    while (j < lines.length) {
      const line = lines[j];
      if (!line.trim()) break;

      // Stop if starts a block element
      if (parseFence(line) || parseAtxHeading(line) || isThematicBreak(line)) break;
      if (/^\s*>/.test(line)) break;
      if (/^(\s*)([-+*])\s+/.test(line)) break;
      if (/^(\s*)(\d+)[.)]\s+/.test(line)) break;
      if (parseTable(lines, j)) break;
      if (/^( {4,}|\t)/.test(line)) break;

      buf.push(line);
      j++;
    }
    return { type: "paragraph", lines: buf, nextIndex: j };
  }

  function renderInline(text, opts) {
    // Inline rendering runs on escaped HTML (safe-by-default).
    // If allowHtml, we let raw HTML pass through by not escaping those segments; but
    // fallback parser can't fully parse raw HTML, so we still keep it safe by default.
    const options = opts || {};
    let s = escapeHtml(text);

    // Inline code: `code`
    s = s.replace(/(^|[^`])`([^`]+)`(?!`)/g, function (m, p1, code) {
      return p1 + "<code>" + code + "</code>";
    });

    // Images: ![alt](url "title")
    s = s.replace(/!\[([^\]]*)\]\((\s*[^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, function (_m, alt, url, title) {
      const href = safeLinkHref(unescapeHtml(url), !!options.allowUnsafeLinks);
      if (!href) return "";
      const t = title ? ' title="' + escapeAttr(title) + '"' : "";
      return '<img src="' + escapeAttr(href) + '" alt="' + escapeAttr(alt) + '"' + t + '/>';
    });

    // Links: [text](url "title")
    s = s.replace(/\[([^\]]+)\]\((\s*[^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, function (_m, label, url, title) {
      const href = safeLinkHref(unescapeHtml(url), !!options.allowUnsafeLinks);
      const safe = href || "#";
      const t = title ? ' title="' + escapeAttr(title) + '"' : "";
      const target = (options.linkTargetBlank !== false) ? ' target="_blank" rel="noopener noreferrer"' : "";
      return '<a href="' + escapeAttr(safe) + '"' + t + target + ">" + label + "</a>";
    });

    // Autolinks: <http://...> <mailto:...>
    s = s.replace(/&lt;((https?:\/\/|mailto:)[^&\s]+)&gt;/gi, function (_m, url) {
      const href = safeLinkHref(unescapeHtml(url), !!options.allowUnsafeLinks) || "#";
      const target = (options.linkTargetBlank !== false) ? ' target="_blank" rel="noopener noreferrer"' : "";
      return '<a href="' + escapeAttr(href) + '"' + target + ">" + url + "</a>";
    });

    // Bare URLs (very common): https://... (avoid inside existing tags)
    s = s.replace(/(^|[\s(])((https?:\/\/)[^\s<]+)/g, function (_m, p1, url) {
      const href = safeLinkHref(unescapeHtml(url), !!options.allowUnsafeLinks);
      if (!href) return p1 + url;
      const target = (options.linkTargetBlank !== false) ? ' target="_blank" rel="noopener noreferrer"' : "";
      return p1 + '<a href="' + escapeAttr(href) + '"' + target + ">" + url + "</a>";
    });

    // Strikethrough: ~~text~~
    s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

    // Bold: **text** or __text__
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([\s\S]+?)__/g, "<strong>$1</strong>");

    // Italic: *text* or _text_ (best-effort, avoids breaking strong)
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");

    return s;
  }

  function renderBlock(block, opts) {
    const options = opts || {};

    switch (block.type) {
      case "heading":
        return "<h" + block.level + ">" + renderInline(block.text, options) + "</h" + block.level + ">";
      case "hr":
        return "<hr/>";
      case "code": {
        const cls = block.lang ? ' class="language-' + escapeAttr(block.lang) + '"' : "";
        return "<pre><code" + cls + ">" + escapeHtml(block.content) + "</code></pre>";
      }
      case "blockquote": {
        const inner = fallbackMdToHtml(block.lines.join("\n"), options);
        return "<blockquote>" + inner + "</blockquote>";
      }
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const items = block.items.map(it => {
          // task list
          const m = it.match(/^\[( |x|X)\]\s+(.*)$/);
          if (m) {
            const checked = (m[1].toLowerCase() === "x");
            const cb = '<input type="checkbox" disabled' + (checked ? " checked" : "") + "/> ";
            return "<li class=\"task-list-item\">" + cb + renderInline(m[2], options) + "</li>";
          }
          return "<li>" + renderInline(it, options) + "</li>";
        }).join("");
        const cls = (!block.ordered) ? "" : "";
        return "<" + tag + (cls ? " class=\"" + cls + "\"" : "") + ">" + items + "</" + tag + ">";
      }
      case "table": {
        const ths = block.headers.map((h, idx) => {
          const align = block.aligns[idx] ? ' style="text-align:' + block.aligns[idx] + ';"' : "";
          return "<th" + align + ">" + renderInline(h, options) + "</th>";
        }).join("");
        const trs = block.rows.map(r => {
          const tds = r.map((c, idx) => {
            const align = block.aligns[idx] ? ' style="text-align:' + block.aligns[idx] + ';"' : "";
            return "<td" + align + ">" + renderInline(c, options) + "</td>";
          }).join("");
          return "<tr>" + tds + "</tr>";
        }).join("");
        return "<table><thead><tr>" + ths + "</tr></thead><tbody>" + trs + "</tbody></table>";
      }
      case "paragraph":
        return "<p>" + renderInline(block.lines.join("\n"), options).replace(/\n/g, "<br/>") + "</p>";
      default:
        return "";
    }
  }

  function fallbackMdToHtml(md, options) {
    const opts = options || {};
    const lines = splitLines(md);

    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) { i++; continue; }

      // Fenced code blocks
      const fence = parseFence(line);
      if (fence) {
        const buf = [];
        let j = i + 1;
        while (j < lines.length) {
          const l = lines[j];
          const end = l.match(new RegExp("^\\s*" + fence.marker.replace(/`/g, "\\`") + "\\s*$"));
          if (end) break;
          buf.push(l);
          j++;
        }
        blocks.push({ type: "code", lang: fence.lang, content: buf.join("\n") });
        i = (j < lines.length) ? (j + 1) : j;
        continue;
      }

      // Indented code blocks
      const indCode = parseIndentedCode(lines, i);
      if (indCode) {
        blocks.push(indCode);
        i = indCode.nextIndex;
        continue;
      }

      // Setext headings
      const setext = parseSetextHeading(lines, i);
      if (setext) {
        blocks.push({ type: "heading", level: setext.level, text: setext.text });
        i = setext.nextIndex;
        continue;
      }

      // ATX headings
      const atx = parseAtxHeading(line);
      if (atx) {
        blocks.push({ type: "heading", level: atx.level, text: atx.text });
        i++;
        continue;
      }

      // HR
      if (isThematicBreak(line)) {
        blocks.push({ type: "hr" });
        i++;
        continue;
      }

      // Blockquote
      const bq = parseBlockquote(lines, i);
      if (bq) {
        blocks.push({ type: "blockquote", lines: bq.lines });
        i = bq.nextIndex;
        continue;
      }

      // Table
      const tbl = parseTable(lines, i);
      if (tbl) {
        blocks.push(tbl);
        i = tbl.nextIndex;
        continue;
      }

      // List
      const lst = parseList(lines, i);
      if (lst) {
        blocks.push(lst);
        i = lst.nextIndex;
        continue;
      }

      // Paragraph
      const p = parseParagraph(lines, i);
      if (p) {
        blocks.push(p);
        i = p.nextIndex;
        continue;
      }

      // Fallback single line paragraph
      blocks.push({ type: "paragraph", lines: [line] });
      i++;
    }

    // Render blocks
    return blocks.map(b => renderBlock(b, opts)).join("\n");
  }

  /* =========================================================
   * Public API
   * ========================================================= */

  function mdToHtml(md, options) {
    const opts = options || {};
    // Try markdown-it first
    const html = renderWithMarkdownIt(md, opts);
    if (html != null) return html;

    // Fallback
    return fallbackMdToHtml(md, opts);
  }

  // Expose
  if (typeof window !== "undefined") {
    window.mdToHtml = mdToHtml;
    window._mdToHtmlFallback = fallbackMdToHtml; // for debugging
  } else if (typeof globalThis !== "undefined") {
    globalThis.mdToHtml = mdToHtml;
    globalThis._mdToHtmlFallback = fallbackMdToHtml;
  }
})();