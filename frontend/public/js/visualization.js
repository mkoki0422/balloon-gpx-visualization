// 3Dビジュアライゼーションを処理するモジュール
const Visualization = {
    // プロパティ
    map: null,
    visualizationData: null,
    currentMapStyle: 'STANDARD',
    isPlaying: false,
    playbackSpeed: 1.0,
    currentTimeIndex: 0,
    timeStep: 100, // 100ミリ秒ごとに更新
    elapsedTime: 0,
    lastTimestamp: 0,
    animationTimer: null,
    trackAMarker: null,
    trackBMarker: null,
    trackAPolyline: null,
    trackBPolyline: null,
    trackAInfo: null,
    trackBInfo: null,
    originalData: null,
    tableData: null,
    lastInfoData: null,
    lastHighlightedIndex: null,
    lastTimelinePercentage: null,
    trackACircle: null,
    trackBCircle: null,
    
    // 初期化
    init() {
        console.log('Visualization.init called');
        window.addEventListener('resize', () => {
            if (this.map) {
                this.onWindowResize();
            }
        });
        
        // リサイズハンドラの設定
        this.setupResizeHandler();
        
        // 再生ボタンのイベントリスナーを設定
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.togglePlayback();
            });
        }
        
        // リセットボタンのイベントリスナーを設定
        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetPlayback();
            });
        }
        
        // 再生速度スライダーのイベントリスナーを設定
        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.setPlaybackSpeed(parseFloat(e.target.value));
            });
        }
    },
    
    // データの前処理を行う共通関数
    preprocessVisualizationData(visualizationData) {
        if (!visualizationData || !Array.isArray(visualizationData)) {
            console.error('Visualization data is not an array.');
            return [];
        }

        if (visualizationData.length === 0) {
            console.error('Visualization data is empty.');
            return [];
        }

        // タイムスタンプが存在するか確認し、必要に応じて追加
        const hasTimestamps = visualizationData.some(data => data.timestamp !== undefined);
        if (!hasTimestamps) {
            console.log('No timestamp data found. Adding timestamps based on time values...');
            // タイムスタンプを生成
            visualizationData.forEach((data, index) => {
                if (data.time) {
                    try {
                        // timeがISO形式の文字列またはDate型であれば変換
                        const date = new Date(data.time);
                        data.timestamp = date.getTime();
                    } catch (e) {
                        // 変換できない場合はインデックスベースで100msごとにタイムスタンプを設定
                        data.timestamp = index * 100;
                    }
                } else {
                    // timeプロパティがない場合もインデックスベースで設定
                    data.timestamp = index * 100;
                }
            });
            console.log('Timestamps added to visualization data.');
        }

        return visualizationData;
    },
    
    // ビジュアライゼーションデータを設定する関数
    setVisualizationData(visualizationData) {
        console.log('[DEBUG] setVisualizationData called with data:', visualizationData);
        
        // データの前処理
        const processedData = this.preprocessVisualizationData(visualizationData);
        if (processedData.length === 0) {
            console.warn('[DEBUG] No processed data available');
            return;
        }
        
        // データを設定
        this.visualizationData = processedData;
        this.originalData = processedData;
        this.currentTimeIndex = 0;
        console.log('[DEBUG] Data set successfully. Length:', processedData.length);
        
        // マップが初期化されていない場合は初期化
        if (!this.map) {
            console.log('[DEBUG] Map not initialized, calling setupMapAndViz');
            this.setupMapAndViz('map-container', visualizationData);
        } else {
            console.log('[DEBUG] Map already initialized, updating tracks');
            // マップが既に初期化されている場合は、トラックの描画のみ更新
            this.renderTracks();
            
            // マップの表示領域を調整
            requestAnimationFrame(() => {
                if (!this.map) return;
                console.log('[DEBUG] Invalidating map size');
                this.map.invalidateSize();
                
                if (this.trackAPolyline && this.trackBPolyline) {
                    try {
                        const bounds = this.trackAPolyline.getBounds().extend(this.trackBPolyline.getBounds());
                        if (bounds.isValid()) {
                            console.log('[DEBUG] Fitting map to track bounds');
                            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                        }
                    } catch (e) {
                        console.error('[DEBUG] Error fitting bounds:', e);
                    }
                }
                
                // 最初のデータポイントで表示を更新
                this.updateDisplay(0);
            });
        }
    },
    
    // マップとビジュアライゼーションのセットアップ
    setupMapAndViz(containerId, visualizationData, tableData) {
        console.log('[DEBUG] setupMapAndViz called');

        try {
            if (this.map) {
                console.log('[DEBUG] Removing existing map');
                this.map.remove();
                this.map = null;
            }

            const mapContainer = document.getElementById(containerId);
            if (!mapContainer) {
                console.error('[DEBUG] Map container not found:', containerId);
                return;
            }

            // マップの初期化
            this.map = L.map('map', {
                center: [35.6895, 139.6917],
                zoom: 13,
                zoomControl: false,  // ズームコントロールを無効化
                scrollWheelZoom: true
            });

            // 標準地図レイヤー
            this.standardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            });

            // 衛星画像レイヤー
            this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            });

            // デフォルトレイヤーを追加
            this.currentLayer = this.standardLayer;
            this.currentLayer.addTo(this.map);

            // マップスタイル切り替えボタンの設定
            const mapStyleBtn = document.getElementById('map-style-toggle');
            if (mapStyleBtn) {
                mapStyleBtn.textContent = "衛星画像に切り替え";
                // 既存のイベントリスナーを削除
                const newMapStyleBtn = mapStyleBtn.cloneNode(true);
                mapStyleBtn.parentNode.replaceChild(newMapStyleBtn, mapStyleBtn);
                
                // 新しいイベントリスナーを追加
                newMapStyleBtn.addEventListener('click', () => {
                    console.log('[DEBUG] Map style toggle button clicked');
                    this.toggleMapStyle();
                });
            }

            console.log('[DEBUG] Map initialized with standard layer');

            // イベントリスナーの初期化（マップスタイル切り替えは除外）
            this.initEventListeners();
            console.log('Event listeners initialized.');

            console.log('Setting visualization data:', visualizationData ? visualizationData.length : 0, 'points');
            if (!visualizationData || visualizationData.length === 0) {
                console.error('Visualization data is empty or invalid.');
                this.visualizationData = [];
                this.originalData = [];
                this.populateTable([]);
                return;
            }
            
            // タイムスタンプが存在するか確認し、必要に応じて追加
            const hasTimestamps = visualizationData.some(data => data.timestamp !== undefined);
            if (!hasTimestamps) {
                console.log('No timestamp data found. Adding timestamps based on time values...');
                // タイムスタンプを生成
                visualizationData.forEach((data, index) => {
                    if (data.time) {
                        try {
                            // timeがISO形式の文字列またはDate型であれば変換
                            const date = new Date(data.time);
                            data.timestamp = date.getTime();
                        } catch (e) {
                            // 変換できない場合はインデックスベースで100msごとにタイムスタンプを設定
                            data.timestamp = index * 100;
                        }
                    } else {
                        // timeプロパティがない場合もインデックスベースで設定
                        data.timestamp = index * 100;
                    }
                });
                console.log('Timestamps added to visualization data.');
            }
            
            this.visualizationData = visualizationData;
            this.originalData = visualizationData;
            this.currentTimeIndex = 0;

            console.log('Rendering tracks...');
            this.renderTracks();

            console.log('Populating table...');
            this.populateTable(tableData);

            console.log('Adjusting map size and bounds...');
            requestAnimationFrame(() => {
                if (!this.map) return;
                this.map.invalidateSize();
                console.log('Map size invalidated.');

                if (this.trackAPolyline && this.trackBPolyline) {
                    try {
                        const bounds = this.trackAPolyline.getBounds().extend(this.trackBPolyline.getBounds());
                        if (bounds.isValid()) {
                            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                            console.log('Map bounds fitted to tracks.');
                        }
                    } catch (e) {
                        console.error('Error fitting bounds:', e);
                    }
                }
                this.updateDisplay(this.currentTimeIndex);
            });

            console.log('Visualization setup complete.');
        } catch (e) {
            console.error("Error in setupMapAndViz:", e);
            alert("地図の初期化に失敗しました。");
        }
    },
    
    // イベントリスナーの設定
    initEventListeners() {
        console.log('[DEBUG] Initializing event listeners');
        
        // 再生/一時停止ボタンのイベントリスナー
        const playBtn = document.getElementById('play-pause');
        if (playBtn) {
            // 既存のイベントリスナーを削除
            const newPlayBtn = playBtn.cloneNode(true);
            playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
            
            // 新しいイベントリスナーを追加
            newPlayBtn.addEventListener('click', () => {
                console.log('[DEBUG] Play button clicked');
                this.togglePlayback();
            });
        }
        
        // リセットボタンのイベントリスナー
        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                console.log('Reset button clicked');
                this.resetPlayback();
            });
        }
        
        // 再生速度スライダーのイベントリスナー
        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.setPlaybackSpeed(parseFloat(e.target.value));
            });
        }
        
        // カメラリセットボタンのイベントリスナー
        const resetCameraBtn = document.getElementById('reset-camera');
        if (resetCameraBtn) {
            resetCameraBtn.addEventListener('click', () => {
                this.resetCamera();
            });
        }
        
        // タイムラインのイベントリスナー
        this.initTimelineListeners();
        
        console.log('Event listeners initialized');
    },
    
    // コントロールのイベントリスナーをセットアップ
    initControlListeners() {
        console.log('[DEBUG] Initializing control listeners');

        // スピードスライダーのイベントリスナー
        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (event) => {
                const speed = parseFloat(event.target.value);
                console.log(`[DEBUG] Speed slider changed: ${speed}`);
                this.setSpeed(speed);
            });
            
            // 初期値を設定
            this.setSpeed(parseFloat(speedSlider.value));
        } else {
            console.warn('[DEBUG] Speed slider not found');
        }

        // Map style toggle
        const mapStyleButton = document.getElementById('map-style-button');
        if (mapStyleButton) {
            mapStyleButton.addEventListener('click', () => {
                console.log('[DEBUG] Map style button clicked');
                this.toggleMapStyle();
            });
        } else {
            console.warn('[DEBUG] Map style button not found');
        }

        // Reset camera
        const resetCameraButton = document.getElementById('reset-camera-button');
        if (resetCameraButton) {
            resetCameraButton.addEventListener('click', () => {
                console.log('[DEBUG] Reset camera button clicked');
                this.resetCamera();
            });
        } else {
            console.warn('[DEBUG] Reset camera button not found');
        }

        // Play/Pause
        const playButton = document.getElementById('play-button');
        if (playButton) {
            playButton.addEventListener('click', () => {
                console.log('[DEBUG] Play button clicked');
                this.togglePlayback();
            });
        } else {
            console.warn('[DEBUG] Play button not found');
        }

        // Reset time
        const resetTimeButton = document.getElementById('reset-time-button');
        if (resetTimeButton) {
            resetTimeButton.addEventListener('click', () => {
                console.log('[DEBUG] Reset time button clicked');
                this.resetTime();
            });
        } else {
            console.warn('[DEBUG] Reset time button not found');
        }
    },
    
    // すべての子要素にイベント伝播を防止するリスナーを追加する関数
    preventEventPropagationForAllChildren(element) {
        if (!element) return;
        
        console.log('Setting up event prevention for element:', element.className || element.id);
        
        const handleEvent = function(e) {
            // クリックイベントやボタン操作は許可
            if (e.type === 'click' || 
                (e.type === 'mousedown' && 
                    (e.target.tagName === 'BUTTON' || 
                     e.target.classList.contains('play-icon') || 
                     e.target.classList.contains('reset-icon'))) || 
                (e.type === 'input' && e.target.tagName === 'INPUT')) {
                // ボタン操作やインプットは通常通り処理
                return;
            }
            
            // ホイールイベント、右クリック、ダブルクリックのデフォルト動作は防止
            if (e.type === 'wheel' || e.type === 'contextmenu' || e.type === 'dblclick') {
                e.stopPropagation();
            }
        };
        
        // マップドラッグを妨げないイベントリスナーを追加
        const events = ['wheel', 'contextmenu', 'dblclick'];
        
        events.forEach(eventType => {
            element.addEventListener(eventType, handleEvent, true);
        });
    },
    
    // トラック描画
    renderTracks() {
        console.log('[DEBUG] renderTracks called');
        this.clearTracks();

        if (!this.map || !this.visualizationData || this.visualizationData.length === 0) {
            console.error('[DEBUG] Cannot render tracks: Map or data not ready. Map:', !!this.map, 'Data length:', this.visualizationData?.length);
            return;
        }

        try {
            console.log('[DEBUG] Processing track coordinates...');
            const trackAData = this.visualizationData.map(p => [p.track_a?.lat, p.track_a?.lon]).filter(p => p[0] != null && p[1] != null);
            const trackBData = this.visualizationData.map(p => [p.track_b?.lat, p.track_b?.lon]).filter(p => p[0] != null && p[1] != null);

            console.log('[DEBUG] Track data processed:', {
                trackAPoints: trackAData.length,
                trackBPoints: trackBData.length
            });

            if (trackAData.length === 0 && trackBData.length === 0) {
                console.warn("[DEBUG] No valid coordinates found to render tracks.");
                return;
            }

            // トラックAのポリライン
            if (trackAData.length > 0) {
                console.log('[DEBUG] Adding Track A polyline');
                this.trackAPolyline = L.polyline(trackAData, { 
                    color: '#ef4444',
                    weight: 3,
                    opacity: 0.8
                }).addTo(this.map);
                
                // トラックAのマーカー（開始地点）
                this.trackAMarker = L.marker(trackAData[0], { 
                    title: "Track A",
                    icon: L.divIcon({
                        className: 'custom-marker track-a-marker',
                        html: '<div class="marker-dot"></div>',
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })
                }).addTo(this.map);
                console.log('[DEBUG] Track A marker added at', trackAData[0]);
            }
            
            // トラックBのポリライン
            if (trackBData.length > 0) {
                console.log('[DEBUG] Adding Track B polyline');
                this.trackBPolyline = L.polyline(trackBData, { 
                    color: '#3b82f6',
                    weight: 3,
                    opacity: 0.8
                }).addTo(this.map);
                
                // トラックBのマーカー（開始地点）
                this.trackBMarker = L.marker(trackBData[0], { 
                    title: "Track B",
                    icon: L.divIcon({
                        className: 'custom-marker track-b-marker',
                        html: '<div class="marker-dot"></div>',
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })
                }).addTo(this.map);
                console.log('[DEBUG] Track B marker added at', trackBData[0]);
            }
            
            // ズームコントロールを追加
            this.addZoomControl();
            
            // 情報オーバーレイを表示
            this.showInfoOverlay();
            
            // 時刻バーの設定 - 開始時刻と終了時刻を設定
            if (this.visualizationData.length > 0) {
                const startTime = this.formatTime(this.visualizationData[0].timestamp);
                const endTime = this.formatTime(this.visualizationData[this.visualizationData.length - 1].timestamp);
                
                const startTimeEl = document.getElementById('start-time');
                const endTimeEl = document.getElementById('end-time');
                const currentTimeEl = document.getElementById('current-time-display');
                
                if (startTimeEl) startTimeEl.textContent = startTime;
                if (endTimeEl) endTimeEl.textContent = endTime;
                if (currentTimeEl) currentTimeEl.textContent = startTime;
                
                console.log('[DEBUG] Time bar initialized with start:', startTime, 'end:', endTime);
            }
            
            console.log('[DEBUG] Tracks rendered successfully');
        } catch (e) {
            console.error("[DEBUG] Error rendering tracks:", e);
        }
    },
    
    // ズームコントロールを追加
    addZoomControl() {
        // ズームコントロールは無効化されているため、何もしない
        console.log('Zoom controls are disabled');
    },
    
    // 情報オーバーレイを表示
    showInfoOverlay() {
        const infoOverlay = document.getElementById('info-overlay');
        if (infoOverlay) {
            infoOverlay.style.display = 'block';
            console.log('Info overlay displayed');
        } else {
            console.warn('Info overlay element not found');
        }
    },
    
    // テーブル描画
    populateTable(data) {
        console.log('Visualization.populateTable called with:', data ? data.length : 0, 'table rows');
        const tableBody = document.getElementById('table-body');
        if (!tableBody) {
            console.error('table-body element not found.');
            return;
        }
        tableBody.innerHTML = '';

        if (!data || data.length === 0) {
            console.warn('Table data is empty.');
            const tr = tableBody.insertRow();
            const td = tr.insertCell();
            td.colSpan = 11; // 11カラムに変更
            td.textContent = '表示するデータがありません。';
            td.style.textAlign = 'center';
            return;
        }
        
        this.tableData = data;
        data.forEach((row, index) => {
            const tr = document.createElement('tr');
            const getValue = (val, precision = null) => (val != null && !isNaN(val)) ? (precision !== null ? val.toFixed(precision) : val) : '-';

            // 10秒平均垂直速度を計算
            const avgVSpeedA = this.calculateAverageVerticalSpeed(this.visualizationData, index, 'a', 10);
            const avgVSpeedB = this.calculateAverageVerticalSpeed(this.visualizationData, index, 'b', 10);

            tr.innerHTML = `
                <td>${row.time || '-'}</td>
                <td>${getValue(row.ele_a_ft, 1)}</td>
                <td>${getValue(row.ele_b_ft, 1)}</td>
                <td>${getValue(row.height_diff_ft, 1)}</td>
                <td>${getValue(row.vertical_speed_a, 3)}</td>
                <td>${getValue(row.vertical_speed_b, 3)}</td>
                <td>${getValue(avgVSpeedA, 3)}</td>
                <td>${getValue(avgVSpeedB, 3)}</td>
                <td>${getValue(row.vertical_accel_a, 3)}</td>
                <td>${getValue(row.vertical_accel_b, 3)}</td>
                <td>${getValue(row.distance_3d, 3)}</td>
            `;
            tr.setAttribute('data-index', index);
            tr.addEventListener('click', () => {
                this.jumpToTimeIndex(index);
            });
            tableBody.appendChild(tr);
        });
        console.log('Table populated.');
    },
    
    // 表示更新
    updateDisplay(index) {
        if (!this.visualizationData || index < 0 || index >= this.visualizationData.length) {
            console.warn(`Invalid index for updateDisplay: ${index}`);
            return;
        }
        
        this.currentTimeIndex = index;
        const currentData = this.visualizationData[index];
        
        if (!currentData) {
            console.warn(`No data found at index: ${index}`);
            return;
        }

        // マーカー位置の更新
        if (currentData.track_a) {
            const latA = currentData.track_a.lat;
            const lonA = currentData.track_a.lon;
            if (this.trackAMarker && latA != null && lonA != null) {
                this.trackAMarker.setLatLng([latA, lonA]);
            }
        }

        if (currentData.track_b) {
            const latB = currentData.track_b.lat;
            const lonB = currentData.track_b.lon;
            if (this.trackBMarker && latB != null && lonB != null) {
                this.trackBMarker.setLatLng([latB, lonB]);
            }
        }

        // 情報オーバーレイの更新
        this.updateCurrentPointDisplay(index);

        // 現在の時刻表示を更新（JSTに変換）
        const currentTimeEl = document.getElementById('current-time');
        if (currentTimeEl && currentData.timestamp) {
            const date = new Date(currentData.timestamp);
            // UTCからJSTに変換（+9時間）
            date.setTime(date.getTime() + (9 * 60 * 60 * 1000));
            
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const seconds = date.getSeconds().toString().padStart(2, '0');
            currentTimeEl.textContent = `${hours}:${minutes}:${seconds}`;
        }

        // テーブル行のハイライトとタイムラインの更新
        this.highlightTableRow(index);
        this.updateCurrentTimeIndicator(index);
    },
    
    // マーカーを強調表示（アニメーション）
    pulseMarkers() {
        // トラックAのマーカーを強調
        if (this.trackAMarker) {
            const markerEl = this.trackAMarker.getElement();
            if (markerEl && !markerEl.classList.contains('pulse-effect')) {
                markerEl.classList.add('pulse-effect');
            }
        }
        
        // トラックBのマーカーを強調
        if (this.trackBMarker) {
            const markerEl = this.trackBMarker.getElement();
            if (markerEl && !markerEl.classList.contains('pulse-effect')) {
                markerEl.classList.add('pulse-effect');
            }
        }
    },
    
    // マーカーのアニメーションをリセット
    resetMarkerAnimation() {
        if (this.trackAMarker) {
            const markerEl = this.trackAMarker.getElement();
            if (markerEl) {
                markerEl.classList.remove('pulse-effect');
            }
        }
        
        if (this.trackBMarker) {
            const markerEl = this.trackBMarker.getElement();
            if (markerEl) {
                markerEl.classList.remove('pulse-effect');
            }
        }
    },
    
    // 現在時刻の表示更新
    updateCurrentPointDisplay(index) {
        if (!this.visualizationData || index >= this.visualizationData.length) return;
        
        const data = this.visualizationData[index];
        if (!data) return;
        
        // ヘルパー関数: 値を指定された精度で表示
        const setText = (id, value, unit = '', precision = 1) => {
            const element = document.getElementById(id);
            if (element) {
                if (value != null && !isNaN(value)) {
                    element.textContent = value.toFixed(precision) + unit;
                } else {
                    element.textContent = '-';
                }
            }
        };
        
        // トラックAのデータ更新
        if (data.track_a) {
            setText('alt-a', data.track_a.alt, ' ft', 0);
            setText('vspeed-a', data.track_a.speeds?.vertical, ' m/s', 2);
            setText('vspeed-avg-a', this.calculateAverageVerticalSpeed(this.visualizationData, index, 'a', 10), ' m/s', 2);
            setText('vaccel-a', data.track_a.accelerations?.vertical, ' m/s²', 2);
        }
        
        // トラックBのデータ更新
        if (data.track_b) {
            setText('alt-b', data.track_b.alt, ' ft', 0);
            setText('vspeed-b', data.track_b.speeds?.vertical, ' m/s', 2);
            setText('vspeed-avg-b', this.calculateAverageVerticalSpeed(this.visualizationData, index, 'b', 10), ' m/s', 2);
            setText('vaccel-b', data.track_b.accelerations?.vertical, ' m/s²', 2);
        }
        
        // 共通データの更新
        setText('distance-3d', data.distance3D, ' m', 1);
        setText('alt-diff', data.track_a && data.track_b ? 
            Math.abs((data.track_a.alt || 0) - (data.track_b.alt || 0)) : null, ' ft', 0);
        
        // 現在の時刻表示を更新（JSTに変換）
        const currentTimeDisplay = document.getElementById('current-time-display');
        if (currentTimeDisplay && data.timestamp) {
            const displayTime = this.formatTime(data.timestamp);
            currentTimeDisplay.textContent = displayTime;
        }
    },

    // 過去n秒間の垂直速度平均を計算する関数
    calculateAverageVerticalSpeed(data, currentIndex, trackKey, seconds) {
        if (!data || !data[currentIndex]) return null;
        
        const currentTime = data[currentIndex].timestamp;
        if (!currentTime) return null;
        
        const targetTime = currentTime - (seconds * 1000); // n秒前の時間
        
        let startIndex = currentIndex;
        // n秒前のデータポイントを探す
        while (startIndex > 0 && data[startIndex].timestamp > targetTime) {
            startIndex--;
        }
        
        // 平均を計算するためのデータを収集
        let sum = 0;
        let count = 0;
        
        for (let i = startIndex; i <= currentIndex; i++) {
            const item = data[i];
            if (item && item[`track_${trackKey}`] && typeof item[`track_${trackKey}`].speeds?.vertical === 'number') {
                sum += item[`track_${trackKey}`].speeds.vertical;
                count++;
            }
        }
        
        return count > 0 ? sum / count : null;
    },
    
    // マーカー位置の更新
    updateMarkerPositions() {
        if (!this.visualizationData || this.currentTimeIndex < 0 || this.currentTimeIndex >= this.visualizationData.length) {
            console.warn('Invalid index or no visualization data for marker update');
            return;
        }
        
        const currentData = this.visualizationData[this.currentTimeIndex];
        if (!currentData) {
            console.warn('No data found at current index for marker update');
            return;
        }

        // トラックAのマーカー更新
        const latA = currentData.track_a?.lat;
        const lonA = currentData.track_a?.lon;
        if (this.trackAMarker) {
            if (latA != null && lonA != null) {
                this.trackAMarker.setLatLng([latA, lonA]);
                
                // トラックAの位置円を更新または作成
                if (this.trackACircle) {
                    this.trackACircle.setLatLng([latA, lonA]);
                } else {
                    this.trackACircle = L.circle([latA, lonA], {
                        color: '#ef4444',
                        fillColor: '#ef4444',
                        fillOpacity: 0.2,
                        radius: 15, // 15メートルの円
                        weight: 1
                    }).addTo(this.map);
                }
            }
        } else if (latA != null && lonA != null && this.map) {
            // マーカーが初期化されていない場合は作成
            this.trackAMarker = L.marker([latA, lonA], { 
                title: "Track A", 
                icon: L.divIcon({
                    className: 'custom-marker track-a-marker',
                    html: '<div class="marker-dot"></div>',
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                })
            }).addTo(this.map);
            
            // トラックAの位置円を作成
            this.trackACircle = L.circle([latA, lonA], {
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.2,
                radius: 15,
                weight: 1
            }).addTo(this.map);
        }
        
        // トラックBのマーカー更新
        const latB = currentData.track_b?.lat;
        const lonB = currentData.track_b?.lon;
        if (this.trackBMarker) {
            if (latB != null && lonB != null) {
                this.trackBMarker.setLatLng([latB, lonB]);
                
                // トラックBの位置円を更新または作成
                if (this.trackBCircle) {
                    this.trackBCircle.setLatLng([latB, lonB]);
                } else {
                    this.trackBCircle = L.circle([latB, lonB], {
                        color: '#3b82f6',
                        fillColor: '#3b82f6',
                        fillOpacity: 0.2,
                        radius: 15,
                        weight: 1
                    }).addTo(this.map);
                }
            }
        } else if (latB != null && lonB != null && this.map) {
            // マーカーが初期化されていない場合は作成
            this.trackBMarker = L.marker([latB, lonB], { 
                title: "Track B",
                icon: L.divIcon({
                    className: 'custom-marker track-b-marker',
                    html: '<div class="marker-dot"></div>',
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                })
            }).addTo(this.map);
            
            // トラックBの位置円を作成
            this.trackBCircle = L.circle([latB, lonB], {
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.2,
                radius: 15,
                weight: 1
            }).addTo(this.map);
        }
    },
    
    // アクティブなマーカーをフォローする（自動スクロール）
    followActiveMarkers() {
        let positions = [];
        let hasValidPosition = false;
        
        if (this.trackAMarker) {
            const posA = this.trackAMarker.getLatLng();
            if (posA && posA.lat && posA.lng) {
                positions.push([posA.lat, posA.lng]);
                hasValidPosition = true;
            }
        }
        
        if (this.trackBMarker) {
            const posB = this.trackBMarker.getLatLng();
            if (posB && posB.lat && posB.lng) {
                positions.push([posB.lat, posB.lng]);
                hasValidPosition = true;
            }
        }
        
        if (hasValidPosition && this.map) {
            // 両方のマーカーを表示する場合は境界を使用、一つだけの場合はその位置にパン
            if (positions.length > 1) {
                const bounds = L.latLngBounds(positions);
                this.map.fitBounds(bounds, {
                    padding: [50, 50],
                    maxZoom: 16,
                    animate: true,
                    duration: 0.5
                });
            } else {
                // マーカーが1つだけの場合
                this.map.panTo(positions[0], {
                    animate: true,
                    duration: 0.5
                });
            }
        }
    },
    
    // テーブル行のハイライト
    highlightTableRow(index) {
        const tableBody = document.getElementById('table-body');
        if (!tableBody) return;

        const highlighted = tableBody.querySelector('.highlighted-row');
        if (highlighted) {
            highlighted.classList.remove('highlighted-row');
        }

        const row = tableBody.querySelector(`tr[data-index="${index}"]`);
        if (row) {
            row.classList.add('highlighted-row');
        } else {
            // console.warn(`Table row not found for index: ${index}`);
        }
    },
    
    // 既存のトラックを削除
    clearTracks() {
        if (!this.map) return;
        if (this.trackAMarker) { this.map.removeLayer(this.trackAMarker); this.trackAMarker = null; }
        if (this.trackBMarker) { this.map.removeLayer(this.trackBMarker); this.trackBMarker = null; }
        if (this.trackAPolyline) { this.map.removeLayer(this.trackAPolyline); this.trackAPolyline = null; }
        if (this.trackBPolyline) { this.map.removeLayer(this.trackBPolyline); this.trackBPolyline = null; }
        if (this.trackACircle) { this.map.removeLayer(this.trackACircle); this.trackACircle = null; }
        if (this.trackBCircle) { this.map.removeLayer(this.trackBCircle); this.trackBCircle = null; }
        console.log('Tracks cleared.');
    },
    
    // ウィンドウリサイズ時の処理
    onWindowResize() {
        if (this.map) {
            requestAnimationFrame(() => {
                if (this.map) {
                    this.map.invalidateSize();
                    console.log('Map size invalidated on window resize.');
                }
            });
        }
    },
    
    // マップスタイル切替
    toggleMapStyle() {
        console.log('[DEBUG] Toggling map style');
        
        if (!this.map) {
            console.error('[DEBUG] Map not initialized');
            return;
        }

        const mapStyleBtn = document.getElementById('map-style-toggle');
        
        try {
            // 現在のレイヤーを確認して切り替え
            if (this.currentLayer === this.standardLayer) {
                // 標準地図から衛星画像に切り替え
                console.log('[DEBUG] Removing standard layer');
                this.map.removeLayer(this.standardLayer);
                console.log('[DEBUG] Adding satellite layer');
                this.satelliteLayer.addTo(this.map);
                this.currentLayer = this.satelliteLayer;
                
                if (mapStyleBtn) {
                    mapStyleBtn.textContent = "標準地図に切り替え";
                }
                console.log('[DEBUG] Switched to satellite map');
            } else {
                // 衛星画像から標準地図に切り替え
                console.log('[DEBUG] Removing satellite layer');
                this.map.removeLayer(this.satelliteLayer);
                console.log('[DEBUG] Adding standard layer');
                this.standardLayer.addTo(this.map);
                this.currentLayer = this.standardLayer;
                
                if (mapStyleBtn) {
                    mapStyleBtn.textContent = "衛星画像に切り替え";
                }
                console.log('[DEBUG] Switched to standard map');
            }

            // レイヤーの状態を確認
            console.log('[DEBUG] Current layers:', {
                standard: this.map.hasLayer(this.standardLayer),
                satellite: this.map.hasLayer(this.satelliteLayer)
            });

            // マップを再描画
            requestAnimationFrame(() => {
                this.map.invalidateSize();
                console.log('[DEBUG] Map size invalidated and redrawn');
            });
        } catch (error) {
            console.error('[DEBUG] Error during map style toggle:', error);
        }
    },
    
    // カメラをリセット
    resetCamera() {
        if (this.trackBounds) {
            this.map.fitBounds(this.trackBounds);
        } else if (this.visualizationData && this.visualizationData.length > 0) {
            const firstPoint = this.visualizationData[0];
            if (firstPoint.track_a && firstPoint.track_a.lat && firstPoint.track_a.lon) {
                this.map.setView([firstPoint.track_a.lat, firstPoint.track_a.lon], 13);
            }
        }
    },
    
    // 再生/一時停止を切り替える
    togglePlayback() {
        console.log('[DEBUG] Toggle playback:', {
            isPlaying: this.isPlaying,
            hasData: !!this.visualizationData,
            currentIndex: this.currentTimeIndex
        });

        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    },
    
    // 再生ボタンの状態を更新
    updatePlayButtonState() {
        const playBtn = document.getElementById('play-pause');
        if (playBtn) {
            if (this.isPlaying) {
                playBtn.classList.add('playing');
                playBtn.title = '一時停止';
            } else {
                playBtn.classList.remove('playing');
                playBtn.title = '再生';
            }
        }
    },

    // アニメーションを開始
    startAnimation() {
        if (!this.animationTimer) {
            console.log('[DEBUG] Starting animation loop');
            this.animationTimer = requestAnimationFrame(this.animate.bind(this));
        }
    },

    stopAnimation() {
        if (this.animationTimer) {
            console.log('[DEBUG] Stopping animation');
            cancelAnimationFrame(this.animationTimer);
            this.animationTimer = null;
        }
    },

    animate(timestamp) {
        if (!this.isPlaying) {
            console.log('[DEBUG] Animation stopped');
            this.stopAnimation();
            return;
        }

        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
        }

        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        // 経過時間を更新（再生速度を考慮）
        this.elapsedTime += (deltaTime * this.playbackSpeed);

        // 次のインデックスを計算
        const newIndex = Math.min(
            Math.floor(this.currentTimeIndex + (deltaTime * this.playbackSpeed / this.timeStep)),
            this.visualizationData.length - 1
        );

        // データの範囲をチェック
        if (newIndex >= this.visualizationData.length) {
            // 最後まで到達したら最初に戻る
            this.currentTimeIndex = 0;
            this.elapsedTime = 0;
        } else {
            this.currentTimeIndex = newIndex;
        }

        // 表示を更新
        this.updateDisplay(this.currentTimeIndex);
        this.updateTimelineProgress();
        this.updateMarkerPositions();
        
        // 情報オーバーレイを明示的に更新
        this.updateCurrentPointDisplay(this.currentTimeIndex);

        // アニメーションを継続
        this.animationTimer = requestAnimationFrame(this.animate.bind(this));
    },
    
    // 再生をリセット
    resetPlayback() {
        console.log('[DEBUG] Resetting playback');
        this.stopAnimation();
        this.isPlaying = false;
        this.currentTimeIndex = 0;
        this.updateDisplay(0);
        this.updateTimelineProgress();
        this.highlightTableRow(0);
        
        // ボタンの状態を更新
        this.updatePlayButtonState();
    },
    
    // 再生速度を設定
    setPlaybackSpeed(speed) {
        // 速度を数値に変換
        speed = parseFloat(speed);
        if (isNaN(speed)) {
            console.warn('[DEBUG] Invalid speed value:', speed);
            speed = 1.0;
        }
        
        // 速度を1倍から10倍の範囲に制限
        this.playbackSpeed = Math.max(1, Math.min(10, speed));
        console.log(`[DEBUG] Playback speed set to ${this.playbackSpeed}x`);
        
        // 速度表示を更新
        const speedDisplay = document.getElementById('speed-display');
        if (speedDisplay) {
            speedDisplay.textContent = `${this.playbackSpeed.toFixed(1)}x`;
        } else {
            console.warn('[DEBUG] Speed display element not found');
        }
        
        // スライダーの値も更新 (双方向バインディング)
        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider && Math.abs(parseFloat(speedSlider.value) - this.playbackSpeed) > 0.01) {
            speedSlider.value = this.playbackSpeed;
        }
    },
    
    // アニメーションの更新ロジック
    updateAnimation(timestamp) {
        if (!this.isPlaying || !this.visualizationData || this.visualizationData.length === 0) return;
        
        try {
            if (!this.lastTimestamp) {
                this.lastTimestamp = timestamp;
                requestAnimationFrame(this.animate.bind(this));
                return;
            }

            const deltaTime = (timestamp - this.lastTimestamp) * this.playbackSpeed;
            this.elapsedTime += deltaTime;
            this.lastTimestamp = timestamp;

            // 次のインデックスを計算
            const timeStep = 100; // 100msごとに更新
            const advanceFrames = Math.floor(deltaTime / timeStep);
            const newIndex = Math.min(
                this.currentTimeIndex + advanceFrames,
                this.visualizationData.length - 1
            );
            
            // 最終インデックスを超えた場合
            if (newIndex >= this.visualizationData.length - 1) {
                this.currentTimeIndex = this.visualizationData.length - 1;
                this.updateDisplay(this.currentTimeIndex);
                this.updateTimelineProgress();
                this.pause();
                return;
            }

            // インデックスが変わった場合のみ更新
            if (this.currentTimeIndex !== newIndex) {
                this.currentTimeIndex = newIndex;
                this.updateDisplay(this.currentTimeIndex);
                this.updateTimelineProgress();
            }

            requestAnimationFrame(this.animate.bind(this));
        } catch (error) {
            console.error('[DEBUG] Error in updateAnimation:', error);
            this.pause();
        }
    },
    
    // 指定したインデックスにジャンプ
    jumpToTimeIndex(index) {
        if (!this.visualizationData || index < 0 || index >= this.visualizationData.length) {
            console.warn(`Invalid time index: ${index}, max: ${this.visualizationData ? this.visualizationData.length - 1 : 'N/A'}`);
            return;
        }
        
        try {
            console.log(`Jumping to time index: ${index}`);
            this.currentTimeIndex = index;
            
            // 表示を更新
            this.updateDisplay(index);
            
            // 明示的にマーカー位置を更新
            this.updateMarkerPositions();
            
            // 時刻バーの位置を更新
            this.updateTimelineProgress();
            
            // 経過時間を更新
            if (this.visualizationData && this.visualizationData.length > 0) {
                const startTime = this.visualizationData[0].timestamp;
                const currentTime = this.visualizationData[index].timestamp;
                this.elapsedTime = currentTime - startTime;
            }
        } catch (error) {
            console.error('[DEBUG] Error in jumpToTimeIndex:', error);
        }
    },
    
    // マップローディングインジケータの表示
    showMapLoadingIndicator() {
        let indicator = document.getElementById('map-loading-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'map-loading-indicator';
            indicator.innerHTML = '地図読み込み中...';
            indicator.style.position = 'absolute';
            indicator.style.top = '10px';
            indicator.style.left = '50%';
            indicator.style.transform = 'translateX(-50%)';
            indicator.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            indicator.style.padding = '5px 10px';
            indicator.style.borderRadius = '5px';
            indicator.style.fontSize = '12px';
            indicator.style.zIndex = '1000';
            indicator.style.pointerEvents = 'none';
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) {
                mapContainer.appendChild(indicator);
            } else {
                console.error("#map-container not found for loading indicator");
            }
        }
        indicator.style.display = 'block';
    },
    
    // マップローディングインジケータの非表示
    hideMapLoadingIndicator() {
        const indicator = document.getElementById('map-loading-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    },

    // その他のイベントリスナーをセットアップするメソッド
    setupOtherListeners() {
        console.log('Setting up other event listeners');
        
        try {
            // マップのリサイズイベント
            window.addEventListener('resize', () => this.onWindowResize());
            
            // すべてのオーバーレイを設定
            this.setupAllOverlays();
            
            // リサイズハンドラーがあれば設定
            this.setupResizeHandler();
            
            // テーブル関連のイベントリスナーを別途設定
            this.setupTableEventListeners();
            
            console.log('Other event listeners initialized successfully');
        } catch (error) {
            console.error('Error setting up other event listeners:', error);
        }
    },

    // テーブル関連のイベントリスナーを設定
    setupTableEventListeners() {
        console.log('[DEBUG] Setting up table event listeners');
        
        try {
            const tableBody = document.getElementById('table-body');
            if (!tableBody) {
                console.warn('[DEBUG] Table body not found');
                return;
            }
            
            console.log('[DEBUG] Found table body:', tableBody);
            
            // 既存のイベントリスナーを削除して新しいものを追加
            const rows = tableBody.getElementsByTagName('tr');
            console.log('[DEBUG] Found table rows:', rows.length);
            
            Array.from(rows).forEach((row, rowIndex) => {
                const newRow = row.cloneNode(true);
                row.parentNode.replaceChild(newRow, row);
                
                // data-index属性の確認と設定
                let index = parseInt(newRow.getAttribute('data-index'));
                if (isNaN(index)) {
                    // data-index属性が設定されていない場合は行番号を使用
                    index = rowIndex;
                    newRow.setAttribute('data-index', index);
                }
                
                console.log('[DEBUG] Setting up click listener for row:', {
                    index: index,
                    hasDataIndex: newRow.hasAttribute('data-index'),
                    dataIndexValue: newRow.getAttribute('data-index')
                });
                
                // 新しいイベントリスナーを追加
                newRow.addEventListener('click', () => {
                    console.log('[DEBUG] Table row clicked:', {
                        index: index,
                        isPlaying: this.isPlaying
                    });
                    
                    // 再生を一時停止
                    if (this.isPlaying) {
                        this.pause();
                    }
                    
                    // 指定位置にジャンプ
                    this.jumpToTimeIndex(index);
                });
            });
            
            console.log('[DEBUG] Table event listeners setup complete');
        } catch (error) {
            console.error('[DEBUG] Error setting up table event listeners:', error);
        }
    },

    // 時間範囲コントロールのセットアップを更新
    setupTimeRangeControl() {
        console.log('Setting up simple time bar');
        
        // シンプルな時刻バーの要素を取得
        const timeSlider = document.querySelector('.simple-time-slider');
        const timelineProgress = document.querySelector('.timeline-progress');
        const timelineThumb = document.querySelector('.timeline-thumb');
        const currentTimeDisplay = document.getElementById('current-time-display');
        const startTimeDisplay = document.getElementById('start-time');
        const endTimeDisplay = document.getElementById('end-time');
        
        if (!timeSlider || !timelineProgress || !timelineThumb) {
            console.error('Simple time bar elements not found');
            return;
        }
        
        // 初期時間表示の設定
        if (this.visualizationData && this.visualizationData.length > 0) {
            const firstPoint = this.visualizationData[0];
            const lastPoint = this.visualizationData[this.visualizationData.length - 1];
            
            if (startTimeDisplay && firstPoint && firstPoint.time) {
                startTimeDisplay.textContent = firstPoint.time;
            }
            
            if (endTimeDisplay && lastPoint && lastPoint.time) {
                endTimeDisplay.textContent = lastPoint.time;
            }
            
            if (currentTimeDisplay && firstPoint && firstPoint.time) {
                currentTimeDisplay.textContent = firstPoint.time;
            }
        }
        
        // クリックイベントでの時間移動
        timeSlider.addEventListener('click', (e) => {
            const rect = timeSlider.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            this.updateTimelinePosition(percentage);
        });
        
        // ドラッグ操作の設定
        let isDragging = false;
        
        timelineThumb.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            timeSlider.classList.add('dragging');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        const onMouseMove = (e) => {
            if (!isDragging) return;
            
            const rect = timeSlider.getBoundingClientRect();
            const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.updateTimelinePosition(percentage);
        };
        
        const onMouseUp = () => {
            isDragging = false;
            timeSlider.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        // タッチデバイス対応
        timelineThumb.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isDragging = true;
            timeSlider.classList.add('dragging');
            document.addEventListener('touchmove', onTouchMove);
            document.addEventListener('touchend', onTouchEnd);
        });
        
        const onTouchMove = (e) => {
            if (!isDragging || !e.touches[0]) return;
            
            const rect = timeSlider.getBoundingClientRect();
            const percentage = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
            this.updateTimelinePosition(percentage);
        };
        
        const onTouchEnd = () => {
            isDragging = false;
            timeSlider.classList.remove('dragging');
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };
        
        console.log('Simple time bar setup complete');
    },

    // タイムラインの位置を更新（パーセンテージで指定）
    updateTimelinePosition(percentage) {
        if (!this.visualizationData || this.visualizationData.length === 0) return;
        
        try {
            const index = Math.floor(percentage * (this.visualizationData.length - 1));
            
            // インデックスの範囲チェック
            if (index < 0 || index >= this.visualizationData.length) {
                console.warn(`[DEBUG] Invalid index calculated in updateTimelinePosition: ${index}`);
                return;
            }
            
            // 現在のインデックスを更新（jumpToTimeIndexを直接呼ばずにその中身を実装）
            console.log(`[DEBUG] Updating timeline position to index: ${index}`);
            this.currentTimeIndex = index;
            
            // 表示を更新
            this.updateDisplay(index);
            
            // マーカー位置を更新
            this.updateMarkerPositions();
            
            // タイムラインの進行状況を更新
            this.updateTimelineProgress();
            
            // UIの更新
            const timelineProgress = document.querySelector('.timeline-progress');
            const timelineThumb = document.querySelector('.timeline-thumb');
            
            if (timelineProgress && timelineThumb) {
                const percentStr = `${percentage * 100}%`;
                timelineProgress.style.width = percentStr;
                timelineThumb.style.left = percentStr;
            }
            
            // 現在時刻表示の更新
            const currentTimeDisplay = document.getElementById('current-time-display');
            if (currentTimeDisplay && this.visualizationData[index]) {
                // timestampがある場合はそれを使用、なければtimeプロパティを使用
                if (this.visualizationData[index].timestamp) {
                    currentTimeDisplay.textContent = this.formatTime(this.visualizationData[index].timestamp);
                } else if (this.visualizationData[index].time) {
                    currentTimeDisplay.textContent = this.visualizationData[index].time;
                }
            }
        } catch (error) {
            console.error('[DEBUG] Error in updateTimelinePosition:', error);
        }
    },

    // 現在位置インジケータ更新メソッド
    updateCurrentTimeIndicator(index) {
        if (!this.visualizationData || this.visualizationData.length === 0) return;
        
        try {
            if (index < 0 || index >= this.visualizationData.length) {
                console.warn(`[DEBUG] Invalid index in updateCurrentTimeIndicator: ${index}`);
                return;
            }
            
            const percentage = index / (this.visualizationData.length - 1);
            
            // タイムラインの位置を更新
            const timelineProgress = document.querySelector('.timeline-progress');
            const timelineThumb = document.querySelector('.timeline-thumb');
            
            if (timelineProgress && timelineThumb) {
                const percentStr = `${percentage * 100}%`;
                timelineProgress.style.width = percentStr;
                timelineThumb.style.left = percentStr;
            }
            
            // 現在時刻表示を更新
            const timeData = this.visualizationData[index];
            if (timeData) {
                let timeStr = '';
                
                // timestampを優先して使用
                if (timeData.timestamp) {
                    timeStr = this.formatTime(timeData.timestamp);
                } else if (timeData.time) {
                    timeStr = timeData.time;
                    // 時間のみ表示にフォーマット調整（必要に応じて）
                    if (timeStr.includes(' ')) {
                        timeStr = timeStr.split(' ')[1]; // HH:MM:SS部分のみ
                    }
                }
                
                // 現在時刻表示エレメントを更新
                const currentTimeDisplay = document.getElementById('current-time-display');
                if (currentTimeDisplay) {
                    currentTimeDisplay.textContent = timeStr;
                }
                
                // info-overlay内の時刻表示も更新
                const currentTimeInfo = document.getElementById('current-time');
                if (currentTimeInfo) {
                    currentTimeInfo.textContent = timeStr;
                }
            }
        } catch (error) {
            console.error('[DEBUG] Error in updateCurrentTimeIndicator:', error);
        }
    },

    // 情報オーバーレイのセットアップを追加
    setupInfoOverlay() {
        console.log('Setting up info overlay');
        
        try {
            const infoOverlay = document.getElementById('info-overlay');
            if (!infoOverlay) {
                console.warn('Info overlay element not found');
                return;
            }
            
            // オーバーレイ基本クラスを追加
            infoOverlay.classList.add('map-overlay-base');
        } catch (error) {
            console.error('Error setting up info overlay:', error);
        }
    },

    // すべてのオーバーレイを設定
    setupAllOverlays() {
        console.log('Setting up all overlays');
        
        try {
            // 全てのマップオーバーレイを取得
            const overlays = document.querySelectorAll('.map-overlay-base');
            
            // グローバルイベントディスパッチャー
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) {
                // contextmenu、dblclickイベントのみを防止、マウスドラッグとホイールズームは許可
                ['contextmenu', 'dblclick'].forEach(eventType => {
                    mapContainer.addEventListener(eventType, (e) => {
                        // オーバーレイ内でのイベントは処理しない（伝播させる）
                        if (e.target.closest('.map-overlay-base') || 
                            e.target.closest('button') || 
                            e.target.closest('input')) {
                            return;
                        }
                        
                        // マップ上での右クリックとダブルクリックは防止
                        if (eventType === 'contextmenu' || eventType === 'dblclick') {
                            e.preventDefault();
                        }
                    }, false);
                });
                
                // マウスドラッグをサポートするためのイベント処理
                let isDragging = false;
                
                mapContainer.addEventListener('mousedown', (e) => {
                    // オーバーレイ内でのクリックは無視
                    if (e.target.closest('.map-overlay-base') || 
                        e.target.closest('button') || 
                        e.target.closest('input')) {
                        return;
                    }
                    isDragging = true;
                }, false);
                
                // マウスムーブはマップの動作を優先
                document.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        // ドラッグ中は何もしない（マップのドラッグを許可）
                    }
                }, false);
                
                document.addEventListener('mouseup', () => {
                    isDragging = false;
                }, false);
            }
            
            // 個々のオーバーレイに対して処理
            overlays.forEach(overlay => {
                // ホイールイベントに対しては特別な処理をしない（マップへの伝播を許可）
                this.preventNonWheelEventPropagation(overlay);
            });
            
            console.log('All overlays setup complete');
        } catch (error) {
            console.error('Error setting up overlays:', error);
        }
    },

    // ホイールイベント以外の伝播を防止する関数（ホイールズームを保持する）
    preventNonWheelEventPropagation(element) {
        if (!element) return;
        
        console.log('Setting up event prevention (except wheel) for element:', element.className || element.id);
        
        const handleEvent = function(e) {
            // クリックイベントやボタン操作は許可
            if (e.type === 'click' || 
                (e.type === 'mousedown' && 
                    (e.target.tagName === 'BUTTON' || 
                     e.target.classList.contains('play-icon') || 
                     e.target.classList.contains('reset-icon'))) || 
                (e.type === 'input' && e.target.tagName === 'INPUT')) {
                // ボタン操作やインプットは通常通り処理
                return;
            }
            
            // 右クリック、ダブルクリックのデフォルト動作は防止
            if (e.type === 'contextmenu' || e.type === 'dblclick') {
                e.stopPropagation();
            }
        };
        
        // マップドラッグとホイールズームを妨げないイベントリスナーを追加
        const events = ['contextmenu', 'dblclick'];
        
        events.forEach(eventType => {
            element.addEventListener(eventType, handleEvent, true);
        });
    },

    // マップとの相互作用を防止するヘルパー関数
    preventMapInteraction(e) {
        e.stopPropagation();
    },

    // リサイズハンドラの設定 - シンプルな実装
    setupResizeHandler() {
        console.log('Setting up resize handler');
        const resizeHandle = document.getElementById('resize-handle');
        const dataTableContainer = document.querySelector('.data-table-container');
        const mapContainerWrapper = document.querySelector('.map-container-wrapper');
        const visualizationSection = document.getElementById('visualization-section');
        
        if (!resizeHandle || !dataTableContainer || !mapContainerWrapper || !visualizationSection) {
            console.warn('Required elements for resize not found');
            return;
        }
        
        let isDragging = false;
        let startY = 0;
        let startHeight = 0;
        
        const updateMapSize = () => {
            if (this.map) {
                requestAnimationFrame(() => {
                    this.map.invalidateSize();
                    console.log('Map size updated after resize');
                });
            }
        };
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startHeight = dataTableContainer.offsetHeight;
            document.body.style.cursor = 'row-resize';
            e.preventDefault();
            console.log('Resize started');
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaY = startY - e.clientY;
            const containerHeight = visualizationSection.offsetHeight;
            const newHeight = Math.max(0, Math.min(containerHeight - 50, startHeight + deltaY));
            
            dataTableContainer.style.height = `${newHeight}px`;
            updateMapSize();
            
            console.log(`Table height adjusted to: ${newHeight}px`);
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
                updateMapSize();
                console.log('Resize completed');
            }
        });
        
        // タッチデバイスのサポート
        resizeHandle.addEventListener('touchstart', (e) => {
            isDragging = true;
            startY = e.touches[0].clientY;
            startHeight = dataTableContainer.offsetHeight;
            e.preventDefault();
            console.log('Touch resize started');
        });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            const deltaY = startY - e.touches[0].clientY;
            const containerHeight = visualizationSection.offsetHeight;
            const newHeight = Math.max(0, Math.min(containerHeight - 50, startHeight + deltaY));
            
            dataTableContainer.style.height = `${newHeight}px`;
            updateMapSize();
            
            console.log(`Table height adjusted to: ${newHeight}px (touch)`);
        });
        
        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                updateMapSize();
                console.log('Touch resize completed');
            }
        });
        
        // 初期状態でマップサイズを更新
        updateMapSize();
        console.log('Resize handler setup completed');
    },

    // シンプルなタイムバーのリスナー初期化
    initSimpleTimeBarListeners() {
        console.log('[DEBUG] Initializing simple time bar listeners');
        
        const timeBar = document.querySelector('.simple-time-bar-container');
        const timeSlider = timeBar.querySelector('.time-slider');
        const timeProgress = timeBar.querySelector('.time-progress');
        const timeThumb = timeBar.querySelector('.time-thumb');
        
        if (!timeBar || !timeSlider || !timeProgress || !timeThumb) {
            console.error('[DEBUG] Time bar elements not found:', {
                timeBar: !!timeBar,
                timeSlider: !!timeSlider,
                timeProgress: !!timeProgress,
                timeThumb: !!timeThumb
            });
            return;
        }
        
        console.log('[DEBUG] Found time bar elements');
        
        let isDragging = false;
        
        const handleTimeMouseDown = (e) => {
            isDragging = true;
            timeBar.style.cursor = 'grabbing';
            document.addEventListener('mousemove', handleTimeMouseMove);
            document.addEventListener('mouseup', handleTimeMouseUp);
            e.preventDefault();
            
            // 初回クリック時の位置を更新
            const rect = timeSlider.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            this.updateTimePosition(position);
        };
        
        const handleTimeMouseMove = (e) => {
            if (!isDragging) return;
            const rect = timeSlider.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            this.updateTimePosition(position);
        };
        
        const handleTimeMouseUp = () => {
            isDragging = false;
            timeBar.style.cursor = '';
            document.removeEventListener('mousemove', handleTimeMouseMove);
            document.removeEventListener('mouseup', handleTimeMouseUp);
        };
        
        timeSlider.addEventListener('mousedown', handleTimeMouseDown);
        
        // タッチイベントのサポート
        timeSlider.addEventListener('touchstart', (e) => {
            isDragging = true;
            const touch = e.touches[0];
            const rect = timeSlider.getBoundingClientRect();
            const position = (touch.clientX - rect.left) / rect.width;
            this.updateTimePosition(position);
            e.preventDefault();
        });
        
        timeSlider.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            const rect = timeSlider.getBoundingClientRect();
            const position = (touch.clientX - rect.left) / rect.width;
            this.updateTimePosition(position);
            e.preventDefault();
        });
        
        timeSlider.addEventListener('touchend', () => {
            isDragging = false;
        });
        
        console.log('[DEBUG] Time bar listeners initialized');
    },
    
    updateTimePosition(position) {
        if (!this.visualizationData || this.visualizationData.length === 0) return;

        try {
            // 位置を0-1の範囲に制限
            position = Math.max(0, Math.min(1, position));
            
            // インデックスの計算
            const index = Math.round(position * (this.visualizationData.length - 1));
            if (index < 0 || index >= this.visualizationData.length) {
                console.warn(`[DEBUG] Invalid calculated index: ${index}`);
                return;
            }
            
            console.log(`[DEBUG] Updating time position to index: ${index}`);
            
            // 現在のインデックスを更新
            this.currentTimeIndex = index;
            
            // 表示を更新
            this.updateDisplay(index);
            
            // マーカー位置を更新
            this.updateMarkerPositions();
            
            // タイムラインの進行状況を更新
            this.updateTimelineProgress();
            
            // プログレスバーとサムの位置を更新 (念のため直接更新)
            const timeThumb = document.querySelector('.time-thumb');
            const timeProgress = document.querySelector('.time-progress');
            
            if (timeThumb && timeProgress) {
                timeThumb.style.left = `${position * 100}%`;
                timeProgress.style.width = `${position * 100}%`;
            }
            
            // UI更新
            this.updateTimeDisplay(index);
        } catch (error) {
            console.error('[DEBUG] Error in updateTimePosition:', error);
        }
    },

    // 表示を特定の時間に更新
    updateDisplayToTime(targetTime) {
        if (!this.visualizationData || this.visualizationData.length === 0) return;
        
        // 指定された時間に最も近いデータポイントを見つける
        let closestIndex = 0;
        let minTimeDiff = Number.MAX_VALUE;
        
        this.visualizationData.forEach((point, index) => {
            const timeDiff = Math.abs(point.timestamp - targetTime);
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestIndex = index;
            }
        });
        
        // 見つかったインデックスに再生位置を設定
        this.currentTimeIndex = closestIndex;
        this.updateDisplay();
        
        // タイムラインの進行状況を更新
        this.updateTimelineProgress();
    },

    // 再生状態の更新時にシンプルタイムバーも更新
    updateTimelineProgress() {
        if (!this.visualizationData || this.visualizationData.length === 0) return;
        
        try {
            const index = this.currentTimeIndex;
            if (index < 0 || index >= this.visualizationData.length) {
                console.warn(`[DEBUG] Invalid index in updateTimelineProgress: ${index}`);
                return;
            }
            
            const percentage = index / (this.visualizationData.length - 1);
            
            // 補足時間バーの更新
            const timeThumb = document.querySelector('.time-thumb');
            const timeProgress = document.querySelector('.time-progress');
            
            if (timeThumb && timeProgress) {
                timeThumb.style.left = `${percentage * 100}%`;
                timeProgress.style.width = `${percentage * 100}%`;
            }
            
            // 時刻表示の更新
            const currentData = this.visualizationData[index];
            if (currentData && currentData.timestamp) {
                const formattedTime = this.formatTime(currentData.timestamp);
                
                // 必要な要素を取得し、存在する場合のみ更新
                const currentTimeDisplay = document.getElementById('current-time-display');
                const currentTime = document.getElementById('current-time');
                
                if (currentTimeDisplay) {
                    currentTimeDisplay.textContent = formattedTime;
                }
                
                if (currentTime) {
                    currentTime.textContent = formattedTime;
                }
            }
        } catch (error) {
            console.error('[DEBUG] Error in updateTimelineProgress:', error);
        }
    },

    // 表示を更新する際に現在時刻のJST表示も更新
    updateDisplay() {
        // ... existing code ...
        
        // 現在の時刻表示を更新（JSTに変換）
        const currentPoint = this.visualizationData[this.currentTimeIndex];
        if (currentPoint) {
            const currentTimeEl = document.getElementById('current-time');
            if (currentTimeEl) {
                const date = new Date(currentPoint.timestamp);
                // UTCからJSTに変換（+9時間）
                date.setTime(date.getTime() + (9 * 60 * 60 * 1000));
                
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                const seconds = date.getSeconds().toString().padStart(2, '0');
                currentTimeEl.textContent = `${hours}:${minutes}:${seconds}`;
            }
        }
        
        // ... existing code ...
    },

    // タイムラインのイベントリスナーを初期化
    initTimelineListeners() {
        console.log('[DEBUG] タイムラインリスナーを初期化中...');
        
        try {
            // タイムバーのドラッグ機能を設定
            const timeSlider = document.querySelector('.time-slider');
            const timeThumb = document.querySelector('.time-thumb');
            const timeProgress = document.querySelector('.time-progress');
            
            if (timeSlider && timeThumb && timeProgress) {
                console.log('[DEBUG] Time slider elements found');
                let isDragging = false;
                
                // クリックでの時間移動
                timeSlider.addEventListener('click', (e) => {
                    if (e.target === timeThumb) return; // サムネイルのクリックは無視
                    
                    // 一時的に再生を停止
                    const wasPlaying = this.isPlaying;
                    if (wasPlaying) {
                        this.pause();
                    }
                    
                    const rect = timeSlider.getBoundingClientRect();
                    const percentage = (e.clientX - rect.left) / rect.width;
                    
                    // プログレスバーとサムの位置を更新
                    timeProgress.style.width = `${percentage * 100}%`;
                    timeThumb.style.left = `${percentage * 100}%`;
                    
                    if (this.visualizationData && this.visualizationData.length > 0) {
                        const targetIndex = Math.floor(percentage * (this.visualizationData.length - 1));
                        console.log(`[DEBUG] Clicked time slider at ${percentage}, jumping to index ${targetIndex}`);
                        this.jumpToTimeIndex(targetIndex);
                        
                        // マーカー位置を明示的に更新
                        this.updateMarkerPositions();
                    }
                    
                    // 再生状態を復元
                    if (wasPlaying) {
                        setTimeout(() => this.play(), 100);
                    }
                });
                
                // ドラッグ開始
                timeThumb.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    timeSlider.classList.add('dragging');
                    document.body.style.cursor = 'grabbing';
                    
                    // 一時的に再生を停止
                    this.wasDraggingAndPlaying = this.isPlaying;
                    if (this.isPlaying) {
                        this.pause();
                    }
                    
                    e.preventDefault();
                    console.log('[DEBUG] Time thumb drag started');
                });
                
                // ドラッグ中
                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    
                    try {
                        const rect = timeSlider.getBoundingClientRect();
                        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        
                        // プログレスバーとサムの位置を直接更新（エラーを回避）
                        if (timeProgress && timeThumb) {
                            timeProgress.style.width = `${percentage * 100}%`;
                            timeThumb.style.left = `${percentage * 100}%`;
                        }
                        
                        if (this.visualizationData && this.visualizationData.length > 0) {
                            const targetIndex = Math.floor(percentage * (this.visualizationData.length - 1));
                            if (targetIndex >= 0 && targetIndex < this.visualizationData.length) {
                                // currentTimeIndexを直接更新
                                this.currentTimeIndex = targetIndex;
                                
                                // 表示を更新（要素の存在確認を含む関数）
                                this.updateDisplay(targetIndex);
                                
                                // マーカー位置を明示的に更新
                                this.updateMarkerPositions();
                                
                                // タイムラインの状態を更新（ダブルセーフティのため）
                                this.updateTimelineProgress();
                            }
                        }
                    } catch (error) {
                        console.error('[DEBUG] Error during time thumb drag:', error);
                    }
                });
                
                // ドラッグ終了
                document.addEventListener('mouseup', () => {
                    if (isDragging) {
                        isDragging = false;
                        timeSlider.classList.remove('dragging');
                        document.body.style.cursor = '';
                        console.log('[DEBUG] Time thumb drag ended');
                        
                        // ドラッグ前に再生中だった場合は再生を再開
                        if (this.wasDraggingAndPlaying) {
                            setTimeout(() => {
                                this.play();
                                this.wasDraggingAndPlaying = false;
                            }, 100);
                        }
                    }
                });
                
                // タッチデバイス対応
                timeThumb.addEventListener('touchstart', (e) => {
                    isDragging = true;
                    timeSlider.classList.add('dragging');
                    
                    // 一時的に再生を停止
                    this.wasDraggingAndPlaying = this.isPlaying;
                    if (this.isPlaying) {
                        this.pause();
                    }
                    
                    e.preventDefault();
                    console.log('[DEBUG] Time thumb touch started');
                });
                
                document.addEventListener('touchmove', (e) => {
                    if (!isDragging) return;
                    
                    try {
                        const touch = e.touches[0];
                        const rect = timeSlider.getBoundingClientRect();
                        const percentage = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                        
                        // プログレスバーとサムの位置を直接更新
                        if (timeProgress && timeThumb) {
                            timeProgress.style.width = `${percentage * 100}%`;
                            timeThumb.style.left = `${percentage * 100}%`;
                        }
                        
                        if (this.visualizationData && this.visualizationData.length > 0) {
                            const targetIndex = Math.floor(percentage * (this.visualizationData.length - 1));
                            if (targetIndex >= 0 && targetIndex < this.visualizationData.length) {
                                // currentTimeIndexを直接更新
                                this.currentTimeIndex = targetIndex;
                                
                                // 表示を更新
                                this.updateDisplay(targetIndex);
                                
                                // マーカー位置を明示的に更新
                                this.updateMarkerPositions();
                                
                                // タイムラインの状態を更新
                                this.updateTimelineProgress();
                            }
                        }
                        e.preventDefault();
                    } catch (error) {
                        console.error('[DEBUG] Error during time thumb touch:', error);
                    }
                });
                
                document.addEventListener('touchend', () => {
                    if (isDragging) {
                        isDragging = false;
                        timeSlider.classList.remove('dragging');
                        console.log('[DEBUG] Time thumb touch ended');
                        
                        // ドラッグ前に再生中だった場合は再生を再開
                        if (this.wasDraggingAndPlaying) {
                            setTimeout(() => {
                                this.play();
                                this.wasDraggingAndPlaying = false;
                            }, 100);
                        }
                    }
                });
            } else {
                console.warn('[DEBUG] Time slider elements not found:', {
                    timeSlider: !!timeSlider,
                    timeThumb: !!timeThumb,
                    timeProgress: !!timeProgress
                });
            }
            
            console.log('[DEBUG] タイムラインリスナーの初期化が完了しました');
        } catch (error) {
            console.error('[DEBUG] タイムラインリスナーの初期化中にエラーが発生しました:', error);
        }
    },
    
    // テーブル行のクリックイベントを設定
    setupTableEventListeners() {
        console.log('[DEBUG] Setting up table event listeners');
        
        try {
            const tableBody = document.getElementById('table-body');
            if (!tableBody) {
                console.warn('[DEBUG] Table body not found');
                return;
            }
            
            console.log('[DEBUG] Found table body:', tableBody);
            
            // 既存のイベントリスナーを削除して新しいものを追加
            const rows = tableBody.getElementsByTagName('tr');
            console.log('[DEBUG] Found table rows:', rows.length);
            
            Array.from(rows).forEach((row, rowIndex) => {
                const newRow = row.cloneNode(true);
                row.parentNode.replaceChild(newRow, row);
                
                // data-index属性の確認と設定
                let index = parseInt(newRow.getAttribute('data-index'));
                if (isNaN(index)) {
                    // data-index属性が設定されていない場合は行番号を使用
                    index = rowIndex;
                    newRow.setAttribute('data-index', index);
                }
                
                console.log('[DEBUG] Setting up click listener for row:', {
                    index: index,
                    hasDataIndex: newRow.hasAttribute('data-index'),
                    dataIndexValue: newRow.getAttribute('data-index')
                });
                
                // 新しいイベントリスナーを追加
                newRow.addEventListener('click', () => {
                    console.log('[DEBUG] Table row clicked:', {
                        index: index,
                        isPlaying: this.isPlaying
                    });
                    
                    // 再生を一時停止
                    if (this.isPlaying) {
                        this.pause();
                    }
                    
                    // 指定位置にジャンプ
                    this.jumpToTimeIndex(index);
                });
            });
            
            console.log('[DEBUG] Table event listeners setup complete');
        } catch (error) {
            console.error('Error setting up table event listeners:', error);
        }
    },

    // 情報オーバーレイの更新が必要かどうかを判定
    shouldUpdateInfoOverlay(currentData) {
        if (!this.lastInfoData) {
            this.lastInfoData = currentData;
            return true;
        }
        
        // 重要な値が変更された場合のみ更新
        const shouldUpdate = 
            this.lastInfoData.track_a?.ele_ft !== currentData.track_a?.ele_ft ||
            this.lastInfoData.track_b?.ele_ft !== currentData.track_b?.ele_ft ||
            this.lastInfoData.track_a?.speeds?.vertical !== currentData.track_a?.speeds?.vertical ||
            this.lastInfoData.track_b?.speeds?.vertical !== currentData.track_b?.speeds?.vertical;
        
        if (shouldUpdate) {
            this.lastInfoData = currentData;
        }
        
        return shouldUpdate;
    },

    // タイムラインの更新が必要かどうかを判定
    shouldUpdateTimeline() {
        const percentage = this.currentTimeIndex / (this.visualizationData.length - 1);
        const currentPercentage = Math.floor(percentage * 100);
        
        if (this.lastTimelinePercentage !== currentPercentage) {
            this.lastTimelinePercentage = currentPercentage;
            return true;
        }
        return false;
    },

    // テーブルハイライトの更新が必要かどうかを判定
    shouldUpdateTableHighlight() {
        if (this.lastHighlightedIndex !== this.currentTimeIndex) {
            this.lastHighlightedIndex = this.currentTimeIndex;
            return true;
        }
        return false;
    },

    // 現在の時刻インジケーターを更新
    updateCurrentTimeIndicator(timeIndex) {
        const timelineProgress = document.querySelector('.timeline-progress');
        const timelineThumb = document.querySelector('.timeline-thumb');
        
        if (!timelineProgress || !timelineThumb) return;
        
        const percentage = timeIndex / (this.visualizationData.length - 1);
        const percentStr = `${percentage * 100}%`;
        
        timelineProgress.style.width = percentStr;
        timelineThumb.style.left = percentStr;
    },

    // 補足時間バーの設定
    setupSupplementaryTimeBar() {
        const timeSlider = document.querySelector('.time-slider');
        const timeThumb = document.querySelector('.time-thumb');
        const timeProgress = document.querySelector('.time-progress');

        // 開始時間と終了時間の設定
        if (this.visualizationData && this.visualizationData.length > 0) {
            const startTime = this.formatTime(this.visualizationData[0].timestamp);
            const endTime = this.formatTime(this.visualizationData[this.visualizationData.length - 1].timestamp);
            document.getElementById('start-time').textContent = startTime;
            document.getElementById('end-time').textContent = endTime;
        }

        // スライダーのクリックイベント
        timeSlider.addEventListener('click', (e) => {
            const rect = timeSlider.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            this.updateTimePosition(position);
        });

        // ドラッグイベント
        let isDragging = false;

        timeThumb.addEventListener('mousedown', () => {
            isDragging = true;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = timeSlider.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.updateTimePosition(position);
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // タッチイベント
        timeThumb.addEventListener('touchstart', (e) => {
            isDragging = true;
            e.preventDefault();
        });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            const rect = timeSlider.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
            this.updateTimePosition(position);
            e.preventDefault();
        });

        document.addEventListener('touchend', () => {
            isDragging = false;
        });
    },

    // 時間位置の更新
    updateTimePosition(position) {
        if (!this.visualizationData || this.visualizationData.length === 0) return;

        try {
            // 位置を0-1の範囲に制限
            position = Math.max(0, Math.min(1, position));
            
            // インデックスの計算
            const index = Math.round(position * (this.visualizationData.length - 1));
            if (index < 0 || index >= this.visualizationData.length) {
                console.warn(`[DEBUG] Invalid calculated index: ${index}`);
                return;
            }
            
            console.log(`[DEBUG] Updating time position to index: ${index}`);
            
            // 現在のインデックスを更新
            this.currentTimeIndex = index;
            
            // 表示を更新
            this.updateDisplay(index);
            
            // マーカー位置を更新
            this.updateMarkerPositions();
            
            // タイムラインの進行状況を更新
            this.updateTimelineProgress();
            
            // プログレスバーとサムの位置を更新 (念のため直接更新)
            const timeThumb = document.querySelector('.time-thumb');
            const timeProgress = document.querySelector('.time-progress');
            
            if (timeThumb && timeProgress) {
                timeThumb.style.left = `${position * 100}%`;
                timeProgress.style.width = `${position * 100}%`;
            }
            
            // UI更新
            this.updateTimeDisplay(index);
        } catch (error) {
            console.error('[DEBUG] Error in updateTimePosition:', error);
        }
    },

    // 時間表示の更新
    updateTimeDisplay(index) {
        const timeThumb = document.querySelector('.time-thumb');
        const timeProgress = document.querySelector('.time-progress');
        
        if (this.visualizationData && this.visualizationData.length > 0 && index >= 0 && index < this.visualizationData.length) {
            // 現在時刻の表示
            const currentTime = this.formatTime(this.visualizationData[index].timestamp);
            const currentTimeDisplayEl = document.getElementById('current-time-display');
            const currentTimeEl = document.getElementById('current-time');
            
            // 要素が存在する場合のみ更新
            if (currentTimeDisplayEl) {
                currentTimeDisplayEl.textContent = currentTime;
            }
            
            if (currentTimeEl) {
                currentTimeEl.textContent = currentTime;
            }
            
            // プログレスバーの更新
            if (timeThumb && timeProgress) {
                const position = index / (this.visualizationData.length - 1);
                timeThumb.style.left = `${position * 100}%`;
                timeProgress.style.width = `${position * 100}%`;
            }
        }
    },

    // 再生中のタイムラインの更新
    updateSupplementaryTimeBar(index) {
        if (!this.visualizationData || this.visualizationData.length === 0) return;
        
        try {
            // 時間表示の更新
            if (index !== undefined && index >= 0 && index < this.visualizationData.length) {
                this.updateTimeDisplay(index);
            } else {
                console.warn('[DEBUG] Invalid index in updateSupplementaryTimeBar:', index);
            }
        } catch (error) {
            console.warn('[DEBUG] Error updating supplementary time bar:', error);
        }
    },

    handleMapStyleToggle() {
        // デバウンス処理を追加
        if (this.isToggling) return;
        this.isToggling = true;
        
        console.log('[DEBUG] Toggling map style', new Error().stack);
        
        if (!this.map) {
            console.error('[DEBUG] Map not initialized');
            this.isToggling = false;
            return;
        }

        const mapStyleBtn = document.getElementById('map-style-toggle');
        
        try {
            // 現在のレイヤーを確認して切り替え
            if (this.currentLayer === this.standardLayer) {
                // 標準地図から衛星画像に切り替え
                this.map.removeLayer(this.standardLayer);
                this.satelliteLayer.addTo(this.map);
                this.currentLayer = this.satelliteLayer;
                
                if (mapStyleBtn) {
                    mapStyleBtn.textContent = "標準地図に切り替え";
                }
                console.log('[DEBUG] Switched to satellite map', new Error().stack);
            } else {
                // 衛星画像から標準地図に切り替え
                this.map.removeLayer(this.satelliteLayer);
                this.standardLayer.addTo(this.map);
                this.currentLayer = this.standardLayer;
                
                if (mapStyleBtn) {
                    mapStyleBtn.textContent = "衛星画像に切り替え";
                }
                console.log('[DEBUG] Switched to standard map', new Error().stack);
            }

            // マップを再描画
            this.map.invalidateSize();
        } catch (error) {
            console.error('[DEBUG] Error during map style toggle:', error);
        } finally {
            // 処理完了後にフラグをリセット
            setTimeout(() => {
                this.isToggling = false;
            }, 300);
        }
    },

    // 時刻をフォーマットする関数
    formatTime(timestamp) {
        if (!timestamp) return '-';
        const date = new Date(timestamp);
        // UTCからJST(+9時間)に変換
        const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
        const hours = jstDate.getUTCHours().toString().padStart(2, '0');
        const minutes = jstDate.getUTCMinutes().toString().padStart(2, '0');
        const seconds = jstDate.getUTCSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    },

    play() {
        if (!this.visualizationData || this.visualizationData.length === 0) {
            console.warn('[DEBUG] Cannot play: No visualization data');
            return;
        }
        
        console.log('[DEBUG] Starting playback');
        this.isPlaying = true;
        this.lastTimestamp = performance.now();
        this.updatePlayButtonState();
        this.startAnimation();
    },

    pause() {
        console.log('[DEBUG] Pausing playback');
        this.isPlaying = false;
        this.stopAnimation();
        this.updatePlayButtonState();
    },

    setSpeed(speed) {
        // 速度を数値に変換
        speed = parseFloat(speed);
        if (isNaN(speed)) {
            console.warn('[DEBUG] Invalid speed value:', speed);
            speed = 1.0;
        }
        
        // 速度を1倍から10倍の範囲に制限
        this.playbackSpeed = Math.max(1, Math.min(10, speed));
        console.log(`[DEBUG] Playback speed set to ${this.playbackSpeed}x`);
        
        // 速度表示を更新
        const speedDisplay = document.getElementById('speed-display');
        if (speedDisplay) {
            speedDisplay.textContent = `${this.playbackSpeed.toFixed(1)}x`;
        } else {
            console.warn('[DEBUG] Speed display element not found');
        }
        
        // スライダーの値も更新 (双方向バインディング)
        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider && Math.abs(parseFloat(speedSlider.value) - this.playbackSpeed) > 0.01) {
            speedSlider.value = this.playbackSpeed;
        }
    }
}; 