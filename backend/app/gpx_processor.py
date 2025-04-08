import xml.etree.ElementTree as ET
import datetime
import pytz
import pandas as pd
import numpy as np
import math
import os
from typing import Dict, List, Tuple, Optional, Union
import gpxpy
from datetime import timedelta
import logging
import functools

logger = logging.getLogger(__name__)

# メートルからフィートへの変換係数
M_TO_FT = 3.28084
EARTH_RADIUS = 6371000  # 地球の半径（メートル）

# データキャッシュ
_gpx_cache = {}

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    2点間の緯度経度から球面上の距離を計算（ハーバーサイン公式）
    距離の単位はメートル
    """
    # 地球の半径（単位:メートル）
    R = 6371000.0
    
    # 緯度・経度をラジアンに変換
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    # ハーバーサイン公式
    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    distance = R * c
    
    return distance

def calculate_3d_distance(lat1, lon1, ele1, lat2, lon2, ele2):
    """Calculate 3D distance between two points."""
    # 2D distance (horizontal)
    distance_2d = haversine_distance(lat1, lon1, lat2, lon2)
    
    # Calculate the 3D distance
    ele_diff = ele2 - ele1
    distance_3d = math.sqrt(distance_2d**2 + ele_diff**2)
    
    return distance_3d

# ★ 新しい堅牢な日付跨ぎ修正関数を追加 ★
def fix_datetime_sequence_robust(points):
    """
    時系列データが連続するように日付跨ぎを修正する（より堅牢な方法）。
    大きな時間の巻き戻りが発生するたびに日付オフセットを増やす。
    """
    if len(points) < 2:
        return points

    logger.debug(f"fix_datetime_sequence_robust: 開始 - {len(points)} ポイント")
    modified_points = [p.copy() for p in points] # Deep copy for modification
    
    date_offset_days = 0
    # Ensure prev_time is timezone-aware if points are
    prev_time = modified_points[0]['time_utc']
    if prev_time.tzinfo is None:
        logger.warning("Initial point lacks timezone info, assuming UTC.")
        prev_time = pytz.UTC.localize(prev_time)
    modified_points[0]['time_utc'] = prev_time # Store potentially localized time back

    # 時間の巻き戻りが検出された回数
    time_reversals_detected = 0
    time_reversals_fixed = 0

    # 日付オフセットを追跡する辞書 (時間帯ごとに異なるオフセットを適用できるように)
    hour_offsets = {}

    for i in range(1, len(modified_points)):
        current_time = modified_points[i]['time_utc']
        # Ensure current_time is timezone-aware
        if current_time.tzinfo is None:
            logger.warning(f"Point {i} lacks timezone info, assuming UTC.")
            current_time = pytz.UTC.localize(current_time)

        # 現在の日付オフセットを適用
        current_time_adjusted = current_time + timedelta(days=date_offset_days)
        
        # Make sure comparison happens between aware datetimes
        time_diff_seconds = (current_time_adjusted - prev_time).total_seconds()

        # 異常な時間の巻き戻り（例: -1時間以上）を検出
        if time_diff_seconds < -1800:  # 30分以上の巻き戻りは異常と判断
            time_reversals_detected += 1
            
            # 明らかな日付跨ぎパターン: 23時台から0-4時台への変化
            if prev_time.hour >= 21 and current_time.hour <= 4:
                logger.info(f"典型的な日付跨ぎを検出: {prev_time.hour}時 -> {current_time.hour}時")
                date_offset_days += 1
                time_reversals_fixed += 1
            # その他の大きな時間逆転
            else:
                logger.warning(f"非典型的な時間逆転を検出: {prev_time.hour}時 -> {current_time.hour}時")
                # 時間逆転が3時間以上なら日付跨ぎとして扱う
                if abs(time_diff_seconds) > 10800:  # 3時間 = 10800秒
                    date_offset_days += 1
                    time_reversals_fixed += 1
            
            current_time_adjusted = current_time + timedelta(days=date_offset_days) # 再度オフセット適用
            logger.info(f"日付跨ぎ/巻き戻りを検出しオフセット適用: "
                        f"Index={i}, "
                        f"Prev={prev_time.strftime('%Y-%m-%d %H:%M:%S%z')}, "
                        f"Original Curr={current_time.strftime('%Y-%m-%d %H:%M:%S%z')}, "
                        f"Offset Days={date_offset_days}, "
                        f"Adjusted Curr={current_time_adjusted.strftime('%Y-%m-%d %H:%M:%S%z')}")

        # 修正後の時刻をリストに反映 (タイムゾーン情報を保持)
        modified_points[i]['time_utc'] = current_time_adjusted
        
        # 次の比較のために前の時刻を更新 (修正後の時刻を使う)
        prev_time = current_time_adjusted

    if date_offset_days > 0:
         logger.info(f"タイムスタンプ修正完了. Total Offset Applied: {date_offset_days} days, 検出された巻き戻り: {time_reversals_detected}回, 修正された巻き戻り: {time_reversals_fixed}回")
         # Log first and last adjusted times
         first_ts = modified_points[0]['time_utc'].strftime('%Y-%m-%d %H:%M:%S%z') if modified_points else 'N/A'
         last_ts = modified_points[-1]['time_utc'].strftime('%Y-%m-%d %H:%M:%S%z') if modified_points else 'N/A'
         logger.info(f"修正後の時間範囲: {first_ts} - {last_ts}")
    else:
         logger.debug(f"シーケンス内の時間巻き戻りなし: 修正不要")

    return modified_points

# 新しい関数: ファイル全体の時間順序を考慮した日付跨ぎ修正
def fix_datetime_for_file(points):
    """ファイル全体の時間順序を見て日付跨ぎを修正する"""
    if len(points) < 2:
        return points
        
    # ポイントをコピー (元の順序を維持)
    modified_points = [p.copy() for p in points]
    
    # ソートなしで最初と最後のポイントの時間を取得
    first_time = modified_points[0]['time_utc']
    last_time = modified_points[-1]['time_utc']
    
    logger.debug(f"日付跨ぎチェック (元の順序): 最初={first_time.strftime('%Y-%m-%d %H:%M:%S%z')}, 最後={last_time.strftime('%Y-%m-%d %H:%M:%S%z')}")
    
    # 夜から朝への変化を検出するために時間帯を分析
    late_night_points = []  # 21時〜23時台のポイント
    early_morning_points = []  # 0時〜4時台のポイント
    
    for i, p in enumerate(modified_points):
        hour = p['time_utc'].hour
        if 21 <= hour <= 23:
            late_night_points.append((i, p))
        elif 0 <= hour <= 4:
            early_morning_points.append((i, p))
    
    # 夜間のポイントと早朝のポイントがあり、夜間のポイントが先に来る場合は日付跨ぎと判断
    needs_fix = False
    if late_night_points and early_morning_points:
        first_late_night_idx = late_night_points[0][0]
        first_early_morning_idx = early_morning_points[0][0]
        
        # 夜のポイントが早朝のポイントより前に来ている場合
        if first_late_night_idx < first_early_morning_idx:
            logger.warning(f"日付跨ぎを検出: 夜間ポイント({late_night_points[0][1]['time_utc'].strftime('%H:%M:%S')})が早朝ポイント({early_morning_points[0][1]['time_utc'].strftime('%H:%M:%S')})より前にあります")
            needs_fix = True
    
    # 最後のポイントと最初のポイントの時間差を確認
    # 23時→0時の変化なら日付跨ぎの可能性
    if not needs_fix and modified_points[0]['time_utc'].hour >= 21 and modified_points[-1]['time_utc'].hour <= 4:
        logger.warning(f"日付跨ぎの可能性: 最初={modified_points[0]['time_utc'].hour}時台, 最後={modified_points[-1]['time_utc'].hour}時台")
        needs_fix = True
    
    # 時間の逆転も検出 (例: 23:30 -> 00:15)
    for i in range(1, len(modified_points)):
        time_diff = (modified_points[i]['time_utc'] - modified_points[i-1]['time_utc']).total_seconds()
        if time_diff < -3600:  # 1時間以上の時間逆転は日付跨ぎの可能性
            logger.warning(f"大きな時間逆転を検出: ポイント{i-1}({modified_points[i-1]['time_utc'].strftime('%H:%M:%S')}) -> ポイント{i}({modified_points[i]['time_utc'].strftime('%H:%M:%S')})")
            needs_fix = True
            break
    
    if needs_fix:
        logger.info("日付跨ぎ修正を適用します")
        modified_count = 0
        
        # 0-4時のポイントを「翌日」として扱う
        for i in range(len(modified_points)):
            point_time = modified_points[i]['time_utc']
            if point_time.hour <= 4:
                # 早朝のポイントは翌日として扱う
                modified_points[i]['time_utc'] = point_time + timedelta(days=1)
                modified_count += 1
                logger.debug(f"ポイント {i} の日付を1日進めました: {point_time.strftime('%Y-%m-%d %H:%M:%S%z')} -> {modified_points[i]['time_utc'].strftime('%Y-%m-%d %H:%M:%S%z')}")
        
        # 修正後の最初と最後のポイントの時間
        first_time_after = modified_points[0]['time_utc']
        last_time_after = modified_points[-1]['time_utc']
        logger.info(f"日付跨ぎ修正後の時間範囲: {first_time_after.strftime('%Y-%m-%d %H:%M:%S%z')} - {last_time_after.strftime('%Y-%m-%d %H:%M:%S%z')}, 修正ポイント数: {modified_count}")
    else:
        logger.debug(f"日付跨ぎなし: 時間順序が適切です")
    
    return modified_points

# キャッシュ付きのGPXパーサー
def parse_gpx(gpx_file, fix_timestamps=True):
    """
    GPXファイルを解析してポイントデータを抽出する
    
    Parameters:
    ----------
    gpx_file : str
        GPXファイルのパス
    fix_timestamps : bool
        タイムスタンプ修正を適用するかどうか
        
    Returns:
    -------
    list
        ポイントデータのリスト
    """
    logger.info(f"GPXファイルの解析開始: {gpx_file} (Fix Timestamps: {fix_timestamps})")
    
    # ファイルのキャッシュキーを作成
    file_stats = os.stat(gpx_file)
    cache_key = f"{gpx_file}_{file_stats.st_mtime}_{file_stats.st_size}_{fix_timestamps}"
    
    # 修正済みデータがキャッシュにある場合はそれを使用
    if cache_key in _gpx_cache:
        logger.info(f"キャッシュされた{'修正済み' if fix_timestamps else '未修正'}データを使用: {gpx_file}")
        return _gpx_cache[cache_key]
    
    points = []
    try:
        with open(gpx_file, 'r', encoding='utf-8') as f:
            gpx = gpxpy.parse(f)
        
        # メタデータ時間があれば記録
        metadata_time = gpx.time
        if metadata_time:
            logger.info(f"GPXファイルのメタデータ時間: {metadata_time}")
        
        # すべてのトラックポイントを抽出 - ファイルの順序を維持
        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    # 時間と標高情報があるポイントのみ処理
                    if point.time and point.elevation is not None:
                        # タイムゾーン情報がない場合はUTCとして扱う
                        time_utc = point.time
                        if time_utc.tzinfo is None:
                            time_utc = pytz.UTC.localize(time_utc)
                        else:
                            # すでにタイムゾーンがある場合はUTCに変換
                            time_utc = time_utc.astimezone(pytz.UTC)
                        
                        # ポイントデータを登録
                        points.append({
                            'lat': point.latitude,
                            'lon': point.longitude,
                            'ele': point.elevation,
                            'time_utc': time_utc,
                            'original_time': time_utc  # オリジナルの時刻も保存
                        })
                    else:
                        logger.debug(f"時間または標高がないポイントをスキップ: {point}")
    
    except Exception as e:
        logger.error(f"GPXファイル解析エラー ({gpx_file}): {e}", exc_info=True)
        return []
    
    if not points:
        logger.warning(f"有効なポイントが見つかりませんでした: {gpx_file}")
        return []
    
    # 元のファイル順序でログ出力
    if points:
        first_ts = points[0]['time_utc'].strftime('%Y-%m-%d %H:%M:%S.%f%z')
        last_ts = points[-1]['time_utc'].strftime('%Y-%m-%d %H:%M:%S.%f%z')
        logger.info(f"解析したGPXデータの時間範囲 (元の順序): {first_ts} - {last_ts} (ポイント数: {len(points)})")
        
        # 連続するポイント間の逆転があるかチェック
        time_reversals = 0
        for i in range(1, len(points)):
            if points[i]['time_utc'] < points[i-1]['time_utc']:
                time_diff = (points[i-1]['time_utc'] - points[i]['time_utc']).total_seconds()
                if time_diff > 3600:  # 1時間以上の逆転のみ報告
                    logger.warning(f"ポイント間の時間逆転を検出: ポイント{i-1}({points[i-1]['time_utc'].strftime('%H:%M:%S')}) -> ポイント{i}({points[i]['time_utc'].strftime('%H:%M:%S')}), 差: {time_diff:.1f}秒")
                    time_reversals += 1
        
        if time_reversals > 0:
            logger.warning(f"合計 {time_reversals} 回の時間逆転を検出")
    
    # タイムスタンプ修正処理
    if fix_timestamps:
        # ファイル全体での日付跨ぎを修正 (ソートなしで元の順序を維持)
        points = fix_datetime_for_file(points)
        
        # ポイント間の時間順序を修正
        points = fix_datetime_sequence_robust(points)
        
        # 修正後の時間範囲をログに出力
        if points:
            fixed_first = points[0]['time_utc'].strftime('%Y-%m-%d %H:%M:%S.%f%z')
            fixed_last = points[-1]['time_utc'].strftime('%Y-%m-%d %H:%M:%S.%f%z')
            logger.info(f"タイムスタンプ修正後の時間範囲: {fixed_first} - {fixed_last}")
        
        # 修正したデータをキャッシュに保存
        _gpx_cache[cache_key] = points
    else:
        # 未修正データもキャッシュ
        _gpx_cache[cache_key] = points
    
    return points

def calculate_metrics(df):
    """Calculate vertical and horizontal speed, acceleration, and 3D metrics."""
    # Sort by time to ensure correct calculation
    df = df.sort_values('time_utc')
    
    # Calculate time differences in seconds
    df['time_diff'] = df['time_utc'].diff().dt.total_seconds()
    
    # Calculate position differences
    df['ele_diff'] = df['ele'].diff()
    df['lat_diff'] = df['lat'].diff()
    df['lon_diff'] = df['lon'].diff()
    
    # Calculate horizontal distance between consecutive points
    df['horizontal_distance'] = df.apply(
        lambda row: haversine_distance(
            row['lat'] - row['lat_diff'] if not pd.isna(row['lat_diff']) else row['lat'],
            row['lon'] - row['lon_diff'] if not pd.isna(row['lon_diff']) else row['lon'],
            row['lat'],
            row['lon']
        ) if not pd.isna(row['lat_diff']) else 0,
        axis=1
    )
    
    # Calculate 3D distance between consecutive points
    df['distance_3d'] = df.apply(
        lambda row: calculate_3d_distance(
            row['lat'] - row['lat_diff'] if not pd.isna(row['lat_diff']) else row['lat'],
            row['lon'] - row['lon_diff'] if not pd.isna(row['lon_diff']) else row['lon'],
            row['ele'] - row['ele_diff'] if not pd.isna(row['ele_diff']) else row['ele'],
            row['lat'],
            row['lon'],
            row['ele']
        ) if not pd.isna(row['lat_diff']) else 0,
        axis=1
    )
    
    # Calculate various speeds (m/s)
    df['vertical_speed'] = df.apply(
        lambda row: row['ele_diff'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
        axis=1
    )
    
    df['horizontal_speed'] = df.apply(
        lambda row: row['horizontal_distance'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
        axis=1
    )
    
    df['speed_3d'] = df.apply(
        lambda row: row['distance_3d'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
        axis=1
    )
    
    # Calculate accelerations (m/s^2)
    df['vertical_speed_diff'] = df['vertical_speed'].diff()
    df['horizontal_speed_diff'] = df['horizontal_speed'].diff()
    df['speed_3d_diff'] = df['speed_3d'].diff()
    
    df['vertical_accel'] = df.apply(
        lambda row: row['vertical_speed_diff'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
        axis=1
    )
    
    df['horizontal_accel'] = df.apply(
        lambda row: row['horizontal_speed_diff'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
        axis=1
    )
    
    df['accel_3d'] = df.apply(
        lambda row: row['speed_3d_diff'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
        axis=1
    )
    
    # Calculate 10-second moving averages
    # 修正: rolling() メソッドのon='time_utc'パラメータを削除し、
    # 代わりに一時的にtime_utcをインデックスとして設定
    window_size = 10  # seconds
    
    # インデックスを一時的に設定
    df_temp = df.set_index('time_utc')
    
    # 10秒間の移動平均を計算
    df['avg_10sec_vertical_speed'] = df_temp['vertical_speed'].rolling(
        window=pd.Timedelta(seconds=window_size)
    ).mean().reset_index(drop=True)
    
    df['avg_10sec_horizontal_speed'] = df_temp['horizontal_speed'].rolling(
        window=pd.Timedelta(seconds=window_size)
    ).mean().reset_index(drop=True)
    
    df['avg_10sec_speed_3d'] = df_temp['speed_3d'].rolling(
        window=pd.Timedelta(seconds=window_size)
    ).mean().reset_index(drop=True)
    
    # NaN値を0で埋める
    df = df.fillna(0)
    
    return df

def filter_by_time_range(df, start_time_str, end_time_str):
    """Filter data by time range (UTC)."""
    # Parse start and end times in UTC
    start_time = datetime.datetime.strptime(start_time_str, '%Y-%m-%d %H:%M:%S')
    start_time = pytz.UTC.localize(start_time)
    
    end_time = datetime.datetime.strptime(end_time_str, '%Y-%m-%d %H:%M:%S')
    end_time = pytz.UTC.localize(end_time)
    
    # Filter by complete timestamp (UTC)
    return df[(df['time_utc'] >= start_time) & (df['time_utc'] <= end_time)]

def process_gpx_file(gpx_file):
    """Process a single GPX file and return processed dataframe."""
    # Parse GPX file
    points = parse_gpx(gpx_file)
    
    # Calculate metrics
    df = pd.DataFrame(points)
    
    # Sort by time to ensure correct calculation
    df = df.sort_values('time_utc')
    
    # Calculate metrics
    df = calculate_metrics(df)
    
    return df

def merge_dataframes(df_a, df_b):
    """Merge two dataframes based on time_utc."""
    # Create a formatted time string for merging
    df_a['time_key'] = df_a['time_utc'].dt.strftime('%Y-%m-%d %H:%M:%S')
    df_b['time_key'] = df_b['time_utc'].dt.strftime('%Y-%m-%d %H:%M:%S')
    
    # Ensure required columns exist
    for df in [df_a, df_b]:
        # 速度と加速度のカラムが存在しない場合、デフォルト値を設定
        for col in ['vertical_speed', 'horizontal_speed', 'speed_3d', 
                    'vertical_accel', 'horizontal_accel', 'accel_3d',
                    'avg_10sec_vertical_speed', 'avg_10sec_horizontal_speed', 'avg_10sec_speed_3d']:
            if col not in df.columns:
                df[col] = 0.0  # デフォルト値として0を設定
    
    # Select columns needed from each dataframe
    df_a_selected = df_a[['time_key', 'time_utc', 'lat', 'lon', 'ele', 
                          'vertical_speed', 'horizontal_speed', 'speed_3d',
                          'vertical_accel', 'horizontal_accel', 'accel_3d',
                          'avg_10sec_vertical_speed', 'avg_10sec_horizontal_speed', 'avg_10sec_speed_3d']].copy()
    
    df_b_selected = df_b[['time_key', 'lat', 'lon', 'ele', 
                          'vertical_speed', 'horizontal_speed', 'speed_3d',
                          'vertical_accel', 'horizontal_accel', 'accel_3d',
                          'avg_10sec_vertical_speed', 'avg_10sec_horizontal_speed', 'avg_10sec_speed_3d']].copy()
    
    # Rename columns to avoid conflicts
    df_a_selected.columns = ['time_key', 'time_utc', 
                            'lat_a', 'lon_a', 'ele_a', 
                            'vertical_speed_a', 'horizontal_speed_a', 'speed_3d_a',
                            'vertical_accel_a', 'horizontal_accel_a', 'accel_3d_a',
                            'avg_10sec_vertical_speed_a', 'avg_10sec_horizontal_speed_a', 'avg_10sec_speed_3d_a']
    
    df_b_selected.columns = ['time_key', 
                            'lat_b', 'lon_b', 'ele_b', 
                            'vertical_speed_b', 'horizontal_speed_b', 'speed_3d_b',
                            'vertical_accel_b', 'horizontal_accel_b', 'accel_3d_b',
                            'avg_10sec_vertical_speed_b', 'avg_10sec_horizontal_speed_b', 'avg_10sec_speed_3d_b']
    
    # Merge dataframes on time_key
    merged_df = pd.merge(df_a_selected, df_b_selected, on='time_key', how='inner')
    
    # Calculate height difference (m)
    merged_df['height_diff'] = merged_df['ele_a'] - merged_df['ele_b']
    
    # Calculate 3D distance between points
    merged_df['distance_3d'] = merged_df.apply(
        lambda row: calculate_3d_distance(
            row['lat_a'], row['lon_a'], row['ele_a'], 
            row['lat_b'], row['lon_b'], row['ele_b']
        ), 
        axis=1
    )
    
    return merged_df

def get_time_range(df):
    """Get min and max times from dataframe."""
    min_time = df['time_utc'].min().strftime('%Y-%m-%d %H:%M:%S')
    max_time = df['time_utc'].max().strftime('%Y-%m-%d %H:%M:%S')
    return {"start": min_time, "end": max_time}

def format_for_visualization(merged_df):
    """Format the merged dataframe for visualization."""
    # Ensure data is sorted by time
    merged_df = merged_df.sort_values('time_utc')
    
    # Convert to JSON-serializable format
    result = []
    for _, row in merged_df.iterrows():
        timestamp = row['time_utc'].timestamp() * 1000  # Convert to milliseconds for JS
        
        point_data = {
            "timestamp": timestamp,
            "time": row['time_utc'].strftime('%Y-%m-%d %H:%M:%S'),
            "track_a": {
                "lat": float(row['lat_a']),
                "lon": float(row['lon_a']),
                "ele": float(row['ele_a']),
                "ele_ft": float(row['ele_a'] * M_TO_FT),
                "speeds": {
                    "vertical": float(row['vertical_speed_a']),
                    "horizontal": float(row['horizontal_speed_a']),
                    "speed_3d": float(row['speed_3d_a']),
                    "avg_10sec_vertical": float(row['avg_10sec_vertical_speed_a']),
                    "avg_10sec_horizontal": float(row['avg_10sec_horizontal_speed_a']),
                    "avg_10sec_3d": float(row['avg_10sec_speed_3d_a'])
                },
                "accelerations": {
                    "vertical": float(row['vertical_accel_a']),
                    "horizontal": float(row['horizontal_accel_a']),
                    "accel_3d": float(row['accel_3d_a'])
                }
            },
            "track_b": {
                "lat": float(row['lat_b']),
                "lon": float(row['lon_b']),
                "ele": float(row['ele_b']),
                "ele_ft": float(row['ele_b'] * M_TO_FT),
                "speeds": {
                    "vertical": float(row['vertical_speed_b']),
                    "horizontal": float(row['horizontal_speed_b']),
                    "speed_3d": float(row['speed_3d_b']),
                    "avg_10sec_vertical": float(row['avg_10sec_vertical_speed_b']),
                    "avg_10sec_horizontal": float(row['avg_10sec_horizontal_speed_b']),
                    "avg_10sec_3d": float(row['avg_10sec_speed_3d_b'])
                },
                "accelerations": {
                    "vertical": float(row['vertical_accel_b']),
                    "horizontal": float(row['horizontal_accel_b']),
                    "accel_3d": float(row['accel_3d_b'])
                }
            },
            "comparison": {
                "height_diff": float(row['height_diff']),
                "height_diff_ft": float(row['height_diff'] * M_TO_FT),
                "distance_3d": float(row['distance_3d'])
            }
        }
        result.append(point_data)
    
    return result

def format_for_table(merged_df):
    """Format data for table display."""
    # Ensure data is sorted by time
    merged_df = merged_df.sort_values('time_utc')
    
    # Convert to table format
    table_data = []
    for _, row in merged_df.iterrows():
        table_row = {
            "time": row['time_utc'].strftime('%Y-%m-%d %H:%M:%S'),
            "ele_a_ft": round(row['ele_a'] * M_TO_FT, 2),
            "ele_b_ft": round(row['ele_b'] * M_TO_FT, 2),
            "height_diff_ft": round(row['height_diff'] * M_TO_FT, 2),
            "vertical_speed_a": round(row.get('vertical_speed_a', 0), 3),
            "vertical_speed_b": round(row.get('vertical_speed_b', 0), 3),
            "horizontal_speed_a": round(row.get('horizontal_speed_a', 0), 3),
            "horizontal_speed_b": round(row.get('horizontal_speed_b', 0), 3),
            "speed_3d_a": round(row.get('speed_3d_a', 0), 3),
            "speed_3d_b": round(row.get('speed_3d_b', 0), 3),
            "vertical_accel_a": round(row.get('vertical_accel_a', 0), 3),
            "vertical_accel_b": round(row.get('vertical_accel_b', 0), 3),
            "horizontal_accel_a": round(row.get('horizontal_accel_a', 0), 3),
            "horizontal_accel_b": round(row.get('horizontal_accel_b', 0), 3),
            "accel_3d_a": round(row.get('accel_3d_a', 0), 3),
            "accel_3d_b": round(row.get('accel_3d_b', 0), 3),
            "distance_3d": round(row['distance_3d'], 3)
        }
        table_data.append(table_row)
    
    return table_data

def create_summary(merged_df):
    """Create summary data from merged dataframe."""
    summary = {
        "count": len(merged_df),
        "start_time": merged_df['time_utc'].min().strftime('%Y-%m-%d %H:%M:%S'),
        "end_time": merged_df['time_utc'].max().strftime('%Y-%m-%d %H:%M:%S'),
        "max_height_diff_ft": round(merged_df['height_diff'].max() * M_TO_FT, 2),
        "min_height_diff_ft": round(merged_df['height_diff'].min() * M_TO_FT, 2),
        "max_distance_3d": round(merged_df['distance_3d'].max(), 2)
    }
    return summary

def process_gpx_files(file_a_path, file_b_path, start_time=None, end_time=None, get_time_range_only=False):
    """
    2つのGPXファイルを処理して視覚化データを生成
    
    Parameters:
    ----------
    file_a_path : str
        1つ目のGPXファイルのパス
    file_b_path : str
        2つ目のGPXファイルのパス
    start_time : str, optional
        フィルタリングの開始時間
    end_time : str, optional
        フィルタリングの終了時間
    get_time_range_only : bool, optional
        時間範囲情報のみを返すかどうか
        
    Returns:
    -------
    dict
        処理結果またはタイムレンジ情報
    """
    logger.info(f"GPXファイル処理開始: {file_a_path}, {file_b_path}")
    
    try:
        # 常にタイムスタンプ修正を適用
        fix_timestamps = True
        
        # GPXファイルを解析
        track_a_data = parse_gpx(file_a_path, fix_timestamps=fix_timestamps)
        track_b_data = parse_gpx(file_b_path, fix_timestamps=fix_timestamps)
        
        if not track_a_data or not track_b_data:
            error_msg = "GPXファイルの解析に失敗したか、有効なポイントが見つかりませんでした。"
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        logger.info(f"解析結果: トラックA: {len(track_a_data)}ポイント, トラックB: {len(track_b_data)}ポイント")
        
        # データフレームに変換
        df_a = pd.DataFrame(track_a_data)
        df_b = pd.DataFrame(track_b_data)
        
        # 時間範囲情報のみ要求された場合
        if get_time_range_only:
            logger.info("時間範囲情報のみ取得します")
            time_range_info = get_time_range_info(df_a, df_b)
            logger.info(f"時間範囲情報: {time_range_info}")
            return time_range_info
        
        # 時間範囲でフィルタリング
        if start_time and end_time:
            logger.info(f"時間範囲でフィルタリング: {start_time} - {end_time}")
            
            # データフレームが空でないことを確認
            if df_a.empty or df_b.empty:
                logger.warning("フィルタリング前にデータフレームが空です")
                return {"visualization_data": [], "table_data": [], "summary": {}}
            
            df_a = filter_by_time_range(df_a, start_time, end_time)
            df_b = filter_by_time_range(df_b, start_time, end_time)
            
            # フィルタリング後のデータ量を確認
            logger.info(f"フィルタリング後: トラックA: {len(df_a)}ポイント, トラックB: {len(df_b)}ポイント")
            
            if df_a.empty or df_b.empty:
                logger.warning("フィルタリング後にデータフレームが空になりました")
                return {"visualization_data": [], "table_data": [], "summary": {}}
        
        # メトリクス計算
        logger.info("メトリクスの計算を開始")
        df_a = calculate_metrics(df_a)
        df_b = calculate_metrics(df_b)
        
        # データフレームの結合
        logger.info("データフレームを結合中")
        merged_df = merge_dataframes(df_a, df_b)
        
        if merged_df.empty:
            logger.warning("結合後のデータフレームが空です")
            return {"visualization_data": [], "table_data": [], "summary": {}}
        
        logger.info(f"結合後のデータポイント数: {len(merged_df)}")
        
        # 視覚化データの作成
        logger.info("視覚化データを作成中")
        visualization_data = format_for_visualization(merged_df)
        
        # テーブルデータの作成
        logger.info("テーブルデータを作成中")
        table_data = format_for_table(merged_df)
        
        # サマリーデータの作成
        logger.info("サマリーデータを作成中")
        summary = create_summary(merged_df)
        
        logger.info(f"GPXファイル処理完了: {len(visualization_data)}データポイント")
        
        return {
            "visualization_data": visualization_data,
            "table_data": table_data,
            "summary": summary
        }
        
    except Exception as e:
        logger.error(f"GPXファイル処理中にエラーが発生: {str(e)}", exc_info=True)
        raise

def get_time_range_info(df_a, df_b):
    """
    2つのデータフレームから時間範囲情報を取得
    
    Parameters:
    ----------
    df_a : DataFrame
        1つ目のGPXデータのデータフレーム
    df_b : DataFrame
        2つ目のGPXデータのデータフレーム
        
    Returns:
    -------
    dict
        時間範囲情報を含む辞書
    """
    # データフレームが空の場合の処理
    if df_a.empty or df_b.empty:
        logger.warning("データフレームが空です。有効な時間範囲を計算できません。")
        return {
            "time_range": {
                "start": "N/A",
                "end": "N/A"
            },
            "track_a": {
                "start": "N/A",
                "end": "N/A"
            },
            "track_b": {
                "start": "N/A",
                "end": "N/A"
            }
        }
    
    # 時間でソートせず、元の順序を使用
    df_a_first = df_a.iloc[0]['time_utc']
    df_a_last = df_a.iloc[-1]['time_utc']
    df_b_first = df_b.iloc[0]['time_utc']
    df_b_last = df_b.iloc[-1]['time_utc']
    
    # 実際のタイムスタンプをログに出力（デバッグ用）
    logger.info(f"トラックA - 開始: {df_a_first.strftime('%Y-%m-%d %H:%M:%S.%f%z')}")
    logger.info(f"トラックA - 終了: {df_a_last.strftime('%Y-%m-%d %H:%M:%S.%f%z')}")
    logger.info(f"トラックB - 開始: {df_b_first.strftime('%Y-%m-%d %H:%M:%S.%f%z')}")
    logger.info(f"トラックB - 終了: {df_b_last.strftime('%Y-%m-%d %H:%M:%S.%f%z')}")
    
    # 時間の順序をチェック (A, B両方のトラック)
    time_order_ok_a = df_a_first <= df_a_last
    time_order_ok_b = df_b_first <= df_b_last
    
    if not time_order_ok_a:
        logger.warning(f"トラックAの時間順序が逆転しています。開始: {df_a_first}, 終了: {df_a_last}")
    
    if not time_order_ok_b:
        logger.warning(f"トラックBの時間順序が逆転しています。開始: {df_b_first}, 終了: {df_b_last}")
    
    # 共通の時間範囲を計算 (元の順序を尊重)
    all_times = []
    
    # 開始時間 = 両方のトラックの開始時間のうち、早い方
    if time_order_ok_a and time_order_ok_b:
        all_times = [df_a_first, df_a_last, df_b_first, df_b_last]
        common_start = min(df_a_first, df_b_first)
        common_end = max(df_a_last, df_b_last)
    elif time_order_ok_a:
        # トラックBのみ時間逆転がある場合
        all_times = [df_a_first, df_a_last, df_b_first, df_b_last]
        common_start = min(df_a_first, df_b_last)  # B のみ逆転の場合
        common_end = max(df_a_last, df_b_first)
    elif time_order_ok_b:
        # トラックAのみ時間逆転がある場合
        all_times = [df_a_first, df_a_last, df_b_first, df_b_last]
        common_start = min(df_a_last, df_b_first)  # A のみ逆転の場合
        common_end = max(df_a_first, df_b_last)
    else:
        # 両方とも逆転している場合 (最も保守的な範囲)
        all_times = [df_a_first, df_a_last, df_b_first, df_b_last]
        common_start = min(all_times)
        common_end = max(all_times)
    
    # 実際の最小値と最大値をログに出力
    logger.info(f"時間範囲 - 開始: {common_start.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"時間範囲 - 終了: {common_end.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 時間範囲情報を返却（ミリ秒を含まない形式にフォーマット）
    # トラックの実際の開始・終了時刻を正確に返す
    return {
        "time_range": {
            "start": common_start.strftime('%Y-%m-%d %H:%M:%S'),
            "end": common_end.strftime('%Y-%m-%d %H:%M:%S')
        },
        "track_a": {
            "start": df_a_first.strftime('%Y-%m-%d %H:%M:%S'),
            "end": df_a_last.strftime('%Y-%m-%d %H:%M:%S') 
        },
        "track_b": {
            "start": df_b_first.strftime('%Y-%m-%d %H:%M:%S'),
            "end": df_b_last.strftime('%Y-%m-%d %H:%M:%S')
        }
    }

def calculate_speeds_and_accelerations(df):
    """速度と加速度を効率的に計算"""
    # 時間差を計算（秒）- time_utcカラムが存在するかチェック
    if 'time_utc' not in df.columns:
        logger.warning("時間カラム(time_utc)が見つかりません。速度と加速度の計算をスキップします。")
        return
    
    df['delta_t'] = df['time_utc'].diff().dt.total_seconds()
    
    # 最初の行は時間差が NaN になるため、2番目の値で補間
    if len(df) > 1:
        df.at[0, 'delta_t'] = df.at[1, 'delta_t']
    
    # カラムの存在確認を行い、存在する場合のみ計算を実行
    if 'ele_a' in df.columns and 'delta_t' in df.columns:
        # トラックAの速度計算
        df['delta_ele_a'] = df['ele_a'].diff()
        df['vertical_speed_a'] = df['delta_ele_a'] / df['delta_t']
        
        # 異常値の処理
        df['vertical_speed_a'] = df['vertical_speed_a'].fillna(0).clip(-20, 20)
        
        # 加速度の計算
        df['vertical_accel_a'] = df['vertical_speed_a'].diff() / df['delta_t']
        df['vertical_accel_a'] = df['vertical_accel_a'].fillna(0).clip(-10, 10)
    
    if 'ele_b' in df.columns and 'delta_t' in df.columns:
        # トラックBの速度計算
        df['delta_ele_b'] = df['ele_b'].diff()
        df['vertical_speed_b'] = df['delta_ele_b'] / df['delta_t']
        
        # 異常値の処理
        df['vertical_speed_b'] = df['vertical_speed_b'].fillna(0).clip(-20, 20)
        
        # 加速度の計算
        df['vertical_accel_b'] = df['vertical_speed_b'].diff() / df['delta_t']
        df['vertical_accel_b'] = df['vertical_accel_b'].fillna(0).clip(-10, 10)
    
    # 不要な中間列を削除
    cols_to_drop = []
    for col in ['delta_ele_a', 'delta_ele_b']:
        if col in df.columns:
            cols_to_drop.append(col)
    
    if cols_to_drop:
        df.drop(cols_to_drop, axis=1, inplace=True)

class GPXProcessor:
    """GPXファイルを処理するクラス"""
    
    def __init__(self):
        """初期化"""
        pass
    
    def process_gpx_files(self, file_a_path, file_b_path):
        """2つのGPXファイルを処理し、比較データを生成"""
        
        # GPXファイルの解析
        track_a = self.parse_gpx(file_a_path)
        track_b = self.parse_gpx(file_b_path)
        
        # 時系列データが連続しているか確認し、日付が変わるべき箇所で修正
        track_a = self.fix_date_crossover(track_a)
        track_b = self.fix_date_crossover(track_b)
        
        # トラックポイントをDataFrameに変換
        df_a = self.track_to_dataframe(track_a)
        df_b = self.track_to_dataframe(track_b)
        
        # 時間の基準を合わせる
        merged_data = self.align_timestamps(df_a, df_b)
        
        # 追加データの計算
        result = self.calculate_additional_data(merged_data)
        
        return result
    
    def fix_date_crossover(self, track):
        """時系列が日付を跨ぐ際に日付情報を修正する"""
        if not track.segments or not track.segments[0].points:
            return track
        
        points = track.segments[0].points
        
        # ポイントが少なすぎる場合は何もしない
        if len(points) < 2:
            return track
        
        # 前のポイントとの時間差を確認し、大幅に時間が巻き戻っている場合を検出
        for i in range(1, len(points)):
            time_diff = points[i].time - points[i-1].time
            
            # 時間が大幅に巻き戻った場合（例：23:59から00:01など）
            if time_diff.total_seconds() < -12 * 3600:  # 12時間以上巻き戻った場合
                # 日付を1日進める
                for j in range(i, len(points)):
                    points[j].time = points[j].time + timedelta(days=1)
                logger.info(f"日付の跨ぎを検出し修正しました: {points[i-1].time} -> {points[i].time}")
        
        return track
    
    def parse_gpx(self, file_path):
        """GPXファイルを解析してトラックデータを取得"""
        with open(file_path, 'r') as gpx_file:
            gpx = gpxpy.parse(gpx_file)
            
            if gpx.tracks:
                return gpx.tracks[0]
            else:
                raise ValueError(f"トラックデータが見つかりません: {file_path}")
    
    def track_to_dataframe(self, track):
        """トラックデータをDataFrameに変換"""
        points = []
        for segment in track.segments:
            for point in segment.points:
                points.append({
                    'lat': point.latitude,
                    'lon': point.longitude,
                    'ele': point.elevation,
                    'time_utc': point.time
                })
        return pd.DataFrame(points)
    
    def align_timestamps(self, df_a, df_b):
        """時間の基準を合わせる"""
        # 共通の時間範囲を見つける
        common_start = max(df_a['time_utc'].min(), df_b['time_utc'].min())
        common_end = min(df_a['time_utc'].max(), df_b['time_utc'].max())
        
        # 時間範囲を調整
        df_a = df_a[(df_a['time_utc'] >= common_start) & (df_a['time_utc'] <= common_end)]
        df_b = df_b[(df_b['time_utc'] >= common_start) & (df_b['time_utc'] <= common_end)]
        
        return df_a, df_b
    
    def calculate_additional_data(self, merged_data):
        """追加データの計算"""
        # ここに追加データの計算ロジックを実装
        return merged_data

    def process_gpx_file(self, gpx_file, start_time_str=None, end_time_str=None):
        """Process a single GPX file and return processed dataframe."""
        # Parse GPX file
        try:
            # 外部の日付修正関数を利用（fix_timestamps=True）
            points = parse_gpx(gpx_file, fix_timestamps=True)
            logger.info(f"外部のparse_gpx関数を使用 ({gpx_file}): 修正済みのデータ")
            
            # 時間範囲をログに出力（デバッグ用）
            if points and len(points) > 0:
                first_ts = points[0]['time_utc'].strftime('%Y-%m-%d %H:%M:%S%z')
                last_ts = points[-1]['time_utc'].strftime('%Y-%m-%d %H:%M:%S%z')
                logger.info(f"GPXデータ範囲: {first_ts} - {last_ts}")
        except Exception as e:
            logger.warning(f"外部のparse_gpx関数でエラー ({str(e)})。代わりにクラス内の実装を使用します。")
            # 従来のクラス内実装をフォールバックとして使用
            track = self.parse_gpx(gpx_file)
            # 日付跨ぎを修正
            track = self.fix_date_crossover(track)
            
            # トラックをデータフレームに変換
            df = self.track_to_dataframe(track)
            return df
            
        # Calculate metrics
        df = pd.DataFrame(points)
        
        # Filter by time range if provided
        if start_time_str and end_time_str:
            filtered_df = filter_by_time_range(df, start_time_str, end_time_str)
            return filtered_df
        else:
            return df

    def filter_by_time_range(self, df, start_time_str, end_time_str):
        """Filter data by time range (UTC)."""
        # Parse start and end times in UTC
        start_time = datetime.datetime.strptime(start_time_str, '%Y-%m-%d %H:%M:%S')
        start_time = pytz.UTC.localize(start_time)
        
        end_time = datetime.datetime.strptime(end_time_str, '%Y-%m-%d %H:%M:%S')
        end_time = pytz.UTC.localize(end_time)
        
        # Filter by complete timestamp (UTC)
        filtered_df = df[(df['time_utc'] >= start_time) & (df['time_utc'] <= end_time)]
        
        return filtered_df

    def calculate_metrics(self, points):
        """Calculate vertical and horizontal speed, acceleration, and 3D metrics."""
        df = pd.DataFrame(points)
        
        # Sort by time to ensure correct calculation
        df = df.sort_values('time_utc')
        
        # Calculate time differences in seconds
        df['time_diff'] = df['time_utc'].diff().dt.total_seconds()
        
        # Calculate position differences
        df['ele_diff'] = df['ele'].diff()
        df['lat_diff'] = df['lat'].diff()
        df['lon_diff'] = df['lon'].diff()
        
        # Calculate horizontal distance between consecutive points
        df['horizontal_distance'] = df.apply(
            lambda row: haversine_distance(
                row['lat'] - row['lat_diff'] if not pd.isna(row['lat_diff']) else row['lat'],
                row['lon'] - row['lon_diff'] if not pd.isna(row['lon_diff']) else row['lon'],
                row['lat'],
                row['lon']
            ) if not pd.isna(row['lat_diff']) else 0,
            axis=1
        )
        
        # Calculate 3D distance between consecutive points
        df['distance_3d'] = df.apply(
            lambda row: calculate_3d_distance(
                row['lat'] - row['lat_diff'] if not pd.isna(row['lat_diff']) else row['lat'],
                row['lon'] - row['lon_diff'] if not pd.isna(row['lon_diff']) else row['lon'],
                row['ele'] - row['ele_diff'] if not pd.isna(row['ele_diff']) else row['ele'],
                row['lat'],
                row['lon'],
                row['ele']
            ) if not pd.isna(row['lat_diff']) else 0,
            axis=1
        )
        
        # Calculate various speeds (m/s)
        df['vertical_speed'] = df.apply(
            lambda row: row['ele_diff'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
            axis=1
        )
        
        df['horizontal_speed'] = df.apply(
            lambda row: row['horizontal_distance'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
            axis=1
        )
        
        df['speed_3d'] = df.apply(
            lambda row: row['distance_3d'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
            axis=1
        )
        
        # Calculate accelerations (m/s^2)
        df['vertical_speed_diff'] = df['vertical_speed'].diff()
        df['horizontal_speed_diff'] = df['horizontal_speed'].diff()
        df['speed_3d_diff'] = df['speed_3d'].diff()
        
        df['vertical_accel'] = df.apply(
            lambda row: row['vertical_speed_diff'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
            axis=1
        )
        
        df['horizontal_accel'] = df.apply(
            lambda row: row['horizontal_speed_diff'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
            axis=1
        )
        
        df['accel_3d'] = df.apply(
            lambda row: row['speed_3d_diff'] / row['time_diff'] if row['time_diff'] > 0 else 0, 
            axis=1
        )
        
        # Calculate 10-second moving averages
        # 修正: rolling() メソッドのon='time_utc'パラメータを削除し、
        # 代わりに一時的にtime_utcをインデックスとして設定
        window_size = 10  # seconds
        
        # インデックスを一時的に設定
        df_temp = df.set_index('time_utc')
        
        # 10秒間の移動平均を計算
        df['avg_10sec_vertical_speed'] = df_temp['vertical_speed'].rolling(
            window=pd.Timedelta(seconds=window_size)
        ).mean().reset_index(drop=True)
        
        df['avg_10sec_horizontal_speed'] = df_temp['horizontal_speed'].rolling(
            window=pd.Timedelta(seconds=window_size)
        ).mean().reset_index(drop=True)
        
        df['avg_10sec_speed_3d'] = df_temp['speed_3d'].rolling(
            window=pd.Timedelta(seconds=window_size)
        ).mean().reset_index(drop=True)
        
        # NaN値を0で埋める
        df = df.fillna(0)
        
        return df

    def process_gpx_files(self, file_a_path, file_b_path, start_time=None, end_time=None, get_time_range_only=False):
        """Process two GPX files and return processed data."""
        logger.info(f"GPXファイル処理開始: {file_a_path}, {file_b_path}")
        logger.info(f"時刻範囲: {start_time} - {end_time}")
        
        # Process both files
        logger.info(f"file_a_path のタイプ: {type(file_a_path)}, 値: {file_a_path}")
        logger.info(f"file_b_path のタイプ: {type(file_b_path)}, 値: {file_b_path}")
        
        df_a = self.process_gpx_file(file_a_path)
        df_b = self.process_gpx_file(file_b_path)
        
        # Log time ranges before processing
        logger.info(f"ファイルA時刻範囲（処理前）: {df_a['time_utc'].min()} - {df_a['time_utc'].max()}")
        logger.info(f"ファイルB時刻範囲（処理前）: {df_b['time_utc'].min()} - {df_b['time_utc'].max()}")
        
        # 実際のデータ範囲を確認
        actual_start_a = df_a['time_utc'].min()
        actual_end_a = df_a['time_utc'].max()
        actual_start_b = df_b['time_utc'].min()
        actual_end_b = df_b['time_utc'].max()
        
        # データ全体の時間範囲を計算
        data_start = min(actual_start_a, actual_start_b)
        data_end = max(actual_end_a, actual_end_b)
        
        # データの時間差を計算して妥当性を確認
        time_span_hours = (data_end - data_start).total_seconds() / 3600
        logger.info(f"データ全体の時間範囲: {data_start} - {data_end} (約{time_span_hours:.2f}時間)")
        
        # 時間範囲が不自然に大きい場合（例：48時間以上）は警告
        if time_span_hours > 48:
            logger.warning(f"時間範囲が不自然に大きい: {time_span_hours:.2f}時間。日付跨ぎの修正が必要かもしれません。")
        
        # Find common time range
        if get_time_range_only:
            # 以下のデバッグログを追加
            logger.info(f"時間範囲の生の値: A={actual_start_a}～{actual_end_a}, B={actual_start_b}～{actual_end_b}")
            
            # 共通の時間範囲を計算
            # 開始時間は両方のうち遅い方
            common_start = max(actual_start_a, actual_start_b)
            
            # 終了時間は両方のうち早い方
            # ただし、日付跨ぎを考慮して、終了時間が開始時間より前の場合は
            # 終了時間の日付を1日進める
            common_end = min(actual_end_a, actual_end_b)
            if common_end < common_start:
                logger.info("開始時間 > 終了時間の状態を検出。日付跨ぎとして終了時間を調整します")
                # 終了時間の日付を1日進める
                try:
                    common_end = common_end + timedelta(days=1)
                    logger.info(f"修正後の終了時間: {common_end}")
                except Exception as e:
                    logger.error(f"終了時間の修正に失敗: {e}")
                
            # 共通範囲の時間差（時間単位）
            common_span_hours = (common_end - common_start).total_seconds() / 3600
            logger.info(f"共通時刻範囲: {common_start} - {common_end} (約{common_span_hours:.2f}時間)")
            
            # 深夜をまたぐデータかどうかを判定
            crosses_midnight = False
            if actual_start_a.hour > 20 and actual_end_a.hour < 4:
                logger.info("ファイルAは深夜をまたぐデータです")
                crosses_midnight = True
            if actual_start_b.hour > 20 and actual_end_b.hour < 4:
                logger.info("ファイルBは深夜をまたぐデータです")
                crosses_midnight = True
            
            # 表示用のデバッグ出力
            if crosses_midnight:
                logger.warning(f"深夜をまたぐデータを検出しました: {common_start.hour}時 → {common_end.hour}時")
            
            # 時間範囲情報をフォーマット
            time_range_result = {
                "time_range": {
                    "start": common_start.strftime('%Y-%m-%d %H:%M:%S'),
                    "end": common_end.strftime('%Y-%m-%d %H:%M:%S')
                },
                "track_a": {
                    "start": actual_start_a.strftime('%Y-%m-%d %H:%M:%S'),
                    "end": actual_end_a.strftime('%Y-%m-%d %H:%M:%S')
                },
                "track_b": {
                    "start": actual_start_b.strftime('%Y-%m-%d %H:%M:%S'),
                    "end": actual_end_b.strftime('%Y-%m-%d %H:%M:%S')
                }
            }
            
            # 結果をログ出力
            logger.info(f"返却する時間範囲情報: {time_range_result}")
            
            return time_range_result
        
        # Filter by time range if provided
        if start_time and end_time:
            df_a = self.filter_by_time_range(df_a, start_time, end_time)
            df_b = self.filter_by_time_range(df_b, start_time, end_time)
        
        # Merge dataframes
        merged_df = merge_dataframes(df_a, df_b)
        
        # Format for visualization
        visualization_data = format_for_visualization(merged_df)
        
        # Prepare table data
        table_data = format_for_table(merged_df)
        
        # 要約データの作成
        summary = create_summary(merged_df)
        
        return {
            "visualization_data": visualization_data,
            "table_data": table_data,
            "summary": summary
        } 