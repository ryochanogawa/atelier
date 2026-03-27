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

**ATELIER** (アトリエ) は、AIコーディングエージェントを**YAMLで定義したワークフロー**に沿って自動実行するCLIツールです。

普段使っている Claude Code や Codex、Gemini CLI をそのまま活用し、**APIキー不要・サブスクリプションだけ**で動作します。

---

## Why ATELIER? / なぜATELIERを使うのか

### 1. AIエージェントを「チーム」として動かせる

1人のAIに全部任せるのではなく、**設計者・実装者・テスター・レビュアー**のように役割を分けて順番に、あるいは並列に動かせます。

```
Plan (設計者)  →  Implement (実装者)  →  Review (レビュアー)
                                            │
                                     needs_fix? → Implement に戻る
                                     approved?  → 完了
```

### 2. APIキーの管理が不要

既にサブスクリプションで使っているCLIツールをそのまま呼び出します。APIキーの発行・管理・コスト管理から解放されます。

```
ATELIER
  ├──→ claude --print ...     (Claude Pro/Max/Team)
  ├──→ codex --quiet ...      (ChatGPT Plus/Pro)
  └──→ gemini --prompt ...    (Google AI subscription)
```

### 3. ワークフローをYAMLで再現可能にする

「良い結果が出たプロンプトの組み合わせ」をYAMLに保存し、チームで共有・再利用できます。属人的なプロンプト職人芸から脱却します。

### 4. レビュー・修正を自動でループさせる

AIの出力を別のAIがレビューし、問題があれば自動で修正に戻す**Critique（批評）サイクル**を組み込めます。人間が介入しなくても品質が上がります。

### 5. 安全にコードを変更する

Git worktree で**隔離された作業環境**を自動作成。メインブランチを汚さず、完了後にマージかPR作成を選べます。

### 6. 開発のボトルネックを丸ごと自動化する

ATELIERはコードを書くだけのツールではありません。AI普及後に顕在化する**8つのボトルネック**を解消する専用機能を内蔵しています。

| ボトルネック | ATELIERの解決策 | コマンド |
|-------------|----------------|---------|
| レビュー負荷の爆増 | 差分リスクスコアリング + Linter統合 + Policy自動判定 | `atelier review gate` |
| 要件定義の曖昧さ | AI対話型インタビュー + 矛盾/抜け漏れ自動検出 | `atelier talk` → `/requirements` |
| プロンプトスキルの格差 | 意図補完 + Palette/Commission自動提案 | `atelier suggest` |
| セキュリティリスク | npm audit統合 + ライセンススキャン + SBOM生成 | `atelier review scan` |
| テスト品質の属人化 | カバレッジギャップ分析 + E2Eシナリオ自動生成 | `atelier commission run test-enhancement` |
| レガシーの壁 | コードベース解析 + マイグレーション計画自動生成 | `atelier analyze` |
| ドキュメントの陳腐化 | 鮮度スコア + コミット連動ドキュメント更新 | `atelier docs audit` |
| 承認フローの遅さ | リスク自動評価 + Policy as Code + 低リスク自動承認 | `atelier review gate` |

---

## 30秒でわかるATELIER

```bash
# 1. インストール
pnpm install && pnpm build

# 2. プロジェクトを初期化
atelier studio init

# 3. AIと対話して要件を整理
atelier talk

# 4. ワークフローを実行
atelier commission run default

# 5. 完了したらPR作成
atelier branch merge atelier/my-feature
```

---

## Core Concepts / 基本概念

### Subscription-based Architecture

APIキーではなく、ユーザーが既にサブスクリプションを持つCLIツールをサブプロセスとして呼び出します。

| Medium | CLI | 認証 | 用途 |
|--------|-----|------|------|
| **Claude Code** (default) | `claude --print` | Claude Pro/Max/Team | 汎用コーディング |
| **Codex** | `codex --quiet` | OpenAI subscription | OpenAI系タスク |
| **Gemini** | `gemini --prompt` | Google AI subscription | Google系タスク |

### Faceted Prompting / プロンプトの関心分離

巨大な1枚プロンプトを書く代わりに、5つの独立したファセット（関心）に分離して管理します。

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

Policyを末尾に配置するのは、LLMが直前の情報に強く影響される傾向を活用するためです。

