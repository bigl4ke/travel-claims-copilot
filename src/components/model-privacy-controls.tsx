"use client";

import type { ExtractionMetadata, ExtractionMode } from "../../lib/domain/claim-contract";

export type ModelPrivacyControlsProps = {
  mode: ExtractionMode;
  acknowledged: boolean;
  accessCode: string;
  disabled: boolean;
  actualExtraction: ExtractionMetadata | null;
  onModeChange(mode: ExtractionMode): void;
  onAcknowledgedChange(value: boolean): void;
  onAccessCodeChange(value: string): void;
};

const fallbackExplanations: Record<string, string> = {
  openai_extractor_unavailable:
    "GPT extraction was unavailable, so Local extraction completed this request.",
  model_timeout: "GPT timed out, so Local extraction completed this request.",
  upstream_rate_limited:
    "GPT was temporarily rate limited, so Local extraction completed this request.",
  upstream_unavailable:
    "GPT was temporarily unavailable, so Local extraction completed this request.",
  invalid_model_json:
    "GPT returned an unusable response, so Local extraction completed this request.",
  invalid_model_schema:
    "GPT returned an invalid structure, so Local extraction completed this request."
};

function actualExtractionCopy(extraction: ExtractionMetadata): {
  badge: string;
  explanation: string;
} {
  if (!extraction.performed) {
    return {
      badge: "Not run",
      explanation:
        extraction.notRunReason === "preflight_guard"
          ? "Extraction was not run because the request stopped at the safety preflight."
          : "Extraction was not run because corrected facts were applied directly."
    };
  }
  if (extraction.provider === "openai") {
    return {
      badge: `OpenAI · ${extraction.model}`,
      explanation: "The validated response reports that the canonical OpenAI model ran."
    };
  }
  if (extraction.requestedMode === "gpt") {
    return {
      badge: "Local fallback",
      explanation:
        fallbackExplanations[extraction.fallbackReason] ??
        "GPT was unavailable, so Local extraction completed this request."
    };
  }
  return {
    badge: "Local",
    explanation: "Fact extraction ran locally without sending the message to OpenAI."
  };
}

function ActualExtraction({ extraction }: { extraction: ExtractionMetadata | null }) {
  if (!extraction) return null;
  const copy = actualExtractionCopy(extraction);
  return (
    <section
      aria-labelledby="actual-extraction-title"
      className="rounded-lg border border-mint/20 bg-mint/5 p-3"
      data-testid="actual-extraction"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink" id="actual-extraction-title">
          Actual extraction
        </h3>
        <span
          className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-mint"
          data-testid="actual-extraction-badge"
        >
          {copy.badge}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink/60" data-testid="extraction-explanation">
        {copy.explanation}
      </p>
    </section>
  );
}

export function ModelPrivacyControls({
  mode,
  acknowledged,
  accessCode,
  disabled,
  actualExtraction,
  onModeChange,
  onAcknowledgedChange,
  onAccessCodeChange
}: ModelPrivacyControlsProps) {
  const gptBlocked = mode === "gpt" && (!acknowledged || accessCode.trim().length === 0);

  return (
    <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
      <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold text-ink">Fact extraction</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper p-3 text-sm font-medium text-ink">
            <input
              checked={mode === "local"}
              name="extraction-mode"
              onChange={() => onModeChange("local")}
              type="radio"
            />
            Local
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper p-3 text-sm font-medium text-ink">
            <input
              checked={mode === "gpt"}
              name="extraction-mode"
              onChange={() => onModeChange("gpt")}
              type="radio"
            />
            GPT-5.6 Luna
          </label>
        </div>

        {mode === "gpt" ? (
          <div className="mt-4 space-y-3">
            <div className="space-y-2" id="gpt-privacy-description">
              <p className="text-xs leading-5 text-ink/60">
                The redacted current message and only the necessary structured facts are sent to
                OpenAI with store: false.
              </p>
              <p className="text-xs leading-5 text-ink/60">
                Do not enter names, ticket, reservation, membership, or payment numbers.
              </p>
              <p className="text-xs leading-5 text-ink/60">
                Raw narratives are not intentionally persisted. Application logs exclude raw
                messages, complete facts, secrets, and access codes.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm font-medium text-ink">
              <input
                checked={acknowledged}
                className="mt-0.5"
                onChange={(event) => onAcknowledgedChange(event.target.checked)}
                type="checkbox"
              />
              I understand
            </label>
            <label className="block text-sm font-semibold text-ink" htmlFor="judge-access-code">
              Judge access code
            </label>
            <input
              aria-describedby="gpt-privacy-description"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-ink/15 bg-paper px-3 text-sm"
              id="judge-access-code"
              onChange={(event) => onAccessCodeChange(event.target.value)}
              spellCheck={false}
              type="password"
              value={accessCode}
            />
            {gptBlocked ? (
              <p className="text-xs font-medium leading-5 text-coral" role="status">
                Acknowledge privacy and enter the judge code to use GPT.
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>
      <div className="mt-4">
        <ActualExtraction extraction={actualExtraction} />
      </div>
    </div>
  );
}
