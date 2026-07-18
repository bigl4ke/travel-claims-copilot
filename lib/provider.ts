import {
  canonicalHotelGroupValue,
  canonicalizeProviderNameValue,
  findCanonicalProviderMatch,
  providerComparisonKey,
  type CanonicalProviderMatch
} from "./domain/context-resolver";
import type { ProviderType } from "./types";

type KnownProviderType = Extract<ProviderType, "hotel" | "airline">;

export type ProviderMatch = CanonicalProviderMatch;

export function findProviderMatch(
  value: string,
  providerType?: KnownProviderType | "unknown"
): ProviderMatch | undefined {
  return findCanonicalProviderMatch(value, providerType);
}

export function canonicalizeProviderName(
  value: string | null | undefined,
  providerType?: KnownProviderType | "unknown"
): string | null {
  return canonicalizeProviderNameValue(value, providerType);
}

export function providerMatchKey(value: string | null | undefined): string {
  return providerComparisonKey(value);
}

export function providersMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const leftKey = providerMatchKey(left);
  return Boolean(leftKey && leftKey === providerMatchKey(right));
}

export function canonicalHotelGroup(value: string | null | undefined): string | undefined {
  return canonicalHotelGroupValue(value);
}
