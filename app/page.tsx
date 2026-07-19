"use client";

import { useState } from "react";

import type { ClaimFacts } from "../lib/claimFacts";
import type { IntakeExtractionMode, IntakeResult } from "../lib/intake";
import type {
  AnalysisResult,
  Case,
  Policy,
  PolicyApplicabilityAssessment,
  Script,
  SuggestedAsks
} from "../lib/types";

const exampleText =
  "My Air France flight from Paris was cancelled. I was rerouted and arrived at my final destination four hours late.";

type ConversationMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const initialMessages: ConversationMessage[] = [
  {
    id: "intake-welcome",
    role: "assistant",
    content:
      "Tell me what happened in your own words. I’ll ask only for details that change the policy or case search."
  }
];

const issueLabels: Partial<Record<AnalysisResult["issueType"], string>> = {
  hotel_walk: "Hotel walk",
  airline_cancellation: "Airline cancellation",
  airline_delay: "Airline delay",
  denied_boarding: "Denied boarding or voluntary bump",
  baggage_delay: "Baggage delay",
  airline_delay_trip_insurance: "Airline delay and trip insurance",
  airline_baggage_not_checked: "Baggage not accepted at check-in",
  airline_rebooking_mixed_carrier_delay: "Mixed-carrier rebooking delay",
  hotel_billing_dispute: "Hotel billing dispute",
  hotel_service_issue: "Hotel service issue",
  hotel_property_loss: "Hotel property loss",
  hotel_relocation_before_opening: "Hotel relocation before opening",
  hotel_room_feature_mismatch: "Hotel room feature mismatch",
  hotel_elite_benefit_closure: "Hotel elite benefit closure",
  unknown: "Needs more detail"
};

const strengthStyles: Record<AnalysisResult["strength"], string> = {
  high: "bg-mint text-white",
  medium: "bg-coral text-white",
  low: "bg-ink text-white"
};

