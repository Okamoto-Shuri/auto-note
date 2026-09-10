import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ARTICLE_DRAFTS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../articles/drafts");

// Matches the supported note Markdown subset, not arbitrary CommonMark extensions.
export function visibleText(markdown) {
  let inCode = false;
  return markdown.replace(/\r\n/g, "\n").split("\n").map((line) => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return ""; }
    if (inCode) return line;
    if (/^\s*(?:<toc>|<pay>|---+|\*\*\*+)\s*$/i.test(line)) return "";
    return line.trim()
      .replace(/^#{1,6}\s+/, "").replace(/^>\s?/, "").replace(/^(?:[-*]|\d+\.)\s+/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/~~(.*?)~~/g, "$1")
      .replace(/<[^>]*>/g, "");
  }).join("");
}

export const countText = (markdown) => [...visibleText(markdown)].length;

function withoutCode(markdown) {
  let inCode = false;
  return markdown.split("\n").map((line) => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return " ".repeat(line.length); }
    return inCode ? " ".repeat(line.length) : line;
  }).join("\n");
}

export function extractBodyImages(markdown) {
  return [...withoutCode(markdown).matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((match) => ({
    alt: match[1].trim(),
    path: match[2].trim(),
  }));
}

function sections(markdown, level) {
  const re = new RegExp(`^${"#".repeat(level)} (.+)$`, "gm");
  const headings = [...withoutCode(markdown).matchAll(re)];
  return headings.map((h, i) => ({
    title: h[1].trim(),
    content: markdown.slice(h.index + h[0].length, headings[i + 1]?.index ?? markdown.length).trim(),
    full: markdown.slice(h.index, headings[i + 1]?.index ?? markdown.length),
  }));
}

function briefSection(brief, name) {
  const lines = brief.split("\n");
  const start = lines.findIndex((l) => l.trim() === `### ${name}`);
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,3} /.test(l));
  return rest.slice(0, end < 0 ? rest.length : end).join("\n");
}

