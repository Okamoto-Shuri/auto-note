import test from "node:test";
import assert from "node:assert/strict";
import { checkArticle, countText } from "../scripts/check_article.mjs";

function fixture() {
  const title = "あ".repeat(28);
  const chapters = Array.from({ length: 5 }, (_, i) => `## 本論${i}\n\n### 理由\n\n${"文".repeat(350)}\n\n### 適用\n\n${"文".repeat(350)}\n`).join("\n");
  const faqs = Array.from({ length: 4 }, (_, i) => ({ name: `質問${i}`, acceptedAnswer: { "@type": "Answer", text: "答".repeat(90) }, "@type": "Question" }));
  const faq = faqs.map((q) => `### ${q.name}\n\n${q.acceptedAnswer.text}`).join("\n\n");
  const markdown = `---\ntitle: "${title}"\nstatus: draft\n---\n\n${"導".repeat(130)}\n\n${"入".repeat(400)}\n\n<toc>\n\n${chapters}\n## よくある質問\n\n${faq}\n\n## まとめ\n\n${"結".repeat(100)}\n`;
  const brief = `### タイトル候補\n${Array.from({ length: 10 }, (_, i) => `${i + 1}. ${title}｜5/5/5/5=20｜理由`).join("\n")}\n### メタ候補\n${Array.from({ length: 3 }, () => "- " + "説".repeat(130)).join("\n")}\n### 章配分\n${[...Array.from({ length: 5 }, (_, i) => `本論${i}`), "よくある質問", "まとめ"].map((h) => `- ${h}｜700`).join("\n")}\nFAQ数: 4\n\n\`\`\`json\n${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs })}\n\`\`\`\n## Phase 7：監査\n反映済み\n`;
  return { markdown, brief };
}

test("counting excludes syntax/URLs but retains Unicode characters, spaces and code", () => {
  assert.equal(countText("## 見出し\n\n[本文](https://long.example/) **強調**\n- 😀\n<toc>"), 9);
  assert.equal(countText("```js\nconst x = 1;\n```"), 12);
  assert.equal(countText("![説明](images/a.png)"), 2);
});

test("a complete article checks cleanly, including FAQ/brief consistency", () => {
  const { markdown, brief } = fixture();
  const result = checkArticle(markdown, brief);
  assert.deepEqual(result.errors, []);
  assert.equal(result.metrics.auditRecorded, true);
  assert.equal(result.metrics.mainH2, 5);
  assert.equal(result.metrics.faqCount, 4);
});

test("one pass reports short title, stale FAQ count, tags and mismatched JSON-LD", () => {
  let { markdown, brief } = fixture();
  markdown = markdown.replace('title: "' + "あ".repeat(28), 'title: "短').replace("<toc>", "<toc>\n[要確認：日付]");
  brief = brief.replace("FAQ数: 4", "FAQ数: 5").replace('"name":"質問0"', '"name":"別の質問"');
  const codes = checkArticle(markdown, brief).errors.map((e) => e.code);
  for (const c of ["title_length", "selected_title", "unresolved_tags", "faq_record", "json_ld_faq"]) assert.ok(codes.includes(c), c);
});

test("headings in code do not change structure; code remains part of body length", () => {
  const { markdown, brief } = fixture();
  const original = checkArticle(markdown, brief);
  const changed = checkArticle(markdown.replace("## 本論1", "```\n## 偽の見出し\n```\n\n## 本論1"), brief);
  assert.equal(changed.metrics.mainH2, 5);
  assert.equal(changed.metrics.bodyChars - original.metrics.bodyChars, countText("```\n## 偽の見出し\n```"));
});

test("audit marker in another section does not count", () => {
  const { markdown, brief } = fixture();
  const result = checkArticle(markdown, brief.replace("反映済み", "未実施\n## 別の章\n反映済み"));
  assert.equal(result.metrics.auditRecorded, false);
});

test("headings require blank source lines on both sides", () => {
  const { markdown, brief } = fixture();
  const crowded = markdown.replace("## 本論1\n\n### 理由", "## 本論1\n### 理由");
  const codes = checkArticle(crowded, brief).errors.map((e) => e.code);

  assert.ok(codes.includes("heading_spacing"));
});
