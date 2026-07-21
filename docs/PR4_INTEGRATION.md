# PR #4 Integration Decisions

This document records how PR #4 was integrated on top of the current product branch.

## Kept from the current product

- The existing `app/page.tsx` guided-conversation UI remains the public interface.
- The operational `ClaimFacts` flow, intake behavior, jurisdiction inference, analysis, retrieval,
  and response generation remain the default product path.
- EU261 eligibility is derived from route and carrier facts rather than from the incident label.
- Unknown airline causes are recorded as unavailable instead of triggering the same question again.
- The policy dataset contains one EU261 authority record: `eu261_regulation_261_2004`.
- Policy IDs shared by both branches use the `origin/main` project-owner record. Teammate-only,
  non-duplicate records may be added from PR #4; the second EU261 guidance record was excluded as a
  semantic duplicate.

## Integrated from PR #4

- A canonical structured analysis contract is available alongside the existing API request format.
- Carrier commitments, reviewed source metadata, and source identifiers on scripts were added.
- Privacy redaction, safe telemetry, request limits, demo access controls, health metadata,
  offline verification, evaluation fixtures, CI, formatting, and secret scanning were added.
- The reviewed domain evaluators are retained without adding a second public interface.

## Compatibility decisions

- `/api/intake` and `/api/analyze` accept both the current guided-intake request format and the
  canonical structured format from PR #4.
- The guided intake supports OpenAI or DeepSeek through `LLM_PROVIDER` and provider-specific
  environment variables.
- The canonical public GPT mode remains pinned to OpenAI and protected by its reviewed release
  controls. Extending that mode to DeepSeek is a separate product and security decision.
- Supported Node.js versions are `>=22.14 <26`; CI and `.nvmrc` continue to use Node 22.
- The default Playwright suite exercises the retained public UI. PR #4's unused alternative
  workspace components, client state layer, and UI-only tests were removed after product review.

## Product review still requested

1. Decide whether the canonical public GPT mode should remain OpenAI-only or gain a reviewed
   DeepSeek runtime with equivalent output limits, access controls, and privacy behavior.
2. Complete the project-owner checklist in `docs/build-week/SOURCE_REVIEW.md`, especially the
   distinction between DOT regulator context and United's carrier commitments, before a public demo.

## Verification at integration

- `npm run verify`
- `npm run test:e2e` (6 tests)
- `npm run format:check`
- `git diff --check`

All checks passed before the integration commit.
