/**
 * CommissionRunner Service
 * Commission 実行のオーケストレーション。ユースケースから呼ばれる。
 */

import { Stroke, type StrokeDefinition } from "../../domain/models/stroke.model.js";
import { Canvas } from "../../domain/models/canvas.model.js";
import { StrokeStatus } from "../../domain/value-objects/stroke-status.vo.js";
import { CommissionStatus } from "../../domain/value-objects/commission-status.vo.js";
import type { CommissionDefinition, RunOptions } from "../../shared/types.js";
import type { RunErrorDto } from "../dto/run-result.dto.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";
import { runSubprocess } from "../../infrastructure/process/subprocess.js";

export interface MediumRegistry {
  getCommand(mediumName: string): { command: string; args: readonly string[] } | undefined;
  listMedia(): string[];
}

export interface CommissionRunnerDeps {
  readonly eventBus: TypedEventEmitter<AtelierEvents>;
  readonly mediumRegistry: MediumRegistry;
  readonly defaultMedium: string;
  readonly cwd: string;
}

export interface CommissionRunResult {
  readonly status: CommissionStatus;
  readonly strokesExecuted: number;
  readonly errors: readonly RunErrorDto[];
}

/**
 * Commission のストロークを順次実行するサービス。
 */
export class CommissionRunnerService {
  private readonly deps: CommissionRunnerDeps;

  constructor(deps: CommissionRunnerDeps) {
    this.deps = deps;
  }

  async execute(
    commission: CommissionDefinition,
    runId: string,
    options: RunOptions,
  ): Promise<CommissionRunResult> {
    const canvas = new Canvas();
    const errors: RunErrorDto[] = [];
    let strokesExecuted = 0;

    const strokes = commission.strokes.map(
      (sd) =>
        new Stroke({
          name: sd.name,
          palette: sd.palette,
          medium: sd.medium ?? options.medium ?? this.deps.defaultMedium,
          allowEdit: sd.allow_edit ?? false,
          instruction: sd.instruction,
          inputs: [...(sd.inputs ?? [])],
          outputs: [...(sd.outputs ?? [])],
          transitions: (sd.transitions ?? []).map((t) => ({
            condition: t.condition,
            next: t.next,
            maxRetries: t.max_retries ?? 3,
            onMaxRetries: t.on_max_retries ?? "fail",
          })),
          dependsOn: sd.depends_on ? [...sd.depends_on] : [],
        }),
    );

    // dependsOn を持つ Stroke がある場合は並列実行パスへ
    const hasParallelStrokes = strokes.some((s) => s.dependsOn.length > 0);
    if (hasParallelStrokes) {
      return this.executeParallel(strokes, canvas, runId, options, errors);
    }

    let currentStroke: Stroke | undefined = strokes[0];

    while (currentStroke && !currentStroke.isTerminal) {
      this.deps.eventBus.emit("stroke:start", {
        runId,
        strokeName: currentStroke.name,
      });

      const strokeStart = Date.now();

      try {
        if (options.dryRun) {
          currentStroke.transitionTo(StrokeStatus.Composing);
          currentStroke.transitionTo(StrokeStatus.Executing);
          currentStroke.transitionTo(StrokeStatus.Completed);
        } else {
          await this.executeStroke(currentStroke, canvas, runId);
        }

        strokesExecuted++;

        this.deps.eventBus.emit("stroke:complete", {
          runId,
          strokeName: currentStroke.name,
          duration: Date.now() - strokeStart,
        });
      } catch (error) {
        currentStroke.transitionTo(StrokeStatus.Failed);

        const errorMessage =
          error instanceof Error ? error.message : String(error);

        errors.push({
          strokeName: currentStroke.name,
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });

        this.deps.eventBus.emit("stroke:fail", {
          runId,
          strokeName: currentStroke.name,
          error: errorMessage,
        });

        return {
          status: CommissionStatus.Failed,
          strokesExecuted,
          errors,
        };
      }

      // 次のストロークを決定
      currentStroke = this.resolveNextStroke(currentStroke, strokes, canvas);
    }

    return {
      status: CommissionStatus.Completed,
      strokesExecuted,
      errors,
    };
  }

