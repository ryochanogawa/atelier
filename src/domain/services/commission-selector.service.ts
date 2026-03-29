/**
 * CommissionSelector Domain Service
 * タスク説明から最適な Commission を推定する。
 */

export interface CommissionMatch {
  name: string;
  score: number;
  reason: string;
}

export class CommissionSelectorService {
  /**
   * タスク説明と利用可能な Commission 一覧から最適なものを選択する。
   */
  select(task: string, availableCommissions: string[]): CommissionMatch {
    // キーワードベースのスコアリング
    const scores = availableCommissions.map(name => ({
      name,
      score: this.score(task, name),
      reason: this.getReason(task, name),
    }));

    // スコアでソートして最高スコアを返す
    scores.sort((a, b) => b.score - a.score);
    return scores[0] ?? { name: "default", score: 0, reason: "デフォルト" };
  }

  private score(task: string, commissionName: string): number {
    const lower = task.toLowerCase();
    const kws = this.keywordsFor(commissionName);
    let score = 0;
    for (const kw of kws) {
      if (lower.includes(kw)) score += 10;
    }
    // default は常にベーススコアを持つ（フォールバック）
    if (commissionName === "default") score += 1;
    return score;
  }

  private getReason(task: string, commissionName: string): string {
    const lower = task.toLowerCase();
    const kws = this.keywordsFor(commissionName);
    const matched = kws.filter(kw => lower.includes(kw));
    if (matched.length > 0) return `キーワードマッチ: ${matched.join(", ")}`;
    if (commissionName === "default") return "デフォルト";
    return "なし";
  }

  private keywordsFor(commissionName: string): readonly string[] {
    const keywords: Record<string, readonly string[]> = {
      frontend: [
        "ui", "ux", "デザイン", "コンポーネント", "css", "tailwind",
        "レイアウト", "画面", "フロントエンド", "react", "スタイル", "表示",
      ],
      backend: [
        "api", "データベース", "db", "サーバー", "バックエンド",
        "認証", "エンドポイント", "rest", "graphql",
      ],
      fullstack: ["フルスタック", "全体", "e2e", "統合"],
      default: ["修正", "実装", "追加", "変更", "リファクタ", "バグ", "fix", "implement"],
    };
    return keywords[commissionName] ?? keywords["default"]!;
  }
}
