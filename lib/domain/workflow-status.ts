import type { WorkflowStatus } from "./claim-contract";

export type BlockedWorkflowStatus = Extract<
  WorkflowStatus,
  "out_of_scope" | "unsupported_high_risk"
>;

export function isBlockedWorkflowStatus(
  status: WorkflowStatus | "needs_info"
): status is BlockedWorkflowStatus {
  return status === "out_of_scope" || status === "unsupported_high_risk";
}
