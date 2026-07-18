import { issueLabels } from "./issueTaxonomy";
import type {
  AnalysisResult,
  ExtractedFacts,
  IssueType,
  LegalRegime,
  RetrievalResult,
  SuggestedAsks
} from "./types";

const fallbackSuggestedAsks: SuggestedAsks = {
  conservative: ["Ask the provider to explain the applicable policy in writing"],
  standard: [
    "Request reimbursement or goodwill for documented reasonable losses",
    "Ask for a written case number and basis for any denial"
  ],
  aggressive: [
    "Escalate with a concise timeline and receipts",
    "Use regulator, card-benefit, or corporate channels only after confirming they apply"
  ]
};

const eu261SuggestedAsks: SuggestedAsks = {
  conservative: ["Care expenses such as meals and hotel if applicable"],
  standard: [
    "Refund or rerouting if applicable",
    "Care expenses",
    "Written delay or cancellation reason"
  ],
  aggressive: [
    "Fixed EU261 compensation if eligibility is met",
    "Care expense reimbursement",
    "Escalation to the relevant national enforcement body"
  ]
};

const eu261Evidence = [
  "Full itinerary and ticket receipt",
  "Scheduled and actual arrival times",
  "Departure and arrival airport details",
  "Airline's written delay or cancellation reason",
  "Receipts for care expenses"
];

const eu261Cautions = [
  "EU261 eligibility depends on route, carrier, delay length at arrival, and extraordinary-circumstance defenses.",
  "Fixed compensation is separate from care, refund, or rerouting rights."
];

const suggestedAsksByRegime: Partial<Record<LegalRegime, SuggestedAsks>> = {
  EU261: eu261SuggestedAsks,
  UK261: {
    conservative: ["Care expenses such as meals and hotel if UK261 applies"],
    standard: [
      "Refund or rerouting if applicable",
      "Care expense reimbursement",
      "Written disruption reason"
    ],
    aggressive: [
      "Fixed UK261 compensation if every eligibility condition is met",
      "Care expense reimbursement",
      "Escalation through the applicable ADR provider or CAA channel"
    ]
  },
  CA_APPR: {
    conservative: ["Written disruption reason and APPR cause classification"],
    standard: [
      "Rebooking or refund under the applicable APPR conditions",
      "Food, communication, or overnight accommodation if eligible",
      "Written confirmation of the final arrival delay"
    ],
    aggressive: [
      "Inconvenience compensation only if the APPR control, notice, and timing tests are met",
      "Reimbursement of documented eligible expenses",
      "CTA complaint after a written airline claim is not resolved"
    ]
  },
  US_DOT_REFUND: {
    conservative: ["Written notice of the available refund and rebooking options"],
    standard: [
      "Automatic refund to the original payment method if no alternative was accepted",
      "Refund of the unused ticket and eligible ancillary fees",
      "Written confirmation of the refund amount and processing date"
    ],
    aggressive: [
      "DOT complaint if an eligible refund is not processed after written follow-up",
      "Separate review of airline meal or hotel commitments for a controllable disruption",
      "Documented out-of-pocket costs only where another applicable policy supports them"
    ]
  },
  AU_ACL: {
    conservative: ["A written explanation of the delay, cancellation, and replacement offered"],
    standard: [
      "Replacement travel within a reasonable time or a refund if the guarantee was not met",
      "Review of documented replacement travel costs",
      "Written response under the airline's policy and applicable consumer guarantees"
    ],
    aggressive: [
      "Reimbursement of reasonably incurred replacement travel if supported by the circumstances",
      "Escalation through the appropriate state or territory consumer channel",
      "No fixed-sum compensation request unless a separate airline policy supports it"
    ]
  },
  CN_FLIGHT_REGULATION: {
    conservative: ["Written delay or cancellation reason and disruption certificate"],
    standard: [
      "Fee-free involuntary refund or qualifying ticket change",
      "Meals or accommodation when the applicable cause and location rules require them",
      "Written application of the carrier's published transport conditions"
    ],
    aggressive: [
      "Reimbursement of documented care expenses where the regulation or carrier terms support it",
      "Published oversales compensation and service if denied boarding",
      "Escalation through the CAAC service-quality complaint channel after airline review"
    ]
  }
};

