import type { Case } from "../types";

const SYNTHETIC_PROVENANCE_MARKER =
  /\b(?:synthetic|fabricated)\b|\bdemo(?:-only|\s+(?:case|data|scenario|record|fixture|example|report|content))\b|合成/i;
const NEGATED_SYNTHETIC_PREFIX =
  /\b(?:(?:not|never)\s+(?:(?:a|an)\s+)?|(?:no|without)\s+)(?:synthetic|fabricated)\s+(?:demo|example|case|fixture|report|data|dataset|scenario|record|content|account)\b/i;
const NEGATED_SYNTHETIC_SUFFIX =
  /\b(?:synthetic|fabricated)\s+(?:identifiers?|data|datasets?|content|facts?|records?|scenarios?|cases?|reports?|fixtures?|examples?|accounts?)\s+(?:were?|was|are|is|have\s+been|has\s+been)\s+not\s+(?:used|included|generated|fabricated|present)\b/i;

export type CaseSourceDisclosureError =
  | "source_type"
  | "source_url"
  | "synthetic_label"
  | "masquerade"
  | null;

function removeAllMatches(value: string, pattern: RegExp): string {
  let result = value;
  while (pattern.test(result)) result = result.replace(pattern, " ");
  return result;
}

function hasSyntheticProvenanceMarker(value: string): boolean {
  return value
    .split(/[.!?\n]+/)
    .map((sentence) => removeAllMatches(sentence, NEGATED_SYNTHETIC_PREFIX))
    .map((sentence) => removeAllMatches(sentence, NEGATED_SYNTHETIC_SUFFIX))
    .some((sentence) => SYNTHETIC_PROVENANCE_MARKER.test(sentence));
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function caseSourceDisclosureError(item: Case): CaseSourceDisclosureError {
  if (!["community_dp", "user_submitted", "synthetic_example"].includes(item.source_type)) {
    return "source_type";
  }
  if (
    !item.source_name.trim() ||
    (item.source_type === "synthetic_example"
      ? Boolean(item.source_url) && !isHttpsUrl(item.source_url)
      : !isHttpsUrl(item.source_url))
  ) {
    return "source_url";
  }
  const disclosureValues = [
    item.source_name,
    item.facts,
    item.actual_outcome,
    item.reusable_lesson,
    item.notes,
    ...item.review_notes,
    ...item.requested_compensation,
    ...item.evidence_used,
    ...item.escalation_path
  ];
  const hasSyntheticMarker = disclosureValues.some(hasSyntheticProvenanceMarker);
  if (item.source_type === "synthetic_example") {
    return hasSyntheticMarker ? null : "synthetic_label";
  }
  return hasSyntheticMarker ? "masquerade" : null;
}

export function hasValidCaseSourceDisclosure(item: Case): boolean {
  return caseSourceDisclosureError(item) === null;
}
