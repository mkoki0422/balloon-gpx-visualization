// グローバルスコープにローディングインジケーター制御関数を配置
window.hideLoadingIndicator = function() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
        console.log('グローバル関数: ローディングインジケーターを非表示にしました');
    }
};

// アプリケーションのメインスクリプト
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing app...');
    
    // ローディングインジケーターを非表示にする
    hideLoadingIndicator();
    
    // アプリケーションの初期化
    initApp();
    
    // イベントリスナーのセットアップ
    setupEventListeners();
});

// ページ読み込み時にローディングインジケーターを非表示にする
function setupEventListeners() {
    // アップロードボタンのクリックイベントを直接処理
    document.getElementById('upload-btn').onclick = function() {
        console.log('アップロードボタンがクリックされました');
        
        const fileA = document.getElementById('file-a').files[0];
        const fileB = document.getElementById('file-b').files[0];
        
        // ファイル情報のログ出力
        if (fileA) {
            console.log('ファイルA', {
                name: fileA.name,
                size: fileA.size,
                type: fileA.type,
                lastModified: new Date(fileA.lastModified).toLocaleString()
            });
        } else {
            console.log('ファイルA: 選択されていません');
        }
        
        if (fileB) {
            console.log('ファイルB', {
                name: fileB.name,
                size: fileB.size,
                type: fileB.type,
                lastModified: new Date(fileB.lastModified).toLocaleString()
            });
        } else {
            console.log('ファイルB: 選択されていません');
        }
        
        if (!fileA || !fileB) {
            alert('2つのGPXファイルを選択してください');
            return;
        }
        
        // ローディング表示
        const uploadStatus = document.getElementById('upload-status');
        uploadStatus.textContent = 'ファイルをアップロード中...';
        showLoadingIndicator('ファイルをアップロード中...');
        
        // FormDataの作成
        const formData = new FormData();
        formData.append('file_a', fileA);
        formData.append('file_b', fileB);
        
        console.log('FormData作成完了');
        
        // FormDataの内容確認（デバッグ用）
        let formDataLog = {};
        for (let [key, value] of formData.entries()) {
            if (value instanceof File) {
                formDataLog[key] = `File: ${value.name}, ${value.size} bytes`;
            } else {
                formDataLog[key] = value;
            }
        }
        console.log('FormDataの内容', formDataLog);
        
        // アップロードリクエスト
        console.log('アップロードリクエスト送信開始: /api/upload');
        fetch('/api/upload', {
            method: 'POST',
            mode: 'cors',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            },
            body: formData
        })
        .then(response => {
            console.log('アップロードレスポンス:', { 
                status: response.status, 
                statusText: response.statusText,
                ok: response.ok,
                headers: [...response.headers].map(h => `${h[0]}: ${h[1]}`).join(', ')
            });
            
            if (!response.ok) {
                return response.text().then(text => {
                    try {
                        // JSON解析を試みる
                        const errorData = JSON.parse(text);
                        throw new Error(`アップロード失敗 (${response.status}): ${errorData.detail || 'エラー詳細なし'}`);
                    } catch (e) {
                        // テキストそのままを使用
                        throw new Error(`アップロード失敗 (${response.status}): ${text || 'レスポンス内容なし'}`);
                    }
                });
            }
            
            return response.json();
        })
        .then(uploadResult => {
            console.log('アップロード成功:', uploadResult);
            
            // time_rangeの内容を詳細にログ出力
            if (uploadResult.time_range) {
                const timeRange = uploadResult.time_range.time_range || {};
                const trackA = uploadResult.time_range.track_a || {};
                const trackB = uploadResult.time_range.track_b || {};
                
                console.log('時刻範囲データ:', {
                    common: timeRange,
                    track_a: trackA,
                    track_b: trackB
                });
                
                // 実際のGPXデータの時間範囲をUIに表示
                if (timeRange.start && timeRange.end) {
                    document.getElementById('start-time').textContent = timeRange.start.split(' ')[1]; // HH:MM:SS部分のみ
                    document.getElementById('end-time').textContent = timeRange.end.split(' ')[1]; // HH:MM:SS部分のみ
                    
                    document.getElementById('selected-start-time').textContent = timeRange.start;
                    document.getElementById('selected-end-time').textContent = timeRange.end;
                }
            }
            
            uploadStatus.textContent = 'データを処理中...';
            showLoadingIndicator('データを処理中...');
            
            // 処理リクエスト
            const processFormData = new FormData();
            processFormData.append('file_a_path', uploadResult.file_a_path);
            processFormData.append('file_b_path', uploadResult.file_b_path);

            // 時刻データを追加 (元に戻す)
            const timeRange = uploadResult.time_range && uploadResult.time_range.time_range;
            if (timeRange && timeRange.start && timeRange.end) {
                processFormData.append('start_time', timeRange.start);
                processFormData.append('end_time', timeRange.end);
                console.log('処理時刻範囲:', timeRange);
            } else {
                // /api/upload が time_range を返さなくなったため、このエラーは発生しないはずだが念のため残す
                // throw new Error(`時刻範囲データが不正です: ${JSON.stringify(uploadResult)}`);
                console.log('警告: /api/upload から時刻範囲が返されませんでした。処理リクエストに時刻範囲を含めません。');
            }

            console.log('処理リクエスト送信開始: /api/process');
            
            return fetch('/api/process', {
                method: 'POST',
                mode: 'cors',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json'
                },
                body: processFormData
            });
        })
        .then(response => {
            console.log('処理レスポンス:', { 
                status: response.status, 
                statusText: response.statusText,
                ok: response.ok
            });
            
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(`処理失敗 (${response.status}): ${text || 'レスポンス内容なし'}`);
                });
            }
            
            return response.json();
        })
        .then(processResult => {
            console.log('処理成功:', Object.keys(processResult));
            // 詳細なデバッグ情報を追加
            console.log('visualization_dataの型:', typeof processResult.visualization_data);
            console.log('visualization_dataの内容:', processResult.visualization_data);
            console.log('table_dataの型:', typeof processResult.table_data);
            console.log('table_dataの内容:', JSON.stringify(processResult.table_data, null, 2));
            console.log('summaryの型:', typeof processResult.summary);
            console.log('summaryの内容:', JSON.stringify(processResult.summary, null, 2));

            // データの型チェックと変換
            if (!processResult.visualization_data) {
                throw new Error('可視化データが見つかりません');
            }

            // visualization_dataを配列に変換
            const visualizationData = Array.isArray(processResult.visualization_data) 
                ? processResult.visualization_data 
                : Object.values(processResult.visualization_data);

            console.log('変換後のvisualization_dataの型:', Array.isArray(visualizationData) ? 'array' : typeof visualizationData);
            console.log('変換後のvisualization_dataの長さ:', visualizationData.length);

            showLoadingIndicator('データを描画中...');

            // ビジュアライゼーションセクションに切り替え
            document.getElementById('upload-section').classList.add('hidden');
            document.getElementById('visualization-section').classList.remove('hidden');

            // マップコンテナが表示された後にセットアップを実行
            try {
                Visualization.setupMapAndViz(
                    'map-container', // マップコンテナのID
                    visualizationData, // 変換済みのvisualization_data
                    processResult.table_data
                );
                document.getElementById('map-container').classList.add('map-initialized');
                console.log('ビジュアライゼーションのセットアップ完了。');

                // サマリー表示
                displaySummary(processResult.summary);
            } catch (error) {
                console.error("Visualization setup failed:", error);
                console.log("エラー: ビジュアライゼーションのセットアップに失敗しました。", error.message);
                showError(`ビジュアライゼーションのセットアップに失敗しました: ${error.message}`);
                // 必要なら visualization-section を再度隠すなどの処理
                document.getElementById('visualization-section').classList.add('hidden');
                document.getElementById('upload-section').classList.remove('hidden');
            }

        })
        .catch(error => {
            console.error('エラー発生:', error);
            console.log('エラー発生:', error.message);
            uploadStatus.textContent = `エラーが発生しました: ${error.message}`;
            // Make sure upload section is visible on error
            document.getElementById('visualization-section').classList.add('hidden');
            document.getElementById('upload-section').classList.remove('hidden');
        })
        .finally(() => {
            hideLoadingIndicator();
        });
    };
    
    // サンプルデータの読み込み
    document.getElementById('load-sample').addEventListener('click', async () => {
        console.log('サンプルデータ読み込みボタンがクリックされました');
        try {
            showLoadingIndicator('サンプルデータを読み込み中...');
            const result = await API.loadSampleData();
            console.log('サンプルデータ読み込み結果:', result);

            // 処理リクエストを送信
            const processResult = await API.processData(
                result.file_a_path,
                result.file_b_path,
                result.time_range ? result.time_range.start : null,
                result.time_range ? result.time_range.end : null
            );

            console.log('処理結果:', processResult);
            console.log('visualization_dataの型:', typeof processResult.visualization_data);
            console.log('visualization_dataの内容:', processResult.visualization_data);

            // データの型チェックと変換
            if (!processResult.visualization_data) {
                throw new Error('可視化データが見つかりません');
            }

            // visualization_dataを配列に変換
            const visualizationData = Array.isArray(processResult.visualization_data) 
                ? processResult.visualization_data 
                : Object.values(processResult.visualization_data);

            console.log('変換後のvisualization_dataの型:', Array.isArray(visualizationData) ? 'array' : typeof visualizationData);
            console.log('変換後のvisualization_dataの長さ:', visualizationData.length);

            showLoadingIndicator('データを描画中...');

            // ビジュアライゼーションセクションに切り替え
            document.getElementById('upload-section').classList.add('hidden');
            document.getElementById('visualization-section').classList.remove('hidden');

            // マップコンテナが表示された後にセットアップを実行
            try {
                Visualization.setupMapAndViz(
                    'map-container', // マップコンテナのID
                    visualizationData, // 変換済みのvisualization_data
                    processResult.table_data
                );
                document.getElementById('map-container').classList.add('map-initialized');
                console.log('ビジュアライゼーションのセットアップ完了。');

                // サマリー表示
                displaySummary(processResult.summary);
            } catch (error) {
                console.error("Visualization setup failed:", error);
                console.log("エラー: ビジュアライゼーションのセットアップに失敗しました。", error.message);
                showError(`ビジュアライゼーションのセットアップに失敗しました: ${error.message}`);
                // エラー時はアップロードセクションに戻す
                document.getElementById('visualization-section').classList.add('hidden');
                document.getElementById('upload-section').classList.remove('hidden');
            }

            hideLoadingIndicator();
        } catch (error) {
            console.error('サンプルデータ読み込みエラー:', error);
            showError('サンプルデータの読み込み中にエラーが発生しました: ' + error.message);
            // エラー時はアップロードセクションを表示
            document.getElementById('visualization-section').classList.add('hidden');
            document.getElementById('upload-section').classList.remove('hidden');
            hideLoadingIndicator();
        }
    });
    
    // サマリー情報の表示
    function displaySummary(summary) {
        console.log('データサマリー:', summary);
        // ここでサマリー情報を表示する場合は追加
        
        // 実際の時間範囲を表示に反映
        if (summary && summary.start_time && summary.end_time) {
            // 現在時刻の表示も更新（要素の存在確認を追加）
            const currentTimeIndicator = document.getElementById('current-time-indicator');
            const currentTimeDisplay = document.getElementById('current-time-display');
            
            if (currentTimeIndicator) currentTimeIndicator.textContent = summary.start_time;
            if (currentTimeDisplay) currentTimeDisplay.textContent = summary.start_time;
        }
    }
    
    // リサイズイベント
    window.addEventListener('resize', () => {
        // ビジュアライゼーションのリサイズハンドリングはすでに実装済み
    });

    // ページ完全読み込み時にローディング非表示を確実に行う
    window.onload = function() {
        document.getElementById('loading-indicator').classList.add('hidden');
        console.log('window.onload: ローディングインジケーターを非表示に設定しました');
    };
}

