#!/usr/bin/env node
import { join } from "node:path";
import {
  activateTarget,
  browserIsRunning,
  currentUser,
  noteTarget,
  profileDirectory,
  publishInTarget,
  startBrowser,
} from "./note_cdp.mjs";
import { preparePublication, PROJECT_ROOT, recordPublication } from "./note_publish_core.mjs";

const NOTE_WEB_SCRIPT = join(PROJECT_ROOT, "scripts", "note_web_publish.js");
const SERVER_INFO = { name: "auto-note-publisher", version: "1.0.0" };

function textResult(value, isError = false) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], isError };
}

async function sessionStatus() {
  if (!(await browserIsRunning())) {
    return { running: false, loggedIn: false, profileDirectory: profileDirectory() };
  }
  const target = await noteTarget();
  if (!target) return { running: true, loggedIn: false, profileDirectory: profileDirectory(), message: "No note.com tab" };
  try {
    const user = await currentUser(target, NOTE_WEB_SCRIPT);
    return {
      running: true,
      loggedIn: Boolean(user?.ok),
      profileDirectory: profileDirectory(),
      noteTabUrl: target.url,
      user: user?.ok ? { id: user.data.id, urlname: user.data.urlname, nickname: user.data.nickname } : undefined,
      error: user?.ok ? undefined : user?.error,
    };
  } catch (error) {
    return { running: true, loggedIn: false, profileDirectory: profileDirectory(), error: error.message };
  }
}

async function openLogin() {
  const browser = await startBrowser();
  const target = await noteTarget({ create: true });
  await activateTarget(target.id);
  const status = await sessionStatus();
  return {
    ...status,
    started: browser.started,
    instruction: status.loggedIn
      ? "note.com is already authenticated."
      : "Sign in to note.com manually in the opened Chrome window, then call note_session_status.",
  };
}

async function publishNote(args) {
  if (!(await browserIsRunning())) {
    return textResult(
      { code: "NOTE_BROWSER_NOT_RUNNING", message: "Call open_note_login, sign in manually if needed, then retry." },
      true
    );
  }
  const target = await noteTarget({ create: true });
  const user = await currentUser(target, NOTE_WEB_SCRIPT);
  if (!user?.ok) {
    await activateTarget(target.id);
    return textResult(
      { code: "NOTE_LOGIN_REQUIRED", message: "Sign in to note.com manually in the opened Chrome window, then retry.", detail: user?.error },
      true
    );
  }

  const prepared = await preparePublication({
    draftPath: args.draft_path,
    eyecatchPath: args.eyecatch_path,
    isPublish: args.is_publish ?? true,
    userApproved: args.user_approved ?? false,
    hashtags: args.hashtags || [],
    price: args.price || 0,
    magazineKeys: args.magazine_keys || [],
  });
  const result = await publishInTarget(target, NOTE_WEB_SCRIPT, prepared.options);
  if (!result?.ok) return textResult({ code: "NOTE_API_ERROR", error: result?.error || result }, true);

  let local;
  try {
    local = await recordPublication(prepared, result.data);
  } catch (error) {
    return textResult(
      {
        ok: true,
        warning: "The note operation succeeded, but local archive/state update failed.",
        doNotRetry: true,
        note: result.data,
        localError: error.message,
      }
    );
  }
  return textResult({ ok: true, note: result.data, local: local.record });
}

const tools = [
  {
    name: "note_session_status",
    description: "Check whether the dedicated auto-note Chrome session is running and signed in to note.com.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Check note session", readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "open_note_login",
    description: "Open the dedicated Chrome profile at note.com for one-time manual sign-in. This never automates credentials.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Open note login", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "publish_note",
    description:
      "Publish one audited Markdown draft to the user's own note.com account through the authenticated browser session, with a mandatory eyecatch. Defaults to live publication and updates articles/state.json plus the local archive after success.",
    inputSchema: {
      type: "object",
      properties: {
        draft_path: { type: "string", description: "Path under articles/drafts ending in .md (not .seo-brief.md)." },
        eyecatch_path: { type: "string", description: "PNG/JPEG/GIF/WebP path under articles/drafts/images." },
        is_publish: { type: "boolean", default: true, description: "true for live publication; false for note draft save." },
        user_approved: { type: "boolean", default: false, description: "Set true only when the user explicitly approved this article; otherwise a Phase 7 brief is required." },
        hashtags: { type: "array", items: { type: "string" }, default: [] },
        price: { type: "number", minimum: 0, default: 0 },
        magazine_keys: { type: "array", items: { type: "string" }, default: [] },
      },
      required: ["draft_path", "eyecatch_path"],
      additionalProperties: false,
    },
    annotations: { title: "Publish note article", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
];

async function handle(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params?.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "Use open_note_login only when note_session_status reports no authenticated session. publish_note is limited to one local draft and requires an eyecatch. Never automate login credentials. Live publishing requires Phase 7 evidence or explicit user approval.",
    };
  }
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools };
  if (request.method === "tools/call") {
    const name = request.params?.name;
    const args = request.params?.arguments || {};
    try {
      if (name === "note_session_status") return textResult(await sessionStatus());
      if (name === "open_note_login") return textResult(await openLogin());
      if (name === "publish_note") return await publishNote(args);
      return textResult({ code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` }, true);
    } catch (error) {
      return textResult({ code: "TOOL_ERROR", message: error.message }, true);
    }
  }
  throw Object.assign(new Error(`Method not found: ${request.method}`), { code: -32601 });
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      continue;
    }
    if (request.id === undefined) continue;
    Promise.resolve(handle(request)).then(
      (result) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`),
      (error) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: error.code || -32603, message: error.message } })}\n`)
    );
  }
});

process.stdin.resume();
