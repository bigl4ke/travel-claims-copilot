import type { Page } from "@playwright/test";

import {
  parseAnalyzeClaimRequest,
  type AnalyzeClaimRequest,
  type AnalyzeClaimResponse
} from "../../../lib/api/analyze-contract";
import type { ApiErrorEnvelope } from "../../../lib/api/api-response";

const MAX_MOCK_DELAY_MS = 10_000;

type MockAnalyzeResult =
  | { response: AnalyzeClaimResponse; error?: never }
  | { response?: never; error: { status: number; envelope: ApiErrorEnvelope } };

export type MockAnalyzeStep = MockAnalyzeResult & {
  delayMs?: number;
  assertRequest?: (request: AnalyzeClaimRequest) => void | Promise<void>;
};

function toSteps(
  responses: AnalyzeClaimResponse | readonly MockAnalyzeStep[]
): readonly MockAnalyzeStep[] {
  const steps = Array.isArray(responses) ? responses : [{ response: responses }];
  steps.forEach(({ delayMs = 0 }, index) => {
    if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > MAX_MOCK_DELAY_MS) {
      throw new Error(`mock_analysis_step_${index}_delay_is_invalid`);
    }
  });
  return steps;
}

export async function mockAnalysis(
  page: Page,
  responses: AnalyzeClaimResponse | readonly MockAnalyzeStep[]
): Promise<void> {
  const steps = toSteps(responses);
  let callIndex = 0;

  await page.route(
    (url) => url.pathname === "/api/analyze",
    async (route) => {
      const request = route.request();
      const step = steps[callIndex];
      callIndex += 1;

      if (!step) {
        await route.abort("failed");
        throw new Error(`unexpected_analyze_call_${callIndex}`);
      }
      if (request.method() !== "POST") {
        await route.abort("failed");
        throw new Error("analyze_request_must_use_post");
      }
      if (!request.headers()["content-type"]?.toLowerCase().includes("application/json")) {
        await route.abort("failed");
        throw new Error("analyze_request_must_use_json");
      }

      let candidate: unknown;
      try {
        candidate = JSON.parse(request.postData() ?? "");
      } catch {
        await route.abort("failed");
        throw new Error("analyze_request_body_must_be_json");
      }
      const parsed = parseAnalyzeClaimRequest(candidate);
      if (!parsed.success) {
        await route.abort("failed");
        throw new Error(`invalid_analyze_request:${parsed.errors.join("|")}`);
      }

      await step.assertRequest?.(parsed.data);
      if (step.delayMs) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, step.delayMs);
        });
      }
      if (step.error) {
        await route.fulfill({
          status: step.error.status,
          contentType: "application/json",
          body: JSON.stringify(step.error.envelope)
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(step.response)
      });
    }
  );
}
