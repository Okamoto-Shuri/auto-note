import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(new URL("../scripts/note_web_publish.js", import.meta.url), "utf8");

function loadNoteWeb(fetchImpl) {
  const window = {};
  vm.runInNewContext(script, {
    window,
    document: { cookie: "XSRF-TOKEN=test-token" },
    fetch: fetchImpl,
    FormData,
    Blob,
    Uint8Array,
    URLSearchParams,
    crypto,
    atob,
    decodeURIComponent,
  });
  return window.NoteWeb;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("uploadEyecatch sends note's required 1280x670 dimensions", async () => {
  let request;
  const noteWeb = loadNoteWeb(async (url, options) => {
    request = { url, options };
    return jsonResponse(201, { data: { url: "https://assets.example/eyecatch.png" } });
  });

  const result = await noteWeb.uploadEyecatch("aGVsbG8=", "image/png", 123);

  assert.equal(result.ok, true);
  assert.equal(request.url, "https://note.com/api/v1/image_upload/note_eyecatch");
  assert.equal(request.options.body.get("note_id"), "123");
  assert.equal(request.options.body.get("width"), "1280");
  assert.equal(request.options.body.get("height"), "670");
  assert.equal(request.options.headers["X-Requested-With"], "XMLHttpRequest");
  assert.equal(request.options.headers["X-XSRF-TOKEN"], "test-token");
});

test("uploadEyecatch rejects an HTTP 201 response containing a JSON error", async () => {
  const noteWeb = loadNoteWeb(async () =>
    jsonResponse(201, { error: { message: "見出し画像は1280:670の縦横比の画像を設定してください" } })
  );

  const result = await noteWeb.uploadEyecatch("aGVsbG8=", "image/png", 123);

  assert.equal(result.ok, false);
  assert.equal(result.error.type, "EyecatchUploadFailed");
});

test("uploadEyecatch requires the uploaded asset URL", async () => {
  const noteWeb = loadNoteWeb(async () => jsonResponse(201, { data: {} }));

  const result = await noteWeb.uploadEyecatch("aGVsbG8=", "image/png", 123);

  assert.equal(result.ok, false);
  assert.equal(result.error.type, "EyecatchUploadResultInvalid");
});

function publishFixture({ remote = {}, throwAt, rejectPut = false } = {}) {
  const calls = [];
  const noteWeb = loadNoteWeb(async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    if (throwAt && url.includes(throwAt)) throw new Error("connection lost");
    if (url.endsWith("/current_user")) return jsonResponse(200, { data: { id: 9, urlname: "writer" } });
    if (url.endsWith("/text_notes") && options.method === "POST") return jsonResponse(201, { data: { id: 123, key: "n123" } });
    if (url.includes("/note_eyecatch")) return jsonResponse(201, { data: { url: "https://assets.example/eye.png" } });
    if (url.includes("/draft_save")) return jsonResponse(200, {});
    if (options.method === "PUT") return jsonResponse(200, rejectPut ? { error: "rejected" } : {});
    if (url.includes("/api/v3/notes/n123")) return jsonResponse(200, { data: {
      id: 123, key: "n123", status: "published", eyecatch: "https://assets.example/eye.png", ...remote,
    } });
    throw new Error(`Unexpected URL ${url}`);
  });
  return { noteWeb, calls, options: { title: "test", markdown: "## 見出し\n本文", isPublish: true,
    eyecatch: { base64: "aGVsbG8=", mime: "image/png" } } };
}

test("publishing verifies remote identity, status and eyecatch after PUT", async () => {
  const { noteWeb, calls, options } = publishFixture();
  const result = await noteWeb.publish(options);
  assert.equal(result.ok, true);
  assert.equal(result.data.verification.published, true);
  assert.equal(result.data.verification.eyecatchUrl, "https://assets.example/eye.png");
  assert.equal(calls.at(-1).url, "https://note.com/api/v3/notes/n123");
  assert.equal(calls.filter((c) => c.method === "PUT").length, 1);
});

for (const remote of [{ eyecatch: null }, { status: "draft" }, { id: 999 }, { key: "wrong" }, { is_published: false }]) {
  test(`remote verification failure retains IDs and forbids re-post: ${JSON.stringify(remote)}`, async () => {
    const { noteWeb, calls, options } = publishFixture({ remote });
    const result = await noteWeb.publish(options);
    assert.equal(result.ok, false);
    assert.equal(result.doNotRetry, true);
    assert.equal(result.note.noteId, 123);
    assert.equal(result.note.noteKey, "n123");
    assert.equal(result.error.type, "NoteVerificationFailed");
    assert.equal(calls.filter((c) => c.url.endsWith("/text_notes")).length, 1);
  });
}

test("draft verification uses draft GET and returns saved, not published", async () => {
  const { noteWeb, calls, options } = publishFixture({ remote: { status: "draft", is_published: false } });
  const result = await noteWeb.publish({ ...options, isPublish: false });
  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "draft");
  assert.equal(result.data.verification.saved, true);
  assert.equal(result.data.verification.published, false);
  assert.equal(calls.at(-1).url, "https://note.com/api/v3/notes/n123?draft=true");
  assert.equal(calls.some((c) => c.method === "PUT"), false);
});

test("lost verification response preserves the created note identity", async () => {
  const { noteWeb, options } = publishFixture({ throwAt: "/api/v3/notes/" });
  const result = await noteWeb.publish(options);
  assert.equal(result.ok, false);
  assert.equal(result.doNotRetry, true);
  assert.equal(result.note.noteId, 123);
});

test("lost skeleton response marks result unknown and must not be retried", async () => {
  const { noteWeb, options } = publishFixture({ throwAt: "/api/v1/text_notes" });
  const result = await noteWeb.publish(options);
  assert.equal(result.ok, false);
  assert.equal(result.doNotRetry, true);
  assert.equal(result.note, null);
});

test("HTTP 200 with publish error is not considered successful", async () => {
  const { noteWeb, options } = publishFixture({ rejectPut: true });
  const result = await noteWeb.publish(options);
  assert.equal(result.ok, false);
  assert.equal(result.error.type, "PublishFailed");
  assert.equal(result.note.noteId, 123);
});
