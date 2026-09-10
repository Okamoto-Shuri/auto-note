import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

function requestOnce(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/note_mcp_server.mjs"], {
      cwd: new URL("..", import.meta.url),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP response timeout: ${errors}`));
    }, 3000);
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timeout);
      child.kill();
      resolve(JSON.parse(output.slice(0, newline)));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

test("MCP server initializes over newline-delimited stdio", async () => {
  const response = await requestOnce({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(response.id, 1);
  assert.equal(response.result.serverInfo.name, "auto-note-publisher");
  assert.equal(response.result.protocolVersion, "2025-06-18");
});

test("MCP server exposes only the three scoped tools", async () => {
  const response = await requestOnce({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(
    response.result.tools.map((tool) => tool.name),
    ["note_session_status", "open_note_login", "publish_note"]
  );
  const publishTool = response.result.tools.find((tool) => tool.name === "publish_note");
  assert.equal(publishTool.inputSchema.properties.is_publish.default, false);
});
