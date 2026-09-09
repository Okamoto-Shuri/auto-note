import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { parseArticle, preparePublication, PROJECT_ROOT } from "../scripts/note_publish_core.mjs";

test("parseArticle extracts frontmatter and body", () => {
  const parsed = parseArticle('---\ntitle: "宇宙とAI"\nstatus: "draft"\n---\n\n本文です。\n');
  assert.equal(parsed.metadata.title, "宇宙とAI");
  assert.equal(parsed.metadata.status, "draft");
  assert.equal(parsed.body, "本文です。");
});

test("parseArticle rejects non-draft content", () => {
  assert.throws(() => parseArticle("---\ntitle: x\nstatus: published\n---\nbody"), /status must be draft/);
});

test("parseArticle requires frontmatter", () => {
  assert.throws(() => parseArticle("# no frontmatter"), /frontmatter/);
});

test("preparePublication accepts an audited article with its eyecatch", async (t) => {
  const draftsRoot = join(PROJECT_ROOT, "articles", "drafts");
  const imagesRoot = join(draftsRoot, "images");
  await mkdir(imagesRoot, { recursive: true });
  const fixtureDir = await mkdtemp(join(draftsRoot, ".test-publication-"));
  const fixtureName = `.test-eyecatch-${process.pid}-${Date.now()}.png`;
  const draftPath = join(fixtureDir, "article.md");
  const briefPath = join(fixtureDir, "article.seo-brief.md");
  const eyecatchPath = join(imagesRoot, fixtureName);
  t.after(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
    await rm(eyecatchPath, { force: true });
  });
  await writeFile(draftPath, '---\ntitle: "テスト専用記事"\nstatus: "draft"\n---\n\n本文です。\n');
  await writeFile(briefPath, "## Phase 7\n\n指摘事項なし\n");
  await writeFile(eyecatchPath, Buffer.from("89504e470d0a1a0a", "hex"));

  const prepared = await preparePublication({ draftPath, eyecatchPath, isPublish: true });
  assert.equal(prepared.options.title, "テスト専用記事");
  assert.equal(prepared.options.isPublish, true);
  assert.equal(prepared.options.eyecatch.mime, "image/png");
  assert.ok(prepared.options.eyecatch.base64.length > 0);
});

test("preparePublication rejects files outside articles/drafts", async () => {
  await assert.rejects(
    preparePublication({
      draftPath: "scripts/note_web_publish.js",
      eyecatchPath: "unused.png",
    }),
    /inside articles\/drafts/
  );
});

test("preparePublication rejects SEO brief files", async (t) => {
  const draftsRoot = join(PROJECT_ROOT, "articles", "drafts");
  const fixtureDir = await mkdtemp(join(draftsRoot, ".test-seo-brief-"));
  const briefPath = join(fixtureDir, "article.seo-brief.md");
  t.after(() => rm(fixtureDir, { recursive: true, force: true }));
  await writeFile(briefPath, "internal brief\n");

  await assert.rejects(
    preparePublication({
      draftPath: briefPath,
      eyecatchPath: "unused.png",
    }),
    /SEO brief/
  );
});
