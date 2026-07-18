import type { PolicyRouteRegion, ProviderType } from "./types";

type KnownProviderType = Extract<ProviderType, "hotel" | "airline">;

type ProviderDefinition = {
  provider: string;
  providerType: KnownProviderType;
  operatingCarrierRegion?: PolicyRouteRegion;
  terms: string[];
};

export type ProviderMatch = Pick<
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

function normalizeProviderText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function termIndex(text: string, term: string): number {
  if (/^[a-z0-9]+$/i.test(term) && term.length <= 3) {
    return text.search(new RegExp(`\\b${term}\\b`, "i"));
  }

  return text.indexOf(term);
}

export function findProviderMatch(
  value: string,
  providerType?: KnownProviderType | "unknown"
): ProviderMatch | undefined {
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

export function canonicalizeProviderName(
  value: string | null | undefined,
  providerType?: KnownProviderType | "unknown"
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return findProviderMatch(trimmed, providerType)?.provider ?? trimmed;
}

export function providerMatchKey(value: string | null | undefined): string {
  const canonical = canonicalizeProviderName(value);
  if (!canonical) {
    return "";
  }

  return normalizeProviderText(canonical)
    .replace(/\b(airline|airlines|air lines|hotel|hotels|resort|resorts)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function providersMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const leftKey = providerMatchKey(left);
  return Boolean(leftKey && leftKey === providerMatchKey(right));
}

export function canonicalHotelGroup(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return findProviderMatch(value, "hotel")?.provider;
}
