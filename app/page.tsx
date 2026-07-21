"use client";

import { useState } from "react";

import { ActionWorkspace, type FeedbackHistoryItem } from "../components/action-workspace";
import type { ClaimFacts } from "../lib/claimFacts";
import type { IntakeExtractionMode, IntakeResult } from "../lib/intake";
import type { SafetyAssessment } from "../lib/safety";
import type {
  ActionPlan,
  ActionScriptChannel,
  AnalysisResult,
  GeneratedActionScript,
  ProviderFeedbackResult
} from "../lib/types";

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
      "Tell me what happened in your own words. I’ll ask only for details that change who to contact or what to do next."
  }
];

const issueLabels: Partial<Record<ClaimFacts["issueType"], string>> = {
  hotel_walk: "Hotel walk",
  airline_cancellation: "Airline cancellation",
  airline_delay: "Airline delay",
  denied_boarding: "Denied boarding",
  unknown: "Collecting facts"
};

function preferredLanguage(messages: ConversationMessage[]): "en" | "zh" {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");
  return /[\u3400-\u9fff]/.test(userText) ? "zh" : "en";
}

function formatLocation(location: ClaimFacts["origin"]): string {
  return location.airport ?? location.city ?? location.country ?? "";
}

function factSummary(facts: ClaimFacts): string[] {
  const route = [formatLocation(facts.origin), formatLocation(facts.destination)]
    .filter(Boolean)
    .join(" → ");
  return [
    issueLabels[facts.issueType],
    facts.provider ?? facts.operatingCarrier,
    route || null,
    facts.providerType === "airline" && facts.disruptionReasonStatus === "unavailable"
      ? "Reason unavailable"
      : null
  ].filter((item): item is string => Boolean(item));
}

