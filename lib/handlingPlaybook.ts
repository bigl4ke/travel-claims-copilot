import type { ClaimFacts, ClaimRecoveryPriority } from "./claimFacts";
import type { HandlingGuidanceSource, HandlingPlaybook } from "./types";

const communityGuide: HandlingGuidanceSource = {
  sourceType: "community_guide",
  title: "US Card Forum: involuntary schedule change and IRROPS guide",
  url: "https://www.uscardforum.com/t/topic/234255"
};

const iataInterlineGuide: HandlingGuidanceSource = {
  sourceType: "industry_guidance",
  title: "IATA: Interline Considerations on Irregular Operations (2020)",
  url: "https://www.iata.org/contentassets/e7a533819be440edbb1e49da96e0f2a8/guidance-document-interline-irops_25june2020.pdf"
};

const airlinePolicyRequired: HandlingGuidanceSource = {
  sourceType: "official_policy_required",
  title: "Current ticketing-carrier schedule-change or disruption policy",
  url: null
};

const hotelPolicyRequired: HandlingGuidanceSource = {
  sourceType: "official_policy_required",
  title: "Current hotel or hotel-group reservation guarantee",
  url: null
};

const bookingChannelLabels: Record<ClaimFacts["bookingChannel"], string | null> = {
  direct: null,
  ota: "the original online travel agency",
  portal: "the original card travel portal",
  travel_agent: "the original travel agent",
  corporate_travel: "the corporate travel provider",
  unknown: null
};

