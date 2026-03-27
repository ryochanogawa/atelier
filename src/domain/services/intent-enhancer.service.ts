/**
 * IntentEnhancer Domain Service
 * 曖昧なプロンプトを具体化し、最適なPalette/Commissionを提案する。
 */

import type {
  EnhancedPrompt,
  AddedContext,
  PaletteSuggestion,
  CommissionSuggestion,
} from "../value-objects/intent-enhancement.vo.js";

/** 補完観点の定義 */
interface PerspectiveRule {
  readonly category: string;
  readonly keywords: string[];
  readonly promptAddition: string;
}

/** ビルトインPaletteのメタデータ */
interface PaletteMeta {
  readonly name: string;
  readonly description: string;
  readonly keywords: string[];
}

/** ビルトインCommissionのメタデータ */
interface CommissionMeta {
  readonly name: string;
  readonly description: string;
  readonly keywords: string[];
}

const PERSPECTIVE_RULES: ReadonlyArray<PerspectiveRule> = [
  {
    category: "エラーハンドリング",
    keywords: ["エラー", "例外", "失敗", "error", "exception", "try", "catch"],
    promptAddition:
      "エラー発生時の処理（リトライ、フォールバック、ユーザーへの通知）も考慮してください。",
  },
  {
    category: "エッジケース",
    keywords: [
      "境界", "エッジ", "edge", "null", "undefined", "空",
      "ゼロ", "最大", "最小",
    ],
    promptAddition:
      "エッジケース（null/undefined、空文字列、境界値、大量データ等）も考慮してください。",
  },
  {
    category: "セキュリティ",
    keywords: [
      "セキュリティ", "認証", "認可", "バリデーション", "サニタイズ",
      "XSS", "CSRF", "injection",
    ],
    promptAddition:
      "セキュリティ面（入力バリデーション、認証・認可、データ漏洩防止）も考慮してください。",
  },
  {
    category: "パフォーマンス",
    keywords: [
      "パフォーマンス", "高速", "最適化", "キャッシュ", "遅い",
      "performance", "optimize",
    ],
    promptAddition:
      "パフォーマンス（計算量、メモリ使用量、レスポンス時間）も考慮してください。",
  },
  {
    category: "テスト",
    keywords: ["テスト", "test", "テスタビリティ", "モック", "スタブ"],
    promptAddition:
      "テスタビリティ（モック容易性、依存注入、テストケース）も考慮してください。",
  },
  {
    category: "保守性",
    keywords: [
      "保守", "可読性", "リファクタリング", "命名", "ドキュメント",
      "コメント",
    ],
    promptAddition:
      "コードの保守性（命名規則、適切な抽象化、ドキュメント）も考慮してください。",
  },
  {
    category: "型安全性",
    keywords: [
      "型", "type", "TypeScript", "interface", "generics", "any",
    ],
    promptAddition:
      "型安全性（anyの回避、適切なジェネリクス、型ガード）も考慮してください。",
  },
];

