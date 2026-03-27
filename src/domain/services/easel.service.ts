/**
 * Easel Domain Service
 * ワークフロー実行エンジン（画架）。
 * Commission のメインループを制御し、Stroke を順次実行する。
 */

import type { Commission } from "../aggregates/commission.aggregate.js";
import type { RunContext } from "../aggregates/run-context.aggregate.js";
import type { Stroke } from "../models/stroke.model.js";
import type { MediumPort } from "../ports/medium.port.js";
import type { LoggerPort } from "../ports/logger.port.js";
import type { MediumRequest, MediumResponse } from "../value-objects/medium-config.vo.js";
import { StrokeStatus } from "../value-objects/stroke-status.vo.js";
import { CommissionStatus } from "../value-objects/commission-status.vo.js";
import { CritiqueVerdict } from "../value-objects/critique-verdict.vo.js";
import type { Critique } from "../models/critique.model.js";
import type { Transition } from "../value-objects/transition.vo.js";
import type { PromptComposer, ComposedPrompt } from "./prompt-composer.service.js";
import type { CritiqueService, CritiqueRule } from "./critique.service.js";
import { CommissionError, StrokeError, TransitionError } from "../errors/atelier-error.js";
import {
  strokeStarted,
  strokeCompleted,
  strokeFailed,
  strokeRetried,
} from "../events/stroke-events.js";

/** 依存グラフのノード */
interface DependencyNode {
  readonly stroke: Stroke;
  readonly dependsOn: ReadonlySet<string>;
}

/** 並列実行の結果 */
interface ParallelStrokeResult {
  readonly strokeName: string;
  readonly success: boolean;
  readonly error?: string;
}

export interface EaselDeps {
  resolveMedium(name: string): MediumPort;
  promptComposer: PromptComposer;
  critiqueService: CritiqueService;
  logger: LoggerPort;
  getCritiqueRules?(strokeName: string): CritiqueRule[];
}

export class Easel {
  private readonly deps: EaselDeps;

  constructor(deps: EaselDeps) {
    this.deps = deps;
  }

  /**
   * Commission のメインループを実行する。
   * dependsOn を持つ Stroke が存在する場合は並列実行パスに分岐する。
   */
  async execute(commission: Commission, runContext: RunContext): Promise<void> {
    // dependsOn を使っている Stroke があれば並列実行パスへ
    const hasParallelStrokes = commission.strokes.some(
      (s) => s.dependsOn.length > 0,
    );

    if (hasParallelStrokes) {
      return this.executeParallel(commission, runContext);
    }

    // 従来の順次実行パス
    return this.executeSequential(commission, runContext);
  }

  /**
   * 従来の順次実行パス（後方互換）。
   */
  private async executeSequential(commission: Commission, runContext: RunContext): Promise<void> {
    commission.start();
    runContext.status = CommissionStatus.Running;

    this.deps.logger.record(commission.domainEvents[commission.domainEvents.length - 1]);

    try {
      while (commission.status === CommissionStatus.Running) {
        const currentStroke = commission.currentStroke;
        if (!currentStroke) {
          commission.complete();
          break;
        }

        const success = await this.executeStroke(
          commission,
          currentStroke,
          runContext,
        );

        if (!success) {
          if (currentStroke.status === StrokeStatus.Failed) {
            commission.fail(`Stroke "${currentStroke.name}" failed`);
            break;
          }
          // Skipped stroke, try to find next
        }

        // Evaluate transitions
        const nextStrokeName = await this.evaluateTransition(
          commission,
          currentStroke,
          runContext,
        );

        if (nextStrokeName) {
          commission.advanceToStroke(nextStrokeName);
          runContext.currentStroke = nextStrokeName;
        } else {
          // No transition found — commission is done
          commission.complete();
        }
      }
    } catch (error) {
      if (commission.status === CommissionStatus.Running) {
        const reason = error instanceof Error ? error.message : String(error);
        commission.fail(reason);
      }
      throw error;
    } finally {
      runContext.status = commission.status;
      // Flush remaining domain events
      for (const event of commission.domainEvents) {
        this.deps.logger.record(event);
      }
      commission.clearDomainEvents();
    }
  }

