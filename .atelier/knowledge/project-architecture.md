# ATELIER CLI プロジェクトアーキテクチャ

## 技術スタック
- TypeScript (strict mode, ES2022)
- Node.js 20+
- ESM (type: "module", NodeNext)
- pnpm
- Vitest (テスト)
- ESLint + Prettier (コード品質)

## アーキテクチャ
DDD (ドメイン駆動設計) + ヘキサゴナルアーキテクチャ

### レイヤー構成
```
src/
├── cli/              — CLI Layer (Commander.js)
│   └── commands/     — 各サブコマンド
├── application/      — Application Layer
│   ├── use-cases/    — ユースケース
│   ├── services/     — アプリケーションサービス
│   └── dto/          — データ転送オブジェクト
├── domain/           — Domain Layer（外部依存なし）
│   ├── models/       — エンティティ (Stroke, Canvas, Task)
│   ├── aggregates/   — 集約 (Commission, RunContext)
│   ├── services/     — ドメインサービス
│   ├── value-objects/ — 値オブジェクト (Facet, StrokeStatus)
│   ├── ports/        — ポート（インターフェース）
│   ├── events/       — ドメインイベント
│   └── errors/       — カスタムエラー
├── adapters/         — Adapter Layer
│   ├── vcs/          — Git/GitHub/GitLab アダプター
│   ├── medium/       — AI プロバイダーアダプター
│   ├── config/       — YAML 設定ローダー
│   └── plugin/       — プラグインアダプター
├── infrastructure/   — Infrastructure Layer
│   ├── fs/           — ファイルシステム操作
│   ├── process/      — サブプロセス実行
│   ├── event-bus/    — イベントバス
│   ├── notifications/ — 通知（Slack等）
│   └── server/       — WebSocket サーバー
├── builtin/          — ビルトインリソース
│   ├── commissions/  — ワークフロー定義
│   ├── palettes/     — AI ペルソナ定義
│   ├── policies/     — コーディング規約
│   ├── knowledge/    — ドメイン知識
│   ├── instructions/ — タスク指示テンプレート
│   └── contracts/    — 出力フォーマット定義
└── shared/           — 共有ユーティリティ
    ├── constants.ts  — 定数
    ├── types.ts      — 型定義
    └── utils.ts      — ユーティリティ関数
```

## 依存方向
外側 → 内側。Domain Layer は外部に依存しない。

## 主要な Port
| Port | 役割 |
|------|------|
| ConfigPort | Studio設定・Commission定義の読み込み |
| MediumPort | AIプロバイダー呼び出し |
| VcsPort | Git操作（worktree, commit, push） |
| PullRequestPort | PR/MR 作成 |
| LoggerPort | ログ出力 |

## ビルド
- `pnpm build` — TypeScript コンパイル + ビルトインリソースコピー
- `pnpm test` — Vitest 実行
- ビルトイン YAML/MD は `dist/builtin/` にコピーが必要

## コマンド実行フロー
```
CLI (Commander.js)
  → Use Case
    → CommissionRunnerService
      → composeFacetedPrompt (Persona + Knowledge + Instruction + Contract + Policy)
      → runSubprocess (bash -c "cat prompt | claude -p ...")
      → Canvas に結果格納
      → 次の Stroke へ
```
