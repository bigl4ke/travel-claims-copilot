import { createHash, timingSafeEqual } from "node:crypto";

export function verifyDemoAccess(input: {
  consent: boolean;
  suppliedCode: string | null | undefined;
  configuredCode: string | null | undefined;
}): boolean {
  if (!input.consent) return false;
  const supplied = input.suppliedCode ?? "";
  const configured = input.configuredCode ?? "";
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const configuredDigest = createHash("sha256").update(configured, "utf8").digest();
  const matches = timingSafeEqual(suppliedDigest, configuredDigest);
  const hasSuppliedCode = supplied.trim().length > 0;
  const hasConfiguredCode = configured.trim().length > 0;
  return hasSuppliedCode && hasConfiguredCode && matches;
}
