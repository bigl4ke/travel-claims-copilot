import type { ClaimFacts, ClaimLocation, ClaimRegion } from "./claimFacts";

type KnownPlace = {
  country: string;
  region: ClaimRegion;
  terms: string[];
};

const knownPlaces: KnownPlace[] = [
  { country: "France", region: "EU_EEA_CH", terms: ["france", "paris", "cdg", "ory", "法国", "巴黎"] },
  { country: "Germany", region: "EU_EEA_CH", terms: ["germany", "frankfurt", "fra", "munich", "muc", "德国", "法兰克福", "慕尼黑"] },
  { country: "Italy", region: "EU_EEA_CH", terms: ["italy", "rome", "fco", "milan", "mxp", "意大利", "罗马", "米兰"] },
  { country: "Netherlands", region: "EU_EEA_CH", terms: ["netherlands", "amsterdam", "ams", "荷兰", "阿姆斯特丹"] },
  { country: "Spain", region: "EU_EEA_CH", terms: ["spain", "madrid", "mad", "barcelona", "bcn", "西班牙", "马德里", "巴塞罗那"] },
  { country: "Ireland", region: "EU_EEA_CH", terms: ["ireland", "dublin", "dub", "爱尔兰", "都柏林"] },
  { country: "Norway", region: "EU_EEA_CH", terms: ["norway", "oslo", "osl", "挪威", "奥斯陆"] },
  { country: "Iceland", region: "EU_EEA_CH", terms: ["iceland", "reykjavik", "kef", "冰岛", "雷克雅未克"] },
  { country: "Switzerland", region: "EU_EEA_CH", terms: ["switzerland", "zurich", "zrh", "geneva", "gva", "瑞士", "苏黎世", "日内瓦"] },
  { country: "United Kingdom", region: "UK", terms: ["united kingdom", "uk", "london", "lhr", "lgw", "英国", "伦敦"] },
  { country: "United States", region: "US", terms: ["united states", "usa", "new york", "jfk", "ewr", "los angeles", "lax", "美国", "纽约", "洛杉矶"] }
];

const euOperatingCarriers = new Set([
  "air france",
  "klm",
  "lufthansa",
  "ita airways",
  "iberia",
  "aer lingus",
  "sas",
  "finnair",
  "tap air portugal",
  "austrian airlines",
  "swiss"
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function findKnownPlace(location: ClaimLocation): KnownPlace | undefined {
  const values = [location.airport, location.city, location.country]
    .filter((value): value is string => Boolean(value))
    .map(normalize);

  return knownPlaces.find((place) =>
    place.terms.some((term) => values.some((value) => value === term || value.includes(term)))
  );
}

export function enrichClaimLocation(location: ClaimLocation): ClaimLocation {
  const knownPlace = findKnownPlace(location);
  if (!knownPlace) {
    return location;
  }

  return {
    ...location,
    country: location.country ?? knownPlace.country,
    region: location.region ?? knownPlace.region
  };
}

export function enrichClaimJurisdiction(facts: ClaimFacts): ClaimFacts {
  return {
    ...facts,
    origin: enrichClaimLocation(facts.origin),
    destination: enrichClaimLocation(facts.destination)
  };
}

export type Eu261CandidateAssessment = {
  isCandidate: boolean;
  needsOperatingCarrierCheck: boolean;
  reasons: string[];
};

export function assessEu261Candidate(facts: ClaimFacts): Eu261CandidateAssessment {
  const enriched = enrichClaimJurisdiction(facts);
  if (enriched.origin.region === "EU_EEA_CH") {
    return {
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["departure_region_eu_eea_ch"]
    };
  }

  if (enriched.destination.region !== "EU_EEA_CH") {
    return { isCandidate: false, needsOperatingCarrierCheck: false, reasons: [] };
  }

  const carrier = normalize(enriched.operatingCarrier ?? enriched.provider ?? "");
  if (euOperatingCarriers.has(carrier)) {
    return {
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["arrival_region_eu_eea_ch", "eu_operating_carrier"]
    };
  }

  return {
    isCandidate: false,
    needsOperatingCarrierCheck: true,
    reasons: ["arrival_region_eu_eea_ch", "operating_carrier_unconfirmed"]
  };
}

