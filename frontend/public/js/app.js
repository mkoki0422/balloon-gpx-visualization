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
            showLoadingIndicator('データを描画中...');

            // ★★★ 変更点: Visualizationのセットアップを呼び出す ★★★
            document.getElementById('upload-section').classList.add('hidden');
            document.getElementById('visualization-section').classList.remove('hidden');

            // マップコンテナが表示された後にセットアップを実行
            try {
                 Visualization.setupMapAndViz(
                     'map-container', // マップコンテナのID
                     processResult.visualization_data,
                     processResult.table_data
                 );
                 document.getElementById('map-container').classList.add('map-initialized');
                 console.log('ビジュアライゼーションのセットアップ完了。')
                 // uploadStatus は setupMapAndViz の中で更新されるか、ここで上書き
                 // uploadStatus.textContent = 'データの処理・描画が完了しました！';

                 // サマリー表示は setupMapAndViz の外で良い
                 displaySummary(processResult.summary);

            } catch (error) {
                 console.error("Visualization setup failed:", error);
                 console.log("エラー: ビジュアライゼーションのセットアップに失敗しました。", error.message);
                 uploadStatus.textContent = `エラー: ビジュアライゼーションのセットアップに失敗しました: ${error.message}`;
                 // 必要なら visualization-section を再度隠すなどの処理
                 document.getElementById('visualization-section').classList.add('hidden');
                 document.getElementById('upload-section').classList.remove('hidden');
            }

            // ★★★ 削除: 古い呼び出し ★★★
            // Visualization.setVisualizationData(processResult.visualization_data);
            // Visualization.populateTable(processResult.table_data);
            // displaySummary(processResult.summary);
            // if (Visualization.map) { requestAnimationFrame(() => { ... }); }

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
    document.getElementById('load-sample').addEventListener('click', () => {
        console.log('サンプルデータ読み込みボタンがクリックされました', API);
        loadSampleData();
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
    // UTC日時を表示するためのフォーマット関数
    function formatDateTime(timestamp) {
        const date = new Date(timestamp);
        // UTCからJSTに変換（+9時間）
        date.setTime(date.getTime() + (9 * 60 * 60 * 1000));
        
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // 各要素の存在確認をしてから値を設定
    const startTimeEl = document.getElementById('start-time');
    const endTimeEl = document.getElementById('end-time');
    const selectedStartTimeEl = document.getElementById('selected-start-time');
    const selectedEndTimeEl = document.getElementById('selected-end-time');
    
    if (startTimeEl) startTimeEl.textContent = formatDateTime(data.startTime);
    if (endTimeEl) endTimeEl.textContent = formatDateTime(data.endTime);
    
    // シンプルなタイムバーの場合は、選択範囲の表示は不要
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
                        Visualization.setVisualizationData(response.visualizationData);
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

// サンプルデータの読み込み
function loadSampleData() {
    console.log('Loading sample data');
    showLoadingIndicator('サンプルデータ読み込み中...');
    
    API.loadSampleData()
        .then(response => {
            console.log('Sample data loaded:', response);
            
            // ファイルパスが含まれているかチェック
            if (response && response.file_a_path && response.file_b_path) {
                showSuccessMessage('サンプルデータの読み込みが完了しました');
                
                // バックエンドにデータ処理をリクエスト
                return API.processData(
                    response.file_a_path,
                    response.file_b_path,
                    response.time_range && response.time_range.start ? response.time_range.start : null,
                    response.time_range && response.time_range.end ? response.time_range.end : null
                ).then(processResponse => {
                    if (processResponse && processResponse.visualization_data) {
                        switchToVisualizationView();
                        
                        // 3Dビジュアライゼーションを初期化
                        if (typeof Visualization !== 'undefined' && Visualization) {
                            console.log('Initializing visualization with processed data');
                            try {
                                // 可視化データをセット
                                Visualization.setVisualizationData(processResponse.visualization_data);
                                console.log('Visualization data set successfully');
                                
                                // 時間範囲データの更新
                                if (processResponse.time_range) {
                                    const startTime = new Date(processResponse.time_range.start).getTime();
                                    const endTime = new Date(processResponse.time_range.end).getTime();
                                    updateTimeRange({
                                        startTime: startTime,
                                        endTime: endTime
                                    });
                                }
                                
                                // テーブルデータを更新
                                if (processResponse.table_data) {
                                    updateDataTable(processResponse.table_data);
                                }
                                
                                // タイムバーを初期位置に設定
                                if (Visualization.updateTimePosition) {
                                    Visualization.updateTimePosition(0);
                                }
                            } catch (error) {
                                console.error('Error setting visualization data:', error);
                                showError('データの可視化中にエラーが発生しました: ' + error.message);
                            }
                        } else {
                            console.error('Visualization module not found');
                            showError('Visualizationモジュールが見つかりません');
                        }
                    } else {
                        console.error('No visualization data in process response');
                        showError('データの処理結果に可視化データが含まれていません');
                    }
                });
            } else {
                const errorMsg = response && response.message 
                    ? response.message 
                    : 'サンプルデータの読み込み中に不明なエラーが発生しました';
                showError(errorMsg);
            }
        })
        .catch(error => {
            console.error('API error:', error);
            showError('API接続エラー: ' + (error.message || '不明なエラー'));
        })
        .finally(() => {
            hideLoadingIndicator();
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