export default function Home() {
  const [draft, setDraft] = useState(exampleText);
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const [facts, setFacts] = useState<ClaimFacts | null>(null);
  const [extractionMode, setExtractionMode] = useState<IntakeExtractionMode | null>(null);
  const [intakeWarning, setIntakeWarning] = useState<IntakeResult["warning"]>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);

  async function submitIntake(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isLoading) {
      return;
    }

    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setIsLoading(true);
    setError("");
    setCopiedScriptId(null);
    setResult(null);

    try {
      const intakeResponse = await fetch("/api/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message, facts })
      });
      const intake = (await intakeResponse.json()) as IntakeResult & { error?: string };

      if (!intakeResponse.ok) {
        throw new Error(intake.error ?? "Intake failed.");
      }

      setFacts(intake.facts);
      setExtractionMode(intake.extractionMode);
      setIntakeWarning(intake.warning);

      if (intake.status === "needs_info") {
        setMessages([
          ...nextMessages,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: intake.question ?? "Please add a little more detail."
          }
        ]);
        return;
      }

      const description = nextMessages
        .filter((item) => item.role === "user")
        .map((item) => item.content)
        .join("\n");
      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ description, facts: intake.facts })
      });
      const analysis = (await analyzeResponse.json()) as AnalysisResult & { error?: string };

      if (!analyzeResponse.ok) {
        throw new Error(analysis.error ?? "Analysis failed.");
      }

      setResult(analysis);
      setMessages([
        ...nextMessages,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            "I have enough detail for the first-pass analysis. Review the extracted facts and the grounded references below."
        }
      ]);
    } catch (caughtError) {
      setResult(null);
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetClaim() {
    setDraft("");
    setMessages(initialMessages);
    setFacts(null);
    setExtractionMode(null);
    setIntakeWarning(undefined);
    setResult(null);
    setError("");
    setCopiedScriptId(null);
  }

  async function copyScript(script: Script) {
    await navigator.clipboard.writeText(script.template);
    setCopiedScriptId(script.script_id);
  }

  return (
    <main className="min-h-screen">
      <section className="border-b border-ink/10 bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-mint">
                Travel Claims Copilot · Guided intake
              </p>
              <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-ink md:text-5xl">
                Build the case file before making the ask.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-ink/65 md:text-base">
                Describe the disruption naturally. The intake will identify missing facts before
                searching official sources, reviewed cases, and reusable scripts.
              </p>
            </div>
            <button
              className="w-fit rounded-full border border-ink/15 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/65 transition hover:border-coral hover:text-coral"
              type="button"
              onClick={resetClaim}
            >
              New claim
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-ink/10 bg-ink px-5 py-3 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">Intake transcript</p>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                {isLoading ? "Reviewing details" : result ? "Analysis ready" : "Collecting facts"}
              </span>
            </div>

            <div className="max-h-96 space-y-4 overflow-y-auto px-5 py-5 md:px-7" aria-live="polite">
              {messages.map((item, index) => (
                <article
                  className="grid gap-2 md:grid-cols-[92px_1fr]"
                  key={item.id}
                >
                  <p className="pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
                    {index + 1}. {item.role === "assistant" ? "Copilot" : "You"}
                  </p>
                  <p
                    className={`rounded-lg border px-4 py-3 text-sm leading-6 md:text-base ${
                      item.role === "assistant"
                        ? "border-mint/20 bg-mint/5 text-ink/75"
                        : "border-ink/10 bg-paper text-ink"
                    }`}
                  >
                    {item.content}
                  </p>
                </article>
              ))}
            </div>

            <form
              className="grid gap-3 border-t border-ink/10 bg-paper/70 p-4 md:grid-cols-[1fr_auto] md:items-end md:p-5"
              onSubmit={submitIntake}
            >
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
                  Your answer
                </span>
                <textarea
                  className="min-h-28 w-full resize-y rounded-lg border border-ink/15 bg-white p-4 text-base leading-7 text-ink shadow-sm outline-none transition focus:border-mint focus:ring-4 focus:ring-mint/15"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Describe what happened, or answer the follow-up question."
                />
              </label>
              <button
                className="h-12 rounded-lg bg-ink px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/40 md:w-36"
                type="submit"
                disabled={isLoading || !draft.trim()}
              >
                {isLoading ? "Reviewing" : facts ? "Continue" : "Start intake"}
              </button>
            </form>
          </div>

          {error ? (
            <div className="rounded-lg border border-coral/30 bg-white px-4 py-3 text-sm font-medium text-coral">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-4">
          <ClaimSnapshot
            facts={facts}
            extractionMode={extractionMode}
            warning={intakeWarning}
          />
          <SummaryPanel result={result} />
          {result ? <SuggestedAsks asks={result.suggestedAsks} /> : null}
        </aside>

        <div className="flex flex-col gap-5">
          {!result ? (
            <EmptyState />
          ) : (
            <>
              <PolicySection
                policies={result.officialBasis}
                assessments={result.policyAssessments}
              />
              <CaseSection cases={result.similarCases} />
              <Checklist title="Evidence checklist" items={result.evidenceChecklist} />
              <ScriptSection
                scripts={result.scripts}
                copiedScriptId={copiedScriptId}
                onCopy={copyScript}
              />
              <Checklist title="Cautions" items={result.cautions} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-ink/20 bg-white p-8 text-center text-ink/65">
      Complete the guided intake to retrieve official references, reviewed cases, and scripts.
    </div>
  );
}

function ClaimSnapshot({
  facts,
  extractionMode,
  warning
}: {
  facts: ClaimFacts | null;
  extractionMode: IntakeExtractionMode | null;
  warning?: IntakeResult["warning"];
}) {
  const route = facts
    ? [formatLocation(facts.origin), formatLocation(facts.destination)].filter(Boolean).join(" → ")
    : "";

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">
          Case file
        </h2>
        {extractionMode ? (
          <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55">
            {extractionMode === "llm" ? "LLM" : "Local"}
          </span>
        ) : null}
      </div>

      {facts ? (
        <dl className="mt-4 space-y-3 text-sm">
          <FactRow label="Issue" value={issueLabels[facts.issueType] ?? "Needs more detail"} />
          <FactRow label="Provider" value={facts.provider ?? facts.operatingCarrier ?? "Unknown"} />
          <FactRow label="Route" value={route || "Unknown"} />
          <FactRow
            label="Event"
            value={facts.disruptionType.replaceAll("_", " ")}
          />
        </dl>
      ) : (
        <p className="mt-4 text-sm leading-6 text-ink/65">
          Facts will appear here as the conversation becomes specific enough to search.
        </p>
      )}

      {warning ? (
        <p className="mt-4 border-l-2 border-coral/50 pl-3 text-xs leading-5 text-ink/60">
          {warning === "llm_not_configured"
            ? "Using the local fallback because no server-side LLM key is configured."
            : "The LLM response failed validation, so this turn used the local fallback."}
        </p>
      ) : null}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 border-b border-ink/5 pb-3 last:border-0 last:pb-0">
      <dt className="text-ink/45">{label}</dt>
      <dd className="font-medium capitalize text-ink">{value}</dd>
    </div>
  );
}

function formatLocation(location: ClaimFacts["origin"]): string {
  return location.airport ?? location.city ?? location.country ?? "";
}

function SummaryPanel({ result }: { result: AnalysisResult | null }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">Result</h2>
      {result ? (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <p className="text-sm text-ink/60">Issue type</p>
            <p className="mt-1 text-xl font-semibold text-ink">
              {issueLabels[result.issueType] ?? result.issueType.replaceAll("_", " ")}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink/60">Claim strength</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${strengthStyles[result.strength]}`}
            >
              {result.strength}
            </span>
          </div>
          <div className="grid gap-2 border-t border-ink/5 pt-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Route regions</span>
              <span className="text-right font-medium text-ink">
                {result.policyRegions.length > 0
                  ? result.policyRegions.join(", ").replaceAll("_", " ")
                  : "Unresolved"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Legal regimes</span>
              <span className="text-right font-medium text-ink">
                {result.legalRegimes.length > 0
                  ? result.legalRegimes.join(", ").replaceAll("_", " ")
                  : "Unresolved"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Controllability</span>
              <span className="font-medium capitalize text-ink">
                {result.controllability}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-ink/65">
          The classification and retrieval results will appear here.
        </p>
      )}
    </div>
  );
}

function SuggestedAsks({ asks }: { asks: SuggestedAsks }) {
  const tiers = [
    ["Conservative", asks.conservative],
    ["Standard", asks.standard],
    ["Aggressive", asks.aggressive]
  ] as const;

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">
        Suggested asks
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {tiers.map(([label, items]) => (
          <div key={label}>
            <h3 className="text-sm font-semibold text-ink">{label}</h3>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-ink/70">
              {items.map((item) => (
                <li className="border-l-2 border-mint/40 pl-3" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

const policySourceLabels: Record<Policy["source_type"], string> = {
  official_policy: "Official policy",
  government_regulation: "Government regulation",
  regulator_guidance: "Regulator guidance",
  official_dashboard: "Official dashboard",
  terms: "Official terms"
};

const caseSourceLabels: Record<Case["source_type"], string> = {
  community_dp: "Community report",
  user_submitted: "User submitted",
  synthetic_example: "Synthetic example"
};

const applicabilityStyles: Record<
  PolicyApplicabilityAssessment["status"],
  string
> = {
  met: "border-mint/25 bg-mint/10 text-mint",
  unknown: "border-coral/25 bg-coral/10 text-coral",
  not_met: "border-ink/15 bg-paper text-ink/55"
};

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`rounded-full border border-ink/10 bg-paper px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/60 ${className}`}
    >
      {children}
    </span>
  );
}

function PolicyAssessment({
  assessment
}: {
  assessment: PolicyApplicabilityAssessment | undefined;
}) {
  if (!assessment) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-ink/10 bg-paper/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/55">
          Applicability checks
        </h4>
        <Badge className={applicabilityStyles[assessment.status]}>
          {assessment.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <ul className="mt-3 grid gap-2">
        {assessment.conditions.map((item) => (
          <li className="grid gap-1 text-sm md:grid-cols-[128px_1fr]" key={item.code}>
            <span className="flex items-center gap-2 font-semibold text-ink">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  item.status === "met"
                    ? "bg-mint"
                    : item.status === "unknown"
                      ? "bg-coral"
                      : "bg-ink/30"
                }`}
              />
              {item.status.replaceAll("_", " ")}
            </span>
            <span className="leading-6 text-ink/70">
              <span className="font-medium text-ink/85">{item.label}:</span> {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PolicySection({
  policies,
  assessments
}: {
  policies: Policy[];
  assessments: PolicyApplicabilityAssessment[];
}) {
  const assessmentsByPolicy = new Map(
    assessments.map((assessment) => [assessment.policyId, assessment])
  );

  return (
    <Section title="Official basis">
      {policies.length === 0 ? (
        <FallbackText>No matching official policy found in local demo data.</FallbackText>
      ) : (
        <div className="grid gap-3">
          {policies.map((policy) => (
            <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm" key={policy.policy_id}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-ink">{policy.policy_name}</h3>
                  <p className="text-sm text-ink/60">
                    {policy.provider} · {policy.legal_regime.replaceAll("_", " ")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{policySourceLabels[policy.source_type]}</Badge>
                    <Badge>{policy.authority_level} authority</Badge>
                    <Badge>Checked {policy.last_checked}</Badge>
                  </div>
                </div>
                <a
                  className="text-sm font-semibold text-mint hover:text-coral"
                  href={policy.source_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open official source ↗
                </a>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink/75">{policy.summary}</p>
              <PolicyAssessment assessment={assessmentsByPolicy.get(policy.policy_id)} />
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/55">
                  Source conditions to verify
                </h4>
                <ul className="mt-2 grid gap-1 text-sm leading-6 text-ink/70">
                  {policy.applicable_conditions.map((item) => (
                    <li className="border-l-2 border-ink/10 pl-3" key={item}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <TagList items={policy.compensation_or_rights} />
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function CaseSection({ cases }: { cases: Case[] }) {
  return (
    <Section title="Similar cases">
      {cases.length === 0 ? (
        <FallbackText>No similar local case found yet.</FallbackText>
      ) : (
        <div className="grid gap-3">
          {cases.map((item) => (
            <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm" key={item.case_id}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-ink">{item.brand_or_airline}</h3>
                  <p className="text-sm text-ink/60">
                    {item.provider} · {item.booking_channel} · {item.confidence} record confidence
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      className={
                        item.source_type === "synthetic_example"
                          ? "border-coral/25 bg-coral/10 text-coral"
                          : ""
                      }
                    >
                      {caseSourceLabels[item.source_type]}
                    </Badge>
                    <Badge>{item.source_name}</Badge>
                  </div>
                </div>
                {item.source_url ? (
                  <a
                    className="text-sm font-semibold text-mint hover:text-coral"
                    href={item.source_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open case source ↗
                  </a>
                ) : null}
              </div>
              {item.source_type === "synthetic_example" ? (
                <p className="mt-3 rounded-lg border border-coral/20 bg-coral/5 px-3 py-2 text-xs leading-5 text-ink/65">
                  Illustrative demo record—not a reported traveler outcome or official policy.
                </p>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-ink/75">{item.facts}</p>
              <p className="mt-3 text-sm leading-6 text-ink">
                <span className="font-semibold">
                  {item.source_type === "synthetic_example"
                    ? "Illustrative outcome:"
                    : /outcome (?:was )?not|not fully reported/i.test(item.actual_outcome)
                      ? "Reported status:"
                      : "Reported outcome:"}
                </span>{" "}
                {item.actual_outcome}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink/75">{item.reusable_lesson}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function ScriptSection({
  scripts,
  copiedScriptId,
  onCopy
}: {
  scripts: Script[];
  copiedScriptId: string | null;
  onCopy: (script: Script) => Promise<void>;
}) {
  return (
    <Section title="Scripts">
      {scripts.length === 0 ? (
        <FallbackText>No matching script found in local demo data.</FallbackText>
      ) : (
        <div className="grid gap-3">
          {scripts.map((script) => (
            <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm" key={script.script_id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold capitalize text-ink">
                    {script.channel.replaceAll("_", " ")}
                  </h3>
                  <p className="text-sm text-ink/60">
                    {script.tone.replaceAll("_", " ")} · {script.when_to_use}
                  </p>
                </div>
                <button
                  className="h-10 rounded-lg border border-ink/15 px-4 text-sm font-semibold text-ink transition hover:border-mint hover:text-mint"
                  type="button"
                  onClick={() => onCopy(script)}
                >
                  {copiedScriptId === script.script_id ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-4 rounded-lg bg-paper p-4 text-sm leading-6 text-ink/80">
                {script.template}
              </p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <Section title={title}>
      <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li className="flex gap-3 text-sm leading-6 text-ink/75" key={item}>
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-coral" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">{title}</h2>
      {children}
    </section>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-medium text-mint" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

function FallbackText({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink/20 bg-white p-5 text-sm text-ink/65">
      {children}
    </div>
  );
}
