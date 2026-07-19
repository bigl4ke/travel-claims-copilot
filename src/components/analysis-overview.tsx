import type { Ref } from "react";

import type {
  AnalysisViewModel,
  DerivedValueViewModel,
  PolicyApplicabilityViewModel
} from "../../lib/analysis-view-model";

export type AnalysisOverviewProps = {
  result: AnalysisViewModel;
  headingRef?: Ref<HTMLHeadingElement>;
};

const statusLabels: Record<AnalysisViewModel["status"], string> = {
  ready: "Assessment ready",
  needs_information: "More information needed",
  out_of_scope: "Outside supported scenarios",
  unsupported_high_risk: "Specialist support recommended"
};

const applicabilityLabels: Record<PolicyApplicabilityViewModel["status"], string> = {
  applicable: "Applicable on current facts",
  conditional: "Conditional — review missing facts",
  not_applicable: "Not applicable on current facts"
};

const provenanceLabels = {
  user_message: "User message",
  user_correction: "User correction",
  deterministic_extraction: "Local extractor",
  openai_extraction: "OpenAI extractor"
} as const;

function displayValue(value: unknown): string {
  if (value === null) return "Unresolved";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "None identified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ");
}

function DerivedItem({ label, item }: { label: string; item: DerivedValueViewModel<unknown> }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-paper/70 p-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">{label}</dt>
      <dd className="mt-1 text-sm font-medium capitalize text-ink">{displayValue(item.value)}</dd>
      <dd className="mt-1 text-xs leading-5 text-ink/55">
        {item.reasons.length > 0 ? item.reasons.join("; ") : "No derivation reason supplied."}
      </dd>
    </div>
  );
}

