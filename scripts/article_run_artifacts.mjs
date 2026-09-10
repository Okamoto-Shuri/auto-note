#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES_ROOT = join(PROJECT_ROOT, "articles");
const MANIFEST_ROOT = join(tmpdir(), "auto-note-article-runs");
const ARTIFACT_EXTENSIONS = new Set([
  ".md", ".markdown", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".bmp", ".tif", ".tiff",
]);

function portable(path) {
  return path.split(sep).join("/");
}

function validateRelative(path) {
  if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`Artifact path must stay inside articles: ${path}`);
  }
  if (!ARTIFACT_EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new Error(`Only Markdown and image artifacts may be registered: ${path}`);
  }
}

async function listArtifacts(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && ARTIFACT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(portable(relative(root, path)));
      }
    }
  }
  await visit(root);
  return files.sort();
}

async function atomicWrite(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function loadManifest(manifestPath, articlesRoot) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const actualRoot = await realpath(articlesRoot);
  if (manifest.version !== 1 || resolve(manifest.articlesRoot) !== actualRoot) {
    throw new Error("Artifact manifest does not match this articles directory");
  }
  if (!Array.isArray(manifest.baseline) || !Array.isArray(manifest.owned)) {
    throw new Error("Invalid artifact manifest");
  }
  return { manifest, actualRoot };
}

export async function startArtifactRun({ articlesRoot = ARTICLES_ROOT, manifestRoot = MANIFEST_ROOT } = {}) {
  const actualRoot = await realpath(articlesRoot);
  await mkdir(manifestRoot, { recursive: true });
  const manifestPath = join(manifestRoot, `${randomUUID()}.json`);
  const manifest = {
    version: 1,
    articlesRoot: actualRoot,
    createdAt: new Date().toISOString(),
    baseline: await listArtifacts(actualRoot),
    owned: [],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return { manifestPath, baselineCount: manifest.baseline.length };
}

export async function registerArtifacts(manifestPath, paths, { articlesRoot = ARTICLES_ROOT } = {}) {
  const { manifest, actualRoot } = await loadManifest(manifestPath, articlesRoot);
  for (const input of paths) {
    const candidate = isAbsolute(input) ? resolve(input) : resolve(PROJECT_ROOT, input);
    const actual = await realpath(candidate);
    const rel = relative(actualRoot, actual);
    validateRelative(rel);
    const normalized = portable(rel);
    if (manifest.baseline.includes(normalized)) {
      throw new Error(`Refusing to register a file that existed before this run: ${normalized}`);
    }
    if (!manifest.owned.includes(normalized)) manifest.owned.push(normalized);
  }
  manifest.owned.sort();
  await atomicWrite(manifestPath, manifest);
  return { registered: [...manifest.owned] };
}

export async function inspectArtifactRun(manifestPath, { articlesRoot = ARTICLES_ROOT } = {}) {
  const { manifest, actualRoot } = await loadManifest(manifestPath, articlesRoot);
  const current = await listArtifacts(actualRoot);
  const baseline = new Set(manifest.baseline);
  const owned = new Set(manifest.owned);
  return {
    registered: [...manifest.owned],
    unregistered: current.filter((path) => !baseline.has(path) && !owned.has(path)),
  };
}

export async function cleanupArtifactRun(manifestPath, { articlesRoot = ARTICLES_ROOT } = {}) {
  const { manifest, actualRoot } = await loadManifest(manifestPath, articlesRoot);
  const { unregistered } = await inspectArtifactRun(manifestPath, { articlesRoot });
  const baseline = new Set(manifest.baseline);
  const deleted = [];
  for (const rel of manifest.owned) {
    validateRelative(rel.split("/").join(sep));
    if (baseline.has(rel)) throw new Error(`Refusing to delete baseline artifact: ${rel}`);
    try {
      await unlink(join(actualRoot, rel));
      deleted.push(rel);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await unlink(manifestPath);
  return { deleted, unregistered };
}

async function main() {
  const [command, manifestPath, ...paths] = process.argv.slice(2);
  if (command === "start" && !manifestPath) return startArtifactRun();
  if (command === "register" && manifestPath && paths.length) return registerArtifacts(manifestPath, paths);
  if (command === "status" && manifestPath && !paths.length) return inspectArtifactRun(manifestPath);
  if (command === "cleanup" && manifestPath && !paths.length) return cleanupArtifactRun(manifestPath);
  throw new Error("Usage: article_run_artifacts.mjs start | register <manifest> <path...> | status <manifest> | cleanup <manifest>");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