const evidenceByRegime: Partial<Record<LegalRegime, string[]>> = {
  EU261: eu261Evidence,
  UK261: [
    "Full itinerary and ticket receipt",
    "Scheduled and actual arrival times",
    "Departure and arrival airports",
    "Operating carrier confirmation",
    "Written disruption reason and care receipts"
  ],
  CA_APPR: [
    "Full itinerary and boarding documents",
    "Airline notices and stated cause classification",
    "Scheduled and actual final-arrival times",
    "Carrier name and whether it is treated as large or small",
    "Receipts and the written claim sent to the airline"
  ],
  US_DOT_REFUND: [
    "Ticket receipt and full itinerary",
    "Cancellation or significant-change notice",
    "Proof that no alternative transportation or credit was accepted",
    "Original payment method",
    "Airline refund correspondence"
  ],
  AU_ACL: [
    "Booking confirmation and booking website or seller",
    "Original and replacement itinerary",
    "Delay or cancellation reason",
    "Evidence showing why the replacement timing was unreasonable",
    "Receipts for replacement travel and other claimed loss"
  ],
  CN_FLIGHT_REGULATION: [
    "客票、行程单和登机凭证",
    "航班延误或取消通知及书面证明",
    "航司公布的运输总条件",
    "实际行程时间和后续改签记录",
    "餐食、住宿、交通等支出票据"
  ]
};

const cautionsByRegime: Partial<Record<LegalRegime, string[]>> = {
  EU261: eu261Cautions,
  UK261: [
    "UK261 route coverage can depend on the operating carrier for flights arriving in the UK.",
    "Care, refund or rerouting, and fixed compensation have separate eligibility tests."
  ],
  CA_APPR: [
    "Canadian remedies depend on the airline's cause classification, notice, arrival delay, and carrier size.",
    "Compensation for inconvenience is narrower than rebooking and refund rights."
  ],
  US_DOT_REFUND: [
    "The automatic-refund right generally depends on not accepting the offered alternative transportation or credit.",
    "US meal and hotel benefits are often enforceable airline commitments, not a general fixed-compensation law."
  ],
  AU_ACL: [
    "Australian Consumer Law uses a context-specific reasonable-time test and does not create an EU-style fixed compensation table.",
    "Inbound coverage can depend on how and where the travel service was booked."
  ],
  CN_FLIGHT_REGULATION: [
    "China's rules distinguish carrier causes from weather, air traffic control, and other non-carrier causes.",
    "Carrier transport conditions set many compensation standards; do not treat one airline's amount as a national fixed entitlement."
  ]
};

