/**
 * LinterIntegrationService Domain Service
 * ESLint・TypeScript等のLinter統合サービス。
 */

import {
  type LinterResult,
  createLinterResult,
} from "../value-objects/linter-result.vo.js";

/** execa の型（動的インポート用） */
interface ExecaResult {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

export class LinterIntegrationService {
  /**
   * ワーキングディレクトリ内で ESLint と TypeScript コンパイラを実行し、
   * 統一形式の結果を返す。
   */
  async runLinters(workingDir: string): Promise<LinterResult[]> {
    const results: LinterResult[] = [];

    const [eslintResults, tscResults] = await Promise.allSettled([
      this.runEslint(workingDir),
      this.runTsc(workingDir),
    ]);

    if (eslintResults.status === "fulfilled") {
      results.push(...eslintResults.value);
    }

    if (tscResults.status === "fulfilled") {
      results.push(...tscResults.value);
    }

    return results;
  }

  /**
   * SARIF 形式の JSON をパースし、LinterResult[] に変換する。
   */
  parseSarif(sarifJson: string): LinterResult[] {
    const results: LinterResult[] = [];

    const sarif = JSON.parse(sarifJson) as {
      runs?: Array<{
        tool?: { driver?: { name?: string } };
        results?: Array<{
          ruleId?: string;
          level?: string;
          message?: { text?: string };
          locations?: Array<{
            physicalLocation?: {
              artifactLocation?: { uri?: string };
              region?: { startLine?: number };
            };
          }>;
        }>;
      }>;
    };

    if (!sarif.runs) return results;

    for (const run of sarif.runs) {
      const toolName = run.tool?.driver?.name ?? "unknown";

      for (const result of run.results ?? []) {
        const location = result.locations?.[0]?.physicalLocation;
        const file = location?.artifactLocation?.uri ?? "unknown";
        const line = location?.region?.startLine ?? 0;
        const severity = this.mapSarifLevel(result.level);

        results.push(
          createLinterResult({
            tool: toolName,
            file,
            line,
            severity,
            message: result.message?.text ?? "",
            ruleId: result.ruleId,
          }),
        );
      }
    }

    return results;
  }

  /**
   * ESLint を実行する。
   */
  private async runEslint(workingDir: string): Promise<LinterResult[]> {
    const results: LinterResult[] = [];

    try {
      const { execa } = await import("execa");
      let execResult: ExecaResult;

      try {
        execResult = await execa("npx", ["eslint", ".", "--format", "json"], {
          cwd: workingDir,
          reject: false,
        });
      } catch {
        return results;
      }

      if (!execResult.stdout.trim()) return results;

      const eslintOutput = JSON.parse(execResult.stdout) as Array<{
        filePath: string;
        messages: Array<{
          ruleId: string | null;
          severity: number;
          message: string;
          line: number;
        }>;
      }>;

      for (const fileResult of eslintOutput) {
        for (const msg of fileResult.messages) {
          results.push(
            createLinterResult({
              tool: "eslint",
              file: fileResult.filePath,
              line: msg.line,
              severity: this.mapEslintSeverity(msg.severity),
              message: msg.message,
              ruleId: msg.ruleId ?? undefined,
            }),
          );
        }
      }
    } catch {
      // ESLint が利用できない場合は空の結果を返す
    }

    return results;
  }

  /**
   * TypeScript コンパイラを実行する。
   */
  private async runTsc(workingDir: string): Promise<LinterResult[]> {
    const results: LinterResult[] = [];

    try {
      const { execa } = await import("execa");
      let execResult: ExecaResult;

      try {
        execResult = await execa("npx", ["tsc", "--noEmit"], {
          cwd: workingDir,
          reject: false,
        });
      } catch {
        return results;
      }

      // tsc のエラー出力をパース
      // 形式: file.ts(line,col): error TS1234: message
      const errorPattern = /^(.+?)\((\d+),\d+\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm;
      const output = execResult.stdout + "\n" + execResult.stderr;

      let match: RegExpExecArray | null;
      while ((match = errorPattern.exec(output)) !== null) {
        results.push(
          createLinterResult({
            tool: "typescript",
            file: match[1],
            line: parseInt(match[2], 10),
            severity: match[3] === "error" ? "error" : "warning",
            message: match[5],
            ruleId: match[4],
          }),
        );
      }
    } catch {
      // TypeScript が利用できない場合は空の結果を返す
    }

    return results;
  }

  /**
   * ESLint の severity 数値をマッピングする。
   */
  private mapEslintSeverity(severity: number): LinterResult["severity"] {
    switch (severity) {
      case 2:
        return "error";
      case 1:
        return "warning";
      default:
        return "info";
    }
  }

  /**
   * SARIF の level をマッピングする。
   */
  private mapSarifLevel(level?: string): LinterResult["severity"] {
    switch (level) {
      case "error":
        return "error";
      case "warning":
        return "warning";
      default:
        return "info";
    }
  }
}
