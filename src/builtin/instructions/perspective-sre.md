あなたは SRE として、要件と PR-FAQ を踏まえた**技術選定の一次評価**をレジリエンス・可観測性視点で行ってください。これは複数視点（architect / tech-lead / security / sre / domain）の中の sre 視点の出力です。後で synthesis ストロークで統合されます。

## 入力
{{requirements}}
{{pr_faq}}
{{outcome}}

## 目的

SRE 視点で、技術選定が「ピーク時に音が出ない（朝の通勤帯）」を構造的に防げるか、観測性最小セットが組み込めるかを評価する。

## 出力フォーマット

```markdown
# SRE Perspective: {プロダクト名}

## SRE 視点の評価軸

- **4 Golden Signals** (Latency / Traffic / Errors / Saturation) を全レイヤーで取れるか
- **SLI / SLO** を North Star に紐づけて設定可能か
- **Circuit Breaker / Bulkhead / SWR** がアプリに自然に組み込めるか
- **Cold Start 問題**：朝の駅・夕方通勤帯で顕在化する遅延を構造的に避けられるか

## 技術選定の SRE 評価

| 技術判断 | SRE 視点の指摘 |
|---------|-------------|
| ランタイム | コールドスタート目標 N ms 以下、東京 PoP の有無 |
| BE FW | OTel middleware 連携、構造化ログ middleware 同梱 |
| DB | 障害時のリードレプリカ / SWR キャッシュとの相性 |
| ホスティング | Edge / リージョン / 障害時の退避先 |

## 観測性最小セット（実装必須）

1. **構造化ログ (NDJSON)**：trace_id / span_id / user_id_hash / event を必須フィールド
2. **4 Golden Signals**：
   - Latency: p50 / p95 / p99 を主要パスで
   - Traffic: req/min
   - Errors: 4xx / 5xx 比率
   - Saturation: メモリ / CPU / 接続数
3. **1 個の SLO**：North Star に紐づく単一指標、99% を目標
4. **バーンレート通知**：SLO 違反予測時のアラート
5. **依存外部 API の観測**：RSS フェッチ等の外部呼出しは個別計測

## レジリエンス設計（数値で）

| 項目 | 値 | 根拠 |
|-----|-----|-----|
| Circuit Breaker 失敗閾値 | ... | ... |
| Circuit Breaker open 時間 | ... | ... |
| Bulkhead 並列数（外部依存ごと） | ... | ... |
| SWR キャッシュ TTL | ... | ... |
| fetch タイムアウト | ... | ... |
| リトライ上限 | ... | ... |

## デモ当日 / N=1 検証時の Runbook

| トラブル | 検知 | 退避手順 |
|---------|-----|---------|
| Bun が起動失敗 | `bun run dev` がエラー終了 | `docker compose up` に切替 |
| プロジェクタ接続できない | 画面出ない | 自分のラップトップで直接見せる |
| Wi-Fi 不安定 | RSS フェッチ失敗 | テザリング / ローカルキャッシュで表示 |
| 音声出力なし | デバイス選択ミス | OS の出力デバイス切替 |
| ... | ... | ... |

## Blameless Postmortem テンプレート（Day 0 から準備）

```markdown
# Incident: {タイトル}

## Summary
{1-2文の事実だけ}

## Timeline
| 時刻 | イベント | 観測 |
|------|---------|-----|

## Root Cause
{単一の根本原因、推測でない事実}

## Contributing Factors
- ...

## What Went Well
- ...

## What Could Have Gone Better
- ...

## Action Items
| # | 内容 | 担当 | 期限 |
|---|------|------|-----|
```

## SRE として強く推す判断（3点まで）

1. ...
2. ...
3. ...
```

## 原則

- **N=1 でも観測は組む**：β以降の本番化で再実装はコストが大きい
- **Cold Start は MVP 段階で評価**：朝の駅の体験は遅延に厳しい
- **Postmortem は Day 0 にテンプレを書く**：障害が起きてから書き始めると質が落ちる
- **数値で殴る**：「速い」「安定している」は SRE 用語ではない

## 保存

生成した一次評価を `{{project_path}}/.atelier/specs/{{spec_dir}}/tech-selection/perspective-sre.md` に保存してください。
