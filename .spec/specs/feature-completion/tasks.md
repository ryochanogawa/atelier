# 実装計画

## Phase 1: Conductor二重実装の統合（P0）

- [x] 1. commission-runner内のConductorメソッドをconductor.service.tsに委譲
  - `src/application/services/commission-runner.service.ts` の `runConductorPhase` を修正し、内部で `conductor.service.ts` の `runConductor()` を呼ぶ
  - `executeConductor` メソッドを削除
  - `extractStatusTag` メソッドを削除
  - `runConductor` の戻り値（ConductorResult）をStroke解決に変換するロジックを追加
  - import文に `conductor.service.ts` を追加
  - _要件: 1_

- [x] 1.1. Conductor統合テスト
  - `tests/unit/application/conductor-integration.test.ts` を作成
  - commission-runner経由でconductor.service.tsが呼ばれることを検証
  - approved → 次stroke遷移、needs_fix → 再実行、rules未マッチ → 通常フローのフォールバック
  - 既存テスト332件が全パスすることを確認
  - _要件: 1_ / _依存: 1_

## Phase 2: TraceabilityService完成（P1）

- [x] 2. SpecTraceExtractor作成
  - `src/application/services/spec-trace-extractor.ts` を新規作成
  - requirements.mdから `| # | 要件 |` テーブルをパースして要件IDと名前を抽出
  - design.mdから `| 要件# | 設計要素 | 変更ファイル |` テーブルをパースしてマッピング抽出
  - tasks.mdから `_要件: N_` パターンをパースしてタスク→要件の紐付け抽出
  - _要件: 2_

- [x] 2.1. SpecTraceExtractor単体テスト
  - `tests/unit/application/spec-trace-extractor.test.ts` を作成
  - 各MDフォーマットのパーステスト（正常系、空ファイル、テーブルなし）
  - 複数要件・複数タスクの紐付けテスト
  - _要件: 2_ / _依存: 2_

- [x] 2.2. spec showコマンドにトレーサビリティ表示追加
  - `src/cli/commands/spec.cmd.ts` の showサブコマンドを修正
  - requirements.md/design.md/tasks.mdを読み込みSpecTraceExtractorで抽出
  - TraceabilityServiceでマトリクス生成
  - 未カバー要件の警告表示
  - _要件: 2_ / _依存: 2, 2.1_

## Phase 3: 未使用サービスのCommission統合（P1）

- [x] 3. 要件検証用Knowledge作成
  - `src/builtin/knowledge/requirements-validation.md` を新規作成
  - RequirementsAnalyzerServiceの8カテゴリ（エラーハンドリング、セキュリティ、パフォーマンス、スケーラビリティ、運用・監視、データ管理、ユーザビリティ、テスト戦略）のチェック観点を記述
  - 矛盾検出パターン（キーワードペア、優先度相反）を記述
  - _要件: 3_

- [x] 3.1. テスト分析用Knowledge作成
  - `src/builtin/knowledge/test-coverage-analysis.md` を新規作成（カバレッジ分析の観点）
  - `src/builtin/knowledge/test-gap-detection.md` を新規作成（テストギャップ検出の観点）
  - TestAnalyzerServiceのギャップ検出ロジック（行/ブランチ/関数カバレッジ）をKnowledge化
  - _要件: 3_

- [x] 3.2. Commission YAMLにKnowledge追加
  - `src/builtin/commissions/requirements-analysis.yaml` のvalidateストロークにknowledge: [requirements-validation]を追加
  - `src/builtin/commissions/test-enhancement.yaml` のcoverageストロークにknowledge: [test-coverage-analysis]、gapsストロークにknowledge: [test-gap-detection]を追加
  - _要件: 3_ / _依存: 3, 3.1_

- [x] 3.3. Commission統合テスト
  - `tests/integration/commission-knowledge-e2e.test.ts` を作成
  - requirements-analysis/test-enhancement CommissionのYAML構造検証
  - 各strokeのknowledge参照がビルトインに存在することを検証
  - _要件: 3_ / _依存: 3.2_

## Phase 4: watch.cmd / pipeline.cmd完成（P1）

- [x] 4. watch.cmdのエラーリカバリ・shutdown確認・補完
  - `src/cli/commands/watch.cmd.ts` を読んでエラーリカバリの現状を確認
  - タスク失敗時に停止せず次タスクへ進むことを保証
  - Ctrl+C時のgraceful shutdown（実行中タスク待機）を保証
  - 不足があれば修正
  - _要件: 4_

- [x] 4.1. pipeline.cmdのエラー終了コード・stderr確認・補完
  - `src/cli/commands/pipeline.cmd.ts` を読んで終了コードの現状を確認
  - Commission失敗時にprocess.exit(1)が呼ばれることを保証
  - エラー詳細がstderrに出力されることを保証
  - 不足があれば修正
  - _要件: 4_

- [x] 4.2. watch/pipeline単体テスト
  - `tests/unit/cli/watch-pipeline.test.ts` を作成
  - watchのタスク検出・実行フロー（モック）
  - pipelineの成功/失敗時の終了コード検証
  - _要件: 4_ / _依存: 4, 4.1_

## Phase 5: serve.cmd完成（P2）

- [x] 5. JSON-RPCハンドラー実装
  - `src/infrastructure/server/handlers/commission-handler.ts` を新規作成（commission.run）
  - `src/infrastructure/server/handlers/spec-handler.ts` を新規作成（spec.list, spec.show）
  - `src/infrastructure/server/handlers/fs-handler.ts` を確認・補完（fs.read）
  - statusメソッド（サーバー状態返却）をserve.cmd内に追加
  - _要件: 5_

- [x] 5.1. serve.cmd統合
  - `src/cli/commands/serve.cmd.ts` を修正
  - 新規ハンドラーの登録
  - ポート設定（デフォルト3000、--portオプション）
  - Commission進捗イベントのブロードキャスト
  - _要件: 5_ / _依存: 5_

- [x] 5.2. serve単体テスト
  - `tests/unit/infrastructure/serve.test.ts` を作成
  - JSON-RPCリクエスト/レスポンスのパターン検証
  - ハンドラー呼び出しのモックテスト
  - _要件: 5_ / _依存: 5.1_

## Phase 6: 統合確認

- [x] 6. 全テスト実行 + 既存テスト非破壊確認
  - `cd /home/busi1234/code/atelier && pnpm test` で全テストがパスすることを確認
  - Phase 1で作成した332テストが引き続きパスすることを確認
  - TypeScriptコンパイル: `cd /home/busi1234/code/atelier && npx tsc --noEmit`
  - _要件: 1, 2, 3, 4, 5_
