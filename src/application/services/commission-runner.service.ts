/**
 * CommissionRunner Service
 * Commission 実行のオーケストレーション。ユースケースから呼ばれる。
 */

import path from "node:path";
import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { Stroke, type StrokeDefinition, type ArpeggioConfig, type ParallelSubStroke } from "../../domain/models/stroke.model.js";
import { Canvas } from "../../domain/models/canvas.model.js";
import { AggregateEvaluator } from "../../domain/services/aggregate-evaluator.service.js";
import { StrokeStatus } from "../../domain/value-objects/stroke-status.vo.js";
import { CommissionStatus } from "../../domain/value-objects/commission-status.vo.js";
import type { CommissionDefinition, LoopMonitorYaml, RunOptions, PaletteProviderConfig } from "../../shared/types.js";
import type { RunErrorDto } from "../dto/run-result.dto.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";
import { readTextFile, fileExists } from "../../infrastructure/fs/file-system.js";
import type { MediumExecutor } from "../ports/medium-executor.port.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { PALETTES_DIR, POLICIES_DIR, CONTRACTS_DIR, INSTRUCTIONS_DIR, KNOWLEDGE_DIR } from "../../shared/constants.js";
import {
  getBuiltinPalettePath,
  getBuiltinPolicyPath,
  getBuiltinContractPath,
  getBuiltinInstructionPath,
  getBuiltinKnowledgePath,
} from "../../builtin/index.js";
import { runArpeggio } from "./arpeggio-runner.service.js";
import { runConductor, type ConductorConfig } from "./conductor.service.js";
import { parseStatusTag } from "../../domain/services/conductor-parser.js";

/** @deprecated MediumExecutor に移行済み。後方互換用に re-export */
export type { MediumExecutor } from "../ports/medium-executor.port.js";

/** Palette YAML の生データ型 */
interface RawPalette {
  readonly name: string;
  readonly description?: string;
  readonly persona: string;
  readonly policies?: readonly string[];
  readonly defaults?: Record<string, unknown>;
}

/** Policy YAML の生データ型 */
interface RawPolicy {
  readonly name: string;
  readonly description?: string;
  readonly rules: readonly { name: string; description?: string; content: string }[];
}

/** Contract YAML の生データ型 */
interface RawContract {
  readonly name: string;
  readonly description?: string;
  readonly format: string;
  readonly fields?: readonly { name: string; type: string; required?: boolean; description?: string }[];
}

/** ファセットプロンプティングの合成結果 */
interface FacetedPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export interface CommissionRunnerDeps {
  readonly eventBus: TypedEventEmitter<AtelierEvents>;
  readonly mediumExecutor: MediumExecutor;
  readonly defaultMedium: string;
  readonly cwd: string;
  readonly projectPath: string;
  /** Palette ごとの medium/model オーバーライド（studio.yaml の palette_providers） */
  readonly paletteProviders?: Readonly<Record<string, PaletteProviderConfig>>;
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

  /** Commission 全体の stroke 実行回数（テンプレート変数 {{iteration}} 用） */
  private _iteration = 0;
  /** 現在の stroke が何回目の実行か（テンプレート変数 {{stroke_iteration}} 用） */
  private _strokeIteration = 0;
  /** ループモニターの max threshold（テンプレート変数 {{max_iterations}} 用） */
  private _maxIterations = "";
  /** レポート出力先ディレクトリ（テンプレート変数 {{report_dir}} 用） */
  private _reportDir = "";

  constructor(deps: CommissionRunnerDeps) {
    this.deps = deps;
  }

