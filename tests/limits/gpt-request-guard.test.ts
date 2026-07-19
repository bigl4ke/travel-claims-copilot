import { describe, expect, it, vi } from "vitest";

import {
  MemoryConcurrencyLimiter,
  type ConcurrencyLimiter
} from "../../lib/limits/concurrency-limiter";
import { guardGptRequest, type BudgetGate } from "../../lib/limits/gpt-request-guard";
import { MemoryRateLimiter, type RateLimiter } from "../../lib/limits/rate-limiter";

const budget: BudgetGate = {
  async check() {
    return { allowed: true };
  }
};

const identity = {
  key: "local-test",
  source: "local_test" as const,
  globallyEnforceable: false
};

function orderedGuardDependencies(calls: string[]) {
  const rateLimiter: RateLimiter = {
    consume: vi.fn(async ({ scope }) => {
      calls.push(`rate:${scope}`);
      return { allowed: true, retryAfterSeconds: 0 };
    })
  };
  const concurrencyLimiter: ConcurrencyLimiter = {
    acquire: vi.fn(async () => {
      calls.push("concurrency");
      return { release: vi.fn(async () => undefined) };
    })
  };
  const orderedBudget: BudgetGate = {
    check: vi.fn(async () => {
      calls.push("budget");
      return { allowed: true };
    })
  };
  return { rateLimiter, concurrencyLimiter, budget: orderedBudget };
}