  /**
   * 依存グラフに基づく並列実行パス。
   * トポロジカルソートで実行順序を決定し、依存が解決された Stroke を同時実行する。
   */
  async executeParallel(
    commission: Commission,
    runContext: RunContext,
  ): Promise<void> {
    commission.start();
    runContext.status = CommissionStatus.Running;

    this.deps.logger.record(commission.domainEvents[commission.domainEvents.length - 1]);

    try {
      const graph = this.buildDependencyGraph(commission.strokes);
      const completed = new Set<string>();
      const failed = new Set<string>();

      while (commission.status === CommissionStatus.Running) {
        const readyStrokes = this.getReadyStrokes(graph, completed, failed);

        if (readyStrokes.length === 0) {
          // すべて完了したか、進行不能（依存先が失敗）
          if (failed.size > 0) {
            const failedNames = [...failed].join(", ");
            commission.fail(`Parallel execution failed. Failed strokes: ${failedNames}`);
          } else {
            commission.complete();
          }
          break;
        }

        // 実行可能な Stroke を同時実行
        const results = await Promise.allSettled(
          readyStrokes.map(async (stroke): Promise<ParallelStrokeResult> => {
            commission.advanceToStroke(stroke.name);
            const success = await this.executeStroke(commission, stroke, runContext);
            return {
              strokeName: stroke.name,
              success,
              error: success ? undefined : `Stroke "${stroke.name}" failed`,
            };
          }),
        );

        // 結果を処理
        for (const result of results) {
          if (result.status === "fulfilled") {
            const { strokeName, success } = result.value;
            if (success) {
              completed.add(strokeName);

              // 完了した Stroke の遷移を評価
              const stroke = commission.getStroke(strokeName);
              const nextStrokeName = await this.evaluateTransition(
                commission,
                stroke,
                runContext,
              );

              // "COMPLETE" への遷移は完了として扱う
              if (nextStrokeName === "COMPLETE") {
                // 他のすべての Stroke が完了するまで待つ必要はない
                // 遷移先が COMPLETE ならそのまま completed に記録済み
              }
            } else {
              failed.add(strokeName);
            }
          } else {
            // Promise が reject された場合
            const error = result.reason;
            const errorMessage = error instanceof Error ? error.message : String(error);
            // reject された stroke を特定するために readyStrokes と照合
            // Promise.allSettled の結果は入力配列と同じ順序
            const strokeIndex = results.indexOf(result);
            const strokeName = readyStrokes[strokeIndex].name;
            failed.add(strokeName);
            this.deps.logger.record(
              strokeFailed(commission.name, strokeName, commission.runId, errorMessage),
            );
          }
        }

        // すべての Stroke が完了または失敗しているかチェック
        const allStrokeNames = new Set(commission.strokes.map((s) => s.name));
        const processedNames = new Set([...completed, ...failed]);
        const allProcessed = [...allStrokeNames].every((name) => processedNames.has(name));

        if (allProcessed) {
          if (failed.size > 0) {
            const failedNames = [...failed].join(", ");
            commission.fail(`Parallel execution failed. Failed strokes: ${failedNames}`);
          } else {
            commission.complete();
          }
          break;
        }
      }
    } catch (error) {
      if (commission.status === CommissionStatus.Running) {
        const reason = error instanceof Error ? error.message : String(error);
        commission.fail(reason);
      }
      throw error;
    } finally {
      runContext.status = commission.status;
      for (const event of commission.domainEvents) {
        this.deps.logger.record(event);
      }
      commission.clearDomainEvents();
    }
  }

  /**
   * Stroke の依存グラフを構築する。
   * 循環依存を検出した場合はエラーをスローする。
   */
  buildDependencyGraph(
    strokes: readonly Stroke[],
  ): ReadonlyMap<string, DependencyNode> {
    const strokeNames = new Set(strokes.map((s) => s.name));
    const graph = new Map<string, DependencyNode>();

    // ノードを構築
    for (const stroke of strokes) {
      // dependsOn に存在しない Stroke 名が含まれていないか検証
      for (const dep of stroke.dependsOn) {
        if (!strokeNames.has(dep)) {
          throw new CommissionError(
            stroke.name,
            `Stroke "${stroke.name}" depends on unknown stroke "${dep}"`,
          );
        }
      }

      graph.set(stroke.name, {
        stroke,
        dependsOn: new Set(stroke.dependsOn),
      });
    }

    // 循環依存検出（トポロジカルソート）
    this.detectCyclicDependencies(graph);

    return graph;
  }