### Art Studio Metaphor / 美術工房メタファー

ATELIERは美術工房のプロセスをメタファーに採用しています。

| ATELIER用語 | 意味 | 例 |
|-------------|------|-----|
| **Commission** (依頼書) | ワークフロー全体の定義 | `plan-implement-review.yaml` |
| **Stroke** (筆致) | 個々の実行ステップ | `plan`, `implement`, `review` |
| **Medium** (画材) | AIプロバイダー | Claude Code, Codex, Gemini |
| **Palette** (パレット) | AIの役割・性格の定義 | `architect`, `coder`, `reviewer` |
| **Canvas** (キャンバス) | Stroke間で共有する状態KVS | 前のStrokeの出力を次に渡す |
| **Critique** (批評) | レビュー/修正ループ | `approved` or `needs_fix` |
| **Studio** (スタジオ) | プロジェクト設定 | `.atelier/studio.yaml` |
| **Technique** (技法) | 再利用テンプレート | ビルトインCommission |

---

## Installation / インストール

### From Source

```bash
git clone https://github.com/ryochanogawa/atelier.git
cd atelier
make all    # pnpm install + pnpm build
```

### Docker

```bash
make docker-build
make docker-run ARGS="--help"
```

Docker環境では、ホストのCLI設定（`~/.claude` 等）をマウントしてサブスクリプション認証を引き継ぎます。

### Prerequisites / 前提条件

