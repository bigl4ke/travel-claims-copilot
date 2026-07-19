export function assertExternalModelCallAllowed(): void {
  if (process.env.TEST_OFFLINE === "1") {
    throw new Error("External model calls are disabled in TEST_OFFLINE");
  }
}
