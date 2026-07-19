import type { FormEvent } from "react";

import type { AnalysisApiError } from "../lib/analysis-api-client";

export type IntakePanelProps = {
  message: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  error: AnalysisApiError | null;
  onMessageChange(message: string): void;
  onSubmit(message: string): Promise<void>;
  onReset(): void;
};

export function IntakePanel({
  message,
  isSubmitting,
  canSubmit,
  error,
  onMessageChange,
  onSubmit,
  onReset
}: IntakePanelProps) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(message);
  }

  return (
    <div className="sticky top-6 space-y-3">
      <form className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm" onSubmit={submit}>
        <label className="block" htmlFor="claim-message">
          <span className="text-sm font-semibold text-ink">What happened?</span>
          <span className="mt-1 block text-xs leading-5 text-ink/55" id="claim-message-help">
            Do not include names, booking codes, contact details, or payment data.
          </span>
        </label>
        <textarea
          aria-describedby="claim-message-help"
          className="mt-3 min-h-44 w-full resize-y rounded-lg border border-ink/15 bg-paper p-3 text-sm leading-6 text-ink transition focus:border-mint"
          data-testid="claim-message"
          id="claim-message"
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder="Describe the disruption without personal identifiers."
          value={message}
        />
        <button
          className="mt-4 h-11 w-full rounded-lg bg-ink px-5 text-sm font-semibold text-white transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/40"
          disabled={!canSubmit || isSubmitting || !message.trim()}
          type="submit"
        >
          {isSubmitting ? "Analyzing…" : "Analyze claim"}
        </button>
      </form>
      <button
        className="w-full rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/65 transition hover:border-coral hover:text-coral"
        onClick={onReset}
        type="button"
      >
        New claim
      </button>
      {error ? (
        <div className="rounded-lg border border-coral/30 bg-coral/5 p-3" role="alert">
          <p className="text-sm font-semibold text-coral">{error.message}</p>
          {error.requestId ? (
            <p className="mt-1 text-xs text-ink/55">Request ID: {error.requestId}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
