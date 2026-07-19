"use client";

import { useState } from "react";

import type { PolicySourceViewModel, ScriptViewModel } from "../../lib/analysis-view-model";

export type ScriptListProps = {
  scripts: ScriptViewModel[];
  sources: PolicySourceViewModel[];
};

function validateSourceLookup(
  scripts: readonly ScriptViewModel[],
  sources: readonly PolicySourceViewModel[]
): Map<string, PolicySourceViewModel> {
  const sourceLookup = new Map<string, PolicySourceViewModel>();
  sources.forEach((source) => {
    if (sourceLookup.has(source.id)) throw new Error("duplicate_script_source");
    sourceLookup.set(source.id, source);
  });
  scripts.forEach((script) => {
    script.sourceIds.forEach((sourceId) => {
      if (!sourceLookup.has(sourceId) && process.env.NODE_ENV !== "production") {
        throw new Error("missing_script_source");
      }
    });
  });
  return sourceLookup;
}

function ScriptCard({
  script,
  sourceLookup
}: {
  script: ScriptViewModel;
  sourceLookup: ReadonlyMap<string, PolicySourceViewModel>;
}) {
  const [copyStatus, setCopyStatus] = useState("");

  async function copyScript() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(script.text);
      setCopyStatus("Copied to clipboard");
    } catch {
      setCopyStatus("Copy failed — select the text manually");
    }
  }

  const resolvedSources = script.sourceIds.flatMap((sourceId) => {
    const source = sourceLookup.get(sourceId);
    return source ? [source] : [];
  });

  return (
    <article
      aria-labelledby={`script-${script.id}`}
      className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-ink" id={`script-${script.id}`}>
            {script.title}
          </h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">
            {script.channel} · {script.language}
          </p>
        </div>
        <button
          aria-label={`Copy ${script.title}`}
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-mint hover:text-mint"
          onClick={copyScript}
          type="button"
        >
          Copy script
        </button>
      </div>
      <p className="mt-4 whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm leading-6 text-ink/75">
        {script.text}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {resolvedSources.map((source) => (
          <a
            className="font-semibold text-mint underline decoration-mint/30 underline-offset-4 hover:text-coral"
            href={`#policy-source-${source.id}`}
            key={source.id}
          >
            Grounded in {source.title}
          </a>
        ))}
      </div>
      <p aria-atomic="true" aria-live="polite" className="mt-3 text-sm text-ink/60" role="status">
        {copyStatus}
      </p>
    </article>
  );
}

export function ScriptList({ scripts, sources }: ScriptListProps) {
  if (scripts.length === 0) return null;
  const sourceLookup = validateSourceLookup(scripts, sources);
  return (
    <section aria-labelledby="claim-scripts-title">
      <h2
        className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/55"
        id="claim-scripts-title"
      >
        Claim scripts
      </h2>
      <div className="mt-3 grid gap-4">
        {scripts.map((script) => (
          <ScriptCard key={script.id} script={script} sourceLookup={sourceLookup} />
        ))}
      </div>
    </section>
  );
}