const suggestedAsksByIssue: Partial<Record<IssueType, SuggestedAsks>> = {
  hotel_walk: {
    conservative: [
      "Comparable nearby hotel for the night",
      "Transportation to the alternate hotel"
    ],
    standard: [
      "Comparable nearby hotel",
      "Transportation reimbursement",
      "Applicable cash or points under the hotel guarantee"
    ],
    aggressive: [
      "Full alternate lodging reimbursement",
      "Transportation and incidental expenses",
      "Highest applicable guarantee compensation for brand and status"
    ]
  },
  airline_cancellation: {
    conservative: ["Rebooking on the next available flight", "Meal voucher if waiting"],
    standard: [
      "Rebooking",
      "Hotel accommodation for overnight disruption",
      "Meals and ground transportation"
    ],
    aggressive: [
      "Reimbursement for reasonable hotel, meal, and transport costs",
      "Travel credit or miles for the service failure",
      "Escalation through an applicable airline or regulator channel"
    ]
  },
  airline_delay: {
    conservative: ["Rebooking help", "Meal voucher during the delay"],
    standard: [
      "Meal voucher",
      "Hotel accommodation if overnight",
      "Ground transportation to and from the hotel"
    ],
    aggressive: [
      "Reimbursement for out-of-pocket hotel, meal, and transport costs",
      "Travel credit or miles for the disruption",
      "Written explanation of controllability"
    ]
  },
  denied_boarding: {
    conservative: ["Confirmed rebooking", "Written explanation of voluntary or involuntary status"],
    standard: [
      "Confirmed alternate flight",
      "Meal or hotel support if the new flight is much later",
      "Clear written compensation offer before volunteering"
    ],
    aggressive: [
      "Cash or higher travel credit before accepting a voluntary bump",
      "Written denied-boarding rights if involuntarily bumped",
      "Escalation if the airline refuses to document the situation"
    ]
  },
  baggage_delay: {
    conservative: ["File or update the baggage report", "Ask for delivery timing in writing"],
    standard: [
      "Reimbursement for reasonable emergency purchases",
      "Delivery to home or hotel",
      "Written claim number and baggage status"
    ],
    aggressive: [
      "Escalate delayed-baggage reimbursement with receipts",
      "Check card baggage-delay coverage for unreimbursed eligible items",
      "Ask for goodwill credit if the airline mishandled communication"
    ]
  },
  airline_baggage_not_checked: {
    conservative: ["Ask for a written explanation of why the bag could not be accepted"],
    standard: [
      "Customer relations review",
      "Goodwill or reimbursement for necessary replacement items",
      "Documentation of check-in processing delay"
    ],
    aggressive: [
      "Escalate with a minute-by-minute timeline",
      "Ask for review of airport agent handling",
      "Use employer or card coverage only if eligibility is confirmed"
    ]
  },
  airline_rebooking_mixed_carrier_delay: {
    conservative: ["Ask the operating carrier for immediate delay support"],
    standard: [
      "Written delay or cancellation reason from each carrier",
      "Rebooking or rerouting if the current delay becomes extended",
      "Meal or hotel support if overnight"
    ],
    aggressive: [
      "Escalate separately to original and operating carriers",
      "Ask the travel portal to help if ticket control blocks rebooking",
      "Document denied commitments before filing a DOT complaint"
    ]
  },
  airline_delay_trip_insurance: {
    conservative: ["Get a written delay reason from the airline"],
    standard: [
      "Claim reasonable eligible expenses through card trip-delay coverage",
      "Ask airline customer relations for goodwill",
      "Keep all receipts and itinerary changes"
    ],
    aggressive: [
      "Escalate the insurance claim with complete documentation",
      "Request airline goodwill miles or voucher for service recovery",
      "Avoid double claiming the same expense"
    ]
  },
  hotel_billing_dispute: {
    conservative: ["Ask the hotel for an itemized folio"],
    standard: [
      "Request written correction or refund from hotel billing",
      "Ask for a case number",
      "Wait for pending holds to settle before disputing"
    ],
    aggressive: [
      "Escalate to hotel manager or corporate billing support",
      "File a card dispute if the hotel cannot justify the posted charge",
      "Attach folio, booking confirmation, and prior correspondence"
    ]
  },
  hotel_service_issue: {
    conservative: ["Ask the merchant or hotel to explain what went wrong"],
    standard: [
      "Request refund for an undelivered service",
      "Ask the hotel for goodwill if it presented the service as an amenity",
      "Document the on-property signage or communication"
    ],
    aggressive: [
      "Escalate to hotel corporate care",
      "Use a card dispute for a clearly undelivered third-party purchase",
      "Separate merchant refund from hotel goodwill"
    ]
  },
  hotel_property_loss: {
    conservative: ["Ask the hotel to search lost and found"],
    standard: [
      "Request replacement value or goodwill points",
      "Document the item value and housekeeping timeline",
      "Ask for a manager case note"
    ],
    aggressive: [
      "Escalate to corporate care with item value evidence",
      "Check purchase protection if the item is eligible",
      "Avoid high-value claims without strong documentation"
    ]
  },
  hotel_relocation_before_opening: {
    conservative: ["Ask for written confirmation of the replacement hotel"],
    standard: [
      "Comparable replacement accommodation",
      "Return of points or certificate value if the substitute is lower quality",
      "Goodwill points for a materially worse relocation"
    ],
    aggressive: [
      "Escalate if relocation is not comparable",
      "Request reimbursement for reasonable incremental costs",
      "Ask for a supervisor review before accepting a poor substitute"
    ]
  },
  hotel_room_feature_mismatch: {
    conservative: ["Ask the property to fix or document the missing feature"],
    standard: [
      "Refund or partial refund of paid upgrade charge",
      "Points or goodwill for broken advertised amenities",
      "Written case note for any promised adjustment"
    ],
    aggressive: [
      "Escalate to property management with website screenshots",
      "Ask corporate care to correct missing or incorrect compensation",
      "Request review if the paid room type was materially misrepresented"
    ]
  },
  hotel_elite_benefit_closure: {
    conservative: ["Accept substitute breakfast or award return if it is comparable"],
    standard: [
      "Ask for daily breakfast for registered guests",
      "Request return of unused club access or guest-of-honor award",
      "Document the closure notice and lost benefit"
    ],
    aggressive: [
      "Ask for goodwill if evening lounge value was material",
      "Escalate only if the substitute benefit is clearly weaker",
      "Compare the booked benefit against the replacement offered"
    ]
  },
  unknown: {
    conservative: ["Ask the provider to explain the applicable policy in writing"],
    standard: [
      "Request reimbursement for documented reasonable expenses",
      "Ask for the provider's written basis for denial or approval"
    ],
    aggressive: [
      "Escalate with a concise timeline and receipts",
      "File with the relevant regulator only after confirming jurisdiction"
    ]
  }
};

