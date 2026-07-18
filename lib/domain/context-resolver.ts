import type { PolicyRegion, PolicyRouteRegion } from "../types";
import type {
  ClaimState,
  DerivedApplicability,
  RawClaimFacts,
  RawLocation,
  ResolvedClaimContext,
  ResolvedJurisdiction,
  ResolvedValue
} from "./claim-contract";
import { buildResolutionFacts } from "./raw-fact-schema";
import { resolveScenarioSet } from "./scenario-resolver";

type KnownProviderType = "hotel" | "airline";
type ProviderDefinition = {
  provider: string;
  providerType: KnownProviderType;
  operatingCarrierRegion?: PolicyRouteRegion;
  terms: string[];
};

export type CanonicalProviderMatch = Pick<
  ProviderDefinition,
  "provider" | "providerType" | "operatingCarrierRegion"
>;

const providerDefinitions: ProviderDefinition[] = [
  {
    provider: "American Airlines",
    providerType: "airline",
    operatingCarrierRegion: "US",
    terms: ["american airlines", "american flight", "aa flight", "aa", "美国航空", "美航"]
  },
  {
    provider: "United",
    providerType: "airline",
    operatingCarrierRegion: "US",
    terms: ["united airlines", "united flight", "united", "ua", "美联航"]
  },
  {
    provider: "Delta",
    providerType: "airline",
    operatingCarrierRegion: "US",
    terms: ["delta air lines", "delta flight", "delta", "dl", "达美"]
  },
  {
    provider: "Alaska Airlines",
    providerType: "airline",
    operatingCarrierRegion: "US",
    terms: ["alaska airlines", "alaska flight", "阿拉斯加航空"]
  },
  {
    provider: "Air France",
    providerType: "airline",
    operatingCarrierRegion: "EU_EEA_CH",
    terms: ["air france", "af flight", "法航"]
  },
  {
    provider: "KLM",
    providerType: "airline",
    operatingCarrierRegion: "EU_EEA_CH",
    terms: ["klm", "klm royal dutch airlines"]
  },
  {
    provider: "Lufthansa",
    providerType: "airline",
    operatingCarrierRegion: "EU_EEA_CH",
    terms: ["lufthansa", "lh flight", "汉莎"]
  },
  {
    provider: "British Airways",
    providerType: "airline",
    operatingCarrierRegion: "UK",
    terms: ["british airways", "ba flight", "英国航空", "英航"]
  },
  {
    provider: "Virgin Atlantic",
    providerType: "airline",
    operatingCarrierRegion: "UK",
    terms: ["virgin atlantic", "维珍航空"]
  },
  {
    provider: "easyJet",
    providerType: "airline",
    operatingCarrierRegion: "UK",
    terms: ["easyjet", "easy jet"]
  },
  {
    provider: "Air Canada",
    providerType: "airline",
    operatingCarrierRegion: "CA",
    terms: ["air canada", "加拿大航空", "加航"]
  },
  {
    provider: "Qantas",
    providerType: "airline",
    operatingCarrierRegion: "AU",
    terms: ["qantas", "澳洲航空"]
  },
  {
    provider: "Air China",
    providerType: "airline",
    operatingCarrierRegion: "CN",
    terms: ["air china", "中国国际航空", "国航"]
  },
  {
    provider: "China Eastern Airlines",
    providerType: "airline",
    operatingCarrierRegion: "CN",
    terms: ["china eastern", "东航"]
  },
  {
    provider: "China Southern Airlines",
    providerType: "airline",
    operatingCarrierRegion: "CN",
    terms: ["china southern", "南航"]
  },
  {
    provider: "Hilton Grand Vacations",
    providerType: "hotel",
    terms: ["hilton grand vacations", "hgv"]
  },
  {
    provider: "Marriott",
    providerType: "hotel",
    terms: [
      "marriott bonvoy",
      "autograph collection",
      "renaissance",
      "marriott",
      "sheraton",
      "westin",
      "bonvoy",
      "万豪旅享家",
      "万豪",
      "喜来登",
      "威斯汀"
    ]
  },
  {
    provider: "Hyatt",
    providerType: "hotel",
    terms: ["destination by hyatt", "unbound collection", "hyatt", "andaz", "凯悦", "安达仕"]
  },
  {
    provider: "Hilton",
    providerType: "hotel",
    terms: [
      "home2 suites",
      "hilton",
      "hampton",
      "conrad",
      "waldorf astoria",
      "lxr",
      "希尔顿",
      "欢朋",
      "康莱德",
      "华尔道夫"
    ]
  },
  {
    provider: "IHG",
    providerType: "hotel",
    terms: [
      "intercontinental hotels group",
      "intercontinental",
      "holiday inn",
      "crowne plaza",
      "ihg",
      "洲际酒店集团",
      "皇冠假日",
      "假日酒店",
      "洲际"
    ]
  },
  {
    provider: "Accor",
    providerType: "hotel",
    terms: ["accor", "fairmont", "sofitel", "雅高", "费尔蒙", "索菲特"]
  }
];

