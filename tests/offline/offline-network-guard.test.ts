import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error The JavaScript preload has no declaration file.
import { OfflineNetworkError, assertLoopbackHost } from "../../scripts/offline-network-guard.mjs";

const guardUrl = pathToFileURL(
  path.join(process.cwd(), "scripts", "offline-network-guard.mjs")
).href;
const probePath = path.join(process.cwd(), "tests", "offline", "offline-network-guard-probe.mjs");

function runProbe(mode: string) {
  return spawnSync(process.execPath, [probePath, mode], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TEST_OFFLINE: "1",
      NODE_OPTIONS: `--import=${guardUrl}`
    },
    encoding: "utf8",
    timeout: 5_000
  });
}

describe("offline process network guard", () => {
  it.each(["localhost", "127.0.0.1", "127.255.10.20", "::1", "[::1]"])(
    "accepts literal loopback host %s",
    (host) => {
      expect(() => assertLoopbackHost(host)).not.toThrow();
    }
  );

  it.each([
    "0.0.0.0",
    "192.168.1.10",
    "example.test",
    "localhost.example",
    "127.0.0.1.test",
    "127.0.0.999"
  ])("rejects non-loopback host %s", (host) => {
    expect(() => assertLoopbackHost(host)).toThrow(OfflineNetworkError);
  });

  it.each([
    "fetch",
    "http-request",
    "http-get",
    "https-request",
    "https-get",
    "net-connect",
    "net-create-connection",
    "loopback-http",
    "loopback-tcp",
    "loopback-unix"
  ])("enforces probe mode %s before DNS or socket use", (mode) => {
    const result = runProbe(mode);

    expect(result.error, `${result.stdout}${result.stderr}`).toBeUndefined();
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(`ok:${mode}`);
  });
});