- **Node.js 20+**
- **pnpm**
- 以下のいずれか1つ以上のCLI（サブスクリプション済み）:
  - [Claude Code](https://claude.ai/download) — `claude` コマンド
  - [Codex CLI](https://github.com/openai/codex) — `codex` コマンド
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) — `gemini` コマンド
- **Git** — worktree機能に必要
- **GitHub CLI** (`gh`) — Issue連携・PR作成に必要（任意）

---

## Getting Started / はじめかた

### Step 1: プロジェクトの初期化

```bash
cd your-project
atelier studio init
```

`.atelier/` ディレクトリが作成され、サンプルのCommission・Palette・Policyが展開されます。

```
your-project/
└── .atelier/
    ├── studio.yaml           # Medium設定・デフォルト値
    ├── commissions/          # ワークフロー定義
    │   └── sample.yaml
    ├── palettes/             # ペルソナ定義（YAML or Markdown）
    │   ├── coder.yaml
    │   └── senior-engineer.md
    ├── policies/             # 制約・ポリシー
    ├── contracts/            # 出力形式の規約
    ├── knowledge/            # 参照知識・ドキュメント
    └── logs/                 # 実行ログ（NDJSON）
```

### Step 2: 利用可能なMediumを確認

```bash
atelier medium check
```

```
┌──────────────┬───────────┬─────────┐
│ Medium       │ Available │ Version │
├──────────────┼───────────┼─────────┤
│ claude-code  │ ✓         │ 1.0.12  │
│ codex        │ ✓         │ 0.1.0   │
│ gemini       │ ✗         │ -       │
└──────────────┴───────────┴─────────┘
```

### Step 3: ビルトインCommissionを使ってみる

```bash
# 何が使えるか確認
atelier technique list

# default Commission を実行（plan → implement → test → review）
atelier commission run default
```

### Step 4: AIと対話して要件を整理する

```bash
atelier talk
```

```
🎨 ATELIER Interactive Session
Type your message. Special commands: /queue, /run, /list, /exit,
  /requirements, /analyze, /suggest

You > ユーザー認証のAPIを追加したい

AI  > 承知しました。JWT認証でよろしいですか？エンドポイントは...

You > /requirements

📋 Requirements Interview Mode
AI  > いくつか質問させてください。
      1. 認証方式はJWT/OAuth/Session のどれですか？
      2. リフレッシュトークンは必要ですか？
      3. 多要素認証(MFA)は対応しますか？
      ...

You > /analyze

📊 Requirements Analysis
  Functional:    5 requirements (3 must, 2 should)
  Non-Functional: 2 requirements
  Contradictions: 0
  Gaps detected:  2 (error handling, rate limiting)

You > /queue JWT認証API実装

✓ Task queued: JWT認証API実装 (task-a1b2c3)

You > /run

⠋ Running queued tasks...
```

---

## Usage / 使い方

### Commission の実行

```bash
# 基本実行
atelier commission run plan-implement-review

# ドライラン（AIを呼び出さずにワークフローを検証）
atelier commission run plan-implement-review --dry-run

# Mediumを指定
atelier commission run plan-implement-review --medium codex

# 実行後に自動でPR作成
atelier commission run plan-implement-review --auto-pr
```

### タスクキュー

複数のタスクをキューに入れて一括実行できます。

```bash
# タスクを追加
atelier task add "ログイン画面のバリデーション修正"
atelier task add "APIレスポンスのキャッシュ実装" --commission backend

# キュー確認
atelier task list

# 一括実行
atelier task run
```

### GitHub Issue 連携

```bash
# Issue #42 をCommissionで実行
atelier issue run 42

# Issue をタスクキューに追加
atelier issue add 42
atelier issue add 43
atelier task run    # まとめて実行
```

### ブランチ管理

ATELIERは各タスクをGit worktreeで隔離実行します。完了後のブランチを管理できます。

```bash
# 一覧
atelier branch list

# メインブランチにマージ
atelier branch merge atelier/jwt-auth

# やり直し
atelier branch retry atelier/jwt-auth

# 不要なブランチを削除
atelier branch delete atelier/old-feature
```

### CI/CD パイプライン

```bash
# CI環境での自動実行 + PR作成
atelier pipeline run default --auto-pr --task "Fix security vulnerability"
```

GitHub Actions での使用例:

```yaml
- name: Run ATELIER
  run: |
    atelier pipeline run default \
      --auto-pr \
      --task "${{ github.event.issue.title }}" \
      --json
```

### ビルトイン Technique

ATELIERには9つのビルトインCommissionが付属しています。

**開発ワークフロー:**

| Name | Strokes | 用途 |
|------|---------|------|
| `default` | plan → implement → test → review | 汎用開発 |
| `frontend` | design → implement → visual-review | フロントエンド |
| `backend` | plan → implement → api-test → security-review | バックエンド |
| `fullstack` | plan → backend → frontend → integration-test → review | フルスタック |

**品質・分析ワークフロー:**

| Name | Strokes | 用途 |
|------|---------|------|
| `review-gate` | scan → diff → risk → policy → approval | 自動レビューゲート |
| `requirements-analysis` | interview → structure → validate → finalize | 構造化要件定義 |
| `test-enhancement` | coverage → gaps → generate → verify | テスト品質向上 |
| `legacy-analysis` | scan → assess → plan → document | レガシーコード分析 |
| `doc-refresh` | audit → prioritize → update → verify | ドキュメント刷新 |

```bash
# ビルトインをローカルにコピーしてカスタマイズ
atelier technique eject default
# → .atelier/commissions/default.yaml が作成される
```

### Repertoire（外部テンプレート）

GitHubからCommissionテンプレートパッケージをインストールできます。

```bash
atelier repertoire add https://github.com/example/atelier-templates
atelier repertoire list
atelier repertoire remove atelier-templates
```

---

## Review Gate / 自動レビューゲート

コードの変更をマージ前に自動で多角的にチェックする仕組みです。

```bash
# 差分分析 → リスクスコア表示
atelier review diff
```

```
📊 Diff Analysis
  Files changed:   12
  Additions:       +342
  Deletions:       -28
  Complexity:      67/100

⚠️  Risk Assessment: MEDIUM (score: 54/100)
  Factors:
    - Large number of files changed (weight: 15)
    - Configuration files modified (weight: 12)
    - Low test coverage for changes (weight: 10)

  Impact:
    - Affected: src/auth/, src/api/middleware/
    - Review scope: authentication logic, middleware chain
    - Test scope: auth unit tests, integration tests
```

```bash
# セキュリティスキャン（脆弱性 + ライセンス + SBOM）
atelier review scan
```

```
🔒 Security Scan
  Vulnerabilities:  2 (1 high, 1 moderate)
  License issues:   0
  SBOM generated:   sbom.cdx.json (CycloneDX)

  HIGH: prototype-pollution in lodash@4.17.20
    → Fix: npm update lodash
```

```bash
# フルレビューゲート（スキャン + 差分 + Lint + ポリシー判定）
atelier review gate
```

```
🚦 Review Gate Result
  Security scan:    ✓ PASS
  Diff analysis:    ⚠ MEDIUM RISK (54)
  Linter:           ✓ 0 errors, 3 warnings
  Policy check:     ✓ APPROVED (auto-approvable: false)
    → Required approvers: 1 senior engineer
```

---

## Suggest / プロンプト支援

プロンプトスキルの差を埋め、誰でも最適なワークフローを選べるようにします。

```bash
# タスク内容から最適なPaletteを提案
atelier suggest palette "REST APIのセキュリティレビューをしたい"
```

```
🎨 Palette Suggestions
  1. security-reviewer  (score: 92) — セキュリティ観点の専門レビュー
  2. reviewer           (score: 78) — 汎用コードレビュー
  3. tester             (score: 45) — テスト設計
```

```bash
# タスク内容から最適なCommissionを提案
atelier suggest commission "レガシーなPHPコードをNode.jsに移行したい"
```

```
📋 Commission Suggestions
  1. legacy-analysis    (score: 95) — コードベース分析 + マイグレーション計画
  2. fullstack          (score: 60) — フルスタック開発ワークフロー
```

```bash
# 曖昧なプロンプトを自動強化
atelier suggest enhance "ログイン機能を作って"
```

```
✨ Enhanced Prompt
  Original: ログイン機能を作って
  Enhanced: ログイン機能を作って

  Added contexts:
  + [error-handling] エラーハンドリング（認証失敗、ネットワークエラー等）を考慮してください
  + [security] セキュリティ（パスワードハッシュ、CSRF対策、レート制限等）を考慮してください
  + [edge-case] エッジケース（空入力、特殊文字、同時ログイン等）を考慮してください
  + [testing] テスト（ユニットテスト、認証成功/失敗のシナリオ）を考慮してください
```

---

## Analyze / コードベース分析

レガシーシステムの理解とマイグレーション計画を支援します。

```bash
# コードベース構造分析
atelier analyze codebase .
```

```
📦 Codebase Structure
  Total files:     234
  Total lines:     18,420
  Detected stack:  TypeScript, React, Express, PostgreSQL

  File distribution:
    .ts   142 files  (12,300 lines)
    .tsx   52 files  ( 4,200 lines)
    .json  18 files  (   800 lines)
    .yaml  12 files  (   320 lines)

  Entry points:    src/index.ts, src/server.ts
  Config files:    tsconfig.json, .eslintrc, docker-compose.yaml
```

```bash
# 依存関係分析
atelier analyze dependencies .
```

```
📡 Dependency Analysis
  Direct:       42 packages
  Transitive:   387 packages
  Outdated:     8 packages
  Vulnerable:   2 packages

  Outdated:
    express     4.18.2 → 5.0.1
    lodash      4.17.20 → 4.17.21 (security fix)
```

```bash
# ファイル複雑度分析
atelier analyze complexity src/auth/service.ts
```

```
🔍 File Complexity: src/auth/service.ts
  Lines:        342
  Functions:    18
  Classes:      2
  Imports:      14 (high coupling)
  TODOs:        3 (2 FIXME, 1 HACK)
  Score:        72/100 (high complexity)
```

```bash
# マイグレーション計画生成
atelier analyze migration --target "Node.js 20 + Fastify"
```

```
🗺️ Migration Plan (3 phases)

  Phase 1: Foundation (low risk)
    - Update Node.js to v20
    - Replace Express with Fastify
    - Update TypeScript to 5.x

  Phase 2: Core Migration (medium risk)
    - Migrate middleware chain
    - Update database drivers
    - Migrate authentication module

  Phase 3: Verification (low risk)
    - Update all tests
    - Performance benchmarking
    - Security audit
```

---

## Docs / ドキュメント管理

ドキュメントの陳腐化を検出し、自動で最新状態を維持します。

```bash
# ドキュメント鮮度チェック
atelier docs audit
```

```
📄 Document Freshness Audit
┌─────────────────────────────┬────────┬───────────────────┬──────────┐
│ Document                    │ Status │ Last Modified      │ Score    │
├─────────────────────────────┼────────┼───────────────────┼──────────┤
│ docs/api-reference.md       │ stale  │ 2025-08-12 (228d) │ 12/100   │
│ docs/setup-guide.md         │ aging  │ 2026-02-01 (54d)  │ 55/100   │
│ README.md                   │ fresh  │ 2026-03-25 (2d)   │ 98/100   │
│ CONTRIBUTING.md             │ stale  │ 2025-06-30 (270d) │ 5/100    │
└─────────────────────────────┴────────┴───────────────────┴──────────┘

  Fresh: 1  Aging: 1  Stale: 2  Obsolete: 0
  ⚠ 2 documents need attention
```

```bash
# ソースからドキュメント生成
atelier docs generate src/auth/service.ts

# プロジェクト内のナレッジ収集
atelier docs knowledge

# ドキュメント一括刷新 Commission
atelier docs refresh
```

---

## Commission YAML Reference / Commission定義リファレンス

### 基本構造

```yaml
commission:
  name: plan-implement-review
  description: 計画→実装→レビューの標準ワークフロー
  initial_stroke: plan
  max_strokes: 15

strokes:
  - name: plan
    palette: architect        # 使用するペルソナ
    medium: claude-code       # 使用するAI（省略時はデフォルト）
    allow_edit: false         # ファイル編集の許可
    instruction: |
      以下のタスクについて実装計画を立ててください。
      ファイル構成、実装手順、テスト計画を含めてください。
    transitions:
      - condition: planning_complete
        next: implement

  - name: implement
    palette: coder
    allow_edit: true
    instruction: |
      計画に基づいてコードを実装してください。
    transitions:
      - condition: implementation_complete
        next: review

  - name: review
    palette: reviewer
    allow_edit: false
    instruction: |
      実装されたコードをレビューしてください。
    transitions:
      - condition: approved
        next: COMPLETE       # ワークフロー完了
      - condition: needs_fix
        next: implement      # 実装に戻る
        max_retries: 3       # 最大3回まで
```

### 並列Stroke実行

`depends_on` で依存関係を定義すると、独立したStrokeが**並列実行**されます。

```yaml
strokes:
  - name: implement
    palette: coder
    allow_edit: true
    instruction: コードを実装してください
    transitions:
      - condition: implementation_complete
        next: parallel_reviews

  # ↓ 2つのレビューが並列で実行される
  - name: code-review
    palette: reviewer
    depends_on: [implement]        # implement完了後に開始
    instruction: コード品質をレビュー

  - name: security-review
    palette: security-reviewer
    depends_on: [implement]        # implement完了後に開始
    instruction: セキュリティをレビュー

  # ↓ 両方のレビュー完了後に実行
  - name: merge-reviews
    palette: architect
    depends_on: [code-review, security-review]
    instruction: レビュー結果を統合して最終判定
    transitions:
      - condition: approved
        next: COMPLETE
      - condition: needs_fix
        next: implement
```

### Palette定義（YAMLとMarkdown）

**YAML形式** (`.atelier/palettes/coder.yaml`):
```yaml
name: coder
description: 実装担当エンジニア
persona: |
  あなたは10年以上の経験を持つシニアソフトウェアエンジニアです。
  クリーンコード、テスト駆動開発、SOLID原則を重視します。
policies:
  - coding-standards
  - security
```

**Markdown形式** (`.atelier/palettes/senior-engineer.md`):
```markdown
---
name: senior-engineer
description: シニアエンジニアペルソナ
medium: claude-code
---

# Senior Software Engineer

あなたは15年以上の実務経験を持つシニアソフトウェアエンジニアです。

## 行動指針
- コードレビューでは建設的なフィードバックを心がける
- パフォーマンスとセキュリティを常に意識する
- ジュニアメンバーの成長を支援する視点を持つ
```

---

## CLI Command Reference / コマンドリファレンス

### Core

```bash
atelier studio init              # .atelier/ を初期化
atelier studio check             # 設定を検証
atelier medium list              # Medium一覧
atelier medium check             # 可用性チェック
```

### Workflow

```bash
atelier commission run <name>    # 実行 [--dry-run] [--medium] [--auto-pr] [--tui]
atelier commission list          # 一覧
atelier commission validate <n>  # YAML検証
atelier talk                     # 対話モード → /queue /run /list /exit
                                 #   /requirements /analyze /suggest
```

### Task & Issue

```bash
atelier task add <desc>          # キューに追加 [--commission <name>]
atelier task list                # 一覧
atelier task run                 # 一括実行
atelier task remove <id>         # 削除
atelier issue run <number>       # Issue実行 [--commission <name>]
atelier issue add <number>       # Issueをキューに追加
```

### Branch & Pipeline

```bash
atelier branch list              # atelier/ ブランチ一覧
atelier branch merge <name>      # マージ
atelier branch delete <name>     # 削除
atelier branch retry <name>      # 再実行
atelier pipeline run <name>      # CI/CDモード [--auto-pr] [--task] [--json]
```

### Review Gate

```bash
atelier review diff              # 差分分析 + リスクスコア
atelier review scan              # セキュリティスキャン（脆弱性 + ライセンス + SBOM）
atelier review gate              # フルレビューゲート（scan + diff + lint + policy）
```

### Analyze

```bash
atelier analyze codebase [path]  # コードベース構造分析
atelier analyze dependencies     # 依存関係分析
atelier analyze complexity <f>   # ファイル複雑度分析
atelier analyze migration        # マイグレーション計画 [--target <stack>]
```

### Docs

```bash
atelier docs audit [path]        # ドキュメント鮮度チェック
atelier docs generate <file>     # ソースからドキュメント生成
atelier docs knowledge [path]    # ナレッジ収集
atelier docs refresh             # ドキュメント一括刷新
```

### Suggest

```bash
atelier suggest palette <desc>   # 最適Palette提案
atelier suggest commission <d>   # 最適Commission提案
atelier suggest enhance <prompt> # プロンプト自動強化
```

### Template & Package

```bash
atelier technique list           # ビルトイン一覧
atelier technique eject <name>   # ローカルにコピー [--force]
atelier repertoire add <url>     # GitHubからインストール
atelier repertoire list          # 一覧
atelier repertoire remove <n>    # 削除
```

### Log

```bash
atelier log show <run-id>        # ログ表示
atelier log tail                 # 最新ログ
```

### Make Shortcuts

```bash
# Setup
make all                                # install + build
make check                              # typecheck + lint + test
make docker-build                       # Dockerイメージビルド

# Workflow
make talk                               # 対話モード
make commission-run NAME=default        # Commission実行
make commission-run-pr NAME=default     # 実行 + PR作成
make task-add DESC="バグ修正"            # タスク追加
make task-run                           # キュー一括実行
make issue-run NUM=42                   # Issue実行

# Review & Analysis
make review-gate                        # フルレビューゲート
make review-scan                        # セキュリティスキャン
make review-diff                        # 差分リスクスコア
make analyze-codebase                   # コードベース分析
make analyze-migration TARGET=fastify   # マイグレーション計画
make docs-audit                         # ドキュメント鮮度チェック

# Suggest
make suggest-palette DESC="APIレビュー"  # Palette提案
make suggest-enhance PROMPT="ログイン機能作って"
```

---

## Architecture / アーキテクチャ

### DDD + Hexagonal Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CLI Layer (Commander.js)                                                │
│  commission ── talk ── task ── review ── analyze ── docs ── suggest      │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    Application Layer         │
                    │  CommissionRunUseCase        │
                    │  InteractiveSessionUseCase   │
                    │  QueueTaskUseCase            │
                    │  CreatePRUseCase             │
                    │  PipelineRunUseCase          │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    Domain Layer              │
                    │                              │
                    │  Aggregates:                 │
                    │    Commission, RunContext    │
                    │                              │
                    │  Services:                   │
                    │    EaselService         (Workflow FSM)     │
                    │    PromptComposer       (Faceted Prompting)│
                    │    CritiqueService      (Review Loop)      │
                    │    DiffAnalyzer         (Risk Scoring)     │
                    │    PolicyEngine         (Auto Approval)    │
                    │    SecurityScanner      (Vuln + SBOM)      │
                    │    RequirementsAnalyzer (Gap Detection)    │
                    │    TestAnalyzer         (Coverage Gaps)    │
                    │    IntentEnhancer       (Prompt Assist)    │
                    │    CodebaseAnalyzer     (Legacy Analysis)  │
                    │    DocManager           (Freshness Score)  │
                    │    Traceability         (Req Tracing)      │
                    │    LinterIntegration    (ESLint + TSC)     │
                    └──────────────┬──────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
┌────────▼────────┐  ┌────────────▼──────────┐  ┌───────────▼───────────┐
│ Medium Adapters │  │ VCS Adapters          │  │ Config / Logger       │
│ Claude Code     │  │ Git Worktree          │  │ YAML + Markdown Loader│
│ Codex           │  │ GitHub PR             │  │ NDJSON + Console Log  │
│ Gemini          │  │ GitHub Issue          │  │ Zod Schemas           │
└─────────────────┘  └─────────────────────┘  └───────────────────────┘
```

### Source Directory (113 TypeScript files, 25 builtin YAML)

```
src/
├── domain/                     # DDD Domain Layer
│   ├── aggregates/             #   Commission, RunContext
│   ├── models/                 #   Stroke, Canvas, Palette, Critique, Task, Repertoire
│   ├── value-objects/          #   Facet, Transition, RiskAssessment, Requirements,
│   │                           #   TestAnalysis, SecurityScan, Documentation, ...
│   ├── services/               #   Easel, PromptComposer, Critique, DiffAnalyzer,
│   │                           #   PolicyEngine, SecurityScanner, RequirementsAnalyzer,
│   │                           #   TestAnalyzer, IntentEnhancer, CodebaseAnalyzer,
│   │                           #   DocManager, Traceability, LinterIntegration
│   ├── ports/                  #   MediumPort, VcsPort, LoggerPort, ConfigPort,
│   │                           #   IssueTrackerPort, PullRequestPort
│   ├── events/                 #   DomainEvent, CommissionEvents, StrokeEvents
│   └── errors/                 #   AtelierError hierarchy
├── application/                # Application Layer
│   ├── use-cases/              #   RunCommission, Interactive, QueueTask, CreatePR,
│   │                           #   RunIssue, PipelineRun, ManageBranches, EjectCommission,
│   │                           #   ManageRepertoire, ValidateCommission, CheckMedium, InitStudio
│   ├── services/               #   CommissionRunner
│   └── dto/                    #   RunResult
├── adapters/                   # Adapter Layer
│   ├── medium/                 #   ClaudeCode, Codex, Gemini, MediumRegistry
│   ├── vcs/                    #   Git, GitHubPR, GitHubIssue
│   ├── config/                 #   YamlLoader, MarkdownLoader, TaskStore, Zod Schemas
│   ├── logger/                 #   NDJSONLogger, ConsoleLogger
│   └── plugin/                 #   RepertoireAdapter
├── builtin/                    # Built-in Templates (25 YAML files)
│   ├── commissions/            #   default, frontend, backend, fullstack,
│   │                           #   review-gate, requirements-analysis,
│   │                           #   test-enhancement, legacy-analysis, doc-refresh
│   ├── palettes/               #   planner, coder, tester, reviewer, designer,
│   │                           #   security-reviewer, risk-assessor, policy-checker,
│   │                           #   interviewer, requirements-analyst, legacy-analyst,
│   │                           #   technical-writer
│   ├── policies/               #   default, security, test
│   └── contracts/              #   review-output
├── infrastructure/             # Infrastructure
│   ├── process/                #   Subprocess wrapper (execa)
│   ├── event-bus/              #   TypedEventEmitter
│   └── fs/                     #   FileSystem utilities
├── cli/                        # CLI Layer (15 command modules)
│   ├── commands/               #   commission, studio, medium, talk, task, issue,
│   │                           #   branch, pipeline, technique, repertoire, log,
│   │                           #   review, analyze, docs, suggest
│   └── output.ts              #   Formatters (table, JSON)
└── shared/                     # Shared
    ├── types.ts                #   Branded types, common interfaces
    ├── constants.ts            #   Defaults, directory names
    └── utils.ts                #   generateRunId, formatDuration
```

---

## Docker / Docker環境

### Production

```bash
make docker-build
make docker-run ARGS="commission run default"
```

### Development (hot-reload)

```bash
docker compose run --rm atelier-dev pnpm dev -- commission run default
```

`docker-compose.yaml` はホストの CLI 設定（`~/.claude`, `~/.config`）を読み取り専用でマウントするため、コンテナ内でもサブスクリプション認証がそのまま使えます。

---

## License

MIT
