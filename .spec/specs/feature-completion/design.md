# 技術設計書

## 概要

ATELIERの未完成機能5件を完成させる。既存のDDD+ヘキサゴナルアーキテクチャを維持し、既存コードの修正は最小限に抑える。

## 要件マッピング

| 要件# | 要件名 | 設計対象 | 変更種別 |
|--------|--------|----------|----------|
| 1 | Conductor二重実装の統合 | commission-runner.service.ts | 既存修正 |
| 2 | TraceabilityService完成 | traceability.service.ts, spec.cmd.ts | 拡張 + 統合 |
| 3 | 未使用サービスのCommission統合 | requirements-analysis.yaml, test-enhancement.yaml | 既存Commission改善 |
| 4 | watch.cmd / pipeline.cmd完成 | watch.cmd.ts, pipeline.cmd.ts | 既存修正 + テスト |
| 5 | serve.cmd完成 | serve.cmd.ts, ハンドラー | 既存修正 |

## 要件1: Conductor統合設計

### 方針

commission-runner内の3つのメソッド（`runConductorPhase`, `executeConductor`, `extractStatusTag`）を削除し、`conductor.service.ts`の`runConductor()`に委譲する。

### 現状の二重実装

| 項目 | commission-runner内 | conductor.service.ts |
|------|-------------------|---------------------|
| パレット読み込み | `this.loadPalette()` | `loadConductorPalette()` |
| ステータスパース | `extractStatusTag()`（最後のタグ） | `parseStatusTag()`（最初のタグ） |
| rules照合 | 直接ループ + strokes.find() | `findNextStroke()` → string |
| デフォルト動作 | undefinedを返し通常フローへ | "approved"を返す |

### 統合手順

1. commission-runner.service.tsの`runConductorPhase`を修正し、内部で`runConductor()`を呼ぶ
2. `executeConductor`メソッドと`extractStatusTag`メソッドを削除
3. `runConductor`の戻り値（ConductorResult）をcommission-runner側でStroke解決に変換

### 変更ファイル

| ファイル | 変更内容 | 新規/修正 |
|---------|---------|----------|
| `src/application/services/commission-runner.service.ts` | runConductorPhaseをconductor.service.tsに委譲、executeConductor/extractStatusTag削除 | 修正 |
| `src/application/services/conductor.service.ts` | 変更なし（そのまま活用） | - |

## 要件2: TraceabilityService設計

### 方針

既存のTraceabilityService（97行）はドメインロジックとしてそのまま活用。新たに「MD仕様書からトレースデータを抽出する」ユーティリティを追加し、`atelier spec show`と統合する。

### 新規: SpecTraceExtractor

requirements.md / design.md / tasks.md のMD構造からトレース情報を抽出する。

```typescript
// src/application/services/spec-trace-extractor.ts
export interface ExtractedTrace {
  requirements: Array<{ id: string; name: string }>;
  designMappings: Array<{ reqId: string; designElement: string; file: string }>;
  taskMappings: Array<{ taskId: string; reqIds: string[] }>;
}

export function extractTraceFromSpecs(
  requirementsMd: string,
  designMd: string | null,
  tasksMd: string | null,
): ExtractedTrace
```

抽出ロジック:
- requirements.md: `| # | 要件 |` テーブルから要件IDと名前を抽出
- design.md: `| 要件# | 設計要素 | 変更ファイル |` テーブルからマッピングを抽出
- tasks.md: `_要件: N_` パターンからタスク→要件の紐付けを抽出

### spec show への統合

`atelier spec show {ID}` 実行時に、TraceabilityServiceを呼んでマトリクスを表示。

### 変更ファイル

| ファイル | 変更内容 | 新規/修正 |
|---------|---------|----------|
| `src/application/services/spec-trace-extractor.ts` | MD仕様書からトレースデータ抽出 | 新規 |
| `src/cli/commands/spec.cmd.ts` | showサブコマンドにトレーサビリティ表示追加 | 修正 |
| `src/domain/services/traceability.service.ts` | 変更なし（そのまま活用） | - |

## 要件3: 未使用サービスのCommission統合設計

### 方針

RequirementsAnalyzer / TestAnalyzer を直接Commissionのstrokeから呼ぶのではなく、**Instruction内にサービスの活用方法を記述**し、AIが読み取って活用する方式。Commission YAMLのKnowledgeとして分析結果を注入する。

### requirements-analysis Commission改善

現状のvalidateストロークのinstructionに、RequirementsAnalyzerの分析観点を埋め込む。

```yaml
# 変更: src/builtin/commissions/requirements-analysis.yaml
strokes:
  - name: validate
    palette: requirements-analyst
    knowledge:
      - requirements-validation   # 新規Knowledge
    instruction: |
      構造化された要件を検証してください。
      ...（既存）
```

