# Data directory

The runtime knowledge base is intentionally limited to three JSON files:

- `policies.json` — official policies, regulations, and public commitments
- `cases.json` — consolidated community, user, and synthetic cases
- `scripts.json` — reusable communication templates

## Case review status

Every case has a `review_status` and `review_notes`:

- `approved` — eligible for retrieval
- `needs_review` — preserved, but hidden until its source, classification, or claims are resolved
- `excluded` — preserved for provenance, but outside product or quality boundaries

The application only retrieves `approved` cases. Current review summary:

| Status | Count |
| --- | ---: |
| approved | 35 |
| needs_review | 13 |
| excluded | 7 |
| total | 55 |

The 55 records contain 50 unique community source URLs and 5 explicitly labeled synthetic demo examples. Of the approved records, 30 are community datapoints and 5 are synthetic examples.

## Review rules

- Keep one consolidated case per community source URL.
- Do not infer that a weather disruption was controllable because other flights operated.
- Do not treat travel-document failures as oversales denied boarding.
- Keep reported outcomes separate from advice offered by forum replies.
- Do not generalize a one-off goodwill amount into a standard entitlement.
- Mark missing or unresolved outcomes in `review_notes`.
- Exclude injury, health, litigation, major property-loss, and similarly high-risk matters from retrieval.
- Preserve synthetic examples only when `source_type` is `synthetic_example` and the notes clearly say they are synthetic.

## Notable corrections from the source review

- Reclassified the Home2 Suites linen/amenity complaint from `hotel_walk` to `hotel_service_issue`.
- Excluded the AA/EVUS case from denied boarding after the source author acknowledged the document issue and reported no loss.
- Corrected the Suncadia outcome: the rooms and $500 dining credit were confirmed, but the promised 68,000-point refund was not.
- Removed an unsupported 15,000-point outcome from the Crowne Plaza walk case.
- Reworded the Air France weather case so its reported payout is not presented as a universal EU261 rule.
- Removed personal executive email addresses and unsupported universal deadlines from the Delta baggage case.

Run `npm run validate:data` after editing any JSON file.
