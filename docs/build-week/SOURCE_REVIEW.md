# Official Source Review

## Review status

- Review date: `2026-07-19` UTC.
- Review method: read-only inspection of the canonical official pages after project-owner network
  authorization. Direct `HEAD` responses were recorded only as transport observations; browser-readable
  official content was used for the substantive review.
- Reviewer: Codex official-source audit, authorized by the project owner.
- Human content confirmation: **confirmed**. The project owner confirmed the conservative mappings
  below in this Codex task at `2026-07-19T05:51:39Z`.
- Formal release reachability: **pending**. `scripts/check-source-reachability.mjs` is reserved for a
  separately approved check within 48 hours of release.

No source result is legal advice or an outcome guarantee. Policy text establishes scope and evidence;
only typed facts and predicates determine eligibility.

## Critical policy sources

| Source ID | Exact page title and publisher | Canonical URL | Regime / authority | Review time | Verified scope or correction | Grounded scripts | Reachability observation |
|---|---|---|---|---|---|---|---|
| `marriott_ultimate_reservation_guarantee` | *Elite Benefit Guarantees* — “Ultimate Reservation Guarantee”; Marriott Bonvoy | https://www.marriott.com/loyalty/member-benefits/guarantee.mi | `provider_policy` / high | `2026-07-19T04:36:19Z` | Verified member-number-at-booking requirement, nearby lodging for an unhonored reservation, and brand/status-dependent compensation. | `marriott_walk_frontdesk_en`, `hotel_walk_escalation_email_en` | Official content browser-readable; direct non-browser `HEAD` returned 403. |
| `dot_airline_cancellation_delay_dashboard` | *Airline Cancellation and Delay Dashboard*; U.S. Department of Transportation | https://www.transportation.gov/airconsumer/airline-cancellation-delay-dashboard | `US_AIRLINE_COMMITMENT` / high regulator context | `2026-07-19T04:36:19Z` | Retained only as regulator context for controllable disruptions. Carrier-specific care comes exclusively from a reviewed carrier record. | `airline_controllable_delay_hotel_en`, `airline_controllable_cancellation_email_en` | Official content browser-readable; direct non-browser `HEAD` returned 403. |
| `dot_bumping_oversales` | *Bumping & Oversales*; U.S. Department of Transportation | https://www.transportation.gov/individuals/aviation-consumer-protection/bumping-oversales | `US_DOT_DENIED_BOARDING` / high | `2026-07-19T04:37:35Z` | Verified U.S.-departure oversales scope, volunteer-first process, check-in/gate requirements, written rights, and conditional denied-boarding compensation. Removed “confirmed alternate transportation” as an unconditional standalone right. | `denied_boarding_volunteer_gate_en`, `denied_boarding_involuntary_email_en` | Official content browser-readable; direct non-browser `HEAD` returned 403. |
| `eu261_air_passenger_rights` | *Air passenger rights*; Your Europe / European Commission DG GROW | https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm | `EU261` / high | `2026-07-19T04:38:07Z` | Verified care, refund/rerouting, and conditional compensation. Added the official guidance scope for Iceland, Norway, and Switzerland. | `eu261_claim_email_en`, `eu261_authority_escalation_en` | Official content browser-readable; direct `HEAD` returned 200. |
| `eu261_regulation_261_2004` | *Regulation (EC) No 261/2004 … denied boarding … cancellation or long delay of flights*; EUR-Lex / Publications Office of the European Union | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004R0261 | `EU261` / high | `2026-07-19T04:38:07Z` | Verified Article 3 route/reservation scope, Article 8 reimbursement/rerouting, Article 9 care, and conditional Articles 5/7 compensation. EEA/Swiss extension is grounded by the companion Your Europe guidance rather than inferred from Article 3 alone. | `eu261_claim_email_en`, `eu261_authority_escalation_en` | Official content browser-readable; direct `HEAD` returned 200. |
| `uk261_assimilated_regulation_261_2004` | *Regulation (EC) No 261/2004* — latest available revised UK version; legislation.gov.uk / The National Archives | https://www.legislation.gov.uk/eur/2004/261/contents | `UK261` / high | `2026-07-19T04:38:07Z` | Corrected the source publisher and added the UK-air-carrier route arriving in an EU Member State, subject to the applicable third-country-rights exception. Care, refund/rerouting, compensation, and denied-boarding summaries remain conditional. | `uk261_claim_email_en` | Official contents and linked text returned 200; the text extractor for the contents page was limited. |
| `ca_appr_sor_2019_150` | *Air Passenger Protection Regulations (SOR/2019-150)*; Justice Laws / Department of Justice Canada, regulation by the Canadian Transportation Agency | https://laws-lois.justice.gc.ca/eng/regulations/SOR-2019-150/FullText.html | `CA_APPR` / high | `2026-07-19T04:38:07Z` | Verified cause-dependent duties, status updates, qualifying care, rebooking/refund, inconvenience compensation, denied-boarding protections, and large/small-carrier distinctions. | `ca_appr_disruption_claim_en` | Official content browser-readable; direct `HEAD` returned 200. |
| `us_dot_automatic_ticket_refunds` | *Final Rule - Refunds and Other Consumer Protections*; U.S. Department of Transportation | https://www.transportation.gov/airconsumer/refundsfinalruleapril2024 | `US_DOT_REFUND` / high | `2026-07-19T04:37:35Z` | Verified automatic-refund conditions, original-payment method, unused amount/fees, and advance notice. Clarified that the path includes no alternative being offered as well as rejection of an offered alternative. | `us_dot_refund_request_en` | Official content browser-readable; direct non-browser `HEAD` returned 403. |
| `au_accc_travel_delays_consumer_guarantees` | *Travel delays and cancellations*; Australian Competition and Consumer Commission | https://www.accc.gov.au/consumers/specific-products-and-activities/travel-delays-and-cancellations | `AU_ACL` / high | `2026-07-19T04:38:07Z` | Verified the context-specific reasonable-time standard, covered Australian travel services, replacement/refund paths, possible reasonable replacement costs, and third-party-event limitations. | `au_acl_travel_disruption_en` | Official content browser-readable; direct `HEAD` returned 200. |
| `cn_flight_normality_regulation_2016` | `航班正常管理规定（中华人民共和国交通运输部令2016年第56号）`; Ministry of Transport of the People’s Republic of China | https://xxgk.mot.gov.cn/jigou/fgs/202006/t20200623_3307796.html | `CN_FLIGHT_REGULATION` / high | `2026-07-19T04:37:35Z` | Corrected publisher metadata from CAAC to MOT. Verified information, certificates on request, refund/change, cause-dependent care, and the at-least-two-hour on-board food/water rule. | `cn_flight_disruption_request_zh` | Official content browser-readable; direct `HEAD` returned 200. |
| `cn_public_air_transport_passenger_service_2021` | `公共航空运输旅客服务管理规定（中华人民共和国交通运输部令2021年第3号）`; Ministry of Transport of the People’s Republic of China | https://xxgk.mot.gov.cn/jigou/fgs/202103/t20210315_3530413.html | `CN_FLIGHT_REGULATION` / high | `2026-07-19T04:37:35Z` | Corrected publisher metadata from CAAC to MOT. Verified fee-free qualifying involuntary changes/refunds, connection assistance, volunteer-first oversales, published carrier standards, and request-based written proof. | `cn_flight_disruption_request_zh`, `cn_oversales_denied_boarding_zh` | Official content browser-readable; direct `HEAD` returned 200. |

