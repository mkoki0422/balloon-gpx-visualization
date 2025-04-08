import os
import tempfile
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from functools import lru_cache
import aiofiles
import json
from pydantic import BaseModel
import gpxpy
import logging
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Body, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.gpx_processor import process_gpx_files

# ロギングの設定
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI(title="GPX 3D Visualization API")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# アップロードされたファイルを一時的に保存するディレクトリ
UPLOAD_DIR = tempfile.gettempdir()
# サンプルデータディレクトリ
SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "samples")

# レスポンスキャッシュ（処理に時間がかかる結果をキャッシュ）
RESPONSE_CACHE: Dict[str, Any] = {}

class TimeRange(BaseModel):
    start: str
    end: str

@app.get("/")
async def root():
    return {"message": "GPX 3D Visualization API"}

@app.get("/api/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# サンプルデータのキャッシュキー
@lru_cache(maxsize=1)
def get_sample_data_cache_key():
    """サンプルデータのキャッシュキーを生成（ファイルの最終更新日時に基づく）"""
    file_a_path = os.path.join(SAMPLES_DIR, "flight1_6.gpx")
    file_b_path = os.path.join(SAMPLES_DIR, "flight1_17.gpx")
    
    file_a_stat = os.stat(file_a_path)
    file_b_stat = os.stat(file_b_path)
    
    return f"sample_{file_a_stat.st_mtime}_{file_b_stat.st_mtime}"

@app.post("/api/load_sample")
async def load_sample_data():
    """サンプルデータを読み込むエンドポイント"""
    logger.info("サンプルデータ読み込みリクエスト受信")
    
    try:
        # サンプルファイルのパス
        file_a_path = os.path.join(SAMPLES_DIR, "flight1_6.gpx")
        file_b_path = os.path.join(SAMPLES_DIR, "flight1_17.gpx")
        
        # ファイルの存在を確認
        if not os.path.exists(file_a_path) or not os.path.exists(file_b_path):
            logger.error(f"サンプルファイルが見つかりません: {file_a_path}, {file_b_path}")
            raise HTTPException(status_code=404, detail="サンプルファイルが見つかりません")
        
        # キャッシュキーを取得
        cache_key = get_sample_data_cache_key()
        
        # キャッシュをチェック
        # if cache_key in RESPONSE_CACHE: # キャッシュの利用を一時停止（確認のため）
        #    logger.info("サンプルデータのキャッシュを使用")
        #    return RESPONSE_CACHE[cache_key]
        
        # 時間範囲も取得するように戻す
        logger.info("サンプルファイルパスと時間範囲を取得中...")
        time_range = process_gpx_files(file_a_path, file_b_path, get_time_range_only=True)
        
        # 結果を返す (ファイルパスと時間範囲)
        result = {
            "file_a_path": file_a_path,
            "file_b_path": file_b_path,
            "time_range": time_range
        }
        
        # キャッシュに保存
        # RESPONSE_CACHE[cache_key] = result # キャッシュの利用を一時停止（確認のため）
        
        logger.info("サンプルデータ読み込み成功")
        return result
    except Exception as e:
        logger.error(f"サンプルデータ読み込みエラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"サンプルデータエラー: {str(e)}")

@app.post("/api/upload")
async def upload_gpx_files(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
):
    logger.info(f"GPXファイルアップロードリクエスト: {file_a.filename}, {file_b.filename}")
    
    try:
        # GPXファイル形式チェック
        if not file_a.filename.endswith('.gpx') or not file_b.filename.endswith('.gpx'):
            raise HTTPException(status_code=400, detail="GPXファイルのみアップロード可能です")
        
        # 一時ファイルとして保存
        file_a_path = os.path.join(UPLOAD_DIR, f"file_a_{datetime.now().timestamp()}.gpx")
        file_b_path = os.path.join(UPLOAD_DIR, f"file_b_{datetime.now().timestamp()}.gpx")
        
        # ファイル保存を並行して実行
        async with aiofiles.open(file_a_path, 'wb') as out_file:
            content = await file_a.read()
            await out_file.write(content)
        
        async with aiofiles.open(file_b_path, 'wb') as out_file:
            content = await file_b.read()
            await out_file.write(content)
        
        # GPXデータから時間範囲を抽出する処理を削除
        # time_range = process_gpx_files(file_a_path, file_b_path, get_time_range_only=True)
        
        # 結果を返す (ファイルパスのみ)
        result = {
            "file_a_path": file_a_path,
            "file_b_path": file_b_path,
        }
        
        logger.info("アップロード処理成功（ファイルパスのみ返却）")
        return result
    except HTTPException:
        # HTTPExceptionはそのまま再発生
        raise
    except Exception as e:
        logger.error(f"アップロード処理エラー: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"アップロードエラー: {str(e)}")

# 処理結果のキャッシュ用のキー生成関数
def get_process_cache_key(file_a_path: str, file_b_path: str, start_time: Optional[str], end_time: Optional[str]) -> str:
    """処理リクエストのキャッシュキーを生成"""
    file_a_stat = os.stat(file_a_path) if os.path.exists(file_a_path) else None
    file_b_stat = os.stat(file_b_path) if os.path.exists(file_b_path) else None
    
    file_a_mtime = file_a_stat.st_mtime if file_a_stat else 0
    file_b_mtime = file_b_stat.st_mtime if file_b_stat else 0
    
    # start_time, end_time が None の場合も考慮
    start_key = start_time if start_time is not None else "None"
    end_key = end_time if end_time is not None else "None"
    
    return f"process_{file_a_path}_{file_a_mtime}_{file_b_path}_{file_b_mtime}_{start_key}_{end_key}"

@app.post("/api/process")
async def process_data(
    file_a_path: str = Form(...),
    file_b_path: str = Form(...),
    start_time: Optional[str] = Form(None),
    end_time: Optional[str] = Form(None),
):
    logger.info(f"データ処理リクエスト受信")
    if start_time and end_time:
        logger.info(f"時間範囲指定あり: {start_time} - {end_time}")
    else:
        logger.info("時間範囲指定なし（全範囲を処理）")
    
    # ファイルの存在チェック
    if not os.path.exists(file_a_path):
        raise HTTPException(status_code=400, detail=f"ファイルAが見つかりません: {file_a_path}")
        
    if not os.path.exists(file_b_path):
        raise HTTPException(status_code=400, detail=f"ファイルBが見つかりません: {file_b_path}")
    
    # キャッシュキーを生成
    cache_key = get_process_cache_key(file_a_path, file_b_path, start_time, end_time)
    
    # キャッシュをチェック
    # if cache_key in RESPONSE_CACHE: # キャッシュの利用を一時停止（確認のため）
    #    logger.info("処理結果のキャッシュを使用")
    #    return RESPONSE_CACHE[cache_key]
    
    # GPXファイルを処理してデータを返す
    try:
        logger.info("GPXデータ処理開始")
        # process_gpx_files に Optional な start_time, end_time を渡す
        # process_gpx_files 側で None の場合の処理が必要
        result = process_gpx_files(
            file_a_path,
            file_b_path,
            start_time=start_time,
            end_time=end_time,
            get_time_range_only=False
        )
        
        # 処理結果の基本検証
        if not result:
            raise ValueError("処理結果が空です")
        
        if "visualization_data" not in result or not result["visualization_data"]:
            logger.warning("視覚化データが空です。何かの問題かもしれません。")
        
        # キャッシュに処理結果を保存
        # RESPONSE_CACHE[cache_key] = result # キャッシュの利用を一時停止（確認のため）
        
        logger.info(f"データ処理完了: {len(result.get('visualization_data', []))} データポイント")
        return result
    except Exception as e:
        error_msg = str(e)
        logger.error(f"データ処理エラー: {error_msg}", exc_info=True)
        
        # より詳細なエラー情報をクライアントに提供
        return JSONResponse(
            status_code=500,
            content={
                "detail": error_msg,
                "type": type(e).__name__,
                "files": {
                    "file_a": os.path.basename(file_a_path),
                    "file_b": os.path.basename(file_b_path)
                },
                "time_range": {
                    "start": start_time if start_time else "N/A",
                    "end": end_time if end_time else "N/A"
                }
            }
        )

# キャッシュをクリアするエンドポイント（管理用）
@app.post("/api/clear_cache")
async def clear_cache():
    """キャッシュをクリアするエンドポイント"""
    global RESPONSE_CACHE
    cache_size = len(RESPONSE_CACHE)
    RESPONSE_CACHE = {}
    get_sample_data_cache_key.cache_clear() # lru_cache もクリア (コメント解除)
    logger.info(f"RESPONSE_CACHE と lru_cache クリア完了 (クリア前: {cache_size} 件)")
    return {"status": "success", "cleared_items": cache_size}

def calculate_relative_data(track_a_data, track_b_data):
    """
    2つのトラック間の相対データを計算する
    """
    # ここに2つのトラック間の時系列データの計算ロジックを実装
    # 簡易的な実装例として、単純に両方のデータを組み合わせる
    
    # 時間ごとのデータポイントを作成
    time_series_data = []
    
    # トラックAとBの同じ時間にあるデータを対応させる
    for i in range(min(len(track_a_data), len(track_b_data))):
        point_a = track_a_data[i]
        point_b = track_b_data[i]
        
        # 時間を調整 (デモ用にトラックBの時間をベースに使用)
        time_stamp = point_b['time']
        
        # 高度 (フィート単位で計算。メートルの場合は変換が必要)
        ele_a_ft = point_a['ele'] * 3.28084 if point_a['ele'] is not None else 0
        ele_b_ft = point_b['ele'] * 3.28084 if point_b['ele'] is not None else 0
        height_diff_ft = ele_a_ft - ele_b_ft
        
        # 3D距離計算のプレースホルダー (実際には緯度経度から計算)
        distance_3d = 500 + i * 0.5  # サンプルデータ: 徐々に減少していく距離
        
        # データポイントを作成
        data_point = {
            'time': time_stamp,
            'ele_a_ft': round(ele_a_ft, 1),
            'ele_b_ft': round(ele_b_ft, 1),
            'height_diff_ft': round(height_diff_ft, 1),
            
            # 垂直速度（サンプルデータ）
            'vertical_speed_a': round((i % 10 - 5) * 0.3048, 3),
            'vertical_speed_b': round(((i + 3) % 8 - 4) * 0.3048, 3),
            
            # 水平速度（サンプルデータ）
            'horizontal_speed_a': round(1.5 + (i % 7) * 0.1, 3),
            'horizontal_speed_b': round(1.0 + (i % 5) * 0.05, 3),
            
            # 3D速度（サンプルデータ）
            'speed_3d_a': round(2.0 + (i % 8) * 0.1, 3),
            'speed_3d_b': round(1.2 + (i % 6) * 0.07, 3),
            
            # 加速度（サンプルデータ）
            'vertical_accel_a': round((i % 3 - 1) * 0.305, 3),
            'vertical_accel_b': round(((i + 1) % 3 - 1) * 0.305, 3),
            'horizontal_accel_a': round((i % 5 - 2) * 0.05, 3),
            'horizontal_accel_b': round(((i + 2) % 7 - 3) * 0.04, 3),
            'accel_3d_a': round((i % 4 - 2) * 0.06, 3),
            'accel_3d_b': round(((i + 3) % 6 - 3) * 0.05, 3),
            
            # 3D距離
            'distance_3d': round(distance_3d, 3)
        }
        
        time_series_data.append(data_point)
    
    # サマリー情報を追加
    summary = {
        'count': len(time_series_data),
        'start_time': time_series_data[0]['time'] if time_series_data else None,
        'end_time': time_series_data[-1]['time'] if time_series_data else None,
        'max_height_diff_ft': max([p['height_diff_ft'] for p in time_series_data]) if time_series_data else 0,
        'min_height_diff_ft': min([p['height_diff_ft'] for p in time_series_data]) if time_series_data else 0,
        'max_distance_3d': max([p['distance_3d'] for p in time_series_data]) if time_series_data else 0
    }
    
    # 最終結果に時系列データとサマリーを含める
    result = {
        'points': time_series_data,
        'summary': summary
    }
    
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 