  /**
   * 依存グラフに基づく並列実行。
   * dependsOn で依存関係を定義し、独立した Stroke を同時実行する。
   */
  private async executeParallel(
    strokes: Stroke[],
    canvas: Canvas,
    runId: string,
    options: RunOptions,
    errors: RunErrorDto[],
  ): Promise<CommissionRunResult> {
    let strokesExecuted = 0;
    const completed = new Set<string>();
    const failed = new Set<string>();
    const strokeMap = new Map(strokes.map((s) => [s.name, s]));

    // 循環依存検出
    this.detectCyclicDependencies(strokes);

    while (true) {
      // 実行可能な Stroke を取得
      const ready = strokes.filter((s) => {
        if (completed.has(s.name) || failed.has(s.name)) return false;
        // 依存先に失敗がないか
        for (const dep of s.dependsOn) {
          if (failed.has(dep)) return false;
        }
        // すべての依存が完了しているか
        for (const dep of s.dependsOn) {
          if (!completed.has(dep)) return false;
        }
        return true;
      });

      if (ready.length === 0) {
        // 進行不能 or すべて完了
        break;
      }

      // 並列実行
      const results = await Promise.allSettled(
        ready.map(async (stroke) => {
          this.deps.eventBus.emit("stroke:start", {
            runId,
            strokeName: stroke.name,
          });

          const strokeStart = Date.now();

          if (options.dryRun) {
            stroke.transitionTo(StrokeStatus.Composing);
            stroke.transitionTo(StrokeStatus.Executing);
            stroke.transitionTo(StrokeStatus.Completed);
          } else {
            await this.executeStroke(stroke, canvas, runId);
          }

          this.deps.eventBus.emit("stroke:complete", {
            runId,
            strokeName: stroke.name,
            duration: Date.now() - strokeStart,
          });

          return stroke.name;
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          completed.add(result.value);
          strokesExecuted++;
        } else {
          // reject の場合 — 対応する stroke を特定
          const idx = results.indexOf(result);
          const failedStroke = ready[idx];
          failed.add(failedStroke.name);

          if (!failedStroke.isTerminal) {
            failedStroke.transitionTo(StrokeStatus.Failed);
          }

          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);

          errors.push({
            strokeName: failedStroke.name,
            message: errorMessage,
            timestamp: new Date().toISOString(),
          });

          this.deps.eventBus.emit("stroke:fail", {
            runId,
            strokeName: failedStroke.name,
            error: errorMessage,
          });
        }
      }
    }

    // 依存先が失敗したために実行できなかった Stroke も失敗扱い
    for (const stroke of strokes) {
      if (!completed.has(stroke.name) && !failed.has(stroke.name)) {
        failed.add(stroke.name);
        errors.push({
          strokeName: stroke.name,
          message: `Skipped: dependency failed`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return {
      status: failed.size > 0 ? CommissionStatus.Failed : CommissionStatus.Completed,
      strokesExecuted,
      errors,
    };
  }

  /**
   * 循環依存を検出する（Kahn のアルゴリズム）。
   */
  private detectCyclicDependencies(strokes: readonly Stroke[]): void {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const s of strokes) {
      inDegree.set(s.name, 0);
      adjacency.set(s.name, []);
    }

    for (const s of strokes) {
      for (const dep of s.dependsOn) {
        adjacency.get(dep)?.push(s.name);
        inDegree.set(s.name, (inDegree.get(s.name) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    let count = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      count++;
      for (const neighbor of adjacency.get(current) ?? []) {
        const d = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, d);
        if (d === 0) queue.push(neighbor);
      }
    }

    if (count !== strokes.length) {
      const cyclic = [...inDegree.entries()]
        .filter(([, d]) => d > 0)
        .map(([name]) => name);
      throw new Error(
        `Cyclic dependency detected among strokes: ${cyclic.join(", ")}`,
      );
    }
  }

  private async executeStroke(
    stroke: Stroke,
    canvas: Canvas,
    runId: string,
  ): Promise<void> {
    stroke.transitionTo(StrokeStatus.Composing);

    // プロンプトを構成
    const prompt = this.composePrompt(stroke, canvas);

    stroke.transitionTo(StrokeStatus.Executing);

    // Medium を通じて実行
    const mediumConfig = this.deps.mediumRegistry.getCommand(stroke.medium);
    if (!mediumConfig) {
      throw new Error(`Medium not found: ${stroke.medium}`);
    }

    this.deps.eventBus.emit("medium:request", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
    });

    const result = await runSubprocess(
      mediumConfig.command,
      [...mediumConfig.args, prompt],
      { cwd: this.deps.cwd },
    );

    this.deps.eventBus.emit("medium:response", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
      duration: result.duration,
    });

    // 結果を Canvas に格納
    for (const outputKey of stroke.outputs) {
      canvas.set(outputKey, result.stdout);
    }

    stroke.transitionTo(StrokeStatus.Completed);
  }

  private composePrompt(stroke: Stroke, canvas: Canvas): string {
    const parts: string[] = [];

    // 入力データの注入
    for (const inputKey of stroke.inputs) {
      const value = canvas.get<string>(inputKey);
      if (value !== undefined) {
        parts.push(`[${inputKey}]\n${value}`);
      }
    }

    parts.push(stroke.instruction);

    return parts.join("\n\n");
  }

  private resolveNextStroke(
    current: Stroke,
    strokes: readonly Stroke[],
    canvas: Canvas,
  ): Stroke | undefined {
    // トランジション条件を評価
    for (const transition of current.transitions) {
      if (this.evaluateCondition(transition.condition, canvas)) {
        return strokes.find((s) => s.name === transition.next);
      }
    }

    // デフォルト: 次のストローク
    const currentIndex = strokes.indexOf(current as Stroke);
    if (currentIndex >= 0 && currentIndex < strokes.length - 1) {
      return strokes[currentIndex + 1];
    }

    return undefined;
  }

  private evaluateCondition(condition: string, canvas: Canvas): boolean {
    if (condition === "always" || condition === "default") {
      return true;
    }
    if (condition === "never") {
      return false;
    }
    // Canvas のキー存在チェック
    if (condition.startsWith("has:")) {
      return canvas.has(condition.slice(4));
    }
    return true;
  }
}
