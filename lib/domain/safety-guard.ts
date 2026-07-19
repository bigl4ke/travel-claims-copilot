import type { RawClaimFacts } from "./claim-contract";

export type HighRiskCategory =
  | "acute_medical_or_safety"
  | "personal_injury"
  | "litigation_strategy"
  | "significant_property_loss"
  | "complex_insurance";

export type ScopeGuardDecision =
  | { status: "pass" }
  | { status: "unsupported_high_risk"; category: HighRiskCategory; message: string }
  | { status: "out_of_scope"; message: string };

const acuteMedicalOrSafetyPattern = new RegExp(
  [
    String.raw`\b(emergency|poison(?:ed|ing)?|overdose|fire|unconscious|can(?:not|['’]?t) breathe)\b`,
    String.raw`\b(?:swallow(?:ed|ing)?|ingest(?:ed|ing|ion)?)\b.{0,16}\b(?:cleaning chemical|chemical|cleaner)\b`,
    "中毒|火灾|昏迷|无法呼吸|急救"
  ].join("|"),
  "iu"
);

const significantDollarAmount = String.raw`\$(?:[1-9]\d{3,}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{2})?`;
const englishSignificantObject = String.raw`(?:\b(?:jewelry|jewellery|valuable property)\b|${significantDollarAmount})`;
const englishUnnegatedObject = String.raw`(?<!no )${englishSignificantObject}`;
const englishPropertyGap = String.raw`[^.!?;,\n]{0,60}`;
const englishPropertyLoss = String.raw`(?<!not )(?<!never )(?<!n't )\b(?:lost|stolen|destroyed)\b`;
const chineseSignificantObject = String.raw`(?:高价值.{0,12}(?:财物|珠宝)|价值很高.{0,12}(?:财物|珠宝)|(?<!高价值)(?<!值很高的)珠宝)`;
const chinesePropertyGap = String.raw`[^。！？；，\n]{0,24}`;
const chinesePropertyLoss = String.raw`(?<!没有任何)(?<!没有)(?<!并未)(?<!并无)(?<!未曾)(?<!未)(?:丢失|被盗|损坏|弄丢)`;
const chineseUnnegatedObject = String.raw`(?<!没有任何)(?<!没有)(?<!并无)(?<!未有)(?<!无)${chineseSignificantObject}`;
const significantPropertyPattern = new RegExp(
  [
    `${englishPropertyLoss}${englishPropertyGap}${englishSignificantObject}`,
    `${englishUnnegatedObject}${englishPropertyGap}${englishPropertyLoss}`,
    `${chinesePropertyLoss}${chinesePropertyGap}${chineseSignificantObject}`,
    `${chineseUnnegatedObject}${chinesePropertyGap}${chinesePropertyLoss}`
  ].join("|"),
  "iu"
);

export const HIGH_RISK_RULES: readonly {
  category: HighRiskCategory;
  pattern: RegExp;
  userMessage: string;
}[] = [
  {
    category: "acute_medical_or_safety",
    pattern: acuteMedicalOrSafetyPattern,
    userMessage:
      "This may require immediate emergency or medical help; this tool cannot analyze it as an ordinary travel claim."
  },
  {
    category: "personal_injury",
    pattern: /\b(personal injury|bodily injury|injured|medical harm)\b|人身伤害|受伤|医疗损害/iu,
    userMessage: "Personal-injury claims need qualified medical and legal support beyond this tool."
  },
  {
    category: "litigation_strategy",
    pattern:
      /\b(litigation strategy|how to sue|prepare (?:my )?lawsuit|court strategy)\b|诉讼策略|如何起诉|准备起诉/iu,
    userMessage:
      "Litigation strategy requires a qualified lawyer; this tool will not provide ordinary claim analysis for it."
  },
  {
    category: "significant_property_loss",
    pattern: significantPropertyPattern,
    userMessage:
      "Significant property loss may require police, insurer, or legal assistance beyond this tool."
  },
  {
    category: "complex_insurance",
    pattern:
      /\b(complex|interpret|coverage dispute)\b.{0,40}\b(insurance|policy exclusion|coverage denial)\b|复杂.{0,16}(保险|拒赔)|解释.{0,16}(保险条款|拒赔)/iu,
    userMessage:
      "Complex insurance interpretation requires a qualified insurance or legal professional."
  }
];

export function preflightGuard(message: string): ScopeGuardDecision {
  const text = message.normalize("NFKC").toLowerCase();
  const match = HIGH_RISK_RULES.find(({ pattern }) => pattern.test(text));
  return match
    ? {
        status: "unsupported_high_risk",
        category: match.category,
        message: match.userMessage
      }
    : { status: "pass" };
}

export function projectGuardText(facts: RawClaimFacts): string {
  return [
    facts.provider,
    facts.brandOrProperty,
    facts.operatingCarrier,
    facts.origin.city,
    facts.origin.airport,
    facts.origin.country,
    facts.destination.city,
    facts.destination.airport,
    facts.destination.country,
    facts.statedReason,
    facts.scheduledFinalArrival,
    facts.actualFinalArrival,
    facts.loyaltyStatus,
    ...facts.expenses,
    ...facts.evidence,
    facts.userGoal
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

export function postMergeGuard(message: string, facts: RawClaimFacts): ScopeGuardDecision {
  return preflightGuard([message, projectGuardText(facts)].join("\n"));
}
