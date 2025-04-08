"""時間処理のためのユーティリティ関数"""
from datetime import datetime, timezone
from typing import Optional

def ensure_utc(dt: datetime) -> datetime:
    """
    datetimeオブジェクトをUTCに変換
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def format_timestamp(dt: datetime) -> str:
    """
    datetimeオブジェクトをISO 8601形式の文字列に変換
    """
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

def parse_timestamp(timestamp: str) -> Optional[datetime]:
    """
    ISO 8601形式の文字列をdatetimeオブジェクトに変換
    """
    try:
        dt = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S.%fZ")
        return ensure_utc(dt)
    except ValueError:
        try:
            dt = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ")
            return ensure_utc(dt)
        except ValueError:
            return None

def calculate_time_difference(time1: datetime, time2: datetime) -> float:
    """
    2つの時刻の差を秒単位で計算
    """
    time1_utc = ensure_utc(time1)
    time2_utc = ensure_utc(time2)
    return (time2_utc - time1_utc).total_seconds()

def get_time_range(timestamps: list[datetime]) -> tuple[datetime, datetime]:
    """
    タイムスタンプリストから時間範囲を取得
    """
    if not timestamps:
        return None, None
    
    utc_timestamps = [ensure_utc(dt) for dt in timestamps]
    return min(utc_timestamps), max(utc_timestamps) 