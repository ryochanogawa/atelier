/**
 * CommissionRunner Service
 * Commission 実行のオーケストレーション。ユースケースから呼ばれる。
 */

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import { Stroke, type StrokeDefinition, type ArpeggioConfig, type ParallelSubStroke } from "../../domain/models/stroke.model.js";
import { Canvas } from "../../domain/models/canvas.model.js";
import { AggregateEvaluator } from "../../domain/services/aggregate-evaluator.service.js";
import { StrokeStatus } from "../../domain/value-objects/stroke-status.vo.js";
import { CommissionStatus } from "../../domain/value-objects/commission-status.vo.js";
import type { CommissionDefinition, LoopMonitorYaml, RunOptions } from "../../shared/types.js";
import type { RunErrorDto } from "../dto/run-result.dto.js";
import type { TypedEventEmitter, AtelierEvents } from "../../infrastructure/event-bus/event-emitter.js";
import { runSubprocess } from "../../infrastructure/process/subprocess.js";
import { readTextFile, fileExists } from "../../infrastructure/fs/file-system.js";
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

export interface MediumRegistry {
  getCommand(mediumName: string): { command: string; args: readonly string[] } | undefined;
  listMedia(): string[];
}

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
  readonly mediumRegistry: MediumRegistry;
  readonly defaultMedium: string;
  readonly cwd: string;
  readonly projectPath: string;
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
    // 初期値を Canvas に注入（要件定義等）
    if (options.initialCanvas) {
      for (const [key, value] of Object.entries(options.initialCanvas)) {
        canvas.set(key, value);
      }
    }
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

    let currentStroke: Stroke | undefined = strokes[0];

    while (currentStroke && !currentStroke.isTerminal) {
      // ループ先頭で確定参照を取得（TypeScript narrowing 維持用）
      const activeStroke: Stroke = currentStroke;

      this.deps.eventBus.emit("stroke:start", {
        runId,
        strokeName: activeStroke.name,
      });

      const strokeStart = Date.now();

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

    const args = [...mediumConfig.args];
    // -p (--print) がなければ追加（Commission は常に非インタラクティブ）
    if (!args.includes("--print") && !args.includes("-p")) {
      args.unshift("-p");
    }
    // allow_edit の場合、ファイル編集ツールを許可
    if (stroke.allowEdit && !args.includes("--allowedTools")) {
      args.push("--allowedTools", "Edit", "Write", "Read", "Glob", "Grep", "Bash");
    }

    // Persona（system prompt）をプロンプト本文の先頭に含める
    // （--append-system-prompt は execa 経由だとシェル展開の問題があるため）
    const fullPrompt = systemPrompt
      ? `[Persona]\n${systemPrompt}\n\n${userPrompt}`
      : userPrompt;

    // プロンプトを一時ファイルに書き出し、cat でパイプする
    // （引数で渡すとOS制限、stdin だとツールが使えない問題を回避）
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-"));
    const promptFile = path.join(tmpDir, "prompt.md");
    await fs.writeFile(promptFile, fullPrompt, "utf-8");

    const escapeShell = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const shellCmd = `cat ${escapeShell(promptFile)} | ${mediumConfig.command} ${args.map(escapeShell).join(" ")}`;

    console.error(`[stroke:${stroke.name}] executing: ${shellCmd.slice(0, 300)}...`);

    let result;
    try {
      result = await runSubprocess(
        "bash",
        ["-c", shellCmd],
        { cwd: this.deps.cwd, timeout: 600_000 },
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    this.deps.eventBus.emit("medium:response", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
      duration: result.duration,
    });

    // 実行結果をログ出力
    console.error(`\n[stroke:${stroke.name}] completed (exitCode=${result.exitCode}, ${result.stdout.length} chars, ${Math.round(result.duration / 1000)}s)`);

    // stdout の内容を表示（途中経過）
    if (result.stdout.length > 0) {
      const preview = result.stdout.length > 2000
        ? result.stdout.slice(0, 2000) + `\n... (${result.stdout.length} chars total)`
        : result.stdout;
      console.error(`[stroke:${stroke.name}] output:\n${preview}\n`);
    }

    // stderr があれば表示
    if (result.stderr.length > 0) {
      console.error(`[stroke:${stroke.name}] stderr: ${result.stderr.slice(0, 500)}`);
    }

    // 非ゼロ終了コードはエラーとして扱う
    if (result.exitCode !== 0) {
      throw new Error(
        `Medium exited with code ${result.exitCode}: ${result.stderr.slice(0, 500) || result.stdout.slice(0, 500)}`,
      );
    }

    // 結果を Canvas に格納
    for (const outputKey of stroke.outputs) {
      canvas.set(outputKey, result.stdout);
    }

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

    // Medium 設定を取得
    const mediumConfig = this.deps.mediumRegistry.getCommand(stroke.medium);
    if (!mediumConfig) {
      throw new Error(`Medium not found: ${stroke.medium}`);
    }

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

        const subStart = Date.now();

        const result = await this.runMediumWithPrompt(
          fullPrompt,
          mediumConfig,
          stroke.medium,
          `${stroke.name}.${sub.name}`,
          stroke.allowEdit,
          `atelier-parallel-${sub.name}-`,
        );

        this.deps.eventBus.emit("medium:response", {
          runId,
          mediumName: stroke.medium,
          strokeName: `${stroke.name}.${sub.name}`,
          duration: Date.now() - subStart,
        });

        console.error(`[parallel:${stroke.name}.${sub.name}] completed (exitCode=${result.exitCode}, ${result.stdout.length} chars)`);

        if (result.exitCode !== 0) {
          throw new Error(
            `Sub-stroke ${sub.name} failed (exitCode=${result.exitCode}): ${result.stderr.slice(0, 500) || result.stdout.slice(0, 500)}`,
          );
        }

        return { name: sub.name, output: result.stdout };
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

    // Medium 設定を取得
    const mediumConfig = this.deps.mediumRegistry.getCommand(stroke.medium);
    if (!mediumConfig) {
      throw new Error(`Medium not found: ${stroke.medium}`);
    }

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

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-arpeggio-"));
      const promptFile = path.join(tmpDir, "prompt.md");
      await fs.writeFile(promptFile, fullPrompt, "utf-8");

      const args = [...mediumConfig.args];
      if (!args.includes("--print") && !args.includes("-p")) {
        args.unshift("-p");
      }
      if (stroke.allowEdit && !args.includes("--allowedTools")) {
        args.push("--allowedTools", "Edit", "Write", "Read", "Glob", "Grep", "Bash");
      }

      const escapeShell = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
      const shellCmd = `cat ${escapeShell(promptFile)} | ${mediumConfig.command} ${args.map(escapeShell).join(" ")}`;

      try {
        const result = await runSubprocess(
          "bash",
          ["-c", shellCmd],
          { cwd: this.deps.cwd, timeout: 600_000 },
        );

        if (result.exitCode !== 0) {
          throw new Error(
            `Medium exited with code ${result.exitCode}: ${result.stderr.slice(0, 500) || result.stdout.slice(0, 500)}`,
          );
        }

        return result.stdout;
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
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

    const mediumConfig = this.deps.mediumRegistry.getCommand(stroke.medium);
    if (!mediumConfig) {
      throw new Error(`Medium not found: ${stroke.medium}`);
    }

    this.deps.eventBus.emit("medium:request", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
    });

    // Phase 1: リーダーにタスク分解を依頼
    const leaderResult = await this.runMediumWithPrompt(
      decompositionPrompt,
      mediumConfig,
      stroke.medium,
      stroke.name,
      false, // allow_edit = false for decomposition
      `atelier-team-leader-`,
    );

    this.deps.eventBus.emit("medium:response", {
      runId,
      mediumName: stroke.medium,
      strokeName: stroke.name,
      duration: leaderResult.duration,
    });

    console.error(`[team-leader:${stroke.name}] Phase 1 decomposition completed (${leaderResult.stdout.length} chars)`);

    if (leaderResult.exitCode !== 0) {
      throw new Error(
        `Team leader decomposition failed (exitCode=${leaderResult.exitCode}): ${leaderResult.stderr.slice(0, 500) || leaderResult.stdout.slice(0, 500)}`,
      );
    }

    // [SUBTASK] タグでサブタスクを抽出
    const subtasks = this.extractSubtasks(leaderResult.stdout, maxParts);

    if (subtasks.length === 0) {
      // サブタスクが抽出できなかった場合、全体の出力をそのまま結果とする
      console.error(`[team-leader:${stroke.name}] No subtasks found, using full output as result`);
      for (const outputKey of stroke.outputs) {
        canvas.set(outputKey, leaderResult.stdout);
      }
      stroke.transitionTo(StrokeStatus.Completed);
      return;
    }

    console.error(`[team-leader:${stroke.name}] Phase 1 extracted ${subtasks.length} subtasks`);

    // === Phase 2: 各サブタスクを並列実行 ===
    const workerMediumName = teamLeader.partMedium ?? stroke.medium;
    const workerMediumConfig = this.deps.mediumRegistry.getCommand(workerMediumName);
    if (!workerMediumConfig) {
      throw new Error(`Medium not found for team leader worker: ${workerMediumName}`);
    }

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

        const workerStart = Date.now();

        const result = await this.runMediumWithPrompt(
          workerPrompt,
          workerMediumConfig,
          workerMediumName,
          `${stroke.name}.worker-${index}`,
          workerAllowEdit,
          `atelier-worker-${index}-`,
        );

        this.deps.eventBus.emit("medium:response", {
          runId,
          mediumName: workerMediumName,
          strokeName: `${stroke.name}.worker-${index}`,
          duration: Date.now() - workerStart,
        });

        console.error(`[team-leader:${stroke.name}] worker-${index} completed (exitCode=${result.exitCode}, ${result.stdout.length} chars)`);

        if (result.exitCode !== 0) {
          throw new Error(
            `Worker ${index} failed (exitCode=${result.exitCode}): ${result.stderr.slice(0, 500) || result.stdout.slice(0, 500)}`,
          );
        }

        return {
          index,
          subtask,
          output: result.stdout,
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
   * Medium を通じてプロンプトを実行する共通メソッド。
   * Team Leader のリーダーと各 worker で共用する。
   */
  private async runMediumWithPrompt(
    fullPrompt: string,
    mediumConfig: { command: string; args: readonly string[] },
    mediumName: string,
    logLabel: string,
    allowEdit: boolean,
    tmpPrefix: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number; duration: number }> {
    const args = [...mediumConfig.args];
    if (!args.includes("--print") && !args.includes("-p")) {
      args.unshift("-p");
    }
    if (allowEdit && !args.includes("--allowedTools")) {
      args.push("--allowedTools", "Edit", "Write", "Read", "Glob", "Grep", "Bash");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), tmpPrefix));
    const promptFile = path.join(tmpDir, "prompt.md");
    await fs.writeFile(promptFile, fullPrompt, "utf-8");

    const escapeShell = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const shellCmd = `cat ${escapeShell(promptFile)} | ${mediumConfig.command} ${args.map(escapeShell).join(" ")}`;

    console.error(`[${logLabel}] executing: ${shellCmd.slice(0, 300)}...`);

    try {
      const result = await runSubprocess(
        "bash",
        ["-c", shellCmd],
        { cwd: this.deps.cwd, timeout: 600_000 },
      );

      if (result.stdout.length > 0) {
        const preview = result.stdout.length > 2000
          ? result.stdout.slice(0, 2000) + `\n... (${result.stdout.length} chars total)`
          : result.stdout;
        console.error(`[${logLabel}] output:\n${preview}\n`);
      }

      if (result.stderr.length > 0) {
        console.error(`[${logLabel}] stderr: ${result.stderr.slice(0, 500)}`);
      }

      return result;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
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
    parts.push(resolvedInstruction);

    // 4. Contract: 出力契約のフォーマットを配置（Instruction と Policy の間）
    if (stroke.contract) {
      const contractContent = await this.loadContractFormat(stroke.contract, canvas);
      if (contractContent) {
        parts.push(`[Output Contract]\n${contractContent}`);
      }
    }

    // 5. Policy: Palette のポリシーを末尾に配置（recency effect 活用）
    if (palette?.policies && palette.policies.length > 0) {
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
   */
  private expandTemplateVariables(template: string, canvas: Canvas): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
      const value = canvas.get<string>(key);
      return value !== undefined ? value : `{{${key}}}`;
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

    // テンプレート変数 {{variable}} を Canvas の値で展開
    return contract.format.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
      const value = canvas.get<string>(key);
      return value !== undefined ? value : `{{${key}}}`;
    });
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
      this.deps.mediumRegistry,
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
    return true;
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
