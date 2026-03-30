/**
 * Spec Commands
 * atelier spec create/design/tasks/implement/list/show
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs/promises";
import readline from "node:readline";
import { parse as parseYaml } from "yaml";
import { CommissionRunUseCase } from "../../application/use-cases/run-commission.use-case.js";
import { createEventBus } from "../../infrastructure/event-bus/event-emitter.js";
import {
  readTextFile,
  writeTextFile,
  fileExists,
  dirExists,
  ensureDir,
  listDirs,
} from "../../infrastructure/fs/file-system.js";
import { extractTraceFromSpecs } from "../../application/services/spec-trace-extractor.js";
import { resolveAtelierPath, generateRunId } from "../../shared/utils.js";
import { STUDIO_CONFIG_FILE } from "../../shared/constants.js";
import {
  printTable,
  printSuccess,
  printError,
  printWarning,
  printInfo,
} from "../output.js";
import type { ConfigPort, VcsPort, LoggerPort } from "../../application/use-cases/run-commission.use-case.js";
import type { MediumRegistry } from "../../application/services/commission-runner.service.js";
import type { StudioConfig, MediumConfig } from "../../shared/types.js";
import { simpleGit } from "simple-git";

/** Spec のフェーズ */
type SpecPhase = "created" | "requirements" | "design" | "tasks" | "implemented";

/** spec.json の形式 */
interface SpecJson {
  id: number;
  name: string;
  description: string;
  phase: SpecPhase;
  createdAt: string;
  updatedAt: string;
}

/** スペックディレクトリのパスを解決する */
function specsDir(projectPath: string): string {
  return path.join(resolveAtelierPath(projectPath), "specs");
}

/** IDからスペックのディレクトリパスを解決する */
async function resolveSpecDir(projectPath: string, id: number): Promise<string | null> {
  const dir = specsDir(projectPath);
  if (!(await dirExists(dir))) return null;
  const entries = await fs.readdir(dir);
  const prefix = `${id}-`;
  const match = entries.find((e) => e.startsWith(prefix));
  if (!match) return null;
  return path.join(dir, match);
}

/** 全スペックを読み込む */
async function loadAllSpecs(projectPath: string): Promise<SpecJson[]> {
  const dir = specsDir(projectPath);
  if (!(await dirExists(dir))) return [];
  const dirs = await listDirs(dir);
  const specs: SpecJson[] = [];
  for (const d of dirs) {
    const jsonPath = path.join(dir, d, "spec.json");
    if (await fileExists(jsonPath)) {
      try {
        const content = await readTextFile(jsonPath);
        specs.push(JSON.parse(content) as SpecJson);
      } catch {
        // 無視
      }
    }
  }
  return specs.sort((a, b) => a.id - b.id);
}

/** 次のSpec IDを取得する */
async function nextSpecId(projectPath: string): Promise<number> {
  const specs = await loadAllSpecs(projectPath);
  if (specs.length === 0) return 1;
  return Math.max(...specs.map((s) => s.id)) + 1;
}