export function checkArticle(markdown, brief = "") {
  const errors = [];
  const add = (code, message) => errors.push({ code, message });
  const range = (code, value, min, max) => {
    if (value < min || value > max) add(code, `${value}字/件（規定 ${min}〜${max}）`);
  };
  const fm = markdown.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fm) return { ok: false, errors: [{ code: "frontmatter", message: "frontmatterが必要です" }] };
  const title = (fm[1].match(/^title:\s*(.*?)\s*$/m)?.[1] || "").replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  if (!/^status:\s*["']?draft["']?\s*$/m.test(fm[1])) add("status", "statusはdraftが必要です");
  const body = fm[2].trim();
  const structure = withoutCode(body);
  const h2 = sections(structure, 2);
  if (new Set(h2.map((s) => s.title)).size !== h2.length) add("duplicate_heading", "同じH2見出しが重複しています");
  const main = h2.filter((s) => !["よくある質問", "まとめ"].includes(s.title));
  const faqSections = h2.filter((s) => s.title === "よくある質問");
  const faq = sections(faqSections[0]?.content ?? "", 3);
  const firstH2 = withoutCode(body).search(/^## /m);
  const tocLines = structure.split("\n").filter((line) => /<\/?toc>|<toc_line>/i.test(line));
  const tocIndex = structure.search(/^<toc>\s*$/m);
  const introBlock = body.slice(0, firstH2 < 0 ? body.length : firstH2).replace(/^<toc>\s*$/gm, "").trim();
  const paragraphs = introBlock.split(/\n\s*\n/);
  const lead = countText(paragraphs[0] || "");
  const intro = countText(paragraphs.slice(1).join("\n\n"));
  const tags = [...body.matchAll(/\[(要データ|要確認|要出典)(?:[：:][^\]]*)?\]/g)].map((m) => m[0]);
  const bodyImages = extractBodyImages(body);
  range("body_length", countText(body), 4000, 6000);
  range("title_length", [...title].length, 28, 32);
  range("lead_length", lead, 120, 160);
  range("intro_length", intro, 350, 450);
  range("main_h2", main.length, 5, 7);
  range("faq_count", faq.length, 4, 6);
  range("body_image_count", bodyImages.length, 2, 3);
  if (tocLines.length !== 1 || tocLines[0].trim() !== "<toc>") {
    add("toc_tag", "<toc>は単独行で1回だけ必要です");
  } else {
    const beforeFirstH2 = firstH2 < 0 ? "" : structure.slice(0, firstH2).trim();
    if (tocIndex < 0 || firstH2 < 0 || !/<toc>$/.test(beforeFirstH2)) {
      add("toc_position", "<toc>は導入の後、最初のH2の直前に置いてください");
    }
  }
  if (bodyImages.some((image) => !image.alt)) add("body_image_alt", "本文画像には空でないaltが必要です");
  if (bodyImages.some((image) => /^(https?:|data:)/i.test(image.path))) add("body_image_remote", "本文画像はdrafts内のローカルファイルを参照してください");
  if (new Set(bodyImages.map((image) => image.path)).size !== bodyImages.length) add("body_image_duplicate", "本文画像は異なるファイルを2〜3枚使ってください");
  if (faqSections.length !== 1) add("faq_section", "よくある質問のH2は1つ必要です");
  if (tags.length) add("unresolved_tags", tags.join("、"));
  if (/^#{1}(?: |$)|^#{4,}\s/m.test(structure)) add("heading_level", "見出しはH2/H3までです");
  const structureLines = structure.split("\n");
  const crowdedHeading = structureLines.findIndex((line, i) => /^#{2,3} /.test(line) &&
    ((i > 0 && structureLines[i - 1].trim() !== "") ||
      (i + 1 < structureLines.length && structureLines[i + 1].trim() !== "")));
  if (crowdedHeading >= 0) add("heading_spacing", `${crowdedHeading + 1}行目の見出し前後に空行が必要です`);
  if (/^\s*\|?.+\|.*\n\s*\|?\s*:?-{3,}/m.test(structure)) add("table", "本文の表は非対応です");
  if ((body.match(/^\s*```/gm) || []).length % 2) add("code_fence", "コードブロックが閉じていません");
  const payLines = structure.split("\n").filter((l) => /<\/?pay>|<pay_line>/i.test(l));
  if (payLines.length > 1 || payLines.some((l) => l.trim() !== "<pay>")) add("pay_tag", "<pay>は単独行で最大1回です");
  for (const s of main) range(`h3:${s.title}`, sections(s.content, 3).length, 2, 4);
  faq.forEach((q) => range(`faq_answer:${q.title}`, countText(q.content), 80, 120));
  if (/^### /m.test(withoutCode(introBlock))) add("heading_order", "H2より前にH3があります");

  const titleLines = briefSection(brief, "タイトル候補").split("\n").filter((l) => /^\d+\. /.test(l));
  const titleRecords = titleLines.map((line) => {
    const parts = line.replace(/^\d+\. /, "").split("｜").map((p) => p.trim());
    return {
      title: parts[0] || "",
      type: parts.find((p) => p.startsWith("型:"))?.slice(2).trim() || "",
      recovery: parts.find((p) => p.startsWith("回収:"))?.slice(3).trim() || "",
    };
  });
  const titles = titleRecords.map((record) => record.title);
  const metas = briefSection(brief, "メタ候補").split("\n").filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim());
  range("title_candidates", titles.length, 10, 10);
  titles.forEach((t, i) => range(`title_candidate:${i + 1}`, [...t].length, 28, 32));
  if (new Set(titles).size !== titles.length) add("title_candidate_duplicate", "タイトル候補は10案すべて異なる案にしてください");
  if (!titles.includes(title)) add("selected_title", "本文タイトルが候補にありません");
  const allowedTitleTypes = new Set(["理論反証", "逆説", "前提反転", "因果反転", "直球"]);
  titleRecords.forEach((record, i) => {
    if (!allowedTitleTypes.has(record.type)) add("title_type", `候補${i + 1}の型を確認してください`);
    if (!h2.some((section) => section.title === record.recovery)) add("title_recovery", `候補${i + 1}の回収先H2が本文にありません`);
  });
  const titleTypeCount = (type) => titleRecords.filter((record) => record.type === type).length;
  if (titleTypeCount("理論反証") < 2) add("title_theory_hooks", "理論反証型を2案以上作ってください");
  if (titleTypeCount("逆説") < 2) add("title_paradox_hooks", "逆説型を2案以上作ってください");
  if (new Set(titleRecords.map((record) => record.type).filter((type) => allowedTitleTypes.has(type))).size < 3) add("title_type_diversity", "タイトル候補に3型以上を使ってください");
  if (titleTypeCount("直球") > 2) add("title_direct_limit", "直球型は2案までです");
  if (titleRecords.find((record) => record.title === title)?.type === "直球") add("selected_title_hook", "採用タイトルは直球以外の反転型から選んでください");
  titleLines.forEach((line, i) => {
    const m = line.match(/｜([0-5])\/([0-5])\/([0-5])\/([0-5])\/([0-5])\s*[=＝]\s*(\d+)/);
    if (!m || m.slice(1, 6).reduce((a, n) => a + Number(n), 0) !== Number(m[6])) add("title_score", `候補${i + 1}の5軸採点/合計を確認してください`);
  });
  range("meta_candidates", metas.length, 3, 3);
  metas.forEach((m, i) => range(`meta_length:${i + 1}`, countText(m), 120, 140));
  const declaredFaq = brief.match(/^FAQ数:\s*(\d+)\s*$/m);
  if (!declaredFaq || Number(declaredFaq[1]) !== faq.length) add("faq_record", "briefのFAQ数が本文と一致しません");
  const allocations = new Map([...briefSection(brief, "章配分").matchAll(/^- (.+)｜(\d+)\s*$/gm)].map((m) => [m[1].trim(), Number(m[2])]));
  const chapterMetrics = h2.map((s) => {
    // Count real code content too; structural parsing only masks headings inside fences.
    const actual = sections(body, 2).find((r) => r.title === s.title);
    const chars = countText(actual?.full ?? s.full);
    const planned = allocations.get(s.title);
    if (planned === undefined) add("chapter_allocation", `${s.title}の配分がありません`);
    return { heading: s.title, chars, planned: planned ?? null, delta: planned === undefined ? null : chars - planned };
  });
  const jsonBlocks = [...brief.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  let schemas = [];
  for (const b of jsonBlocks) {
    try {
      const j = JSON.parse(b[1]);
      if (j?.["@context"]) {
        const graph = j["@graph"] || [j];
        if (!Array.isArray(graph) || graph.some((s) => !s || typeof s !== "object" || !s["@type"])) {
          add("json_ld_shape", "JSON-LDの型・構造を確認してください");
        } else schemas.push(...graph);
      }
    }
    catch { add("json_ld_parse", "briefのJSONを解析できません"); }
  }
  if (!schemas.length) add("json_ld", "briefにJSON-LDがありません");
  for (const schema of schemas.filter((s) => [].concat(s["@type"]).includes("FAQPage"))) {
    const entries = schema.mainEntity;
    if (!Array.isArray(entries) || entries.length !== faq.length || entries.some((e, i) =>
      visibleText(String(e?.name || "")) !== visibleText(faq[i]?.title || "") || visibleText(String(e?.acceptedAnswer?.text || "")) !== visibleText(faq[i]?.content || ""))) {
      add("json_ld_faq", "FAQPageの質問・回答が本文と一致しません");
    }
  }
  const phase7 = brief.match(/^## Phase\s*7(?=[：:\s]|$)[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] || "";
  return {
    ok: errors.length === 0, errors,
    metrics: { titleChars: [...title].length, bodyChars: countText(body), leadChars: lead, introChars: intro,
      mainH2: main.length, faqCount: faq.length, bodyImageCount: bodyImages.length, chapters: chapterMetrics, unresolvedTags: tags,
      auditRecorded: /指摘事項なし|反映済み/.test(phase7) },
    manualChecks: ["出典・最新性・単位・前提", "文体・論理・KW配置", "段落分けと見出し前の余白", "導入直後の目次", "タイトルの反転主張と本文回収", "上位3タイトルの理由", "画像目視検品", "独立監査の全指摘反映"],
  };
}

export async function checkBodyImageFiles(articlePath, markdown) {
  const errors = [];
  const draftsRoot = await realpath(ARTICLE_DRAFTS_ROOT);
  for (const image of extractBodyImages(markdown)) {
    if (/^(https?:|data:)/i.test(image.path)) continue;
    const candidate = isAbsolute(image.path) ? resolve(image.path) : resolve(dirname(articlePath), image.path);
    try {
      const actual = await realpath(candidate);
      const rel = relative(draftsRoot, actual);
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        errors.push({ code: "body_image_path", message: `本文画像はarticles/drafts内へ保存してください: ${image.path}` });
      }
      if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extname(actual).toLowerCase())) {
        errors.push({ code: "body_image_format", message: `非対応の本文画像形式です: ${image.path}` });
      }
    } catch {
      errors.push({ code: "body_image_missing", message: `本文画像が見つかりません: ${image.path}` });
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const path = process.argv[2];
    if (!path) throw new Error("Usage: node scripts/check_article.mjs <article.md>");
    const markdown = await readFile(path, "utf8");
    let brief = "";
    try { brief = await readFile(path.replace(/\.md$/, ".seo-brief.md"), "utf8"); }
    catch (e) { if (e.code !== "ENOENT") throw e; }
    const result = checkArticle(markdown, brief);
    result.errors.push(...await checkBodyImageFiles(resolve(path), markdown));
    result.ok = result.errors.length === 0;
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
