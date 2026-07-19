import { describe, expect, it, vi } from "vitest";

import { analyzeClaim, parseAnalyzeClaimResponse } from "../src/lib/analysis-api-client";
import {
  analyzeResponseFixture,
  localRequest,
  okAnalyzeResponse
} from "./fixtures/analyze-transport";

function callInit(fetcher: ReturnType<typeof vi.fn>): RequestInit {
  const init = fetcher.mock.calls[0]?.[1];
  if (!init || typeof init !== "object") throw new Error("missing_fetch_init");
  return init as RequestInit;
}

describe("analysis API client credentials", () => {
  it("sends the demo code only in the dedicated header", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      okAnalyzeResponse({
        result: {
          extraction: {
            performed: true,
            requestedMode: "gpt",
            provider: "openai",
            model: "gpt-5.6-luna"
          }
        }
      })
    );
    await analyzeClaim(localRequest({ requestedMode: "gpt", privacyAcknowledged: true }), {
      signal: new AbortController().signal,
      demoAccessCode: "judge-code",
      fetcher
    });

    const init = callInit(fetcher);
    expect(new Headers(init.headers).get("x-demo-access-code")).toBe("judge-code");
    expect(String(init.body)).not.toContain("judge-code");
  });

  it("omits a prior in-memory code when the request switches back to Local", async () => {
    const fetcher = vi.fn().mockResolvedValue(okAnalyzeResponse());
    await analyzeClaim(localRequest({ requestedMode: "local" }), {
      signal: new AbortController().signal,
      demoAccessCode: "prior-judge-code",
      fetcher
    });

    const init = callInit(fetcher);
    expect(new Headers(init.headers).has("x-demo-access-code")).toBe(false);
    expect(String(init.body)).not.toContain("prior-judge-code");
  });
});

describe("analysis extraction metadata", () => {
  const invalidExtractions: Array<{ name: string; value: Record<string, unknown> }> = [
    {
      name: "OpenAI with Local requested mode",
      value: {
        performed: true,
        requestedMode: "local",
        provider: "openai",
        model: "gpt-5.6-luna"
      }
    },
    {
      name: "OpenAI with a null model",
      value: { performed: true, requestedMode: "gpt", provider: "openai", model: null }
    },
    {
      name: "OpenAI with a non-canonical model",
      value: { performed: true, requestedMode: "gpt", provider: "openai", model: "gpt-5" }
    },
    {
      name: "Local with a model",
      value: {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: "gpt-5.6-luna"
      }
    },
    {
      name: "GPT to Local without a fallback reason",
      value: { performed: true, requestedMode: "gpt", provider: "local", model: null }
    },
    {
      name: "Local to Local with a fallback reason",
      value: {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null,
        fallbackReason: "model_timeout"
      }
    },
    {
      name: "not run with a provider",
      value: {
        performed: false,
        requestedMode: "gpt",
        provider: "local",
        model: null,
        notRunReason: "preflight_guard"
      }
    },
    {
      name: "not run with a model",
      value: {
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: "gpt-5.6-luna",
        notRunReason: "preflight_guard"
      }
    },
    {
      name: "not run with a fallback reason",
      value: {
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "preflight_guard",
        fallbackReason: "model_timeout"
      }
    },
    {
      name: "not run with an unknown reason",
      value: {
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "private_policy_reason"
      }
    },
    {
      name: "performed with a not-run reason",
      value: {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null,
        notRunReason: "correction_only"
      }
    }
  ];

  it.each(invalidExtractions)("rejects $name", ({ value }) => {
    const response = analyzeResponseFixture() as unknown as {
      result: { extraction: Record<string, unknown> };
    };
    response.result.extraction = value;

    expect(() =>
      parseAnalyzeClaimResponse(response, { baseRevision: 0, requestKind: "message" })
    ).toThrow("invalid_analysis_response");
  });
});
