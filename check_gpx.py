#!/usr/bin/env python3
import gpxpy
import pytz
from datetime import timedelta

def check_gpx(file_path):
    """GPXファイルのタイムスタンプを確認する"""
    print(f"\n[ファイル: {file_path}]")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        gpx = gpxpy.parse(f)
    
    # メタデータの時間を表示
    if gpx.time:
        print(f"メタデータ時間: {gpx.time.strftime('%Y-%m-%d %H:%M:%S %z')}")
    
    # トラックポイントを抽出
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                # 時間と標高があるポイントのみ処理
                if point.time and point.elevation is not None:
                    time_utc = point.time
                    if time_utc.tzinfo is None:
                        time_utc = pytz.UTC.localize(time_utc)
                    else:
                        time_utc = time_utc.astimezone(pytz.UTC)
                    
                    points.append({
                        'lat': point.latitude,
                        'lon': point.longitude,
                        'ele': point.elevation,
                        'time_utc': time_utc
                    })
    
    # 元の順序（ファイルに記録された順）でポイントを表示
    print("\n-- 元の順序でのポイント --")
    print(f"ポイント数: {len(points)}")
    print(f"最初の10ポイント:")
    for i in range(min(10, len(points))):
        print(f"  {i+1}: {points[i]['time_utc'].strftime('%Y-%m-%d %H:%M:%S')}")
    
    print(f"\n最後の10ポイント:")
    for i in range(max(0, len(points)-10), len(points)):
        print(f"  {i+1}: {points[i]['time_utc'].strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 時間でソート
    sorted_points = sorted(points, key=lambda p: p['time_utc'])
    
    # ソート後のポイントを表示
    print("\n-- 時間でソート後のポイント --")
    print(f"最初の10ポイント:")
    for i in range(min(10, len(sorted_points))):
        print(f"  {i+1}: {sorted_points[i]['time_utc'].strftime('%Y-%m-%d %H:%M:%S')}")
    
    print(f"\n最後の10ポイント:")
    for i in range(max(0, len(sorted_points)-10), len(sorted_points)):
        print(f"  {i+1}: {sorted_points[i]['time_utc'].strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    # サンプルファイルを確認
    check_gpx("backend/app/samples/flight1_6.gpx")

# 2つ目のGPXファイルも確認
with open('./backend/app/samples/flight1_17.gpx', 'r') as f:
    gpx2 = gpxpy.parse(f)

# メタデータ時間の確認
print('\nFile 2 Metadata time:', gpx2.time)

# 最初のポイントの時間を確認
first_point2 = gpx2.tracks[0].segments[0].points[0]
print('File 2 First point time:', first_point2.time)
print('File 2 Timezone info:', first_point2.time.tzinfo)

# 最後のポイントの時間を確認
last_point2 = gpx2.tracks[0].segments[0].points[-1]
print('File 2 Last point time:', last_point2.time)

# 時間フォーマットを確認
print('File 2 First point formatted:', first_point2.time.strftime('%Y-%m-%d %H:%M:%S%z'))
print('File 2 Last point formatted:', last_point2.time.strftime('%Y-%m-%d %H:%M:%S%z')) 