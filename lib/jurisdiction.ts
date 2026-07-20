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
  { country: "United States", region: "US", terms: ["united states", "usa", "new york", "jfk", "ewr", "los angeles", "lax", "美国", "纽约", "洛杉矶"] },
  { country: "Canada", region: "CA", terms: ["canada", "toronto", "yyz", "vancouver", "yvr", "montreal", "yul", "加拿大", "多伦多", "温哥华", "蒙特利尔"] },
  { country: "Australia", region: "AU", terms: ["australia", "sydney", "syd", "melbourne", "mel", "brisbane", "bne", "澳大利亚", "澳洲", "悉尼", "墨尔本", "布里斯班"] },
  { country: "China", region: "CN", terms: ["china", "beijing", "pek", "pkx", "shanghai", "pvg", "sha", "guangzhou", "can", "shenzhen", "szx", "中国", "北京", "上海", "广州", "深圳"] }
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

const ukOperatingCarriers = new Set([
  "british airways",
  "virgin atlantic",
  "easyjet",
  "jet2",
  "tui airways",
  "wizz air uk"
]);

const chineseOperatingCarriers = new Set([
  "air china",
  "china eastern airlines",
  "china eastern",
  "china southern airlines",
  "china southern",
  "hainan airlines",
  "xiamenair",
  "sichuan airlines",
  "spring airlines"
]);

function locationFromKnownPlace(place: KnownPlace, matchedTerm: string): ClaimLocation {
  const airport = /^[a-z]{3}$/i.test(matchedTerm) ? matchedTerm.toUpperCase() : null;
  const city = airport || normalize(matchedTerm) === normalize(place.country) ? null : matchedTerm;

  return {
    city,
    airport,
    country: place.country,
    region: place.region
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isEuOperatingCarrier(carrier: string | null | undefined): boolean {
  return euOperatingCarriers.has(normalize(carrier ?? ""));
}

export function isUkOrEuOperatingCarrier(carrier: string | null | undefined): boolean {
  const normalized = normalize(carrier ?? "");
  return euOperatingCarriers.has(normalized) || ukOperatingCarriers.has(normalized);
}

export function isChineseOperatingCarrier(carrier: string | null | undefined): boolean {
  return chineseOperatingCarriers.has(normalize(carrier ?? ""));
}

function findKnownPlace(location: ClaimLocation): KnownPlace | undefined {
  const values = [location.airport, location.city, location.country]
    .filter((value): value is string => Boolean(value))
    .map(normalize);

  return knownPlaces.find((place) =>
    place.terms.some((term) => values.some((value) => value === term || value.includes(term)))
  );
}

function findPlaceAfterMarker(text: string, markers: string[]): ClaimLocation | undefined {
  const normalizedText = normalize(text);
  const matches = knownPlaces.flatMap((place) =>
    place.terms.flatMap((term) =>
      markers.map((marker) => ({
        place,
        term,
        index: normalizedText.indexOf(`${marker}${normalize(term)}`)
      }))
    )
  );
  const match = matches
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index || right.term.length - left.term.length)[0];

  return match ? locationFromKnownPlace(match.place, match.term) : undefined;
}

export function inferRouteLocations(text: string): {
  origin?: ClaimLocation;
  destination?: ClaimLocation;
} {
  return {
    origin: findPlaceAfterMarker(text, ["from ", "departing ", "leaving ", "从", "由"]),
    destination: findPlaceAfterMarker(text, ["to ", "flying to ", "到", "飞往", "前往", "飞"])
  };
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

  if (
    enriched.operatingCarrierRegion === "EU_EEA_CH" ||
    isEuOperatingCarrier(enriched.operatingCarrier ?? enriched.provider)
  ) {
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

export type Uk261CandidateAssessment = {
  isCandidate: boolean;
  needsOperatingCarrierCheck: boolean;
  reasons: string[];
};

export function assessUk261Candidate(facts: ClaimFacts): Uk261CandidateAssessment {
  const enriched = enrichClaimJurisdiction(facts);
  if (enriched.origin.region === "UK") {
    return {
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["departure_region_uk"]
    };
  }

  if (enriched.destination.region !== "UK") {
    return { isCandidate: false, needsOperatingCarrierCheck: false, reasons: [] };
  }

  if (
    enriched.operatingCarrierRegion === "UK" ||
    enriched.operatingCarrierRegion === "EU_EEA_CH" ||
    isUkOrEuOperatingCarrier(enriched.operatingCarrier ?? enriched.provider)
  ) {
    return {
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["arrival_region_uk", "uk_or_eu_operating_carrier"]
    };
  }

  return {
    isCandidate: false,
    needsOperatingCarrierCheck: true,
    reasons: ["arrival_region_uk", "operating_carrier_unconfirmed"]
  };
}
