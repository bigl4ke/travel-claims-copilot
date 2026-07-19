import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELEASE_INPUT_PATHS,
  validateCiRecord,
  validateDeploymentRecord,
  validateLiveEvalRecord,
  validateReleaseEvidence,
  validateSecurityReviewRecord,
  validateSourceReviewRecord,
  validateVerifyRecord
} from "../../lib/release/release-evidence-contract";
// @ts-expect-error The release assembler is a Node ESM module.
import { assembleReleaseEvidence } from "../../scripts/assemble-release-evidence.mjs";
// @ts-expect-error The source-review producer is a Node ESM module.
import * as sourceReviewProducer from "../../scripts/check-source-reachability.mjs";
// @ts-expect-error The security-review producer is a Node ESM module.
import * as securityReviewProducer from "../../scripts/check-release-security.mjs";
// @ts-expect-error The release recorder is a Node ESM module.
import { recordReleaseInput } from "../../scripts/record-release-input.mjs";
// @ts-expect-error The release verification runner is a Node ESM module.
import { runReleaseVerify } from "../../scripts/run-release-verify.mjs";
import {
  createReleaseInputTree,
  releaseFixture,
  releaseNow,
  releaseSha
} from "../fixtures/release-evidence";

const { buildSourceReviewRecord, SOURCE_REVIEW_EXPORT_PATH } = sourceReviewProducer;
const { buildSecurityReviewRecord, SECURITY_REVIEW_EXPORT_PATH } = securityReviewProducer;

