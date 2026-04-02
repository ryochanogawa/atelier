import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, chmodSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { execa } from 'execa';
import { join } from 'path';
import { tmpdir } from 'os';

const ACTION_PATH = join(
  __dirname,
  '../../../.github/actions/atelier-action/action.yml',
);

// ── YAML Structure Tests ────────────────────────────────────────────

describe('atelier-action.yml 構造検証', () => {
  let action: Record<string, any>;

  beforeAll(() => {
    const raw = readFileSync(ACTION_PATH, 'utf-8');
    action = parseYaml(raw);
  });

  // ---------- 基本メタデータ ----------

  it('name と description が定義されていること', () => {
    expect(action.name).toBe('ATELIER Action');
    expect(action.description).toBe('Run ATELIER CLI in GitHub Actions');
  });

  it('composite action として定義されていること', () => {
    expect(action.runs.using).toBe('composite');
  });

  // ---------- inputs ----------

  describe('inputs 定義', () => {
    it('すべての必須 inputs が存在すること', () => {
      const expectedInputs = [
        'task',
        'commission',
        'piece',
        'auto-pr',
        'draft',
        'direct',
        'base-branch',
        'comment-result',
      ];
      const actualInputs = Object.keys(action.inputs);
      for (const input of expectedInputs) {
        expect(actualInputs).toContain(input);
      }
    });

    it('comment-result input が正しく定義されていること', () => {
      const commentResult = action.inputs['comment-result'];
      expect(commentResult).toBeDefined();
      expect(commentResult.description).toBe(
        'Post ATELIER result as issue comment',
      );
      expect(commentResult.required).toBe(false);
      expect(commentResult.default).toBe('false');
    });

    it('comment-result のデフォルトが false であること（opt-in設計）', () => {
      expect(action.inputs['comment-result'].default).toBe('false');
    });

    it('すべての inputs に description が設定されていること', () => {
      for (const [name, def] of Object.entries(action.inputs) as [
        string,
        any,
      ][]) {
        expect(def.description, `input "${name}" に description がない`).toBeTruthy();
      }
    });

    it('auto-pr, draft, direct, comment-result のデフォルトが文字列 "false" であること', () => {
      for (const name of ['auto-pr', 'draft', 'direct', 'comment-result']) {
        expect(
          action.inputs[name].default,
          `input "${name}" default should be string "false"`,
        ).toBe('false');
      }
    });

    it('commission のデフォルトが "default" であること', () => {
      expect(action.inputs.commission.default).toBe('default');
    });
  });

  // ---------- steps ----------

  describe('steps 構造', () => {
    it('少なくとも2つのステップが存在すること', () => {
      expect(action.runs.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('Run ATELIER ステップが存在すること', () => {
      const runStep = action.runs.steps.find(
        (s: any) => s.name === 'Run ATELIER',
      );
      expect(runStep).toBeDefined();
      expect(runStep.shell).toBe('bash');
    });

    it('Post result to Issue ステップが存在すること', () => {
      const postStep = action.runs.steps.find(
        (s: any) => s.name === 'Post result to Issue',
      );
      expect(postStep).toBeDefined();
      expect(postStep.shell).toBe('bash');
    });

    it('Post result to Issue の条件が comment-result と issue.number を要求すること', () => {
      const postStep = action.runs.steps.find(
        (s: any) => s.name === 'Post result to Issue',
      );
      const condition = postStep.if as string;
      expect(condition).toContain("inputs.comment-result == 'true'");
      expect(condition).toContain('github.event.issue.number');
    });

    it('Post result to Issue で GH_TOKEN 環境変数が設定されていること', () => {
      const postStep = action.runs.steps.find(
        (s: any) => s.name === 'Post result to Issue',
      );
      expect(postStep.env).toBeDefined();
      expect(postStep.env.GH_TOKEN).toBe('${{ github.token }}');
    });
  });
});

// ── Shell Script Logic Tests ────────────────────────────────────────

describe('Run ATELIER シェルスクリプトロジック', () => {
  const TEMP_DIR = join(tmpdir(), 'atelier-action-test');
  const LOG_FILE = join(TEMP_DIR, 'atelier-result.log');

  beforeEach(() => {
    mkdirSync(TEMP_DIR, { recursive: true });
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
  });

  afterEach(() => {
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
  });

  /**
   * シェルスクリプトのARGS構築ロジックをテスト用に抽出して実行する。
   * 実際の atelier コマンドは呼ばず、ARGS の内容を echo で検証する。
   */
  async function buildArgs(opts: {
    direct?: string;
    commission?: string;
    autoPr?: string;
    draft?: string;
    baseBranch?: string;
  }): Promise<string> {
    const direct = opts.direct ?? 'false';
    const commission = opts.commission ?? 'default';
    const autoPr = opts.autoPr ?? 'false';
    const draft = opts.draft ?? 'false';
    const baseBranch = opts.baseBranch ?? '';

    const scriptPath = join(TEMP_DIR, 'test-build-args.sh');
    const script = `#!/bin/bash
set -euo pipefail
ARGS=""
if [ "${direct}" = "true" ]; then
  ARGS="$ARGS --direct"
fi
if [ -n "${commission}" ] && [ "${direct}" != "true" ]; then
  ARGS="$ARGS --commission ${commission}"
fi
if [ "${autoPr}" = "true" ]; then
  BASE="${baseBranch}"
  if [ -z "$BASE" ]; then
    BASE="main"
  fi
  ARGS="$ARGS --auto-pr --base $BASE"
fi
if [ "${draft}" = "true" ]; then
  ARGS="$ARGS --draft"
fi
echo "$ARGS"
`;
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, 0o755);
    const result = await execa('bash', [scriptPath]);
    return result.stdout.trim();
  }

  // ---------- 正常系 ----------

  describe('ARGS 構築 - 正常系', () => {
    it('デフォルト値でcommission引数のみ生成されること', async () => {
      const args = await buildArgs({});
      expect(args).toBe('--commission default');
    });

    it('direct=true の場合 --direct のみ生成されること（commission無し）', async () => {
      const args = await buildArgs({ direct: 'true' });
      expect(args).toBe('--direct');
    });

    it('commission指定時に正しく反映されること', async () => {
      const args = await buildArgs({ commission: 'my-commission' });
      expect(args).toBe('--commission my-commission');
    });

    it('auto-pr=true でbase-branch指定時に正しく反映されること', async () => {
      const args = await buildArgs({
        autoPr: 'true',
        baseBranch: 'develop',
      });
      expect(args).toContain('--auto-pr --base develop');
    });

    it('auto-pr=true でbase-branch未指定時にフォールバックされること', async () => {
      const args = await buildArgs({ autoPr: 'true', baseBranch: '' });
      expect(args).toContain('--auto-pr --base main');
    });

    it('draft=true で --draft が生成されること', async () => {
      const args = await buildArgs({ draft: 'true' });
      expect(args).toContain('--draft');
    });

    it('すべてのオプションを同時に有効化できること', async () => {
      const args = await buildArgs({
        autoPr: 'true',
        draft: 'true',
        baseBranch: 'release',
        commission: 'deploy',
      });
      expect(args).toContain('--commission deploy');
      expect(args).toContain('--auto-pr --base release');
      expect(args).toContain('--draft');
    });

    it('direct=true の場合 commission が無視されること', async () => {
      const args = await buildArgs({
        direct: 'true',
        commission: 'should-be-ignored',
      });
      expect(args).toContain('--direct');
      expect(args).not.toContain('--commission');
    });
  });

  // ---------- 異常系 ----------

  describe('ARGS 構築 - 異常系', () => {
    it('direct が false 文字列の場合 --direct は生成されないこと', async () => {
      const args = await buildArgs({ direct: 'false' });
      expect(args).not.toContain('--direct');
    });

    it('auto-pr が false の場合 --auto-pr は生成されないこと', async () => {
      const args = await buildArgs({ autoPr: 'false' });
      expect(args).not.toContain('--auto-pr');
    });

    it('draft が false の場合 --draft は生成されないこと', async () => {
      const args = await buildArgs({ draft: 'false' });
      expect(args).not.toContain('--draft');
    });
  });
});

// ── pipefail & tee ログキャプチャ テスト ────────────────────────────

describe('pipefail + tee ログキャプチャ', () => {
  const TEMP_DIR = join(tmpdir(), 'atelier-action-test-pipefail');
  const LOG_FILE = join(TEMP_DIR, 'atelier-result.log');

  beforeEach(() => {
    mkdirSync(TEMP_DIR, { recursive: true });
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
  });

  afterEach(() => {
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
  });

  it('set -o pipefail により tee 前のコマンド失敗が伝搬すること', async () => {
    const result = await execa('bash', ['-c', `set -o pipefail; false | tee "${LOG_FILE}"`], {
      reject: false,
    });
    expect(result.exitCode).not.toBe(0);
  });

  it('pipefail なしでは tee が成功コードを返してしまうこと（対照テスト）', async () => {
    const result = await execa('bash', ['-c', `false | tee "${LOG_FILE}"`], {
      reject: false,
    });
    // tee は成功するので exit code は 0
    expect(result.exitCode).toBe(0);
  });

  it('コマンド出力が tee でファイルにキャプチャされること', async () => {
    await execa('bash', ['-c', `set -o pipefail; echo "hello atelier" 2>&1 | tee "${LOG_FILE}"`]);
    const content = readFileSync(LOG_FILE, 'utf-8');
    expect(content.trim()).toBe('hello atelier');
  });

  it('stdout と stderr の両方がキャプチャされること', async () => {
    await execa('bash', ['-c', `set -o pipefail; (echo "stdout-msg"; echo "stderr-msg" >&2) 2>&1 | tee "${LOG_FILE}"`]);
    const content = readFileSync(LOG_FILE, 'utf-8');
    expect(content).toContain('stdout-msg');
    expect(content).toContain('stderr-msg');
  });
});

// ── Post result to Issue ロジック テスト ─────────────────────────────

describe('Post result to Issue ロジック', () => {
  const TEMP_DIR = join(tmpdir(), 'atelier-action-test-post');
  const LOG_FILE = join(TEMP_DIR, 'atelier-result.log');

  beforeEach(() => {
    mkdirSync(TEMP_DIR, { recursive: true });
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
  });

  afterEach(() => {
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
  });

  it('tail -c 60000 でログを60KB以下に切り詰められること', async () => {
    // 100KB のデータを生成
    const largeContent = 'x'.repeat(100_000);
    writeFileSync(LOG_FILE, largeContent);

    const result = await execa('bash', ['-c', `tail -c 60000 "${LOG_FILE}"`]);
    expect(result.stdout.length).toBe(60000);
  });

  it('ログファイルが60KB未満の場合はそのまま出力されること', async () => {
    const smallContent = 'test output\nline 2\n';
    writeFileSync(LOG_FILE, smallContent);

    const result = await execa('bash', ['-c', `tail -c 60000 "${LOG_FILE}"`]);
    // execa strips trailing newline from stdout
    expect(result.stdout).toBe(smallContent.trimEnd());
  });

  it('ログファイルが存在しない場合に "No output captured" がフォールバックされること', async () => {
    const nonExistent = join(TEMP_DIR, 'nonexistent.log');
    const result = await execa('bash', ['-c', `tail -c 60000 "${nonExistent}" 2>/dev/null || echo "No output captured"`]);
    expect(result.stdout.trim()).toBe('No output captured');
  });

  it('空ログファイルの場合に空文字列が返ること', async () => {
    writeFileSync(LOG_FILE, '');
    const result = await execa('bash', ['-c', `tail -c 60000 "${LOG_FILE}" 2>/dev/null || echo "No output captured"`]);
    expect(result.stdout).toBe('');
  });

  // ---------- エッジケース ----------

  it('ログにMarkdown特殊文字が含まれても切り詰め処理が正常に動作すること', async () => {
    const markdownContent =
      '# Header\n```code```\n| table | row |\n<details>html</details>\n';
    writeFileSync(LOG_FILE, markdownContent);

    const result = await execa('bash', ['-c', `tail -c 60000 "${LOG_FILE}"`]);
    expect(result.stdout).toBe(markdownContent.trimEnd());
  });

  it('ログにマルチバイト文字が含まれても処理されること', async () => {
    const japaneseContent = 'テスト実行結果\n成功: 10件\n失敗: 0件\n';
    writeFileSync(LOG_FILE, japaneseContent);

    const result = await execa('bash', ['-c', `tail -c 60000 "${LOG_FILE}"`]);
    expect(result.stdout).toBe(japaneseContent.trimEnd());
  });

  it('ちょうど60000バイトのログが正しく処理されること（境界値）', async () => {
    const exactContent = 'a'.repeat(60000);
    writeFileSync(LOG_FILE, exactContent);

    const result = await execa('bash', ['-c', `tail -c 60000 "${LOG_FILE}"`]);
    expect(result.stdout.length).toBe(60000);
  });

  it('60001バイトのログが60000バイトに切り詰められること（境界値+1）', async () => {
    const overContent = 'b'.repeat(60001);
    writeFileSync(LOG_FILE, overContent);

    const result = await execa('bash', ['-c', `tail -c 60000 "${LOG_FILE}"`]);
    expect(result.stdout.length).toBe(60000);
  });
});

// ── if 条件分岐 テスト ──────────────────────────────────────────────

describe('Post result to Issue - if 条件の検証', () => {
  let action: Record<string, any>;

  beforeAll(() => {
    const raw = readFileSync(ACTION_PATH, 'utf-8');
    action = parseYaml(raw);
  });

  it('comment-result が false の場合は実行されない条件であること', () => {
    const postStep = action.runs.steps.find(
      (s: any) => s.name === 'Post result to Issue',
    );
    // GitHub Actions の if は && で結合されている
    const condition = postStep.if as string;
    expect(condition).toContain("inputs.comment-result == 'true'");
  });

  it('issue.number がない場合（PRトリガー等）は実行されない条件であること', () => {
    const postStep = action.runs.steps.find(
      (s: any) => s.name === 'Post result to Issue',
    );
    const condition = postStep.if as string;
    expect(condition).toContain('github.event.issue.number');
  });

  it('条件が AND で結合されていること（両方満たす必要がある）', () => {
    const postStep = action.runs.steps.find(
      (s: any) => s.name === 'Post result to Issue',
    );
    const condition = postStep.if as string;
    expect(condition).toContain('&&');
  });
});

// ── Run ATELIER ステップのスクリプト内容検証 ────────────────────────

describe('Run ATELIER スクリプト内容検証', () => {
  let runScript: string;

  beforeAll(() => {
    const raw = readFileSync(ACTION_PATH, 'utf-8');
    const action = parseYaml(raw);
    const runStep = action.runs.steps.find(
      (s: any) => s.name === 'Run ATELIER',
    );
    runScript = runStep.run as string;
  });

  it('set -o pipefail が含まれていること', () => {
    expect(runScript).toContain('set -o pipefail');
  });

  it('pipefail がスクリプトの先頭にあること', () => {
    const lines = runScript.split('\n').filter((l: string) => l.trim());
    expect(lines[0].trim()).toBe('set -o pipefail');
  });

  it('atelier コマンドの出力が tee でキャプチャされること', () => {
    expect(runScript).toContain('2>&1 | tee');
  });

  it('ログの出力先が $RUNNER_TEMP/atelier-result.log であること', () => {
    expect(runScript).toContain('$RUNNER_TEMP/atelier-result.log');
  });

  it('task 入力と comment.body の両方のパスで tee が使われていること', () => {
    // "tee" が2回出現する（task パスと comment.body パス）
    const teeMatches = runScript.match(/tee/g);
    expect(teeMatches).not.toBeNull();
    expect(teeMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it('task と comment.body の両方のパスで 2>&1 リダイレクトされていること', () => {
    const redirectMatches = runScript.match(/2>&1/g);
    expect(redirectMatches).not.toBeNull();
    expect(redirectMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