  async execute(
    commission: CommissionDefinition,
    runId: string,
    options: RunOptions,
  ): Promise<CommissionRunResult> {
    // レポート出力先ディレクトリを設定（テンプレート変数 {{report_dir}} 用）
    this._reportDir = `.atelier/reports/${runId}/`;

    const canvas = new Canvas();
    // タスク説明文を Canvas に自動注入（{{task}} テンプレート変数として利用可能）
    if (options.task) {
      canvas.set("task", options.task);
    }
    // 初期値を Canvas に注入（要件定義等）
    if (options.initialCanvas) {
      for (const [key, value] of Object.entries(options.initialCanvas)) {
        canvas.set(key, value);
      }
    }
    const errors: RunErrorDto[] = [];
    let strokesExecuted = 0;

    // palette_providers から palette ごとの medium/model を解決するヘルパー
    const paletteProviders = this.deps.paletteProviders ?? {};
    const resolvePaletteMedium = (paletteName: string, strokeMedium?: string): string =>
      strokeMedium ?? options.medium ?? paletteProviders[paletteName]?.medium ?? this.deps.defaultMedium;
    const resolvePaletteModel = (paletteName: string, strokeModel?: string): string | undefined =>
      strokeModel ?? paletteProviders[paletteName]?.model;

    const strokes = commission.strokes.map(
      (sd) =>
        new Stroke({
          name: sd.name,
          palette: sd.palette,
          medium: resolvePaletteMedium(sd.palette, sd.medium),
          allowEdit: sd.allow_edit ?? false,
          instruction: sd.instruction,
          inputs: [...(sd.inputs ?? [])],
          outputs: [...(sd.outputs ?? [])],
          transitions: (sd.transitions ?? []).map((t) => ({
            condition: t.condition,
            next: t.next,
            maxRetries: t.max_retries ?? 3,
            onMaxRetries: t.on_max_retries ?? "fail",
            appendix: t.appendix,
          })),
          dependsOn: sd.depends_on ? [...sd.depends_on] : [],
          contract: sd.contract ?? "",
          knowledge: sd.knowledge ? [...sd.knowledge] : [],
          arpeggio: sd.arpeggio
            ? {
                sourcePath: path.resolve(this.deps.cwd, sd.arpeggio.source),
                batchSize: sd.arpeggio.batch_size ?? 1,
                concurrency: sd.arpeggio.concurrency ?? 1,
                merge: sd.arpeggio.merge ?? "concat",
                separator: sd.arpeggio.separator ?? "\n",
                maxRetries: sd.arpeggio.max_retries ?? 2,
                retryDelayMs: sd.arpeggio.retry_delay_ms ?? 1000,
              }
            : undefined,
          conductor: sd.conductor
            ? {
                palette: sd.conductor.palette,
                rules: sd.conductor.rules ? [...sd.conductor.rules] : undefined,
              }
            : undefined,
          teamLeader: sd.team_leader
            ? {
                maxParts: sd.team_leader.max_parts ?? 5,
                partPersona: sd.team_leader.part_persona,
                partMedium: sd.team_leader.part_medium,
                partAllowEdit: sd.team_leader.part_allow_edit,
              }
            : undefined,
          parallel: sd.parallel
            ? sd.parallel.map(p => ({
                name: p.name,
                palette: p.palette,
                instruction: p.instruction,
                knowledge: p.knowledge ? [...p.knowledge] : undefined,
                contract: p.contract,
              }))
            : undefined,
          policy: sd.policy,
          model: resolvePaletteModel(sd.palette, sd.model),
          allowedTools: sd.allowed_tools ? [...sd.allowed_tools] : undefined,
          permissionMode: sd.permission_mode,
          qualityGates: sd.quality_gates ? sd.quality_gates.map(g => ({ name: g.name, condition: g.condition })) : undefined,
          outputContracts: sd.output_contracts ? sd.output_contracts.map(c => ({ name: c.name, format: c.format })) : undefined,
        }),
    );

    // dependsOn を持つ Stroke がある場合は並列実行パスへ
    const hasParallelStrokes = strokes.some((s) => s.dependsOn.length > 0);
    if (hasParallelStrokes) {
      return this.executeParallel(strokes, canvas, runId, options, errors);
    }

    // Loop monitoring: stroke ごとの実行回数を追跡
    const strokeExecCounts = new Map<string, number>();
    const loopMonitors = commission.loop_monitors ?? [];

    // initial_stroke が指定されている場合はそのstrokeから開始
    let currentStroke: Stroke | undefined = commission.initial_stroke
      ? strokes.find((s) => s.name === commission.initial_stroke) ?? strokes[0]
      : strokes[0];

    while (currentStroke && !currentStroke.isTerminal) {
      // ループ先頭で確定参照を取得（TypeScript narrowing 維持用）
      const activeStroke: Stroke = currentStroke;

      this.deps.eventBus.emit("stroke:start", {
        runId,
        strokeName: activeStroke.name,
      });

      const strokeStart = Date.now();

      // テンプレート変数用のイテレーション情報を更新
      this._iteration = strokesExecuted + 1;
      this._strokeIteration = (strokeExecCounts.get(activeStroke.name) ?? 0) + 1;
      // loop_monitors から現在の stroke を含む cycle の最大 threshold を取得
      const applicableMonitor = loopMonitors.find((m) => m.cycle.includes(activeStroke.name));
      this._maxIterations = applicableMonitor ? String(applicableMonitor.threshold) : "";

      try {
        if (options.dryRun) {
          activeStroke.transitionTo(StrokeStatus.Composing);
          activeStroke.transitionTo(StrokeStatus.Executing);
          activeStroke.transitionTo(StrokeStatus.Completed);
        } else {
          await this.executeStroke(activeStroke, canvas, runId);
        }

        strokesExecuted++;

        // ループカウントを更新
        const prevCount = strokeExecCounts.get(activeStroke.name) ?? 0;
        strokeExecCounts.set(activeStroke.name, prevCount + 1);

        this.deps.eventBus.emit("stroke:complete", {
          runId,
          strokeName: activeStroke.name,
          duration: Date.now() - strokeStart,
        });

        // Loop Monitor しきい値チェック
        const thresholdAction = this.checkLoopMonitors(
          activeStroke.name,
          strokeExecCounts,
          loopMonitors,
          runId,
        );

        if (thresholdAction === "fail") {
          errors.push({
            strokeName: activeStroke.name,
            message: `Loop monitor threshold reached for cycle containing '${activeStroke.name}'`,
            timestamp: new Date().toISOString(),
          });
          return {
            status: CommissionStatus.Failed,
            strokesExecuted,
            errors,
          };
        }

        if (thresholdAction === "force_complete") {
          return {
            status: CommissionStatus.Completed,
            strokesExecuted,
            errors,
          };
        }

        if (thresholdAction === "skip") {
          // cycle に含まれる stroke をすべてスキップし、cycle 後の次の stroke へ進む
          currentStroke = this.resolveNextStrokeAfterCycle(
            activeStroke,
            strokes,
            loopMonitors,
          );
          continue;
        }
      } catch (error) {
        activeStroke.transitionTo(StrokeStatus.Failed);

        const errorMessage =
          error instanceof Error ? error.message : String(error);

        errors.push({
          strokeName: activeStroke.name,
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });

        this.deps.eventBus.emit("stroke:fail", {
          runId,
          strokeName: activeStroke.name,
          error: errorMessage,
        });

        return {
          status: CommissionStatus.Failed,
          strokesExecuted,
          errors,
        };
      }

      // Phase 3: Conductor によるステータス判定（parallel ストロークは内部で処理済み）
      if (activeStroke.conductor && !activeStroke.parallel) {
        const conductorNext = await this.runConductorPhase(
          activeStroke,
          strokes,
          canvas,
          runId,
        );
        if (conductorNext !== undefined) {
          currentStroke = conductorNext;
          continue;
        }
      }

      // 次のストロークを決定
      currentStroke = this.resolveNextStroke(activeStroke, strokes, canvas);
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
    // 並列パスでも transitions の loop back / max_retries を尊重するため、
    // stroke ごとの実行回数を追跡する（sequential パスの strokeExecCounts と同様）。
    const strokeExecCounts = new Map<string, number>();
    // transitions で `next: null` または max_retries 超過の `fail` 判定が出たとき
    // 全体ループを止めるためのフラグ。
    let terminateRequested = false;
    // max_retries 到達 + on_max_retries=fail のとき、最終 status を Failed に
    // するためのフラグ（completed/failed Set だけでは表せないため別途持つ）。
    let maxRetriesFailed = false;

    // 循環依存検出
    this.detectCyclicDependencies(strokes);

    while (!terminateRequested) {
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

          // テンプレート変数用のイテレーション情報を更新（並列パス）
          this._iteration = strokesExecuted + 1;
          this._strokeIteration = 1;
          this._maxIterations = "";

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

      // この wave で成功した stroke 名（後段の transition 評価で使う）
      const justCompleted: string[] = [];

      for (const result of results) {
        if (result.status === "fulfilled") {
          completed.add(result.value);
          strokesExecuted++;
          const prevCount = strokeExecCounts.get(result.value) ?? 0;
          strokeExecCounts.set(result.value, prevCount + 1);
          justCompleted.push(result.value);
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

      // この wave で完了した stroke の transitions を評価する。
      // sequential パス (resolveNextStroke) と同じ条件 (==, !=, has:, status: 等) を
      // 並列パスでも尊重する。`next: null` で終了、既完了 stroke への遷移なら
      // 当該 stroke と下流 stroke を `completed` から外して再実行可能にする (loop back)。
      // max_retries は stroke ごとの実行回数で抑制し、`on_max_retries` に従って fail
      // または force_complete を選ぶ。
      const loopBackResult = this.applyParallelTransitions(
        justCompleted,
        strokeMap,
        strokes,
        canvas,
        completed,
        strokeExecCounts,
        errors,
      );
      if (loopBackResult === "terminate") {
        terminateRequested = true;
      } else if (loopBackResult === "fail") {
        terminateRequested = true;
        maxRetriesFailed = true;
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
      status:
        failed.size > 0 || maxRetriesFailed
          ? CommissionStatus.Failed
          : CommissionStatus.Completed,
      strokesExecuted,
      errors,
    };
  }

  /**
   * 並列パスで wave 完了後に transitions を評価し、loop back / 終了 / max_retries
   * を反映する。戻り値:
   *   - "continue" : 通常通り次の wave へ
   *   - "terminate": commission を完了として打ち切る（`next: null` ヒット時）
   *   - "fail"     : max_retries 超過で `on_max_retries: fail` の場合
   * 副作用として `completed` から再実行対象の stroke 名を削除する。
   */
  private applyParallelTransitions(
    justCompleted: string[],
    strokeMap: Map<string, Stroke>,
    strokes: readonly Stroke[],
    canvas: Canvas,
    completed: Set<string>,
    strokeExecCounts: Map<string, number>,
    errors: RunErrorDto[],
  ): "continue" | "terminate" | "fail" {
    for (const name of justCompleted) {
      const stroke = strokeMap.get(name);
      if (!stroke || stroke.transitions.length === 0) continue;

      for (const transition of stroke.transitions) {
        if (!this.evaluateCondition(transition.condition, canvas)) continue;

        // ヒットしたトランジション
        if (
          transition.next === null ||
          transition.next === undefined ||
          transition.next === "null" ||
          transition.next === ""
        ) {
          return "terminate";
        }

        // 既に完了している stroke への遷移 = loop back の候補
        // ただし「back edge（自分の祖先 = transitively depends on する stroke）」
        // である場合のみ実際に loop back とみなす。並列モードでは sequential 用に
        // 書かれた `next: <次の sibling>` 風の transition は意味を持たないため、
        // 兄弟や子孫への transition は無視する（誤った再実行を防ぐ）。
        if (completed.has(transition.next)) {
          if (!this.isTransitivelyDependent(stroke.name, transition.next, strokes)) {
            break; // 後方エッジでないので transition 自体を採用しない
          }
          const targetCount = strokeExecCounts.get(transition.next) ?? 0;
          if (targetCount >= transition.maxRetries) {
            const onMax = transition.onMaxRetries ?? "fail";
            errors.push({
              strokeName: name,
              message:
                `Max retries (${transition.maxRetries}) exceeded for transition ` +
                `'${stroke.name}' -> '${transition.next}'`,
              timestamp: new Date().toISOString(),
            });
            return onMax === "fail" ? "fail" : "terminate";
          }
          this.resetStrokeAndDownstream(transition.next, strokes, completed, strokeMap);
        }
        // 最初にヒットしたトランジションのみ採用（sequential パスと同様の早抜け）
        break;
      }
    }
    return "continue";
  }

  /**
   * 指定 stroke と、それに依存する全 stroke（推移的）を `completed` から削除し、
   * Stroke オブジェクト自体のステートも Pending に戻す。loop back 後に依存解決が
   * 再評価され、Pending → Composing → Executing の通常パスで再実行できるよう
   * にするため。
   */
  private resetStrokeAndDownstream(
    target: string,
    strokes: readonly Stroke[],
    completed: Set<string>,
    strokeMap: Map<string, Stroke>,
  ): void {
    const toReset = new Set<string>([target]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const stroke of strokes) {
        if (toReset.has(stroke.name)) continue;
        if (stroke.dependsOn.some((dep) => toReset.has(dep))) {
          toReset.add(stroke.name);
          changed = true;
        }
      }
    }
    for (const name of toReset) {
      completed.delete(name);
      const s = strokeMap.get(name);
      if (s && s.status === StrokeStatus.Completed) {
        s.transitionTo(StrokeStatus.Pending);
      }
    }
  }

  /**
   * `dependent` が `ancestor` に推移的に依存しているか（DAG の back edge 判定）。
   * 並列パスで transition の loop back を正当な後方エッジに限定するために使う。
   */
  private isTransitivelyDependent(
    dependent: string,
    ancestor: string,
    strokes: readonly Stroke[],
  ): boolean {
    const strokeMap = new Map(strokes.map((s) => [s.name, s]));
    const visited = new Set<string>();
    const queue: string[] = [dependent];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const stroke = strokeMap.get(cur);
      if (!stroke) continue;
      for (const dep of stroke.dependsOn) {
        if (dep === ancestor) return true;
        queue.push(dep);
      }
    }
    return false;
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
    // Parallel モード: サブストロークを並列実行 → 結果集約
    if (stroke.parallel && stroke.parallel.length > 0) {
      await this.executeParallelStroke(stroke, canvas, runId);
      return;
    }

    // Team Leader モード: タスク分解 → 並列実行 → 集約
    if (stroke.teamLeader) {
      await this.executeTeamLeaderStroke(stroke, canvas, runId);
      return;
    }

    // Arpeggio モード: CSV × テンプレート × バッチ処理
    if (stroke.arpeggio) {
      await this.executeArpeggioStroke(stroke, canvas, runId);
      return;
    }

    stroke.transitionTo(StrokeStatus.Composing);

    // ファセットプロンプティングでプロンプトを構成
    const { systemPrompt, userPrompt } = await this.composeFacetedPrompt(stroke, canvas);

    stroke.transitionTo(StrokeStatus.Executing);

    // Persona（system prompt）をプロンプト本文の先頭に含める
    const fullPrompt = systemPrompt
      ? `[Persona]\n${systemPrompt}\n\n${userPrompt}`
      : userPrompt;

    this.deps.eventBus.emit("medium:request", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
    });

    console.error(`[stroke:${stroke.name}] executing via MediumExecutor (medium=${stroke.medium})...`);

    const result = await this.deps.mediumExecutor.execute({
      medium: stroke.medium,
      prompt: fullPrompt,
      workingDirectory: this.deps.cwd,
      allowEdit: stroke.allowEdit,
      timeoutMs: 1_200_000,
      model: stroke.model,
      allowedTools: stroke.allowedTools,
      permissionMode: stroke.permissionMode,
    });

    this.deps.eventBus.emit("medium:response", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
      duration: result.durationMs,
    });

    // 実行結果をログ出力
    console.error(`\n[stroke:${stroke.name}] completed (exitCode=${result.exitCode}, ${result.rawStdout.length} chars, ${Math.round(result.durationMs / 1000)}s)`);

    // stdout の内容を表示（途中経過）
    if (result.rawStdout.length > 0) {
      const preview = result.rawStdout.length > 2000
        ? result.rawStdout.slice(0, 2000) + `\n... (${result.rawStdout.length} chars total)`
        : result.rawStdout;
      console.error(`[stroke:${stroke.name}] output:\n${preview}\n`);
    }

    // stderr があれば表示
    if (result.rawStderr.length > 0) {
      console.error(`[stroke:${stroke.name}] stderr: ${result.rawStderr.slice(0, 500)}`);
    }

    // 非ゼロ終了コードはエラーとして扱う
    if (result.exitCode !== 0) {
      throw new Error(
        `Medium exited with code ${result.exitCode}: ${result.rawStderr.slice(0, 500) || result.rawStdout.slice(0, 500)}`,
      );
    }

    // 結果を Canvas に格納
    for (const outputKey of stroke.outputs) {
      canvas.set(outputKey, result.rawStdout);
    }

    // Quality Gates チェック
    this.checkQualityGates(stroke, canvas);

    // Output Contracts: 複数ファイル出力の定義がある場合、ファイルパスを Canvas に保存
    await this.processOutputContracts(stroke, canvas, result.rawStdout);

    stroke.transitionTo(StrokeStatus.Completed);
  }

