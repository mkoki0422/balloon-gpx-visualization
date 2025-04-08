// リサイズ問題を修正するためのヘルパー関数
// ブラウザのコンソールで fixResizeIssue() を実行してください
function fixResizeIssue() {
    console.log("リサイズ問題修正関数が実行されました");
    
    // データテーブルコンテナの制限を解除
    const tableContainer = document.querySelector('.data-table-container');
    if (tableContainer) {
        tableContainer.style.minHeight = "0";
        tableContainer.style.maxHeight = "none";
        tableContainer.style.height = "300px"; // 初期値
        tableContainer.style.resize = "vertical";
        console.log("データテーブルコンテナの制限を解除しました");
    } else {
        console.error("データテーブルコンテナが見つかりません");
        return;
    }
    
    // リサイズハンドラの動作を修正
    const resizeHandle = document.getElementById('resize-handle');
    if (resizeHandle) {
        // 既存のイベントリスナーを全て削除 (クローン置き換え)
        const oldHandle = resizeHandle.cloneNode(true);
        resizeHandle.parentNode.replaceChild(oldHandle, resizeHandle);
        
        let isDragging = false;
        let startY = 0;
        let startHeight = 0;
        
        oldHandle.addEventListener('mousedown', (e) => {
            console.log("リサイズ開始");
            isDragging = true;
            startY = e.clientY;
            startHeight = tableContainer.offsetHeight;
            document.body.style.cursor = 'row-resize';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaY = startY - e.clientY; // 上に動かすと大きく、下に動かすと小さく
            const newHeight = startHeight + deltaY;
            
            // 高さを直接設定 (制限なし)
            tableContainer.style.height = `${newHeight}px`;
            console.log(`テーブルの高さを ${newHeight}px に設定`);
            
            // マップのサイズも更新
            if (window.Visualization && window.Visualization.map) {
                window.Visualization.map.invalidateSize();
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
                console.log("リサイズ終了");
                
                // マップのサイズを更新
                if (window.Visualization && window.Visualization.map) {
                    window.Visualization.map.invalidateSize();
                }
            }
        });
        
        console.log("リサイズハンドラを修正しました");
    } else {
        console.error("リサイズハンドルが見つかりません");
    }
    
    return "リサイズ問題の修正が完了しました。これでリサイズを自由に行えるはずです。";
}

// ページロード時に通知
window.addEventListener('load', function() {
    console.log("リサイズ修正スクリプトが読み込まれました。");
    console.log("問題が発生している場合は、ブラウザコンソールで fixResizeIssue() を実行してください。");
}); 