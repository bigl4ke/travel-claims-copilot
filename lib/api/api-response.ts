import { ModelFailure } from "../model/model-error";
import { isApiFault } from "./api-error";

export type ApiErrorCode =
  | "invalid_json"
  | "gpt_access_denied"
  | "request_too_large"
  | "unsupported_media_type"
  | "unprocessable_request"
  | "rate_limited"
  | "concurrency_limited"
  | "budget_restricted"
  | "model_refusal"
  | "model_timeout"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "invalid_model_json"
  | "invalid_model_schema"
  | "upstream_failure";

export type ApiErrorEnvelope = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    retryable: boolean;
  };
};

export type RequestIdFactory = () => string;

type ApiErrorSpec = {
  status: 400 | 401 | 413 | 415 | 422 | 429 | 502 | 504;
  message: string;
  retryable: boolean;
};

const errorSpecs: Record<ApiErrorCode, ApiErrorSpec> = {
  invalid_json: { status: 400, message: "Invalid JSON request.", retryable: false },
  gpt_access_denied: { status: 401, message: "GPT access is denied.", retryable: false },
  request_too_large: { status: 413, message: "Request body is too large.", retryable: false },
  unsupported_media_type: {
    status: 415,
    message: "Request content type must be application/json.",
    retryable: false
  },
  unprocessable_request: {
    status: 422,
    message: "Request could not be processed.",
    retryable: false
  },
  rate_limited: {
    status: 429,
    message: "Too many requests. Please try again later.",
    retryable: true
  },
  concurrency_limited: {
    status: 429,
    message: "Too many requests are in progress. Please try again later.",
    retryable: true
  },
  budget_restricted: {
    status: 429,
    message: "GPT analysis is temporarily restricted.",
    retryable: false
  },
  model_refusal: {
    status: 422,
    message: "The model could not process this request.",
    retryable: false
  },
  model_timeout: {
    status: 504,
    message: "The analysis service timed out.",
    retryable: true
  },
  upstream_rate_limited: {
    status: 502,
    message: "The analysis service is temporarily unavailable.",
    retryable: true
  },
  upstream_unavailable: {
    status: 502,
    message: "The analysis service is temporarily unavailable.",
    retryable: true
  },
  invalid_model_json: {
    status: 502,
    message: "The analysis service returned an invalid response.",
    retryable: true
  },
  invalid_model_schema: {
    status: 502,
    message: "The analysis service returned an invalid response.",
    retryable: true
  },
  upstream_failure: {
    status: 502,
    message: "The analysis service is temporarily unavailable.",
    retryable: true
  }
};

function caughtErrorCodeFor(error: unknown): ApiErrorCode {
  if (isApiFault(error)) return error.code;
  if (error instanceof ModelFailure) return error.code;
  return "upstream_failure";
}

export function withRequestId(factory: RequestIdFactory = () => crypto.randomUUID()): string {
  return factory();
}

export function toApiErrorResponse(code: ApiErrorCode, requestId: string): Response {
  const spec = errorSpecs[code];
  const envelope: ApiErrorEnvelope = {
    error: {
      code,
      message: spec.message,
      requestId,
      retryable: spec.retryable
    }
  };
  return Response.json(envelope, {
    status: spec.status,
    headers: { "Cache-Control": "no-store" }
  });
}

export function toCaughtApiErrorResponse(error: unknown, requestId: string): Response {
  return toApiErrorResponse(caughtErrorCodeFor(error), requestId);
}