type KnownPlace = {
  country: string;
  region: PolicyRouteRegion;
  terms: string[];
};

const knownPlaces: KnownPlace[] = [
  {
    country: "France",
    region: "EU_EEA_CH",
    terms: ["france", "paris", "cdg", "ory", "法国", "巴黎"]
  },
  {
    country: "Germany",
    region: "EU_EEA_CH",
    terms: ["germany", "frankfurt", "fra", "munich", "muc", "德国", "法兰克福", "慕尼黑"]
  },
  {
    country: "Italy",
    region: "EU_EEA_CH",
    terms: ["italy", "rome", "fco", "milan", "mxp", "意大利", "罗马", "米兰"]
  },
  {
    country: "Netherlands",
    region: "EU_EEA_CH",
    terms: ["netherlands", "amsterdam", "ams", "荷兰", "阿姆斯特丹"]
  },
  {
    country: "Spain",
    region: "EU_EEA_CH",
    terms: ["spain", "madrid", "mad", "barcelona", "bcn", "西班牙", "马德里", "巴塞罗那"]
  },
  {
    country: "Ireland",
    region: "EU_EEA_CH",
    terms: ["ireland", "dublin", "dub", "爱尔兰", "都柏林"]
  },
  { country: "Norway", region: "EU_EEA_CH", terms: ["norway", "oslo", "osl", "挪威", "奥斯陆"] },
  {
    country: "Iceland",
    region: "EU_EEA_CH",
    terms: ["iceland", "reykjavik", "kef", "冰岛", "雷克雅未克"]
  },
  {
    country: "Switzerland",
    region: "EU_EEA_CH",
    terms: ["switzerland", "zurich", "zrh", "geneva", "gva", "瑞士", "苏黎世", "日内瓦"]
  },
  {
    country: "United Kingdom",
    region: "UK",
    terms: ["united kingdom", "uk", "london", "lhr", "lgw", "英国", "伦敦"]
  },
  {
    country: "United States",
    region: "US",
    terms: [
      "united states",
      "usa",
      "new york",
      "jfk",
      "ewr",
      "los angeles",
      "lax",
      "美国",
      "纽约",
      "洛杉矶"
    ]
  },
  {
    country: "Canada",
    region: "CA",
    terms: [
      "canada",
      "toronto",
      "yyz",
      "vancouver",
      "yvr",
      "montreal",
      "yul",
      "加拿大",
      "多伦多",
      "温哥华",
      "蒙特利尔"
    ]
  },
  {
    country: "Australia",
    region: "AU",
    terms: [
      "australia",
      "sydney",
      "syd",
      "melbourne",
      "mel",
      "brisbane",
      "bne",
      "澳大利亚",
      "澳洲",
      "悉尼",
      "墨尔本",
      "布里斯班"
    ]
  },
  {
    country: "China",
    region: "CN",
    terms: [
      "china",
      "beijing",
      "pek",
      "pkx",
      "shanghai",
      "pvg",
      "sha",
      "guangzhou",
      "can",
      "shenzhen",
      "szx",
      "中国",
      "北京",
      "上海",
      "广州",
      "深圳"
    ]
  }
];