const BUILTIN_PALETTES: ReadonlyArray<PaletteMeta> = [
  {
    name: "planner",
    description: "計画担当。要件分析と実装計画の策定を行う。",
    keywords: [
      "計画", "設計", "要件", "アーキテクチャ", "見積もり", "タスク分解",
      "plan", "design", "requirement",
    ],
  },
  {
    name: "coder",
    description: "実装担当。クリーンコードの原則に従ってコードを実装する。",
    keywords: [
      "実装", "コーディング", "開発", "コード", "プログラム", "機能追加",
      "バグ修正", "implement", "code", "fix",
    ],
  },
  {
    name: "tester",
    description: "テスト担当。包括的なテストを作成・実行する。",
    keywords: [
      "テスト", "QA", "カバレッジ", "ユニットテスト", "結合テスト",
      "test", "testing", "assertion",
    ],
  },
  {
    name: "reviewer",
    description: "レビュー担当。コード品質、セキュリティ、パフォーマンスを評価する。",
    keywords: [
      "レビュー", "品質", "コードレビュー", "PR", "フィードバック",
      "review", "quality",
    ],
  },
  {
    name: "designer",
    description: "設計担当。UIデザインとユーザー体験を設計する。",
    keywords: [
      "デザイン", "UI", "UX", "画面", "レイアウト", "スタイル",
      "design", "interface",
    ],
  },
  {
    name: "security-reviewer",
    description: "セキュリティレビュー担当。脆弱性の検出と対策提案。",
    keywords: [
      "セキュリティ", "脆弱性", "攻撃", "防御", "認証", "暗号",
      "security", "vulnerability",
    ],
  },
  {
    name: "interviewer",
    description: "要件ヒアリング専門。質問形式で要件を引き出す。",
    keywords: [
      "ヒアリング", "質問", "要件定義", "インタビュー", "確認",
      "interview", "requirements",
    ],
  },
  {
    name: "requirements-analyst",
    description: "要件分析専門。MoSCoW法で優先度付け、矛盾検出。",
    keywords: [
      "要件分析", "MoSCoW", "優先度", "矛盾", "分析",
      "analysis", "prioritize",
    ],
  },
];

const BUILTIN_COMMISSIONS: ReadonlyArray<CommissionMeta> = [
  {
    name: "default",
    description: "標準開発フロー（計画 → 実装 → テスト → レビュー）",
    keywords: [
      "開発", "実装", "一般", "標準", "フルスタック", "機能追加",
      "default", "standard",
    ],
  },
  {
    name: "backend",
    description: "バックエンド開発フロー",
    keywords: [
      "バックエンド", "API", "サーバー", "DB", "データベース",
      "backend", "server",
    ],
  },
  {
    name: "frontend",
    description: "フロントエンド開発フロー",
    keywords: [
      "フロントエンド", "画面", "UI", "コンポーネント", "CSS",
      "frontend", "react", "vue",
    ],
  },
  {
    name: "fullstack",
    description: "フルスタック開発フロー",
    keywords: [
      "フルスタック", "全体", "E2E", "fullstack", "full-stack",
    ],
  },
  {
    name: "requirements-analysis",
    description: "対話的要件分析（ヒアリング → 構造化 → 検証 → 確定）",
    keywords: [
      "要件", "要件定義", "ヒアリング", "分析", "仕様", "スコープ",
      "requirements", "specification",
    ],
  },
  {
    name: "test-enhancement",
    description: "テスト品質向上（カバレッジ分析 → ギャップ特定 → テスト生成 → 検証）",
    keywords: [
      "テスト", "カバレッジ", "品質向上", "テスト改善",
      "test", "coverage", "quality",
    ],
  },
];

export class IntentEnhancerService {
  /**
   * 曖昧な入力を具体化し、足りない観点を補完する。
   */
  enhance(rawPrompt: string): EnhancedPrompt {
    const lower = rawPrompt.toLowerCase();
    const addedContexts: AddedContext[] = [];

    for (const rule of PERSPECTIVE_RULES) {
      const hasKeyword = rule.keywords.some((kw) =>
        lower.includes(kw.toLowerCase()),
      );

      // キーワードが含まれていない場合 → その観点が抜けている
      if (!hasKeyword) {
        // ただし関連性が低い場合は追加しない
        if (this.isRelevantPerspective(rawPrompt, rule)) {
          addedContexts.push({
            category: rule.category,
            content: rule.promptAddition,
            reason: `「${rule.category}」に関する記述が見当たらないため補完しました。`,
          });
        }
      }
    }

    // 具体性の低い表現を検出して追加コンテキスト
    const vaguePatterns = [
      { pattern: /良い感じに/g, suggestion: "具体的な品質基準や完了条件を明確にしてください。" },
      { pattern: /適切に/g, suggestion: "「適切」の基準を具体化してください（例: 応答時間1秒以内）。" },
      { pattern: /なるべく/g, suggestion: "定量的な目標値を設定してください。" },
      { pattern: /きれいに/g, suggestion: "コーディング規約や具体的なスタイルを指定してください。" },
    ];

    for (const vp of vaguePatterns) {
      if (vp.pattern.test(rawPrompt)) {
        addedContexts.push({
          category: "具体性",
          content: vp.suggestion,
          reason: "曖昧な表現が検出されたため、具体化を促すコンテキストを追加しました。",
        });
      }
    }

    // 強化済みプロンプトの組み立て
    let enhanced = rawPrompt;
    if (addedContexts.length > 0) {
      const additions = addedContexts
        .map((c) => `- ${c.content}`)
        .join("\n");
      enhanced = `${rawPrompt}\n\n## 追加考慮事項\n${additions}`;
    }

    const confidenceScore = Math.max(
      0.3,
      1 - addedContexts.length * 0.1,
    );

    return {
      original: rawPrompt,
      enhanced,
      addedContexts,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
    };
  }

