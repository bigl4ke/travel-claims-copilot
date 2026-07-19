import { expect, test } from "./offline-test";

import type { AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import type { FactConflict } from "../../lib/domain/claim-contract";
import { analyzeResponseFixture } from "../fixtures/analyze-transport";
import type { DeepPartial } from "../fixtures/raw-claims";
import { runReadyClaim } from "./helpers/claim-driver";
import { mockAnalysis } from "./helpers/mock-analyze";

const boardingConflict: FactConflict = {
  field: "deniedBoardingKind",
  candidates: [
    { value: "voluntary", source: "deterministic_extraction" },
    { value: "involuntary", source: "openai_extraction" }
  ]
};
const boardingViewConflict = {
  path: "deniedBoardingKind" as const,
  label: "deniedBoardingKind",
  candidates: boardingConflict.candidates
};

function responseAt(
  baseRevision: number,
  revision: number,
  overrides: DeepPartial<AnalyzeClaimResponse> = {}
): AnalyzeClaimResponse {
  const response = analyzeResponseFixture(overrides);
  response.baseRevision = baseRevision;
  response.claimState.revision = revision;
  response.result.factsRevision = revision;
  return response;
}

test("corrects raw facts, clears a field, and preserves conflict context", async ({ page }) => {
  const first = responseAt(0, 1, {
    claimState: {
      facts: {
        deniedBoardingKind: "voluntary",
        origin: { city: "Paris" },
        operatingCarrier: "United"
      },
      conflicts: [boardingConflict],
      unresolvedFields: ["deniedBoardingKind"]
    },
    result: {
      factReview: {
        facts: {
          deniedBoardingKind: "voluntary",
          origin: { city: "Paris" },
          operatingCarrier: "United"
        },
        conflicts: [boardingViewConflict],
        unresolvedFields: ["deniedBoardingKind"]
      }
    }
  });
  const second = responseAt(1, 2, {
    claimState: {
      facts: {
        deniedBoardingKind: "involuntary",
        origin: { city: "London" },
        operatingCarrier: null
      },
      conflicts: [],
      unresolvedFields: []
    },
    result: {
      factReview: {
        facts: {
          deniedBoardingKind: "involuntary",
          origin: { city: "London" },
          operatingCarrier: null
        },
        conflicts: [],
        unresolvedFields: []
      }
    }
  });

  await mockAnalysis(page, [
    { response: first },
    {
      response: second,
      delayMs: 200,
      assertRequest: (request) => {
        expect(request).toMatchObject({
          message: "",
          baseRevision: 1,
          correction: {
            set: { deniedBoardingKind: "involuntary", "origin.city": "London" },
            clear: ["operatingCarrier"]
          }
        });
      }
    }
  ]);
  await page.goto("/");
  await runReadyClaim(page);
  await page.getByRole("button", { name: "Review facts" }).click();

  const conflicts = page.getByRole("region", { name: "Conflicting extractor values" });
  await expect(conflicts).toBeVisible();
  await expect(conflicts.getByText("voluntary · Local extractor", { exact: true })).toBeVisible();
  await expect(
    conflicts.getByText("involuntary · OpenAI extractor", { exact: true })
  ).toBeVisible();
  await page.getByTestId("fact-deniedBoardingKind").selectOption("involuntary");
  await page.getByTestId("fact-origin.city").fill("London");
  await page.getByTestId("clear-operatingCarrier").check();
  await page.getByRole("button", { name: "Save corrected facts" }).click();

  await expect(page.getByText("Updating from corrected facts", { exact: true })).toBeVisible();
  await expect(page.getByText("Updating from corrected facts", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Review facts" }).click();
  await expect(page.getByTestId("fact-deniedBoardingKind")).toHaveValue("involuntary");
  await expect(page.getByTestId("fact-origin.city")).toHaveValue("London");
  await expect(page.getByTestId("fact-operatingCarrier")).toHaveValue("");
});

test("a reset and newer request prevent a delayed correction from restoring old facts", async ({
  page
}) => {
  const first = responseAt(0, 1);
  const stale = responseAt(1, 2, { result: { summary: "STALE CORRECTION RESULT" } });
  const fresh = responseAt(0, 1, { result: { summary: "FRESH RESET RESULT" } });

  await mockAnalysis(page, [
    { response: first },
    { response: stale, delayMs: 600 },
    { response: fresh }
  ]);
  await page.goto("/");
  await runReadyClaim(page);
  await page.getByRole("button", { name: "Review facts" }).click();
  await page.getByTestId("fact-origin.city").fill("London");
  await page.getByRole("button", { name: "Save corrected facts" }).click();
  await page.getByRole("button", { name: "New claim" }).click();
  await page.getByTestId("claim-message").fill("A fresh anonymous cancellation claim.");
  await page.getByRole("button", { name: "Analyze claim" }).click();

  await expect(page.getByText("FRESH RESET RESULT", { exact: true })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("STALE CORRECTION RESULT", { exact: true })).toHaveCount(0);
});
