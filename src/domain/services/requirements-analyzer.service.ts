/**
 * RequirementsAnalyzer Domain Service
 * 自然言語テキストから要件を抽出・分析するサービス。
 */

import type {
  RequirementsDocument,
  Requirement,
  Contradiction,
  Gap,
  Checklist,
  ChecklistItem,
} from "../value-objects/requirements.vo.js";

/** 矛盾検出用のキーワードペア */
const CONTRADICTORY_PAIRS: ReadonlyArray<[string, string]> = [
  ["リアルタイム", "バッチ処理"],
  ["オフライン", "常時接続"],
  ["シンプル", "高機能"],
  ["軽量", "フル機能"],
  ["高速", "高精度"],
  ["自動", "手動承認"],
  ["匿名", "ユーザー認証"],
  ["オープン", "アクセス制限"],
  ["同期", "非同期"],
  ["モノリス", "マイクロサービス"],
];

/** ギャップ検出カテゴリ */
const GAP_CATEGORIES = [
  {
    category: "エラーハンドリング",
    keywords: ["エラー", "例外", "失敗", "異常", "タイムアウト", "リトライ"],
    suggestion: "エラー発生時の挙動、リトライ戦略、ユーザーへの通知方法を定義してください。",
  },
  {
    category: "セキュリティ",
    keywords: ["認証", "認可", "暗号化", "セキュリティ", "権限", "アクセス制御", "脆弱性"],
    suggestion: "認証・認可方式、データ暗号化、入力バリデーション、セキュリティ監査について定義してください。",
  },
  {
    category: "パフォーマンス",
    keywords: ["性能", "パフォーマンス", "レスポンス", "スループット", "レイテンシ", "キャッシュ"],
    suggestion: "応答時間の目標値、同時接続数、スループット要件を定義してください。",
  },
  {
    category: "スケーラビリティ",
    keywords: ["スケール", "拡張", "スケーラビリティ", "負荷", "成長"],
    suggestion: "将来の利用者数増加、データ量増加への対応方針を定義してください。",
  },
  {
    category: "データ管理",
    keywords: ["バックアップ", "復旧", "移行", "データ保持", "アーカイブ", "GDPR"],
    suggestion: "データバックアップ方針、復旧手順、データ保持期間、プライバシー要件を定義してください。",
  },
  {
    category: "監視・運用",
    keywords: ["監視", "モニタリング", "ログ", "アラート", "運用", "デプロイ"],
    suggestion: "監視対象メトリクス、アラート条件、ログ方針、デプロイ戦略を定義してください。",
  },
  {
    category: "ユーザビリティ",
    keywords: ["UI", "UX", "アクセシビリティ", "多言語", "レスポンシブ", "使いやすさ"],
    suggestion: "対象ユーザー、アクセシビリティ基準、多言語対応、レスポンシブ対応について定義してください。",
  },
  {
    category: "テスト",
    keywords: ["テスト", "品質", "カバレッジ", "QA", "受け入れ"],
    suggestion: "テスト戦略、カバレッジ目標、受け入れテスト基準を定義してください。",
  },
] as const;

/** 要件の優先度推定キーワード */
const PRIORITY_KEYWORDS = {
  must: ["必須", "絶対", "不可欠", "なければならない", "しなければならない", "must", "必ず", "確実に"],
  should: ["すべき", "推奨", "should", "重要", "望ましい", "期待"],
  could: ["できれば", "オプション", "あれば良い", "could", "可能であれば", "nice to have"],
  wont: ["不要", "対象外", "将来", "次フェーズ", "スコープ外", "wont"],
} as const;

/** カテゴリ推定キーワード */
const CATEGORY_KEYWORDS = {
  security: ["認証", "認可", "暗号", "セキュリティ", "権限", "トークン", "CSRF", "XSS", "SQL"],
  performance: ["性能", "パフォーマンス", "速度", "レスポンス", "キャッシュ", "最適化", "高速"],
  usability: ["UI", "UX", "画面", "表示", "操作", "インターフェース", "デザイン", "レイアウト"],
  reliability: ["可用性", "冗長", "フェイルオーバー", "バックアップ", "復旧", "SLA", "障害"],
} as const;

export class RequirementsAnalyzerService {
  private nextId = 1;