  /**
   * タスク内容からビルトインPaletteの最適候補をスコア付きで提案する。
   */
  suggestPalette(taskDescription: string): PaletteSuggestion[] {
    const lower = taskDescription.toLowerCase();
    const suggestions: PaletteSuggestion[] = [];

    for (const palette of BUILTIN_PALETTES) {
      const score = this.computeRelevanceScore(lower, palette.keywords);
      if (score > 0) {
        suggestions.push({
          name: palette.name,
          description: palette.description,
          score: Math.round(score * 100) / 100,
          reason: this.buildMatchReason(lower, palette.keywords),
        });
      }
    }

    // スコアの高い順にソート
    suggestions.sort((a, b) => b.score - a.score);

    // 上位5件を返す
    return suggestions.slice(0, 5);
  }

  /**
   * タスク内容からビルトインCommissionの最適候補をスコア付きで提案する。
   */
  suggestCommission(taskDescription: string): CommissionSuggestion[] {
    const lower = taskDescription.toLowerCase();
    const suggestions: CommissionSuggestion[] = [];

    for (const commission of BUILTIN_COMMISSIONS) {
      const score = this.computeRelevanceScore(lower, commission.keywords);
      if (score > 0) {
        suggestions.push({
          name: commission.name,
          description: commission.description,
          score: Math.round(score * 100) / 100,
          reason: this.buildMatchReason(lower, commission.keywords),
        });
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.slice(0, 5);
  }

  // --- private helpers ---

  /**
   * 観点がプロンプトの内容に関連するかを判定する。
   * コーディング系のプロンプトにはコーディング系の観点のみ追加する。
   */
  private isRelevantPerspective(
    prompt: string,
    rule: PerspectiveRule,
  ): boolean {
    const codingKeywords = [
      "実装", "コード", "関数", "クラス", "メソッド", "API",
      "開発", "作成", "追加", "修正", "機能", "コンポーネント",
    ];
    const isCodeRelated = codingKeywords.some((kw) =>
      prompt.includes(kw),
    );

    // コーディングに関連しないプロンプトには、テスト・型安全性・保守性の観点は追加しない
    if (!isCodeRelated) {
      const codeOnlyCategories = ["テスト", "型安全性", "保守性"];
      if (codeOnlyCategories.includes(rule.category)) {
        return false;
      }
    }

    return true;
  }

  /**
   * キーワードマッチに基づく関連度スコアを算出する。
   */
  private computeRelevanceScore(
    text: string,
    keywords: readonly string[],
  ): number {
    let matchCount = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matchCount++;
      }
    }
    if (matchCount === 0) return 0;
    // 正規化: マッチ数 / キーワード総数、ただし最大1.0
    return Math.min(1.0, matchCount / Math.max(1, keywords.length * 0.3));
  }

  /**
   * マッチしたキーワードから理由文を生成する。
   */
  private buildMatchReason(
    text: string,
    keywords: readonly string[],
  ): string {
    const matched = keywords.filter((kw) =>
      text.includes(kw.toLowerCase()),
    );
    if (matched.length === 0) return "一般的なマッチ";
    return `キーワード一致: ${matched.slice(0, 3).join(", ")}`;
  }
}
