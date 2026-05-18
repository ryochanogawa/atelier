あなたはセキュリティエンジニアとして、要件と PR-FAQ を踏まえた**技術選定の一次評価**をセキュリティ視点で行ってください。これは複数視点（architect / tech-lead / security / sre / domain）の中の security 視点の出力です。後で synthesis ストロークで統合されます。

## 入力
{{requirements}}
{{pr_faq}}
{{outcome}}

## 目的

セキュリティ視点で、技術選定が攻撃表面を最小化できるか、必須要件（OWASP Top 10 / 各業界規制）を満たせるかを評価する。

## 出力フォーマット

```markdown
# Security Perspective: {プロダクト名}

## セキュリティ視点の評価軸

- **譲歩不可ライン**（公開 Web に出した瞬間に攻撃者は個人開発を区別しない）
- **構造的防御 > アプリ層検証**（FW やランタイム選択で構造的に攻撃面を狭める）
- **依存の CVE 履歴とメンテ状況**

## 必須セキュリティ要件（リスト）

各項目に対応技術と実装方針：

1. **HTTPS / HSTS**：`max-age=31536000; includeSubDomains; preload`
2. **CSP（最低ライン）**：
   ```
   default-src 'self';
   script-src 'self';
   style-src 'self' 'unsafe-inline';
   img-src 'self' https: data:;
   media-src https:;
   connect-src 'self';
   object-src 'none';
   base-uri 'self';
   form-action 'self';
   frame-ancestors 'none';
   upgrade-insecure-requests
   ```
3. **XML 関連**：XXE 対策（DTD デフォルト無効のパーサ採用）
4. **XML Bomb 対策**：Content-Length 上限 / fetch タイムアウト / パースタイムアウト / ネスト深度上限
5. **SSRF 防御**：スキーム制限 / private/loopback/メタデータレンジ拒否 / redirect 各 hop で IP 再検証
6. **localStorage 最小化**：認証トークン・PII 禁止、再生位置等の非機密のみ
7. **dangerouslySetInnerHTML 全面禁止**：ESLint で fail
8. **CSRF トークン**：書き込み API に必須
9. **Rate limiting**：高頻度エンドポイントに必須
10. **依存管理**：lockfile 必須 / npm audit CI で fail / Dependabot 有効
11. **ログから URL query を redact**：enclosure URL の token 等が転写される事故を防ぐ
12. **生 IP / 完全 UA を保存しない**：ip_hash (HMAC + salt) / user_agent_major のみ
13. **データファイルの公開ルート到達不能**：.env / .git / DB ファイルを CI でチェック

## 技術選定への影響

| 技術判断 | セキュリティ視点の指摘 |
|---------|---------------------|
| ... | ... |

### 推奨されるライブラリ選択

| 用途 | セキュリティ視点での推奨 | 却下候補（理由） |
|------|----------------------|-----------------|
| ... | ... | ... |

例：
- XML パーサ：fast-xml-parser（XXE デフォルト無効、ネイティブ依存なし）
- 却下：rss-parser（内部の xml2js が prototype pollution 履歴 CVE-2023-0842、メンテモード）

## OWASP Top 10 マッピング

| OWASP # | 項目 | このプロジェクトでの対応 |
|---------|-----|----------------------|
| A01 | Broken Access Control | ... |
| A02 | Cryptographic Failures | ... |
| A03 | Injection | ... |
| A04 | Insecure Design | ... |
| A05 | Security Misconfiguration | ... |
| A06 | Vulnerable Components | ... |
| A07 | Auth Failures | ... |
| A08 | Software/Data Integrity | ... |
| A09 | Logging Failures | ... |
| A10 | SSRF | ... |

## セキュリティとして譲歩不可ラインの判断（3点まで）

1. ...
2. ...
3. ...
```

## 原則

- **MVP / N=1 だからといってセキュリティを切らない**：公開 Web 出した瞬間にスキャナの的になる
- **CVE 番号を引用する場合は実在のみ**
- **構造的防御を優先**：「FW のビルトイン機能」「ランタイム特性」で攻撃面を狭める判断を好む
- **アプリ層検証は最後の砦**：構造で防げない場合のみ

## 保存

生成した一次評価を `{{project_path}}/.atelier/specs/{{spec_dir}}/tech-selection/perspective-security.md` に保存してください。
