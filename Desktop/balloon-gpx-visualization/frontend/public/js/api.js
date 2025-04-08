// APIとの通信を処理するモジュール
const API = {
    // GPXファイルをアップロードしてTimeRangeを取得
    async uploadGpxFiles(fileA, fileB) {
        try {
            console.log('アップロード開始:', fileA.name, fileB.name, fileA.size, fileB.size);
            
            const formData = new FormData();
            formData.append('file_a', fileA);
            formData.append('file_b', fileB);
            
            // FormDataの内容をログ出力（デバッグ用）
            for (let pair of formData.entries()) {
                console.log('FormData内容:', pair[0], pair[1], 'サイズ:', pair[1] instanceof File ? pair[1].size : 'N/A');
            }
            
            const url = `/api/upload`;
            console.log('アップロードURL:', url);
            
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });
            
            console.log('サーバーレスポンス:', response.status, response.statusText);
            
            if (!response.ok) {
                let errorText = '';
                try {
                    const errorData = await response.json();
                    errorText = errorData.detail || `サーバーエラー (${response.status})`;
                } catch (jsonError) {
                    errorText = await response.text() || `サーバーエラー (${response.status})`;
                }
                console.error('アップロードエラー:', errorText);
                throw new Error(errorText);
            }
            
            const result = await response.json();
            console.log('アップロード成功:', result);
            return result;
        } catch (error) {
            console.error('アップロードエラー詳細:', error);
            throw error;
        }
    },
    
    // 指定した時間範囲でデータを処理
    async processData(fileAPath, fileBPath, startTime, endTime) {
        try {
            console.log('データ処理開始:', {
                fileAPath, 
                fileBPath, 
                startTime, 
                endTime
            });
            
            const formData = new FormData();
            formData.append('file_a_path', fileAPath);
            formData.append('file_b_path', fileBPath);
            if (startTime) formData.append('start_time', startTime);
            if (endTime) formData.append('end_time', endTime);
            
            // FormDataの内容をログ出力（デバッグ用）
            for (let pair of formData.entries()) {
                console.log('処理用FormData:', pair[0], pair[1]);
            }
            
            const url = `/api/process`;
            console.log('処理リクエストURL:', url);
            
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });
            
            console.log('処理レスポンス:', response.status, response.statusText);
            
            if (!response.ok) {
                let errorText = '';
                try {
                    const errorData = await response.json();
                    errorText = errorData.detail || `サーバーエラー (${response.status})`;
                } catch (jsonError) {
                    errorText = await response.text() || `サーバーエラー (${response.status})`;
                }
                console.error('データ処理エラー:', errorText);
                throw new Error(errorText);
            }
            
            const result = await response.json();
            console.log('データ処理成功:', result ? '結果あり' : '結果なし', Object.keys(result));
            return result;
        } catch (error) {
            console.error('データ処理エラー詳細:', error);
            throw error;
        }
    },
    
    // サンプルデータを読み込む
    async loadSampleData() {
        try {
            console.log('サンプルデータ読み込み開始');
            
            const url = `/api/load_sample`;
            console.log('サンプルデータURL:', url);
            
            const response = await fetch(url, {
                method: 'POST'
            });
            
            console.log('サーバーレスポンス:', response.status, response.statusText);
            
            if (!response.ok) {
                let errorText = '';
                try {
                    const errorData = await response.json();
                    errorText = errorData.detail || `サーバーエラー (${response.status})`;
                } catch (jsonError) {
                    errorText = await response.text() || `サーバーエラー (${response.status})`;
                }
                console.error('サンプルデータ読み込みエラー:', errorText);
                throw new Error(errorText);
            }
            
            const result = await response.json();
            console.log('サンプルデータ読み込み成功:', result);
            return result;
        } catch (error) {
            console.error('サンプルデータ読み込みエラー詳細:', error);
            throw error;
        }
    }
}; 