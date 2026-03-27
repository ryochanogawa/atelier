/**
 * Codebase Analysis Value Objects
 * コードベース分析に関する値オブジェクト定義。
 */

export interface CodebaseStructure {
  readonly rootDir: string;
  readonly totalFiles: number;
  readonly totalLines: number;
  readonly filesByExtension: Record<string, number>;
  readonly linesByExtension: Record<string, number>;
  readonly detectedStack: string[];
  readonly entryPoints: string[];
  readonly configFiles: string[];
}

export interface DependencyGraph {
  readonly direct: Dependency[];
  readonly transitive: number;
  readonly outdated: Dependency[];
  readonly vulnerable: Dependency[];
}

export interface Dependency {
  readonly name: string;
  readonly version: string;
  readonly latest?: string;
  readonly isOutdated: boolean;
}

export interface FileComplexity {
  readonly filePath: string;
  readonly lines: number;
  readonly imports: number;
  readonly functions: number;
  readonly classes: number;
  readonly todos: TodoComment[];
  readonly complexityScore: number; // 0-100
}

export interface TodoComment {
  readonly line: number;
  readonly type: "TODO" | "FIXME" | "HACK" | "XXX";
  readonly text: string;
}

export interface MigrationPlan {
  readonly phases: MigrationPhase[];
  readonly estimatedComplexity: "low" | "medium" | "high";
  readonly risks: string[];
}

export interface MigrationPhase {
  readonly name: string;
  readonly description: string;
  readonly tasks: string[];
  readonly dependencies: string[];
  readonly riskLevel: "low" | "medium" | "high";
}
