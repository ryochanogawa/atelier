# 実装タスク: CLI UI リニューアル（Biohazard テーマ）

- [ ] 1. テーマ定数モジュール `src/cli/theme.ts` 新規作成
  - `COLORS` オブジェクト定義（primary, secondary, accent, muted, text, success, error, warning, info の chalk.hex インスタンス）
  - `SYMBOLS` オブジェクト定義（biohazard, success, error, warning, info, bullet, arrow, line）
  - `BORDERS` オブジェクト定義（topLeft, topRight, bottomLeft, bottomRight, horizontal, vertical, titleLeft, titleRight）
  - `TABLE_STYLE` オブジェクト定義（cli-table3 の chars 互換形式）
  - `isDecorated()` 関数実装（`outputFormat === "json"` / `NO_COLOR` / `!isTTY` で `false`）
  - _要件: 1, 9, 10_ / _依存: なし_

- [ ] 2. `src/cli/output.ts` ステータスメッセージ刷新
  - `printSuccess` / `printError` / `printWarning` / `printInfo` を theme.ts の `COLORS` + `SYMBOLS` に置換
  - `isDecorated()` による分岐を追加（false 時はプレーンテキスト出力）
  - _要件: 3, 10_ / _依存: 1_

- [ ] 3. `src/cli/output.ts` に `printHeader` / `printSectionDivider` 追加
  - `printHeader(title)`: ボックス罫線（`BORDERS`）で囲んだバナー表示。ターミナル幅40未満はタイトルのみ
  - `printSectionDivider(title)`: `═══╣ TITLE ╠═══` 形式の装飾ライン
  - `isDecorated() = false` 時はプレーンテキストまたは出力抑制
  - _要件: 2, 7_ / _依存: 1_

- [ ] 4. `src/cli/output.ts` テーブル表示刷新
  - `printTable` の `chars` を `TABLE_STYLE` で上書き
  - ヘッダー色を `COLORS.accent` に変更
  - `isDecorated() = false` 時は現行のプレーンスタイルにフォールバック
  - _要件: 4, 10_ / _依存: 1_

- [ ] 5. `src/cli/output.ts` 実行結果パネル刷新
  - `printRunResult` をボックス罫線パネル形式に改修
  - ステータスに応じた `COLORS` / `SYMBOLS` の色・シンボル分岐
  - エラー一覧もパネル内に統合
  - _要件: 5_ / _依存: 1, 2_

- [ ] 6. `src/cli/output.ts` に `createSpinner` / `printProgressBar` 追加
  - `createSpinner(text)`: ora インスタンスを `COLORS.accent` + テーマスピナースタイルで生成。非TTY時は `isEnabled: false`
  - `printProgressBar(current, total, label?)`: `[████░░░░] 3/7 strokes` 形式の進捗バー出力
  - _要件: 6, 8_ / _依存: 1_

- [ ] 7. `src/cli/index.ts` にヘッダーバナー呼び出し追加
  - preAction フック内で `printHeader` を呼び出し（`--json` 時はスキップ）
  - _要件: 2_ / _依存: 3_

- [ ] 8. コマンドファイルのテーマ統合（commission / run）
  - `commission.cmd.ts`: 直接 chalk 呼び出しを output.ts 関数に置換、`printSectionDivider` 使用
  - `run.cmd.ts`: スピナーを `createSpinner()` に置換、`printProgressBar` 使用
  - _要件: 2, 3, 6, 8_ / _依存: 3, 6_

- [ ] 9. コマンドファイルのテーマ統合（review / catalog / task）
  - `review.cmd.ts`: 直接 chalk 呼び出しを output.ts 関数に置換
  - `catalog.cmd.ts`: 直接 chalk 呼び出しを output.ts 関数に置換
  - `task.cmd.ts`: 直接 chalk 呼び出しを output.ts 関数に置換
  - _要件: 3, 4_ / _依存: 2, 4_

- [ ] 10. 残りコマンドファイルのテーマ統合
  - `studio.cmd.ts`, `medium.cmd.ts`, `log.cmd.ts`, `issue.cmd.ts`, `technique.cmd.ts`, `repertoire.cmd.ts`, `analyze.cmd.ts`, `docs.cmd.ts`, `suggest.cmd.ts`, `prompt.cmd.ts`, `branch.cmd.ts`, `pipeline.cmd.ts`, `watch.cmd.ts`, `spec.cmd.ts`, `serve.cmd.ts` の chalk 直接使用箇所を output.ts 関数に置換
  - _要件: 3_ / _依存: 2_

- [ ] 11. 単体テスト（theme.ts + output.ts）
  - theme.ts: `COLORS` / `BORDERS` / `SYMBOLS` のエクスポート検証、`isDecorated()` の `NO_COLOR` / 非TTY / JSON モード判定テスト
  - output.ts: `printHeader`, `printRunResult`, `printTable`, `printSuccess`〜`printInfo`, `printSectionDivider`, `printProgressBar` の出力検証
  - `--json` モード時に全関数が ANSI エスケープを含まないことの検証
  - _要件: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10_ / _依存: 1〜6_

- [ ] 12. スナップショットテスト・結合テスト
  - `printHeader`, `printRunResult`, `printTable` の出力スナップショット保持
  - `atelier commission list` 実行でテーマ適用テーブルが表示されることの確認
  - `NO_COLOR=1` / `--json` 時のフォールバック出力確認
  - _要件: 9, 10_ / _依存: 7〜10_
