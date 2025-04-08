#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GPXファイルの日付を修正するスクリプト

日付が未来の場合、現在の日付に修正します。
"""

import os
import sys
import argparse
import re
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

# XML名前空間
namespaces = {
    'gpx': 'http://www.topografix.com/GPX/1/1',
    'xsi': 'http://www.w3.org/2001/XMLSchema-instance',
}

def parse_args():
    """コマンドライン引数の解析"""
    parser = argparse.ArgumentParser(description='GPXファイルの日付を修正')
    parser.add_argument('--force', action='store_true', help='強制的に現在の日付に修正する')
    parser.add_argument('files', nargs='*', help='処理するGPXファイル')
    return parser.parse_args()

def fix_gpx_dates(file_path, force=False):
    """GPXファイルの日付を修正"""
    print(f"処理開始: {file_path}")
    
    try:
        # XMLの解析
        ET.register_namespace('', 'http://www.topografix.com/GPX/1/1')
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # 現在の日付を取得
        now = datetime.now()
        current_year = now.year
        current_month = now.month
        current_day = now.day
        
        # メタデータの時間を確認
        metadata_time = root.find('.//gpx:metadata/gpx:time', namespaces)
        
        if metadata_time is not None:
            metadata_time_str = metadata_time.text
            metadata_date = datetime.strptime(metadata_time_str, '%Y-%m-%dT%H:%M:%SZ')
            
            # 修正が必要かチェック
            needs_fix = metadata_date.year > current_year or force
            
            if needs_fix:
                # 年差を計算
                year_diff = metadata_date.year - current_year
                
                # トラックポイントの時間を修正
                track_points = root.findall('.//gpx:trkpt/gpx:time', namespaces)
                
                for point in track_points:
                    time_str = point.text
                    time_date = datetime.strptime(time_str, '%Y-%m-%dT%H:%M:%S.000Z')
                    
                    # 年/月/日を現在に合わせて修正
                    new_date = time_date.replace(
                        year=current_year,
                        month=current_month,
                        day=current_day
                    )
                    
                    # 新しい時間文字列を設定
                    point.text = new_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
                
                # メタデータの時間も修正
                new_metadata_date = metadata_date.replace(
                    year=current_year,
                    month=current_month,
                    day=current_day
                )
                metadata_time.text = new_metadata_date.strftime('%Y-%m-%dT%H:%M:%SZ')
                
                # トラックの説明も修正
                track_desc = root.find('.//gpx:trk/gpx:desc', namespaces)
                if track_desc is not None:
                    desc_text = track_desc.text
                    date_pattern = r'(\d{2}/\d{2}/\d{4})'
                    date_match = re.search(date_pattern, desc_text)
                    
                    if date_match:
                        old_date_str = date_match.group(1)
                        old_date = datetime.strptime(old_date_str, '%m/%d/%Y')
                        new_date = old_date.replace(
                            year=current_year,
                            month=current_month,
                            day=current_day
                        )
                        new_date_str = new_date.strftime('%m/%d/%Y')
                        new_desc_text = desc_text.replace(old_date_str, new_date_str)
                        track_desc.text = new_desc_text
                
                # 保存先のディレクトリがあるか確認
                output_path = file_path
                
                # ファイルを保存
                tree.write(output_path, encoding='UTF-8', xml_declaration=True)
                print(f"日付修正完了: {file_path}")
                print(f"  修正前: {metadata_date.strftime('%Y-%m-%d')}")
                print(f"  修正後: {new_metadata_date.strftime('%Y-%m-%d')}")
                return True
            else:
                print(f"修正は必要ありません: {file_path}")
                return False
        else:
            print(f"エラー: メタデータの時間情報が見つかりません: {file_path}")
            return False
            
    except Exception as e:
        print(f"エラー: {file_path} の処理中に例外が発生しました: {str(e)}")
        return False

def main():
    """メイン関数"""
    args = parse_args()
    
    # ファイルが指定されていない場合はサンプルディレクトリを処理
    if not args.files:
        # スクリプトのディレクトリを取得
        script_dir = os.path.dirname(os.path.abspath(__file__))
        samples_dir = os.path.join(script_dir, 'samples')
        
        if os.path.exists(samples_dir):
            for file_name in os.listdir(samples_dir):
                if file_name.endswith('.gpx'):
                    file_path = os.path.join(samples_dir, file_name)
                    fix_gpx_dates(file_path, args.force)
        else:
            print(f"サンプルディレクトリが見つかりません: {samples_dir}")
    else:
        # 指定されたファイルを処理
        for file_path in args.files:
            if os.path.exists(file_path):
                fix_gpx_dates(file_path, args.force)
            else:
                print(f"ファイルが見つかりません: {file_path}")

if __name__ == '__main__':
    main() 