describe("GPT request guard", () => {
  it("short-circuits consent, failed access, and valid access in the frozen order", async () => {
    const consentCalls: string[] = [];
    const consentDependencies = orderedGuardDependencies(consentCalls);
    expect(
      await guardGptRequest({
        consent: false,
        accessGranted: true,
        identity,
        ...consentDependencies
      })
    ).toEqual({ allowed: false, code: "gpt_access_denied" });
    expect(consentCalls).toEqual([]);

    const failedAccessCalls: string[] = [];
    const failedAccessDependencies = orderedGuardDependencies(failedAccessCalls);
    expect(
      await guardGptRequest({
        consent: true,
        accessGranted: false,
        identity,
        ...failedAccessDependencies
      })
    ).toEqual({ allowed: false, code: "gpt_access_denied" });
    expect(failedAccessCalls).toEqual(["rate:failed_access"]);
    expect(vi.mocked(failedAccessDependencies.rateLimiter.consume)).toHaveBeenCalledWith({
      key: "local-test",
      scope: "failed_access",
      limit: 10,
      windowMs: 60_000
    });

    const validAccessCalls: string[] = [];
    const validAccessDependencies = orderedGuardDependencies(validAccessCalls);
    const valid = await guardGptRequest({
      consent: true,
      accessGranted: true,
      identity,
      ...validAccessDependencies
    });
    expect(validAccessCalls).toEqual(["budget", "rate:gpt_minute", "rate:gpt_hour", "concurrency"]);
    expect(validAccessCalls).not.toContain("rate:failed_access");
    expect(vi.mocked(validAccessDependencies.rateLimiter.consume)).toHaveBeenNthCalledWith(1, {
      key: "local-test",
      scope: "gpt_minute",
      limit: 10,
      windowMs: 60_000
    });
    expect(vi.mocked(validAccessDependencies.rateLimiter.consume)).toHaveBeenNthCalledWith(2, {
      key: "local-test",
      scope: "gpt_hour",
      limit: 60,
      windowMs: 3_600_000
    });
    expect(vi.mocked(validAccessDependencies.concurrencyLimiter.acquire)).toHaveBeenCalledWith(
      "local-test",
      2
    );
    if (valid.allowed) await valid.lease.release();
  });

  it.each(["deny", "throw"] as const)(
    "lets a budget %s block minute, hour, and concurrency adapters",
    async (mode) => {
      const calls: string[] = [];
      const dependencies = orderedGuardDependencies(calls);
      dependencies.budget.check = vi.fn(async () => {
        calls.push("budget");
        if (mode === "throw") throw new Error("offline-budget-failure");
        return { allowed: false, reason: "application_budget" as const };
      });

      expect(
        await guardGptRequest({
          consent: true,
          accessGranted: true,
          identity,
          ...dependencies
        })
      ).toEqual({ allowed: false, code: "budget_restricted" });
      expect(calls).toEqual(["budget"]);
    }
  );

  it.each(["minute", "hour", "concurrency"] as const)(
    "fails closed when the %s adapter throws",
    async (failurePoint) => {
      const calls: string[] = [];
      const dependencies = orderedGuardDependencies(calls);
      dependencies.rateLimiter.consume = vi.fn(async ({ scope }) => {
        calls.push(`rate:${scope}`);
        if (
          (failurePoint === "minute" && scope === "gpt_minute") ||
          (failurePoint === "hour" && scope === "gpt_hour")
        ) {
          throw new Error("offline-rate-failure");
        }
        return { allowed: true, retryAfterSeconds: 0 };
      });
      dependencies.concurrencyLimiter.acquire = vi.fn(async () => {
        calls.push("concurrency");
        if (failurePoint === "concurrency") throw new Error("offline-concurrency-failure");
        return { release: vi.fn(async () => undefined) };
      });

      expect(
        await guardGptRequest({
          consent: true,
          accessGranted: true,
          identity,
          ...dependencies
        })
      ).toEqual({ allowed: false, code: "budget_restricted" });
      const expectedCalls = {
        minute: ["budget", "rate:gpt_minute"],
        hour: ["budget", "rate:gpt_minute", "rate:gpt_hour"],
        concurrency: ["budget", "rate:gpt_minute", "rate:gpt_hour", "concurrency"]
      } as const;
      expect(calls).toEqual(expectedCalls[failurePoint]);
    }
  );

  it("limits failed access attempts and never acquires a lease for rejected access", async () => {
    const rateLimiter = new MemoryRateLimiter(() => 1000);
    const concurrencyLimiter = new MemoryConcurrencyLimiter();
    async function consumeFailures(
      remaining: number
    ): Promise<Awaited<ReturnType<typeof guardGptRequest>>[]> {
      if (remaining === 0) return [];
      const result = await guardGptRequest({
        consent: true,
        accessGranted: false,
        identity: { key: "local-test", source: "local_test", globallyEnforceable: false },
        rateLimiter,
        concurrencyLimiter,
        budget
      });
      return [result, ...(await consumeFailures(remaining - 1))];
    }
    const results = await consumeFailures(11);
    results.forEach((result, index) => {
      expect(result.allowed).toBe(false);
      if (!result.allowed)
        expect(result.code).toBe(index === 10 ? "rate_limited" : "gpt_access_denied");
    });
  });

  it("enforces concurrency and releases idempotently", async () => {
    const concurrencyLimiter = new MemoryConcurrencyLimiter();
    const common = {
      consent: true,
      accessGranted: true,
      identity: { key: "local-test", source: "local_test" as const, globallyEnforceable: false },
      rateLimiter: new MemoryRateLimiter(),
      concurrencyLimiter,
      budget
    };
    const first = await guardGptRequest(common);
    const second = await guardGptRequest(common);
    const third = await guardGptRequest(common);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third).toEqual({ allowed: false, code: "concurrency_limited" });
    if (first.allowed) {
      await first.lease.release();
      await first.lease.release();
    }
    expect((await guardGptRequest(common)).allowed).toBe(true);
  });

  it("allows and releases the first 10 requests in a minute, then rejects the 11th", async () => {
    const concurrencyLimiter = new MemoryConcurrencyLimiter();
    const input = {
      consent: true,
      accessGranted: true,
      identity,
      rateLimiter: new MemoryRateLimiter(() => 1_000),
      concurrencyLimiter,
      budget
    };

    for (let request = 1; request <= 10; request += 1) {
      // eslint-disable-next-line no-await-in-loop -- each completed request releases its lease.
      const result = await guardGptRequest(input);
      expect(result.allowed, `request ${request}`).toBe(true);
      if (result.allowed) {
        // eslint-disable-next-line no-await-in-loop -- release models route finally semantics.
        await result.lease.release();
      }
    }

    expect(await guardGptRequest(input)).toEqual({ allowed: false, code: "rate_limited" });
  });

  it("allows 60 requests across minute windows and retains minute tokens after hour rejection", async () => {
    let now = 0;
    const memoryRateLimiter = new MemoryRateLimiter(() => now);
    const consume = vi.fn(memoryRateLimiter.consume.bind(memoryRateLimiter));
    const input = {
      consent: true,
      accessGranted: true,
      identity,
      rateLimiter: { consume },
      concurrencyLimiter: new MemoryConcurrencyLimiter(),
      budget
    };

    for (let request = 0; request < 60; request += 1) {
      now = Math.floor(request / 10) * 60_000;
      // eslint-disable-next-line no-await-in-loop -- each completed request releases its lease.
      const result = await guardGptRequest(input);
      expect(result.allowed, `request ${request + 1}`).toBe(true);
      if (result.allowed) {
        // eslint-disable-next-line no-await-in-loop -- release models route finally semantics.
        await result.lease.release();
      }
    }

    now = 360_000;
    consume.mockClear();
    expect(await guardGptRequest(input)).toEqual({ allowed: false, code: "rate_limited" });
    expect(consume.mock.calls.map(([request]) => request.scope)).toEqual([
      "gpt_minute",
      "gpt_hour"
    ]);

    consume.mockClear();
    for (let request = 0; request < 9; request += 1) {
      // eslint-disable-next-line no-await-in-loop -- sequential requests fill the minute window.
      expect(await guardGptRequest(input)).toEqual({ allowed: false, code: "rate_limited" });
    }
    expect(consume).toHaveBeenCalledTimes(18);

    consume.mockClear();
    expect(await guardGptRequest(input)).toEqual({ allowed: false, code: "rate_limited" });
    expect(consume.mock.calls.map(([request]) => request.scope)).toEqual(["gpt_minute"]);
  });

  it("fails closed when rate or concurrency adapters throw", async () => {
    const rateFailure = await guardGptRequest({
      consent: true,
      accessGranted: true,
      identity,
      rateLimiter: {
        async consume() {
          throw new Error("offline");
        }
      },
      concurrencyLimiter: new MemoryConcurrencyLimiter(),
      budget
    });
    const concurrencyFailure = await guardGptRequest({
      consent: true,
      accessGranted: true,
      identity,
      rateLimiter: new MemoryRateLimiter(),
      concurrencyLimiter: {
        async acquire() {
          throw new Error("offline");
        }
      },
      budget
    });
    expect(rateFailure).toEqual({ allowed: false, code: "budget_restricted" });
    expect(concurrencyFailure).toEqual({ allowed: false, code: "budget_restricted" });
  });

  it("uses sliding windows and returns a positive retry delay", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    const input = { key: "client", scope: "gpt_minute" as const, limit: 1, windowMs: 60_000 };
    expect(await limiter.consume(input)).toMatchObject({ allowed: true });
    now = 58_001;
    expect(await limiter.consume(input)).toMatchObject({ allowed: false, retryAfterSeconds: 2 });
    now = 59_999;
    expect(await limiter.consume(input)).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    now = 60_000;
    expect(await limiter.consume(input)).toMatchObject({ allowed: true });
  });

  it("rejects invalid memory limiter configuration", async () => {
    await expect(
      new MemoryRateLimiter().consume({ key: "x", scope: "gpt_minute", limit: 0, windowMs: 1 })
    ).rejects.toThrow(RangeError);
    await expect(new MemoryConcurrencyLimiter().acquire("x", 0)).rejects.toThrow(RangeError);
  });
});
