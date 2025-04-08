// アプリケーション設定
const CONFIG = {
    // APIのベースURL
    API_BASE_URL: '/api',
    
    // マップスタイル設定
    MAP: {
        DEFAULT_CENTER: [35.6812, 139.7671],  // 東京
        DEFAULT_ZOOM: 13,
        TILE_LAYERS: {
            STANDARD: {
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
                maxNativeZoom: 18,
                minZoom: 5,
                tileSize: 256,
                zoomOffset: 0,
                updateWhenIdle: true,
                keepBuffer: 2,
                noWrap: false,
                // パフォーマンス向上のためのオプション
                updateWhenZooming: false,  // ズーム中は更新しない
                updateInterval: 500,       // 更新間隔を長くする
                crossOrigin: true,         // クロスオリジン対応
                maxNativeZoom: 17,         // ネイティブズームレベルを下げる
                errorTileUrl: '',          // エラータイルの代替画像
                subdomains: 'abc',         // サブドメインを活用
                detectRetina: false        // Retinaディスプレイ検出を無効化
            },
            SATELLITE: {
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                maxZoom: 19,
                maxNativeZoom: 17,         // ネイティブズームレベルを下げる
                minZoom: 5,
                tileSize: 256,
                zoomOffset: 0,
                updateWhenIdle: true,
                keepBuffer: 2,
                noWrap: false,
                // パフォーマンス向上のためのオプション
                updateWhenZooming: false,  // ズーム中は更新しない
                updateInterval: 500,       // 更新間隔を長くする
                crossOrigin: true,         // クロスオリジン対応
                errorTileUrl: '',          // エラータイルの代替画像
                detectRetina: false        // Retinaディスプレイ検出を無効化
            }
        }
    },
    
    // 3Dビジュアライゼーション設定
    VISUALIZATION: {
        ANIMATION_SPEED: 1,  // 初期再生速度
        FRAME_INTERVAL: 33,  // フレーム更新間隔を33ms（30fps）に変更
        COLORS: {
            TRACK_A: 0xe74c3c,  // トラックA（赤）
            TRACK_B: 0x3498db   // トラックB（青）
        },
        HEIGHT_SCALE: 0.2,  // 1.0から0.2に変更：高度スケールを小さくして3D表示を調整
        POINT_SIZE: 2.0,     // 点のサイズ
    },
    
    // テーブル設定
    TABLE: {
        PAGE_SIZE: 100,  // 1ページあたりの行数
    }
}; 