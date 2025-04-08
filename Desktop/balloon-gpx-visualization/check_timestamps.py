#!/usr/bin/env python3
import gpxpy
import pytz
from datetime import timedelta

def check_gpx(file_path):
    """GPXファイルのタイムスタンプを確認する"""
    print(f"\n[ファイル: {file_path}]")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        gpx = gpxpy.parse(f)
    
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
    
        
    # 最初と最後のポイントの時間を表示
    if points:
        first_time = points[0]['time_utc']
        last_time = points[-1]['time_utc']
        
        print(f"最初のポイント: {first_time.strftime('%Y-%m-%d %H:%M:%S %z')}")
        print(f"最後のポイント: {last_time.strftime('%Y-%m-%d %H:%M:%S %z')}")
        
        # 時間の逆転があるかチェック
        if first_time > last_time:
            print(f"⚠️ 時間の逆転を検出: 最初 > 最後")
            print(f"時間差: {(first_time - last_time).total_seconds() / 3600:.2f} 時間")
        else:
            print(f"時間順序は正常です")
            print(f"経過時間: {(last_time - first_time).total_seconds() / 60:.2f} 分")
        
        # 日付跨ぎの可能性を確認
        has_early_morning = False
        has_late_night = False
        
        for p in points:
            t = p['time_utc']
            if t.hour < 4:  # 早朝
                has_early_morning = True
            if t.hour >= 21:  # 夜遅く
                has_late_night = True
        
        if has_early_morning and has_late_night:
            print(f"🔄 日付跨ぎの可能性あり (早朝と夜遅くのデータが両方存在)")
        
        # ポイント間の時間差が負になる箇所を検出
        time_reversals = 0
        max_reversal = timedelta(seconds=0)
        
        for i in range(1, len(points)):
            time_diff = points[i]['time_utc'] - points[i-1]['time_utc']
            if time_diff.total_seconds() < 0:
                time_reversals += 1
                if abs(time_diff) > abs(max_reversal):
                    max_reversal = time_diff
        
        if time_reversals > 0:
            print(f"⏱️ ポイント間の時間逆転: {time_reversals}回")
            print(f"最大の逆転: {abs(max_reversal.total_seconds() / 60):.2f} 分")
    else:
        print("ポイントが見つかりませんでした")

if __name__ == "__main__":
    # サンプルファイルを確認
    check_gpx("backend/app/samples/flight1_6.gpx")
    check_gpx("backend/app/samples/flight1_17.gpx") 