const fallbackEvidence = [
  "Booking confirmation",
  "Provider messages",
  "Timeline of what happened",
  "Receipts for out-of-pocket costs",
  "Names or screenshots from support interactions"
];

const evidenceByIssue: Partial<Record<IssueType, string[]>> = {
  hotel_walk: [
    "Reservation confirmation number",
    "Screenshot showing the active confirmed booking",
    "Loyalty account number and status",
    "Property notes confirming no room was available",
    "Alternate hotel, transportation, and incidental receipts"
  ],
  airline_cancellation: [
    "Cancellation notice",
    "Boarding pass or ticket receipt",
    "Written reason for cancellation if available",
    "Hotel, meal, and ground transportation receipts",
    "Screenshots of airline chat or airport desk response"
  ],
  airline_delay: [
    "Delay notification",
    "Boarding pass or ticket receipt",
    "Actual departure and arrival times",
    "Hotel, meal, and ground transportation receipts",
    "Screenshots of any airline voucher denial"
  ],
  denied_boarding: [
    "Boarding pass and ticket receipt",
    "Gate announcement or written offer",
    "Confirmed alternate flight details",
    "Written denied-boarding statement if involuntary",
    "Receipts if the new flight causes overnight expenses"
  ],
  baggage_delay: [
    "Baggage report or claim number",
    "Bag tags",
    "Delivery or status updates",
    "Receipts for reasonable emergency purchases",
    "Credit card benefit guide if using baggage-delay coverage"
  ],
  airline_baggage_not_checked: [
    "Boarding pass",
    "Timeline of check-in and document verification",
    "Any staff names, notes, or chat records",
    "Receipts for necessary replacement items",
    "Proof the bag was not accepted or tagged"
  ],
  airline_rebooking_mixed_carrier_delay: [
    "Original itinerary and ticket receipt",
    "Cancellation notice from the original carrier",
    "Delay notice from the operating carrier",
    "Boarding passes",
    "Written reason from each airline"
  ],
  airline_delay_trip_insurance: [
    "Delay notice",
    "Written airline delay reason",
    "Original and updated itinerary",
    "Hotel, food, transport, and rental receipts",
    "Card benefit claim form"
  ],
  hotel_billing_dispute: [
    "Hotel folio",
    "Card transaction screenshot",
    "Booking confirmation",
    "Written explanation from hotel billing",
    "Refund or adjustment confirmation"
  ],
  hotel_service_issue: [
    "Order or service receipt",
    "Photos of on-property signage or QR code",
    "Front desk notes",
    "Merchant refund request",
    "Card transaction"
  ],
  hotel_property_loss: [
    "Description or receipt for the lost item",
    "Housekeeping timeline",
    "Front desk or manager notes",
    "Photos if available",
    "Purchase protection terms if relevant"
  ],
  hotel_relocation_before_opening: [
    "Original hotel confirmation",
    "Relocation or opening-delay notice",
    "Replacement hotel confirmation",
    "Screenshots of cash rates or category difference",
    "Transportation or incremental cost receipts"
  ],
  hotel_room_feature_mismatch: [
    "Room type confirmation",
    "Website screenshots showing advertised features",
    "Photos or videos of missing or broken amenities",
    "Engineer or front desk notes",
    "Paid upgrade receipt and points activity"
  ],
  hotel_elite_benefit_closure: [
    "Pre-arrival closure notice",
    "Reservation showing club access or status",
    "Award or elite benefit terms",
    "Substitute breakfast details",
    "Any denied benefit notes"
  ],
  unknown: fallbackEvidence
};

