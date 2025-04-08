"""GPXユーティリティ関数のテスト"""
import unittest
import math
from datetime import datetime
import xml.etree.ElementTree as ET
import os
from pathlib import Path

from app.utils.gpx_utils import (
    calculate_distance,
    calculate_speed,
    calculate_acceleration,
    parse_gpx_time,
    meters_to_feet,
    smooth_data,
    interpolate_position
)

class TestGpxUtils(unittest.TestCase):
    def setUp(self):
        # サンプルGPXファイルのパス
        self.samples_dir = Path(__file__).parent.parent / 'samples'
        self.gpx_file = self.samples_dir / 'flight1_6.gpx'
        
        # GPXファイルから最初の数ポイントを読み込む
        tree = ET.parse(self.gpx_file)
        root = tree.getroot()
        ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
        
        self.track_points = []
        for trkpt in root.findall('.//gpx:trkpt', ns)[:5]:  # 最初の5ポイントのみ
            lat = float(trkpt.get('lat'))
            lon = float(trkpt.get('lon'))
            ele = float(trkpt.find('gpx:ele', ns).text)
            time = trkpt.find('gpx:time', ns).text
            self.track_points.append({
                'lat': lat,
                'lon': lon,
                'ele': ele,
                'time': time
            })

    def test_calculate_distance(self):
        """2点間の距離計算のテスト"""
        # 東京タワーと東京スカイツリーの距離をテスト（約8.2km）
        tokyo_tower = (35.6586, 139.7454)
        skytree = (35.7101, 139.8107)
        distance = calculate_distance(
            tokyo_tower[0], tokyo_tower[1],
            skytree[0], skytree[1]
        )
        self.assertAlmostEqual(distance, 8220, delta=100)  # 誤差100m以内

        # 同じ点の場合
        distance = calculate_distance(
            tokyo_tower[0], tokyo_tower[1],
            tokyo_tower[0], tokyo_tower[1]
        )
        self.assertEqual(distance, 0)

        # サンプルデータの2点間の距離
        p1 = self.track_points[0]
        p2 = self.track_points[1]
        distance = calculate_distance(
            p1['lat'], p1['lon'],
            p2['lat'], p2['lon']
        )
        self.assertGreaterEqual(distance, 0)

    def test_calculate_speed(self):
        """速度計算のテスト"""
        # 100mを10秒で移動した場合のテスト
        speed = calculate_speed(100, 10)
        self.assertEqual(speed, 10)  # 10 m/s
        
        # 時間差0の場合のテスト
        speed = calculate_speed(100, 0)
        self.assertEqual(speed, 0)

    def test_calculate_acceleration(self):
        """加速度計算のテスト"""
        # 0 m/sから10 m/sまで2秒で加速した場合のテスト
        accel = calculate_acceleration(0, 10, 2)
        self.assertEqual(accel, 5)  # 5 m/s²
        
        # 時間差0の場合のテスト
        accel = calculate_acceleration(0, 10, 0)
        self.assertEqual(accel, 0)

    def test_parse_gpx_time(self):
        """GPXタイムスタンプのパースのテスト"""
        # ミリ秒ありの場合
        time1 = "2025-04-04T23:44:14.000Z"
        dt1 = parse_gpx_time(time1)
        self.assertEqual(dt1.year, 2025)
        self.assertEqual(dt1.month, 4)
        self.assertEqual(dt1.day, 4)
        self.assertEqual(dt1.hour, 23)
        self.assertEqual(dt1.minute, 44)
        self.assertEqual(dt1.second, 14)
        
        # ミリ秒なしの場合
        time2 = "2025-04-04T23:44:14Z"
        dt2 = parse_gpx_time(time2)
        self.assertEqual(dt2.year, 2025)
        self.assertEqual(dt2.month, 4)
        self.assertEqual(dt2.day, 4)
        self.assertEqual(dt2.hour, 23)
        self.assertEqual(dt2.minute, 44)
        self.assertEqual(dt2.second, 14)

    def test_meters_to_feet(self):
        """メートルからフィートへの変換テスト"""
        feet = meters_to_feet(1)
        self.assertAlmostEqual(feet, 3.28084)
        
        feet = meters_to_feet(100)
        self.assertAlmostEqual(feet, 328.084)

    def test_smooth_data(self):
        """データスムージングのテスト"""
        data = [1, 2, 3, 4, 5]
        smoothed = smooth_data(data, window_size=3)
        self.assertEqual(len(smoothed), len(data))
        self.assertAlmostEqual(smoothed[2], 3)  # 中央値は変化なし
        
        # データが少ない場合
        data = [1, 2]
        smoothed = smooth_data(data, window_size=3)
        self.assertEqual(smoothed, data)

    def test_interpolate_position(self):
        """位置補間のテスト"""
        pos1 = (0, 0, 0)
        pos2 = (10, 10, 10)
        
        # 中間点のテスト
        mid = interpolate_position(pos1, pos2, 0.5)
        self.assertEqual(mid, (5, 5, 5))
        
        # 始点のテスト
        start = interpolate_position(pos1, pos2, 0)
        self.assertEqual(start, pos1)
        
        # 終点のテスト
        end = interpolate_position(pos1, pos2, 1)
        self.assertEqual(end, pos2)

    def test_with_sample_data(self):
        """サンプルGPXファイルを使用したテスト"""
        # 連続する2点間の距離を計算
        p1 = self.track_points[0]
        p2 = self.track_points[1]
        distance = calculate_distance(p1['lat'], p1['lon'], p2['lat'], p2['lon'])
        
        # 時間差を計算
        t1 = parse_gpx_time(p1['time'])
        t2 = parse_gpx_time(p2['time'])
        time_diff = (t2 - t1).total_seconds()
        
        # 速度を計算
        speed = calculate_speed(distance, time_diff)
        
        # 基本的な検証
        self.assertGreaterEqual(distance, 0)
        self.assertGreaterEqual(time_diff, 0)
        self.assertGreaterEqual(speed, 0)

if __name__ == '__main__':
    unittest.main() 