import type { RawFactPath } from "../../lib/domain/claim-contract";

export type BrowserJourney = {
  name: string;
  message: string;
  corrections: Partial<Record<RawFactPath, string>>;
  expectedScenarios: string[];
  expectedRemedies: Array<{ title: string; status: string }>;
};

export const goldenJourneys: BrowserJourney[] = [
  {
    name: "Marriott hotel walk",
    message:
      "The Marriott hotel had no room and walked me after refusing my confirmed direct reservation.",
    corrections: {
      confirmedHotelReservation: "true",
      qualifyingHotelReservation: "true",
      membershipAttached: "true",
      bookingChannel: "direct",
      replacementLodgingProvided: "false"
    },
    expectedScenarios: ["marriott hotel walk"],
    expectedRemedies: [
      { title: "Comparable replacement hotel", status: "Supported by current facts" },
      {
        title: "Hotel reservation guarantee compensation",
        status: "Supported by current facts"
      }
    ]
  },
  {
    name: "US controllable cancellation",
    message:
      "United cancelled my flight from JFK to LAX because of a crew issue and I had to stay overnight.",
    corrections: {
      userInitiatedChange: "false",
      "assistance.refundAccepted": "false",
      "assistance.reroutingAccepted": "false"
    },
    expectedScenarios: ["us airline disruption"],
    expectedRemedies: [
      {
        title: "Refund for a cancellation or significant change",
        status: "Supported by current facts"
      },
      {
        title: "Carrier overnight hotel commitment",
        status: "Conditional — review missing facts"
      }
    ]
  },
  {
    name: "US involuntary denied boarding",
    message: "United oversold my flight from JFK to LAX, denied boarding, and I did not volunteer.",
    corrections: {
      oversalesConfirmed: "true",
      confirmedReservation: "true",
      checkedInOnTime: "true",
      atGateOnTime: "true",
      documentsCompliant: "true",
      replacementArrivalDelayMinutes: "0"
    },
    expectedScenarios: ["us denied boarding"],
    expectedRemedies: [
      { title: "Written denied-boarding rights", status: "Supported by current facts" },
      {
        title: "Involuntary denied-boarding compensation",
        status: "Supported by current facts"
      }
    ]
  },
  {
    name: "Air France CDG to JFK cancellation",
    message:
      "Air France cancelled my flight from CDG to JFK because of crew, operated by Air France, and I arrived 4 hours late.",
    corrections: {
      userInitiatedChange: "false",
      "assistance.refundAccepted": "false",
      "assistance.reroutingAccepted": "false",
      "assistance.replacementTravelAccepted": "false",
      "assistance.replacementTravelOffered": "false"
    },
    expectedScenarios: ["eu uk air disruption", "us airline disruption"],
    expectedRemedies: [
      { title: "EU/UK care", status: "Supported by current facts" },
      {
        title: "EU/UK fixed compensation",
        status: "Conditional — review missing facts"
      },
      {
        title: "Refund for a cancellation or significant change",
        status: "Supported by current facts"
      }
    ]
  }
];
