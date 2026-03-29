# テスト知識

## テストピラミッド

テストは以下のピラミッド構造に従う。下層ほど多く、上層ほど少なくする。

| テスト種別 | スコープ | 検証対象 | 目標比率 |
|-----------|---------|---------|---------|
| Unit | 関数/クラス | ロジックの正しさ | 70% |
| Integration | モジュール間連携 | データフローの正しさ | 20% |
| E2E | ユーザー操作全体 | ユーザーから見た振る舞い | 10% |

| 基準 | 判定 |
|------|------|
| ユニットテストでカバーできるロジックにE2Eを書く | Warning。ユニットテストに移動を検討 |
| ユーザー操作フローの検証 | E2Eテストが適切 |
| 複数コマンド/ページにまたがるシナリオ | E2Eテストが適切 |
| エラーメッセージ表示の検証 | E2Eテストが適切 |

## テストダブルの選択

目的に応じてテストダブルを使い分ける。過度なモックはテストの信頼性を低下させる。

| タイプ | 目的 | ユースケース |
|--------|------|------------|
| Stub | 固定値を返す | 外部依存の出力制御 |
| Mock | 呼び出しを検証 | メソッド呼び出しと引数の確認 |
| Spy | 実装を保持しつつ呼び出しを記録 | 副作用の検証 |
| Fake | 軽量な実装 | インメモリDBなどの軽量代替 |

### モックの粒度

- テスト対象の直接的な依存のみモックする（間接依存はモックしない）
- 「モックが多すぎる」はテスト対象の設計問題を示唆
- 純粋関数は依存がなくモック不要

```typescript
// NG - 内部実装のモック（振る舞いではなく実装をテスト）
vi.spyOn(service, 'privateMethod')
service.execute()
expect(service.privateMethod).toHaveBeenCalled()

// OK - 外部依存をモック、振る舞いを検証
const repository = { findById: vi.fn().mockResolvedValue(user) }
const service = new UserService(repository)
const result = await service.getUser('id')
expect(result).toEqual(user)
```

## AAA パターン（Arrange-Act-Assert）

テストは3つのセクションに明確に分離する。

```typescript
test('注文が正常に作成される', async () => {
  // Arrange - テストの前提条件を設定
  const repository = { save: vi.fn().mockResolvedValue(undefined) }
  const service = new OrderService(repository)
  const input = createOrderInput({ quantity: 5 })

  // Act - テスト対象を実行
  const result = await service.createOrder(input)

  // Assert - 結果を検証
  expect(result.status).toBe('created')
  expect(repository.save).toHaveBeenCalledOnce()
})
```

| 基準 | 判定 |
|------|------|
| AAA の境界が不明確 | Warning |
| Act セクションに複数のアクション | 分割を検討 |
| Assert が Act の前にある | REJECT |
| Arrange が過度に複雑 | ファクトリ関数の使用を検討 |

## 境界値分析

境界値と同値分割はユニットテストの基本テクニック。

| テクニック | 説明 |
|-----------|------|
| 同値分割 | 入力を等価なグループに分け、各グループから1つテスト |
| 境界値分析 | 同値クラスの境界でテスト（境界、境界±1） |

```typescript
// NG - 正常系のみ
test('年齢を検証する', () => {
  expect(validateAge(25)).toBe(true)
})

// OK - 境界値を含む
test('年齢の境界値を検証する', () => {
  expect(validateAge(0)).toBe(true)    // 下限
  expect(validateAge(-1)).toBe(false)  // 下限 - 1
  expect(validateAge(150)).toBe(true)  // 上限
  expect(validateAge(151)).toBe(false) // 上限 + 1
})
```

## テストフィクスチャ設計

ファクトリ関数でテストデータを管理する。

- ファクトリ関数で最小限のフィクスチャを生成
- テストに無関係なフィールドはデフォルト値を設定
- テスト間でフィクスチャを共有・変更しない（テスト独立性の維持）

```typescript
// NG - 毎回すべてのフィールドを定義
const user = { id: '1', name: 'test', email: 'test@example.com', role: 'admin', createdAt: new Date() }

// OK - ファクトリ関数で最小限のオーバーライド
const createUser = (overrides: Partial<User> = {}): User => ({
  id: 'test-id',
  name: 'test-user',
  email: 'test@example.com',
  role: 'user',
  ...overrides,
})

test('管理者は削除可能', () => {
  const admin = createUser({ role: 'admin' })
  // テストに関連するフィールドのみ明示的
})
```

## テスト対象の分離

テスタビリティはデザイン品質の指標。テストしにくいコードは依存が密結合。

### 依存性注入パターン

| パターン | ユースケース |
|---------|------------|
| コンストラクタ注入 | クラスベースの依存分離 |
| 関数引数 | 依存を関数パラメータとして受け取る |
| モジュール置換 | テスト時にモジュール全体を置換 |

```typescript
// NG - 依存を直接生成（テストでモック不可）
class OrderService {
  private repo = new OrderRepository()
  async create(order: Order) { return this.repo.save(order) }
}

// OK - コンストラクタ注入（テストでモック可能）
class OrderService {
  constructor(private readonly repo: OrderRepository) {}
  async create(order: Order) { return this.repo.save(order) }
}
```

## カバレッジ基準

| メトリクス | 最低基準 | 目標 |
|-----------|---------|------|
| 行カバレッジ | 70% | 80%以上 |
| 分岐カバレッジ | 60% | 70%以上 |
| 関数カバレッジ | 80% | 90%以上 |

| 基準 | 判定 |
|------|------|
| 新規コードにテストがない | REJECT |
| ビジネスロジックのテストカバレッジが50%未満 | REJECT |
| エッジケースのテストがない | Warning |
| カバレッジ100%を達成するためだけの無意味なテスト | REJECT |

## E2Eテスト

### スコープ

E2Eテストはユーザー操作フロー全体を検証する。ユニットテストや統合テストとはスコープが異なる。

### フレーキーテスト防止

| 原因 | 対策 |
|------|------|
| タイミング依存 | 明示的な待機条件（状態ベースの待機、固定スリープ禁止） |
| ポート競合 | テストごとにランダムポートを割り当て |
| ファイルシステムの残留 | テストごとに一時ディレクトリを作成、テスト後に削除 |
| プロセスリーク | タイムアウト設定と強制終了 |
| 環境依存 | テスト実行の前提条件を明示的にセットアップ |
| 実行順序依存 | 各テストが独立して実行できるよう状態を初期化 |

```typescript
// NG - 固定スリープ
await sleep(3000)
expect(result).toBeDefined()

// OK - 条件ベースの待機
await waitFor(() => expect(result).toBeDefined(), { timeout: 5000 })
```

### テストケース管理

| 原則 | 説明 |
|------|------|
| 番号付きリスト | 各テストケースに一意の番号を付与し実装状況を追跡 |
| エントリポイント別分類 | コマンド/ページ/エンドポイント別にグループ化 |
| 優先度付け | ユーザー影響 x 未テストリスクで優先度を決定 |
| 既存テストとの照合 | 新規テスト追加前に既存のテストカバレッジを確認 |