function updateTimeRange(data) {
    // 時刻をフォーマットする関数
    function formatDateTime(timestamp) {
        if (!timestamp) return '00:00:00';
        
        const date = new Date(timestamp);
        // UTCからJSTに変換（+9時間）
        const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
        
        const hours = jstDate.getUTCHours().toString().padStart(2, '0');
        const minutes = jstDate.getUTCMinutes().toString().padStart(2, '0');
        const seconds = jstDate.getUTCSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    console.log('時刻範囲を更新:', data);

    // 各要素の存在確認をしてから値を設定
    const startTimeEl = document.getElementById('start-time');
    const endTimeEl = document.getElementById('end-time');
    const currentTimeDisplayEl = document.getElementById('current-time-display');
    const selectedStartTimeEl = document.getElementById('selected-start-time');
    const selectedEndTimeEl = document.getElementById('selected-end-time');
    
    if (startTimeEl) startTimeEl.textContent = formatDateTime(data.startTime);
    if (endTimeEl) endTimeEl.textContent = formatDateTime(data.endTime);
    if (currentTimeDisplayEl) currentTimeDisplayEl.textContent = formatDateTime(data.startTime);
    
    // 選択範囲の表示（必要な場合）
    if (selectedStartTimeEl) selectedStartTimeEl.textContent = formatDateTime(data.startTime);
    if (selectedEndTimeEl) selectedEndTimeEl.textContent = formatDateTime(data.endTime);
}

function updateDataTable(vizData) {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;
    
    // テーブルをクリア
    tableBody.innerHTML = '';
    
    // 新しいデータでテーブルを構築
    vizData.forEach((item, index) => {
        const row = document.createElement('tr');
        
        // UTCからJSTに変換して表示（+9時間）
        const timestampJST = new Date(item.timestamp);
        timestampJST.setTime(timestampJST.getTime() + (9 * 60 * 60 * 1000));
        const timeStr = timestampJST.toTimeString().split(' ')[0];
        
        // アイテムAとBの値を取得（存在しない場合は'-'を表示）
        const itemA = item.a || { height: '-', verticalSpeed: '-', horizontalSpeed: '-', speed3D: '-', verticalAccel: '-', horizontalAccel: '-', accel3D: '-' };
        const itemB = item.b || { height: '-', verticalSpeed: '-', horizontalSpeed: '-', speed3D: '-', verticalAccel: '-', horizontalAccel: '-', accel3D: '-' };
        
        // 高度差を計算（両方存在する場合のみ）
        let heightDiff = '-';
        if (itemA.height !== '-' && itemB.height !== '-') {
            heightDiff = (itemA.height - itemB.height).toFixed(2);
        }
        
        // 3D距離を表示
        const distance3D = item.distance3D !== undefined ? item.distance3D.toFixed(2) : '-';
        
        // 10秒平均垂直速度の計算
        const avgVerticalSpeedA = calculateAverageVerticalSpeed(vizData, index, 'a', 10);
        const avgVerticalSpeedB = calculateAverageVerticalSpeed(vizData, index, 'b', 10);
        
        // テーブルの列を現在の設計に合わせて作成
        row.innerHTML = `
            <td>${timeStr}</td>
            <td>${typeof itemA.height === 'number' ? itemA.height.toFixed(2) : itemA.height}</td>
            <td>${typeof itemB.height === 'number' ? itemB.height.toFixed(2) : itemB.height}</td>
            <td>${heightDiff}</td>
            <td>${typeof itemA.verticalSpeed === 'number' ? itemA.verticalSpeed.toFixed(2) : itemA.verticalSpeed}</td>
            <td>${typeof itemB.verticalSpeed === 'number' ? itemB.verticalSpeed.toFixed(2) : itemB.verticalSpeed}</td>
            <td>${avgVerticalSpeedA !== null ? avgVerticalSpeedA.toFixed(2) : '-'}</td>
            <td>${avgVerticalSpeedB !== null ? avgVerticalSpeedB.toFixed(2) : '-'}</td>
            <td>${typeof itemA.verticalAccel === 'number' ? itemA.verticalAccel.toFixed(2) : itemA.verticalAccel}</td>
            <td>${typeof itemB.verticalAccel === 'number' ? itemB.verticalAccel.toFixed(2) : itemB.verticalAccel}</td>
            <td>${distance3D}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// 過去n秒間の垂直速度平均を計算する関数
function calculateAverageVerticalSpeed(vizData, currentIndex, track, seconds) {
    // 現在の位置からn秒前のデータポイントを見つける
    const currentTime = vizData[currentIndex].timestamp;
    const targetTime = currentTime - (seconds * 1000); // n秒前の時間
    
    let startIndex = currentIndex;
    // n秒前のデータポイントを探す
    while (startIndex > 0 && vizData[startIndex].timestamp > targetTime) {
        startIndex--;
    }
    
    // 平均を計算するためのデータを収集
    let sum = 0;
    let count = 0;
    
    for (let i = startIndex; i <= currentIndex; i++) {
        const item = vizData[i][track];
        if (item && typeof item.verticalSpeed === 'number') {
            sum += item.verticalSpeed;
            count++;
        }
    }
    
    return count > 0 ? sum / count : null;
}

// アプリケーションの初期化
function initApp() {
    console.log('App initialization started');
    hideLoadingIndicator();
    
    // Visualizationオブジェクトが定義されているか確認
    if (typeof Visualization === 'undefined' || !Visualization) {
        console.error('Visualization module is not defined. Please check visualization.js');
        showError('アプリケーションの初期化中にエラーが発生しました。Visualizationモジュールが見つかりません。');
        return;
    }
    
    // Visualizationモジュールを初期化
    try {
        Visualization.init();
        console.log('Visualization module initialized');
    } catch (error) {
        console.error('Error initializing Visualization module:', error);
        showError('Visualizationモジュールの初期化中にエラーが発生しました。');
        return;
    }
    
    // イベントリスナーを設定
    setupEventListeners();
}

// ファイルアップロード処理
function handleFileUpload(files) {
    console.log('Handling file upload');
    showLoadingIndicator('GPXファイル処理中...');
    
    // FormDataの作成
    const formData = new FormData();
    if (files.file_a) formData.append('file_a', files.file_a);
    if (files.file_b) formData.append('file_b', files.file_b);
    
    // APIにアップロード
    API.uploadGPXFiles(formData)
        .then(response => {
            console.log('API response received:', response);
            hideLoadingIndicator();
            
            if (response.success) {
                showSuccessMessage('GPXファイルの処理が完了しました');
                switchToVisualizationView();
                
                // 3Dビジュアライゼーションを初期化
                if (typeof Visualization !== 'undefined' && Visualization) {
                    console.log('Initializing visualization with data from API response');
                    try {
                        // 可視化データをセット
                        Visualization.setupMapAndViz(
                            'map-container',
                            response.visualizationData,
                            response.tableData
                        );
                        document.getElementById('map-container').classList.add('map-initialized');
                        console.log('Visualization data set successfully');
                        
                        // 時間範囲データの更新
                        if (response.timeRange) {
                            updateTimeRange(response.timeRange);
                        }
                        
                        // テーブルデータを更新
                        if (response.tableData) {
                            updateDataTable(response.tableData);
                        }
                    } catch (error) {
                        console.error('Error setting visualization data:', error);
                        showError('データの可視化中にエラーが発生しました');
                    }
                } else {
                    console.error('Visualization module not found');
                    showError('Visualizationモジュールが見つかりません');
                }
            } else {
                showError(response.message || 'ファイル処理中にエラーが発生しました');
            }
        })
        .catch(error => {
            console.error('API error:', error);
            hideLoadingIndicator();
            showError('API接続エラー: ' + (error.message || '不明なエラー'));
        });
}

// ローディングインジケーターを表示
function showLoadingIndicator(text = '処理中...') {
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    
    if (loadingText) {
        loadingText.textContent = text;
    }
    
    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex';
        loadingIndicator.classList.remove('hidden');
    }
    
    console.log('ローディング表示:', text);
}

// ローディングインジケーターを非表示
function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
        loadingIndicator.classList.add('hidden');
    }
    
    console.log('ローディング非表示');
}

// エラーメッセージを表示
function showError(message) {
    const statusElement = document.getElementById('upload-status');
    
    if (statusElement) {
        statusElement.textContent = `エラー: ${message}`;
        statusElement.classList.add('error');
        statusElement.style.display = 'block';
    }
    
    console.error('エラー:', message);
}

// 成功メッセージを表示
function showSuccessMessage(message) {
    const statusElement = document.getElementById('upload-status');
    
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.classList.remove('error');
        statusElement.classList.add('success');
        statusElement.style.display = 'block';
        
        // 3秒後に非表示
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 3000);
    }
    
    console.log('成功:', message);
}

// ビジュアライゼーションビューに切り替え
function switchToVisualizationView() {
    // アップロードセクションを非表示
    const uploadSection = document.getElementById('upload-section');
    if (uploadSection) {
        uploadSection.classList.add('hidden');
    }
    
    // ナビゲーションバーを表示
    const navbar = document.getElementById('top-navbar');
    if (navbar) {
        navbar.classList.remove('hidden');
    }
    
    // ビジュアライゼーションセクションを表示
    const vizSection = document.getElementById('visualization-section');
    if (vizSection) {
        vizSection.classList.remove('hidden');
    }
    
    console.log('ビジュアライゼーションビューに切り替えました');
} 