  /**
   * Parallel モードでの Stroke 実行。
   * 各サブストロークを Promise.allSettled で並列実行し、
   * conductor がある場合はステータス判定を行い、
   * 結果を集約して Canvas に格納する。
   * Canvas に `{strokeName}_parallel_results` として各サブストロークのステータスを保存する。
   */
  private async executeParallelStroke(
    stroke: Stroke,
    canvas: Canvas,
    runId: string,
  ): Promise<void> {
    const subStrokes = stroke.parallel!;

    console.error(`[parallel:${stroke.name}] starting ${subStrokes.length} sub-strokes`);

    stroke.transitionTo(StrokeStatus.Composing);

    // 各サブストロークの faceted prompt を並列でビルド
    const subPromises = subStrokes.map(async (sub) => {
      // サブストローク用の一時 Stroke オブジェクトを作成してプロンプトを合成
      const subStrokeDef: StrokeDefinition = {
        name: sub.name,
        palette: sub.palette,
        medium: stroke.medium,
        allowEdit: stroke.allowEdit,
        instruction: sub.instruction,
        inputs: [...stroke.inputs],
        outputs: [],
        transitions: [],
        contract: sub.contract ?? "",
        knowledge: sub.knowledge ? [...sub.knowledge] : [],
      };
      const tempStroke = new Stroke(subStrokeDef);
      return { sub, tempStroke };
    });

    const subStrokeInfos = await Promise.all(subPromises);

    stroke.transitionTo(StrokeStatus.Executing);

    this.deps.eventBus.emit("medium:request", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
    });