## United carrier-specific commitment

| Field | Reviewed value |
|---|---|
| Commitment ID | `united_dot_controllable_disruption_commitments_2026_07_19` |
| Source title / provider | *Airline Cancellation and Delay Dashboard* / U.S. Department of Transportation |
| Carrier-filtered URL | https://www.transportation.gov/airconsumer/airline-cancellation-delay-dashboard?carrier_target_id=29861 |
| Source type / regime / authority | `official_dashboard` / `US_AIRLINE_COMMITMENT` / medium |
| Carrier / role | `United` / `operating_carrier` |
| Review time | `2026-07-19T04:36:19Z` |
| Grounded scripts | `airline_controllable_delay_hotel_en`, `airline_controllable_cancellation_email_en` |
| Reachability | United-filtered official content browser-readable; direct non-browser `HEAD` returned 403. Formal release check pending. |

The filtered official page states that the displayed commitments apply to controllable cancellations
or delays. The record therefore always includes an event predicate and
`controllability == controllable`. The frozen facts contain no provenance-bearing `waitMinutes`, so
the observed three-hour meal threshold is stored but can yield only `missing`/`conditional` today.
The page uses “significant delays” for delay rerouting without a computable frozen predicate, so the
production rerouting record conservatively covers cancellations only.

| Remedy | Committed | Observed typed predicates | Display condition | Evidence rights copied into the record |
|---|---|---|---|---|
| `us_rerouting` | true | event in `airline_cancellation`; controllability equals `controllable` | Controllable cancellation; delay rerouting not evaluated because “significant delay” is not computable | Rebook on United or an agreement partner at no additional cost |
| `us_meal` | true | event in delay/cancellation; controllability equals `controllable`; `waitMinutes >= 180` | At least 180 minutes of passenger wait | Meal, meal cash, or meal voucher |
| `us_hotel` | true | event in delay/cancellation; controllability equals `controllable`; `isOvernight == true` | Controllable overnight delay or cancellation | Complimentary hotel accommodations |
| `us_ground_transport` | true | event in delay/cancellation; controllability equals `controllable`; `isOvernight == true` | Controllable overnight disruption with hotel accommodation | Complimentary transportation to and from the hotel |

