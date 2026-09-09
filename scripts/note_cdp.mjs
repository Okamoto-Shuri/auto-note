import { access, mkdir, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_PORT = 9223;
const NOTE_URL = "https://note.com/";

export function cdpPort() {
  const value = Number.parseInt(process.env.AUTO_NOTE_CDP_PORT || String(DEFAULT_PORT), 10);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("AUTO_NOTE_CDP_PORT must be an integer between 1024 and 65535");
  }
  return value;
}

export function profileDirectory() {
  if (process.env.AUTO_NOTE_CHROME_PROFILE_DIR) {
    return process.env.AUTO_NOTE_CHROME_PROFILE_DIR;
  }
  return join(homedir(), ".auto-note", "chrome-profile");
}

async function firstExecutable(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next supported location.
    }
  }
  return null;
}

export async function chromeExecutable() {
  if (process.env.AUTO_NOTE_CHROME_BIN) {
    await access(process.env.AUTO_NOTE_CHROME_BIN, fsConstants.X_OK);
    return process.env.AUTO_NOTE_CHROME_BIN;
  }

  const candidates =
    platform() === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : platform() === "win32"
        ? [
            join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
            join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

  const executable = await firstExecutable(candidates.filter(Boolean));
  if (!executable) {
    throw new Error("Google Chrome/Chromium was not found. Set AUTO_NOTE_CHROME_BIN to its executable path.");
  }
  return executable;
}

function endpoint(pathname = "/json/version") {
  return `http://127.0.0.1:${cdpPort()}${pathname}`;
}

export async function browserVersion() {
  const response = await fetch(endpoint(), { signal: AbortSignal.timeout(1000) });
  if (!response.ok) throw new Error(`Chrome DevTools endpoint returned ${response.status}`);
  const version = await response.json();
  if (typeof version.Browser !== "string" || typeof version.webSocketDebuggerUrl !== "string") {
    throw new Error(`Port ${cdpPort()} is occupied by something other than a Chrome DevTools endpoint`);
  }
  return version;
}

export async function browserIsRunning() {
  try {
    await browserVersion();
    return true;
  } catch {
    return false;
  }
}

async function waitForBrowser(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await browserVersion();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Chrome did not expose its DevTools endpoint on port ${cdpPort()} within ${timeoutMs}ms`);
}

export async function startBrowser() {
  if (await browserIsRunning()) return { started: false, profileDir: profileDirectory() };

  const executable = await chromeExecutable();
  const profileDir = profileDirectory();
  await mkdir(profileDir, { recursive: true, mode: 0o700 });

  const child = spawn(
    executable,
    [
      `--remote-debugging-port=${cdpPort()}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      NOTE_URL,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  await waitForBrowser();
  return { started: true, profileDir };
}

export async function listTargets() {
  const response = await fetch(endpoint("/json/list"), { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`Could not list Chrome targets: HTTP ${response.status}`);
  return response.json();
}

export async function createNoteTarget() {
  const response = await fetch(endpoint(`/json/new?${encodeURIComponent(NOTE_URL)}`), {
    method: "PUT",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Could not open note.com tab: HTTP ${response.status}`);
  return response.json();
}

export async function activateTarget(targetId) {
  const response = await fetch(endpoint(`/json/activate/${encodeURIComponent(targetId)}`), {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Could not activate note.com tab: HTTP ${response.status}`);
}

export async function noteTarget({ create = false } = {}) {
  const targets = await listTargets();
  const target = targets.find((item) => {
    if (item.type !== "page" || !item.webSocketDebuggerUrl) return false;
    try {
      const host = new URL(item.url).hostname;
      return host === "note.com" || host.endsWith(".note.com");
    } catch {
      return false;
    }
  });
  if (target || !create) return target || null;
  return createNoteTarget();
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out connecting to Chrome target")), 5000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Chrome target WebSocket connection failed"));
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "Chrome DevTools command failed"));
      else resolve(message.result);
    });
    this.socket.addEventListener("close", () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error("Chrome target closed"));
      }
      this.pending.clear();
    });
  }

  command(method, params = {}, timeoutMs = 180000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome DevTools command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

export async function evaluateInTarget(target, expression, timeoutMs = 180000) {
  if (!target || !target.webSocketDebuggerUrl) throw new Error("No debuggable note.com tab is available");
  const connection = new CdpConnection(target.webSocketDebuggerUrl);
  await connection.connect();
  try {
    await connection.command("Runtime.enable");
    const result = await connection.command(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      },
      timeoutMs
    );
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(description || "JavaScript execution in note.com failed");
    }
    return result.result?.value;
  } finally {
    connection.close();
  }
}

export async function injectNoteWeb(target, scriptPath) {
  const source = await readFile(scriptPath, "utf8");
  await evaluateInTarget(target, `${source}\n//# sourceURL=auto-note/note_web_publish.js\ntrue;`);
}

export async function currentUser(target, scriptPath) {
  await injectNoteWeb(target, scriptPath);
  return evaluateInTarget(target, "window.NoteWeb.getCurrentUser()");
}

export async function publishInTarget(target, scriptPath, options) {
  await injectNoteWeb(target, scriptPath);
  return evaluateInTarget(target, `window.NoteWeb.publish(${JSON.stringify(options)})`);
}
