/**
 * AggregateEvaluator Service
 * 並列ストロークの all()/any() 集約条件を評価する。
 *
 * - all("condition") — 全サブストロークが condition にマッチ → true
 * - any("condition") — いずれかのサブストロークが condition にマッチ → true
 */

export class AggregateEvaluator {
  /**
   * 条件が aggregate 条件 (all()/any()) かどうか判定する。
   */
  isAggregate(condition: string): boolean {
    return /^(all|any)\("/.test(condition);
  }

  /**
   * all("condition") — 全サブストロークの結果が condition にマッチすれば true。
   * サブ結果が空の場合は false。
   */
  evaluateAll(condition: string, subResults: Map<string, string>): boolean {
    const match = condition.match(/^all\("(.+)"\)$/);
    if (!match) return false;
    const expected = match[1];
    if (subResults.size === 0) return false;
    return [...subResults.values()].every(status => status === expected);
  }

  /**
   * any("condition") — いずれかのサブストロークの結果が condition にマッチすれば true。
   * サブ結果が空の場合は false。
   */
  evaluateAny(condition: string, subResults: Map<string, string>): boolean {
    const match = condition.match(/^any\("(.+)"\)$/);
    if (!match) return false;
    const expected = match[1];
    return [...subResults.values()].some(status => status === expected);
  }

  /**
   * aggregate 条件を評価する（all/any を自動判別）。
   */
  evaluate(condition: string, subResults: Map<string, string>): boolean {
    if (condition.startsWith("all(")) {
      return this.evaluateAll(condition, subResults);
    }
    if (condition.startsWith("any(")) {
      return this.evaluateAny(condition, subResults);
    }
    return false;
  }
}
