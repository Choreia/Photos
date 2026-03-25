# Choreia Photos

写真を選んで共有ドライブに一括転送するWebアプリ。AIが自動でタグ付け・フォルダ名を提案します。

## 機能

- **写真アップロード** — カメラロールから複数選択し、共有ドライブへ一括転送
- **AI分析（Gemini）** — 写真の内容を自動分析してタグ付け・フォルダ名提案・私用写真の警告
- **フォルダ閲覧** — 転送先フォルダの階層をブラウズし、アップロード済み写真を確認
- **検索** — タグ・キーワードで共有ドライブ内の写真を横断検索

## 技術構成

- 単一HTMLファイル（SPA）— ビルド不要
- Google Identity Services（OAuth 2.0）
- Google Drive API v3
- Gemini API（`gemini-2.0-flash`）

## セットアップ

1. Google Cloud Consoleで OAuth 2.0 クライアントIDを作成
2. `index.html` 内の `CLIENT_ID` を自分のクライアントIDに変更
3. 必要なAPIを有効化:
   - Google Drive API
   - Generative Language API
4. Webサーバーでホスティング（GitHub Pages、Cloudflare Pages等）

## 利用の流れ

1. 組織のGoogleアカウントでログイン（個人アカウント不可）
2. 初回: 転送先の共有ドライブ・フォルダを選択（設定は同ドメインで共有）
3. 写真を選択 → AI分析 → フォルダ名を確認 → アップロード

## 制約

- 組織（Google Workspace）アカウント専用（gmail.com等のフリーメールはブロック）
- AI分析は最初の5枚のみ対象
- アクセストークンはセッション内のみ保持

## ライセンス

Private
