# Choreia Photos

https://choreia.github.io/Photos/

写真・動画を共有ドライブに一括転送するWebアプリ。AIが自動でタグ付け・フォルダ名提案・複数イベントの仕分けを行います。

## 機能

- **写真・動画アップロード** — カメラロールから複数選択し、共有ドライブへ一括転送
- **AI自動分析（Gemini 2.5 Flash）** — 写真ごとに個別タグ付け、撮影場所の推定、私用写真の警告
- **複数イベント自動仕分け** — 異なるイベントの写真が混ざっていても、AIが自動でグループ分けして別フォルダに振り分け
- **フォルダ名の自動提案** — 「YYYYMM + 内容」の形式でフォルダ名を提案（手動変更も可能）
- **フォルダ閲覧** — 転送先フォルダの階層をブラウズし、アップロード済み写真を確認
- **横断検索** — AIが付けたタグ・キーワードで共有ドライブ内の写真を検索
- **管理者機能** — 管理者の追加・削除、転送先の変更
- **Google Photos移行** — Google フォトから写真を選択し、共有ドライブへ自動転送（退職者の写真消失対策）

## 技術構成

- 単一HTMLファイル（SPA）— ビルド不要
- Google Identity Services（OAuth 2.0）
- Google Drive API v3
- Google Photos Picker API（写真移行用）
- Gemini API（`gemini-2.5-flash`）
- Cloudflare Worker（Photos Picker APIプロキシ — 無料枠）

## セットアップ

1. Google Cloud Consoleで OAuth 2.0 クライアントIDを作成
2. `index.html` 内の `CLIENT_ID` を自分のクライアントIDに変更
3. 必要なAPIを有効化:
   - Google Drive API
   - Generative Language API
   - Photos Picker API（Google Photos移行機能を使う場合）
4. Webサーバーでホスティング（GitHub Pages等）

### Google Photos移行のセットアップ（オプション）

1. `worker/` ディレクトリでプロキシをデプロイ:
   ```bash
   cd worker
   npm install
   npx wrangler deploy
   ```
2. デプロイ後に表示されるURL（例: `https://choreia-photos-proxy.xxx.workers.dev`）をコピー
3. アプリの管理者設定 → 「プロキシURL」に貼り付けて保存

## 利用の流れ

1. 組織のGoogleアカウントでログイン（個人アカウント不可）
2. 初回: 転送先の共有ドライブ・フォルダを選択（設定は同ドメインで共有）
3. 写真・動画を選択 → AI分析（グルーピング+タグ付け）→ フォルダ名を確認 → アップロード

## 制約

- 組織（Google Workspace）アカウント専用（gmail.com等のフリーメールはブロック）
- グルーピング分析は最大20枚を対象（それ以上は最初の20枚で判定）
- 個別タグ付けはバックグラウンドで全枚対応（5枚ずつ順次処理）
- アクセストークンはセッション内のみ保持

## ライセンス

Private
