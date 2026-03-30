import { describe, it, expect } from "vitest";
import { checkLoopMonitor } from "../../../src/application/services/loop-monitor.js";
import type { LoopMonitorYaml } from "../../../src/shared/types.js";

describe("checkLoopMonitor", () => {
  describe("threshold未到達", () => {
    it("サイクルが threshold 回未満の場合は null を返す", () => {
      const monitors: LoopMonitorYaml[] = [
        { cycle: ["implement", "review"], threshold: 3 },
      ];
      const history = ["plan", "implement", "review"];

      expect(checkLoopMonitor(monitors, history)).toBeNull();
    });

    it("サイクルが threshold - 1 回の場合は null を返す", () => {
      const monitors: LoopMonitorYaml[] = [
        { cycle: ["implement", "review"], threshold: 3 },
      ];
      const history = [
        "plan",
        "implement",
        "review",
        "implement",
        "review",
      ];

      expect(checkLoopMonitor(monitors, history)).toBeNull();
    });
  });

  describe("threshold到達", () => {
    it("サイクルが threshold 回繰り返されたら triggered=true を返す", () => {
      const monitors: LoopMonitorYaml[] = [
        { cycle: ["implement", "review"], threshold: 3 },
      ];
      const history = [
        "plan",
        "implement",
        "review",
        "implement",
        "review",
        "implement",
        "review",
      ];

      const result = checkLoopMonitor(monitors, history);
      expect(result).not.toBeNull();
      expect(result!.triggered).toBe(true);
    });
  });

  describe("on_threshold各値", () => {
    it('on_threshold が "fail" の場合 action は "fail"', () => {
      const monitors: LoopMonitorYaml[] = [
        { cycle: ["implement", "review"], threshold: 2, on_threshold: "fail" },
      ];
      const history = [
        "implement",
        "review",
        "implement",
        "review",
      ];

      const result = checkLoopMonitor(monitors, history);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("fail");
    });

    it('on_threshold が "skip" の場合 action は "skip"', () => {
      const monitors: LoopMonitorYaml[] = [
        { cycle: ["implement", "review"], threshold: 2, on_threshold: "skip" },
      ];
      const history = [
        "implement",
        "review",
        "implement",
        "review",
      ];

      const result = checkLoopMonitor(monitors, history);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("skip");
    });

    it('on_threshold が "force_complete" の場合 action は "force_complete"', () => {
      const monitors: LoopMonitorYaml[] = [
        {
          cycle: ["implement", "review"],
          threshold: 2,
          on_threshold: "force_complete",
        },
      ];
      const history = [
        "implement",
        "review",
        "implement",
        "review",
      ];

      const result = checkLoopMonitor(monitors, history);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("force_complete");
    });

    it("on_threshold が未指定の場合 action のデフォルトは \"fail\"", () => {
      const monitors: LoopMonitorYaml[] = [
        { cycle: ["implement", "review"], threshold: 2 },
      ];
      const history = [
        "implement",
        "review",
        "implement",
        "review",
      ];

      const result = checkLoopMonitor(monitors, history);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("fail");
    });
  });

  describe("複数monitor", () => {
    it("2つのmonitorが独立して動作し、最初にトリガーされたものが返る", () => {
      const monitors: LoopMonitorYaml[] = [
        {
          cycle: ["implement", "review"],
          threshold: 2,
          on_threshold: "fail",
        },
        {
          cycle: ["analyze", "plan"],
          threshold: 2,
          on_threshold: "skip",
        },
      ];

      // 最初のmonitor（implement/review）のみ threshold に達する
      const history = [
        "analyze",
        "plan",
        "implement",
        "review",
        "implement",
        "review",
      ];

      const result = checkLoopMonitor(monitors, history);
      expect(result).not.toBeNull();
      expect(result!.monitorIndex).toBe(0);
      expect(result!.action).toBe("fail");
    });

    it("2番目のmonitorが先にトリガーされる場合、monitorIndexが1になる", () => {
      const monitors: LoopMonitorYaml[] = [
        {
          cycle: ["implement", "review"],
          threshold: 3,
          on_threshold: "fail",
        },
        {
          cycle: ["analyze", "plan"],
          threshold: 2,
          on_threshold: "skip",
        },
      ];

      // 2番目のmonitor（analyze/plan）のみ threshold に達する
      const history = [
        "analyze",
        "plan",
        "analyze",
        "plan",
        "implement",
        "review",
      ];

      const result = checkLoopMonitor(monitors, history);
      expect(result).not.toBeNull();
      expect(result!.monitorIndex).toBe(1);
      expect(result!.action).toBe("skip");
    });
  });

  describe("空入力", () => {
    it("historyが空の場合は null を返す", () => {
      const monitors: LoopMonitorYaml[] = [
        { cycle: ["implement", "review"], threshold: 3 },
      ];

      expect(checkLoopMonitor(monitors, [])).toBeNull();
    });

    it("monitorsが空の場合は null を返す", () => {
      const history = ["implement", "review", "implement", "review"];

      expect(checkLoopMonitor([], history)).toBeNull();
    });
  });
});
