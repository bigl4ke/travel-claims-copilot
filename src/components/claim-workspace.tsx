"use client";

import { useState } from "react";

import type { AnalysisViewModel } from "../../lib/analysis-view-model";
import { useClaimAnalysis } from "../hooks/use-claim-analysis";
import { FactReviewPanel } from "./fact-review-panel";
import { IntakePanel } from "./intake-panel";
import { SourceSections } from "./source-sections";

const exampleText = "My flight was cancelled, and I arrived the next day after paying for a hotel.";

function ResultSummary({ result }: { result: AnalysisViewModel }) {
  return (
    <header className="rounded-xl border border-mint/20 bg-mint/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">
        Analysis ready · facts revision {result.factsRevision}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-ink">{result.summary}</h2>
      <p className="mt-3 text-sm leading-6 text-ink/65">{result.disclaimer}</p>
    </header>
  );
}

export function ClaimWorkspace() {
  const [message, setMessage] = useState(exampleText);
  const analysis = useClaimAnalysis();
  const { workflow } = analysis;
  const { result } = workflow;
  const isSubmitting = workflow.phase === "submitting";
  const isUpdating = workflow.phase === "revising";
  const isReviewing = workflow.phase === "reviewing_facts";

  function resetClaim() {
    setMessage("");
    analysis.reset();
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="border-b border-ink/10 bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-mint">
            Travel Claims Copilot · Source-aware review
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
            See what supports each travel claim.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink/65">
            Describe one supported travel disruption. We separate binding rules, regulator guidance,
            provider commitments, reviewed reports, and synthetic examples.
          </p>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 md:px-8 lg:grid-cols-[320px_1fr]">
        <aside>
          <IntakePanel
            canSubmit={analysis.canSubmit}
            error={workflow.error}
            isSubmitting={isSubmitting}
            message={message}
            onMessageChange={setMessage}
            onReset={resetClaim}
            onSubmit={analysis.submitMessage}
          />
        </aside>

        <section aria-label="Claim analysis">
          {result ? (
            <div
              aria-busy={workflow.activeRequest ? "true" : "false"}
              className="space-y-8"
              data-testid="analysis-result"
            >
              {isUpdating ? (
                <p className="rounded-lg border border-mint/20 bg-mint/5 p-3 text-sm font-semibold text-mint">
                  Updating from corrected facts
                </p>
              ) : null}
              {isReviewing && result.factReview ? (
                <FactReviewPanel
                  isUpdating={isUpdating}
                  onCancel={analysis.cancelFactReview}
                  onSubmit={analysis.submitCorrection}
                  result={result}
                />
              ) : (
                <>
                  <ResultSummary result={result} />
                  {result.factReview ? (
                    <button
                      className="rounded-lg border border-ink/15 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-mint hover:text-mint"
                      disabled={isUpdating}
                      onClick={analysis.startFactReview}
                      type="button"
                    >
                      Review facts
                    </button>
                  ) : null}
                  <SourceSections
                    officialSources={result.officialSources}
                    providerCommitments={result.providerCommitments}
                    similarCases={result.similarCases}
                  />
                </>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-ink/20 bg-white p-8 text-center text-sm leading-6 text-ink/60">
              {workflow.phase === "error"
                ? "The analysis could not be displayed. Review the error and try again."
                : "Submit an anonymous claim description to see source-transparent guidance."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
