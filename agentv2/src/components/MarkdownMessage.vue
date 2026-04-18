<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ content: string }>();

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInline(value: string) {
  const codeSegments: string[] = [];
  const withCodeMarkers = value.replace(/`([^`]+)`/g, (_, code: string) => {
    const token = `@@CODE_${codeSegments.length}@@`;
    codeSegments.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  let html = escapeHtml(withCodeMarkers)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, url: string) =>
      `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/@@CODE_(\d+)@@/g, (_match, index: string) => codeSegments[Number(index)] ?? "");

  return html;
}

function renderMarkdown(input: string) {
  const lines = input.replaceAll("\r\n", "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let quoteLines: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage = "";
  let inCode = false;
  let tableRows: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${formatInline(paragraph.join(" ").trim())}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0 || !listType) return;
    blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listItems = [];
    listType = null;
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    blocks.push(`<blockquote><p>${formatInline(quoteLines.join(" ").trim())}</p></blockquote>`);
    quoteLines = [];
  };

  const flushCode = () => {
    if (!inCode) return;
    blocks.push(
      `<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    );
    codeLines = [];
    codeLanguage = "";
    inCode = false;
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const parseRow = (row: string) => row.split("|").slice(1, -1).map((cell) => cell.trim());
    const isSepRow = (row: string) => parseRow(row).every((cell) => /^:?-+:?$/.test(cell));
    if (tableRows.length < 2 || !isSepRow(tableRows[1])) {
      for (const row of tableRows) paragraph.push(row);
      tableRows = [];
      return;
    }
    const headerCells = parseRow(tableRows[0]);
    const dataRows = tableRows.slice(2);
    const thead = `<thead><tr>${headerCells.map((c) => `<th>${formatInline(c)}</th>`).join("")}</tr></thead>`;
    const tbody =
      dataRows.length > 0
        ? `<tbody>${dataRows.map((row) => `<tr>${parseRow(row).map((c) => `<td>${formatInline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`
        : "";
    blocks.push(`<div class="md-table-wrap"><table>${thead}${tbody}</table></div>`);
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
      } else {
        flushParagraph();
        flushList();
        flushQuote();
        flushTable();
        inCode = true;
        codeLanguage = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      const level = heading[1].length;
      blocks.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      flushTable();
      quoteLines.push(quote[1]);
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.*)$/);
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      flushQuote();
      flushTable();
      const type = ordered ? "ol" : "ul";
      if (listType && listType !== type) flushList();
      listType = type;
      const content = (bullet ?? ordered)?.[1] ?? "";
      listItems.push(`<li>${formatInline(content)}</li>`);
      continue;
    }

    if (/^\|.+\|$/.test(line.trim())) {
      flushParagraph();
      flushList();
      flushQuote();
      tableRows.push(line.trim());
      continue;
    }

    flushTable();
    flushList();
    flushQuote();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushCode();
  flushTable();

  return blocks.join("");
}

const html = computed(() => renderMarkdown(props.content || ""));
</script>

<template>
  <div class="markdown-content" v-html="html"></div>
</template>