export default function Home() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const [facts, setFacts] = useState<ClaimFacts | null>(null);
  const [extractionMode, setExtractionMode] = useState<IntakeExtractionMode | null>(null);
  const [intakeWarning, setIntakeWarning] = useState<IntakeResult["warning"]>();
  const [safetyNotice, setSafetyNotice] = useState<SafetyAssessment | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [actionMode, setActionMode] = useState<"script" | "feedback" | null>(null);
  const [actionError, setActionError] = useState("");
  const [generatedScript, setGeneratedScript] = useState<GeneratedActionScript | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackResult, setFeedbackResult] = useState<ProviderFeedbackResult | null>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackHistoryItem[]>([]);

  async function submitIntake(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isLoading) return;

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
    setSafetyNotice(null);
    setActionPlan(null);
    setGeneratedScript(null);
    setFeedbackResult(null);
    setFeedbackHistory([]);

    try {
      const intakeResponse = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, facts })
      });
      const intake = (await intakeResponse.json()) as IntakeResult & { error?: string };
      if (!intakeResponse.ok) throw new Error(intake.error ?? "Intake failed.");

      setFacts(intake.facts);
      setExtractionMode(intake.extractionMode);
      setIntakeWarning(intake.warning);
      setSafetyNotice(intake.safety ?? null);

      if (intake.status === "unsupported") {
        setMessages([
          ...nextMessages,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content:
              intake.safety?.message ?? "This request is outside the supported scope of the demo."
          }
        ]);
        return;
      }

      if (intake.status === "needs_info") {
        setMessages([
          ...nextMessages,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: intake.question ?? "Please add one more detail."
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, facts: intake.facts })
      });
      const analysis = (await analyzeResponse.json()) as AnalysisResult & { error?: string };
      if (!analyzeResponse.ok) throw new Error(analysis.error ?? "Action planning failed.");
      if (!analysis.actionPlan) throw new Error("No grounded next action is available yet.");

      setActionPlan(analysis.actionPlan);
      setMessages([
        ...nextMessages,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            intake.facts.disruptionReasonStatus === "unavailable"
              ? "I’ll continue with the reason marked unavailable. Your immediate action does not need to wait for it."
              : "I have enough to choose the next move. Start with the action card."
        }
      ]);
    } catch (caughtError) {
      setActionPlan(null);
      setError(caughtError instanceof Error ? caughtError.message : "Action planning failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function requestScript(channel: ActionScriptChannel) {
    if (!facts || !actionPlan || actionMode) return;
    setActionMode("script");
    setActionError("");
    setCopied(false);
    try {
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "script",
          facts,
          currentAction: actionPlan,
          channel,
          language: preferredLanguage(messages),
          tone: "polite_firm"
        })
      });
      const body = (await response.json()) as GeneratedActionScript & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Script generation failed.");
      setGeneratedScript(body);
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "Script generation failed."
      );
    } finally {
      setActionMode(null);
    }
  }

  async function submitProviderFeedback() {
    const feedback = feedbackDraft.trim();
    if (!facts || !actionPlan || !feedback || actionMode) return;
    setActionMode("feedback");
    setActionError("");
    try {
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "provider_feedback",
          facts,
          currentAction: actionPlan,
          feedback
        })
      });
      const body = (await response.json()) as ProviderFeedbackResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Provider response analysis failed.");

      setFeedbackResult(body);
      setFeedbackHistory((current) => [
        ...current,
        {
          id: `feedback-${Date.now()}`,
          response: feedback,
          summary: body.summary,
          status: body.signals.responseStatus
        }
      ]);
      setActionPlan(body.nextAction);
      setGeneratedScript(null);
      setFeedbackDraft("");
      setCopied(false);
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "Provider response analysis failed."
      );
    } finally {
      setActionMode(null);
    }
  }

  async function copyScript() {
    if (!generatedScript) return;
    await navigator.clipboard.writeText(generatedScript.text);
    setCopied(true);
  }

  function resetClaim() {
    setDraft("");
    setMessages(initialMessages);
    setFacts(null);
    setExtractionMode(null);
    setIntakeWarning(undefined);
    setSafetyNotice(null);
    setActionPlan(null);
    setError("");
    setActionMode(null);
    setActionError("");
    setGeneratedScript(null);
    setCopied(false);
    setFeedbackDraft("");
    setFeedbackResult(null);
    setFeedbackHistory([]);
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-paper">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
              TC
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Travel Claims Copilot</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink/40">
                Real-time disruption guidance
              </p>
            </div>
          </div>
          <button
            className="rounded-full border border-ink/15 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/60 transition hover:border-coral hover:text-coral"
            type="button"
            onClick={resetClaim}
          >
            New case
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-8 md:px-8 md:pt-12">
        <div className="mb-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mint">
            One clear next move
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-6xl">
            Move the trip forward.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink/60 md:text-lg">
            Tell us what changed. We’ll identify who can act, what to ask for now, and how to
            respond when the provider answers.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_20px_60px_-48px_rgba(23,32,42,0.5)]">
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/40">
                  Case conversation
                </p>
                <p className="mt-1 text-sm font-medium text-ink">
                  {isLoading
                    ? "Checking one detail…"
                    : actionPlan
                      ? "Action ready"
                      : "Tell us what happened"}
                </p>
              </div>
              {extractionMode ? (
                <span className="rounded-full bg-paper px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">
                  {extractionMode === "llm" ? "LLM intake" : "Local intake"}
                </span>
              ) : null}
            </div>

            <div className="max-h-[410px] space-y-4 overflow-y-auto p-5" aria-live="polite">
              {messages.map((message) => (
                <article
                  className={`max-w-[92%] ${message.role === "user" ? "ml-auto" : "mr-auto"}`}
                  key={message.id}
                >
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/35">
                    {message.role === "assistant" ? "Copilot" : "You"}
                  </p>
                  <p
                    className={`rounded-xl px-4 py-3 text-sm leading-6 ${
                      message.role === "assistant"
                        ? "rounded-tl-sm bg-mint/[0.075] text-ink/70"
                        : "rounded-tr-sm bg-ink text-white/90"
                    }`}
                  >
                    {message.content}
                  </p>
                </article>
              ))}
            </div>

            {facts ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-ink/10 bg-paper/55 px-5 py-3 text-[11px] font-medium text-ink/45">
                {factSummary(facts).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}

            <form className="border-t border-ink/10 p-4" onSubmit={submitIntake}>
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">
                  Your message
                </span>
                <textarea
                  className="min-h-28 resize-y rounded-xl border border-ink/15 bg-paper/40 p-4 text-sm leading-6 text-ink outline-none transition placeholder:text-ink/35 focus:border-mint focus:bg-white focus:ring-4 focus:ring-mint/10"
                  placeholder={
                    actionPlan
                      ? "Add a correction if any case fact is wrong."
                      : "Describe what happened, or answer the follow-up question."
                  }
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              <button
                className="mt-3 h-11 w-full rounded-xl bg-ink text-sm font-semibold text-white transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/30"
                disabled={isLoading || !draft.trim()}
                type="submit"
              >
                {isLoading ? "Checking…" : facts ? "Continue" : "Start"}
              </button>
            </form>

            {intakeWarning ? (
              <p className="border-t border-coral/15 bg-coral/[0.035] px-5 py-3 text-xs leading-5 text-coral">
                {intakeWarning === "llm_not_configured"
                  ? "Using the local intake fallback because no LLM key is configured."
                  : "The model response failed validation, so this turn used the local fallback."}
              </p>
            ) : null}
          </section>

          {actionPlan && facts ? (
            <ActionWorkspace
              actionError={actionError}
              actionMode={actionMode}
              copied={copied}
              facts={facts}
              feedbackDraft={feedbackDraft}
              feedbackHistory={feedbackHistory}
              feedbackResult={feedbackResult}
              plan={actionPlan}
              script={generatedScript}
              onCopyScript={copyScript}
              onFeedbackDraftChange={setFeedbackDraft}
              onRequestScript={requestScript}
              onSubmitFeedback={submitProviderFeedback}
            />
          ) : (
            <section className="overflow-hidden rounded-2xl border border-dashed border-ink/20 bg-white/55">
              <div className="bg-ink px-6 py-7 text-white md:px-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">
                  Your next move
                </p>
                <h2 className="mt-4 text-2xl font-semibold leading-tight md:text-4xl">
                  No report to read. One action to take.
                </h2>
              </div>
              <div className="grid gap-5 p-6 md:grid-cols-3 md:p-8">
                {[
                  ["01", "Who can act"],
                  ["02", "What to ask"],
                  ["03", "What to save"]
                ].map(([number, label]) => (
                  <div key={number}>
                    <p className="text-xs font-semibold text-coral">{number}</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{label}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {error ? (
          <p
            className="mt-5 rounded-xl border border-coral/25 bg-white px-4 py-3 text-sm font-medium text-coral"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {safetyNotice ? (
          <div
            className="mt-5 rounded-xl border border-coral/25 bg-coral/[0.04] px-4 py-3 text-sm leading-6 text-ink"
            role="alert"
          >
            <span className="font-semibold text-coral">Professional-help boundary: </span>
            {safetyNotice.message} This is not legal advice.
          </div>
        ) : null}
      </div>
    </main>
  );
}
