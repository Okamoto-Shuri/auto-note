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
