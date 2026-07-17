import { normalizeIssueType } from "./issueTaxonomy";
import type {
  AnalyzeOptions,
  Case,
  ExtractedFacts,
  IssueType,
  ProviderType
} from "./types";

type MatchResult = {
  issueType: IssueType;
  provider?: string;
  providerType?: ProviderType;
  country?: string;
  bookingChannel?: Case["booking_channel"];
  loyaltyStatus?: string;
  disruptionReason?: ExtractedFacts["disruptionReason"];
  isOvernight?: boolean;
  deniedBoardingKind?: ExtractedFacts["deniedBoardingKind"];
  confidence: ExtractedFacts["confidence"];
  signals: string[];
};

type ProviderDefinition = {
  provider: string;
  providerType: Exclude<ProviderType, "government">;
  terms: string[];
};

const providerDefinitions: ProviderDefinition[] = [
  {
    provider: "American Airlines",
    providerType: "airline",
    terms: ["american airlines", "american flight", "aa flight", "aa", "美国航空", "美航"]
  },
  {
    provider: "United",
    providerType: "airline",
    terms: ["united airlines", "united flight", "united", "ua", "美联航"]
  },
  {
    provider: "Delta",
    providerType: "airline",
    terms: ["delta air lines", "delta flight", "delta", "dl", "达美"]
  },
  {
    provider: "Alaska Airlines",
    providerType: "airline",
    terms: ["alaska airlines", "alaska flight", "阿拉斯加航空"]
  },
  {
    provider: "Air France",
    providerType: "airline",
    terms: ["air france", "af flight", "法航"]
  },
  {
    provider: "Lufthansa",
    providerType: "airline",
    terms: ["lufthansa", "lh flight", "汉莎"]
  },
  {
    provider: "China Eastern Airlines",
    providerType: "airline",
    terms: ["china eastern", "东航"]
  },
  {
    provider: "Marriott",
    providerType: "hotel",
    terms: ["marriott", "sheraton", "bonvoy", "万豪", "喜来登"]
  },
  {
    provider: "Hyatt",
    providerType: "hotel",
    terms: ["hyatt", "凯悦"]
  },
  {
    provider: "Hilton",
    providerType: "hotel",
    terms: ["hilton", "hampton", "conrad", "希尔顿", "康莱德"]
  },
  {
    provider: "IHG",
    providerType: "hotel",
    terms: ["ihg", "holiday inn", "crowne plaza", "洲际", "假日酒店"]
  }
];

const loyaltyStatuses = [
  { status: "Titanium", terms: ["titanium", "钛金"] },
  { status: "Platinum Pro", terms: ["platinum pro"] },
  { status: "Platinum", terms: ["platinum", "白金"] },
  { status: "Globalist", terms: ["globalist", "环球客", "球客"] },
  { status: "Explorist", terms: ["explorist", "探索者"] },
  { status: "Diamond", terms: ["diamond", "钻石", "钻卡"] },
  { status: "Gold", terms: ["gold", "金卡"] }
] as const;

function hasTerm(text: string, term: string): boolean {
  if (/^[a-z0-9]+$/i.test(term) && term.length <= 3) {
    return new RegExp(`\\b${term}\\b`, "i").test(text);
  }

  return text.includes(term);
}

function findTermIndex(text: string, term: string): number {
  if (/^[a-z0-9]+$/i.test(term) && term.length <= 3) {
    return text.search(new RegExp(`\\b${term}\\b`, "i"));
  }

  return text.indexOf(term);
}

function hasAny(text: string, terms: string[]): string[] {
  return terms.filter((term) => hasTerm(text, term));
}

function findProvider(text: string): Pick<MatchResult, "provider" | "providerType"> {
  const providerText = text.replaceAll("united states", "");
  const match = providerDefinitions
    .flatMap((definition) =>
      definition.terms.map((term) => ({
        definition,
        index: findTermIndex(providerText, term),
        termLength: term.length
      }))
    )
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index || right.termLength - left.termLength)[0]
    ?.definition;

  return match
    ? { provider: match.provider, providerType: match.providerType }
    : {};
}