    // 各サブストロークを並列実行
    const settled = await Promise.allSettled(
      subStrokeInfos.map(async ({ sub, tempStroke }) => {
        const { systemPrompt, userPrompt } = await this.composeFacetedPrompt(tempStroke, canvas);

        const fullPrompt = systemPrompt
          ? `[Persona]\n${systemPrompt}\n\n${userPrompt}`
          : userPrompt;

        this.deps.eventBus.emit("medium:request", {
          runId,
          mediumName: stroke.medium,
          strokeName: `${stroke.name}.${sub.name}`,
        });

        const result = await this.deps.mediumExecutor.execute({
          medium: stroke.medium,
          prompt: fullPrompt,
          workingDirectory: this.deps.cwd,
          allowEdit: stroke.allowEdit,
          timeoutMs: 1_200_000,
          model: stroke.model,
          allowedTools: stroke.allowedTools,
        });

        this.deps.eventBus.emit("medium:response", {
          runId,
          mediumName: stroke.medium,
          strokeName: `${stroke.name}.${sub.name}`,
          duration: result.durationMs,
        });

        console.error(`[parallel:${stroke.name}.${sub.name}] completed (exitCode=${result.exitCode}, ${result.rawStdout.length} chars)`);

        if (result.exitCode !== 0) {
          throw new Error(
            `Sub-stroke ${sub.name} failed (exitCode=${result.exitCode}): ${result.rawStderr.slice(0, 500) || result.rawStdout.slice(0, 500)}`,
          );
        }

        return { name: sub.name, output: result.rawStdout };
      }),
    );

    // 結果を集約
    const subResults = new Map<string, string>();
    const aggregatedParts: string[] = [];
    const failedSubs: string[] = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const subName = subStrokes[i].name;

