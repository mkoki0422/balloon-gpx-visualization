# GPX 3D Visualization

GPXファイル（GPS追跡データ）を3Dアニメーションで可視化するWebアプリケーション

## 機能

- 2つのGPXトラックを同時に3D表示・比較
- 白地図と衛星写真の切り替え
- 時間範囲指定によるアニメーション
- Google Earthライクな操作感（回転・ズーム等）
- 物体の垂直速度・水平速度・3D速度の表示
- 加速度情報のリアルタイム表示
- 詳細データテーブルの表示

## 技術スタック

- **フロントエンド**:
  - Three.js: 3Dレンダリング
  - Leaflet: 地図表示
  - HTML/CSS/JavaScript

- **バックエンド**:
  - FastAPI: Python Webフレームワーク
  - Pandas/NumPy: データ処理

- **コンテナ化**:
  - Docker
  - Docker Compose

## インストール方法

### 前提条件

- Docker および Docker Compose がインストールされていること

### インストール手順

1. リポジトリをクローン:
```bash
git clone https://github.com/yourusername/gpx-3d-visualization.git
cd gpx-3d-visualization
```

2. Dockerコンテナを起動:
```bash
docker-compose up -d
```

3. アプリにアクセス:
ブラウザで http://localhost にアクセス

## 使い方

1. トップページで2つのGPXファイルをアップロード
2. アップロード完了後、自動的に3Dビジュアライゼーション画面に切り替わります
3. 再生ボタンをクリックして、アニメーションを開始
4. スライダーで時間範囲を選択可能
5. マウスドラッグで視点を自由に変更可能

## 開発環境

### フロントエンド開発

フロントエンドのソースコードは `frontend/public` ディレクトリにあります。

### バックエンド開発

バックエンドのソースコードは `backend/app` ディレクトリにあります。

## ライセンス

MIT

## 作者

Your Name 