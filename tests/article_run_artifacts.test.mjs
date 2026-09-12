import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanupArtifactRun, closeArtifactRun, inspectArtifactRun, registerArtifacts, startArtifactRun } from "../scripts/article_run_artifacts.mjs";

test("artifact cleanup deletes only registered files created during the run", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "article-artifacts-"));
  const manifests = join(root, "manifests");
  const images = join(root, "drafts", "images");
  await mkdir(images, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  const existing = join(root, "drafts", "existing.md");
  await writeFile(existing, "keep");
  const { manifestPath } = await startArtifactRun({ articlesRoot: root, manifestRoot: manifests });
  const ownedMarkdown = join(root, "drafts", "new.md");
  const ownedImage = join(images, "new.png");
  const unrelated = join(images, "unrelated.png");
  await writeFile(ownedMarkdown, "delete");
  await writeFile(ownedImage, "delete");
  await writeFile(unrelated, "keep");
  await registerArtifacts(manifestPath, [ownedMarkdown, ownedImage], { articlesRoot: root });

  const status = await inspectArtifactRun(manifestPath, { articlesRoot: root });
  assert.deepEqual(status.unregistered, ["drafts/images/unrelated.png"]);
  const result = await cleanupArtifactRun(manifestPath, { articlesRoot: root });
  assert.deepEqual(result.deleted.sort(), ["drafts/images/new.png", "drafts/new.md"]);
  assert.deepEqual(result.unregistered, ["drafts/images/unrelated.png"]);
  assert.equal(await readFile(existing, "utf8"), "keep");
  assert.equal(await readFile(unrelated, "utf8"), "keep");
  await assert.rejects(access(ownedMarkdown), /ENOENT/);
  await assert.rejects(access(ownedImage), /ENOENT/);
});

test("closing a run keeps owned files and only removes the manifest", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "article-artifacts-close-"));
  const manifests = join(root, "manifests");
  const images = join(root, "drafts", "images");
  await mkdir(images, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  const { manifestPath } = await startArtifactRun({ articlesRoot: root, manifestRoot: manifests });
  const ownedMarkdown = join(root, "drafts", "new.md");
  const ownedImage = join(images, "new.png");
  await writeFile(ownedMarkdown, "keep after local-only stop");
  await writeFile(ownedImage, "keep after local-only stop");
  await registerArtifacts(manifestPath, [ownedMarkdown, ownedImage], { articlesRoot: root });

  const result = await closeArtifactRun(manifestPath, { articlesRoot: root });
  assert.deepEqual(result.kept.sort(), ["drafts/images/new.png", "drafts/new.md"]);
  assert.equal(await readFile(ownedMarkdown, "utf8"), "keep after local-only stop");
  assert.equal(await readFile(ownedImage, "utf8"), "keep after local-only stop");
  await assert.rejects(access(manifestPath), /ENOENT/);
});

test("artifact registration rejects files that existed before the run", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "article-artifacts-baseline-"));
  const manifests = join(root, "manifests");
  await mkdir(join(root, "drafts"), { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  const existing = join(root, "drafts", "existing.md");
  await writeFile(existing, "keep");
  const { manifestPath } = await startArtifactRun({ articlesRoot: root, manifestRoot: manifests });
  await assert.rejects(registerArtifacts(manifestPath, [existing], { articlesRoot: root }), /existed before/);
});
