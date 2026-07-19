"use client";

import type { RawFactPath } from "../../lib/domain/claim-contract";
import type { FeedbackDraft, FeedbackRecord } from "../../lib/feedback";

export type FeedbackPanelProps = {
  draft: FeedbackDraft | null;
  records: readonly FeedbackRecord[];
  allowedFactPaths: readonly RawFactPath[];
  allowedSourceIds: readonly string[];
  onDraftChange(draft: FeedbackDraft | null): void;
  onSubmit(): void;
  onDownload(): void;
};

const MAX_SELECTIONS = 20;

function toggleSelection<T extends string>(items: readonly T[], item: T, checked: boolean): T[] {
  if (!checked) return items.filter((candidate) => candidate !== item);
  if (items.includes(item) || items.length >= MAX_SELECTIONS) return [...items];
  return [...items, item];
}

function factLabel(path: RawFactPath): string {
  return path.replaceAll(".", " ");
}

function hasValidSelection(draft: FeedbackDraft | null): boolean {
  if (!draft) return false;
  if (draft.kind === "helpful") return true;
  if (draft.kind === "fact_error") {
    return draft.factPaths.length > 0 && draft.factPaths.length <= MAX_SELECTIONS;
  }
  return draft.sourceIds.length > 0 && draft.sourceIds.length <= MAX_SELECTIONS;
}

function SelectionList<T extends string>({
  items,
  selected,
  label,
  display,
  onChange
}: {
  items: readonly T[];
  selected: readonly T[];
  label: string;
  display(item: T): string;
  onChange(items: T[]): void;
}) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-ink/55">No current {label.toLowerCase()} to select.</p>;
  }
  return (
    <fieldset className="mt-3 rounded-lg bg-paper p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink/55">
        Select {label}
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const checked = selected.includes(item);
          return (
            <label className="flex items-start gap-2 text-sm text-ink/75" key={item}>
              <input
                checked={checked}
                className="mt-0.5"
                disabled={!checked && selected.length >= MAX_SELECTIONS}
                onChange={(event) =>
                  onChange(toggleSelection(selected, item, event.target.checked))
                }
                type="checkbox"
              />
              <span className="break-all">{display(item)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FeedbackPanel({
  draft,
  records,
  allowedFactPaths,
  allowedSourceIds,
  onDraftChange,
  onSubmit,
  onDownload
}: FeedbackPanelProps) {
  return (
    <section
      aria-labelledby="session-feedback-title"
      className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"
      role="region"
    >
      <h2 className="text-lg font-semibold text-ink" id="session-feedback-title">
        Session feedback
      </h2>
      <p className="mt-1 text-sm leading-6 text-ink/60">
        Saved only in this tab until you explicitly download the bounded JSON record. No free text
        or claim narrative is collected.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink">Choose one fixed action</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper p-3 text-sm font-medium text-ink">
            <input
              checked={draft?.kind === "helpful"}
              name="feedback-kind"
              onChange={() => onDraftChange({ kind: "helpful" })}
              type="radio"
            />
            Helpful
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper p-3 text-sm font-medium text-ink">
            <input
              checked={draft?.kind === "fact_error"}
              name="feedback-kind"
              onChange={() => onDraftChange({ kind: "fact_error", factPaths: [] })}
              type="radio"
            />
            Fact is wrong
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper p-3 text-sm font-medium text-ink">
            <input
              checked={draft?.kind === "source_mismatch"}
              name="feedback-kind"
              onChange={() => onDraftChange({ kind: "source_mismatch", sourceIds: [] })}
              type="radio"
            />
            Source mismatch
          </label>
        </div>
      </fieldset>

      {draft?.kind === "fact_error" ? (
        <SelectionList
          display={factLabel}
          items={allowedFactPaths}
          label="Fact fields"
          onChange={(factPaths) => onDraftChange({ kind: "fact_error", factPaths })}
          selected={draft.factPaths}
        />
      ) : null}
      {draft?.kind === "source_mismatch" ? (
        <SelectionList
          display={(sourceId) => sourceId}
          items={allowedSourceIds}
          label="Source IDs"
          onChange={(sourceIds) => onDraftChange({ kind: "source_mismatch", sourceIds })}
          selected={draft.sourceIds}
        />
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/40"
          disabled={!hasValidSelection(draft)}
          onClick={onSubmit}
          type="button"
        >
          Save feedback in this session
        </button>
        <button
          className="rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:text-ink/35"
          disabled={records.length === 0}
          onClick={onDownload}
          type="button"
        >
          Download feedback JSON
        </button>
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-ink/60">
        {records.length === 1
          ? "1 feedback record saved in this session."
          : `${records.length} feedback records saved in this session.`}
      </p>
    </section>
  );
}
