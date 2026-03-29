# バックエンド知識

## ヘキサゴナルアーキテクチャ（ポート&アダプター）

依存方向は外側から内側へ流れる。逆方向の依存は禁止。

```
adapter（外部接続） → application（ユースケース） → domain（ビジネスロジック）
```

ディレクトリ構造:

```
{ドメイン名}/
├── domain/                  # ドメイン層（フレームワーク非依存）
│   ├── model/
│   │   └── aggregate/       # 集約ルート、値オブジェクト
│   └── service/             # ドメインサービス
├── application/             # アプリケーション層（ユースケース）
│   ├── usecase/             # オーケストレーション
│   └── query/               # クエリハンドラ
├── adapter/                 # アダプター層（外部接続）
│   ├── inbound/             # 入力アダプター
│   │   └── rest/            # REST Controller, Request/Response DTO
│   └── outbound/            # 出力アダプター
│       └── persistence/     # Entity, Repository 実装
└── api/                     # 公開インタフェース（他ドメインから参照可能）
    └── events/              # ドメインイベント
```

レイヤーの責務:

| レイヤー | 責務 | 依存して良い | 依存してはならない |
|---------|------|------------|------------------|
| domain | ビジネスロジック、不変条件 | 標準ライブラリのみ | フレームワーク、DB、外部API |
| application | ユースケースのオーケストレーション | domain | 具象アダプター実装 |
| adapter/inbound | HTTPリクエスト処理、DTO変換 | application, domain | outbound adapter |
| adapter/outbound | DB永続化、外部API呼び出し | domain（インタフェース） | application |

| 基準 | 判定 |
|------|------|
| ドメイン層にフレームワーク依存（@Entity, @Component 等） | REJECT |
| Controller が Repository を直接参照 | REJECT。UseCase 層を経由すること |
| ドメイン層からの外向き依存（DB, HTTP 等） | REJECT |
| アダプター間の直接依存（inbound → outbound） | REJECT |

## APIレイヤー設計（Controller）

Controller は薄く保つ。役割はリクエスト受信 → UseCase 委譲 → レスポンス返却のみ。

```typescript
// OK - 薄い Controller
class OrdersController {
  constructor(private readonly placeOrderUseCase: PlaceOrderUseCase) {}

  async post(request: OrderPostRequest): Promise<OrderPostResponse> {
    const output = await this.placeOrderUseCase.execute(request.toInput());
    return new OrderPostResponse(output.orderId);
  }
}

// NG - ビジネスロジックが Controller にある
async post(request: OrderPostRequest) {
  const stock = await this.inventoryRepo.findByProductId(request.productId);
  if (stock.quantity < request.quantity) {
    throw new BadRequestError('在庫不足');
  }
  const total = request.quantity * request.unitPrice * 1.1; // 税計算
  await this.orderRepo.save(new OrderEntity(...));
}
```

### Request/Response DTO 設計

Request と Response は別の型として定義する。ドメインモデルを API 経由で直接公開しない。

| 基準 | 判定 |
|------|------|
| ドメインモデルをレスポンスとして直接返却 | REJECT |
| Request DTO にビジネスロジック | REJECT。バリデーションのみ許可 |
| Response DTO にドメインロジック（計算等） | REJECT |
| Request と Response が同一型 | REJECT |

### RESTful アクション設計

状態遷移は動詞サブリソースとして表現する。

```
POST   /api/orders              → 注文作成
GET    /api/orders/{id}         → 注文取得
GET    /api/orders              → 注文一覧
POST   /api/orders/{id}/approve → 承認（状態遷移）
POST   /api/orders/{id}/cancel  → キャンセル（状態遷移）
```

| 基準 | 判定 |
|------|------|
| ドメイン操作（承認、キャンセル等）に PUT/PATCH | REJECT。POST + 動詞サブリソースを使用 |
| 単一エンドポイントで複数操作に分岐 | REJECT。操作ごとに個別エンドポイント |
| 論理削除に DELETE | REJECT。POST + 明示的操作（cancel 等）を使用 |

## バリデーション戦略

バリデーションは各層で異なる役割を持つ。1箇所に集約しない。

| レイヤー | 責務 | 仕組み | 例 |
|---------|------|--------|-----|
| APIレイヤー | 構造的バリデーション | スキーマ検証 | 必須項目、型、フォーマット |
| UseCaseレイヤー | ビジネスルール検証 | Read Model 参照 | 重複チェック、前提条件の存在確認 |
| ドメインレイヤー | 状態遷移の不変条件 | `require` / ガード節 | 「PENDING でなければ承認不可」 |

## データモデリング

### 集約設計の原則

| 原則 | 説明 |
|------|------|
| トランザクション境界 | 1つの集約 = 1つのトランザクション |
| 小さな集約 | 必要最小限のエンティティを含む |
| ID参照 | 他の集約はID参照で保持、直接参照は禁止 |
| 結果整合性 | 集約間はドメインイベントで整合 |

### 値オブジェクト vs エンティティ

| 特性 | 値オブジェクト | エンティティ |
|------|-------------|------------|
| 同一性 | 値で比較 | IDで識別 |
| 可変性 | イミュータブル | ライフサイクルあり |
| 例 | Money, Email, DateRange | User, Order, Product |

```typescript
// 値オブジェクト - イミュータブル、値で比較
class Money {
  constructor(readonly amount: number, readonly currency: string) {
    if (amount < 0) throw new Error('金額は0以上');
  }
  add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error('通貨が異なる');
    return new Money(this.amount + other.amount, this.currency);
  }
  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}
```

## エラーハンドリング

### エラー分類

| カテゴリ | HTTP Status | 対処 | 例 |
|---------|-------------|------|-----|
| クライアントエラー | 4xx | ユーザーに修正を促す | バリデーション失敗、認証失敗 |
| ビジネスルール違反 | 409, 422 | ドメインルールに基づく拒否 | 在庫不足、状態遷移不可 |
| サーバーエラー | 5xx | ログ+リトライ+アラート | DB接続失敗、外部API障害 |

### エラーレスポンス設計

```typescript
// 統一的なエラーレスポンス形式
interface ErrorResponse {
  readonly code: string;        // マシンリーダブルなコード
  readonly message: string;     // 人間向けメッセージ
  readonly details?: unknown[]; // フィールドレベルのエラー詳細
}
```

| 基準 | 判定 |
|------|------|
| スタックトレースがレスポンスに含まれる | REJECT |
| 内部実装の詳細がエラーメッセージに漏洩 | REJECT |
| エラーコードがなく、メッセージ文字列のみに依存 | REJECT |
| 全エラーが 500 で返される | REJECT |

## 非同期処理とリトライ

### リトライ戦略

| 戦略 | 用途 |
|------|------|
| 即時リトライ | 一時的なネットワーク障害 |
| 指数バックオフ | 外部サービスの過負荷 |
| サーキットブレーカー | 継続的な障害の検出と遮断 |

| 基準 | 判定 |
|------|------|
| リトライ上限が未設定 | REJECT |
| べき等でない操作のリトライ | REJECT |
| バックオフなしの無限リトライ | REJECT |