  /**
   * 自然言語テキストから要件を抽出し、構造化ドキュメントを生成する。
   */
  analyzeRequirements(rawText: string): RequirementsDocument {
    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const title = this.extractTitle(lines);
    const rawRequirements = this.extractRequirements(lines);
    const functional: Requirement[] = [];
    const nonFunctional: Requirement[] = [];
    const assumptions: string[] = [];
    const openQuestions: string[] = [];

    for (const req of rawRequirements) {
      if (req.category === "feature") {
        functional.push(req);
      } else {
        nonFunctional.push(req);
      }
    }

    // 前提条件の抽出
    for (const line of lines) {
      if (this.isAssumption(line)) {
        assumptions.push(line.replace(/^[-*]\s*前提[:：]\s*/i, "").trim());
      }
    }

    // オープンクエスチョンの抽出
    for (const line of lines) {
      if (this.isOpenQuestion(line)) {
        openQuestions.push(line.replace(/^[-*]\s*[?？]\s*/, "").replace(/\?$/, "").trim());
      }
    }

    // 前提条件が見つからなかった場合、一般的なものを追加
    if (assumptions.length === 0) {
      assumptions.push("開発言語・フレームワークは既存プロジェクトに準拠する");
    }

    // 質問が見つからなかった場合、一般的なものを追加
    if (openQuestions.length === 0 && rawRequirements.length > 0) {
      openQuestions.push("非機能要件（性能、セキュリティ等）の具体的な数値目標は？");
      openQuestions.push("デプロイ先の環境は？");
    }

    return {
      title,
      functional,
      nonFunctional,
      assumptions,
      openQuestions,
    };
  }

  /**
   * 要件間の矛盾を検出する。
   */
  detectContradictions(requirements: Requirement[]): Contradiction[] {
    const contradictions: Contradiction[] = [];

    for (let i = 0; i < requirements.length; i++) {
      for (let j = i + 1; j < requirements.length; j++) {
        const reqA = requirements[i];
        const reqB = requirements[j];
        const textA = reqA.description.toLowerCase();
        const textB = reqB.description.toLowerCase();

        // キーワードペアによる矛盾検出
        for (const [keywordA, keywordB] of CONTRADICTORY_PAIRS) {
          const aHasA = textA.includes(keywordA.toLowerCase());
          const aHasB = textA.includes(keywordB.toLowerCase());
          const bHasA = textB.includes(keywordA.toLowerCase());
          const bHasB = textB.includes(keywordB.toLowerCase());

          if ((aHasA && bHasB) || (aHasB && bHasA)) {
            contradictions.push({
              requirementIds: [reqA.id, reqB.id],
              reason: `「${keywordA}」と「${keywordB}」は矛盾する可能性があります`,
              severity: "warning",
            });
          }
        }

        // 同一カテゴリで相反する優先度の検出
        if (
          reqA.category === reqB.category &&
          reqA.priority === "must" &&
          reqB.priority === "wont"
        ) {
          contradictions.push({
            requirementIds: [reqA.id, reqB.id],
            reason: `同じカテゴリ「${reqA.category}」で必須と対象外が混在しています`,
            severity: "error",
          });
        }

        // スコープ重複の検出（類似した記述）
        const similarity = this.computeSimilarity(textA, textB);
        if (similarity > 0.7 && reqA.priority !== reqB.priority) {
          contradictions.push({
            requirementIds: [reqA.id, reqB.id],
            reason: `類似した要件で優先度が異なります（${reqA.priority} vs ${reqB.priority}）`,
            severity: "warning",
          });
        }
      }
    }

    return contradictions;
  }

  /**
   * 要件の抜け漏れを検出する。
   */
  detectGaps(requirements: Requirement[]): Gap[] {
    const gaps: Gap[] = [];
    const allText = requirements.map((r) => r.description).join(" ");

    for (const gapDef of GAP_CATEGORIES) {
      const hasKeyword = gapDef.keywords.some((kw) =>
        allText.includes(kw),
      );

      if (!hasKeyword) {
        gaps.push({
          category: gapDef.category,
          description: `「${gapDef.category}」に関する要件が定義されていません。`,
          suggestion: gapDef.suggestion,
        });
      }
    }

    // 受け入れ基準の欠如チェック
    const missingCriteria = requirements.filter(
      (r) => r.acceptanceCriteria.length === 0,
    );
    if (missingCriteria.length > 0) {
      gaps.push({
        category: "受け入れ基準",
        description: `${missingCriteria.length}件の要件に受け入れ基準が定義されていません（${missingCriteria.map((r) => r.id).join(", ")}）。`,
        suggestion:
          "各要件に具体的な受け入れ基準（完了条件）を定義してください。",
      });
    }

    return gaps;
  }

