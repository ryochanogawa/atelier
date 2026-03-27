/**
 * Traceability Value Objects
 * 要件トレーサビリティに関する型定義。
 */

import type { Requirement } from "./requirements.vo.js";

/** 成果物の種別 */
export type ArtifactType = "design" | "code" | "test" | "document";

/** 成果物 */
export interface Artifact {
  readonly id: string;
  readonly type: ArtifactType;
  readonly path: string;
  readonly description: string;
}

/** 要件と成果物のトレースリンク */
export interface TraceLink {
  readonly requirementId: string;
  readonly artifacts: Artifact[];
  readonly coverage: number; // 0.0 - 1.0
}

/** トレーサビリティマトリクスの1セル */
export interface MatrixCell {
  readonly requirementId: string;
  readonly artifactId: string;
  readonly linked: boolean;
}

/** トレーサビリティマトリクス */
export interface TraceabilityMatrix {
  readonly requirements: string[];
  readonly artifacts: string[];
  readonly cells: MatrixCell[];
  readonly overallCoverage: number;
}
