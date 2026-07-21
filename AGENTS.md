# AGENTS.md

## Project

This repo implements Travel Claims Copilot: a travel disruption resolution and communication assistant.

Read these files before making product or architecture decisions:
- PROJECT_BRIEF.md
- DATA_SCHEMA.md
- ROADMAP.md, if present

## Product Goal

Build a demo web app where a user describes a hotel or airline disruption, and the app tells them:
- who to contact now
- what to ask for first and what fallback to use
- what evidence to preserve now
- what remains uncertain, with compact source links
- what to do after the provider replies

Communication scripts are generated on demand from a deterministic ActionPlan. Full policy and case
analysis remains an internal evidence layer instead of the primary consumer UI.

## Important Product Boundaries

Do not present the app as legal advice.
Do not promise compensation.
Do not fabricate policies, cases, URLs, or compensation amounts.
Clearly separate:
- official policy / regulation
- company commitment
- community DP / goodwill reference
- synthetic examples

High-risk issues such as injury, litigation, large property loss, or complex insurance claims should trigger a professional-help warning.

## Recommended Implementation Direction

Prefer a simple deterministic workflow over a complex autonomous agent.

Initial workflow:
1. Extract structured facts from user input.
2. Classify provider_type, provider, and issue_type.
3. Search policies and cases.
4. Deterministically generate a compact ActionPlan using retrieved data.
5. Let an LLM verbalize that plan or generate a channel-specific script without adding claims.
6. Analyze provider feedback and deterministically select the next action.
7. Allow outcome logging.

Start with local JSON files if faster. Later migrate to Supabase Postgres and pgvector.

## Suggested Tech Stack

- Next.js
- TypeScript
- Tailwind
- Local JSON seed data for MVP
- Later: Supabase Postgres + pgvector
- LLM API abstraction in lib/llm.ts
- Retrieval logic in lib/retrieval.ts
- Classification logic in lib/classifier.ts

## Code Style

- Use TypeScript strict mode.
- Keep business logic in lib/.
- Keep UI components small.
- Avoid over-engineering.
- Prefer explicit types for Policy, Case, Script, AnalysisResult.
- Add sample data before building complex infrastructure.
- Write code that can later swap local JSON search for vector search.

## First Demo Scope

Only support these initial issue types:
- hotel_walk
- controllable_airline_delay
- controllable_airline_cancellation
- denied_boarding
- eu261_delay_or_cancellation

Do not build:
- payments
- login
- automated scraping
- email sending
- claim submission
- mobile app
- complex multi-agent orchestration

## Expected Demo UX

Home page:
- textarea for user problem
- "Analyze" button

Result page:
- one primary "What to do now" action card
- contact, primary ask, fallback, immediate evidence, and uncertainty
- compact official/community source links
- on-demand script controls
- provider-response input that returns the next action

Detailed policy applicability, case rankings, and retrieval metadata may remain available only in a
debug or explicitly expanded evidence view.
