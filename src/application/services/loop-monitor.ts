import type { LoopMonitorYaml } from "../../shared/types.js";

export interface LoopMonitorResult {
  triggered: boolean;
  action: "fail" | "skip" | "force_complete";
  monitorIndex: number;
}

/**
 * stroke実行履歴を検査し、loop_monitorsに定義されたサイクルがthresholdを超えたか判定する。
 *
 * @param monitors - Commission定義のloop_monitors
 * @param history - これまでに実行されたstroke名の履歴（実行順）
 * @returns 最初にトリガーされたモニターの情報、またはnull
 */
export function checkLoopMonitor(
  monitors: readonly LoopMonitorYaml[],
  history: readonly string[],
): LoopMonitorResult | null {
  if (monitors.length === 0 || history.length === 0) {
    return null;
  }

  for (let i = 0; i < monitors.length; i++) {
    const monitor = monitors[i];

    // cycle内の各strokeの実行回数をhistoryから集計する
    const counts = new Map<string, number>();
    for (const strokeName of history) {
      if (monitor.cycle.includes(strokeName)) {
        counts.set(strokeName, (counts.get(strokeName) ?? 0) + 1);
      }
    }

    // cycle内の全strokeがthresholdに達しているかチェック
    const allReachedThreshold = monitor.cycle.every(
      (name) => (counts.get(name) ?? 0) >= monitor.threshold,
    );

    if (allReachedThreshold) {
      const action = monitor.on_threshold ?? "fail";
      return {
        triggered: true,
        action,
        monitorIndex: i,
      };
    }
  }

  return null;
}