      if (result.status === "fulfilled") {
        aggregatedParts.push(`## ${subName}\n\n${result.value.output}`);

        // Conductor ステータス判定（conductor がある場合）
        if (stroke.conductor) {
          const statusTag = parseStatusTag(result.value.output);
          subResults.set(subName, statusTag ?? "unknown");
        } else {
          subResults.set(subName, "completed");
        }
      } else {
        const errorMsg = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
        failedSubs.push(`${subName}: ${errorMsg}`);
        aggregatedParts.push(`## ${subName}\n\n[ERROR] ${errorMsg}`);
        subResults.set(subName, "error");
      }
    }

    // 全サブストロークが失敗した場合はエラー
    if (failedSubs.length === settled.length) {
      throw new Error(
        `All parallel sub-strokes failed: ${failedSubs.join("; ")}`,
      );
    }

    if (failedSubs.length > 0) {
      console.error(`[parallel:${stroke.name}] ${failedSubs.length}/${settled.length} sub-strokes failed`);
    }

    const aggregatedContent = aggregatedParts.join("\n\n---\n\n");

    console.error(`[parallel:${stroke.name}] aggregated ${aggregatedParts.length} results (${aggregatedContent.length} chars)`);

    // 結果を Canvas に格納
    for (const outputKey of stroke.outputs) {
      canvas.set(outputKey, aggregatedContent);
    }

    // サブストローク結果を Canvas に保存（all()/any() 条件評価用）
    // JSON シリアライズして保存
    const resultsObj: Record<string, string> = {};
    for (const [key, value] of subResults) {
      resultsObj[key] = value;
    }
    canvas.set(`${stroke.name}_parallel_results`, JSON.stringify(resultsObj));

    this.deps.eventBus.emit("medium:response", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
      duration: 0,
    });

    stroke.transitionTo(StrokeStatus.Completed);
  }

  /**
   * Arpeggio モードでの Stroke 実行。
   * CSV からデータを読み込み、各バッチをテンプレート展開して Medium で並列実行し、
   * 結果をマージして Canvas に格納する。
   */
  private async executeArpeggioStroke(
    stroke: Stroke,
    canvas: Canvas,
    runId: string,
  ): Promise<void> {
    const arpeggioConfig = stroke.arpeggio!;

    stroke.transitionTo(StrokeStatus.Composing);

    // ファセットプロンプティングでプロンプトを構成（instruction にテンプレート変数を含む）
    const { systemPrompt, userPrompt } = await this.composeFacetedPrompt(stroke, canvas);

    stroke.transitionTo(StrokeStatus.Executing);

    this.deps.eventBus.emit("medium:request", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
    });

    console.error(
      `[arpeggio:${stroke.name}] starting batch processing (source=${arpeggioConfig.sourcePath}, batchSize=${arpeggioConfig.batchSize}, concurrency=${arpeggioConfig.concurrency})`,
    );

    // バッチごとに Medium を呼び出す executor を定義
    const executor = async (expandedInstruction: string): Promise<string> => {
      const fullPrompt = systemPrompt
        ? `[Persona]\n${systemPrompt}\n\n${expandedInstruction}`
        : expandedInstruction;

      const result = await this.deps.mediumExecutor.execute({
        medium: stroke.medium,
        prompt: fullPrompt,
        workingDirectory: this.deps.cwd,
        allowEdit: stroke.allowEdit,
        timeoutMs: 1_200_000,
        model: stroke.model,
        allowedTools: stroke.allowedTools,
      });

      if (result.exitCode !== 0) {
        throw new Error(
          `Medium exited with code ${result.exitCode}: ${result.rawStderr.slice(0, 500) || result.rawStdout.slice(0, 500)}`,
        );
      }

      return result.rawStdout;
    };

    // runArpeggio で CSV 読み込み → バッチ分割 → 並列実行 → マージ
    const mergedResult = await runArpeggio(arpeggioConfig, userPrompt, executor);

    this.deps.eventBus.emit("medium:response", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
      duration: 0,
    });

    console.error(
      `[arpeggio:${stroke.name}] completed (${mergedResult.length} chars merged)`,
    );

    // 結果を Canvas に格納
    for (const outputKey of stroke.outputs) {
      canvas.set(outputKey, mergedResult);
    }

    stroke.transitionTo(StrokeStatus.Completed);
  }

  /**
   * Team Leader モードでの Stroke 実行。
   * Phase 1: AI にタスクを分解させる（[SUBTASK] タグで分割）
   * Phase 2: 各サブタスクを並列実行（Promise.allSettled）
   * Phase 3: 全 worker の結果を集約して Canvas に格納
   */
  private async executeTeamLeaderStroke(
    stroke: Stroke,
    canvas: Canvas,
    runId: string,
  ): Promise<void> {
    const teamLeader = stroke.teamLeader!;
    const maxParts = teamLeader.maxParts;

    console.error(`[team-leader:${stroke.name}] starting (maxParts=${maxParts})`);

    // === Phase 1: タスク分解 ===
    stroke.transitionTo(StrokeStatus.Composing);

    const { systemPrompt, userPrompt } = await this.composeFacetedPrompt(stroke, canvas);

    // タスク分解用のプロンプトに [SUBTASK] タグ指示を付与
    const decompositionPrompt = systemPrompt
      ? `[Persona]\n${systemPrompt}\n\n${userPrompt}\n\n[Decomposition Rule]\n各サブタスクは [SUBTASK] タグで区切ってください。最大 ${maxParts} 個のサブタスクに分割してください。\n各サブタスクには具体的な実行指示を含めてください。`
      : `${userPrompt}\n\n[Decomposition Rule]\n各サブタスクは [SUBTASK] タグで区切ってください。最大 ${maxParts} 個のサブタスクに分割してください。\n各サブタスクには具体的な実行指示を含めてください。`;

    stroke.transitionTo(StrokeStatus.Executing);

    this.deps.eventBus.emit("medium:request", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
    });

    // Phase 1: リーダーにタスク分解を依頼
    const leaderResult = await this.deps.mediumExecutor.execute({
      medium: stroke.medium,
      prompt: decompositionPrompt,
      workingDirectory: this.deps.cwd,
      allowEdit: false,
      timeoutMs: 1_200_000,
      model: stroke.model,
      allowedTools: stroke.allowedTools,
    });

    this.deps.eventBus.emit("medium:response", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
      duration: leaderResult.durationMs,
    });

    console.error(`[team-leader:${stroke.name}] Phase 1 decomposition completed (${leaderResult.rawStdout.length} chars)`);

    if (leaderResult.exitCode !== 0) {
      throw new Error(
        `Team leader decomposition failed (exitCode=${leaderResult.exitCode}): ${leaderResult.rawStderr.slice(0, 500) || leaderResult.rawStdout.slice(0, 500)}`,
      );
    }

    // [SUBTASK] タグでサブタスクを抽出
    const subtasks = this.extractSubtasks(leaderResult.rawStdout, maxParts);

    if (subtasks.length === 0) {
      // サブタスクが抽出できなかった場合、全体の出力をそのまま結果とする
      console.error(`[team-leader:${stroke.name}] No subtasks found, using full output as result`);
      for (const outputKey of stroke.outputs) {
        canvas.set(outputKey, leaderResult.rawStdout);
      }
      stroke.transitionTo(StrokeStatus.Completed);
      return;
    }

    console.error(`[team-leader:${stroke.name}] Phase 1 extracted ${subtasks.length} subtasks`);

    // === Phase 2: 各サブタスクを並列実行 ===
    const workerMediumName = teamLeader.partMedium ?? stroke.medium;

    // worker 用の Palette（persona）を読み込み
    const workerPaletteName = teamLeader.partPersona ?? stroke.palette;
    const workerPalette = await this.loadPalette(workerPaletteName);
    const workerPersona = workerPalette?.persona ?? "";
    const workerAllowEdit = teamLeader.partAllowEdit ?? stroke.allowEdit;

    console.error(`[team-leader:${stroke.name}] Phase 2 starting ${subtasks.length} workers (palette=${workerPaletteName}, medium=${workerMediumName})`);

    const workerResults = await Promise.allSettled(
      subtasks.map(async (subtask, index) => {
        const workerPrompt = workerPersona
          ? `[Persona]\n${workerPersona}\n\n[Task]\n${subtask}`
          : `[Task]\n${subtask}`;

        this.deps.eventBus.emit("medium:request", {
          runId,
          mediumName: workerMediumName,
          strokeName: `${stroke.name}.worker-${index}`,
        });

        const result = await this.deps.mediumExecutor.execute({
          medium: workerMediumName,
          prompt: workerPrompt,
          workingDirectory: this.deps.cwd,
          allowEdit: workerAllowEdit,
          timeoutMs: 1_200_000,
          model: stroke.model,
          allowedTools: stroke.allowedTools,
        });

        this.deps.eventBus.emit("medium:response", {
          runId,
          mediumName: workerMediumName,
          strokeName: `${stroke.name}.worker-${index}`,
          duration: result.durationMs,
        });

        console.error(`[team-leader:${stroke.name}] worker-${index} completed (exitCode=${result.exitCode}, ${result.rawStdout.length} chars)`);

        if (result.exitCode !== 0) {
          throw new Error(
            `Worker ${index} failed (exitCode=${result.exitCode}): ${result.rawStderr.slice(0, 500) || result.rawStdout.slice(0, 500)}`,
          );
        }

        return {
          index,
          subtask,
          output: result.rawStdout,
        };
      }),
    );

    // === Phase 3: 結果集約 ===
    const aggregatedParts: string[] = [];
    const failedWorkers: string[] = [];

    for (let i = 0; i < workerResults.length; i++) {
      const result = workerResults[i];
      if (result.status === "fulfilled") {
        aggregatedParts.push(
          `## Subtask ${i + 1}: ${subtasks[i].slice(0, 80).replace(/\n/g, " ")}\n\n${result.value.output}`,
        );
      } else {
        const errorMsg = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
        failedWorkers.push(`Worker ${i}: ${errorMsg}`);
        aggregatedParts.push(
          `## Subtask ${i + 1}: ${subtasks[i].slice(0, 80).replace(/\n/g, " ")}\n\n[ERROR] ${errorMsg}`,
        );
      }
    }

    // 全 worker が失敗した場合はエラー
    if (failedWorkers.length === workerResults.length) {
      throw new Error(
        `All team leader workers failed: ${failedWorkers.join("; ")}`,
      );
    }

    if (failedWorkers.length > 0) {
      console.error(`[team-leader:${stroke.name}] ${failedWorkers.length}/${workerResults.length} workers failed`);
    }

    const aggregatedContent = [
      `## Decomposition\n\n${subtasks.map((s, i) => `${i + 1}. ${s.slice(0, 100).replace(/\n/g, " ")}`).join("\n")}`,
      "---",
      ...aggregatedParts,
    ].join("\n\n");

    console.error(`[team-leader:${stroke.name}] Phase 3 aggregated ${aggregatedParts.length} results (${aggregatedContent.length} chars)`);

    // 結果を Canvas に格納
    for (const outputKey of stroke.outputs) {
      canvas.set(outputKey, aggregatedContent);
    }

    stroke.transitionTo(StrokeStatus.Completed);
  }

  /**
   * [SUBTASK] タグでサブタスクを抽出する。
   * 形式: [SUBTASK] の後に続くテキストを1つのサブタスクとして扱う。
   */
  private extractSubtasks(content: string, maxParts: number): string[] {
    const parts = content.split(/\[SUBTASK\]/i);
    // 最初の要素は [SUBTASK] タグより前のテキストなので除外
    const subtasks = parts
      .slice(1)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // maxParts で制限
    return subtasks.slice(0, maxParts);
  }

  /**
   * ファセットプロンプティングによるプロンプト合成。
   * Persona → systemPrompt
   * Knowledge → Instruction → Contract → Policy → userPrompt
   */
  private async composeFacetedPrompt(stroke: Stroke, canvas: Canvas): Promise<FacetedPrompt> {
    // Palette を読み込み（persona + policies リスト）
    const palette = await this.loadPalette(stroke.palette);

    // System prompt: Persona の内容
    const systemPrompt = palette?.persona ?? "";

    // User prompt をファセット順序で構成
    const parts: string[] = [];

    // 1. Canvas の入力値を先頭に配置
    for (const inputKey of stroke.inputs) {
      const value = canvas.get<string>(inputKey);
      if (value !== undefined) {
        parts.push(`[${inputKey}]\n${value}`);
      }
    }

    // 2. Knowledge: stroke の knowledge リストから .md ファイルを読み込み
    if (stroke.knowledge.length > 0) {
      const knowledgeContents = await this.loadKnowledgeFiles(stroke.knowledge);
      if (knowledgeContents.length > 0) {
        parts.push(`[Knowledge]\n${knowledgeContents.join("\n\n---\n\n")}`);
      }
    }

    // 3. Instruction: stroke の指示（ファイル参照の場合は外部ファイルから読み込み）
    const resolvedInstruction = await this.resolveInstruction(stroke.instruction, canvas);
    // appendix が Canvas に保存されている場合、instruction の末尾に追加
    const appendix = canvas.get<string>("_appendix");
    if (appendix) {
      parts.push(`${resolvedInstruction}\n\n${appendix}`);
    } else {
      parts.push(resolvedInstruction);
    }

    // 4. Contract: 出力契約のフォーマットを配置（Instruction と Policy の間）
    if (stroke.contract) {
      const contractContent = await this.loadContractFormat(stroke.contract, canvas);
      if (contractContent) {
        parts.push(`[Output Contract]\n${contractContent}`);
      }
    }

    // 5. Policy: stroke固有 > Palette のポリシーを末尾に配置（recency effect 活用）
    if (stroke.policy) {
      // stroke.policy が指定されている場合、そのpolicyを最優先で使用
      const policyContents = await this.loadPolicies([stroke.policy]);
      if (policyContents.length > 0) {
        parts.push(`[Policy]\n${policyContents.join("\n\n")}`);
      }
    } else if (palette?.policies && palette.policies.length > 0) {
      // フォールバック: Palette のポリシーを使用
      const policyContents = await this.loadPolicies(palette.policies);
      if (policyContents.length > 0) {
        parts.push(`[Policy]\n${policyContents.join("\n\n")}`);
      }
    }

    return {
      systemPrompt,
      userPrompt: parts.join("\n\n"),
    };
  }

  /**
   * Palette YAML を読み込む。
   * プロジェクト固有 (.atelier/palettes/) > ビルトイン の優先順。
   * 見つからない場合は null を返す。
   */
  private async loadPalette(paletteName: string): Promise<RawPalette | null> {
    // 1. プロジェクト固有パレットを探す
    const projectPalettePath = path.join(
      resolveAtelierPath(this.deps.projectPath),
      PALETTES_DIR,
      `${paletteName}.yaml`,
    );
    if (await fileExists(projectPalettePath)) {
      try {
        const content = await readTextFile(projectPalettePath);
        return parseYaml(content) as RawPalette;
      } catch {
        // パース失敗時はビルトインにフォールバック
      }
    }

    // 2. ビルトインパレットを探す
    const builtinPath = getBuiltinPalettePath(paletteName);
    if (await fileExists(builtinPath)) {
      try {
        const content = await readTextFile(builtinPath);
        return parseYaml(content) as RawPalette;
      } catch {
        // パース失敗時は null
      }
    }

    return null;
  }

  /**
   * Policy YAML を読み込み、ルールを文字列化して返す。
   * プロジェクト固有 (.atelier/policies/) > ビルトイン の優先順。
   */
  private async loadPolicies(policyNames: readonly string[]): Promise<string[]> {
    const results: string[] = [];

    for (const policyName of policyNames) {
      const policy = await this.loadPolicy(policyName);
      if (policy?.rules && policy.rules.length > 0) {
        const rulesText = policy.rules
          .map((r) => {
            const header = r.name ? `### ${r.name}` : "";
            return header ? `${header}\n${r.content}` : r.content;
          })
          .join("\n\n");
        results.push(rulesText);
      }
    }

    return results;
  }

  /**
   * 単一の Policy YAML を読み込む。
   */
  private async loadPolicy(policyName: string): Promise<RawPolicy | null> {
    // 1. プロジェクト固有
    const projectPolicyPath = path.join(
      resolveAtelierPath(this.deps.projectPath),
      POLICIES_DIR,
      `${policyName}.yaml`,
    );
    if (await fileExists(projectPolicyPath)) {
      try {
        const content = await readTextFile(projectPolicyPath);
        return parseYaml(content) as RawPolicy;
      } catch {
        // フォールバック
      }
    }

    // 2. ビルトイン
    const builtinPath = getBuiltinPolicyPath(policyName);
    if (await fileExists(builtinPath)) {
      try {
        const content = await readTextFile(builtinPath);
        return parseYaml(content) as RawPolicy;
      } catch {
        // null
      }
    }

    return null;
  }

  /**
   * Knowledge ファイルを読み込む。
   * プロジェクト固有 (.atelier/knowledge/) > ビルトイン の優先順。
   * 各ファイルは最大 3000 文字に制限（トランケーション）。
   */
  private async loadKnowledgeFiles(knowledgeNames: readonly string[]): Promise<string[]> {
    const MAX_KNOWLEDGE_CHARS = 3000;
    const results: string[] = [];

    for (const name of knowledgeNames) {
      const content = await this.loadKnowledgeFile(name);
      if (content) {
        const truncated = content.length > MAX_KNOWLEDGE_CHARS
          ? content.slice(0, MAX_KNOWLEDGE_CHARS) + "\n\n...(truncated)"
          : content;
        results.push(truncated);
      }
    }

    return results;
  }

  /**
   * 単一の Knowledge .md ファイルを読み込む。
   * プロジェクト固有 (.atelier/knowledge/) > ビルトイン の優先順。
   */
  private async loadKnowledgeFile(name: string): Promise<string | null> {
    // 1. プロジェクト固有
    const projectKnowledgePath = path.join(
      resolveAtelierPath(this.deps.projectPath),
      KNOWLEDGE_DIR,
      `${name}.md`,
    );
    if (await fileExists(projectKnowledgePath)) {
      try {
        return await readTextFile(projectKnowledgePath);
      } catch {
        // フォールバック
      }
    }

    // 2. ビルトイン
    const builtinPath = getBuiltinKnowledgePath(name);
    if (await fileExists(builtinPath)) {
      try {
        return await readTextFile(builtinPath);
      } catch {
        // null
      }
    }

    return null;
  }

  /**
   * Instruction 文字列を解決する。
   * ファイル参照の場合は外部ファイルを読み込み、テンプレート変数を Canvas の値で展開する。
   * 判定ロジック: 改行を含まず、50文字以下で、.md を含まなければファイル参照と判断。
   * 優先順: プロジェクト固有(.atelier/instructions/) > ビルトイン
   */
  private async resolveInstruction(instruction: string, canvas: Canvas): Promise<string> {
    // ファイル参照の判定: 改行なし、50文字以下、.md を含まない
    const isFileRef = !instruction.includes("\n") && instruction.length <= 50 && !instruction.includes(".md");

    if (!isFileRef) {
      // インラインの場合はテンプレート変数を展開して返す
      return this.expandTemplateVariables(instruction, canvas);
    }

    const name = instruction.trim();

    // 1. プロジェクト固有の instruction を探す
    const projectInstructionPath = path.join(
      resolveAtelierPath(this.deps.projectPath),
      INSTRUCTIONS_DIR,
      `${name}.md`,
    );
    if (await fileExists(projectInstructionPath)) {
      try {
        const content = await readTextFile(projectInstructionPath);
        return this.expandTemplateVariables(content, canvas);
      } catch {
        // パース失敗時はビルトインにフォールバック
      }
    }

    // 2. ビルトイン instruction を探す
    const builtinPath = getBuiltinInstructionPath(name);
    if (await fileExists(builtinPath)) {
      try {
        const content = await readTextFile(builtinPath);
        return this.expandTemplateVariables(content, canvas);
      } catch {
        // 読み込み失敗時は元の文字列を返す
      }
    }

    // ファイルが見つからない場合は元の instruction をそのまま返す
    return instruction;
  }

  /**
   * テンプレート変数 {{variable}} を Canvas の値で展開する。
   * ランタイム変数（iteration, max_iterations, stroke_iteration）も展開する。
   */
  private expandTemplateVariables(template: string, canvas: Canvas): string {
    // ランタイム変数（Canvas より優先）
    const runtimeVars: Record<string, string> = {
      iteration: String(this._iteration),
      max_iterations: this._maxIterations,
      stroke_iteration: String(this._strokeIteration),
      report_dir: this._reportDir,
      project_path: this.deps.projectPath,
    };

    return template.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
      if (key in runtimeVars) {
        return runtimeVars[key];
      }
      const value = canvas.get<string>(key);
      return value !== undefined ? value : "";
    });
  }

  /**
   * Contract YAML を読み込み、format フィールドのテンプレート変数を Canvas の値で展開して返す。
   * プロジェクト固有 (.atelier/contracts/) > ビルトイン の優先順。
   */
  private async loadContractFormat(contractName: string, canvas: Canvas): Promise<string | null> {
    const contract = await this.loadContract(contractName);
    if (!contract?.format) {
      return null;
    }

    // テンプレート変数 {{variable}} を Canvas の値で展開（ランタイム変数含む）
    return this.expandTemplateVariables(contract.format, canvas);
  }

  /**
   * 単一の Contract YAML を読み込む。
   * プロジェクト固有 (.atelier/contracts/) > ビルトイン の優先順。
   */
  private async loadContract(contractName: string): Promise<RawContract | null> {
    // 1. プロジェクト固有
    const projectContractPath = path.join(
      resolveAtelierPath(this.deps.projectPath),
      CONTRACTS_DIR,
      `${contractName}.yaml`,
    );
    if (await fileExists(projectContractPath)) {
      try {
        const content = await readTextFile(projectContractPath);
        return parseYaml(content) as RawContract;
      } catch {
        // パース失敗時はビルトインにフォールバック
      }
    }

    // 2. ビルトイン
    const builtinPath = getBuiltinContractPath(contractName);
    if (await fileExists(builtinPath)) {
      try {
        const content = await readTextFile(builtinPath);
        return parseYaml(content) as RawContract;
      } catch {
        // null
      }
    }

    return null;
  }

  /**
   * Loop Monitor のしきい値をチェックする。
   * cycle 内の全 stroke が threshold 回以上実行されていたら on_threshold のアクションを返す。
   */
  private checkLoopMonitors(
    strokeName: string,
    execCounts: Map<string, number>,
    monitors: readonly LoopMonitorYaml[],
    runId: string,
  ): "fail" | "skip" | "force_complete" | null {
    for (const monitor of monitors) {
      // 現在の stroke が cycle に含まれているかチェック
      if (!monitor.cycle.includes(strokeName)) {
        continue;
      }

      // cycle 内の全 stroke が threshold 回以上実行されているかチェック
      const allReachedThreshold = monitor.cycle.every(
        (name) => (execCounts.get(name) ?? 0) >= monitor.threshold,
      );

      if (allReachedThreshold) {
        const action = monitor.on_threshold ?? "fail";
        console.error(
          `[loop-monitor] Threshold reached: cycle=[${monitor.cycle.join(", ")}] threshold=${monitor.threshold} action=${action} runId=${runId}`,
        );
        return action;
      }
    }

    return null;
  }

  /**
   * Loop の cycle をスキップし、cycle 後の最初の stroke を返す。
   * cycle に含まれない最初の stroke（cycle の最後の stroke より後のもの）を探す。
   */
  private resolveNextStrokeAfterCycle(
    currentStroke: Stroke,
    strokes: readonly Stroke[],
    monitors: readonly LoopMonitorYaml[],
  ): Stroke | undefined {
    // 該当する monitor を見つける
    const monitor = monitors.find((m) =>
      m.cycle.includes(currentStroke.name),
    );
    if (!monitor) {
      return undefined;
    }

    const cycleSet = new Set(monitor.cycle);

    // cycle に含まれる stroke のうち、strokes 配列での最後のインデックスを求める
    let lastCycleIndex = -1;
    for (let i = 0; i < strokes.length; i++) {
      if (cycleSet.has(strokes[i].name)) {
        lastCycleIndex = i;
      }
    }

    // その次の stroke を返す
    if (lastCycleIndex >= 0 && lastCycleIndex < strokes.length - 1) {
      return strokes[lastCycleIndex + 1] as Stroke;
    }

    return undefined;
  }

  /**
   * Phase 3: Conductor によるステータス判定。
   * conductor.service.ts の runConductor() に委譲し、
   * 結果の ConductorResult に基づいて次の Stroke を決定する。
   * conductor の rules にマッチする遷移先があればその Stroke を返す。
   * マッチしなければ undefined を返し、通常の resolveNextStroke にフォールバックする。
   */
  private async runConductorPhase(
    stroke: Stroke,
    strokes: readonly Stroke[],
    canvas: Canvas,
    runId: string,
  ): Promise<Stroke | undefined> {
    const conductorDef = stroke.conductor!;

    // Phase 1 の出力（Canvas の値）を収集
    const outputContents: string[] = [];
    for (const outputKey of stroke.outputs) {
      const value = canvas.get<string>(outputKey);
      if (value !== undefined) {
        outputContents.push(`[${outputKey}]\n${value}`);
      }
    }

    if (outputContents.length === 0) {
      console.error(`[conductor] No output found for stroke '${stroke.name}', skipping Phase 3`);
      return undefined;
    }

    // conductor.service.ts の runConductor() に委譲
    const conductorConfig: ConductorConfig = {
      palette: conductorDef.palette,
      rules: (conductorDef.rules ?? []).map((r) => ({ condition: r.condition, next: r.next })),
    };

    const conductorResult = await runConductor(
      outputContents.join("\n\n"),
      conductorConfig,
      this.deps.mediumExecutor,
      stroke.medium,
      this.deps.cwd,
      this.deps.projectPath,
    );

    console.error(`[conductor] Status for '${stroke.name}': ${conductorResult.status}`);

    // Canvas にステータスを保存（後続の transition 条件で参照可能にする）
    canvas.set(`${stroke.name}_conductor_status`, conductorResult.status);

    // nextStroke が null の場合は通常フローへフォールバック
    if (conductorResult.nextStroke === null) {
      return undefined;
    }

    // nextStroke 名から Stroke オブジェクトを解決
    const nextStroke = strokes.find((s) => s.name === conductorResult.nextStroke);
    if (nextStroke) {
      console.error(`[conductor] Rule matched: -> next='${conductorResult.nextStroke}'`);
      return nextStroke;
    }

    console.error(`[conductor] Rule matched but target stroke '${conductorResult.nextStroke}' not found`);
    return undefined;
  }

  /**
   * Quality Gates チェック。
   * stroke の quality_gates が定義されている場合、Canvas 上の値を参照して条件を検証する。
   * 条件を満たさない場合はエラーログを出力する（実行は中断しない）。
   */
  private checkQualityGates(stroke: Stroke, canvas: Canvas): void {
    if (!stroke.qualityGates || stroke.qualityGates.length === 0) {
      return;
    }

    for (const gate of stroke.qualityGates) {
      const value = canvas.get<string>(gate.condition);
      if (value === undefined || value === "" || value === "false" || value === "fail") {
        console.error(
          `[quality-gate:${stroke.name}] FAILED: "${gate.name}" (condition: ${gate.condition}, value: ${value ?? "undefined"})`,
        );
        // Canvas にゲート結果を記録
        canvas.set(`${stroke.name}_quality_gate_${gate.name}`, "failed");
      } else {
        canvas.set(`${stroke.name}_quality_gate_${gate.name}`, "passed");
      }
    }
  }

  /**
   * Output Contracts の処理。
   * stroke に output_contracts が定義されている場合、各 contract のファイルパスを Canvas に保存する。
   * report_dir 配下にファイルを配置する想定で、パスを `{stroke_name}_report_{file_name}` キーで Canvas に格納する。
   * 簡易実装: AI の出力全体を各ファイルに書き出す。
   */
  private async processOutputContracts(
    stroke: Stroke,
    canvas: Canvas,
    output: string,
  ): Promise<void> {
    if (!stroke.outputContracts || stroke.outputContracts.length === 0) {
      return;
    }

    for (const contract of stroke.outputContracts) {
      const filePath = path.join(this._reportDir, contract.name);

      // format の解決: Contract 名であれば YAML から読み込み、なければインラインとして扱う
      let resolvedFormat: string | null = null;
      if (contract.format) {
        const contractData = await this.loadContract(contract.format);
        resolvedFormat = contractData?.format ?? contract.format;
      }

      // ファイルパスを Canvas に保存
      // キー: {stroke_name}_report_{file_name}（ドットをアンダースコアに置換）
      const safeFileName = contract.name.replace(/\./g, "_");
      const canvasKey = `${stroke.name}_report_${safeFileName}`;
      canvas.set(canvasKey, filePath);

      // 実際のファイル書き出し（report_dir 配下）
      const absolutePath = path.resolve(this.deps.cwd, filePath);
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(absolutePath, output, "utf-8");

      console.error(
        `[output-contract:${stroke.name}] wrote ${contract.name} -> ${filePath}${resolvedFormat ? ` (format: ${contract.format})` : ""}`,
      );
    }
  }

  private resolveNextStroke(
    current: Stroke,
    strokes: readonly Stroke[],
    canvas: Canvas,
  ): Stroke | undefined {
    // トランジション条件を評価
    for (const transition of current.transitions) {
      if (this.evaluateCondition(transition.condition, canvas)) {
        // appendix がある場合、Canvas に _appendix として保存
        if (transition.appendix) {
          canvas.set("_appendix", transition.appendix);
        } else {
          canvas.delete("_appendix");
        }
        return strokes.find((s) => s.name === transition.next);
      }
    }

    // デフォルト: 次のストローク（appendix クリア）
    canvas.delete("_appendix");
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
    // Conductor ステータスチェック: "status:stroke_name:expected_status"
    if (condition.startsWith("status:")) {
      const parts = condition.slice(7).split(":");
      if (parts.length === 2) {
        const [strokeName, expectedStatus] = parts;
        return canvas.get(`${strokeName}_conductor_status`) === expectedStatus;
      }
    }
    // Aggregate 条件: all("condition") / any("condition")
    const aggregateEvaluator = new AggregateEvaluator();
    if (aggregateEvaluator.isAggregate(condition)) {
      return this.evaluateAggregateCondition(condition, canvas, aggregateEvaluator);
    }
    // 等価/不等価条件: "field == value" / "field != value"
    //   1) field を Canvas のキーとして直接ルックアップ
    //   2) 直接ヒットしなければ Canvas の各文字列値から行頭 "field: <value>" を走査
    //      （merge-reviews 等が rawStdout の冒頭に "verdict: approved" を出すパターンを拾う）
    const eqMatch = condition.match(/^(\w+(?:\.\w+)*)\s*(==|!=)\s*(.+)$/);
    if (eqMatch) {
      const [, field, op, expectedRaw] = eqMatch;
      const expected = expectedRaw.trim().replace(/^["']|["']$/g, "");
      const actual = this.resolveConditionValue(field, canvas);
      const matched = actual !== undefined && String(actual) === expected;
      return op === "==" ? matched : !matched;
    }
    return true;
  }

  /**
   * 等価条件 LHS の値解決。
   * 直接 Canvas にキーがあればその値、無ければ Canvas の全文字列値から
   * 行頭 "field: <value>" を最初に見つけた値で解決する。
   */
  private resolveConditionValue(field: string, canvas: Canvas): string | undefined {
    if (canvas.has(field)) {
      const v = canvas.get<string>(field);
      if (typeof v === "string") {
        const m = v.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/);
        if (m) return m[1];
        // 値が複数行の場合は冒頭の "field: <value>" を試す（自己参照ケース）
        const selfMatch = v.match(new RegExp(`^\\s*${field}\\s*:\\s*(\\S+)`, "m"));
        if (selfMatch) return selfMatch[1];
        return v;
      }
      return v === undefined ? undefined : String(v);
    }
    // Canvas は Map ベースで挿入順を保つため、最新挿入（= 直近のストローク出力）を
    // 優先するために逆順に走査する。merge-reviews の verdict が claude/codex-review
    // の verdict と異なる場合に、最終判定（merge-reviews）の値を確実に拾うため。
    const fieldRegex = new RegExp(`^\\s*${field}\\s*:\\s*(\\S+)`, "m");
    const keys = Array.from(canvas.keys()).reverse();
    for (const key of keys) {
      const v = canvas.get<string>(key);
      if (typeof v !== "string") continue;
      const m = v.match(fieldRegex);
      if (m) return m[1];
    }
    return undefined;
  }

  /**
   * all()/any() の集約条件を評価する。
   * Canvas に保存された `{strokeName}_parallel_results` から
   * サブストローク結果 Map を復元して AggregateEvaluator に委譲する。
   */
  private evaluateAggregateCondition(
    condition: string,
    canvas: Canvas,
    evaluator: AggregateEvaluator,
  ): boolean {
    // Canvas からすべての _parallel_results を探索して評価
    // Canvas のキーを走査し、_parallel_results を持つものを取得
    const allKeys = canvas.keys();
    for (const key of allKeys) {
      if (!key.endsWith("_parallel_results")) continue;
      const raw = canvas.get<string>(key);
      if (!raw) continue;
      try {
        const resultsObj = JSON.parse(raw) as Record<string, string>;
        const subResults = new Map<string, string>(Object.entries(resultsObj));
        if (evaluator.evaluate(condition, subResults)) {
          return true;
        }
      } catch {
        // JSON パース失敗は無視
      }
    }
    return false;
  }
}