  /**
   * 確認事項のチェックリストを自動生成する。
   */
  generateChecklist(requirements: Requirement[]): Checklist {
    const items: ChecklistItem[] = [];

    // 基本チェック項目
    items.push({
      question: "すべてのステークホルダーが要件に合意していますか？",
      category: "合意形成",
      required: true,
    });
    items.push({
      question: "要件の優先度は適切に設定されていますか？",
      category: "優先度",
      required: true,
    });

    // 要件ごとのチェック
    for (const req of requirements) {
      if (req.acceptanceCriteria.length === 0) {
        items.push({
          question: `要件「${req.id}: ${req.description.slice(0, 30)}...」の受け入れ基準を定義しましたか？`,
          category: "受け入れ基準",
          required: true,
        });
      }

      if (req.priority === "must") {
        items.push({
          question: `必須要件「${req.id}」の実現可能性を技術的に検証しましたか？`,
          category: "技術検証",
          required: true,
        });
      }
    }

    // カテゴリ別チェック
    const categories = new Set(requirements.map((r) => r.category));

    if (!categories.has("security")) {
      items.push({
        question: "セキュリティ要件は検討しましたか？",
        category: "セキュリティ",
        required: true,
      });
    }
    if (!categories.has("performance")) {
      items.push({
        question: "パフォーマンス要件（応答時間、同時接続数等）は定義しましたか？",
        category: "パフォーマンス",
        required: true,
      });
    }
    if (!categories.has("reliability")) {
      items.push({
        question: "信頼性要件（可用性、障害復旧等）は定義しましたか？",
        category: "信頼性",
        required: false,
      });
    }
    if (!categories.has("usability")) {
      items.push({
        question: "ユーザビリティ要件（対象ユーザー、アクセシビリティ等）は定義しましたか？",
        category: "ユーザビリティ",
        required: false,
      });
    }

    // 一般的なチェック項目
    items.push({
      question: "テスト戦略は策定しましたか？",
      category: "テスト",
      required: true,
    });
    items.push({
      question: "デプロイ・リリース計画は策定しましたか？",
      category: "運用",
      required: false,
    });
    items.push({
      question: "ドキュメント（API仕様、ユーザーガイド等）の作成計画はありますか？",
      category: "ドキュメント",
      required: false,
    });

    return { items };
  }

  // --- private helpers ---

  private extractTitle(lines: string[]): string {
    // 最初の見出し行 or 最初の行をタイトルとする
    for (const line of lines) {
      if (line.startsWith("#")) {
        return line.replace(/^#+\s*/, "").trim();
      }
    }
    return lines[0]?.slice(0, 80) ?? "無題の要件";
  }

  private extractRequirements(lines: string[]): Requirement[] {
    const requirements: Requirement[] = [];

    for (const line of lines) {
      // 箇条書き行や見出し以外の実質的な文を要件候補とする
      if (this.isAssumption(line) || this.isOpenQuestion(line)) continue;

      const cleaned = line
        .replace(/^[-*#]\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .trim();

      if (cleaned.length < 5) continue;
      // 見出し行はスキップ
      if (line.startsWith("#") && !line.startsWith("##")) continue;

      const priority = this.estimatePriority(cleaned);
      const category = this.estimateCategory(cleaned);
      const criteria = this.extractAcceptanceCriteria(cleaned);

      requirements.push({
        id: `REQ-${String(this.nextId++).padStart(3, "0")}`,
        description: cleaned,
        priority,
        category,
        acceptanceCriteria: criteria,
      });
    }

    return requirements;
  }

  private estimatePriority(
    text: string,
  ): "must" | "should" | "could" | "wont" {
    const lower = text.toLowerCase();
    for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        return priority as "must" | "should" | "could" | "wont";
      }
    }
    return "should"; // デフォルト
  }

  private estimateCategory(
    text: string,
  ): "feature" | "security" | "performance" | "usability" | "reliability" {
    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        return category as
          | "security"
          | "performance"
          | "usability"
          | "reliability";
      }
    }
    return "feature";
  }

  private extractAcceptanceCriteria(text: string): string[] {
    const criteria: string[] = [];
    // 「〜すること」「〜できること」パターンの抽出
    const patterns = [
      /([^。]+(?:すること|できること|であること|となること))/g,
    ];
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        criteria.push(match[1].trim());
      }
    }
    return criteria;
  }

  private isAssumption(line: string): boolean {
    return /^[-*]\s*前提[:：]/i.test(line);
  }

  private isOpenQuestion(line: string): boolean {
    return /^[-*]\s*[?？]/.test(line) || /\?$/.test(line.trim());
  }

  /**
   * 簡易的なテキスト類似度計算（Jaccard係数）。
   */
  private computeSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(textA.split(/\s+/));
    const wordsB = new Set(textB.split(/\s+/));

    if (wordsA.size === 0 && wordsB.size === 0) return 1;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