function findCountry(text: string): string | undefined {
  const countryTerms: Array<[string, string[]]> = [
    ["EU", ["eu261", "european union", "europe", "欧盟", "欧洲"]],
    ["US", ["united states", "u.s.", "usa", "美国"]],
    ["France", ["france", "paris", "cdg", "法国", "巴黎"]],
    ["Germany", ["germany", "frankfurt", "fra", "德国", "法兰克福"]],
    ["Italy", ["italy", "rome", "意大利", "罗马"]],
    ["China", ["china", "中国"]],
    ["Canada", ["canada", "加拿大"]],
    ["Japan", ["japan", "日本"]]
  ];

  return countryTerms.find(([, terms]) => terms.some((term) => hasTerm(text, term)))?.[0];
}

function findBookingChannel(text: string): Case["booking_channel"] | undefined {
  if (hasAny(text, ["chase travel", "amex fhr", "capital one travel", "portal", "信用卡旅行门户"]).length) {
    return "portal";
  }

  if (hasAny(text, ["agoda", "expedia", "booking.com", "priceline", "ota", "第三方平台"]).length) {
    return "ota";
  }

  if (
    hasAny(text, [
      "booked direct",
      "direct booking",
      "official website",
      "官网预订",
      "官网订",
      "官方渠道",
      "直接预订"
    ]).length
  ) {
    return "direct";
  }

  return undefined;
}

function findLoyaltyStatus(text: string): string | undefined {
  return loyaltyStatuses.find(({ terms }) => terms.some((term) => hasTerm(text, term)))?.status;
}

function findDisruptionReason(text: string): ExtractedFacts["disruptionReason"] {
  if (hasAny(text, ["weather", "storm", "snow", "hurricane", "天气", "暴雪", "雷暴"]).length) {
    return "weather";
  }

  if (hasAny(text, ["crew issue", "crew timeout", "crew timed out", "crew availability", "机组", "机组超时"]).length) {
    return "crew";
  }

  if (hasAny(text, ["mechanical", "maintenance", "equipment issue", "technical issue", "机械故障", "飞机故障"]).length) {
    return "mechanical";
  }

  if (hasAny(text, ["oversold", "overbooked", "oversales", "超售"]).length) {
    return "oversales";
  }

  if (
    hasAny(text, [
      "late inbound aircraft",
      "late-arriving aircraft",
      "inbound aircraft arrived late",
      "incoming aircraft arrived late",
      "incoming plane arrived late",
      "previous flight arrived late",
      "前序航班晚到",
      "进港飞机晚到"
    ]).length ||
    /(?:because|due to)\s+(?:the\s+)?(?:plane|aircraft)\s+arrived late/.test(text)
  ) {
    return "late_inbound_aircraft";
  }

  if (hasAny(text, ["within the airline's control", "airline control", "controllable", "航司原因", "可控原因"]).length) {
    return "other_controllable";
  }

  return "unknown";
}

function findDeniedBoardingKind(text: string): ExtractedFacts["deniedBoardingKind"] {
  if (
    hasAny(text, [
      "involuntary denied boarding",
      "involuntarily bumped",
      "did not volunteer",
      "not volunteering",
      "forced to give up",
      "非自愿拒载",
      "非自愿拒绝登机"
    ]).length
  ) {
    return "involuntary";
  }

  if (
    hasAny(text, [
      "voluntary bump",
      "volunteer my seat",
      "asked for volunteers",
      "asking for volunteers",
      "seeking volunteers",
      "自愿改签",
      "征集自愿者",
      "征集自愿改签"
    ]).length
  ) {
    return "voluntary";
  }

  return "unknown";
}

function buildFacts(
  description: string,
  issueType: IssueType,
  source: ExtractedFacts["source"],
  signals: string[],
  options: AnalyzeOptions,
  match: Partial<MatchResult>,
  confidence: ExtractedFacts["confidence"]
): ExtractedFacts {
  return {
    description,
    issueType,
    provider: match.provider,
    providerType: match.providerType,
    country: match.country,
    bookingChannel: match.bookingChannel,
    loyaltyStatus: match.loyaltyStatus,
    disruptionReason: match.disruptionReason,
    isOvernight: match.isOvernight,
    deniedBoardingKind: match.deniedBoardingKind,
    caseId: options.caseId,
    confidence,
    signals: Array.from(new Set(signals)),
    source
  };
}

