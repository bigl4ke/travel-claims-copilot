"use client";

import { useState, type FormEvent } from "react";

import type { AnalysisViewModel } from "../../lib/analysis-view-model";
import type {
  RawClaimFacts,
  RawFactPath,
  RawFactValue,
  UserFactEdit
} from "../../lib/domain/claim-contract";
import {
  editFromForm,
  FACT_FIELD_DEFINITIONS,
  type FactFieldDefinition,
  type FactFormValue
} from "../lib/claim-workflow";

export type FactReviewPanelProps = {
  result: AnalysisViewModel;
  isUpdating: boolean;
  onSubmit(correction: UserFactEdit): Promise<void>;
  onCancel(): void;
};

const sectionLabels: Record<FactFieldDefinition["section"], string> = {
  trip: "Trip and provider",
  disruption: "Disruption",
  boarding: "Boarding",
  hotel: "Hotel",
  assistance: "Assistance offered",
  evidence: "Evidence and goal"
};

function valueAtPath(facts: RawClaimFacts, path: RawFactPath): RawFactValue | null {
  const [parent, child] = path.split(".");
  if (!child) return facts[parent as keyof RawClaimFacts] as RawFactValue | null;
  if (parent === "origin" || parent === "destination" || parent === "assistance") {
    return facts[parent][child as keyof (typeof facts)[typeof parent]] as RawFactValue | null;
  }
  return null;
}

function hasClearableValue(value: RawFactValue | null): boolean {
  return value !== null && (!Array.isArray(value) || value.length > 0);
}

function valuesEqual(left: RawFactValue | null, right: FactFormValue): boolean {
  if (Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      left.length === right.length &&
      left.every((item, index) => item === right[index])
    );
  }
  return left === right;
}

function formValue(definition: FactFieldDefinition, raw: FormDataEntryValue | null): FactFormValue {
  const value = typeof raw === "string" ? raw : "";
  if (definition.input.kind === "number") return value;
  if (definition.input.kind === "boolean") return value;
  if (definition.input.kind === "string_list") return value.split("\n");
  return value;
}

function normalizedCandidate(
  definition: FactFieldDefinition,
  raw: FactFormValue
): FactFormValue | null {
  if (definition.input.kind === "string_list") {
    const items = Array.isArray(raw)
      ? [...new Set(raw.map((item) => item.trim()).filter(Boolean))]
      : [];
    return items;
  }
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (definition.input.kind === "number") return Number(trimmed);
  if (definition.input.kind === "boolean") return trimmed === "true";
  return trimmed;
}

