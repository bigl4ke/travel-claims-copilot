import type { ProcessClaimDependencies } from "../../lib/claim-workflow";
import { processClaimTurn } from "../../lib/claim-workflow";
import type { RawClaimFacts, RemedyAssessment } from "../../lib/domain/claim-contract";
import type { CarrierCommitment, KnowledgeSnapshot } from "../../lib/knowledge/knowledge-contract";
import type { RawFactExtractor } from "../../lib/model/raw-fact-extractor";
import type { RetrievalLimits } from "../../lib/types";
import { claimState, type DeepPartial } from "./raw-claims";
import { knowledgeSnapshotFixture } from "./knowledge";

type WorkflowFixtureInput = {
  facts?: DeepPartial<RawClaimFacts>;
  commitments?: CarrierCommitment[];
  knowledge?: Partial<KnowledgeSnapshot>;
  asOf?: string;
  retrievalLimits?: RetrievalLimits;
};

const emptyExtractor: RawFactExtractor = {
  provider: "local",
  model: null,
  async extract() {
    return { set: {} };
  }
};

export async function runWorkflowFixture(input: WorkflowFixtureInput = {}) {
  const knowledge = knowledgeSnapshotFixture({
    ...input.knowledge,
    carrierCommitments: input.commitments ?? input.knowledge?.carrierCommitments ?? []
  });
  const dependencies: ProcessClaimDependencies = {
    localExtractor: emptyExtractor,
    knowledgeRepository: {
      async load() {
        return knowledge;
      }
    },
    now: () => input.asOf ?? "2026-07-18",
    retrievalLimits: input.retrievalLimits
  };
  const prior = claimState({
    incidentType: "airline_cancellation",
    providerType: "airline",
    operatingCarrier: "United",
    origin: { airport: "JFK" },
    destination: { airport: "LAX" },
    reasonCategory: "crew",
    userInitiatedChange: false,
    isOvernight: true,
    assistance: { refundAccepted: false, reroutingAccepted: false },
    ...input.facts
  });

  return processClaimTurn(
    { message: "No additional fixture facts.", prior, baseRevision: prior.revision },
    dependencies
  );
}

export function remedyById(
  result: Awaited<ReturnType<typeof runWorkflowFixture>>,
  remedyId: RemedyAssessment["remedyId"]
): RemedyAssessment {
  const remedy = result.result.assessments.find((candidate) => candidate.remedyId === remedyId);
  if (!remedy) throw new Error(`Missing remedy ${remedyId}`);
  return remedy;
}