function TextList({ items, empty = "None identified" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="mt-2 text-sm text-ink/55">{empty}</p>;
  return (
    <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink/70">
      {items.map((item) => (
        <li className="flex gap-2" key={item}>
          <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PolicyApplicabilityItem({ item }: { item: PolicyApplicabilityViewModel }) {
  return (
    <article
      aria-labelledby={`policy-applicability-${item.policyId}`}
      className="rounded-xl border border-ink/10 bg-white p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="font-semibold text-ink" id={`policy-applicability-${item.policyId}`}>
          {item.title}
        </h3>
        <span className="w-fit rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-ink/70">
          {applicabilityLabels[item.status]}
        </span>
      </div>
      {item.applicableCarrier ? (
        <p className="mt-2 text-sm text-ink/60">Applicable carrier: {item.applicableCarrier}</p>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <h4 className="text-sm font-semibold text-ink">Matched</h4>
          <TextList items={item.matchedConditions} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink">Missing</h4>
          <TextList items={item.missingConditions} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink">Exclusions</h4>
          <TextList items={item.exclusions} />
        </div>
      </div>
    </article>
  );
}

function ResultHeader({
  result,
  headingRef
}: {
  result: AnalysisViewModel;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <header className="rounded-xl border border-mint/20 bg-mint/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">
        {statusLabels[result.status]} · facts revision {result.factsRevision}
      </p>
      <h2
        className="mt-2 text-2xl font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-mint"
        data-testid="analysis-result-heading"
        ref={headingRef}
        tabIndex={-1}
      >
        {result.summary}
      </h2>
      <p className="mt-3 text-sm leading-6 text-ink/65">{result.disclaimer}</p>
    </header>
  );
}

export function AnalysisOverview({ result, headingRef }: AnalysisOverviewProps) {
  const blocked = result.status === "out_of_scope" || result.status === "unsupported_high_risk";
  const context = result.derivedContext;
  const blockedGuidance =
    result.cautions.length > 0 ? (
      <section aria-labelledby="blocked-guidance-title" className="rounded-xl bg-white p-5">
        <h3 className="font-semibold text-ink" id="blocked-guidance-title">
          Safe next guidance
        </h3>
        <TextList items={result.cautions} />
      </section>
    ) : null;

  return (
    <div className="space-y-6">
      <ResultHeader headingRef={headingRef} result={result} />

      {blocked ? (
        blockedGuidance
      ) : (
        <>
          <section aria-labelledby="active-scenarios-title" className="rounded-xl bg-white p-5">
            <h2 className="text-lg font-semibold text-ink" id="active-scenarios-title">
              Active scenarios
            </h2>
            <TextList
              empty="No active scenario identified"
              items={result.scenarioIds.map((scenario) => scenario.replaceAll("_", " "))}
            />
          </section>

          <section aria-labelledby="facts-used-title" className="rounded-xl bg-white p-5">
            <h2 className="text-lg font-semibold text-ink" id="facts-used-title">
              Facts used
            </h2>
            {result.factsUsed.length > 0 ? (
              <dl className="mt-4 grid gap-3 md:grid-cols-2">
                {result.factsUsed.map((fact) => (
                  <div className="rounded-lg bg-paper p-3" key={fact.path}>
                    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">
                      {fact.label}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-ink">
                      {displayValue(fact.value)}
                    </dd>
                    <dd className="mt-1 text-xs text-ink/50">
                      {fact.provenance
                        ? `${provenanceLabels[fact.provenance.source]} · revision ${fact.provenance.factsRevision}`
                        : "Source not recorded"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-ink/55">None identified</p>
            )}
          </section>

          {context ? (
            <section
              aria-labelledby="overview-derived-context-title"
              className="rounded-xl border border-ink/10 bg-white p-5"
            >
              <h2 className="text-lg font-semibold text-ink" id="overview-derived-context-title">
                Server-derived context
              </h2>
              <p className="mt-1 text-sm text-ink/55">
                Read-only values calculated from the accepted facts.
              </p>
              <dl className="mt-4 grid gap-3 md:grid-cols-2">
                <DerivedItem item={context.normalizedProvider} label="Normalized provider" />
                <DerivedItem
                  item={context.normalizedOperatingCarrier}
                  label="Normalized operating carrier"
                />
                <DerivedItem item={context.originRegion} label="Origin region" />
                <DerivedItem item={context.destinationRegion} label="Destination region" />
                <DerivedItem
                  item={context.operatingCarrierRegion}
                  label="Operating-carrier region"
                />
                <DerivedItem item={context.eu261} label="EU261 applicability" />
                <DerivedItem item={context.uk261} label="UK261 applicability" />
                <DerivedItem item={context.controllability} label="Controllability" />
                <div className="rounded-lg border border-ink/10 bg-paper/70 p-3 md:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">
                    Legal regimes
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-ink">
                    {context.legalRegimes.length > 0
                      ? context.legalRegimes.join(", ")
                      : "None identified"}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section aria-labelledby="policy-applicability-title">
            <h2
              className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/55"
              id="policy-applicability-title"
            >
              Policy applicability
            </h2>
            <div className="mt-3 space-y-3">
              {result.policyApplicability.length > 0 ? (
                result.policyApplicability.map((item) => (
                  <PolicyApplicabilityItem item={item} key={item.policyId} />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-ink/20 bg-white p-5 text-sm text-ink/60">
                  No policy applicability record was identified.
                </p>
              )}
            </div>
          </section>

          {result.cautions.length > 0 ? (
            <section aria-labelledby="analysis-cautions-title" className="rounded-xl bg-white p-5">
              <h2 className="text-lg font-semibold text-ink" id="analysis-cautions-title">
                Cautions
              </h2>
              <TextList items={result.cautions} />
            </section>
          ) : null}

          {result.nextActions.map((action) => (
            <section
              className="rounded-xl border border-coral/25 bg-coral/5 p-5"
              data-testid="primary-next-action"
              key={action.title}
            >
              <h2 className="text-lg font-semibold text-ink">{action.title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink/70">{action.detail}</p>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
