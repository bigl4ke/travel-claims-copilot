export const MAX_INTAKE_MESSAGE_LENGTH = 4_000;
export const MAX_ANALYZE_DESCRIPTION_LENGTH = 12_000;
export const MAX_REQUEST_BODY_BYTES = 64_000;

export function requestBodyExceedsLimit(request: Request): boolean {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES;
}