describe("fixed release evidence contracts", () => {
  it("publishes the closed input map", () => {
    expect(RELEASE_INPUT_PATHS).toEqual({
      verify: ".release/verify.json",
      e2eRuns: [".release/e2e/run-1.json", ".release/e2e/run-2.json", ".release/e2e/run-3.json"],
      e2eManifest: ".release/e2e/manifest.json",
      liveEval: ".release/eval/live-eval.json",
      ci: ".release/ci/ci.json",
      sourceReview: ".release/reviews/source.json",
      securityReview: ".release/reviews/security.json",
      deployment: ".release/deployment/deployment.json"
    });
  });

  it("accepts one exact complete valid record per schema", () => {
    const fixture = releaseFixture();
    expect(validateVerifyRecord(fixture.verify, releaseSha, releaseNow)).toEqual(fixture.verify);
    expect(validateLiveEvalRecord(fixture.liveEval, releaseSha, releaseNow)).toEqual(
      fixture.liveEval
    );
    expect(validateCiRecord(fixture.ci, releaseSha, releaseNow)).toEqual(fixture.ci);
    expect(validateSourceReviewRecord(fixture.sourceReview, releaseSha, releaseNow)).toEqual(
      fixture.sourceReview
    );
    expect(validateSecurityReviewRecord(fixture.securityReview, releaseSha, releaseNow)).toEqual(
      fixture.securityReview
    );
    expect(validateDeploymentRecord(fixture.deployment, releaseSha, releaseNow)).toEqual(
      fixture.deployment
    );
  });

  it.each([
    [
      "unknown key",
      (fixture: ReturnType<typeof releaseFixture>) => ({ ...fixture.verify, extra: 1 })
    ],
    [
      "mismatched SHA",
      (fixture: ReturnType<typeof releaseFixture>) => ({
        ...fixture.verify,
        releaseSha: "b".repeat(40)
      })
    ],
    [
      "failed status",
      (fixture: ReturnType<typeof releaseFixture>) => ({ ...fixture.verify, status: "failed" })
    ],
    [
      "nonzero verify",
      (fixture: ReturnType<typeof releaseFixture>) => ({ ...fixture.verify, exitCode: 1 })
    ],
    [
      "stale timestamp",
      (fixture: ReturnType<typeof releaseFixture>) => ({
        ...fixture.verify,
        recordedAt: "2026-06-01T00:00:00.000Z"
      })
    ]
  ])("rejects %s", (_name, mutate) => {
    expect(() => validateVerifyRecord(mutate(releaseFixture()), releaseSha, releaseNow)).toThrow();
  });

  it("rejects every material release failure", () => {
    const fixture = releaseFixture();
    expect(() =>
      validateLiveEvalRecord(
        { ...fixture.liveEval, thresholdsPassed: false },
        releaseSha,
        releaseNow
      )
    ).toThrow("release_live_eval_failed");
    expect(() =>
      validateCiRecord({ ...fixture.ci, conclusion: "failure" }, releaseSha, releaseNow)
    ).toThrow("release_ci_failed");
    expect(() =>
      validateSourceReviewRecord(
        { ...fixture.sourceReview, unreachableCount: 1 },
        releaseSha,
        releaseNow
      )
    ).toThrow("release_source_review_failed");
    expect(() =>
      validateSecurityReviewRecord(
        {
          ...fixture.securityReview,
          audit: { high: 1, critical: 0, unexplainedHighOrCritical: 1 }
        },
        releaseSha,
        releaseNow
      )
    ).toThrow("release_security_review_failed");
    expect(() =>
      validateDeploymentRecord(
        {
          ...fixture.deployment,
          production: { ...fixture.deployment.production, gptSmoke: "failed" }
        },
        releaseSha,
        releaseNow
      )
    ).toThrow("release_deployment_failed");
    expect(() =>
      validateDeploymentRecord(
        {
          ...fixture.deployment,
          rollback: { ...fixture.deployment.rollback, commitSha: "" }
        },
        releaseSha,
        releaseNow
      )
    ).toThrow("release_deployment_rollback_invalid");
  });

  it("assembles only the exact paths and verifies the raw E2E hashes", () => {
    const { cwd, cleanup } = createReleaseInputTree();
    try {
      const evidence = assembleReleaseEvidence({ cwd, releaseSha, now: releaseNow });
      const output = path.join(cwd, "artifacts/release-evidence.json");

      expect(existsSync(output)).toBe(true);
      expect(validateReleaseEvidence(JSON.parse(readFileSync(output, "utf8")), releaseNow)).toEqual(
        evidence
      );
      expect(evidence.releaseSha).toBe(releaseSha);
      expect(JSON.stringify(evidence)).not.toMatch(
        /"(?:prompt|response|rawNarrative|evidenceHeadSha)"\s*:/i
      );

      const runPath = path.join(cwd, RELEASE_INPUT_PATHS.e2eRuns[0]);
      writeFileSync(runPath, `${readFileSync(runPath, "utf8")} `);
      expect(() => assembleReleaseEvidence({ cwd, releaseSha, now: releaseNow })).toThrow(
        "release_e2e_hash_mismatch"
      );
    } finally {
      cleanup();
    }
  });

  it("rejects secret, PII, alternate-path, and self-referential evidence", () => {
    const fixture = releaseFixture();
    expect(() =>
      validateCiRecord(
        { ...fixture.ci, runUrl: "https://ci.example.test/run?email=person@example.com" },
        releaseSha,
        releaseNow
      )
    ).toThrow("release_sensitive_value_detected");
    const { cwd, cleanup } = createReleaseInputTree();
    try {
      const source = path.join(cwd, RELEASE_INPUT_PATHS.sourceReview);
      const record = JSON.parse(readFileSync(source, "utf8")) as Record<string, unknown>;
      writeFileSync(source, JSON.stringify({ ...record, evidenceHeadSha: "c".repeat(40) }));
      expect(() => assembleReleaseEvidence({ cwd, releaseSha, now: releaseNow })).toThrow();
      expect(existsSync(path.join(cwd, "latest-source.json"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("fixture E2E manifest hashes exact bytes", () => {
    const { cwd, cleanup } = createReleaseInputTree();
    try {
      const manifest = JSON.parse(
        readFileSync(path.join(cwd, RELEASE_INPUT_PATHS.e2eManifest), "utf8")
      ) as { runs: Array<{ resultPath: string; sha256: string }> };
      manifest.runs.forEach(({ resultPath, sha256 }) => {
        const bytes = readFileSync(path.join(cwd, resultPath));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
      });
    } finally {
      cleanup();
    }
  });

  it("runs the fixed offline verification command and records failures without hiding them", async () => {
    const { cwd, cleanup } = createReleaseInputTree();
    try {
      const invocations: Array<{ command: string; args: string[]; shell: boolean }> = [];
      const passed = await runReleaseVerify({
        cwd,
        releaseSha,
        readHead: () => releaseSha,
        readTrackedStatus: () => "",
        npmExecPath: "/synthetic/npm-cli.js",
        now: () => releaseNow,
        runCommand: async (command: string, args: string[], options: { shell: boolean }) => {
          invocations.push({ command, args, shell: options.shell });
          return 0;
        }
      });

      expect(passed.status).toBe("passed");
      expect(invocations).toEqual([
        {
          command: process.execPath,
          args: ["/synthetic/npm-cli.js", "run", "verify"],
          shell: false
        }
      ]);
      expect(
        validateVerifyRecord(
          JSON.parse(readFileSync(path.join(cwd, RELEASE_INPUT_PATHS.verify), "utf8")),
          releaseSha,
          releaseNow
        )
      ).toEqual(passed);

      const failed = await runReleaseVerify({
        cwd,
        releaseSha,
        readHead: () => releaseSha,
        readTrackedStatus: () => "",
        npmExecPath: "/synthetic/npm-cli.js",
        now: () => releaseNow,
        runCommand: async () => 2
      });
      expect(failed).toMatchObject({ status: "failed", exitCode: 2 });
      expect(() => validateVerifyRecord(failed, releaseSha, releaseNow)).toThrow(
        "release_record_failed"
      );
    } finally {
      cleanup();
    }
  });

  it("records only validated authorized inputs at their fixed destinations", () => {
    const { cwd, cleanup } = createReleaseInputTree();
    try {
      const fixture = releaseFixture();
      const inputs = {
        source: fixture.sourceReview,
        security: fixture.securityReview,
        ci: fixture.ci,
        deployment: fixture.deployment
      } as const;
      const expectedPaths = {
        source: RELEASE_INPUT_PATHS.sourceReview,
        security: RELEASE_INPUT_PATHS.securityReview,
        ci: RELEASE_INPUT_PATHS.ci,
        deployment: RELEASE_INPUT_PATHS.deployment
      } as const;

      Object.entries(inputs).forEach(([kind, record]) => {
        const inputPath = path.join(cwd, "authorized", `${kind}.json`);
        mkdirSync(path.dirname(inputPath), { recursive: true });
        writeFileSync(inputPath, `${JSON.stringify(record)}\n`, "utf8");
        const result = recordReleaseInput({
          cwd,
          kind,
          releaseSha,
          inputPath,
          now: releaseNow
        });
        expect(result.destination).toBe(expectedPaths[kind as keyof typeof expectedPaths]);
        expect(JSON.parse(readFileSync(path.join(cwd, result.destination), "utf8"))).toEqual(
          record
        );
      });

      const failedInput = path.join(cwd, "authorized", "failed-ci.json");
      writeFileSync(
        failedInput,
        JSON.stringify({ ...fixture.ci, status: "failed", conclusion: "failure" }),
        "utf8"
      );
      expect(() =>
        recordReleaseInput({
          cwd,
          kind: "ci",
          releaseSha,
          inputPath: failedInput,
          now: releaseNow
        })
      ).toThrow("release_record_failed");
    } finally {
      cleanup();
    }
  });

  it("builds a fixed-path source export from fresh, reachable source summaries", () => {
    const record = buildSourceReviewRecord({
      releaseSha,
      recordedAt: releaseNow,
      reviewedAt: "2026-07-19T04:38:07.000Z",
      documentBytes: Buffer.from("synthetic reviewed source document"),
      sources: [
        { id: "source-a", lastChecked: "2026-07-19" },
        { id: "source-b", lastChecked: "2026-07-19" }
      ],
      reachability: [
        { id: "source-a", status: 200 },
        { id: "source-b", status: 403 }
      ]
    });

    expect(SOURCE_REVIEW_EXPORT_PATH).toBe(".release/inputs/source.json");
    expect(record).toMatchObject({
      status: "passed",
      criticalSourceCount: 2,
      staleCount: 0,
      unreachableCount: 0
    });
    expect(validateSourceReviewRecord(record, releaseSha, releaseNow)).toEqual(record);
  });

  it("builds a fixed-path security export and fails closed on high findings", () => {
    const common = {
      releaseSha,
      recordedAt: releaseNow,
      documentBytes: Buffer.from("synthetic security review"),
      lockBytes: Buffer.from("synthetic package lock"),
      secretScanExitCode: 0
    };
    const passed = buildSecurityReviewRecord({
      ...common,
      auditReport: { metadata: { vulnerabilities: { high: 0, critical: 0 } } }
    });

    expect(SECURITY_REVIEW_EXPORT_PATH).toBe(".release/inputs/security.json");
    expect(validateSecurityReviewRecord(passed, releaseSha, releaseNow)).toEqual(passed);

    const failed = buildSecurityReviewRecord({
      ...common,
      auditReport: { metadata: { vulnerabilities: { high: 1, critical: 0 } } }
    });
    expect(failed).toMatchObject({
      status: "failed",
      audit: { high: 1, critical: 0, unexplainedHighOrCritical: 1 }
    });
    expect(() => validateSecurityReviewRecord(failed, releaseSha, releaseNow)).toThrow(
      "release_record_failed"
    );
  });
});
