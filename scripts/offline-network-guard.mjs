/* global globalThis */
import { createRequire, syncBuiltinESMExports } from "node:module";

const require = createRequire(import.meta.url);
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const installSymbol = Symbol.for("travel-claims-copilot.offline-network-guard");

export class OfflineNetworkError extends Error {
  constructor(target) {
    super(`Offline network blocked: ${target}`);
    this.name = "OfflineNetworkError";
  }
}

function withoutPort(host) {
  const value = String(host).trim();
  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    return closingBracket >= 0 ? value.slice(1, closingBracket) : value;
  }
  const colon = value.lastIndexOf(":");
  if (colon > 0 && value.indexOf(":") === colon && /^\d+$/.test(value.slice(colon + 1))) {
    return value.slice(0, colon);
  }
  return value;
}

function isLoopbackIpv4(host) {
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) &&
    Number(octets[0]) === 127
  );
}

export function assertLoopbackHost(host, blockedTarget = host) {
  const normalized = withoutPort(host).toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || isLoopbackIpv4(normalized)) return;
  throw new OfflineNetworkError(blockedTarget);
}

function assertFetchInput(input) {
  const raw = input instanceof Request ? input.url : input;
  const url = raw instanceof URL ? raw : new URL(String(raw));
  assertLoopbackHost(url.hostname, url.origin);
}

function httpTarget(args, protocol) {
  const [first, second] = args;
  const override =
    second && typeof second === "object" && !(second instanceof URL) ? second : undefined;
  if (override?.socketPath) return null;

  if (first instanceof URL || typeof first === "string") {
    const url =
      first instanceof URL
        ? first
        : new URL(first, first.startsWith("/") ? `${protocol}//localhost` : undefined);
    const rawHost = override?.hostname ?? override?.host ?? url.hostname;
    return { host: rawHost, blockedTarget: override ? String(rawHost) : url.origin };
  }

  if (first && typeof first === "object") {
    if (first.socketPath) return null;
    const rawHost = first.hostname ?? first.host ?? "localhost";
    return { host: rawHost, blockedTarget: String(rawHost) };
  }

  return { host: "localhost", blockedTarget: "localhost" };
}

function assertHttpArgs(args, protocol) {
  const target = httpTarget(args, protocol);
  if (target) assertLoopbackHost(target.host, target.blockedTarget);
}

function netTarget(args) {
  const [first, second] = args;
  if (typeof first === "string") return null;
  if (typeof first === "number") {
    const host = typeof second === "string" ? second : "localhost";
    return { host, blockedTarget: host };
  }
  if (first && typeof first === "object") {
    if (first.path) return null;
    const host = first.host ?? "localhost";
    return { host, blockedTarget: String(host) };
  }
  return { host: "localhost", blockedTarget: "localhost" };
}

function assertNetArgs(args) {
  const target = netTarget(args);
  if (target) assertLoopbackHost(target.host, target.blockedTarget);
}

function guarded(original, inspect) {
  return function offlineGuardedCall(...args) {
    inspect(args);
    return Reflect.apply(original, this, args);
  };
}

function installOfflineNetworkGuard() {
  if (globalThis[installSymbol]) return;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = function offlineFetch(input, init) {
    assertFetchInput(input);
    return Reflect.apply(originalFetch, this, [input, init]);
  };
  http.request = guarded(http.request, (args) => assertHttpArgs(args, "http:"));
  http.get = guarded(http.get, (args) => assertHttpArgs(args, "http:"));
  https.request = guarded(https.request, (args) => assertHttpArgs(args, "https:"));
  https.get = guarded(https.get, (args) => assertHttpArgs(args, "https:"));
  net.connect = guarded(net.connect, assertNetArgs);
  net.createConnection = guarded(net.createConnection, assertNetArgs);
  syncBuiltinESMExports();
  Object.defineProperty(globalThis, installSymbol, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

installOfflineNetworkGuard();
