(function () {
  function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
  }

  function mdToHtml(md) {
    md = String(md).replace(/\r\n/g, "\n");

    // escape first
    let s = escapeHtml(md);

    /* ========================
     * Code blocks ``` ```
     * ======================== */
    s = s.replace(/```([\s\S]*?)```/g, (m, code) => {
      return `<pre><code>${code.replace(/^\n+|\n+$/g, "")}</code></pre>`;
    });

    /* ========================
     * Headings
     * ======================== */
    s = s.replace(/(^|\n)###\s+(.+)(?=\n|$)/g, "$1<h3>$2</h3>");
    s = s.replace(/(^|\n)##\s+(.+)(?=\n|$)/g, "$1<h2>$2</h2>");
    s = s.replace(/(^|\n)#\s+(.+)(?=\n|$)/g, "$1<h1>$2</h1>");

    /* ========================
     * Horizontal rule ---
     * ======================== */
    s = s.replace(/(^|\n)---(?=\n|$)/g, "$1<hr/>");

    /* ========================
     * Blockquote (multi-line)
     * ======================== */
    s = s.replace(/((^|\n)&gt;.+)+/g, block => {
      const content = block
          .replace(/(^|\n)&gt;\s?/g, "$1")
          .trim();
      return `<blockquote>${content}</blockquote>`;
    });

    /* ========================
     * Lists
     * ======================== */
    // unordered list
    s = s.replace(/((^|\n)[*-]\s+.+)+/g, block => {
      const items = block
          .trim()
          .split(/\n/)
          .map(i => `<li>${i.replace(/^[*-]\s+/, "")}</li>`)
          .join("");
      return `<ul>${items}</ul>`;
    });

    // ordered list
    s = s.replace(/((^|\n)\d+\.\s+.+)+/g, block => {
      const items = block
          .trim()
          .split(/\n/)
          .map(i => `<li>${i.replace(/^\d+\.\s+/, "")}</li>`)
          .join("");
      return `<ol>${items}</ol>`;
    });

    /* ========================
     * Inline code
     * ======================== */
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

    /* ========================
     * Bold / Italic
     * ======================== */
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

    /* ========================
     * Images
     * ======================== */
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
        `<img src="$2" alt="$1"/>`
    );

    /* ========================
     * Links
     * ======================== */
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        `<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`
    );

    /* ========================
     * Paragraphs
     * ======================== */
    const blocks = s.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    return blocks.map(b => {
      if (/^<(h\d|pre|ul|ol|blockquote|hr|img)/.test(b)) return b;
      return `<p>${b.replace(/\n/g, "<br/>")}</p>`;
    }).join("\n");
  }

  window.mdToHtml = mdToHtml;
})();
