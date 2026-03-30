# 実装計画

## Phase 1: テスト基盤 + Domain層テスト（P0）

- [x] 1. テスト基盤のセットアップ
  - `tests/unit/domain/`, `tests/unit/application/`, `tests/unit/adapters/`, `tests/integration/` ディレクトリ作成
  - `vitest.config.ts` のテストパス設定を確認・修正
  - テスト用ヘルパー（モックMediumRegistry等）を `tests/helpers/` に作成
  - _要件: 3_

- [x] 1.1. Canvas単体テスト
  - `tests/unit/domain/canvas.model.test.ts` を作成
  - get/set/has/delete の基本操作テスト
  - snapshot() → 変更 → restore() で元に戻ることを検証
  - 存在しないキーのget()がundefinedを返すことを検証
  - toJSON() の出力形式を検証
  - _要件: 2, 3_

- [x] 1.2. AggregateEvaluator単体テスト
  - `tests/unit/domain/aggregate-evaluator.test.ts` を作成
  - `all("approved")` が全一致でtrue、一部不一致でfalseを検証
  - `any("needs_fix")` がいずれか一致でtrue、全不一致でfalseを検証
  - 空のsubResultsでfalseを返すことを検証
  - `isAggregate()` の判定テスト
  - _要件: 3_

- [x] 1.3. PromptComposer単体テスト
  - `tests/unit/domain/prompt-composer.test.ts` を作成
  - Persona → systemPrompt、Knowledge → Instruction → Contract → Policy → userPrompt の合成順序を検証
  - Markdownペルソナの解決テスト
  - テンプレート変数 `{{key}}` の展開テスト
  - _要件: 3_

- [x] 1.4. CritiqueService単体テスト
  - `tests/unit/domain/critique.service.test.ts` を作成
  - error issueがあればRejected、warningのみならNeedsFix、なければApprovedを検証
  - shouldRetry(): Approved→false、Rejected→false、NeedsFix+リトライ残→trueを検証
  - _要件: 3, 6_

## Phase 2: Commission実行エンジン安定化（P0）

- [x] 2. loop_monitor判定の切り出し
  - `checkLoopMonitor()` 純粋関数を `commission-runner.service.ts` からexport（または別ファイルに切り出し）
  - 入力: monitors配列 + stroke実行履歴、出力: triggered + action
  - サイクル検出ロジックを既存コードから抽出
  - _要件: 1_

- [x] 2.1. loop_monitor単体テスト
  - `tests/unit/application/loop-monitor.test.ts` を作成
  - threshold未到達でnullを返すことを検証
  - threshold到達でtriggered=true + 正しいactionを検証
  - 複数のloop_monitorが独立に動作することを検証
  - _要件: 1, 3_

- [x] 2.2. CommissionRunner単体テスト
  - `tests/unit/application/commission-runner.test.ts` を作成
  - MediumRegistryをモックし、3stroke順次実行を検証
  - parallelストロークの並列実行と完了待ちを検証
  - Medium非ゼロ終了時のエラーハンドリングを検証
  - dry-run時にMediumが呼ばれないことを検証
  - _要件: 1, 3_

- [x] 2.3. タイムアウト時のgraceful shutdown改善
  - Medium子プロセスタイムアウト時にSIGTERM → 5秒待機 → SIGKILLのフォールバックを実装
  - `src/infrastructure/process/subprocess.ts` を修正
  - タイムアウト時のStrokeStatus.Errorが正しく設定されることを検証
  - _要件: 1_

## Phase 3: Mediumアダプタテスト（P1）

- [x] 3. Claude Codeアダプタテスト
  - `tests/unit/adapters/claude-code.adapter.test.ts` を作成
  - コマンド引数構築（`--print`, `--dangerously-skip-permissions`等）を検証
  - ファイルベースのプロンプト渡しロジックを検証
  - JSONレスポンスパース + plain textフォールバックを検証
  - _要件: 3_

- [x] 3.1. Codex/Geminiアダプタテスト
  - `tests/unit/adapters/codex.adapter.test.ts` を作成
  - `tests/unit/adapters/gemini.adapter.test.ts` を作成
  - 各プロバイダーのコマンド構築とレスポンスパースを検証
  - _要件: 3_

## Phase 4: Arpeggioテスト（P1）

- [x] 4. ArpeggioRunner単体テスト
  - `tests/unit/application/arpeggio-runner.test.ts` を作成
  - CSVパース: クォート処理、エスケープ、空行スキップを検証
  - バッチ分割: batch_size=5で10行 → 2バッチになることを検証
  - テンプレート展開: `{{batch_data}}`, `{{batch_index}}`, `{{col:N:name}}` を検証
  - セマフォ制御: concurrency=2で4バッチ → 最大2並列を検証
  - リトライ: バッチ失敗 → 指数バックオフ → 最終失敗レポートを検証
  - マージ: concat戦略の結果を検証
  - _要件: 4, 3_

## Phase 5: talk対話モード検証（P1）

- [x] 5. InteractiveSession単体テスト
  - `tests/unit/application/interactive-session.test.ts` を作成
  - セッション作成 → 会話追加 → JSON保存 → 復帰のライフサイクルを検証
  - Policy自動適用を検証
  - 会話コンテキスト構築（履歴 + 新メッセージ）を検証
  - _要件: 5, 3_