const fallbackCautions = [
  "Community datapoints are useful references, not official policy.",
  "Goodwill requests are uncertain, so keep the ask factual and evidence-based."
];

const cautionsByIssue: Partial<Record<IssueType, string[]>> = {
  hotel_walk: [
    "Brand guarantees often depend on membership, brand, status, and whether the reservation was booked through an eligible channel.",
    "Ask for written confirmation before leaving the property if possible."
  ],
  airline_cancellation: [
    "Airline commitments and legal remedies depend on route, carrier, cause, and timing.",
    "Keep receipts if the airline cannot issue vouchers immediately."
  ],
  airline_delay: [
    "Delay rights vary by airline commitment, cause, and length of delay.",
    "A weather or air traffic control delay may weaken a controllable-disruption claim."
  ],
  denied_boarding: [
    "Voluntary bump negotiation is different from involuntary denied boarding rights.",
    "Do not accept a voluntary offer until the compensation, expiration, rebooking, hotel, and meal terms are clear."
  ],
  baggage_delay: [
    "Delayed baggage reimbursement usually depends on reasonable, necessary purchases and receipts.",
    "Card baggage-delay benefits may be secondary to airline reimbursement."
  ],
  airline_baggage_not_checked: [
    "If the airline never accepted or tagged the bag, standard delayed-baggage rules may not apply.",
    "The claim is stronger with written proof that airline processing caused the missed baggage cutoff."
  ],
  airline_rebooking_mixed_carrier_delay: [
    "The original carrier, operating carrier, and travel portal can each control different parts of the solution.",
    "Ask for immediate care from the operating carrier while preserving the original carrier cancellation record."
  ],
  airline_delay_trip_insurance: [
    "Weather delays can support card trip-delay claims even when they weaken airline controllability claims.",
    "Avoid asking two parties to reimburse the exact same expense."
  ],
  hotel_billing_dispute: [
    "Many hotel deposits are pending holds; confirm whether the charge actually posted before disputing.",
    "Card disputes are cleaner after the hotel has failed to provide a valid folio or correction."
  ],
  hotel_service_issue: [
    "A third-party merchant refund and a hotel goodwill request are separate claims.",
    "The hotel claim is stronger if the service was clearly presented as an on-property amenity."
  ],
  hotel_property_loss: [
    "Minor personal-property claims usually depend on replacement value evidence.",
    "Large property-loss claims are outside this demo and may need professional or insurance help."
  ],
  hotel_relocation_before_opening: [
    "A relocation before arrival is not always the same as a hotel walk at check-in.",
    "Comparable accommodation and written confirmation matter more than broad compensation demands."
  ],
  hotel_room_feature_mismatch: [
    "Missing amenities support a stronger request when they were advertised and were material to a paid upgrade.",
    "Ask for promised compensation in writing before checkout if possible."
  ],
  hotel_elite_benefit_closure: [
    "A substitute breakfast may be considered reasonable even if lounge evening snacks are unavailable.",
    "Additional goodwill is more plausible when the lost benefit was material and not fairly replaced."
  ],
  unknown: [
    "This demo could not confidently classify the issue from the current keywords.",
    "Add the provider name, disruption reason, route or property, timing, and expenses to improve the analysis."
  ]
};

function getLegalRegimes(retrieval: RetrievalResult): LegalRegime[] {
  return Array.from(new Set(retrieval.officialBasis.map((policy) => policy.legal_regime)));
}