新規Knowledge `src/builtin/knowledge/requirements-validation.md`:
- RequirementsAnalyzerの8カテゴリのチェック観点を記述
- 矛盾検出パターン（キーワードペア、優先度相反）を記述

### test-enhancement Commission改善

coverageストロークとgapsストロークにTestAnalyzerの分析観点を埋め込む。

```yaml
# 変更: src/builtin/commissions/test-enhancement.yaml
strokes:
  - name: coverage
    knowledge:
      - test-coverage-analysis    # 新規Knowledge
  - name: gaps
    knowledge:
      - test-gap-detection        # 新規Knowledge
```

### 変更ファイル

| ファイル | 変更内容 | 新規/修正 |
|---------|---------|----------|
| `src/builtin/knowledge/requirements-validation.md` | 要件検証の分析観点 | 新規 |
| `src/builtin/knowledge/test-coverage-analysis.md` | カバレッジ分析の観点 | 新規 |
| `src/builtin/knowledge/test-gap-detection.md` | テストギャップ検出の観点 | 新規 |
| `src/builtin/commissions/requirements-analysis.yaml` | validateにknowledge追加 | 修正 |
| `src/builtin/commissions/test-enhancement.yaml` | coverage/gapsにknowledge追加 | 修正 |

## 要件4: watch.cmd / pipeline.cmd設計

### watch.cmd

現状（348行）を読んだ結果、基本的なフローは実装済み。不足は:
- DirectRunUseCaseとの接続確認
- エラーリカバリ（タスク失敗後に停止しない）
- graceful shutdown（Ctrl+C時の実行中タスク待機）

### pipeline.cmd

現状（204行）を読んだ結果、Commission実行とPR作成は実装済み。不足は:
- エラー時の非ゼロ終了コード保証
- stderr出力の構造化

### 変更ファイル

| ファイル | 変更内容 | 新規/修正 |
|---------|---------|----------|
| `src/cli/commands/watch.cmd.ts` | エラーリカバリ、graceful shutdown確認・補完 | 修正 |
| `src/cli/commands/pipeline.cmd.ts` | エラー終了コード、stderr出力確認・補完 | 修正 |
| `tests/unit/application/watch-pipeline.test.ts` | 主要ケースのテスト | 新規 |

## 要件5: serve.cmd設計

### 方針

既存のws-server.ts（JSON-RPC 2.0、124行）とハンドラーファイルを活用。最小限のAPI（commission.run, spec.list, spec.show, fs.read）を実装する。

### JSON-RPC APIメソッド

| メソッド | パラメータ | 動作 |
|---------|-----------|------|
| `commission.run` | `{ name, task, medium? }` | Commission実行、進捗はnotifyで配信 |
| `spec.list` | なし | .atelier/specs/ 一覧返却 |
| `spec.show` | `{ id }` | 指定specの詳細返却 |
| `fs.read` | `{ path }` | ファイル内容返却 |
| `status` | なし | サーバー状態返却 |

### 変更ファイル

| ファイル | 変更内容 | 新規/修正 |
|---------|---------|----------|
| `src/cli/commands/serve.cmd.ts` | ハンドラー登録の完成、ポート設定 | 修正 |
| `src/infrastructure/server/handlers/commission-handler.ts` | commission.run ハンドラー | 新規 |
| `src/infrastructure/server/handlers/spec-handler.ts` | spec.list/show ハンドラー | 新規 |
| `src/infrastructure/server/handlers/fs-handler.ts` | 確認・補完 | 修正 |
| `tests/unit/infrastructure/serve.test.ts` | JSON-RPCテスト | 新規 |

## エラーハンドリング

| エラー | 発生箇所 | 対処 |
|--------|---------|------|
| Conductor Medium未検出 | conductor.service.ts | デフォルトapprovedで続行（既存） |
| トレースMDパース失敗 | spec-trace-extractor | 空のExtractedTraceを返す |
| watchタスク実行失敗 | watch.cmd.ts | エラーログ → 次タスクへ |
| pipelineCommission失敗 | pipeline.cmd.ts | process.exit(1) |
| WebSocket接続エラー | ws-server.ts | エラーレスポンス送信 |

## テスト戦略

| テスト | 対象 | 方式 |
|--------|------|------|
| Conductor統合テスト | commission-runner → conductor.service | subprocessモック |
| SpecTraceExtractor | MDパース・抽出 | 純粋関数テスト |
| TraceabilityService | マトリクス生成 | 純粋関数テスト |
| Knowledge存在確認 | 新規Knowledge 3件 | ファイル存在テスト |
| Commission構造 | requirements-analysis/test-enhancement | YAML構造テスト |
| watch/pipeline | エラーリカバリ | モック統合テスト |
| serve API | JSON-RPCリクエスト/レスポンス | WebSocketモックテスト |
