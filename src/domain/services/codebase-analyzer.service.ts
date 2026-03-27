/**
 * CodebaseAnalyzerService Domain Service
 * レガシーシステム統合支援のためのコードベース分析サービス。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import type {
  CodebaseStructure,
  DependencyGraph,
  Dependency,
  FileComplexity,
  TodoComment,
  MigrationPlan,
  MigrationPhase,
} from "../value-objects/codebase-analysis.vo.js";

/** スタック検出用のファイルマッピング */
const STACK_INDICATORS: Record<string, string[]> = {
  "package.json": ["Node.js", "JavaScript/TypeScript"],
  "tsconfig.json": ["TypeScript"],
  "go.mod": ["Go"],
  "requirements.txt": ["Python"],
  "Pipfile": ["Python"],
  "pyproject.toml": ["Python"],
  "Cargo.toml": ["Rust"],
  "pom.xml": ["Java", "Maven"],
  "build.gradle": ["Java/Kotlin", "Gradle"],
  "Gemfile": ["Ruby"],
  "composer.json": ["PHP"],
  "Dockerfile": ["Docker"],
  "docker-compose.yml": ["Docker Compose"],
  "docker-compose.yaml": ["Docker Compose"],
  ".github/workflows": ["GitHub Actions"],
  "Makefile": ["Make"],
};

/** エントリポイント候補 */
const ENTRY_POINT_PATTERNS = [
  "src/index.ts",
  "src/index.js",
  "src/main.ts",
  "src/main.js",
  "index.ts",
  "index.js",
  "main.ts",
  "main.js",
  "main.go",
  "cmd/main.go",
  "app.py",
  "main.py",
  "manage.py",
  "src/main.rs",
  "src/lib.rs",
];

/** 設定ファイルパターン */
const CONFIG_PATTERNS = [
  "package.json",
  "tsconfig.json",
  "tsconfig.*.json",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.json",
  "eslint.config.js",
  "eslint.config.mjs",
  ".prettierrc",
  "prettier.config.js",
  "jest.config.ts",
  "jest.config.js",
  "vitest.config.ts",
  "vite.config.ts",
  "webpack.config.js",
  "rollup.config.js",
  ".babelrc",
  "babel.config.js",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Makefile",
  ".env.example",
  ".gitignore",
];

/** 無視するディレクトリ */
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  ".atelier",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  "target",
]);