function matchIssue(description: string): MatchResult {
  const text = description.toLowerCase();
  const provider = findProvider(text);
  const country = findCountry(text);
  const bookingChannel = findBookingChannel(text);
  const loyaltyStatus = findLoyaltyStatus(text);
  const disruptionReason = findDisruptionReason(text);
  const deniedBoardingKind = findDeniedBoardingKind(text);
  const isOvernight =
    hasAny(text, ["overnight", "next morning", "next day", "tomorrow", "过夜", "第二天"]).length > 0;
  const shared = {
    ...provider,
    country,
    bookingChannel,
    loyaltyStatus,
    disruptionReason,
    isOvernight,
    deniedBoardingKind
  };

  const hotelContextSignals = hasAny(text, [
    "hotel",
    "property",
    "reservation",
    "front desk",
    "酒店",
    "前台",
    "入住"
  ]);
  const hotelWalkSignals = hasAny(text, [
    "hotel walk",
    "walked to another hotel",
    "no room",
    "no rooms",
    "unable to honor",
    "hotel oversold",
    "hotel overbooked",
    "到店没房",
    "酒店超售",
    "没有房间",
    "无法安排房间"
  ]);
  if (
    hotelWalkSignals.length > 0 &&
    (hotelContextSignals.length > 0 || provider.providerType === "hotel")
  ) {
    return {
      ...shared,
      issueType: "hotel_walk",
      providerType: "hotel",
      confidence: "high",
      signals: [...hotelContextSignals, ...hotelWalkSignals]
    };
  }

  const disruptionSignals = hasAny(text, [
    "delay",
    "delayed",
    "late arrival",
    "cancellation",
    "cancelled",
    "canceled",
    "missed connection",
    "arrived late",
    "hours late",
    "延误",
    "取消",
    "错过转机"
  ]);
  const euSignals = hasAny(text, [
    "eu261",
    "ec261",
    "eu",
    "european union",
    "flight from europe",
    "欧盟261",
    "欧盟",
    "欧洲出发"
  ]);
  if (euSignals.length > 0 && (disruptionSignals.length > 0 || hasTerm(text, "eu261"))) {
    return {
      ...shared,
      issueType: "eu261_delay_or_cancellation",
      providerType: "airline",
      country: country ?? "EU",
      confidence: "high",
      signals: [...euSignals, ...disruptionSignals]
    };
  }

  const airlineContextSignals = hasAny(text, [
    "airline",
    "flight",
    "gate",
    "boarding",
    "airport",
    "航司",
    "航班",
    "登机",
    "机场"
  ]);
  const deniedBoardingSignals = hasAny(text, [
    "denied boarding",
    "involuntarily bumped",
    "voluntary bump",
    "asked for volunteers",
    "asking for volunteers",
    "seeking volunteers",
    "oversold flight",
    "overbooked flight",
    "bumped from the flight",
    "拒绝登机",
    "拒载",
    "航班超售",
    "征集自愿者",
    "征集自愿改签",
    "自愿改签"
  ]);
  if (
    deniedBoardingSignals.length > 0 &&
    (airlineContextSignals.length > 0 || provider.providerType === "airline")
  ) {
    return {
      ...shared,
      issueType: "denied_boarding",
      providerType: "airline",
      disruptionReason: "oversales",
      confidence: deniedBoardingKind === "unknown" ? "medium" : "high",
      signals: [...airlineContextSignals, ...deniedBoardingSignals]
    };
  }

  const cancellationSignals = hasAny(text, ["cancellation", "cancelled", "canceled", "取消"]);
  const delaySignals = hasAny(text, ["delay", "delayed", "late", "延误", "晚点"]);
  const controllableReason = ["crew", "mechanical", "other_controllable"].includes(
    disruptionReason ?? "unknown"
  );
  if (
    airlineContextSignals.length > 0 &&
    (cancellationSignals.length > 0 || delaySignals.length > 0)
  ) {
    if (disruptionReason === "weather") {
      return {
        ...shared,
        issueType: "unknown",
        providerType: "airline",
        confidence: "low",
        signals: [...airlineContextSignals, ...cancellationSignals, ...delaySignals, "weather"]
      };
    }

    if (controllableReason) {
      return {
        ...shared,
        issueType:
          cancellationSignals.length > 0
            ? "controllable_airline_cancellation"
            : "controllable_airline_delay",
        providerType: "airline",
        confidence: "high",
        signals: [
          ...airlineContextSignals,
          ...cancellationSignals,
          ...delaySignals,
          disruptionReason ?? "unknown"
        ]
      };
    }

    return {
      ...shared,
      issueType: "unknown",
      providerType: "airline",
      confidence: "low",
      signals: [...airlineContextSignals, ...cancellationSignals, ...delaySignals]
    };
  }

  const travelDocumentSignals = hasAny(text, [
    "evus",
    "esta",
    "visa",
    "passport",
    "travel document",
    "签证",
    "护照",
    "旅行证件"
  ]);
  if (travelDocumentSignals.length > 0) {
    return {
      ...shared,
      issueType: "unknown",
      providerType: "airline",
      confidence: "low",
      signals: [...airlineContextSignals, ...travelDocumentSignals]
    };
  }

  const tripInsuranceSignals = hasAny(text, [
    "trip delay insurance",
    "amex",
    "card insurance",
    "travel protection"
  ]);
  if (tripInsuranceSignals.length > 0) {
    return {
      ...shared,
      issueType: "airline_delay_trip_insurance",
      providerType: "airline",
      confidence: "high",
      signals: tripInsuranceSignals
    };
  }

  const baggageSignals = hasAny(text, [
    "baggage",
    "luggage",
    "checked bag",
    "gate-check",
    "gate check"
  ]);
  if (baggageSignals.length > 0) {
    const notCheckedSignals = hasAny(text, [
      "not checked",
      "could not check",
      "didn't check",
      "did not check",
      "check-in"
    ]);

    return {
      ...shared,
      issueType:
        notCheckedSignals.length > 0 ? "airline_baggage_not_checked" : "baggage_delay",
      providerType: "airline",
      confidence: "high",
      signals: [...baggageSignals, ...notCheckedSignals]
    };
  }

  const mixedCarrierSignals = hasAny(text, [
    "mixed carrier",
    "operating carrier",
    "chase travel",
    "rebooked onto another airline"
  ]);
  if (mixedCarrierSignals.length > 0) {
    return {
      ...shared,
      issueType: "airline_rebooking_mixed_carrier_delay",
      providerType: "airline",
      confidence: "high",
      signals: mixedCarrierSignals
    };
  }

  const hotelMatches: Array<{ issueType: IssueType; terms: string[] }> = [
    {
      issueType: "hotel_relocation_before_opening",
      terms: ["delayed opening", "hotel not open", "opening postponed"]
    },
    {
      issueType: "hotel_billing_dispute",
      terms: ["billing", "security deposit", "incorrect charge", "folio"]
    },
    {
      issueType: "hotel_property_loss",
      terms: ["lost item", "personal item missing"]
    },
    {
      issueType: "hotel_elite_benefit_closure",
      terms: ["club closed", "lounge closed", "breakfast benefit", "club access"]
    },
    {
      issueType: "hotel_room_feature_mismatch",
      terms: ["room feature", "upgrade charge", "broken amenity", "missing amenity"]
    },
    {
      issueType: "hotel_service_issue",
      terms: ["restaurant closed", "undelivered service", "service issue"]
    }
  ];
  const hotelMatch = hotelMatches
    .map((candidate) => ({ ...candidate, signals: hasAny(text, candidate.terms) }))
    .find((candidate) => candidate.signals.length > 0);
  if (hotelMatch) {
    return {
      ...shared,
      issueType: hotelMatch.issueType,
      providerType: "hotel",
      confidence: "high",
      signals: hotelMatch.signals
    };
  }

  return {
    ...shared,
    issueType: "unknown",
    confidence: "low",
    signals: []
  };
}

export interface FactExtractor {
  extract(description: string, options?: AnalyzeOptions): Promise<ExtractedFacts>;
}

export class DeterministicFactExtractor implements FactExtractor {
  async extract(description: string, options: AnalyzeOptions = {}): Promise<ExtractedFacts> {
    return classifyInput(description, options);
  }
}

export const deterministicFactExtractor = new DeterministicFactExtractor();

export function classifyIssue(input: string): IssueType {
  return matchIssue(input).issueType;
}

export function classifyInput(
  description: string,
  options: AnalyzeOptions = {}
): ExtractedFacts {
  const selectedIssueType = normalizeIssueType(options.issueType);
  const match = matchIssue(description);

  if (options.caseId) {
    return buildFacts(
      description,
      selectedIssueType ?? "unknown",
      "selected_case",
      match.signals,
      options,
      match,
      selectedIssueType ? "high" : match.confidence
    );
  }

  if (selectedIssueType) {
    return buildFacts(
      description,
      selectedIssueType,
      "selected_issue",
      match.signals,
      options,
      match,
      "high"
    );
  }

  return buildFacts(
    description,
    match.issueType,
    match.issueType === "unknown" ? "fallback" : "keyword",
    match.signals,
    options,
    match,
    match.confidence
  );
}
