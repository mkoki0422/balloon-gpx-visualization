"""時間処理ユーティリティ関数のテスト"""
import unittest
from datetime import datetime, timezone, timedelta

from app.utils.time_utils import (
    ensure_utc,
    format_timestamp,
    parse_timestamp,
    calculate_time_difference,
    get_time_range
)

class TestTimeUtils(unittest.TestCase):
    def setUp(self):
        # テスト用の時刻データを準備
        self.naive_dt = datetime(2025, 4, 4, 23, 44, 14)
        self.utc_dt = datetime(2025, 4, 4, 23, 44, 14, tzinfo=timezone.utc)
        self.jst_dt = datetime(2025, 4, 5, 8, 44, 14, tzinfo=timezone(timedelta(hours=9)))  # JST (+09:00)

    def test_ensure_utc(self):
        """UTCタイムゾーン変換のテスト"""
        # タイムゾーン情報がない場合
        result = ensure_utc(self.naive_dt)
        self.assertEqual(result.tzinfo, timezone.utc)
        self.assertEqual(result.hour, self.naive_dt.hour)
        
        # 既にUTCの場合
        result = ensure_utc(self.utc_dt)
        self.assertEqual(result, self.utc_dt)
        
        # JSTからUTCへの変換
        result = ensure_utc(self.jst_dt)
        self.assertEqual(result.tzinfo, timezone.utc)
        self.assertEqual(result.hour, 23)  # JST 8:44 -> UTC 23:44

    def test_format_timestamp(self):
        """タイムスタンプのフォーマットテスト"""
        # UTCの時刻をフォーマット
        result = format_timestamp(self.utc_dt)
        expected = "2025-04-04T23:44:14.000000Z"
        self.assertEqual(result, expected)
        
        # ミリ秒を含む時刻をフォーマット
        dt_with_ms = datetime(2025, 4, 4, 23, 44, 14, 123456, tzinfo=timezone.utc)
        result = format_timestamp(dt_with_ms)
        expected = "2025-04-04T23:44:14.123456Z"
        self.assertEqual(result, expected)

    def test_parse_timestamp(self):
        """タイムスタンプのパースのテスト"""
        # ミリ秒ありの場合
        timestamp1 = "2025-04-04T23:44:14.123Z"
        result1 = parse_timestamp(timestamp1)
        self.assertEqual(result1.year, 2025)
        self.assertEqual(result1.month, 4)
        self.assertEqual(result1.microsecond, 123000)
        
        # ミリ秒なしの場合
        timestamp2 = "2025-04-04T23:44:14Z"
        result2 = parse_timestamp(timestamp2)
        self.assertEqual(result2.year, 2025)
        self.assertEqual(result2.month, 4)
        self.assertEqual(result2.microsecond, 0)
        
        # 無効なフォーマットの場合
        result3 = parse_timestamp("invalid")
        self.assertIsNone(result3)

    def test_calculate_time_difference(self):
        """時間差計算のテスト"""
        # 同じ時刻の場合
        diff1 = calculate_time_difference(self.utc_dt, self.utc_dt)
        self.assertEqual(diff1, 0)
        
        # 1時間後の場合
        later = self.utc_dt + timedelta(hours=1)
        diff2 = calculate_time_difference(self.utc_dt, later)
        self.assertEqual(diff2, 3600)  # 3600秒 = 1時間
        
        # タイムゾーンが異なる場合
        diff3 = calculate_time_difference(self.utc_dt, self.jst_dt)
        self.assertEqual(diff3, 0)  # 同じ時刻を示している

    def test_get_time_range(self):
        """時間範囲取得のテスト"""
        # 空のリストの場合
        start, end = get_time_range([])
        self.assertIsNone(start)
        self.assertIsNone(end)
        
        # 複数の時刻がある場合
        times = [
            self.utc_dt,
            self.utc_dt + timedelta(hours=1),
            self.utc_dt - timedelta(hours=1)
        ]
        start, end = get_time_range(times)
        self.assertEqual(start, min(times))
        self.assertEqual(end, max(times))
        
        # タイムゾーンが混在する場合
        times = [self.utc_dt, self.jst_dt]
        start, end = get_time_range(times)
        self.assertEqual(start.tzinfo, timezone.utc)
        self.assertEqual(end.tzinfo, timezone.utc)

if __name__ == '__main__':
    unittest.main() 