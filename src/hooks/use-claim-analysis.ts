"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { AnalyzeClaimRequest } from "../../lib/api/analyze-contract";
import type { ExtractionMode, UserFactEdit } from "../../lib/domain/claim-contract";
import {
  analyzeClaim,
  type AnalysisApiError,
  type AnalyzeClaimOptions
} from "../lib/analysis-api-client";
import {
  claimWorkflowReducer,
  createInitialClaimWorkflowState,
  type ClaimWorkflowState
} from "../lib/claim-workflow";

export type UseClaimAnalysisOptions = {
  fetcher?: typeof fetch;
};

export type UseClaimAnalysisResult = {
  workflow: ClaimWorkflowState;
  mode: ExtractionMode;
  privacyAcknowledged: boolean;
  accessCode: string;
  canSubmit: boolean;
  submitMessage(message: string): Promise<void>;
  submitCorrection(correction: UserFactEdit): Promise<void>;
  startFactReview(): void;
  cancelFactReview(): void;
  setMode(mode: ExtractionMode): void;
  setPrivacyAcknowledged(value: boolean): void;
  setAccessCode(value: string): void;
  reset(): void;
};

type ActiveController = { token: number; controller: AbortController };

function isAbortError(value: unknown): boolean {
  return (
    (value instanceof DOMException && value.name === "AbortError") ||
    (typeof value === "object" && value !== null && "name" in value && value.name === "AbortError")
  );
}

function safeClientError(value: unknown): AnalysisApiError {
  if (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof value.status === "number" &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string" &&
    "requestId" in value &&
    (typeof value.requestId === "string" || value.requestId === null) &&
    "retryable" in value &&
    typeof value.retryable === "boolean"
  ) {
    return {
      status: value.status,
      code: value.code,
      message: value.message,
      requestId: value.requestId,
      retryable: value.retryable
    };
  }
  return {
    status: 0,
    code: "invalid_analysis_response",
    message: "Analysis could not be completed. Please try again.",
    requestId: null,
    retryable: false
  };
}

export function useClaimAnalysis(options: UseClaimAnalysisOptions = {}): UseClaimAnalysisResult {
  const [workflow, dispatch] = useReducer(
    claimWorkflowReducer,
    undefined,
    createInitialClaimWorkflowState
  );
  const [mode, setModeState] = useState<ExtractionMode>("local");
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const tokenRef = useRef(0);
  const activeControllerRef = useRef<ActiveController | null>(null);
  const { fetcher } = options;

  const runRequest = useCallback(
    async (request: AnalyzeClaimRequest, kind: "message" | "correction") => {
      activeControllerRef.current?.controller.abort();
      const token = tokenRef.current + 1;
      tokenRef.current = token;
      const controller = new AbortController();
      activeControllerRef.current = { token, controller };
      dispatch({
        type: "request_started",
        token,
        baseRevision: request.baseRevision,
        kind
      });

      const clientOptions: AnalyzeClaimOptions = {
        signal: controller.signal,
        demoAccessCode: accessCode,
        ...(fetcher ? { fetcher } : {})
      };
      try {
        const response = await analyzeClaim(request, clientOptions);
        dispatch({ type: "response_received", token, response });
      } catch (error) {
        if (isAbortError(error)) {
          dispatch({ type: "request_cancelled", token });
        } else {
          dispatch({ type: "failed", token, error: safeClientError(error) });
        }
      } finally {
        if (activeControllerRef.current?.token === token) activeControllerRef.current = null;
      }
    },
    [accessCode, fetcher]
  );

  const submitMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const prior = workflow.claimState;
      await runRequest(
        {
          message: trimmed,
          prior,
          baseRevision: prior.revision,
          requestedMode: mode,
          privacyAcknowledged
        },
        "message"
      );
    },
    [mode, privacyAcknowledged, runRequest, workflow.claimState]
  );

  const submitCorrection = useCallback(
    async (correction: UserFactEdit) => {
      if (Object.keys(correction.set).length === 0 && correction.clear.length === 0) return;
      const prior = workflow.claimState;
      await runRequest(
        {
          message: "",
          prior,
          correction,
          baseRevision: prior.revision,
          requestedMode: mode,
          privacyAcknowledged
        },
        "correction"
      );
    },
    [mode, privacyAcknowledged, runRequest, workflow.claimState]
  );

  const startFactReview = useCallback(() => dispatch({ type: "review_started" }), []);
  const cancelFactReview = useCallback(() => dispatch({ type: "review_cancelled" }), []);

  const setMode = useCallback(
    (nextMode: ExtractionMode) => {
      if (nextMode === mode) return;
      const active = activeControllerRef.current;
      active?.controller.abort();
      tokenRef.current += 1;
      activeControllerRef.current = null;
      if (active) dispatch({ type: "request_cancelled", token: active.token });
      setModeState(nextMode);
    },
    [mode]
  );

  const reset = useCallback(() => {
    activeControllerRef.current?.controller.abort();
    activeControllerRef.current = null;
    tokenRef.current += 1;
    dispatch({ type: "reset" });
  }, []);

  useEffect(
    () => () => {
      activeControllerRef.current?.controller.abort();
      activeControllerRef.current = null;
      tokenRef.current += 1;
    },
    []
  );

  return useMemo(
    () => ({
      workflow,
      mode,
      privacyAcknowledged,
      accessCode,
      canSubmit:
        workflow.activeRequest === null &&
        (mode === "local" || (privacyAcknowledged && accessCode.trim().length > 0)),
      submitMessage,
      submitCorrection,
      startFactReview,
      cancelFactReview,
      setMode,
      setPrivacyAcknowledged,
      setAccessCode,
      reset
    }),
    [
      accessCode,
      cancelFactReview,
      mode,
      privacyAcknowledged,
      reset,
      setMode,
      startFactReview,
      submitCorrection,
      submitMessage,
      workflow
    ]
  );
}
