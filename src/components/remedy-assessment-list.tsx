import type {
  ConditionViewModel,
  RemedyAssessmentViewModel,
  RequestOptionViewModel
} from "../../lib/analysis-view-model";
import type { RemedyStatus } from "../../lib/domain/claim-contract";

export type RemedyAssessmentListProps = { assessments: RemedyAssessmentViewModel[] };
export type ConditionListProps = { title: string; items: ConditionViewModel[] };
export type EvidenceSummaryProps = { evidence: RemedyAssessmentViewModel["evidence"] };
export type RequestOptionsProps = { items: RequestOptionViewModel[] };

export const REMEDY_STATUS_LABELS: Record<RemedyStatus, string> = {
  supported: "Supported by current facts",
  conditional: "Conditional — review missing facts",
  not_applicable: "Not applicable on current facts"
};

const toneLabels: Record<RequestOptionViewModel["tone"], string> = {
  conservative: "Conservative",
  standard: "Standard",
  assertive: "Assertive"
};

export function ConditionList({ title, items }: ConditionListProps) {
  return (
    <section aria-label={title}>
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm leading-6 text-ink/70">
          {items.map((item) => (
            <li className="rounded-lg bg-paper p-3" key={item.id}>
              <span className="font-medium text-ink">{item.label}</span>
              {item.factPaths.length > 0 ? (
                <span className="mt-1 block text-xs text-ink/50">
                  Facts: {item.factPaths.join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink/55">None identified</p>
      )}
    </section>
  );
}

export function EvidenceSummary({ evidence }: EvidenceSummaryProps) {
  return (
    <section aria-label="Evidence status" className="rounded-lg bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink">Evidence status</h4>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-ink/70">
          {evidence.status}
        </span>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">Held</h5>
          <p className="mt-1 text-sm text-ink/70">
            {evidence.held.length > 0 ? evidence.held.join(", ") : "None identified"}
          </p>
        </div>
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">Missing</h5>
          <p className="mt-1 text-sm text-ink/70">
            {evidence.missing.length > 0 ? evidence.missing.join(", ") : "None identified"}
          </p>
        </div>
      </div>
    </section>
  );
}

export function RequestOptions({ items }: RequestOptionsProps) {
  return (
    <section aria-label="Request options">
      <h4 className="text-sm font-semibold text-ink">Request options</h4>
      {items.length > 0 ? (
        <div className="mt-2 grid gap-3">
          {items.map((item) => (
            <div className="rounded-lg border border-ink/10 bg-white p-4" key={item.tone}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="font-semibold text-ink">{toneLabels[item.tone]}</h5>
                <span className="text-xs font-medium text-ink/55">
                  {REMEDY_STATUS_LABELS[item.remedyStatus]}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink/70">{item.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink/55">None identified</p>
      )}
    </section>
  );
}

export function RemedyAssessmentList({ assessments }: RemedyAssessmentListProps) {
  if (assessments.length === 0) return null;
  return (
    <section aria-labelledby="remedies-title">
      <h2
        className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/55"
        id="remedies-title"
      >
        Rights and request options
      </h2>
      <div className="mt-3 space-y-4">
        {assessments.map((item) => (
          <article
            aria-labelledby={`remedy-${item.remedyId}`}
            className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"
            key={item.remedyId}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="text-lg font-semibold text-ink" id={`remedy-${item.remedyId}`}>
                {item.title}
              </h3>
              <span className="w-fit rounded-full bg-mint/10 px-2.5 py-1 text-xs font-semibold text-mint">
                {REMEDY_STATUS_LABELS[item.status]}
              </span>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <ConditionList items={item.matchedConditions} title="Matched conditions" />
              <ConditionList items={item.missingConditions} title="Missing conditions" />
              <ConditionList items={item.exclusions} title="Exclusions" />
            </div>
            <div className="mt-5 space-y-5">
              <EvidenceSummary evidence={item.evidence} />
              <RequestOptions items={item.requestOptions} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
