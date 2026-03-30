import { describe, it, expect, beforeEach } from 'vitest';
import { Canvas } from '../../../src/domain/models/canvas.model.js';

describe('Canvas', () => {
  describe('コンストラクタ', () => {
    it('引数なしで空のCanvasを生成する', () => {
      const canvas = new Canvas();
      expect(canvas.size).toBe(0);
    });

    it('Mapを渡すと内容をコピーして初期化する', () => {
      const initial = new Map<string, unknown>([
        ['key1', 'value1'],
        ['key2', 42],
      ]);
      const canvas = new Canvas(initial);
      expect(canvas.size).toBe(2);
      expect(canvas.get('key1')).toBe('value1');
      expect(canvas.get('key2')).toBe(42);
    });

    it('Recordを渡すと内容をコピーして初期化する', () => {
      const initial: Record<string, unknown> = { foo: 'bar', baz: true };
      const canvas = new Canvas(initial);
      expect(canvas.size).toBe(2);
      expect(canvas.get('foo')).toBe('bar');
      expect(canvas.get('baz')).toBe(true);
    });

    it('Mapを渡した場合、元のMapへの変更が影響しない（独立したコピー）', () => {
      const initial = new Map<string, unknown>([['key', 'original']]);
      const canvas = new Canvas(initial);
      initial.set('key', 'modified');
      expect(canvas.get('key')).toBe('original');
    });
  });

  describe('基本操作', () => {
    let canvas: Canvas;

    beforeEach(() => {
      canvas = new Canvas();
    });

    it('set() で値を保存し get() で取得できる', () => {
      canvas.set('name', 'Alice');
      expect(canvas.get('name')).toBe('Alice');
    });

    it('has() はキーが存在する場合trueを返す', () => {
      canvas.set('exists', 100);
      expect(canvas.has('exists')).toBe(true);
    });

    it('has() はキーが存在しない場合falseを返す', () => {
      expect(canvas.has('nothere')).toBe(false);
    });

    it('delete() はキーを削除しtrueを返す', () => {
      canvas.set('toDelete', 'value');
      const result = canvas.delete('toDelete');
      expect(result).toBe(true);
      expect(canvas.has('toDelete')).toBe(false);
    });

    it('delete() は存在しないキーに対してfalseを返す', () => {
      const result = canvas.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('set() で既存のキーの値を上書きできる', () => {
      canvas.set('key', 'first');
      canvas.set('key', 'second');
      expect(canvas.get('key')).toBe('second');
    });

    it('size は保存されているエントリ数を返す', () => {
      canvas.set('a', 1);
      canvas.set('b', 2);
      canvas.set('c', 3);
      expect(canvas.size).toBe(3);
    });
  });

  describe('存在しないキーの get()', () => {
    it('存在しないキーに対してundefinedを返す', () => {
      const canvas = new Canvas();
      expect(canvas.get('missing')).toBeUndefined();
    });

    it('削除済みキーに対してundefinedを返す', () => {
      const canvas = new Canvas();
      canvas.set('key', 'value');
      canvas.delete('key');
      expect(canvas.get('key')).toBeUndefined();
    });
  });

  describe('snapshot / restore', () => {
    it('snapshot() はその時点のMapのコピーを返す', () => {
      const canvas = new Canvas();
      canvas.set('a', 1);
      canvas.set('b', 2);
      const snap = canvas.snapshot();
      expect(snap.get('a')).toBe(1);
      expect(snap.get('b')).toBe(2);
      expect(snap.size).toBe(2);
    });

    it('snapshot() → 変更 → restore() で元の状態に戻る', () => {
      const canvas = new Canvas();
      canvas.set('x', 10);
      canvas.set('y', 20);

      const snap = canvas.snapshot();

      canvas.set('x', 999);
      canvas.set('z', 30);
      canvas.delete('y');

      canvas.restore(snap);

      expect(canvas.get('x')).toBe(10);
      expect(canvas.get('y')).toBe(20);
      expect(canvas.has('z')).toBe(false);
      expect(canvas.size).toBe(2);
    });

    it('空のCanvasのsnapshotをrestoreすると空になる', () => {
      const canvas = new Canvas();
      const emptySnap = canvas.snapshot();

      canvas.set('key', 'value');
      expect(canvas.size).toBe(1);

      canvas.restore(emptySnap);
      expect(canvas.size).toBe(0);
    });
  });

  describe('並列stroke用snapshot（独立性）', () => {
    it('snapshot後の変更がスナップショットに影響しない', () => {
      const canvas = new Canvas();
      canvas.set('shared', 'original');

      const snap = canvas.snapshot();

      // Canvasを変更してもsnapshotは変わらない
      canvas.set('shared', 'modified');
      canvas.set('newKey', 'newValue');

      expect(snap.get('shared')).toBe('original');
      expect(snap.has('newKey')).toBe(false);
    });

    it('snapshotへの変更がCanvasに影響しない', () => {
      const canvas = new Canvas({ key: 'value' });
      const snap = canvas.snapshot() as Map<string, unknown>;

      // Mapとして型アサーションしてスナップショットを変更
      snap.set('key', 'snapModified');

      // 元のCanvasは変わらない
      expect(canvas.get('key')).toBe('value');
    });

    it('複数のsnapshotが独立して存在できる', () => {
      const canvas = new Canvas();
      canvas.set('step', 1);
      const snap1 = canvas.snapshot();

      canvas.set('step', 2);
      const snap2 = canvas.snapshot();

      canvas.set('step', 3);

      expect(snap1.get('step')).toBe(1);
      expect(snap2.get('step')).toBe(2);
      expect(canvas.get('step')).toBe(3);
    });
  });

  describe('toJSON()', () => {
    it('空のCanvasで空のRecordを返す', () => {
      const canvas = new Canvas();
      expect(canvas.toJSON()).toEqual({});
    });

    it('すべてのエントリをRecord形式で返す', () => {
      const canvas = new Canvas();
      canvas.set('name', 'test');
      canvas.set('count', 42);
      canvas.set('flag', true);

      const json = canvas.toJSON();
      expect(json).toEqual({ name: 'test', count: 42, flag: true });
    });

    it('ネストされたオブジェクトもそのまま返す', () => {
      const canvas = new Canvas();
      const nested = { inner: 'value' };
      canvas.set('obj', nested);

      const json = canvas.toJSON();
      expect(json['obj']).toEqual({ inner: 'value' });
    });

    it('toJSON()はCanvasの状態に影響しない', () => {
      const canvas = new Canvas({ a: 1, b: 2 });
      canvas.toJSON();
      expect(canvas.size).toBe(2);
      expect(canvas.get('a')).toBe(1);
    });
  });

  describe('keys() / entries()', () => {
    it('keys() はすべてのキーのイテレータを返す', () => {
      const canvas = new Canvas({ x: 1, y: 2, z: 3 });
      const keys = [...canvas.keys()];
      expect(keys).toHaveLength(3);
      expect(keys).toContain('x');
      expect(keys).toContain('y');
      expect(keys).toContain('z');
    });

    it('空のCanvasでkeys()は空のイテレータを返す', () => {
      const canvas = new Canvas();
      const keys = [...canvas.keys()];
      expect(keys).toHaveLength(0);
    });

    it('entries() はすべての[key, value]ペアのイテレータを返す', () => {
      const canvas = new Canvas({ a: 100, b: 200 });
      const entries = [...canvas.entries()];
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual(['a', 100]);
      expect(entries).toContainEqual(['b', 200]);
    });

    it('空のCanvasでentries()は空のイテレータを返す', () => {
      const canvas = new Canvas();
      const entries = [...canvas.entries()];
      expect(entries).toHaveLength(0);
    });

    it('keys()とentries()は実際のイテレータとして機能する', () => {
      const canvas = new Canvas({ k: 'v' });

      const keysIterator = canvas.keys();
      expect(keysIterator.next()).toEqual({ value: 'k', done: false });
      expect(keysIterator.next()).toEqual({ value: undefined, done: true });

      const entriesIterator = canvas.entries();
      expect(entriesIterator.next()).toEqual({ value: ['k', 'v'], done: false });
      expect(entriesIterator.next()).toEqual({ value: undefined, done: true });
    });
  });
});
