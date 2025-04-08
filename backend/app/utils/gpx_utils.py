"""GPXデータ処理のためのユーティリティ関数"""
import math
from datetime import datetime
from typing import Dict, List, Tuple, Optional

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    2点間の距離をメートル単位で計算（Haversine公式）
    """
    R = 6371000  # 地球の半径（メートル）
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi/2) * math.sin(delta_phi/2) + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda/2) * math.sin(delta_lambda/2)
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_speed(distance: float, time_diff: float) -> float:
    """
    速度を計算（m/s）
    """
    if time_diff == 0:
        return 0
    return distance / time_diff

def calculate_acceleration(speed1: float, speed2: float, time_diff: float) -> float:
    """
    加速度を計算（m/s²）
    """
    if time_diff == 0:
        return 0
    return (speed2 - speed1) / time_diff

def parse_gpx_time(time_str: str) -> datetime:
    """
    GPXのタイムスタンプをdatetimeオブジェクトに変換
    """
    try:
        return datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%SZ")

def meters_to_feet(meters: float) -> float:
    """
    メートルをフィートに変換
    """
    return meters * 3.28084

def smooth_data(data: List[float], window_size: int = 5) -> List[float]:
    """
    移動平均によるデータのスムージング
    """
    if len(data) < window_size:
        return data
        
    smoothed = []
    for i in range(len(data)):
        start = max(0, i - window_size // 2)
        end = min(len(data), i + window_size // 2 + 1)
        window = data[start:end]
        smoothed.append(sum(window) / len(window))
    
    return smoothed

def interpolate_position(pos1: Tuple[float, float, float], 
                        pos2: Tuple[float, float, float], 
                        ratio: float) -> Tuple[float, float, float]:
    """
    2点間の位置を補間
    """
    lat = pos1[0] + (pos2[0] - pos1[0]) * ratio
    lon = pos1[1] + (pos2[1] - pos1[1]) * ratio
    ele = pos1[2] + (pos2[2] - pos1[2]) * ratio
    return (lat, lon, ele) 