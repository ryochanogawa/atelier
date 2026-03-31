```
     _  _____ _____ _     ___ _____ ____
    / \|_   _| ____| |   |_ _| ____|  _ \
   / _ \ | | |  _| | |    | ||  _| | |_) |
  / ___ \| | | |___| |___ | || |___|  _ <
 /_/   \_\_| |_____|_____|___|_____|_| \_\

 AI Agent Orchestration CLI
 ~ Your digital art studio for AI workflows ~
```

# ATELIER

**ATELIER** (アトリエ) は、AIコーディングエージェントを **YAMLで定義したワークフロー** に沿って自動実行するCLIツールです。

Claude Code・Codex・Gemini CLI など、既にサブスクリプションで利用中のCLIをそのまま活用し、**APIキー不要** で動作します。美術工房（Atelier）のメタファーを採用し、複数のAIエージェントに「設計者」「実装者」「レビュアー」等の役割を与えて、チームのように協調動作させます。

---

## 目次

1. [Faceted Prompting](#faceted-prompting)
2. [アーキテクチャ](#アーキテクチャ)
3. [ディレクトリ構造](#ディレクトリ構造)
4. [クイックスタート](#クイックスタート)
5. [CLIコマンド一覧](#cliコマンド一覧)
6. [仕様駆動開発（Spec-Driven Development）](#仕様駆動開発spec-driven-development)
7. [CI/CD 統合](#cicd-統合)
8. [高度な実行機能](#高度な実行機能)
9. [Commission YAML の書き方](#commission-yaml-の書き方)
10. [Palette YAML の書き方](#palette-yaml-の書き方)
11. [Policy YAML の書き方](#policy-yaml-の書き方)
12. [Knowledge .md の書き方](#knowledge-md-の書き方)
13. [Instruction .md テンプレートの書き方](#instruction-md-テンプレートの書き方)
14. [Contract YAML の書き方](#contract-yaml-の書き方)
15. [ビルトインリソース一覧](#ビルトインリソース一覧)
16. [美術工房メタファー](#美術工房メタファー)

---

## Faceted Prompting

ATELIERは、巨大な1枚プロンプトを書く代わりに **5つの独立したファセット（関心）** に分離して管理する **Faceted Prompting** を採用しています。

### 5つのファセット

| ファセット | 役割 | 配置先 |
|-----------|------|--------|
| **Persona** | AIが「誰として振る舞うか」を定義する。職種・専門性・行動原則を記述する | System Prompt |
| **Knowledge** | ドメイン知識・参照情報。プロジェクト固有のアーキテクチャ規約や技術仕様を提供する | User Prompt (先頭) |
| **Instruction** | タスクの具体的な手順。「何をどうやるか」のステップを記述する | User Prompt |
| **Contract** | 出力形式の規約。AIの応答がどのような構造・フォーマットであるべきかを定義する | User Prompt |
| **Policy** | 制約・禁止事項・ルール。命名規則、コード品質基準、セキュリティポリシーなどを記述する | User Prompt (末尾) |

### 配置戦略

ファセットはプロンプト内で以下の順序で合成されます。

```
┌─────────────────────────────────────────────────┐
│  System Prompt                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Persona  ── 「誰として振る舞うか」        │  │
│  └───────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┤
│  User Prompt（この順序で合成）                   │
│  ┌───────────────────────────────────────────┐  │
│  │  Knowledge  ── 参照情報・ドメイン知識      │  │
│  │  Instruction ── タスク手順                 │  │
│  │  Contract   ── 出力形式の規約             │  │
│  │  Policy     ── 制約・禁止事項（末尾=強調） │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Recency Effect（直近効果）

**Policy を User Prompt の末尾に配置する** のは、LLMが **直前の情報に強く影響される傾向（recency effect）** を活用するためです。禁止事項やルールは最も遵守してほしい情報であるため、モデルが最後に読む位置に配置することで遵守率を高めます。

逆に、Knowledge（参照情報）は背景知識として利用されるため先頭に置き、Instruction（手順）と Contract（出力規約）はその間に配置します。

---

## アーキテクチャ

ATELIERは **DDD（ドメイン駆動設計）+ ヘキサゴナルアーキテクチャ** を採用しています。

```
              ┌──────────────────────┐
              │       CLI Layer      │  ← Commander.js
              │   (src/cli/)         │
              └──────────┬───────────┘
                         │
              ┌──────────▼───────────┐
              │   Application Layer  │  ← Use Cases / DTOs
              │  (src/application/)  │
              └──────────┬───────────┘
                         │
              ┌──────────▼───────────┐
              │    Domain Layer      │  ← Aggregates / Models / Services / Value Objects / Ports
              │   (src/domain/)      │
              └──────────┬───────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
┌────────▼───────┐ ┌─────▼──────┐ ┌──────▼───────┐
│    Adapters    │ │Infra Layer │ │   Builtin    │
│ (src/adapters/)│ │(src/infra/)│ │(src/builtin/)│
└────────────────┘ └────────────┘ └──────────────┘
```

**依存方向**: 外側から内側へ。Domain Layer は外部ライブラリやインフラに依存しません。外部との接続は Port（インターフェース）を経由し、Adapter が実装を提供します。

### 主要な Port

| Port | 役割 |
|------|------|
| `ConfigPort` | Studio設定・Commission定義の読み込み |
| `MediumPort` | AIプロバイダー（Claude Code, Codex, Gemini）の呼び出し |
| `VcsPort` | Git操作（worktree作成・ブランチ管理） |
| `LoggerPort` | ログ出力（コンソール / NDJSONファイル） |
| `IssueTrackerPort` | GitHub Issue連携 |
| `PullRequestPort` | PR作成 |

---

## ディレクトリ構造

### `src/` の構成

```
src/
├── cli/                    # CLI層 - Commander.jsコマンド定義
│   ├── commands/           # 各コマンドの実装
│   │   ├── run.cmd.ts         # デフォルトコマンド / run
│   │   ├── studio.cmd.ts       # studio init/check
│   │   ├── interactive.cmd.ts  # talk（対話モード）
│   │   ├── commission.cmd.ts   # commission run/list/validate
│   │   ├── technique.cmd.ts    # technique list/eject
│   │   ├── medium.cmd.ts       # medium list/check
│   │   ├── task.cmd.ts         # task add/list/run
│   │   ├── issue.cmd.ts        # issue run/add
│   │   ├── branch.cmd.ts       # branch list/merge/delete/retry/instruct
│   │   ├── watch.cmd.ts        # watch（常駐自動実行）
│   │   ├── pipeline.cmd.ts     # pipeline run
│   │   ├── review.cmd.ts       # review gate/scan
│   │   ├── analyze.cmd.ts      # analyze codebase/dependencies/complexity/migration
│   │   ├── docs.cmd.ts         # docs audit
│   │   ├── suggest.cmd.ts      # suggest palette/commission/enhance
│   │   ├── prompt.cmd.ts       # prompt（プロンプトプレビュー）
│   │   ├── catalog.cmd.ts      # catalog（ファセットリソース一覧）
│   │   ├── repertoire.cmd.ts   # repertoire add
│   │   ├── log.cmd.ts          # log list/show
│   │   └── serve.cmd.ts        # serve（WebSocketサーバー）
│   ├── index.ts            # CLI エントリポイント
│   └── output.ts           # 出力フォーマット（テーブル/JSON）
├── application/            # アプリケーション層 - ユースケース
│   ├── use-cases/          # 各ユースケースの実装
│   ├── services/           # CommissionRunner等のサービス
│   └── dto/                # データ転送オブジェクト
├── domain/                 # ドメイン層 - ビジネスロジック
│   ├── aggregates/         # Commission, RunContext
│   ├── models/             # Canvas, Critique, Palette, Stroke, Task 等
│   ├── services/           # PromptComposer, PolicyEngine, CritiqueService 等
│   ├── ports/              # 外部接続インターフェース（Port）
│   ├── value-objects/      # Facet, Transition, RiskAssessment 等
│   ├── events/             # ドメインイベント
│   └── errors/             # ドメインエラー
├── adapters/               # アダプター層 - Port の実装
│   ├── medium/             # Claude Code / Codex / Gemini アダプター
│   ├── config/             # YAML / Markdownローダー、スキーマ定義
│   ├── vcs/                # Git / GitHub アダプター
│   ├── logger/             # コンソール / NDJSONロガー
│   └── plugin/             # Repertoire（外部テンプレート）
├── infrastructure/         # インフラ層
│   ├── event-bus/          # イベントバス
│   ├── fs/                 # ファイルシステム操作
│   ├── process/            # サブプロセス実行
│   └── server/             # WebSocketサーバー
├── builtin/                # ビルトインリソース
│   ├── commissions/        # ワークフロー定義 (9個)
│   ├── palettes/           # ペルソナ定義 (18個)
│   ├── policies/           # ポリシー (10個)
│   ├── knowledge/          # ドメイン知識 (5個)
│   ├── instructions/       # タスク手順テンプレート (7個)
│   └── contracts/          # 出力規約 (6個)
├── shared/                 # 共有ユーティリティ・型定義
│   ├── constants.ts
│   ├── types.ts            # Branded Types, RunOptions, StudioConfig 等
│   └── utils.ts
├── ui/                     # UI コンポーネント（予約）
└── index.ts                # パッケージエントリポイント
```

### `.atelier/` の構成（各プロジェクトに生成される）

`atelier studio init` を実行すると、プロジェクトルートに `.atelier/` ディレクトリが作成されます。

```
your-project/
└── .atelier/
    ├── studio.yaml           # Studio設定（デフォルトMedium、言語、ログレベル等）
    ├── commissions/          # ワークフロー定義（YAML）
    ├── palettes/             # ペルソナ定義（YAML or Markdown）
    ├── policies/             # 制約・ポリシー（YAML）
    ├── contracts/            # 出力形式の規約（YAML）
    ├── knowledge/            # 参照知識・ドキュメント（Markdown）
    ├── instructions/         # タスク手順テンプレート（Markdown）
    └── logs/                 # 実行ログ（NDJSON形式）
```

ビルトインリソースはそのまま利用でき、カスタマイズしたい場合は `atelier technique eject <name>` でローカルにコピーしてから編集します。ローカルに同名ファイルがある場合はローカルが優先されます。

---

## クイックスタート

### 前提条件

- **Node.js 20+**
- **pnpm**
- 以下のいずれか1つ以上のCLI（サブスクリプション済み）:
  - [Claude Code](https://claude.ai/download) -- `claude` コマンド
  - [Codex CLI](https://github.com/openai/codex) -- `codex` コマンド
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) -- `gemini` コマンド
- **Git** -- worktree機能に必要
- **GitHub CLI** (`gh`) -- Issue連携・PR作成に必要（任意）

### Step 1: インストール

```bash
git clone https://github.com/ryochanogawa/atelier.git
cd atelier
pnpm install && pnpm build
```

### Step 2: プロジェクトの初期化

```bash
cd your-project
atelier studio init
```

`.atelier/` ディレクトリが作成され、サンプルのCommission・Palette・Policyが展開されます。

### Step 3: 利用可能なMediumを確認

```bash
atelier medium check
```

### Step 4: タスクを直接実行する（推奨）

タスクを渡すだけで実行できます。

```bash
# タスクを渡すだけで実行（default Commission 経由）
atelier "ユーザー認証のAPIを追加して"

# Commission を指定して実行
atelier "UIのレイアウトを修正して" --commission frontend

# Commission を使わず直接AIに渡す（シンプルなタスクに最適）
atelier "Tailwind CSSの設定ファイルを作成して" --direct

# Medium（AIプロバイダー）を切り替えて実行
atelier "バグを修正して" --medium codex

# 自動PR作成
atelier "新機能を追加して" --auto-pr --draft

# worktree を作成せず直接実行
atelier "設定ファイルを修正して" --skip-git

# Palette（AIの役割）を指定
atelier "セキュリティレビューをして" --direct --palette security-reviewer

# ドライラン（プロンプトの確認のみ、実行しない）
atelier "テスト" --dry-run

# atelier run サブコマンドでも同じ
atelier run "バグを修正して" --direct
```

**オプション一覧:**

| オプション | 説明 |
|-----------|------|
| `--direct` | Commission を経由せず、直接AIにタスクを渡す |
| `--commission <name>` | 使用する Commission を指定（デフォルト: `default`） |
| `--medium <name>` | 使用する Medium を指定 |
| `--palette <name>` | 使用する Palette を指定（`--direct` 時、デフォルト: `coder`） |
| `--skip-git` | worktree を作成せず直接実行 |
| `--auto-pr` | 実行完了後に自動で GitHub PR を作成 |
| `--draft` | `--auto-pr` と併用してドラフト PR として作成 |
| `--dry-run` | ドライラン（実際には実行しない） |

### Step 5: AIと対話して要件を整理

```bash
atelier talk
```

対話モードでAIと会話し、要件を整理します。

```
ATELIER Interactive Mode
──────────────────────────────────────────────────

you > ユーザー認証のAPIを追加したい

AI  > 承知しました。JWT認証でよろしいですか？...

you > /requirements     # 構造化要件定義モードに切り替え

you > /analyze          # 会話から要件を自動抽出

you > /save             # 要件定義書として保存

you > /implement        # 要件を元にCommissionを実行
```

### Step 6: ワークフローを細かく制御する場合

```bash
# ビルトインCommission一覧を確認
atelier technique list

# default Commission を実行（plan → implement → test → review）
atelier commission run default

# ドライラン（AIを呼び出さずにワークフローを検証）
atelier commission run default --dry-run

# 要件定義ファイルを指定して Commission を実行
atelier commission run default --context requirements=.atelier/requirements/req.md
```

### 実践ワークフロー例

#### 例1: 要件定義から実装まで（対話から一気通貫）

```bash
atelier talk

you > ユーザー認証機能を実装したい。JWT認証で、ログイン・ログアウト・トークンリフレッシュが必要。
AI  > （質問してくる → 回答する）

you > /save       # 要件定義書として保存
you > /implement  # そのまま Commission 実行（plan → implement → test → review）

# 完了後
atelier branch list                          # ブランチ確認
atelier branch merge atelier/run_xxxx        # 問題なければマージ
atelier branch instruct atelier/run_xxxx     # 追加修正が必要なら
```

#### 例2: 単発の修正タスク

```bash
# シンプルな修正は --direct で十分（サイクルなし、1回の実行）
atelier "Tailwind CSSの設定ファイルを作成して" --direct

# UI系の修正は frontend Commission で（design → implement → visual-review）
atelier "ダークテーマのカラーを調整して" --commission frontend
```

#### 例3: 複数タスクの並列実行

```bash
# 1. タスクをキューに追加
atelier task add "Phase 2: Git操作UIを実装して"
atelier task add "Phase 3: ターミナルを実装して"
atelier task add "Phase 5: プレビュー機能を実装して"

# 2. 一括実行（各タスクが worktree で隔離実行される）
atelier task run

# 3. 並列度を指定して実行
atelier task run --concurrency 3

# 4. 完了後、各ブランチを確認してマージ
atelier branch list
atelier branch merge atelier/run_xxxx
atelier branch merge atelier/run_yyyy
```

#### 例4: Watch モードで常駐実行

```bash
# ターミナル1: watch を起動（タスクを監視して自動実行）
atelier watch

# ターミナル2: タスクを追加するたびに自動で実行される
atelier task add "バグ: ログインボタンが反応しない"
atelier task add "機能: ダークモード切り替えを追加"
```

#### 例5: 完了タスクへの追加指示

```bash
# タスク実行
atelier "検索機能を実装して" --commission frontend

# 完了後、追加修正
atelier branch instruct atelier/run_xxxx
> 検索結果のハイライト表示を追加して
> （空行で確定）

# 最終確認後マージ
atelier branch merge atelier/run_xxxx
```

---

## CLIコマンド一覧

### デフォルトコマンド / `run` -- タスクの直接実行

| コマンド | 説明 |
|---------|------|
| `atelier "タスク説明"` | デフォルト Commission でタスクを実行 |
| `atelier "タスク" --direct` | Commission を経由せず直接実行 |
| `atelier "タスク" --commission <name>` | 指定した Commission で実行 |
| `atelier "タスク" --medium <name>` | 使用する Medium を切り替えて実行 |
| `atelier "タスク" --skip-git` | worktree を作成せず直接実行 |
| `atelier "タスク" --auto-pr` | 実行完了後に自動で GitHub PR を作成 |
| `atelier "タスク" --auto-pr --draft` | ドラフト PR として作成 |
| `atelier run "タスク"` | `atelier "タスク"` と同じ |

### `talk` -- 対話モード

```bash
atelier talk
```

AIとの対話セッションを開始します。AIはプロジェクトのファイルを Read/Glob/Grep/Bash ツールで直接読み取れるため、コードベースを理解した上で会話できます。対話中は自動的にプロジェクトの Policy が適用されます。

**実行系コマンド:**

| コマンド | 説明 |
|---------|------|
| `/go [追加指示]` | 会話を要約し、Commission 選択UI を表示して実行する。worktree で隔離実行 |
| `/play <タスク>` | 会話コンテキストを使わず、指定タスクを default Commission で即座に実行 |
| `/implement [name]` | 要件定義を生成し、指定した Commission で実行（デフォルト: `default`） |
| `/spec` | 会話内容から仕様書3点セット（要件定義・設計・タスク）を生成する。実装はしない |
| `/spec implement` | 仕様書3点セット生成 + 実装→テスト→レビューまで一気通貫で実行 |
| `/resume` | 過去の対話セッションを一覧表示し、選択して復帰する |

**要件定義コマンド:**

| コマンド | 説明 |
|---------|------|
| `/requirements` | 構造化要件定義モード。AIが質問を通じて要件を整理する |
| `/analyze` | 会話履歴から要件を自動抽出し、矛盾・抜け漏れを検出する |
| `/save` | 会話内容を要件定義書として保存する |
| `/suggest` | Commission/Palette の提案を受ける |

**タスク管理コマンド:**

| コマンド | 説明 |
|---------|------|
| `/queue <description>` | タスクをキューに追加する |
| `/run` | キュー内の全タスクを実行する |
| `/list` | キュー内タスク一覧を表示する |

**セッション管理コマンド:**

| コマンド | 説明 |
|---------|------|
| `/help` | 利用可能な全コマンド一覧を表示する |
| `/exit` | 対話モードを終了する（アクション選択: 実行 / タスク保存 / 要件保存 / 終了） |

セッションは `.atelier/sessions/` に自動保存されます。

### `watch` -- 常駐自動実行

```bash
atelier watch
```

常駐プロセスとして起動し、`.atelier/tasks.yaml` を監視。新しいタスクが追加されたら自動実行します。

| オプション | 説明 |
|-----------|------|
| `--interval <ms>` | ポーリング間隔（デフォルト: 2000ms） |

Ctrl+C で graceful shutdown します。

### `studio` -- 作業環境の管理

| サブコマンド | 説明 |
|-------------|------|
| `atelier studio init` | プロジェクトに `.atelier/` ディレクトリを生成し初期化する |
| `atelier studio check` | Studio設定の整合性を検証する |

### `commission` -- ワークフローの実行

| サブコマンド | 説明 |
|-------------|------|
| `atelier commission run <name>` | 指定したCommissionを実行する |
| `atelier commission list` | 利用可能なCommission一覧を表示する |
| `atelier commission validate <name>` | Commission定義の構文・整合性を検証する |

主なオプション:
- `--dry-run` -- AIを呼び出さずにワークフローを検証
- `--medium <name>` -- 使用するMediumを指定
- `--auto-pr` -- 実行後に自動でPR作成

### `technique` -- ビルトインテンプレート

| サブコマンド | 説明 |
|-------------|------|
| `atelier technique list` | ビルトインCommission一覧を表示する |
| `atelier technique eject <name>` | ビルトインをローカル（`.atelier/commissions/`）にコピーしてカスタマイズ可能にする |

### `medium` -- AIプロバイダー管理

| サブコマンド | 説明 |
|-------------|------|
| `atelier medium list` | 設定済みのMedium一覧を表示する |
| `atelier medium check` | 各Mediumの利用可否とバージョンを確認する |

対応Medium:

| Medium | CLIコマンド | 認証 |
|--------|-----------|------|
| **claude-code** (デフォルト) | `claude --print` | Claude Pro/Max/Team |
| **codex** | `codex --quiet` | OpenAI subscription |
| **gemini** | `gemini --prompt` | Google AI subscription |

### `task` -- タスクキュー

| サブコマンド | 説明 |
|-------------|------|
| `atelier task add <description>` | タスクをキューに追加する |
| `atelier task list` | キュー内のタスク一覧を表示する |
| `atelier task run` | キュー内の全タスクを一括実行する |
| `atelier task run --concurrency N` | 最大N個のタスクを並列実行する |

### `branch` -- ブランチ管理

ATELIERは各タスクをGit worktreeで隔離実行します。完了後のブランチを管理できます。

| サブコマンド | 説明 |
|-------------|------|
| `atelier branch list` | ATELIERが作成したブランチ一覧を表示する |
| `atelier branch merge <name>` | 指定ブランチをメインブランチにマージし、worktree を削除する |
| `atelier branch delete <name>` | worktree とブランチを削除する |
| `atelier branch retry <name>` | 同じ worktree で Commission を再実行する |
| `atelier branch instruct <name>` | 完了タスクに対してAIと対話し追加指示を出して再実行する |

### `spec` -- 仕様駆動開発

要件定義→技術設計→タスク分解を段階的に管理し、仕様に基づいた実装を行います。

| サブコマンド | 説明 |
|-------------|------|
| `atelier spec create` | 対話入力で仕様書を新規作成し、要件定義書を生成する |
| `atelier spec create "<description>"` | 説明文を引数で渡して要件定義書を生成する |
| `atelier spec design <id>` | 指定仕様の技術設計書を生成する |
| `atelier spec tasks <id>` | 指定仕様の実装タスクを生成する |
| `atelier spec implement <id>` | 全タスクを実装→レビューを実行する |
| `atelier spec implement <id> --task <N>` | 特定タスクのみ実装する（完了後にtasks.mdを自動更新） |
| `atelier spec list` | 仕様書一覧を表示する（ID / 名前 / フェーズ / 更新日） |
| `atelier spec show <id>` | 仕様書の詳細とトレーサビリティマトリクスを表示する |

要件～タスクまで一気に生成する場合:

```bash
atelier run "認証機能を追加" --commission spec-plan --skip-git
```

全フェーズ一気通貫で実行する場合:

```bash
atelier run "認証機能を追加" --commission spec-driven --skip-git
```

詳細は[仕様駆動開発（Spec-Driven Development）](#仕様駆動開発spec-driven-development)を参照してください。

### `issue` -- GitHub Issue 連携

| サブコマンド | 説明 |
|-------------|------|
| `atelier issue run <number>` | 指定Issueの内容をCommissionで実行する |
| `atelier issue add <number>` | Issueをタスクキューに追加する |

### `prompt` -- プロンプトプレビュー

Commission の各 stroke で実際に送信されるプロンプト（ファセット合成結果）をプレビュー表示します。

```bash
atelier prompt default              # 全 stroke をプレビュー
atelier prompt default --stroke plan # 特定の stroke のみ
```

ファセットごとに色分け表示されます（Persona=青、Knowledge=緑、Instruction=白、Contract=黄、Policy=赤）。

### `catalog` -- ファセットリソース一覧

利用可能な全ファセットリソース（ビルトイン + プロジェクト固有）を一覧表示します。

```bash
atelier catalog                    # 全カテゴリ
atelier catalog palettes           # Palette のみ
atelier catalog policies           # Policy のみ
atelier catalog knowledge          # Knowledge のみ
atelier catalog instructions       # Instruction のみ
atelier catalog contracts          # Contract のみ
atelier catalog commissions        # Commission のみ
```

プロジェクト固有のリソースがビルトインを override している場合は `project (override)` と表示されます。

### `pipeline` -- CI/CDパイプライン

| サブコマンド | 説明 |
|-------------|------|
| `atelier pipeline run <name>` | CI環境でCommissionを実行する |

主なオプション:
- `--auto-pr` -- 完了後にPR自動作成
- `--task <description>` -- タスク説明を指定
- `--json` -- JSON形式で出力

### `review` -- 自動レビューゲート

| サブコマンド | 説明 |
|-------------|------|
| `atelier review gate` | フルレビューゲート（セキュリティスキャン + 差分分析 + Lint + ポリシー判定） |
| `atelier review scan` | セキュリティスキャン（脆弱性チェック + ライセンススキャン + SBOM生成） |

### `analyze` -- コードベース分析

| サブコマンド | 説明 |
|-------------|------|
| `atelier analyze codebase [path]` | コードベースの構造を分析する |
| `atelier analyze dependencies [path]` | 依存関係を分析する |
| `atelier analyze complexity [path]` | コードの複雑度を分析する |
| `atelier analyze migration [path]` | マイグレーション計画を生成する |

### `docs` -- ドキュメント管理

| サブコマンド | 説明 |
|-------------|------|
| `atelier docs audit` | ドキュメントの鮮度スコアを算出し、陳腐化を検出する |

### `suggest` -- 提案・プロンプト強化

| サブコマンド | 説明 |
|-------------|------|
| `atelier suggest palette <description>` | タスク内容からビルトインPaletteを提案する |
| `atelier suggest commission <description>` | タスク内容からビルトインCommissionを提案する |
| `atelier suggest enhance <prompt>` | プロンプトを自動強化する（不足観点の補完） |

### `repertoire` -- 外部テンプレート

| サブコマンド | 説明 |
|-------------|------|
| `atelier repertoire add <url>` | GitHubからCommissionテンプレートパッケージをインストールする |

### `log` -- 実行ログ

| サブコマンド | 説明 |
|-------------|------|
| `atelier log list` | 実行ログ一覧を表示する |
| `atelier log show <id>` | 指定ログの詳細を表示する |

### グローバルオプション

| オプション | 説明 |
|-----------|------|
| `--json` | 出力を JSON 形式に切り替える |
| `--version` | バージョンを表示する |
| `--help` | ヘルプを表示する |

---

## 仕様駆動開発（Spec-Driven Development）

ATELIERは、要件定義→技術設計→タスク分解→実装の一連の流れを仕様書ベースで管理する**仕様駆動開発**をサポートしています。

### なぜ仕様駆動か？

小さなタスク（「バグ直して」「設定ファイル作って」）は `atelier "タスク" --direct` で十分です。しかし、大きな機能（「認証機能を追加」「決済システムを組み込む」）では、仕様なしに実装すると**抜け漏れ・手戻り**が発生します。

仕様駆動開発では、AIが仕様書3点セットを自動生成し、それに基づいて実装します。

### 仕様書3点セット

```
.atelier/specs/{ID}-{名前}/
├── spec.json          # メタデータ（フェーズ、更新日）
├── requirements.md    # 要件定義書（何を作るか）
├── design.md          # 技術設計書（どう作るか）
└── tasks.md           # 実装タスク（何から手をつけるか）
```

各ファイルは非エンジニアにも読める平易な形式で生成されます:
- **requirements.md**: 背景、ゴール、要件一覧（表形式）、操作の流れ（Mermaid図）
- **design.md**: 方針、要件→設計マッピング、構成図、変更ファイル一覧
- **tasks.md**: チェックボックス形式、依存順、要件参照付き

### 段階的に進める

```bash
# Step 1: 要件定義書を作成
atelier spec create "ユーザー認証機能"
# → .atelier/specs/001-user-auth/requirements.md が生成

# （レビュー・修正）

# Step 2: 技術設計書を作成
atelier spec design 001
# → design.md が生成

# （レビュー・修正）

# Step 3: タスク分解
atelier spec tasks 001
# → tasks.md が生成

# （レビュー・修正）

# Step 4: 実装
atelier spec implement 001
# → tasks.md に基づいて implement → test → review

# タスクを1つずつ実装する場合
atelier spec implement 001 --task 1
atelier spec implement 001 --task 2
# → 完了後にtasks.mdのチェックボックスが自動更新される
```

各ステップの間で仕様書を確認・修正できるため、**AIの出力を人間がコントロール**できます。

### 要件～タスクまで一気に生成する

設計フェーズ（要件→設計→タスク）をまとめて実行し、実装は別途行う場合:

```bash
atelier run "認証機能を追加" --commission spec-plan --skip-git
```

3 stroke（requirements → design → tasks）で止まります。生成された仕様書をレビュー後、`atelier spec implement` で実装に進めます。

### 全フェーズ一気通貫で実行する

レビュー不要でスピードを優先する場合:

```bash
atelier run "認証機能を追加" --commission spec-driven --skip-git
```

6 stroke（requirements → design → tasks → implement → test → review）が一気に実行されます。

### 対話モードから仕様書を生成

```bash
atelier talk

you > ユーザー認証機能を実装したい。JWTで、ログイン・ログアウトが必要。
AI  > （質問してくる → 回答する）

you > /spec              # 仕様書3点セットのみ生成（実装しない）
you > /spec implement    # 仕様書生成 + 実装まで一気通貫
```

### トレーサビリティ

`atelier spec show <id>` で、要件→設計→タスクの対応関係を確認できます:

```
=== トレーサビリティ ===

| 要件# | 要件名           | 設計 | タスク |
|--------|-----------------|------|--------|
| 1      | ログインできる    | ✓    | ✓      |
| 2      | ログアウトできる  | ✓    | ✓      |
| 3      | パスワードリセット | -    | -      |

⚠ 未カバー要件: #3 パスワードリセット（設計・タスクなし）
```

---

## CI/CD 統合

ATELIERは GitHub Actions / GitLab CI/CD と連携し、Issue コメントや MR/PR イベントをトリガーにタスクの自動実行・自動レビューを行えます。

### GitHub Actions

#### atelier-action（推奨）

`.github/actions/atelier-action` を使うと、Issue コメントで `@atelier` メンションされた時にタスクを自動実行し、PR を作成します。

```yaml
# .github/workflows/atelier-issue.yml
name: ATELIER Issue Handler
on:
  issue_comment:
    types: [created]

jobs:
  run:
    if: contains(github.event.comment.body, '@atelier')
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/atelier-action
        with:
          auto-pr: 'true'
          draft: 'true'
```

#### PR 自動レビュー

PR が開かれた時に自動でコードレビューを実行する例:

```yaml
# .github/workflows/atelier-review.yml
name: ATELIER PR Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - run: atelier "このPRの変更をレビューして" --direct --skip-git
```

#### 他の Medium を使う場合

```yaml
# Codex CLI を使う場合
- uses: ./.github/actions/atelier-action
  with:
    auto-pr: 'true'
  env:
    ATELIER_MEDIUM: codex

# Gemini CLI を使う場合
- uses: ./.github/actions/atelier-action
  with:
    auto-pr: 'true'
  env:
    ATELIER_MEDIUM: gemini
```

### GitLab CI/CD

`.gitlab-ci.yml` を配置することで、GitLab CI/CD でも同様のワークフローを構築できます。MR 作成には `glab` CLI を使用します。

```yaml
# .gitlab-ci.yml
stages:
  - atelier

# Issue コメントで @atelier メンションされた時に実行
atelier:issue:
  stage: atelier
  rules:
    - if: $CI_PIPELINE_SOURCE == "trigger"
  script:
    - atelier "$ATELIER_TASK" --auto-pr --draft
  tags:
    - self-hosted

# MR が開かれた時に自動レビュー
atelier:review:
  stage: atelier
  rules:
    - if: $CI_MERGE_REQUEST_IID
  script:
    - atelier "このMRの変更をレビューして" --direct --skip-git
  tags:
    - self-hosted
```

### Slack 通知の設定

CI/CD の実行結果を Slack に通知するには、ジョブの最後に Slack Webhook を呼び出します。

```yaml
# GitHub Actions の場合
- name: Notify Slack
  if: always()
  uses: slackapi/slack-github-action@v2
  with:
    webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
    payload: |
      {"text": "ATELIER: ${{ job.status }} - ${{ github.event.issue.title }}"}
```

```yaml
# GitLab CI/CD の場合
atelier:notify:
  stage: atelier
  needs: ["atelier:issue"]
  when: always
  script:
    - |
      curl -X POST "$SLACK_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"text\": \"ATELIER: $CI_JOB_STATUS - Pipeline #$CI_PIPELINE_ID\"}"
```

### Medium（AIプロバイダー）の切り替え

CI/CD 環境では `--medium` オプションまたは `studio.yaml` の設定で、使用する AI プロバイダーを切り替えられます。全て各サービスのサブスクリプション範囲内で動作し、**APIキーや従量課金は不要**です。

```yaml
# studio.yaml
media:
  claude-code:
    command: claude
    args: ["--print", "--model", "claude-opus-4-6", "--dangerously-skip-permissions"]
  codex:
    command: codex
    args: ["--quiet"]
  gemini:
    command: gemini
    args: ["--prompt"]
```

```bash
# Claude Code で実行（デフォルト）
atelier "バグを修正して"

# Codex で実行
atelier "バグを修正して" --medium codex

# Gemini で実行
atelier "バグを修正して" --medium gemini
```

### VCS プロバイダー自動検出

`--auto-pr` オプション使用時、ATELIER は Git remote URL からホスティングプロバイダー（GitHub / GitLab）を自動検出し、適切な CLI（`gh` / `glab`）を使用して PR/MR を作成します。

| remote URL に含まれる文字列 | 検出結果 | 使用 CLI |
|---------------------------|---------|---------|
| `github.com` / `github` | GitHub | `gh` |
| `gitlab.com` / `gitlab` | GitLab | `glab` |
| その他 | GitHub（デフォルト） | `gh` |

手動で VCS プロバイダーを指定する必要はありません。`git remote get-url origin` の結果から自動判定されます。

---

## 高度な実行機能

### Worktree 隔離実行

`atelier "タスク"` を実行すると、自動で Git worktree とブランチが作成され、メインブランチを汚さずに作業できます。

```bash
# タスク実行 → worktree 自動作成
atelier "ユーザー認証を実装して" --direct

# 完了後の表示:
# ✓ タスクが完了しました
#   ブランチ: atelier/run_xxxx
#   Worktree: .atelier/worktrees/atelier-run_xxxx
#
#   次のステップ:
#     atelier branch merge atelier/run_xxxx   # メインにマージ
#     atelier branch delete atelier/run_xxxx  # 削除
#     atelier branch instruct atelier/run_xxxx # 追加指示

# --skip-git で worktree を作成せず直接実行
atelier "設定ファイルを修正して" --direct --skip-git
```

### Phase 3: Conductor（ステータス判定）

各 stroke の完了後に、`conductor` ペルソナが実行結果を評価し、`[STATUS: approved]` / `[STATUS: needs_fix]` 等のタグで次のアクションを自動決定します。

```yaml
strokes:
  - name: implement
    palette: coder
    conductor:
      rules:
        - condition: approved
          next: null           # 完了
        - condition: needs_fix
          next: implement      # やり直し
```

### Parallel Movements（並列レビュー + 結果集約）

Commission 内で複数のサブストロークを同時に実行し、結果を `all()` / `any()` ルールで集約して次のアクションを決定します。複数レビュアーによる並列レビューに最適です。

```yaml
strokes:
  - name: implement
    palette: coder
    allow_edit: true
    instruction: コードを実装してください。
    outputs:
      - implementation
    transitions:
      - condition: default
        next: reviewers

  - name: reviewers
    parallel:
      - name: arch-review
        palette: reviewer
        instruction: アーキテクチャ観点でレビューしてください。
      - name: qa-review
        palette: tester
        instruction: テスト観点でレビューしてください。
      - name: security-review
        palette: security-reviewer
        instruction: セキュリティ観点でレビューしてください。
    inputs:
      - implementation
    outputs:
      - review_result
    transitions:
      - condition: all("approved")     # 全員が approved → 完了
        next: COMPLETE
      - condition: any("needs_fix")    # 誰かが needs_fix → 修正に戻す
        next: implement
```

**集約ルール:**

| ルール | 説明 |
|--------|------|
| `all("approved")` | 全サブストロークが `approved` → true |
| `any("needs_fix")` | いずれかのサブストロークが `needs_fix` → true |

### タスク並列実行（concurrency）

複数タスクをキューに追加し、`--concurrency` で並列実行できます。

```bash
# タスクを追加
atelier task add "Phase 2: Git UIを実装して"
atelier task add "Phase 3: ターミナルを実装して"
atelier task add "Phase 4: Commission UIを実装して"

# 3並列で一括実行（各タスクは worktree で隔離）
atelier task run --concurrency 3
```

### Team Leader（タスク自動分割 + 並列実行）

1つの大きなタスクをAIが複数のサブタスクに自動分解し、worker pool で並列実行します。

```yaml
strokes:
  - name: implement
    palette: coder
    team_leader:
      max_parts: 5            # 最大分割数
      part_persona: coder     # 各 worker の Palette
      part_allow_edit: true   # worker のファイル編集許可
    instruction: |
      以下のタスクを独立して実行可能なサブタスクに分解してください。
      各サブタスクは [SUBTASK] タグで区切ってください。
```

### Arpeggio（CSV x テンプレート x バッチ処理）

CSVファイルのデータを行ごとにテンプレート展開し、バッチに分割して並列実行します。

```yaml
strokes:
  - name: batch-process
    palette: coder
    arpeggio:
      source: data.csv        # CSV ファイルパス
      batch_size: 5            # 1バッチあたりの行数
      concurrency: 3           # 並列実行数
      merge: concat            # マージ戦略
    instruction: |
      以下のデータ行を処理してください:
      {{batch_data}}
```

テンプレート変数: `{{batch_data}}`, `{{batch_index}}`, `{{total_batches}}`, `{{line:N}}`, `{{col:N:name}}`

### Loop Monitoring（ループ検出）

Commission の `loop_monitors` フィールドで、ストローク間の無限ループを検出・制御します。

```yaml
loop_monitors:
  - cycle: [implement, review]
    threshold: 5
    on_threshold: force_complete
```

| フィールド | 説明 |
|-----------|------|
| `cycle` | 監視対象のストローク名リスト |
| `threshold` | サイクルの繰り返し上限回数 |
| `on_threshold` | 上限到達時の動作: `fail` / `skip` / `force_complete` |

### Watch モード（常駐自動実行）

```bash
atelier watch
```

常駐プロセスとして起動し、タスクキューを監視。新しいタスクが追加されたら自動実行します。

```bash
# ターミナル1: watch を起動
atelier watch

# ターミナル2: タスクを追加（自動実行される）
atelier task add "バグを修正して"
```

### Instruct（完了タスクへの追加指示）

```bash
atelier branch instruct atelier/run_xxxx
```

完了済みの worktree に対してAIと対話し、追加の修正指示を出せます。入力された指示で worktree 内のコードを更新し、自動コミットします。

---

## Commission YAML の書き方

Commission はワークフロー全体を定義するYAMLファイルです。

### 完全なフィールド説明

```yaml
name: my-workflow                    # (必須) Commission名
description: ワークフローの説明文    # (任意) 説明

strokes:                             # (必須) 実行ステップのリスト
  - name: plan                       # (必須) ストローク名（一意）
    palette: planner                 # (必須) 使用するPalette名
    instruction: |                   # (必須) このステップでAIに渡すタスク手順
      要件を分析し、実装計画を策定してください。
      計画: {{implementation_plan}}  # Canvasの値を {{変数名}} で参照可能
    inputs:                          # (任意) Canvasから読み取るキーのリスト
      - requirements
    outputs:                         # (任意) Canvasに書き込むキーのリスト
      - implementation_plan
    transitions:                     # (任意) 次のステップへの遷移条件
      - condition: default           # 遷移条件（default / approved / needs_fix 等）
        next: implement              # 遷移先のストローク名
        max_retries: 3               # (任意) 最大リトライ回数
        on_max_retries: fail         # (任意) リトライ超過時の動作: fail / skip / continue
    knowledge:                       # (任意) このストローク固有のKnowledgeファイル名リスト
      - architecture
      - security
    contract: plan-output            # (任意) 使用するContract名
    depends_on:                      # (任意) 依存する他ストローク名（並列実行制御）
      - requirements-gathering
    allow_edit: true                 # (任意) ファイル編集を許可するか（デフォルト: false）
    medium: codex                    # (任意) ストローク固有のMedium指定
    conductor:                       # (任意) Phase 3 ステータス判定
      palette: conductor             # 判定に使う Palette（デフォルト: conductor）
      rules:                         # ステータスに基づく遷移ルール
        - condition: approved
          next: null                 # 完了
        - condition: needs_fix
          next: implement            # 修正に戻す
    team_leader:                     # (任意) タスク自動分割 + 並列実行
      max_parts: 5                   # 最大分割数
      part_persona: coder            # 各 worker の Palette
      part_allow_edit: true          # worker のファイル編集許可
    arpeggio:                        # (任意) CSV × テンプレート × バッチ処理
      source: data.csv               # CSV ファイルパス
      batch_size: 5                  # 1バッチあたりの行数
      concurrency: 3                 # 並列実行数
      merge: concat                  # マージ戦略（concat）
    parallel:                        # (任意) 並列サブストロークのリスト
      - name: sub-stroke-1
        palette: reviewer
        instruction: レビューしてください。

loop_monitors:                       # (任意) ループ検出モニター
  - cycle:                           # 監視するストロークのサイクル
      - implement
      - review
    threshold: 3                     # サイクルの繰り返し上限回数
    on_threshold: force_complete     # 上限到達時の動作: fail / skip / force_complete
```

### strokes フィールド詳細

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `name` | string | Yes | ストローク名（Commission内で一意） |
| `palette` | string | Yes | 使用するPalette名 |
| `instruction` | string | Yes | AIに渡すタスク手順。`{{変数名}}` でCanvasの値を参照可能 |
| `inputs` | string[] | No | Canvasから読み取るキーのリスト |
| `outputs` | string[] | No | Canvasに書き込むキーのリスト |
| `transitions` | object[] | No | 次のステップへの遷移条件リスト |
| `knowledge` | string[] | No | このストロークで使用するKnowledgeファイル名 |
| `contract` | string | No | 出力規約のContract名 |
| `depends_on` | string[] | No | 先に完了すべきストローク名（並列実行の依存関係） |
| `allow_edit` | boolean | No | ファイル編集の許可（デフォルト: false） |
| `medium` | string | No | ストローク固有のMedium指定 |
| `conductor` | object | No | Phase 3 ステータス判定。AI が実行結果を評価し `[STATUS: xxx]` で次のアクションを決定 |
| `team_leader` | object | No | タスク自動分割。AI がサブタスクに分解し worker pool で並列実行 |
| `arpeggio` | object | No | CSV データドリブンバッチ処理。各行をテンプレート展開して並列実行 |
| `parallel` | object[] | No | 並列実行するサブストロークのリスト。`all()/any()` で結果を集約 |

### Critique（批評）ループの例

レビューで問題があれば修正に戻すフロー:

```yaml
strokes:
  - name: implement
    palette: coder
    instruction: コードを実装してください。
    outputs:
      - implementation
    transitions:
      - condition: default
        next: review

  - name: review
    palette: reviewer
    instruction: |
      コードをレビューしてください。
      実装: {{implementation}}
    inputs:
      - implementation
    outputs:
      - review_result
    transitions:
      - condition: approved
        next: null              # 完了
      - condition: needs_fix
        next: implement         # 修正に戻す
        max_retries: 3
        on_max_retries: fail

loop_monitors:
  - cycle: [implement, review]
    threshold: 5
    on_threshold: force_complete
```

---

## Palette YAML の書き方

Palette はAIの役割・ペルソナを定義します。YAML形式とMarkdown形式の両方に対応しています。

### YAML形式

```yaml
name: coder                              # (必須) Palette名
description: 実装担当のAIエージェント     # (任意) 説明

persona: |                                # (必須) Personaファセット（System Promptに配置される）
  あなたは熟練のソフトウェアエンジニアとして、コードの実装を担当します。

  ## 役割
  - 設計に基づいた高品質なコードの実装
  - 適切なエラーハンドリングの実装

  ## コーディング原則
  - クリーンコード（可読性、保守性を最優先）
  - SOLID原則の遵守

  ## 出力ルール
  - 変更するファイルのパスを明示する
  - 既存のコーディングスタイルに合わせる

policies:                                 # (任意) 適用するPolicyのリスト
  - default-policy

defaults:                                 # (任意) デフォルトパラメータ
  temperature: 0.3
  max_tokens: 8192
```

### Markdown形式

`.atelier/palettes/` に `.md` ファイルとして配置することもできます。YAMLのフロントマターで `name` と `policies` を指定し、本文が `persona` となります。

---

## Policy YAML の書き方

Policy はAIが遵守すべき制約・ルールを定義します。Faceted Prompting ではUser Promptの末尾に配置され、recency effectによって高い遵守率が期待されます。

```yaml
name: default-policy                          # (必須) Policy名
description: 一般的なコーディング規約          # (任意) 説明

rules:                                        # (必須) ルールのリスト
  - name: naming-conventions                  # (必須) ルール名
    description: 命名規則                      # (任意) 説明
    content: |                                # (必須) ルール本文
      - 変数名・関数名はキャメルケース（camelCase）を使用する
      - クラス名・型名はパスカルケース（PascalCase）を使用する
      - 定数は大文字スネークケース（UPPER_SNAKE_CASE）を使用する
      - ファイル名はケバブケース（kebab-case）を使用する

  - name: code-structure
    description: コード構造
    content: |
      - 1つのファイルは1つの主要な責務を持つ
      - 関数は30行以内に収める
      - ネストは3段階以内に抑える
```

---

## Knowledge .md の書き方

Knowledge はドメイン知識・参照情報をMarkdownで記述します。プロンプト合成時にUser Promptの先頭に配置されます。

ファイルは `.atelier/knowledge/` またはビルトインの `src/builtin/knowledge/` に配置します。

```markdown
# アーキテクチャ知識

## ファイル構成と設計

**ファイルサイズ基準:**

| 基準 | 判定 |
|------|------|
| 単一ファイル 200行超 | 分割を検討 |
| 単一ファイル 300行超 | REJECT |

**モジュール構造:**

- 高凝集: 関連する機能をまとめる
- 低結合: モジュール間の依存を最小化
- 循環依存の禁止

## レイヤー設計

- 依存方向: 上位層 → 下位層（逆方向は禁止）
- 1インタフェース = 1責務
```

ストロークの `knowledge` フィールドでファイル名（拡張子なし）を指定すると、該当するKnowledgeがプロンプトに含まれます。

---

## Instruction .md テンプレートの書き方

Instruction はタスクの具体的な手順を定義するMarkdownファイルです。Commission の `instruction` フィールドにインラインで書く代わりに、再利用可能なテンプレートとして管理できます。

ファイルは `.atelier/instructions/` またはビルトインの `src/builtin/instructions/` に配置します。

```markdown
タスクを分析し、実装計画を策定してください。

**小規模タスクの基準:**
- 変更ファイルが1〜2個
- 設計判断が不要

小規模タスクの場合、設計セクションは省略してください。

**アクション:**
1. タスクの要件を理解する
   - 各要件について「変更要/不要」を判断する
2. 不明点はコードを調査して解決する
3. 影響範囲を特定する
4. ファイル構成と設計パターンを決定する（必要な場合）
5. 実装方針を決定する
6. 実装担当者へのガイドラインに以下を含める:
   - 参照すべき既存の実装パターン（ファイル:行番号）
   - 変更の影響範囲
```

`{{変数名}}` でCanvasの値をテンプレート展開できます。

---

## Contract YAML の書き方

Contract はAIの出力形式を定義します。構造化された出力が必要な場合にフォーマットとフィールドを指定します。

```yaml
name: plan-output                          # (必須) Contract名
description: 設計計画の出力フォーマット     # (任意) 説明

format: |                                  # (必須) 出力テンプレート
  ## 元の要求
  {{original_request}}

  ## 分析

  ### 目的
  {達成すべきこと}

  ### スコープ
  {影響範囲}

  ### 実装方針
  {どのように進めるか}

  ## スコープ外（該当項目がある場合のみ）
  | 項目 | 除外理由 |
  |------|---------|

fields:                                    # (任意) 出力フィールドの定義
  - name: original_request                 # フィールド名
    type: string                           # 型: string / array / object
    required: true                         # 必須かどうか
    description: ユーザーの元の要求         # 説明

  - name: objective
    type: string
    required: true
    description: 達成すべき目的

  - name: guidelines
    type: array
    required: false
    description: 実装ガイドライン一覧
```

---

## ビルトインリソース一覧

ATELIERには以下のビルトインリソースが同梱されています。

### Commissions (14個)

**開発ワークフロー:**

| 名前 | ストローク | 用途 |
|------|-----------|------|
| `default` | plan → implement → test → review | 汎用開発 |
| `spec-driven` | requirements → design → tasks → implement → test → review | 仕様駆動開発（全フェーズ一気通貫） |
| `spec-plan` | requirements → design → tasks | 仕様駆動開発（設計フェーズのみ、実装含まず） |
| `spec-requirements` | requirements | 要件定義のみ |
| `spec-design` | design | 技術設計のみ |
| `spec-tasks` | tasks | タスク生成のみ |
| `frontend` | design → implement → visual-review | フロントエンド開発 |
| `backend` | plan → implement → api-test → security-review | バックエンド開発 |
| `fullstack` | plan → backend → frontend → integration-test → review | フルスタック開発 |

**品質・分析ワークフロー:**

| 名前 | ストローク | 用途 |
|------|-----------|------|
| `review-gate` | scan → diff → risk → policy → approval | 自動レビューゲート |
| `requirements-analysis` | interview → structure → validate → finalize | 構造化要件定義 |
| `test-enhancement` | coverage → gaps → generate → verify | テスト品質向上 |
| `legacy-analysis` | scan → assess → plan → document | レガシーコード分析 |
| `doc-refresh` | audit → prioritize → update → verify | ドキュメント刷新 |

### Palettes (19個)

| 名前 | 役割 |
|------|------|
| `architect` | アーキテクチャ設計 |
| `coder` | コード実装 |
| `conductor` | ステータス判定（Conductor用） |
| `designer` | UIデザイン |
| `devops` | CI/CD・インフラ |
| `documentation-writer` | ドキュメント作成 |
| `interviewer` | 要件ヒアリング |
| `legacy-analyst` | レガシーコード分析 |
| `performance-engineer` | パフォーマンス最適化 |
| `planner` | 設計・計画担当 |
| `policy-checker` | ポリシー適合性チェック |
| `requirements-analyst` | 要件分析 |
| `reviewer` | コードレビュー |
| `risk-assessor` | リスク評価 |
| `security-reviewer` | セキュリティレビュー |
| `supervisor` | ワークフロー監督 |
| `technical-writer` | 技術ドキュメント |
| `tester` | テスト作成・実行 |
| `spec-writer` | 仕様書生成（要件定義・設計・タスク分解） |

### Policies (10個)

| 名前 | 内容 |
|------|------|
| `architecture-policy` | アーキテクチャ制約 |
| `default-policy` | 一般的なコーディング規約 |
| `documentation-policy` | ドキュメント規約 |
| `error-handling-policy` | エラーハンドリング規約 |
| `git-policy` | Git運用規約 |
| `naming-policy` | 命名規則 |
| `performance-policy` | パフォーマンス基準 |
| `review-policy` | レビュー基準 |
| `security-policy` | セキュリティポリシー |
| `test-policy` | テスト品質基準 |

### Knowledge (8個)

| 名前 | 内容 |
|------|------|
| `architecture` | アーキテクチャ知識（ファイル構成・設計パターン・品質基準） |
| `backend` | バックエンド開発知識 |
| `frontend` | フロントエンド開発知識 |
| `security` | セキュリティ知識 |
| `testing` | テスト知識 |
| `requirements-validation` | 要件検証の分析観点（8カテゴリ、矛盾検出パターン） |
| `test-coverage-analysis` | カバレッジ分析の観点（行/ブランチ/関数） |
| `test-gap-detection` | テストギャップ検出の観点（エッジケース、スケルトン生成） |

### Instructions (10個)

| 名前 | 内容 |
|------|------|
| `design` | 設計の手順 |
| `fix` | バグ修正の手順 |
| `implement` | 実装の手順 |
| `plan` | 計画策定の手順 |
| `review` | レビューの手順 |
| `security-review` | セキュリティレビューの手順 |
| `test` | テスト作成の手順 |
| `spec-requirements` | 要件定義書の生成手順 |
| `spec-design` | 技術設計書の生成手順 |
| `spec-tasks` | 実装タスクの生成手順 |

### Contracts (9個)

| 名前 | 内容 |
|------|------|
| `design-output` | デザインの出力フォーマット |
| `implementation-output` | 実装結果の出力フォーマット |
| `plan-output` | 設計計画の出力フォーマット |
| `review-output` | レビュー結果の出力フォーマット |
| `security-review-output` | セキュリティレビューの出力フォーマット |
| `test-output` | テスト結果の出力フォーマット |
| `spec-requirements-output` | 要件定義書の出力フォーマット |
| `spec-design-output` | 技術設計書の出力フォーマット |
| `spec-tasks-output` | 実装タスクの出力フォーマット |

---

## 美術工房メタファー

ATELIERは美術工房のプロセスをメタファーとして採用しています。

| ATELIER用語 | 意味 | 例 |
|-------------|------|-----|
| **Commission** (依頼書) | ワークフロー全体の定義 | `default.yaml` |
| **Stroke** (筆致) | 個々の実行ステップ | `plan`, `implement`, `review` |
| **Medium** (画材) | AIプロバイダー | Claude Code, Codex, Gemini |
| **Palette** (パレット) | AIの役割・ペルソナ定義 | `architect`, `coder`, `reviewer` |
| **Canvas** (キャンバス) | Stroke間で共有する状態KVS | 前のStrokeの出力を次に渡す |
| **Critique** (批評) | レビュー/修正ループ | `approved` or `needs_fix` |
| **Studio** (スタジオ) | プロジェクト設定 | `.atelier/studio.yaml` |
| **Technique** (技法) | 再利用テンプレート | ビルトインCommission |
| **Repertoire** (レパートリー) | 外部テンプレートパッケージ | GitHubからインストール |

---

## ライセンス

MIT
