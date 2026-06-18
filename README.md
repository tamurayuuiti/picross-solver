# react-template

個人開発向けの React テンプレートリポジトリです。

React + TypeScript + Vite + Tailwind CSS をベースに、軽量かつ拡張しやすい構成を提供します。

---

## 技術スタック

* React
* TypeScript
* Vite
* Tailwind CSS v4

---

## ディレクトリ構成

```text
src/
├── components/   # 汎用UIコンポーネント
├── pages/        # ページ単位の画面
├── layouts/      # 共通レイアウト
├── lib/          # API・外部サービス・共通処理
```

---

## セットアップ

### 1. テンプレートからリポジトリを作成

GitHub の **Use this template** を選択し、新しいリポジトリを作成します。

### 2. リポジトリを取得

```bash
git clone <repository-url>
```

### 3. プロジェクトへ移動

```bash
cd <project-name>
```

### 4. 依存関係をインストール

```bash
npm install
```

### 5. 開発サーバを起動

```bash
npm run dev
```

デフォルト：

```text
http://localhost:5173
```

---

## ビルド

```bash
npm run build
```

ビルド成果物は以下に出力されます：

```text
dist/
```

---

## デプロイ

Vercel を想定しています。

GitHub リポジトリと連携することで、push 時に自動ビルド・自動デプロイが実行されます。

---

## 開発メモ

- パスエイリアス `@` を利用する
- 共通処理は `src/lib` に集約する
- UI コンポーネントは `src/components` に配置する
- 必要最低限の構成を維持する
- 重い依存関係は必要になってから追加する
- ビルド成果物（`dist/`）は直接編集しない