  /**
   * 依存が全て解決済みで、まだ実行されていない Stroke を返す。
   */
  getReadyStrokes(
    graph: ReadonlyMap<string, DependencyNode>,
    completedStrokes: ReadonlySet<string>,
    failedStrokes: ReadonlySet<string>,
  ): Stroke[] {
    const ready: Stroke[] = [];

    for (const [name, node] of graph) {
      // 既に完了・失敗したものはスキップ
      if (completedStrokes.has(name) || failedStrokes.has(name)) {
        continue;
      }

      // 依存先に失敗した Stroke がある場合はスキップ
      let hasFailed = false;
      for (const dep of node.dependsOn) {
        if (failedStrokes.has(dep)) {
          hasFailed = true;
          break;
        }
      }
      if (hasFailed) {
        // 依存先が失敗しているので、この Stroke も失敗扱い
        failedStrokes = new Set([...failedStrokes, name]);
        continue;
      }

      // すべての依存が完了しているか
      let allDepsCompleted = true;
      for (const dep of node.dependsOn) {
        if (!completedStrokes.has(dep)) {
          allDepsCompleted = false;
          break;
        }
      }

      if (allDepsCompleted) {
        ready.push(node.stroke);
      }
    }

    return ready;
  }

  /**
   * 循環依存を検出する（Kahnのアルゴリズム）。
   */
  private detectCyclicDependencies(
    graph: ReadonlyMap<string, DependencyNode>,
  ): void {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // 初期化
    for (const [name] of graph) {
      inDegree.set(name, 0);
      adjacency.set(name, []);
    }

    // 入次数と隣接リストを構築
    for (const [name, node] of graph) {
      for (const dep of node.dependsOn) {
        adjacency.get(dep)!.push(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }
    }

    // 入次数0のノードをキューに追加
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    let processedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      processedCount++;

      for (const neighbor of adjacency.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (processedCount !== graph.size) {
      // 循環を構成するノードを特定
      const cyclicNodes: string[] = [];
      for (const [name, degree] of inDegree) {
        if (degree > 0) {
          cyclicNodes.push(name);
        }
      }
      throw new CommissionError(
        "dependency-graph",
        `Cyclic dependency detected among strokes: ${cyclicNodes.join(", ")}`,
      );
    }
  }

  /**
   * 個別の Stroke を実行する。
   */
  async executeStroke(
    commission: Commission,
    stroke: Stroke,
    runContext: RunContext,
  ): Promise<boolean> {
    const startedAt = new Date();
    runContext.currentStroke = stroke.name;

    try {
      // Composing
      stroke.transitionTo(StrokeStatus.Composing);
      this.deps.logger.record(
        strokeStarted(commission.name, stroke.name, commission.runId),
      );

      const composed: ComposedPrompt = await this.deps.promptComposer.compose(
        stroke,
        runContext,
      );

      // Executing
      stroke.transitionTo(StrokeStatus.Executing);

      const medium = this.deps.resolveMedium(stroke.medium);
      const request: MediumRequest = {
        model: stroke.medium,
        systemPrompt: composed.systemPrompt,
        userPrompt: composed.userPrompt,
      };

      const response: MediumResponse = await medium.execute(request);

      // Store outputs in canvas
      for (const outputKey of stroke.outputs) {
        runContext.canvas.set(outputKey, response.content);
      }

      // Critiquing (if critique rules exist)
      const critiqueRules = this.deps.getCritiqueRules?.(stroke.name) ?? [];

      if (critiqueRules.length > 0) {
        stroke.transitionTo(StrokeStatus.Critiquing);

        const critique: Critique = this.deps.critiqueService.evaluate(
          response.content,
          critiqueRules,
          runContext.canvas.toJSON(),
        );

        if (critique.verdict === CritiqueVerdict.NeedsFix) {
          const retryCount = runContext.getRetryCount(stroke.name);
          const maxRetries = this.getMaxRetries(stroke);

          if (this.deps.critiqueService.shouldRetry(critique, retryCount, maxRetries)) {
            // Record failed attempt and retry
            runContext.recordStrokeExecution({
              strokeName: stroke.name,
              startedAt,
              completedAt: new Date(),
              success: false,
              retryCount: retryCount + 1,
              error: critique.feedback,
            });

            this.deps.logger.record(
              strokeRetried(
                commission.name,
                stroke.name,
                commission.runId,
                retryCount + 1,
                critique.feedback,
              ),
            );

            stroke.transitionTo(StrokeStatus.Retouching);
            // Recurse for retry
            return this.executeStroke(commission, stroke, runContext);
          }
        }

        if (critique.verdict === CritiqueVerdict.Rejected) {
          stroke.transitionTo(StrokeStatus.Failed);
          runContext.recordStrokeExecution({
            strokeName: stroke.name,
            startedAt,
            completedAt: new Date(),
            success: false,
            retryCount: runContext.getRetryCount(stroke.name),
            error: critique.feedback,
          });
          this.deps.logger.record(
            strokeFailed(
              commission.name,
              stroke.name,
              commission.runId,
              critique.feedback,
            ),
          );
          return false;
        }
      }

      // Completed
      stroke.transitionTo(StrokeStatus.Completed);
      runContext.recordStrokeExecution({
        strokeName: stroke.name,
        startedAt,
        completedAt: new Date(),
        success: true,
        retryCount: runContext.getRetryCount(stroke.name),
        response: response.content,
      });
      this.deps.logger.record(
        strokeCompleted(commission.name, stroke.name, commission.runId),
      );
      return true;
    } catch (error) {
      if (!stroke.isTerminal) {
        stroke.transitionTo(StrokeStatus.Failed);
      }
      const reason = error instanceof Error ? error.message : String(error);
      runContext.recordStrokeExecution({
        strokeName: stroke.name,
        startedAt,
        completedAt: new Date(),
        success: false,
        retryCount: runContext.getRetryCount(stroke.name),
        error: reason,
      });
      this.deps.logger.record(
        strokeFailed(commission.name, stroke.name, commission.runId, reason),
      );
      return false;
    }
  }

  /**
   * 遷移条件を評価し、次の Stroke 名を返す。
   * 条件に一致する遷移がなければ null を返す。
   */
  async evaluateTransition(
    commission: Commission,
    stroke: Stroke,
    runContext: RunContext,
  ): Promise<string | null> {
    if (stroke.transitions.length === 0) {
      return null;
    }

    for (const transition of stroke.transitions) {
      const conditionMet = this.evaluateCondition(
        transition.condition,
        runContext,
      );

      if (conditionMet) {
        // Verify target stroke exists
        try {
          commission.getStroke(transition.next);
        } catch {
          throw new TransitionError(
            stroke.name,
            transition.next,
            `Target stroke "${transition.next}" not found`,
          );
        }
        return transition.next;
      }
    }

    return null;
  }

  /**
   * 遷移条件文字列を評価する。
   * "always" は常にtrue。
   * "canvas.key == value" 形式の簡易条件評価。
   */
  private evaluateCondition(
    condition: string,
    runContext: RunContext,
  ): boolean {
    const trimmed = condition.trim().toLowerCase();

    if (trimmed === "always" || trimmed === "true" || trimmed === "default") {
      return true;
    }

    // Simple expression: "key == value" or "key != value"
    const eqMatch = condition.match(/^(\w+(?:\.\w+)*)\s*==\s*(.+)$/);
    if (eqMatch) {
      const canvasValue = runContext.canvas.get(eqMatch[1]);
      const expected = eqMatch[2].trim().replace(/^["']|["']$/g, "");
      return String(canvasValue) === expected;
    }

    const neqMatch = condition.match(/^(\w+(?:\.\w+)*)\s*!=\s*(.+)$/);
    if (neqMatch) {
      const canvasValue = runContext.canvas.get(neqMatch[1]);
      const expected = neqMatch[2].trim().replace(/^["']|["']$/g, "");
      return String(canvasValue) !== expected;
    }

    // Check if key exists in canvas
    if (runContext.canvas.has(trimmed)) {
      const val = runContext.canvas.get(trimmed);
      return Boolean(val);
    }

    return false;
  }

  private getMaxRetries(stroke: Stroke): number {
    if (stroke.transitions.length > 0) {
      return stroke.transitions[0].maxRetries;
    }
    return 3;
  }
}
