#!/usr/bin/env node
import { join } from "node:path";
import { activateTarget, browserIsRunning, currentUser, noteTarget, profileDirectory, startBrowser } from "./note_cdp.mjs";
import { PROJECT_ROOT } from "./note_publish_core.mjs";

const command = process.argv[2] || "status";
const scriptPath = join(PROJECT_ROOT, "scripts", "note_web_publish.js");

async function status() {
  if (!(await browserIsRunning())) return { running: false, loggedIn: false, profileDirectory: profileDirectory() };
  const target = await noteTarget();
  if (!target) return { running: true, loggedIn: false, message: "No note.com tab", profileDirectory: profileDirectory() };
  const user = await currentUser(target, scriptPath);
  return {
    running: true,
    loggedIn: Boolean(user?.ok),
    noteTabUrl: target.url,
    profileDirectory: profileDirectory(),
    user: user?.ok ? { id: user.data.id, urlname: user.data.urlname, nickname: user.data.nickname } : undefined,
    error: user?.ok ? undefined : user?.error,
  };
}

if (command === "open") {
  await startBrowser();
  const target = await noteTarget({ create: true });
  await activateTarget(target.id);
  console.log(JSON.stringify(await status(), null, 2));
} else if (command === "status") {
  console.log(JSON.stringify(await status(), null, 2));
} else {
  console.error("Usage: node scripts/note_browser_cli.mjs [open|status]");
  process.exitCode = 2;
}