const countryRegions = new Map<string, PolicyRouteRegion>([
  ...knownPlaces.map((place) => [place.country.toLowerCase(), place.region] as const),
  ...[
    "eu",
    "portugal",
    "belgium",
    "austria",
    "greece",
    "sweden",
    "denmark",
    "finland",
    "poland",
    "czechia"
  ].map((country) => [country, "EU_EEA_CH"] as const),
  ["us", "US"],
  ["uk", "UK"],
  ["ca", "CA"],
  ["au", "AU"],
  ["cn", "CN"],
  ["mainland china", "CN"]
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeProviderText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

const carrierRegions = new Map<string, PolicyRouteRegion>([
  ...[
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
  ].map((carrier) => [normalizeProviderText(carrier), "EU_EEA_CH"] as const),
  ...["british airways", "virgin atlantic", "easyjet", "jet2", "tui airways", "wizz air uk"].map(
    (carrier) => [normalizeProviderText(carrier), "UK"] as const
  ),
  ...[
    "air china",
    "china eastern airlines",
    "china eastern",
    "china southern airlines",
    "china southern",
    "hainan airlines",
    "xiamenair",
    "sichuan airlines",
    "spring airlines"
  ].map((carrier) => [normalizeProviderText(carrier), "CN"] as const)
]);

function termIndex(text: string, term: string): number {
  if (/^[a-z0-9]+$/i.test(term) && term.length <= 3) {
    return text.search(new RegExp(`\\b${term}\\b`, "i"));
  }
  return text.indexOf(term);
}

export function findCanonicalProviderMatch(
  value: string,
  providerType?: KnownProviderType | "unknown"
): CanonicalProviderMatch | undefined {
  const normalized = normalizeProviderText(value).replaceAll("united states", "");
  const match = providerDefinitions
    .filter(
      (definition) =>
        !providerType || providerType === "unknown" || definition.providerType === providerType
    )
    .flatMap((definition) =>
      definition.terms.map((term) => ({
        definition,
        index: termIndex(normalized, normalizeProviderText(term)),
        termLength: term.length
      }))
    )
    .filter(({ index }) => index >= 0)
    .sort(
      (left, right) => left.index - right.index || right.termLength - left.termLength
    )[0]?.definition;
  return match
    ? {
        provider: match.provider,
        providerType: match.providerType,
        operatingCarrierRegion: match.operatingCarrierRegion
      }
    : undefined;
}

export function canonicalizeProviderNameValue(
  value: string | null | undefined,
  providerType?: KnownProviderType | "unknown"
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return findCanonicalProviderMatch(trimmed, providerType)?.provider ?? trimmed;
}

export function providerComparisonKey(value: string | null | undefined): string {
  const canonical = canonicalizeProviderNameValue(value);
  if (!canonical) return "";
  return normalizeProviderText(canonical)
    .replace(/\b(airline|airlines|air lines|hotel|hotels|resort|resorts)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalHotelGroupValue(value: string | null | undefined): string | undefined {
  return value ? findCanonicalProviderMatch(value, "hotel")?.provider : undefined;
}

function resolved<T>(
  value: T,
  source: ResolvedValue<T>["source"],
  confidence: ResolvedValue<T>["confidence"],
  reasons: string[]
): ResolvedValue<T> {
  return { value, source, confidence, reasons };
}

export function resolveProvider(
  provider: string | null,
  brandOrProperty: string | null,
  providerType: KnownProviderType | null
): ResolvedValue<string | null> {
  const candidate = provider ?? brandOrProperty;
  const trimmed = candidate?.trim();
  if (!trimmed) return resolved(null, "insufficient_facts", "low", ["provider_missing"]);
  const match = findCanonicalProviderMatch(trimmed, providerType ?? undefined);
  return match
    ? resolved(match.provider, "provider_registry", "high", ["provider_alias_matched"])
    : resolved(trimmed, "insufficient_facts", "low", ["provider_not_in_registry"]);
}

export function resolveOperatingCarrier(carrier: string | null): ResolvedValue<string | null> {
  const trimmed = carrier?.trim();
  if (!trimmed) {
    return resolved(null, "insufficient_facts", "low", ["operating_carrier_missing"]);
  }
  const match = findCanonicalProviderMatch(trimmed, "airline");
  return match
    ? resolved(match.provider, "carrier_registry", "high", ["carrier_alias_matched"])
    : resolved(trimmed, "insufficient_facts", "low", ["carrier_not_in_registry"]);
}

export function resolveOperatingCarrierRegion(
  carrier: string | null
): ResolvedValue<PolicyRouteRegion | null> {
  const match = carrier ? findCanonicalProviderMatch(carrier, "airline") : undefined;
  const region =
    match?.operatingCarrierRegion ??
    (carrier ? carrierRegions.get(normalizeProviderText(carrier)) : undefined);
  return region
    ? resolved(region, "carrier_registry", "high", ["carrier_region_matched"])
    : resolved(null, "insufficient_facts", "low", ["carrier_region_unknown"]);
}

export function isEuCarrierValue(carrier: string | null | undefined): boolean {
  return resolveOperatingCarrierRegion(carrier ?? null).value === "EU_EEA_CH";
}

export function isUkOrEuCarrierValue(carrier: string | null | undefined): boolean {
  const region = resolveOperatingCarrierRegion(carrier ?? null).value;
  return region === "UK" || region === "EU_EEA_CH";
}

export function isChineseCarrierValue(carrier: string | null | undefined): boolean {
  return resolveOperatingCarrierRegion(carrier ?? null).value === "CN";
}

function findKnownPlace(value: string): KnownPlace | undefined {
  const normalized = normalize(value);
  return knownPlaces.find((place) =>
    place.terms.some((term) => normalized === term || normalized.includes(term))
  );
}

export function resolveLocationRegion(
  location: RawLocation
): ResolvedValue<PolicyRouteRegion | null> {
  if (location.airport) {
    const place = findKnownPlace(location.airport);
    if (place) return resolved(place.region, "airport_registry", "high", ["airport_matched"]);
  }
  if (location.city) {
    const place = findKnownPlace(location.city);
    if (place) return resolved(place.region, "airport_registry", "medium", ["city_matched"]);
  }
  if (location.country) {
    const region =
      countryRegions.get(normalize(location.country)) ?? findKnownPlace(location.country)?.region;
    if (region) return resolved(region, "country_rule", "high", ["country_matched"]);
  }
  return resolved(null, "insufficient_facts", "low", ["location_unresolved"]);
}

export function resolveKnownLocation(location: RawLocation): RawLocation & {
  region: PolicyRouteRegion | null;
} {
  const place = [location.airport, location.city, location.country]
    .filter((value): value is string => Boolean(value))
    .map(findKnownPlace)
    .find((candidate): candidate is KnownPlace => Boolean(candidate));
  return {
    ...location,
    country: location.country ?? place?.country ?? null,
    region: resolveLocationRegion(location).value
  };
}

function locationFromKnownPlace(place: KnownPlace, matchedTerm: string): RawLocation {
  const airport = /^[a-z]{3}$/i.test(matchedTerm) ? matchedTerm.toUpperCase() : null;
  const city = airport || normalize(matchedTerm) === normalize(place.country) ? null : matchedTerm;
  return { city, airport, country: place.country };
}

function findPlaceAfterMarker(text: string, markers: string[]): RawLocation | undefined {
  const normalizedText = normalize(text);
  const match = knownPlaces
    .flatMap((place) =>
      place.terms.flatMap((term) =>
        markers.map((marker) => ({
          place,
          term,
          index: normalizedText.indexOf(`${marker}${normalize(term)}`)
        }))
      )
    )
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index || right.term.length - left.term.length)[0];
  return match ? locationFromKnownPlace(match.place, match.term) : undefined;
}

export function inferRouteLocationsValue(text: string): {
  origin?: RawLocation;
  destination?: RawLocation;
} {
  return {
    origin: findPlaceAfterMarker(text, ["from ", "departing ", "leaving ", "从", "由"]),
    destination: findPlaceAfterMarker(text, ["to ", "flying to ", "到", "飞往", "前往"])
  };
}

export function policyRegionsFromCountryValue(country: string | undefined): PolicyRegion[] {
  const normalized = country?.trim().toLowerCase();
  if (!normalized) return [];
  return [countryRegions.get(normalized) ?? findKnownPlace(normalized)?.region ?? "other"];
}

export function resolveControllability(
  reason: RawClaimFacts["reasonCategory"] | undefined
): ResolvedValue<"controllable" | "uncontrollable" | "unknown"> {
  if (reason === "crew" || reason === "mechanical" || reason === "other_controllable") {
    return resolved("controllable", "reason_rule", "high", ["controllable_reason"]);
  }
  if (reason === "weather" || reason === "other_uncontrollable") {
    return resolved("uncontrollable", "reason_rule", "high", ["uncontrollable_reason"]);
  }
  return resolved("unknown", "insufficient_facts", "low", ["controllability_unknown"]);
}

function resolveApplicability(
  target: "EU_EEA_CH" | "UK",
  originRegion: PolicyRouteRegion | null,
  destinationRegion: PolicyRouteRegion | null,
  carrierRegion: PolicyRouteRegion | null
): ResolvedValue<DerivedApplicability> {
  if (originRegion === target) {
    return resolved("applies", "scenario_rule", "high", [`${target.toLowerCase()}_departure`]);
  }
  if (destinationRegion === target) {
    const carrierMatches =
      target === "EU_EEA_CH"
        ? carrierRegion === "EU_EEA_CH"
        : carrierRegion === "UK" || carrierRegion === "EU_EEA_CH";
    if (carrierMatches) {
      return resolved("applies", "scenario_rule", "high", [
        `${target.toLowerCase()}_arrival_carrier`
      ]);
    }
    if (carrierRegion === null) {
      return resolved("unknown", "insufficient_facts", "low", ["operating_carrier_region_unknown"]);
    }
    return resolved("does_not_apply", "scenario_rule", "high", ["inbound_carrier_excluded"]);
  }
  if (originRegion === null || destinationRegion === null) {
    return resolved("unknown", "insufficient_facts", "low", ["route_region_unknown"]);
  }
  return resolved("does_not_apply", "scenario_rule", "high", ["route_region_excluded"]);
}

export function resolveJurisdiction(
  facts: RawClaimFacts,
  normalizedOperatingCarrier: string | null
): ResolvedJurisdiction {
  const originRegion = resolveLocationRegion(facts.origin);
  const destinationRegion = resolveLocationRegion(facts.destination);
  const operatingCarrierRegion = resolveOperatingCarrierRegion(normalizedOperatingCarrier);
  return {
    originRegion,
    destinationRegion,
    operatingCarrierRegion,
    eu261: resolveApplicability(
      "EU_EEA_CH",
      originRegion.value,
      destinationRegion.value,
      operatingCarrierRegion.value
    ),
    uk261: resolveApplicability(
      "UK",
      originRegion.value,
      destinationRegion.value,
      operatingCarrierRegion.value
    )
  };
}

export function resolveClaimContext(input: { state: ClaimState }): ResolvedClaimContext {
  const resolutionFacts = buildResolutionFacts(input.state);
  const normalizedProvider = resolveProvider(
    resolutionFacts.provider,
    resolutionFacts.brandOrProperty,
    resolutionFacts.providerType
  );
  const normalizedOperatingCarrier = resolveOperatingCarrier(resolutionFacts.operatingCarrier);
  const jurisdiction = resolveJurisdiction(resolutionFacts, normalizedOperatingCarrier.value);
  const controllability = resolveControllability(resolutionFacts.reasonCategory);
  const contextWithoutScenarios = {
    raw: input.state,
    resolutionFacts,
    normalizedProvider,
    normalizedOperatingCarrier,
    jurisdiction,
    controllability
  };
  return {
    ...contextWithoutScenarios,
    scenarios: resolveScenarioSet(contextWithoutScenarios)
  };
}
