# PR #4 Integration Decisions

This document records how PR #4 was integrated on top of the current product branch.

## Kept from the current product

- The existing `app/page.tsx` guided-conversation UI remains the public interface.
- The operational `ClaimFacts` flow, intake behavior, jurisdiction inference, analysis, retrieval,
  and response generation remain the default product path.
- EU261 eligibility is derived from route and carrier facts rather than from the incident label.
- Unknown airline causes are recorded as unavailable instead of triggering the same question again.
- The policy dataset contains one EU261 authority record: `eu261_regulation_261_2004`.

## Integrated from PR #4

- A canonical structured analysis contract is available alongside the existing API request format.
- Carrier commitments, reviewed source metadata, source identifiers on scripts, and stronger
  separation between regulator context and carrier commitments were added.
- Privacy redaction, safe telemetry, request limits, demo access controls, health metadata,
  offline verification, evaluation fixtures, CI, formatting, and secret scanning were added.
- The reviewed domain evaluators and the alternative workspace components are retained for
  compatibility and later product review.

## Compatibility decisions

- `/api/intake` and `/api/analyze` accept both the current guided-intake request format and the
  canonical structured format from PR #4.
- The guided intake supports OpenAI or DeepSeek through `LLM_PROVIDER` and provider-specific
  environment variables.
- The canonical public GPT mode remains pinned to OpenAI and protected by its reviewed release
  controls. Extending that mode to DeepSeek is a separate product and security decision.
- Supported Node.js versions are `>=22.14 <26`; CI and `.nvmrc` continue to use Node 22.
- The default Playwright suite exercises the retained public UI. PR #4's alternative workspace
  tests remain in the repository but are not part of the default browser run.

## Product review still requested

1. Decide whether the canonical public GPT mode should remain OpenAI-only or gain a reviewed
   DeepSeek runtime with equivalent output limits, access controls, and privacy behavior.
2. Decide whether to remove the inactive alternative workspace UI and its browser tests after the
   team has finished comparing it with the retained interface.
3. Review the source judgments in `docs/build-week/SOURCE_REVIEW.md`, especially the distinction
   between DOT regulator context and United's carrier commitments, before a public demo.

## Verification at integration

- `npm run verify`
- `npm run test:e2e` (6 tests)
- `npm run format:check`
- `git diff --check`

All checks passed before the integration commit.
