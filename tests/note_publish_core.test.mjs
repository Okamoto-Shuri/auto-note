import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { beginPublicationAttempt, finishPublicationAttempt, parseArticle, preparePublication, PROJECT_ROOT, recordPublication } from "../scripts/note_publish_core.mjs";

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
  const bodyNames = [0, 1].map((index) => `.test-body-${process.pid}-${Date.now()}-${index}.png`);
  const draftPath = join(fixtureDir, "article.md");
  const briefPath = join(fixtureDir, "article.seo-brief.md");
  const eyecatchPath = join(imagesRoot, fixtureName);
  t.after(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
    await rm(eyecatchPath, { force: true });
    await Promise.all(bodyNames.map((name) => rm(join(imagesRoot, name), { force: true })));
  });
  await writeFile(draftPath, `---\ntitle: "テスト専用記事"\nstatus: "draft"\n---\n\n本文です。\n\n![説明図1](../images/${bodyNames[0]})\n\n![説明図2](../images/${bodyNames[1]})\n`);
  await writeFile(briefPath, "## Phase 7\n\n指摘事項なし\n");
  const png = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  png.writeUInt32BE(1280, 16);
  png.writeUInt32BE(670, 20);
  await writeFile(eyecatchPath, png);
  await Promise.all(bodyNames.map((name) => writeFile(join(imagesRoot, name), png)));

  const prepared = await preparePublication({ draftPath, eyecatchPath, isPublish: true });
  assert.equal(prepared.options.title, "テスト専用記事");
  assert.equal(prepared.options.isPublish, true);
  assert.equal(prepared.options.eyecatch.mime, "image/png");
  assert.ok(prepared.options.eyecatch.base64.length > 0);
  assert.equal(prepared.options.images.length, 2);
  const defaultPrepared = await preparePublication({ draftPath, eyecatchPath });
  assert.equal(defaultPrepared.options.isPublish, false);
  await writeFile(briefPath, "## Phase 7\n\n未実施\n\n## 別の工程\n反映済み\n");
  await assert.rejects(preparePublication({ draftPath, eyecatchPath, isPublish: true }), /Phase 7/);
  await writeFile(briefPath, "## Phase 7\n指摘事項なし\n");
  await writeFile(draftPath, '---\ntitle: x\nstatus: draft\n---\n[要出典：未確認]\n');
  await assert.rejects(preparePublication({ draftPath, eyecatchPath, isPublish: false }), /Unresolved/);
  await writeFile(draftPath, '---\ntitle: x\nstatus: draft\n---\n本文\n');
  png.writeUInt32BE(100, 16);
  await writeFile(eyecatchPath, png);
  await assert.rejects(preparePublication({ draftPath, eyecatchPath }), /1280x670/);
  png.writeUInt32BE(1280, 16);
  await writeFile(eyecatchPath, png);
  await assert.rejects(preparePublication({ draftPath, eyecatchPath }), /2 to 3 body images/);
});

test("publication attempts are exclusive and retain IDs after verification failure", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "note-journal-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prepared = { articlePath: join(root, "article.md"), metadata: { title: "test" } };
  const attempt = await beginPublicationAttempt(prepared, root);
  await assert.rejects(beginPublicationAttempt(prepared, root), /do not retry/);
  await finishPublicationAttempt(attempt, { ok: false, note: { noteId: 12, noteKey: "n12" }, error: "missing image" });
  const saved = JSON.parse(await readFile(attempt.path, "utf8"));
  assert.equal(saved.note.noteId, 12);
  assert.equal(saved.doNotRetry, true);
  assert.equal(saved.status, "needs_review");
  await assert.rejects(beginPublicationAttempt(prepared, root), /do not retry/);
});

test("only verified publication updates state and leaves cleanup to the run manifest", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "note-record-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const articlePath = join(root, "article.md");
  const statePath = join(root, "state.json");
  const prepared = { articlePath, metadata: { title: "test" } };
  const note = { mode: "published", noteId: 1, noteKey: "n1", publicUrl: "https://note.com/a/n/n1" };
  await writeFile(articlePath, "source");
  await writeFile(statePath, JSON.stringify({ drafts: [], published: [] }));
  await assert.rejects(recordPublication(prepared, note, { statePath }), /unverified/);
  note.verification = { saved: true, published: true, eyecatchUrl: "https://assets.example/a.png" };
  await recordPublication(prepared, note, { statePath });
  assert.equal(await readFile(articlePath, "utf8"), "source");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(state.published[0].verification.published, true);
  assert.equal(state.published[0].file, null);
});

test("state write failure preserves the draft for recovery", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "note-state-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const statePath = join(root, "state.json");
  const articlePath = join(root, "article.md");
  await writeFile(statePath, JSON.stringify({ drafts: [], published: [] }));
  await writeFile(articlePath, "recoverable input");
  await mkdir(`${statePath}.${process.pid}.tmp`);
  const prepared = { articlePath, metadata: { title: "test" } };
  const note = { mode: "published", noteId: 5, noteKey: "n5", verification: {
    saved: true, published: true, eyecatchUrl: "https://assets.example/eye.png",
  } };
  await assert.rejects(recordPublication(prepared, note, { statePath }), /EISDIR/);
  assert.equal(await readFile(articlePath, "utf8"), "recoverable input");
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).published.length, 0);
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
