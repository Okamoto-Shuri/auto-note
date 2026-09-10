import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArticle, checkBodyImageFiles, countText } from "../scripts/check_article.mjs";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function fixture() {
  const titles = Array.from({ length: 10 }, (_, i) => "あ".repeat(27) + String.fromCodePoint(0x2460 + i));
  const title = titles[0];
  const titleTypes = ["理論反証", "逆説", "前提反転", "因果反転", "理論反証", "逆説", "前提反転", "因果反転", "直球", "直球"];
  const chapters = Array.from({ length: 5 }, (_, i) => `## 本論${i}\n\n### 理由\n\n${"文".repeat(350)}\n\n${i < 2 ? `![本論${i}の関係を示す図](images/body-${i}.png)\n\n` : ""}### 適用\n\n${"文".repeat(350)}\n`).join("\n");
  const faqs = Array.from({ length: 4 }, (_, i) => ({ name: `質問${i}`, acceptedAnswer: { "@type": "Answer", text: "答".repeat(90) }, "@type": "Question" }));
  const faq = faqs.map((q) => `### ${q.name}\n\n${q.acceptedAnswer.text}`).join("\n\n");
  const markdown = `---\ntitle: "${title}"\nstatus: draft\n---\n\n${"導".repeat(130)}\n\n${"入".repeat(400)}\n\n<toc>\n\n${chapters}\n## よくある質問\n\n${faq}\n\n## まとめ\n\n${"結".repeat(100)}\n`;
  const brief = `### タイトル候補\n${titles.map((candidate, i) => `${i + 1}. ${candidate}｜型:${titleTypes[i]}｜5/5/5/5/5=25｜回収:本論${i % 5}｜理由`).join("\n")}\n### メタ候補\n${Array.from({ length: 3 }, () => "- " + "説".repeat(130)).join("\n")}\n### 章配分\n${[...Array.from({ length: 5 }, (_, i) => `本論${i}`), "よくある質問", "まとめ"].map((h) => `- ${h}｜700`).join("\n")}\nFAQ数: 4\n\n\`\`\`json\n${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs })}\n\`\`\`\n## Phase 7：監査\n反映済み\n`;
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
  assert.equal(result.metrics.bodyImageCount, 2);
});

test("body images require two or three distinct local references with alt text", () => {
  const { markdown, brief } = fixture();
  const oneImage = markdown.replace("![本論1の関係を示す図](images/body-1.png)\n\n", "");
  assert.ok(checkArticle(oneImage, brief).errors.some((error) => error.code === "body_image_count"));

  const duplicate = markdown.replace("images/body-1.png", "images/body-0.png");
  assert.ok(checkArticle(duplicate, brief).errors.some((error) => error.code === "body_image_duplicate"));

  const emptyAlt = markdown.replace("![本論0の関係を示す図]", "![]");
  assert.ok(checkArticle(emptyAlt, brief).errors.some((error) => error.code === "body_image_alt"));

  const remote = markdown.replace("images/body-0.png", "https://example.com/body.png");
  assert.ok(checkArticle(remote, brief).errors.some((error) => error.code === "body_image_remote"));
});

test("body image file checks reject missing files and paths outside drafts", async (t) => {
  const root = await mkdtemp(join(PROJECT_ROOT, "articles/drafts/.test-body-files-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const articlePath = join(root, "article.md");
  const existingPath = join(root, "existing.png");
  await writeFile(articlePath, "fixture");
  await writeFile(existingPath, "image");

  const errors = await checkBodyImageFiles(articlePath,
    "![存在](existing.png)\n\n![不足](missing.png)\n\n![範囲外](../../../README.md)");
  const codes = errors.map((error) => error.code);
  assert.ok(codes.includes("body_image_missing"));
  assert.ok(codes.includes("body_image_path"));
  assert.ok(codes.includes("body_image_format"));
});

test("one pass reports short title, stale FAQ count, tags and mismatched JSON-LD", () => {
  let { markdown, brief } = fixture();
  markdown = markdown.replace(/^title: .*$/m, 'title: "短"').replace("<toc>", "<toc>\n[要確認：日付]");
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

test("title candidates require contrarian variety, five-axis scores and real recovery headings", () => {
  const { markdown, brief } = fixture();
  const invalidBrief = brief
    .replace(/型:理論反証/g, "型:直球")
    .replace(/型:逆説/g, "型:直球")
    .replace("5/5/5/5/5=25", "5/5/5/5=20")
    .replace("回収:本論4", "回収:存在しない見出し");
  const codes = checkArticle(markdown, invalidBrief).errors.map((error) => error.code);

  for (const code of ["title_theory_hooks", "title_paradox_hooks", "title_direct_limit", "selected_title_hook", "title_score", "title_recovery"]) {
    assert.ok(codes.includes(code), code);
  }
});
