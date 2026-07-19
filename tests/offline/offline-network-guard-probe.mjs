import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const mode = process.argv[2];

function expectBlocked(action) {
  try {
    action();
    assert.fail("network action was not blocked synchronously");
  } catch (error) {
    assert.equal(error?.name, "OfflineNetworkError");
    assert.match(error.message, /blocked\.invalid/);
  }
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address);
  return address.port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function probeLoopbackHttp() {
  const server = http.createServer((_request, response) => response.end("ok"));
  const port = await listen(server);
  try {
    const body = await new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/probe`, (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        })
        .once("error", reject);
    });
    assert.equal(body, "ok");
  } finally {
    await close(server);
  }
}

async function probeLoopbackTcp() {
  const server = net.createServer((socket) => socket.end("ok"));
  const port = await listen(server);
  try {
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      net
        .createConnection({ host: "127.0.0.1", port }, () => undefined)
        .on("data", (chunk) => chunks.push(chunk))
        .on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
        .once("error", reject);
    });
    assert.equal(body, "ok");
  } finally {
    await close(server);
  }
}

async function probeUnixSocket() {
  const directory = mkdtempSync(path.join(tmpdir(), "claims-offline-socket-"));
  const socketPath = path.join(directory, "guard.sock");
  const server = net.createServer((socket) => socket.end("ok"));
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      net
        .createConnection(socketPath)
        .on("data", (chunk) => chunks.push(chunk))
        .on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
        .once("error", reject);
    });
    assert.equal(body, "ok");
  } finally {
    if (server.listening) await close(server);
    rmSync(directory, { recursive: true, force: true });
  }
}

const blockedActions = {
  fetch: () => fetch("https://blocked.invalid/probe"),
  "http-request": () => http.request("http://blocked.invalid/probe"),
  "http-get": () => http.get("http://blocked.invalid/probe"),
  "https-request": () => https.request("https://blocked.invalid/probe"),
  "https-get": () => https.get("https://blocked.invalid/probe"),
  "net-connect": () => net.connect({ host: "blocked.invalid", port: 443 }),
  "net-create-connection": () => net.createConnection({ host: "blocked.invalid", port: 443 })
};

if (mode === "loopback-http") {
  await probeLoopbackHttp();
} else if (mode === "loopback-tcp") {
  await probeLoopbackTcp();
} else if (mode === "loopback-unix") {
  await probeUnixSocket();
} else if (Object.hasOwn(blockedActions, mode)) {
  expectBlocked(blockedActions[mode]);
} else {
  throw new Error(`Unknown probe mode: ${mode}`);
}

process.stdout.write(`ok:${mode}\n`);
