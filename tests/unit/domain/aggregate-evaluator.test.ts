import { describe, it, expect, beforeEach } from 'vitest';
import { AggregateEvaluator } from '../../../src/domain/services/aggregate-evaluator.service.js';

describe('AggregateEvaluator', () => {
  let evaluator: AggregateEvaluator;

  beforeEach(() => {
    evaluator = new AggregateEvaluator();
  });

  // 1. isAggregate()
  describe('isAggregate()', () => {
    it('all("...") をtrueと判定する', () => {
      expect(evaluator.isAggregate('all("success")')).toBe(true);
    });

    it('any("...") をtrueと判定する', () => {
      expect(evaluator.isAggregate('any("success")')).toBe(true);
    });

    it('通常の条件文字列はfalseと判定する', () => {
      expect(evaluator.isAggregate('success')).toBe(false);
    });

    it('空文字列はfalseと判定する', () => {
      expect(evaluator.isAggregate('')).toBe(false);
    });

    it('all大文字(ALL)はfalseと判定する', () => {
      expect(evaluator.isAggregate('ALL("success")')).toBe(false);
    });

    it('any大文字(ANY)はfalseと判定する', () => {
      expect(evaluator.isAggregate('ANY("success")')).toBe(false);
    });
  });

  // 2. evaluateAll()
  describe('evaluateAll()', () => {
    it('全サブ結果が条件に一致する場合trueを返す', () => {
      const subResults = new Map([
        ['sub1', 'success'],
        ['sub2', 'success'],
        ['sub3', 'success'],
      ]);
      expect(evaluator.evaluateAll('all("success")', subResults)).toBe(true);
    });

    it('一部のサブ結果が条件に不一致の場合falseを返す', () => {
      const subResults = new Map([
        ['sub1', 'success'],
        ['sub2', 'failure'],
        ['sub3', 'success'],
      ]);
      expect(evaluator.evaluateAll('all("success")', subResults)).toBe(false);
    });

    it('全サブ結果が条件に不一致の場合falseを返す', () => {
      const subResults = new Map([
        ['sub1', 'failure'],
        ['sub2', 'failure'],
      ]);
      expect(evaluator.evaluateAll('all("success")', subResults)).toBe(false);
    });

    it('サブ結果が空の場合falseを返す', () => {
      expect(evaluator.evaluateAll('all("success")', new Map())).toBe(false);
    });

    it('不正な条件文字列の場合falseを返す', () => {
      const subResults = new Map([['sub1', 'success']]);
      expect(evaluator.evaluateAll('invalid', subResults)).toBe(false);
    });
  });

  // 3. evaluateAny()
  describe('evaluateAny()', () => {
    it('いずれかのサブ結果が条件に一致する場合trueを返す', () => {
      const subResults = new Map([
        ['sub1', 'failure'],
        ['sub2', 'success'],
        ['sub3', 'failure'],
      ]);
      expect(evaluator.evaluateAny('any("success")', subResults)).toBe(true);
    });

    it('全サブ結果が条件に不一致の場合falseを返す', () => {
      const subResults = new Map([
        ['sub1', 'failure'],
        ['sub2', 'failure'],
      ]);
      expect(evaluator.evaluateAny('any("success")', subResults)).toBe(false);
    });

    it('サブ結果が空の場合falseを返す', () => {
      expect(evaluator.evaluateAny('any("success")', new Map())).toBe(false);
    });

    it('不正な条件文字列の場合falseを返す', () => {
      const subResults = new Map([['sub1', 'success']]);
      expect(evaluator.evaluateAny('invalid', subResults)).toBe(false);
    });
  });

  // 4. 空のsubResults (all/any 両方)
  describe('空のsubResults', () => {
    it('all() は空のsubResultsでfalseを返す', () => {
      expect(evaluator.evaluateAll('all("success")', new Map())).toBe(false);
    });

    it('any() は空のsubResultsでfalseを返す', () => {
      expect(evaluator.evaluateAny('any("success")', new Map())).toBe(false);
    });
  });

  // 5. evaluate() - all/any を自動判別
  describe('evaluate()', () => {
    it('all(...) 条件を自動判別してevaluateAllに委譲する（全一致でtrue）', () => {
      const subResults = new Map([
        ['sub1', 'done'],
        ['sub2', 'done'],
      ]);
      expect(evaluator.evaluate('all("done")', subResults)).toBe(true);
    });

    it('all(...) 条件を自動判別してevaluateAllに委譲する（一部不一致でfalse）', () => {
      const subResults = new Map([
        ['sub1', 'done'],
        ['sub2', 'pending'],
      ]);
      expect(evaluator.evaluate('all("done")', subResults)).toBe(false);
    });

    it('any(...) 条件を自動判別してevaluateAnyに委譲する（いずれか一致でtrue）', () => {
      const subResults = new Map([
        ['sub1', 'pending'],
        ['sub2', 'done'],
      ]);
      expect(evaluator.evaluate('any("done")', subResults)).toBe(true);
    });

    it('any(...) 条件を自動判別してevaluateAnyに委譲する（全不一致でfalse）', () => {
      const subResults = new Map([
        ['sub1', 'pending'],
        ['sub2', 'pending'],
      ]);
      expect(evaluator.evaluate('any("done")', subResults)).toBe(false);
    });

    it('aggregate条件でない場合falseを返す', () => {
      const subResults = new Map([['sub1', 'success']]);
      expect(evaluator.evaluate('success', subResults)).toBe(false);
    });
  });

  // 6. 不正な条件文字列
  describe('不正な条件文字列', () => {
    it('evaluateAll: all()形式でない場合falseを返す', () => {
      const subResults = new Map([['sub1', 'success']]);
      expect(evaluator.evaluateAll('all(success)', subResults)).toBe(false);
    });

    it('evaluateAll: シングルクォートの場合falseを返す', () => {
      const subResults = new Map([['sub1', 'success']]);
      expect(evaluator.evaluateAll("all('success')", subResults)).toBe(false);
    });

    it('evaluateAny: any()形式でない場合falseを返す', () => {
      const subResults = new Map([['sub1', 'success']]);
      expect(evaluator.evaluateAny('any(success)', subResults)).toBe(false);
    });

    it('evaluate: 空文字列はfalseを返す', () => {
      const subResults = new Map([['sub1', 'success']]);
      expect(evaluator.evaluate('', subResults)).toBe(false);
    });

    it('evaluate: 関係のない文字列はfalseを返す', () => {
      const subResults = new Map([['sub1', 'success']]);
      expect(evaluator.evaluate('random_string', subResults)).toBe(false);
    });
  });
});
