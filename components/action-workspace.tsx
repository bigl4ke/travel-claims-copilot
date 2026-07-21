import type { ClaimFacts } from "../lib/claimFacts";
import type { ActionPlan, ActionScriptChannel, GeneratedActionScript } from "../lib/types";

type ActionWorkspaceProps = {
  plan: ActionPlan;
  facts: ClaimFacts;
  script: GeneratedActionScript | null;
  copied: boolean;
  actionMode: "script" | "feedback" | null;
  scriptError: string;
  onRequestScript: (channel: ActionScriptChannel) => void;
  onCopyScript: () => void;
};

const channelLabels: Record<ActionScriptChannel, string> = {
  front_desk: "Front desk script",
  airport_counter: "Counter script",
  phone: "Phone script",
  chat: "Chat script",
  email: "Email draft",
  corporate_escalation: "Escalation email"
};

function channelsFor(plan: ActionPlan): ActionScriptChannel[] {
  if (plan.situation === "hotel_walk") {
    return ["front_desk", "phone", "corporate_escalation"];
  }
  if (plan.situation === "close_in_irrops") {
    return ["airport_counter", "chat", "phone"];
  }
  return ["email", "phone", "chat"];
}

function locationLabel(location: ClaimFacts["origin"]): string {
  return location.airport ?? location.city ?? location.country ?? "";
}

function caseLine(facts: ClaimFacts): string {
  const route = [locationLabel(facts.origin), locationLabel(facts.destination)]
    .filter(Boolean)
    .join(" → ");
  return [
    facts.provider ?? facts.operatingCarrier,
    facts.disruptionType === "unknown" ? null : facts.disruptionType.replaceAll("_", " "),
    route
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ActionWorkspace({
  plan,
  facts,
  script,
  copied,
  actionMode,
  scriptError,
  onRequestScript,
  onCopyScript
}: ActionWorkspaceProps) {
  const channels = channelsFor(plan);
  const contactName = plan.contactNow.name ?? plan.contactNow.role.replaceAll("_", " ");

  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_24px_70px_-46px_rgba(23,32,42,0.55)]">
      <div className="bg-ink px-5 py-6 text-white md:px-7 md:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mint">
            What to do now
          </p>
          <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
            {plan.status === "actionable" ? "Ready to act" : "Needs context"}
          </span>
        </div>
        <h2 className="mt-5 max-w-2xl text-2xl font-semibold leading-tight md:text-4xl">
          {plan.headline}
        </h2>
        <p className="mt-3 text-xs font-medium uppercase tracking-[0.1em] text-white/45">
          {caseLine(facts)}
        </p>
      </div>

      <div className="grid border-b border-ink/10 md:grid-cols-[0.8fr_1.2fr]">
        <div className="border-b border-ink/10 p-5 md:border-b-0 md:border-r md:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
            01 · Contact now
          </p>
          <p className="mt-3 text-xl font-semibold capitalize text-ink">{contactName}</p>
          <p className="mt-2 text-sm leading-6 text-ink/60">{plan.contactNow.reason}</p>
        </div>

        <div className="bg-mint/[0.055] p-5 md:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mint">
            02 · Ask first
          </p>
          <p className="mt-3 text-lg font-semibold leading-7 text-ink">
            {plan.primaryAsk ?? "Confirm the missing context before making a request."}
          </p>
          {plan.askNext.length > 0 ? (
            <details className="mt-4 text-sm text-ink/65">
              <summary className="cursor-pointer font-semibold text-ink/70">
                If that is not possible
              </summary>
              <ol className="mt-3 space-y-2 border-l border-mint/30 pl-4 leading-6">
                {plan.askNext.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      </div>

      <div className="grid border-b border-ink/10 md:grid-cols-2">
        <div className="border-b border-ink/10 p-5 md:border-b-0 md:border-r md:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
            03 · Save now
          </p>
          <ul className="mt-4 space-y-3">
            {plan.evidenceNow.map((item) => (
              <li className="flex gap-3 text-sm leading-6 text-ink/70" key={item}>
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-5 md:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
            If they say no
          </p>
          {plan.ifTheySayNo.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {plan.ifTheySayNo.map((item, index) => (
                <li className="flex gap-3 text-sm leading-6 text-ink/70" key={item}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-xs font-semibold text-ink/55">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm leading-6 text-ink/55">
              Get a clear written answer before escalating.
            </p>
          )}
        </div>
      </div>

      {plan.uncertainties.length > 0 ? (
        <div className="border-b border-coral/15 bg-coral/[0.045] px-5 py-4 md:px-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-coral">
            Still unresolved
          </p>
          <p className="mt-2 text-sm leading-6 text-ink/65">{plan.uncertainties.join(" ")}</p>
        </div>
      ) : null}

      <div className="border-b border-ink/10 px-5 py-4 md:px-7">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/35">
            References
          </span>
          {plan.references.length > 0 ? (
            plan.references.map((reference) => (
              <a
                className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ink/65 underline decoration-ink/15 underline-offset-4 transition hover:text-mint hover:decoration-mint"
                href={reference.url}
                key={reference.id}
                rel="noreferrer"
                target="_blank"
                title={reference.note}
              >
                <span className="text-[10px] uppercase tracking-[0.1em] text-ink/35 group-hover:text-mint/70">
                  {reference.kind}
                </span>
                {reference.title} ↗
              </a>
            ))
          ) : (
            <span className="text-sm text-ink/45">No grounded source is available yet.</span>
          )}
        </div>
      </div>

      <div className="border-b border-ink/10 bg-paper/55 px-5 py-5 md:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
          Need words for the conversation?
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {channels.map((channel) => (
            <button
              className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-mint hover:text-mint disabled:cursor-wait disabled:opacity-45"
              disabled={actionMode !== null || plan.status !== "actionable"}
              key={channel}
              type="button"
              onClick={() => onRequestScript(channel)}
            >
              {actionMode === "script" ? "Writing…" : channelLabels[channel]}
            </button>
          ))}
        </div>

        {script ? (
          <div className="mt-4 rounded-xl border border-mint/20 bg-white p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mint">
                {channelLabels[script.channel]}
              </p>
              <button
                className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/65 transition hover:border-mint hover:text-mint"
                type="button"
                onClick={onCopyScript}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink/75">{script.text}</p>
            <p className="mt-3 text-xs leading-5 text-ink/40">{script.disclaimer}</p>
          </div>
        ) : null}
        {scriptError ? (
          <p className="mt-3 text-sm font-medium text-coral" role="alert">
            {scriptError}
          </p>
        ) : null}
        <p className="mt-5 border-t border-ink/10 pt-4 text-xs leading-5 text-ink/35">
          Informational guidance only—not legal advice or a promise of compensation.
        </p>
      </div>
    </section>
  );
}
