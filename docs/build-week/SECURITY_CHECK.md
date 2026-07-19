# Security Check

This file records the release-candidate security checks for Plan C Task 7. It contains no secret
values and is not a substitute for the later frozen-release security evidence.

## Deterministic checks

- Static browser security headers: implemented and covered by `tests/security/headers.test.ts`.
- JSON-only POST and `Cache-Control: no-store`: implemented and covered by route tests.
- Production error serialization: fixed public envelopes only; stack, cause, and private details are
  excluded.
- Tracked-file secret scan: `npm run scan:secrets`; approved synthetic patterns are constructed only
  inside the scanner contract test.
- Repository hygiene: local environment files, build output, coverage, browser reports, release
  evidence, and raw live-evaluation responses are ignored.

## Dependency audit

- Status: passed at the required high-severity threshold after an approved minimal patch update.
- Command: `npm audit --audit-level=high` (no automatic or force upgrade).
- Audit UTC time: `2026-07-19T21:37:35Z`.
- `package-lock.json` SHA-256:
  `60f881fba05e9775ad7c9fecccaf2f43e43f8c887f365feac313f998ad0a9a9d`.
- Initial findings: 3 moderate, 2 high, 0 critical.
- Final findings: 3 moderate, 0 high, 0 critical.
- High-finding disposition: both high findings were the same Playwright browser-download certificate
  verification advisory. With explicit project-owner approval, `@playwright/test`, `playwright`, and
  `playwright-core` were minimally updated from exact version `1.55.0` to exact version `1.55.1`.
  The audit was then repeated and the high findings cleared.
- Remaining moderate disposition: `js-yaml` is reachable only through the development ESLint
  toolchain and receives no project/user YAML; Next's nested `postcss` is used with trusted,
  repository-owned CSS and has no user-controlled CSS stringify path. npm offers no safe in-range
  resolution for the latter and proposes a breaking forced change, so no automatic or force fix was
  run. These moderate findings do not block the plan's high/critical release gate and must be
  rechecked at the frozen release audit.
