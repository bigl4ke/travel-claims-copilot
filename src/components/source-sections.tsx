import type { CaseSourceViewModel, PolicySourceViewModel } from "../../lib/analysis-view-model";

type SourceCategory = PolicySourceViewModel["category"] | CaseSourceViewModel["category"];

const SOURCE_LABELS: Record<SourceCategory, string> = {
  government_regulation: "Government regulation",
  regulator_guidance: "Regulatory guidance",
  provider_commitment: "Provider commitment",
  community_report: "Community report",
  user_report: "User report",
  synthetic_example: "Synthetic example"
};

function SourceList({
  title,
  emptyText,
  children
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h2
        className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/55"
        id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
      >
        {title}
      </h2>
      {children ?? (
        <p className="mt-3 rounded-xl border border-dashed border-ink/20 bg-white p-5 text-sm text-ink/60">
          {emptyText}
        </p>
      )}
    </section>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="font-semibold text-ink">{title}</h4>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink/70">
          {items.map((item, index) => (
            <li className="flex gap-2" key={`${title}-${index}-${item}`}>
              <span
                aria-hidden="true"
                className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink/55">None identified</p>
      )}
    </div>
  );
}

export function SourceBadge({ category }: { category: SourceCategory }) {
  return (
    <span className="w-fit rounded-full border border-ink/15 bg-paper px-2.5 py-1 text-xs font-semibold text-ink/75">
      {SOURCE_LABELS[category]}
    </span>
  );
}

function PolicyCard({ source }: { source: PolicySourceViewModel }) {
  const headingId = `policy-source-${source.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"
    >
      <SourceBadge category={source.category} />
      <h3 className="mt-3 text-lg font-semibold text-ink" id={headingId}>
        {source.title}
      </h3>
      <p className="mt-1 text-sm text-ink/60">
        {source.provider} · {source.legalRegime.replaceAll("_", " ")}
      </p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink/50">Authority</dt>
          <dd className="font-medium capitalize text-ink">{source.authority}</dd>
        </div>
        <div>
          <dt className="text-ink/50">Source review</dt>
          <dd className="font-medium text-ink">
            <time dateTime={source.lastChecked}>Last checked {source.lastChecked}</time>
          </dd>
        </div>
        {source.applicableCarrier ? (
          <div>
            <dt className="text-ink/50">Applicable carrier</dt>
            <dd className="font-medium text-ink">{source.applicableCarrier}</dd>
          </div>
        ) : null}
        {source.commitmentId ? (
          <div>
            <dt className="text-ink/50">Commitment ID</dt>
            <dd className="font-medium text-ink">{source.commitmentId}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <DetailList items={source.conditions} title="Applicable conditions" />
        <DetailList items={source.rights} title="Published rights or commitments" />
      </div>
      {source.rankingReasons.length > 0 ? (
        <div className="mt-5">
          <DetailList items={source.rankingReasons} title="Why this source matched" />
        </div>
      ) : null}
      <a
        className="mt-5 inline-flex font-semibold text-mint underline decoration-mint/30 underline-offset-4 hover:text-coral"
        href={source.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        Open {source.title} source
      </a>
    </article>
  );
}

function CaseCard({ source }: { source: CaseSourceViewModel }) {
  const headingId = `case-source-${source.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"
    >
      <SourceBadge category={source.category} />
      <h3 className="mt-3 text-lg font-semibold text-ink" id={headingId}>
        {source.title}
      </h3>
      <p className="mt-1 text-sm text-ink/60">Source: {source.sourceName}</p>
      <p className="mt-4 text-sm leading-6 text-ink/75">{source.facts}</p>
      <div className="mt-4 rounded-lg bg-paper p-4 text-sm leading-6 text-ink/75">
        <p>
          <span className="font-semibold text-ink">Outcome:</span> {source.outcome}
        </p>
        <p className="mt-2 font-medium text-ink/65">
          Outcome completeness: {source.outcomeComplete ? "Complete" : "Incomplete"}
        </p>
      </div>
      {source.category === "synthetic_example" ? (
        <p className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-3 font-medium text-ink">
          Illustrative outcome — not a reported user result
        </p>
      ) : null}
      <p className="mt-4 text-sm leading-6 text-ink/75">
        <span className="font-semibold text-ink">Reusable lesson:</span> {source.reusableLesson}
      </p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <DetailList items={source.reviewNotes} title="Review notes" />
        <DetailList items={source.rankingReasons} title="Why this case matched" />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
        Review status: Approved
      </p>
      {source.url ? (
        <a
          className="mt-4 inline-flex font-semibold text-mint underline decoration-mint/30 underline-offset-4 hover:text-coral"
          href={source.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open {source.title} source
        </a>
      ) : null}
    </article>
  );
}

export function SourceSections({
  officialSources,
  providerCommitments,
  similarCases
}: {
  officialSources: PolicySourceViewModel[];
  providerCommitments: PolicySourceViewModel[];
  similarCases: CaseSourceViewModel[];
}) {
  return (
    <div className="space-y-8">
      <SourceList emptyText="No matching official source was identified." title="Official sources">
        {officialSources.length > 0 ? (
          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            {officialSources.map((source) => (
              <PolicyCard key={source.id} source={source} />
            ))}
          </div>
        ) : null}
      </SourceList>
      <SourceList
        emptyText="No matching provider commitment was identified."
        title="Provider commitments"
      >
        {providerCommitments.length > 0 ? (
          <div className="mt-3 grid gap-4">
            {providerCommitments.map((source) => (
              <PolicyCard key={source.id} source={source} />
            ))}
          </div>
        ) : null}
      </SourceList>
      <SourceList emptyText="No reviewed comparison case was identified." title="Reviewed cases">
        {similarCases.length > 0 ? (
          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            {similarCases.map((source) => (
              <CaseCard key={source.id} source={source} />
            ))}
          </div>
        ) : null}
      </SourceList>
    </div>
  );
}
