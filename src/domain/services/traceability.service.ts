/**
 * Traceability Domain Service
 * 要件 → 設計 → コード → テストのトレーサビリティ管理。
 */

import type { Requirement } from "../value-objects/requirements.vo.js";
import type {
  Artifact,
  TraceLink,
  TraceabilityMatrix,
  MatrixCell,
} from "../value-objects/traceability.vo.js";

export class TraceabilityService {
  /**
   * 要件と成果物のトレースリンクを作成する。
   * カバレッジは成果物タイプの多様性に基づいて算出。
   * design, code, test, document の4種のうち何種紐付いているか。
   */
  createTrace(req: Requirement, artifacts: Artifact[]): TraceLink {
    const expectedTypes = new Set(["design", "code", "test"]);
    const coveredTypes = new Set(
      artifacts.map((a) => a.type).filter((t) => expectedTypes.has(t)),
    );
    const coverage =
      expectedTypes.size === 0
        ? 0
        : coveredTypes.size / expectedTypes.size;

    return {
      requirementId: req.id,
      artifacts: [...artifacts],
      coverage: Math.round(coverage * 100) / 100,
    };
  }

  /**
   * トレーサビリティマトリクスを生成する。
   * 要件 x 成果物のカバレッジ状況を一覧化。
   */
  generateMatrix(traces: TraceLink[]): TraceabilityMatrix {
    const requirementIds = [...new Set(traces.map((t) => t.requirementId))];
    const allArtifactIds: string[] = [];
    const artifactIdSet = new Set<string>();

    for (const trace of traces) {
      for (const artifact of trace.artifacts) {
        if (!artifactIdSet.has(artifact.id)) {
          artifactIdSet.add(artifact.id);
          allArtifactIds.push(artifact.id);
        }
      }
    }

    const cells: MatrixCell[] = [];
    let linkedCount = 0;
    let totalCells = 0;

    for (const reqId of requirementIds) {
      const trace = traces.find((t) => t.requirementId === reqId);
      const traceArtifactIds = new Set(
        trace?.artifacts.map((a) => a.id) ?? [],
      );

      for (const artifactId of allArtifactIds) {
        const linked = traceArtifactIds.has(artifactId);
        cells.push({ requirementId: reqId, artifactId, linked });
        if (linked) linkedCount++;
        totalCells++;
      }
    }

    const overallCoverage =
      totalCells === 0
        ? 0
        : Math.round((linkedCount / totalCells) * 100) / 100;

    return {
      requirements: requirementIds,
      artifacts: allArtifactIds,
      cells,
      overallCoverage,
    };
  }

  /**
   * 成果物に紐付いていない要件を検出する。
   */
  findUntracedRequirements(
    requirements: Requirement[],
    traces: TraceLink[],
  ): Requirement[] {
    const tracedIds = new Set(traces.map((t) => t.requirementId));
    return requirements.filter((req) => !tracedIds.has(req.id));
  }
}