const priorityLabels: Record<ClaimRecoveryPriority, string> = {
  earliest_arrival: "earliest reasonable arrival",
  same_date: "the original travel date",
  nonstop: "nonstop travel",
  same_airport: "the original airport",
  same_cabin: "the same physical cabin",
  preserve_trip_length: "the original trip length"
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function airlineName(facts: ClaimFacts): string | null {
  return (
    facts.disruptingCarrier ??
    facts.operatingCarrier ??
    facts.provider ??
    facts.marketingCarrier ??
    facts.validatingCarrier
  );
}

function preferredOutcome(facts: ClaimFacts): string {
  const priorities = facts.recoveryPriorities.map((priority) => priorityLabels[priority]);
  return priorities.length > 0 ? priorities.join(", ") : "your most important constraints";
}

function contactForPlannedChange(facts: ClaimFacts): HandlingPlaybook["contactFirst"] {
  if (facts.ticketType === "award") {
    return {
      role: "frequent_flyer_program",
      name: facts.awardProgram ?? facts.validatingCarrier,
      reason:
        "The program or validating carrier that issued the award normally controls advance ticket changes and partner-award servicing."
    };
  }

  if (facts.bookingChannel === "direct") {
    return {
      role: "ticketing_airline",
      name: facts.validatingCarrier ?? facts.provider,
      reason:
        "For an advance schedule change, start with the airline that issued and controls the ticket."
    };
  }

  if (
    facts.bookingChannel === "ota" ||
    facts.bookingChannel === "portal" ||
    facts.bookingChannel === "travel_agent" ||
    facts.bookingChannel === "corporate_travel"
  ) {
    return {
      role: "ticketing_agent",
      name: facts.bookingProvider ?? bookingChannelLabels[facts.bookingChannel],
      reason:
        "For an advance change, the original booking provider usually has ticket control and must service the airline-initiated change."
    };
  }

  return {
    role: "unknown",
    name: null,
    reason: "Confirm who issued the ticket before deciding who can modify it."
  };
}

function contactForCloseInDisruption(facts: ClaimFacts): HandlingPlaybook["contactFirst"] {
  return {
    role: "disrupting_airline",
    name: airlineName(facts),
    reason:
      "For a close-in or en-route disruption, start with the airline handling the disrupted flight or its airport representative because it can usually restore travel fastest."
  };
}

function contactForCompletedDisruption(facts: ClaimFacts): HandlingPlaybook["contactFirst"] {
  return {
    role: "airline_customer_relations",
    name: airlineName(facts),
    reason:
      "After travel is complete, use the responsible airline's written customer-relations or claims channel for expenses, explanations, and any applicable remedy."
  };
}

function plannedChangeAsks(facts: ClaimFacts): string[] {
  const asks: string[] = [];
  if (facts.preferredAlternatives.length > 0) {
    asks.push(
      `Ask whether you can be protected on the specific alternative(s): ${facts.preferredAlternatives.join(", ")}.`
    );
  }
  if (facts.autoRebooked) {
    asks.push(
      "Explain why the automatic replacement does not meet your needs and ask for one policy-compliant alternative instead."
    );
  }
  asks.push(
    `First request a reasonable flight on the ticketing carrier's own services that preserves ${preferredOutcome(facts)}.`,
    "If that is unavailable, ask about code-share, joint-venture, or alliance options permitted by the current schedule-change policy.",
    "Then ask whether another interline carrier, nearby airport, or date adjustment is allowed; treat this as a request, not a guaranteed entitlement.",
    "If no acceptable replacement exists, ask what refund option applies before cancelling any segment yourself."
  );
  return unique(asks);
}

function closeInAsks(facts: ClaimFacts): string[] {
  const asks = [
    `Ask for the earliest reasonable onward itinerary that preserves ${preferredOutcome(facts)}.`,
    "If the disrupting airline has no workable flight, ask whether it can protect you on a partner or other carrier under its current disruption arrangements.",
    "Ask the agent to protect every affected connection while leaving unaffected return or onward segments intact.",
    "Ask what care or direct-expense support applies, and keep receipts rather than assuming reimbursement."
  ];
  if (facts.preferredAlternatives.length > 0) {
    asks.unshift(
      `Show the agent the specific alternative(s) you found: ${facts.preferredAlternatives.join(", ")}.`
    );
  }
  return unique(asks);
}

function completedAsks(): string[] {
  return [
    "Request the airline's written disruption reason if it was not already provided.",
    "Submit documented necessary expenses through the airline's designated claims channel and identify the applicable policy or regulation.",
    "Request any refund, care reimbursement, or compensation separately and only where the retrieved official basis indicates possible eligibility.",
    "Keep the case number and written response for a proportionate regulator escalation if the airline does not resolve an eligible claim."
  ];
}

function airlineTicketingChecks(): string[] {
  return [
    "Confirm the replacement flight is confirmed in the reservation, not merely requested or waitlisted.",
    "Ask the ticketing party to confirm the electronic ticket was revalidated or reissued for the new flight.",
    "Verify unaffected onward and return coupons remain open and usable.",
    "If another carrier is involved, confirm that carrier can see the ticket and permit check-in.",
    "Reconfirm cabin, baggage allowance, seats, and paid ancillary services."
  ];
}

function uncertaintiesFor(facts: ClaimFacts): string[] {
  const uncertainties: string[] = [];
  if (facts.journeyStage === "unknown") {
    uncertainties.push("The user's current journey stage is unknown.");
  }
  if (facts.disruptionTiming === "unknown" && facts.journeyStage === "pre_trip") {
    uncertainties.push(
      "It is unclear whether this is an advance schedule change or close-in disruption."
    );
  }
  if (facts.bookingChannel === "unknown" && facts.journeyStage === "pre_trip") {
    uncertainties.push("The booking channel and ticket-control owner are unknown.");
  }
  if (facts.ticketType === "unknown" && facts.journeyStage === "pre_trip") {
    uncertainties.push("It is unknown whether this is a paid or award ticket.");
  }
  if (!facts.disruptingCarrier && !facts.operatingCarrier && !facts.provider) {
    uncertainties.push("The airline responsible for the disrupted flight is not confirmed.");
  }
  if (facts.recoveryPriorities.length === 0 && facts.journeyStage !== "completed") {
    uncertainties.push("The user's preferred recovery constraints have not been stated.");
  }
  return uncertainties;
}

export function buildHandlingPlaybook(facts: ClaimFacts): HandlingPlaybook {
  if (facts.issueType === "hotel_walk") {
    return {
      status: "actionable",
      situation: "hotel_walk",
      contactFirst: {
        role: "hotel_front_desk",
        name: facts.provider,
        reason:
          "The property should first document the confirmed reservation and arrange immediate relocation or another on-property solution."
      },
      askLadder: [
        "Ask for a comparable nearby room and necessary transportation before discussing goodwill.",
        "Ask the property to document that it cannot honor the confirmed reservation.",
        "Ask the hotel group to apply any verified reservation guarantee or elite commitment that matches the booking."
      ],
      ticketingChecks: [],
      fallback: [
        "Obtain the manager's name and case number, then escalate to the hotel group's customer-care channel.",
        "Keep the original confirmation and receipts for reasonable relocation costs."
      ],
      uncertainties: [],
      sources: [hotelPolicyRequired],
      notGuaranteed: true
    };
  }

  if (facts.providerType !== "airline") {
    return {
      status: "needs_context",
      situation: "unknown",
      contactFirst: {
        role: "unknown",
        name: null,
        reason: "More context is needed before selecting the party that can act."
      },
      askLadder: [],
      ticketingChecks: [],
      fallback: [],
      uncertainties: ["The provider type or supported incident is not resolved."],
      sources: [],
      notGuaranteed: true
    };
  }

  if (facts.journeyStage === "completed") {
    return {
      status: "actionable",
      situation: "completed_disruption",
      contactFirst: contactForCompletedDisruption(facts),
      askLadder: completedAsks(),
      ticketingChecks: [],
      fallback: [
        "Follow up in writing with the reservation, ticket, receipts, and prior case numbers.",
        "Use a regulator or dispute channel only when an applicable official rule supports it."
      ],
      uncertainties: uncertaintiesFor(facts),
      sources: [airlinePolicyRequired, communityGuide],
      notGuaranteed: true
    };
  }

  if (
    facts.journeyStage === "at_airport" ||
    facts.journeyStage === "en_route" ||
    facts.disruptionTiming === "close_in_irrops"
  ) {
    return {
      status: "actionable",
      situation: "close_in_irrops",
      contactFirst: contactForCloseInDisruption(facts),
      askLadder: closeInAsks(facts),
      ticketingChecks: airlineTicketingChecks(),
      fallback: [
        "If the first agent cannot complete the change, politely request an airport supervisor or ticketing-support review.",
        "For a multi-airline itinerary, ask the involved carriers to coordinate ticket control or leave actionable PNR remarks.",
        "Keep receipts and written disruption notices while pursuing travel restoration."
      ],
      uncertainties: uncertaintiesFor(facts),
      sources: [iataInterlineGuide, communityGuide, airlinePolicyRequired],
      notGuaranteed: true
    };
  }

  if (facts.journeyStage === "pre_trip" && facts.disruptionTiming === "planned_schedule_change") {
    const contactFirst = contactForPlannedChange(facts);
    return {
      status: contactFirst.role === "unknown" ? "needs_context" : "actionable",
      situation: "planned_schedule_change",
      contactFirst,
      askLadder: plannedChangeAsks(facts),
      ticketingChecks: airlineTicketingChecks(),
      fallback: [
        "Ask for one policy review or supervisor escalation if the first agent cannot apply the published schedule-change options.",
        "For a partner award, ask the issuing program to contact its partner or ticketing support; coordination is not guaranteed.",
        "Obtain written confirmation and a case number before relying on the new itinerary."
      ],
      uncertainties: uncertaintiesFor(facts),
      sources: [communityGuide, airlinePolicyRequired],
      notGuaranteed: true
    };
  }

  return {
    status: "needs_context",
    situation: "unknown",
    contactFirst: {
      role: "unknown",
      name: null,
      reason:
        "Confirm whether the user is pre-trip, at the airport, en route, or already finished before selecting the servicing party."
    },
    askLadder: [],
    ticketingChecks: airlineTicketingChecks(),
    fallback: [],
    uncertainties: uncertaintiesFor(facts),
    sources: [communityGuide, airlinePolicyRequired],
    notGuaranteed: true
  };
}