function getPrimaryLegalRegime(retrieval: RetrievalResult): LegalRegime | undefined {
  const regimes = getLegalRegimes(retrieval);
  const preferredByOrigin: Partial<
    Record<NonNullable<RetrievalResult["query"]["originRegion"]>, LegalRegime[]>
  > = {
    EU_EEA_CH: ["EU261"],
    UK: ["UK261"],
    CA: ["CA_APPR"],
    AU: ["AU_ACL"],
    CN: ["CN_FLIGHT_REGULATION"],
    US:
      retrieval.query.controllability === "controllable"
        ? ["US_AIRLINE_COMMITMENT", "US_DOT_REFUND", "US_DOT_DENIED_BOARDING"]
        : ["US_DOT_REFUND", "US_DOT_DENIED_BOARDING", "US_AIRLINE_COMMITMENT"],
    other: []
  };
  const preferred = retrieval.query.originRegion
    ? (preferredByOrigin[retrieval.query.originRegion] ?? [])
    : [];

  return preferred.find((regime) => regimes.includes(regime)) ?? regimes[0];
}

function getSuggestedAsks(issueType: IssueType, retrieval: RetrievalResult): SuggestedAsks {
  const regime = getPrimaryLegalRegime(retrieval);
  if (regime && suggestedAsksByRegime[regime]) {
    return suggestedAsksByRegime[regime];
  }
  return suggestedAsksByIssue[issueType] ?? fallbackSuggestedAsks;
}

function getEvidence(issueType: IssueType, retrieval: RetrievalResult): string[] {
  const regime = getPrimaryLegalRegime(retrieval);
  if (regime && evidenceByRegime[regime]) {
    return evidenceByRegime[regime];
  }
  return evidenceByIssue[issueType] ?? fallbackEvidence;
}

function getCautions(issueType: IssueType, retrieval: RetrievalResult): string[] {
  const regime = getPrimaryLegalRegime(retrieval);
  if (regime && cautionsByRegime[regime]) {
    return cautionsByRegime[regime];
  }
  return cautionsByIssue[issueType] ?? fallbackCautions;
}

function buildSummary(facts: ExtractedFacts, retrieval: RetrievalResult): string {
  if (retrieval.selectedCase) {
    return `Selected scenario: ${retrieval.selectedCase.brand_or_airline}. This result is based on the selected local case and matching knowledge-base records.`;
  }

  if (facts.issueType === "unknown") {
    return "The current demo could not confidently classify the description. Add provider, timing, route or property, reason, and expenses for a stronger result.";
  }

  const regions = retrieval.query.policyRegions.join(", ") || "no resolved jurisdiction";
  const regimes = getLegalRegimes(retrieval).join(", ") || "no matched legal regime";
  return `Matched incident: ${issueLabels[facts.issueType]}. Official sources were selected using route regions ${regions}, legal regimes ${regimes}, provider scope, and controllability; results remain a first-pass assessment.`;
}

export function generateAnalysis(
  facts: ExtractedFacts,
  retrieval: RetrievalResult
): AnalysisResult {
  const hasUnresolvedAirlineControl =
    (facts.issueType === "airline_delay" || facts.issueType === "airline_cancellation") &&
    retrieval.query.controllability !== "controllable";
  let strength: AnalysisResult["strength"] = "medium";
  if (facts.issueType === "unknown") {
    strength = "low";
  } else if (retrieval.officialBasis.length > 0 && !hasUnresolvedAirlineControl) {
    strength = "high";
  }

  return {
    issueType: facts.issueType,
    policyRegions: retrieval.query.policyRegions,
    legalRegimes: getLegalRegimes(retrieval),
    controllability: retrieval.query.controllability,
    strength,
    summary: buildSummary(facts, retrieval),
    officialBasis: retrieval.officialBasis,
    similarCases: retrieval.similarCases,
    suggestedAsks: getSuggestedAsks(facts.issueType, retrieval),
    evidenceChecklist: getEvidence(facts.issueType, retrieval),
    scripts: retrieval.scripts,
    cautions: getCautions(facts.issueType, retrieval)
  };
}