export class CodebaseAnalyzerService {
  /**
   * ディレクトリのコードベース構造を分析する。
   */
  async analyzeStructure(workingDir: string): Promise<CodebaseStructure> {
    const filesByExtension: Record<string, number> = {};
    const linesByExtension: Record<string, number> = {};
    const detectedStack: Set<string> = new Set();
    const entryPoints: string[] = [];
    const configFiles: string[] = [];
    let totalFiles = 0;
    let totalLines = 0;

    // 再帰的にファイルを走査
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(workingDir, fullPath);

        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name)) {
            // GitHub Actions ディレクトリ検出
            if (relativePath === ".github/workflows") {
              detectedStack.add("GitHub Actions");
            }
            await walk(fullPath);
          }
          continue;
        }

        if (!entry.isFile()) continue;

        totalFiles++;
        const ext = path.extname(entry.name) || "(no ext)";
        filesByExtension[ext] = (filesByExtension[ext] ?? 0) + 1;

        // 行数カウント
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const lineCount = content.split("\n").length;
          totalLines += lineCount;
          linesByExtension[ext] = (linesByExtension[ext] ?? 0) + lineCount;
        } catch {
          // バイナリファイル等は無視
        }

        // スタック検出
        if (STACK_INDICATORS[entry.name]) {
          for (const stack of STACK_INDICATORS[entry.name]) {
            detectedStack.add(stack);
          }
        }

        // エントリポイント検出
        if (ENTRY_POINT_PATTERNS.includes(relativePath)) {
          entryPoints.push(relativePath);
        }

        // 設定ファイル検出
        if (CONFIG_PATTERNS.includes(entry.name)) {
          configFiles.push(relativePath);
        }
      }
    };

    await walk(workingDir);

    return {
      rootDir: workingDir,
      totalFiles,
      totalLines,
      filesByExtension,
      linesByExtension,
      detectedStack: [...detectedStack].sort(),
      entryPoints: entryPoints.sort(),
      configFiles: configFiles.sort(),
    };
  }

  /**
   * 依存関係グラフを構築する。
   */
  async analyzeDependencies(workingDir: string): Promise<DependencyGraph> {
    const packageJsonPath = path.join(workingDir, "package.json");
    const direct: Dependency[] = [];
    const outdated: Dependency[] = [];
    const vulnerable: Dependency[] = [];
    let transitive = 0;

    try {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content) as Record<string, unknown>;

      // 直接依存を収集
      const deps = (pkg.dependencies ?? {}) as Record<string, string>;
      const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;

      for (const [name, version] of Object.entries(deps)) {
        direct.push({ name, version, isOutdated: false });
      }
      for (const [name, version] of Object.entries(devDeps)) {
        direct.push({ name, version, isOutdated: false });
      }

      // npm outdated で古い依存を検出
      try {
        const result = await execa("npm", ["outdated", "--json"], {
          cwd: workingDir,
          reject: false,
        });
        if (result.stdout) {
          const outdatedData = JSON.parse(result.stdout) as Record<
            string,
            { current: string; wanted: string; latest: string }
          >;
          for (const [name, info] of Object.entries(outdatedData)) {
            outdated.push({
              name,
              version: info.current,
              latest: info.latest,
              isOutdated: true,
            });
          }
        }
      } catch {
        // npm outdated が利用できない場合は無視
      }

      // npm audit で脆弱な依存を検出
      try {
        const result = await execa("npm", ["audit", "--json"], {
          cwd: workingDir,
          reject: false,
        });
        if (result.stdout) {
          const auditData = JSON.parse(result.stdout) as {
            vulnerabilities?: Record<
              string,
              { name: string; severity: string; range: string }
            >;
          };
          if (auditData.vulnerabilities) {
            for (const [name, info] of Object.entries(
              auditData.vulnerabilities,
            )) {
              vulnerable.push({
                name,
                version: info.range,
                isOutdated: false,
              });
            }
          }
        }
      } catch {
        // npm audit が利用できない場合は無視
      }

      // 推移的依存の数を推定（package-lock.json から）
      try {
        const lockPath = path.join(workingDir, "package-lock.json");
        const lockContent = await fs.readFile(lockPath, "utf-8");
        const lock = JSON.parse(lockContent) as {
          packages?: Record<string, unknown>;
        };
        if (lock.packages) {
          // ルートパッケージ("") と直接依存を除いた数
          transitive = Math.max(
            0,
            Object.keys(lock.packages).length - 1 - direct.length,
          );
        }
      } catch {
        // lockfile がない場合は 0
      }
    } catch {
      // package.json がない場合は空のグラフを返す
    }

    return { direct, transitive, outdated, vulnerable };
  }

  /**
   * ファイルの複雑度を分析する。
   */
  analyzeComplexity(filePath: string, content: string): FileComplexity {
    const lines = content.split("\n");
    const lineCount = lines.length;

    // インポート文カウント
    const importPattern =
      /^(?:import\s|const\s+\w+\s*=\s*require\(|from\s+['"]|require\()/;
    const imports = lines.filter((l) => importPattern.test(l.trim())).length;

    // 関数カウント（簡易推定）
    const functionPattern =
      /(?:function\s+\w+|(?:async\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>|(?:async\s+)?(?:\w+)\s*\([^)]*\)\s*\{|(?:async\s+)?(?:\w+)\s*\([^)]*\)\s*:\s*\w)/;
    const functions = lines.filter((l) => functionPattern.test(l.trim())).length;

    // クラスカウント
    const classPattern = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+\w+/;
    const classes = lines.filter((l) => classPattern.test(l)).length;

    // TODO/FIXME/HACK/XXX コメント検出
    const todoPattern =
      /(?:\/\/|\/\*|#)\s*(TODO|FIXME|HACK|XXX)\b[:\s]*(.*)/i;
    const todos: TodoComment[] = [];
    for (let i = 0; i < lines.length; i++) {
      const match = todoPattern.exec(lines[i]);
      if (match) {
        todos.push({
          line: i + 1,
          type: match[1].toUpperCase() as TodoComment["type"],
          text: match[2].trim(),
        });
      }
    }

    // 複雑度スコア計算 (0-100)
    // 大きいファイル、多くのインポート、多くのTODOでスコアが上がる
    let score = 0;
    if (lineCount > 500) score += 30;
    else if (lineCount > 200) score += 20;
    else if (lineCount > 100) score += 10;

    if (imports > 20) score += 25;
    else if (imports > 10) score += 15;
    else if (imports > 5) score += 5;

    if (functions > 20) score += 20;
    else if (functions > 10) score += 10;
    else if (functions > 5) score += 5;

    if (classes > 5) score += 15;
    else if (classes > 2) score += 10;
    else if (classes > 0) score += 5;

    score += Math.min(10, todos.length * 2);

    return {
      filePath,
      lines: lineCount,
      imports,
      functions,
      classes,
      todos,
      complexityScore: Math.min(100, score),
    };
  }

  /**
   * マイグレーション計画を生成する。
   */
  generateMigrationPlan(
    structure: CodebaseStructure,
    targetStack: string,
  ): MigrationPlan {
    const phases: MigrationPhase[] = [];
    const risks: string[] = [];

    // フェーズ1: 評価・準備
    phases.push({
      name: "assessment",
      description: "現状分析と移行準備",
      tasks: [
        "既存コードベースの完全な分析",
        "テストカバレッジの確認・改善",
        "依存関係の棚卸し",
        `${targetStack} 環境のセットアップ`,
        "CI/CD パイプラインの準備",
      ],
      dependencies: [],
      riskLevel: "low",
    });

    // フェーズ2: 基盤構築
    phases.push({
      name: "foundation",
      description: `${targetStack} 基盤の構築`,
      tasks: [
        `${targetStack} プロジェクト構造の作成`,
        "共通ユーティリティの移植",
        "設定ファイルの移行",
        "ビルドシステムの構築",
      ],
      dependencies: ["assessment"],
      riskLevel: "medium",
    });

    // フェーズ3: コア機能移行
    phases.push({
      name: "core-migration",
      description: "コア機能の移行",
      tasks: [
        "ドメインモデルの移植",
        "ビジネスロジックの移行",
        "データアクセス層の移行",
        "単体テストの移植・更新",
      ],
      dependencies: ["foundation"],
      riskLevel: "high",
    });

    // フェーズ4: 統合・検証
    phases.push({
      name: "integration",
      description: "統合テストと検証",
      tasks: [
        "統合テストの実行",
        "パフォーマンステスト",
        "セキュリティ監査",
        "ドキュメント更新",
      ],
      dependencies: ["core-migration"],
      riskLevel: "medium",
    });

    // フェーズ5: 切り替え
    phases.push({
      name: "cutover",
      description: "本番環境への切り替え",
      tasks: [
        "段階的ロールアウト計画の実行",
        "モニタリング設定",
        "ロールバック手順の確認",
        "レガシーシステムの段階的廃止",
      ],
      dependencies: ["integration"],
      riskLevel: "high",
    });

    // リスク評価
    if (structure.totalFiles > 500) {
      risks.push("大規模コードベース: ファイル数が多く移行に時間がかかる可能性");
    }
    if (structure.totalLines > 50000) {
      risks.push("コード量が多い: 段階的な移行戦略が必須");
    }
    if (structure.detectedStack.length > 5) {
      risks.push("複数技術スタック: 依存関係の整理が複雑になる可能性");
    }
    if (Object.keys(structure.filesByExtension).length > 10) {
      risks.push("多様なファイル形式: 一部のファイルは手動変換が必要な可能性");
    }

    // デフォルトリスク
    risks.push("データ移行: 既存データの互換性確認が必要");
    risks.push("外部連携: 外部APIとの連携部分の再テストが必要");

    // 全体の複雑度推定
    let estimatedComplexity: "low" | "medium" | "high";
    if (structure.totalFiles > 300 || structure.totalLines > 30000) {
      estimatedComplexity = "high";
    } else if (structure.totalFiles > 50 || structure.totalLines > 5000) {
      estimatedComplexity = "medium";
    } else {
      estimatedComplexity = "low";
    }

    return { phases, estimatedComplexity, risks };
  }
}
