/**
 * Catalog Command
 * atelier catalog で利用可能な全ファセットリソースを一覧表示する。
 */

import { Command } from "commander";
import path from "node:path";
import { COLORS } from "../theme.js";
import {
  listBuiltinPalettes,
  listBuiltinPolicies,
  listBuiltinCommissions,
} from "../../builtin/index.js";
import { resolveAtelierPath } from "../../shared/utils.js";
import { listFiles } from "../../infrastructure/fs/file-system.js";
import {
  PALETTES_DIR,
  POLICIES_DIR,
  KNOWLEDGE_DIR,
  INSTRUCTIONS_DIR,
  CONTRACTS_DIR,
  COMMISSIONS_DIR,
} from "../../shared/constants.js";
import { printInfo, printTable } from "../output.js";

/** カテゴリ定義 */
interface CategoryDef {
  readonly name: string;
  readonly label: string;
  readonly dir: string;
  readonly ext: string;
  readonly listBuiltin: () => readonly string[];
}

/** ビルトインの Knowledge 一覧 */
const BUILTIN_KNOWLEDGE = [
  "architecture",
  "backend",
  "frontend",
  "security",
  "testing",
] as const;

/** ビルトインの Instruction 一覧 */
const BUILTIN_INSTRUCTIONS = [
  "design",
  "fix",
  "implement",
  "plan",
  "review",
  "security-review",
  "test",
] as const;

/** ビルトインの Contract 一覧 */
const BUILTIN_CONTRACTS = [
  "design-output",
  "implementation-output",
  "plan-output",
  "review-output",
  "security-review-output",
  "test-output",
] as const;

const CATEGORIES: readonly CategoryDef[] = [
  {
    name: "palettes",
    label: "Palettes",
    dir: PALETTES_DIR,
    ext: ".yaml",
    listBuiltin: listBuiltinPalettes,
  },
  {
    name: "policies",
    label: "Policies",
    dir: POLICIES_DIR,
    ext: ".yaml",
    listBuiltin: listBuiltinPolicies,
  },
  {
    name: "knowledge",
    label: "Knowledge",
    dir: KNOWLEDGE_DIR,
    ext: ".md",
    listBuiltin: () => [...BUILTIN_KNOWLEDGE],
  },
  {
    name: "instructions",
    label: "Instructions",
    dir: INSTRUCTIONS_DIR,
    ext: ".md",
    listBuiltin: () => [...BUILTIN_INSTRUCTIONS],
  },
  {
    name: "contracts",
    label: "Contracts",
    dir: CONTRACTS_DIR,
    ext: ".yaml",
    listBuiltin: () => [...BUILTIN_CONTRACTS],
  },
  {
    name: "commissions",
    label: "Commissions",
    dir: COMMISSIONS_DIR,
    ext: ".yaml",
    listBuiltin: listBuiltinCommissions,
  },
];

/**
 * 指定カテゴリのリソース一覧を表示する。
 */
async function showCategory(category: CategoryDef): Promise<void> {
  const projectPath = process.cwd();
  const atelierPath = resolveAtelierPath(projectPath);

  // ビルトイン
  const builtinNames = category.listBuiltin() as readonly string[];

  // プロジェクト固有
  const projectDir = path.join(atelierPath, category.dir);
  const projectFiles = await listFiles(projectDir, category.ext);
  const projectNames = projectFiles.map((f) =>
    path.basename(f, category.ext),
  );

  // ビルトイン名のセット
  const builtinSet = new Set(builtinNames);

  // テーブル行を構築
  const rows: string[][] = [];

  for (const name of builtinNames) {
    const overridden = projectNames.includes(name);
    const source = overridden
      ? COLORS.warning("project (override)")
      : COLORS.muted("builtin");
    rows.push([name, source]);
  }

  // プロジェクト固有のみのリソース
  for (const name of projectNames) {
    if (!builtinSet.has(name)) {
      rows.push([name, COLORS.success("project")]);
    }
  }

  if (rows.length === 0) {
    console.log(COLORS.muted("  (none)"));
    return;
  }

  printTable(["Name", "Source"], rows);
}

export function createCatalogCommand(): Command {
  const catalog = new Command("catalog")
    .description("利用可能なファセットリソースを一覧表示する")
    .argument("[category]", "カテゴリ名 (palettes, policies, knowledge, instructions, contracts, commissions)")
    .action(async (categoryName?: string) => {
      if (categoryName) {
        const category = CATEGORIES.find((c) => c.name === categoryName);
        if (!category) {
          console.error(
            COLORS.error(
              `不明なカテゴリ: ${categoryName}\n利用可能: ${CATEGORIES.map((c) => c.name).join(", ")}`,
            ),
          );
          process.exitCode = 1;
          return;
        }
        console.log();
        printInfo(category.label);
        console.log();
        await showCategory(category);
        console.log();
      } else {
        // 全カテゴリを表示
        for (const category of CATEGORIES) {
          console.log();
          printInfo(category.label);
          console.log();
          await showCategory(category);
        }
        console.log();
      }
    });

  return catalog;
}
