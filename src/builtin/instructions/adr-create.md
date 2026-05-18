あなたは toC アーキテクトとして、技術選定 synthesis から**主要な不可逆判断について個別の ADR（Architecture Decision Record）を作成**してください。Nygard の4セクション + Squarespace の "Yes, if" 拡張を体現します。

## 入力
{{requirements}}
{{pr_faq}}
{{outcome}}
{{tech_synthesis}}

## 目的

技術選定の主要判断について、各々を**独立した ADR ファイル**として記録する。1つの ADR = 1つの不可逆度の高い判断。

## 出力すべき ADR の選定基準

以下のいずれかに該当する判断を ADR にする：
1. **DB / ORM 選択**（移行コスト > 数週間）
2. **BE フレームワーク選択**（書き換えコスト > 数週間）
3. **FE アプローチ選択**（ビルドパイプライン / ライフサイクル変化）
4. **主要ライブラリ採用**（CVE 履歴やメンテ状況が判断軸になるもの）
5. **アーキテクチャパターン採用**（Persistence Adapter / Catalog-Playback 分離等）

可逆度の低い判断（リント設定、フォーマッタ、補助スクリプト）は ADR にしない。

## 各 ADR のフォーマット（Nygard + Yes, if）

```markdown
# ADR-{NNNN}: {タイトル — 採用するもの}

- **Date**: {YYYY-MM-DD}
- **Status**: Accepted
- **Deciders**: VP of Engineering / Architect / Tech Lead

## Context

- なぜこの判断が必要になったか
- ユーザー価値（Outcome）との関係
- 制約（納期 / チーム規模 / スキル / 既存システム）
- 関連する他の ADR

## Decision

- 採用する技術 / パターン / 規律
- 採用する設定値（数値や具体名を含める）

## Consequences

### 良い結果（採用する利益）
- ...

### 受け入れる悪い結果（採用の代償）
- ...

### 不確実性が残る部分
- ...

## Alternatives Considered

### 案 A: {却下案 1}
- 検討内容：...
- 却下理由：...
- Yes, if（採用する条件）：...

### 案 B: {却下案 2}
- 検討内容：...
- 却下理由：...
- Yes, if：...

### 案 C: {却下案 3、必要なら}
- 検討内容：...
- 却下理由：...
- Yes, if：...

## Operational Impact

- 運用への影響（観測性 / セキュリティ / レジリエンス）
- 退避経路（β以降への移行パス）

## Related

- 関連 ADR / Design Doc / 仕様書
```

## 番号付け規約

- 連番、ゼロパディング 4 桁（ADR-0001, ADR-0002, ...）
- ファイル名：`{NNNN}-{kebab-case-title}.md`（例: `0001-backend-framework-hono.md`）
- タイトルは**採用するもの**を書く（「Hono を採用する」「SQLite + Drizzle を採用する」のように）

## ADR-0000 README の生成

ADR 全体の構造を示す README も生成：
- ファイル名：`README.md`（adr/ ディレクトリ直下）
- 全 ADR のリスト（番号 / タイトル / Status）
- Nygard 4 セクション + "Yes, if" 拡張の説明
- ADR 採用基準（このプロジェクトでの "ADR に書くこと/書かないこと"）

## 品質基準

- **Alternatives Considered は最低2案**（採用案以外も同精度で記述）
- **Yes, if パスを必ず書く**：採用しない選択肢の "復活条件" を明文化
- **数値で書く**：「速い」ではなく「p99 = X ms」、「安定」ではなく「99.5% uptime」
- **不可逆度の言及**：この判断の移行コストを Context か Consequences で明示
- **CVE 番号は実在のみ**：仮想 CVE を書かない

## 原則

- **採用するものをタイトルに置く**：「○○ を採用しない」はネガティブで読みにくい
- **却下理由を恥じない**：「規模が違う」「メンテモード」「LTS 無し」は正当な理由
- **将来の自分への手紙**：6ヶ月後の自分が読んで「なぜこれを選んだか」を再現できる粒度

## 保存

全 ADR を `{{project_path}}/.atelier/specs/{{spec_dir}}/adr/` ディレクトリに保存してください：
- 各 ADR: `adr/{NNNN}-{slug}.md`
- README: `adr/README.md`