`display_conditions` and `rights` are evidence copy only. They never substitute for typed predicates
or create eligibility. The umbrella dashboard policy cannot fill carrier evidence when this exact,
fresh record does not match.

## Script-to-policy mapping

| Script ID | Policy source IDs | Mapping rationale |
|---|---|---|
| `marriott_walk_frontdesk_en` | `marriott_ultimate_reservation_guarantee` | Marriott reservation-guarantee request |
| `airline_controllable_delay_hotel_en` | `dot_airline_cancellation_delay_dashboard` | DOT regulator context; carrier care still requires the United record |
| `hotel_walk_escalation_email_en` | `marriott_ultimate_reservation_guarantee` | Marriott reservation-guarantee escalation |
| `airline_controllable_cancellation_email_en` | `dot_airline_cancellation_delay_dashboard` | DOT regulator context; carrier care still requires an exact record |
| `denied_boarding_volunteer_gate_en` | `dot_bumping_oversales` | U.S. DOT oversales guidance |
| `denied_boarding_involuntary_email_en` | `dot_bumping_oversales` | U.S. DOT denied-boarding guidance |
| `eu261_claim_email_en` | `eu261_regulation_261_2004`, `eu261_air_passenger_rights` | EU regulation plus official practical guidance |
| `eu261_authority_escalation_en` | `eu261_regulation_261_2004`, `eu261_air_passenger_rights` | EU regulation plus guidance; citation remains valid outside display Top-K |
| `uk261_claim_email_en` | `uk261_assimilated_regulation_261_2004` | Revised UK legal text |
| `ca_appr_disruption_claim_en` | `ca_appr_sor_2019_150` | Canadian APPR |
| `us_dot_refund_request_en` | `us_dot_automatic_ticket_refunds` | U.S. DOT refund rule |
| `au_acl_travel_disruption_en` | `au_accc_travel_delays_consumer_guarantees` | Australian regulator guidance |
| `cn_flight_disruption_request_zh` | `cn_flight_normality_regulation_2016`, `cn_public_air_transport_passenger_service_2021` | China flight-normality and passenger-service rules |
| `cn_oversales_denied_boarding_zh` | `cn_public_air_transport_passenger_service_2021` | China passenger-service oversales rules |

## Release-time reachability procedure

After separate release-time network approval, run:

```bash
npm run release:source-review -- --network-approved --release-sha "$release_sha"
npm run release:record -- --kind source --release-sha "$release_sha" --input .release/inputs/source.json
```

This transport check must be within 48 hours of release. A 403 from a `HEAD` request is not by itself
proof that browser-readable official content is unavailable; any non-success result requires manual
reinspection and a recorded disposition. The first command writes a fixed, ignored machine export;
the second validates it and atomically records the exact release input. The release remains blocked
by stale or genuinely unreachable critical sources.