function FactControl({
  definition,
  facts
}: {
  definition: FactFieldDefinition;
  facts: RawClaimFacts;
}) {
  const value = valueAtPath(facts, definition.path);
  const inputId = `fact-${definition.path}`;
  let control: React.ReactNode;

  if (definition.input.kind === "boolean") {
    control = (
      <select
        className="mt-1 h-10 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
        data-testid={inputId}
        defaultValue={value === null ? "" : String(value)}
        id={inputId}
        name={`fact:${definition.path}`}
      >
        <option value="">Unknown / unchanged</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else if (definition.input.kind === "enum") {
    control = (
      <select
        className="mt-1 h-10 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
        data-testid={inputId}
        defaultValue={typeof value === "string" ? value : ""}
        id={inputId}
        name={`fact:${definition.path}`}
      >
        <option value="">Unknown / unchanged</option>
        {definition.input.options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    );
  } else if (definition.input.kind === "string_list") {
    control = (
      <textarea
        className="mt-1 min-h-24 w-full rounded-lg border border-ink/15 bg-white p-3 text-sm"
        data-testid={inputId}
        defaultValue={Array.isArray(value) ? value.join("\n") : ""}
        id={inputId}
        name={`fact:${definition.path}`}
      />
    );
  } else {
    control = (
      <input
        className="mt-1 h-10 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
        data-testid={inputId}
        defaultValue={typeof value === "string" || typeof value === "number" ? value : ""}
        id={inputId}
        min={definition.input.kind === "number" ? definition.input.min : undefined}
        name={`fact:${definition.path}`}
        type={definition.input.kind === "number" ? "number" : "text"}
      />
    );
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/60 p-3">
      <label className="text-sm font-semibold text-ink" htmlFor={inputId}>
        {definition.label}
      </label>
      {control}
      <label className="mt-2 flex items-center gap-2 text-xs text-ink/60">
        <input
          data-testid={`clear-${definition.path}`}
          disabled={!hasClearableValue(value)}
          name={`clear:${definition.path}`}
          type="checkbox"
        />
        Clear {definition.label}
      </label>
    </div>
  );
}

function formatDerivedValue(item: { value: unknown; reasons: string[] }): string {
  const { value } = item;
  let display = String(value);
  if (Array.isArray(value)) display = value.join(", ");
  if (value === null) display = "Unresolved";
  return item.reasons.length > 0 ? `${display} — ${item.reasons.join("; ")}` : display;
}

function DerivedContext({
  context
}: {
  context: NonNullable<AnalysisViewModel["derivedContext"]>;
}) {
  const rows = [
    ["Normalized provider", context.normalizedProvider],
    ["Normalized operating carrier", context.normalizedOperatingCarrier],
    ["Origin region", context.originRegion],
    ["Destination region", context.destinationRegion],
    ["Operating-carrier region", context.operatingCarrierRegion],
    ["EU261 applicability", context.eu261],
    ["UK261 applicability", context.uk261],
    ["Controllability", context.controllability]
  ] as const;
  return (
    <section
      aria-labelledby="derived-context-title"
      className="rounded-xl border border-ink/10 bg-white p-5"
    >
      <h3 className="text-lg font-semibold" id="derived-context-title">
        Server-derived context
      </h3>
      <p className="mt-1 text-sm text-ink/55">
        Read-only values are recalculated after corrections.
      </p>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {rows.map(([label, item]) => (
          <div className="rounded-lg bg-paper p-3" key={label}>
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">
              {label}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-ink/75">{formatDerivedValue(item)}</dd>
          </div>
        ))}
        <div className="rounded-lg bg-paper p-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">
            Legal regimes
          </dt>
          <dd className="mt-1 text-sm leading-6 text-ink/75">
            {context.legalRegimes.length > 0 ? context.legalRegimes.join(", ") : "None identified"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ConflictSummary({
  conflicts
}: {
  conflicts: NonNullable<AnalysisViewModel["factReview"]>["conflicts"];
}) {
  if (conflicts.length === 0) return null;
  return (
    <section
      aria-labelledby="fact-conflicts-title"
      className="rounded-xl border border-coral/30 bg-coral/5 p-4"
    >
      <h3 className="font-semibold text-ink" id="fact-conflicts-title">
        Conflicting extractor values
      </h3>
      <div className="mt-3 space-y-3">
        {conflicts.map((conflict) => (
          <article className="text-sm" key={conflict.path}>
            <h4 className="font-medium text-ink">{conflict.label}</h4>
            <ul className="mt-1 flex flex-wrap gap-2 text-ink/70">
              {conflict.candidates.map((candidate) => (
                <li
                  className="rounded-full border border-coral/20 bg-white px-2.5 py-1"
                  key={candidate.source}
                >
                  {Array.isArray(candidate.value)
                    ? candidate.value.join(", ")
                    : String(candidate.value)}
                  {" · "}
                  {candidate.source === "openai_extraction"
                    ? "OpenAI extractor"
                    : "Local extractor"}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FactReviewPanel({ result, isUpdating, onSubmit, onCancel }: FactReviewPanelProps) {
  const [formError, setFormError] = useState("");
  const review = result.factReview;
  if (!review) return null;
  const frozenReview = review;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: Partial<Record<RawFactPath, FactFormValue>> = {};
    const clearPaths: RawFactPath[] = [];
    FACT_FIELD_DEFINITIONS.forEach((definition) => {
      const current = valueAtPath(frozenReview.facts, definition.path);
      if (data.get(`clear:${definition.path}`) === "on" && hasClearableValue(current)) {
        clearPaths.push(definition.path);
        return;
      }
      const candidate = formValue(definition, data.get(`fact:${definition.path}`));
      const normalized = normalizedCandidate(definition, candidate);
      if (normalized !== null && !valuesEqual(current, normalized)) {
        values[definition.path] = candidate;
      }
    });
    try {
      const edit = editFromForm(values, clearPaths);
      if (Object.keys(edit.set).length === 0 && edit.clear.length === 0) {
        setFormError("No fact changes were selected.");
        return;
      }
      setFormError("");
      await onSubmit(edit);
    } catch {
      setFormError("Review the corrected values and try again.");
    }
  }

  return (
    <div className="space-y-6" data-testid="fact-review-panel">
      <ConflictSummary conflicts={review.conflicts} />
      <form className="rounded-xl border border-ink/10 bg-white p-5" onSubmit={submit}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Editable raw facts</h2>
            <p className="mt-1 text-sm text-ink/55">
              Blank text means unchanged. Use the dedicated Clear control to remove a fact.
            </p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mint">
            Revision {result.factsRevision}
          </p>
        </div>
        <div className="mt-6 space-y-7">
          {(Object.keys(sectionLabels) as FactFieldDefinition["section"][]).map((section) => (
            <section aria-labelledby={`fact-section-${section}`} key={section}>
              <h3
                className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/55"
                id={`fact-section-${section}`}
              >
                {sectionLabels[section]}
              </h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {FACT_FIELD_DEFINITIONS.filter((definition) => definition.section === section).map(
                  (definition) => (
                    <FactControl
                      definition={definition}
                      facts={review.facts}
                      key={definition.path}
                    />
                  )
                )}
              </div>
            </section>
          ))}
        </div>
        {formError ? (
          <p className="mt-4 text-sm font-medium text-coral" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white disabled:bg-ink/40"
            disabled={isUpdating}
            type="submit"
          >
            Save corrected facts
          </button>
          <button
            className="rounded-lg border border-ink/15 px-5 py-3 text-sm font-semibold text-ink"
            disabled={isUpdating}
            onClick={onCancel}
            type="button"
          >
            Cancel fact review
          </button>
        </div>
      </form>
      {result.derivedContext ? <DerivedContext context={result.derivedContext} /> : null}
    </div>
  );
}