/** 説明文からスラッグ名を生成する */
function toSlug(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

/** spec.json を保存する */
async function saveSpecJson(specDir: string, spec: SpecJson): Promise<void> {
  spec.updatedAt = new Date().toISOString();
  await writeTextFile(path.join(specDir, "spec.json"), JSON.stringify(spec, null, 2));
}

/** spec.json を読み込む */
async function loadSpecJson(specDir: string): Promise<SpecJson> {
  const content = await readTextFile(path.join(specDir, "spec.json"));
  return JSON.parse(content) as SpecJson;
}

// ──────────────────────────────────────────────────
// Infrastructure helpers (ポート実装)
// ──────────────────────────────────────────────────

function createConfigPort(): ConfigPort {
  return {
    async loadStudioConfig(projectPath: string): Promise<StudioConfig> {
      const configPath = path.join(resolveAtelierPath(projectPath), STUDIO_CONFIG_FILE);
      const content = await readTextFile(configPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const studio = parsed.studio as Record<string, unknown>;
      return {
        defaultMedium: (studio?.default_medium as string) ?? "claude-code",
        language: (studio?.language as string) ?? "ja",
        logLevel: (studio?.log_level as StudioConfig["logLevel"]) ?? "info",
      };
    },
    async loadMediaConfig(projectPath: string): Promise<Record<string, MediumConfig>> {
      const configPath = path.join(resolveAtelierPath(projectPath), STUDIO_CONFIG_FILE);
      const content = await readTextFile(configPath);
      const parsed = parseYaml(content) as Record<string, unknown>;
      const media = (parsed.media ?? {}) as Record<string, Record<string, unknown>>;
      const result: Record<string, MediumConfig> = {};
      for (const [name, config] of Object.entries(media)) {
        result[name] = {
          command: (config.command as string) ?? name,
          args: ((config.args as string[]) ?? []),
        };
      }
      return result;
    },
  };
}

function createNoopVcsPort(): VcsPort {
  return {
    async createWorktree(basePath: string, _branchName: string): Promise<string> {
      return basePath;
    },
    async removeWorktree(_worktreePath: string): Promise<void> {},
    async commitAll(_cwd: string, _message: string): Promise<void> {},
  };
}

function createLoggerPort(): LoggerPort {
  return {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    debug: (msg: string) => {
      if (process.env.DEBUG) console.debug(`[DEBUG] ${msg}`);
    },
  };
}

async function createMediumRegistry(projectPath: string): Promise<MediumRegistry> {
  const configPort = createConfigPort();
  const mediaConfig = await configPort.loadMediaConfig(projectPath);
  return {
    getCommand(mediumName: string) {
      const config = mediaConfig[mediumName];
      return config ? { command: config.command, args: [...config.args] } : undefined;
    },
    listMedia() {
      return Object.keys(mediaConfig);
    },
  };
}

// ──────────────────────────────────────────────────
// Medium 呼び出しヘルパー
// ──────────────────────────────────────────────────

/**
 * CommissionRunUseCase を使って指定 Commission を実行する。
 * initialCanvas にコンテキストを渡す。
 */
async function runCommission(
  projectPath: string,
  commissionName: string,
  canvas: Record<string, string>,
): Promise<void> {
  const mediumRegistry = await createMediumRegistry(projectPath);
  const eventBus = createEventBus();
  const useCase = new CommissionRunUseCase(
    createConfigPort(),
    createNoopVcsPort(),
    createLoggerPort(),
    mediumRegistry,
    eventBus,
  );

  const result = await useCase.execute(commissionName, projectPath, {
    dryRun: false,
    initialCanvas: canvas,
  });

  if (result.status !== "completed") {
    const errMsgs = result.errors.map((e) => `[${e.strokeName}] ${e.message}`).join(", ");
    throw new Error(`Commission '${commissionName}' が失敗しました: ${errMsgs}`);
  }
}

// ──────────────────────────────────────────────────
// 対話入力ヘルパー
// ──────────────────────────────────────────────────

/** 対話的に複数行の説明文を入力させる（空行で確定） */
async function promptDescription(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const lines: string[] = [];

  console.log(chalk.cyan("説明を入力してください（空行で確定）:"));

  return new Promise((resolve) => {
    rl.on("line", (line) => {
      if (line.trim() === "" && lines.length > 0) {
        rl.close();
        resolve(lines.join("\n"));
      } else if (line.trim() !== "" || lines.length > 0) {
        lines.push(line);
      }
    });
  });
}

// ──────────────────────────────────────────────────
// コマンド定義
// ──────────────────────────────────────────────────

export function createSpecCommand(): Command {
  const spec = new Command("spec")
    .description("仕様書（Spec）の管理・生成");

  // ── spec create [description] ──────────────────
  spec
    .command("create [description]")
    .description("説明文から仕様書を作成し requirements.md を生成する（引数省略で対話入力）")
    .option("--medium <name>", "使用する Medium を指定")
    .action(async (description: string | undefined, _opts) => {
      // 引数がない場合は対話入力モード
      if (!description) {
        description = await promptDescription();
        if (!description.trim()) {
          printError("説明文が入力されませんでした");
          process.exitCode = 1;
          return;
        }
      }
      const projectPath = process.cwd();
      const spinner = ora("仕様書を作成中...").start();

      try {
        // 1. spec.json を生成
        const id = await nextSpecId(projectPath);
        const slug = toSlug(description);
        const dirName = `${id}-${slug}`;
        const dir = path.join(specsDir(projectPath), dirName);
        await ensureDir(dir);

        const specData: SpecJson = {
          id,
          name: slug,
          description,
          phase: "created",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveSpecJson(dir, specData);

        spinner.text = "requirements.md を生成中...";

        // 2. Medium 呼び出し（spec-requirements stroke だけの Commission を使う）
        //    spec_dir を canvas に渡して保存先を伝える
        await runCommission(projectPath, "spec-driven", {
          requirements: description,
          spec_dir: dirName,
        });

        // 3. phase を更新
        specData.phase = "requirements";
        await saveSpecJson(dir, specData);

        spinner.stop();
        printSuccess(`Spec #${id} 作成完了: .atelier/specs/${dirName}`);
      } catch (error) {
        spinner.fail("仕様書の作成に失敗しました");
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  // ── spec design <id> ──────────────────────────
  spec
    .command("design <id>")
    .description("指定IDの requirements.md を読み込み design.md を生成する")
    .action(async (idStr: string) => {
      const projectPath = process.cwd();
      const id = parseInt(idStr, 10);
      if (isNaN(id) || id < 1) {
        printError("ID には正の整数を指定してください");
        process.exitCode = 1;
        return;
      }

      const spinner = ora(`Spec #${id} のデザインを生成中...`).start();

      try {
        const dir = await resolveSpecDir(projectPath, id);
        if (!dir) {
          spinner.fail(`Spec #${id} が見つかりません`);
          process.exitCode = 1;
          return;
        }

        const reqPath = path.join(dir, "requirements.md");
        if (!(await fileExists(reqPath))) {
          spinner.fail("requirements.md が見つかりません。先に spec create を実行してください");
          process.exitCode = 1;
          return;
        }

        const requirements = await readTextFile(reqPath);
        const specData = await loadSpecJson(dir);
        const dirName = path.basename(dir);

        await runCommission(projectPath, "spec-driven", {
          requirements,
          spec_dir: dirName,
        });

        specData.phase = "design";
        await saveSpecJson(dir, specData);

        spinner.stop();
        printSuccess(`Spec #${id} のデザイン生成完了: .atelier/specs/${dirName}/design.md`);
      } catch (error) {
        spinner.fail("デザインの生成に失敗しました");
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  // ── spec tasks <id> ──────────────────────────
  spec
    .command("tasks <id>")
    .description("requirements.md + design.md を読み込み tasks.md を生成する")
    .action(async (idStr: string) => {
      const projectPath = process.cwd();
      const id = parseInt(idStr, 10);
      if (isNaN(id) || id < 1) {
        printError("ID には正の整数を指定してください");
        process.exitCode = 1;
        return;
      }

      const spinner = ora(`Spec #${id} のタスクを生成中...`).start();

      try {
        const dir = await resolveSpecDir(projectPath, id);
        if (!dir) {
          spinner.fail(`Spec #${id} が見つかりません`);
          process.exitCode = 1;
          return;
        }

        const reqPath = path.join(dir, "requirements.md");
        const designPath = path.join(dir, "design.md");

        if (!(await fileExists(reqPath))) {
          spinner.fail("requirements.md が見つかりません");
          process.exitCode = 1;
          return;
        }
        if (!(await fileExists(designPath))) {
          spinner.fail("design.md が見つかりません。先に spec design を実行してください");
          process.exitCode = 1;
          return;
        }

        const requirements = await readTextFile(reqPath);
        const design = await readTextFile(designPath);
        const specData = await loadSpecJson(dir);
        const dirName = path.basename(dir);

        await runCommission(projectPath, "spec-driven", {
          requirements,
          design,
          spec_dir: dirName,
        });

        specData.phase = "tasks";
        await saveSpecJson(dir, specData);

        spinner.stop();
        printSuccess(`Spec #${id} のタスク生成完了: .atelier/specs/${dirName}/tasks.md`);
      } catch (error) {
        spinner.fail("タスクの生成に失敗しました");
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  // ── spec implement <id> ──────────────────────
  spec
    .command("implement <id>")
    .description("tasks.md を読み込み implement→test→review Commission を実行する")
    .action(async (idStr: string) => {
      const projectPath = process.cwd();
      const id = parseInt(idStr, 10);
      if (isNaN(id) || id < 1) {
        printError("ID には正の整数を指定してください");
        process.exitCode = 1;
        return;
      }

      const spinner = ora(`Spec #${id} の実装を開始中...`).start();

      try {
        const dir = await resolveSpecDir(projectPath, id);
        if (!dir) {
          spinner.fail(`Spec #${id} が見つかりません`);
          process.exitCode = 1;
          return;
        }

        const tasksPath = path.join(dir, "tasks.md");
        if (!(await fileExists(tasksPath))) {
          spinner.fail("tasks.md が見つかりません。先に spec tasks を実行してください");
          process.exitCode = 1;
          return;
        }

        const tasks = await readTextFile(tasksPath);
        const specData = await loadSpecJson(dir);
        const dirName = path.basename(dir);

        // 仕様書を canvas にセット
        const canvas: Record<string, string> = {
          task: `以下のタスク一覧に基づいて実装してください:\n\n${tasks}`,
          tasks,
          spec_dir: dirName,
        };
        const designPath = path.join(dir, "design.md");
        if (await fileExists(designPath)) {
          canvas.design = await readTextFile(designPath);
        }
        const reqPath = path.join(dir, "requirements.md");
        if (await fileExists(reqPath)) {
          canvas.requirements = await readTextFile(reqPath);
        }

        await runCommission(projectPath, "default", canvas);

        specData.phase = "implemented";
        await saveSpecJson(dir, specData);

        spinner.stop();
        printSuccess(`Spec #${id} の実装完了`);
      } catch (error) {
        spinner.fail("実装に失敗しました");
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  // ── spec list ─────────────────────────────────
  spec
    .command("list")
    .description(".atelier/specs/ 配下の全 spec を一覧表示する")
    .action(async () => {
      const projectPath = process.cwd();

      try {
        const specs = await loadAllSpecs(projectPath);

        if (specs.length === 0) {
          printWarning("Spec が見つかりません。atelier spec create で作成してください");
          return;
        }

        const phaseColor = (phase: SpecPhase): string => {
          switch (phase) {
            case "implemented":
              return chalk.green(phase);
            case "tasks":
              return chalk.cyan(phase);
            case "design":
              return chalk.blue(phase);
            case "requirements":
              return chalk.yellow(phase);
            default:
              return chalk.white(phase);
          }
        };

        const rows = specs.map((s) => [
          String(s.id),
          s.name,
          phaseColor(s.phase),
          new Date(s.updatedAt).toLocaleDateString("ja-JP"),
        ]);

        printTable(["ID", "名前", "フェーズ", "更新日"], rows);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  // ── spec show <id> ────────────────────────────
  spec
    .command("show <id>")
    .description("指定 spec の詳細を表示する（spec.json + ファイル一覧）")
    .action(async (idStr: string) => {
      const projectPath = process.cwd();
      const id = parseInt(idStr, 10);
      if (isNaN(id) || id < 1) {
        printError("ID には正の整数を指定してください");
        process.exitCode = 1;
        return;
      }

      try {
        const dir = await resolveSpecDir(projectPath, id);
        if (!dir) {
          printError(`Spec #${id} が見つかりません`);
          process.exitCode = 1;
          return;
        }

        const specData = await loadSpecJson(dir);
        const dirName = path.basename(dir);

        console.log();
        console.log(chalk.bold(`Spec #${specData.id}: ${specData.name}`));
        console.log(chalk.dim("─".repeat(50)));
        printInfo(`説明:    ${specData.description}`);
        printInfo(`フェーズ: ${specData.phase}`);
        printInfo(`作成日:  ${new Date(specData.createdAt).toLocaleString("ja-JP")}`);
        printInfo(`更新日:  ${new Date(specData.updatedAt).toLocaleString("ja-JP")}`);
        printInfo(`パス:    .atelier/specs/${dirName}`);
        console.log();

        // ファイル一覧
        const candidates = ["requirements.md", "design.md", "tasks.md", "spec.json"];
        const existing: string[] = [];
        for (const f of candidates) {
          if (await fileExists(path.join(dir, f))) {
            existing.push(f);
          }
        }

        if (existing.length > 0) {
          console.log(chalk.bold("ファイル:"));
          for (const f of existing) {
            console.log(`  ${chalk.cyan(f)}`);
          }
          console.log();
        }

        // ── トレーサビリティ表示 ──
        const reqPath = path.join(dir, "requirements.md");
        const designPath = path.join(dir, "design.md");
        const tasksPath = path.join(dir, "tasks.md");

        const hasReq = await fileExists(reqPath);

        if (hasReq) {
          const reqContent = await readTextFile(reqPath);
          const designContent = (await fileExists(designPath))
            ? await readTextFile(designPath)
            : null;
          const tasksContent = (await fileExists(tasksPath))
            ? await readTextFile(tasksPath)
            : null;

          const trace = extractTraceFromSpecs(reqContent, designContent, tasksContent);

          if (trace.requirements.length > 0) {
            console.log(chalk.bold("=== トレーサビリティ ==="));
            console.log();

            // 各要件のカバー状況を判定
            const designCoveredIds = new Set(trace.designMappings.map((d) => d.reqId));
            const taskCoveredIds = new Set<string>();
            for (const tm of trace.taskMappings) {
              for (const rid of tm.reqIds) {
                taskCoveredIds.add(rid);
              }
            }

            console.log(chalk.bold("要件カバレッジ:"));
            const rows = trace.requirements.map((req) => {
              const hasDesign = designContent !== null
                ? (designCoveredIds.has(req.id) ? chalk.green("✓") : chalk.dim("-"))
                : chalk.dim("（未生成）");
              const hasTask = tasksContent !== null
                ? (taskCoveredIds.has(req.id) ? chalk.green("✓") : chalk.dim("-"))
                : chalk.dim("（未生成）");
              return [req.id, req.name, hasDesign, hasTask];
            });

            printTable(["要件#", "要件名", "設計", "タスク"], rows);
            console.log();

            // 未カバー要件の警告
            const uncovered = trace.requirements.filter((req) => {
              const inDesign = designContent === null || designCoveredIds.has(req.id);
              const inTask = tasksContent === null || taskCoveredIds.has(req.id);
              return !inDesign || !inTask;
            });

            for (const req of uncovered) {
              const missingParts: string[] = [];
              if (designContent !== null && !designCoveredIds.has(req.id)) {
                missingParts.push("設計");
              }
              if (tasksContent !== null && !taskCoveredIds.has(req.id)) {
                missingParts.push("タスク");
              }
              if (missingParts.length > 0) {
                printWarning(
                  `未カバー要件: #${req.id} ${req.name}（${missingParts.join("・")}なし）`,
                );
              }
            }
            console.log();
          }
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  return spec;
}