- [x] 5.1. talkコマンドフロー検証
  - `/requirements` → `/save` → `/implement` の一気通貫フローをテスト
  - `/go` での会話要約 → Commission実行への接続を検証
  - `/resume` でのセッション復帰を検証
  - _要件: 5_

## Phase 6: 仕様駆動開発（P1）

- [x] 6. SpecManagement UseCase作成
  - `src/application/use-cases/spec-management.use-case.ts` を新規作成
  - create(): 連番ID採番、spec.json + requirements.md 生成
  - generateDesign(): requirements.md読み込み → design.md 生成
  - generateTasks(): requirements.md + design.md読み込み → tasks.md 生成
  - implement(): tasks.md読み込み → implement → test → review Commission実行
  - list() / show(): 仕様書一覧・詳細表示
  - フェーズ遷移の検証（前提フェーズ未完了時のエラー）
  - _要件: 7-A_

- [x] 6.1. `atelier spec` CLIコマンド作成
  - `src/cli/commands/spec.cmd.ts` を新規作成
  - サブコマンド: create / design / tasks / implement / list / show
  - 各サブコマンドからSpecManagementUseCaseを呼び出し
  - _要件: 7-A_

- [x] 6.2. spec-writer Palette + Instruction 3点 + Contract 3点作成
  - `src/builtin/palettes/spec-writer.yaml` を作成（非エンジニア可読性、トークン効率重視のペルソナ）
  - `src/builtin/instructions/spec-requirements.md` を作成（要件定義手順）
  - `src/builtin/instructions/spec-design.md` を作成（技術設計手順）
  - `src/builtin/instructions/spec-tasks.md` を作成（タスク分解手順）
  - `src/builtin/contracts/spec-requirements-output.yaml` を作成（表形式要件、Mermaid図）
  - `src/builtin/contracts/spec-design-output.yaml` を作成（要件マッピング、構成図）
  - `src/builtin/contracts/spec-tasks-output.yaml` を作成（チェックボックス + 要件参照）
  - _要件: 7-D_

- [x] 6.3. spec-driven Commission YAML作成
  - `src/builtin/commissions/spec-driven.yaml` を作成
  - 6 stroke: requirements → design → tasks → implement → test → review
  - Canvas inputs/outputs 連携、allow_edit設定
  - _要件: 7-B_

- [x] 6.4. talk対話モードに `/spec` コマンド追加
  - `src/cli/commands/interactive.cmd.ts` に `/spec` と `/spec implement` を追加
  - `/spec`: 仕様書3点セット生成のみ
  - `/spec implement`: 仕様書生成 + 実装まで一気通貫
  - _要件: 7-C, 5_

- [x] 6.5. SpecManagement単体テスト
  - `tests/unit/application/spec-management.test.ts` を作成
  - create → design → tasks のフェーズ遷移を検証
  - 前提フェーズ未完了時のエラーを検証
  - list / show の出力を検証
  - _要件: 7-A, 3_

- [x] 6.6. spec-driven Commission統合テスト
  - `tests/integration/spec-driven-e2e.test.ts` を作成
  - `--dry-run` で6 stroke順序とCanvas連携を検証
  - 生成される仕様書のフォーマットがContract通りかを検証
  - _要件: 7-B, 3_

## Phase 7: Conductor/Critique実装（P2）

- [x] 7. parseStatusTag関数の実装とテスト
  - `[STATUS: approved]`, `[STATUS: needs_fix]`, `[STATUS: rejected]` をパースする純粋関数を実装
  - `tests/unit/domain/conductor-parser.test.ts` を作成
  - 正常パース、大文字小文字、タグ未検出時のnull返却を検証
  - _要件: 6_

- [x] 7.1. runConductor関数の実装
  - CommissionRunner内にConductor実行ロジックを追加
  - conductor palette読み込み（デフォルト: builtin/conductor）
  - 評価プロンプト合成（stroke結果 + conductor指示）
  - Medium呼び出し → parseStatusTagでステータス取得
  - _要件: 6_

- [x] 7.2. Conductor + Critique連携テスト
  - `tests/unit/application/conductor-critique.test.ts` を作成
  - Conductor approved → 次strokeへ遷移を検証
  - Conductor needs_fix → CritiqueService.shouldRetry() → stroke再実行を検証
  - max_retries超過 → on_max_retries(fail/skip/continue)を検証
  - _要件: 6, 1_

- [x] 7.3. 並列stroke + Conductor統合テスト
  - 並列strokeの結果をAggregateEvaluatorで集約 → Conductor判定の連携を検証
  - `all("approved")` / `any("needs_fix")` との組み合わせを検証
  - _要件: 6, 1_

## Phase 8: 統合確認

- [x] 8. E2Eインテグレーションテスト
  - `tests/integration/commission-e2e.test.ts` を作成
  - `--dry-run` を活用し、Commission YAML → プロンプト合成 → stroke順序の全体フローを検証
  - ビルトインCommission（default）が正しく読み込まれることを検証
  - _要件: 1, 2, 3_

- [x] 8.1. 全テスト実行 + カバレッジ確認
  - `pnpm test` で全テストがパスすることを確認
  - `pnpm test:coverage` でカバレッジレポートを生成
  - P0対象（Canvas, CommissionRunner, PromptComposer, AggregateEvaluator）のカバレッジが80%以上であることを確認
  - _要件: 3_
