#!/usr/bin/env python3
import gpxpy
import pytz
from datetime import datetime

def check_gpx_file(file_path):
    """GPXファイルの内容を確認する"""
    print(f"Checking GPX file: {file_path}")
    
    try:
        with open(file_path, 'r') as f:
            gpx = gpxpy.parse(f)
        
        print(f"Metadata time: {gpx.time}")
        print(f"Number of tracks: {len(gpx.tracks)}")
        
        for track_idx, track in enumerate(gpx.tracks):
            print(f"\nTrack {track_idx + 1}:")
            print(f"  Name: {track.name}")
            print(f"  Description: {track.description}")
            print(f"  Number of segments: {len(track.segments)}")
            
            for segment_idx, segment in enumerate(track.segments):
                print(f"\n  Segment {segment_idx + 1}:")
                print(f"    Number of points: {len(segment.points)}")
                
                if len(segment.points) > 0:
                    # 最初と最後のポイントを表示
                    first_point = segment.points[0]
                    last_point = segment.points[-1]
                    
                    print(f"\n    First point:")
                    print(f"      Time: {first_point.time} (Timezone: {first_point.time.tzinfo})")
                    print(f"      Lat/Lon: {first_point.latitude}, {first_point.longitude}")
                    print(f"      Elevation: {first_point.elevation}")
                    
                    print(f"\n    Last point:")
                    print(f"      Time: {last_point.time} (Timezone: {last_point.time.tzinfo})")
                    print(f"      Lat/Lon: {last_point.latitude}, {last_point.longitude}")
                    print(f"      Elevation: {last_point.elevation}")
                    
                    # 特定の時間帯のポイントをチェック
                    middle_idx = len(segment.points) // 2
                    middle_point = segment.points[middle_idx]
                    
                    print(f"\n    Middle point (index {middle_idx}):")
                    print(f"      Time: {middle_point.time} (Timezone: {middle_point.time.tzinfo})")
                    print(f"      Lat/Lon: {middle_point.latitude}, {middle_point.longitude}")
                    print(f"      Elevation: {middle_point.elevation}")
    
    except Exception as e:
        print(f"Error parsing GPX file: {e}")

# 両方のサンプルGPXファイルをチェック
check_gpx_file('/app/app/samples/flight1_6.gpx')
print("\n" + "="*50 + "\n")
check_gpx_file('/app/app/samples/flight1_17.gpx') 