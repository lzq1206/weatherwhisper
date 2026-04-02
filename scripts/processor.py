import os
import pandas as pd
import json
import glob
import re

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")

def parse_epw_location(first_line):
    parts = first_line.split(',')
    return {
        "city": parts[1].strip(),
        "state": parts[2].strip(),
        "country": parts[3].strip(),
        "wmo": parts[5].strip(),
        "lat": float(parts[6]),
        "lon": float(parts[7]),
        "tz": float(parts[8]),
        "elev": float(parts[9])
    }

def normalize_city_name(raw_city):
    city = str(raw_city).strip()
    major_names = [
        'Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Tianjin', 'Wuhan',
        'Hangzhou', 'Nanjing', 'Harbin', 'Qingdao', 'Dalian', 'Xiamen',
        'Kunming', 'Urumqi', 'Taipei', 'Chengdu', 'Chongqing', 'Ningbo',
        'Suzhou', 'Xian', 'Xi\'an', 'Hong Kong', 'Macau'
    ]
    for name in major_names:
        if name.lower().replace("'", '') in city.lower().replace("'", ''):
            return name
    # Generic fallback: use the first hyphen/period segment.
    city = re.split(r'[\.-]', city)[0].strip()
    return city or str(raw_city).strip()

def calculate_growing_season(df):
    # Standard: consecutive days with T_min > 0
    # For TMY/EPW, we can just count days in each month with T_min > 0
    # Or simpler: months where avg_temp > 5C (common bio-climatic threshold)
    pass

def get_climate_description(stats):
    # stats is the yearly dict
    t = stats['avg_temp']
    p = stats['total_precip']
    
    desc = ""
    if t > 20: desc += "热带/亚热带气候，全年气温较高。"
    elif t > 10: desc += "温带气候，四季分明。"
    else: desc += "寒冷气候，冬季漫长。"
    
    if p > 1500: desc += " 降水极丰沛。"
    elif p > 800: desc += " 湿润多雨。"
    elif p > 400: desc += " 半湿润地区。"
    else: desc += " 干旱/半干旱地区。"
    
    return desc

def get_best_time(monthly_json):
    best_months = []
    for m, s in monthly_json.items():
        temp = s.get('temp_avg', 0)
        humidity = s.get('humidity', 100)
        sunny_rate = s.get('sunny_rate', max(0.0, min(100.0, (100.0 - s.get('cloud', 100)) * 0.35)))
        score = s.get('tourism_score', 0)
        if 18 <= temp <= 28 and 35 <= humidity <= 75 and sunny_rate >= 18 and score >= 5.8:
            best_months.append(int(m))
    
    if not best_months:
        scored = sorted(((s.get('tourism_score', 0), int(m)) for m, s in monthly_json.items()), reverse=True)
        if not scored:
            return "四季皆宜"
        best_months = [month for _, month in scored[:3]]
    
    if len(best_months) == 12:
        return "全年"

    best_months = sorted(set(best_months))
    ranges = []
    start = prev = best_months[0]
    for m in best_months[1:]:
        if m == prev + 1:
            prev = m
            continue
        ranges.append((start, prev))
        start = prev = m
    ranges.append((start, prev))
    if len(ranges) == 1:
        a, b = ranges[0]
        return f"{a}-{b}月" if a != b else f"{a}月"
    return "、".join([f"{a}-{b}月" if a != b else f"{a}月" for a, b in ranges])


def score_tourism_month(month_stats):
    temp = float(month_stats['temp_avg'])
    humidity = float(month_stats['humidity'])
    cloud = float(month_stats['cloud'])
    opaque_cloud = float(month_stats.get('opaque_cloud', cloud))
    visibility = float(month_stats.get('visibility', 10.0))

    cloudiness = 0.45 * cloud + 0.55 * opaque_cloud
    visibility_bonus = max(0.0, min(8.0, (visibility - 5.0) / 1.5))
    sunny_rate = round(max(0.0, min(100.0, (100.0 - cloudiness) * 0.28 + visibility_bonus * 2.5)), 1)

    # Rough comfort model: temperature near 23°C, humidity near 55%, more sunshine is better.
    temp_score = max(0.0, 1.0 - abs(temp - 23.0) / 13.0)
    humidity_score = max(0.0, 1.0 - abs(humidity - 55.0) / 45.0)
    sunny_score = sunny_rate / 100.0
    tourism_score = round((0.45 * temp_score + 0.25 * humidity_score + 0.30 * sunny_score) * 10.0, 1)

    if 18 <= temp <= 28 and 35 <= humidity <= 75 and sunny_rate >= 18:
        comfort_label = '舒适'
    elif 15 <= temp <= 30 and 30 <= humidity <= 80:
        comfort_label = '可接受'
    else:
        comfort_label = '偏不舒适'

    return {
        'sunny_rate': sunny_rate,
        'tourism_score': tourism_score,
        'comfort_label': comfort_label,
    }


def months_to_text(months):
    if not months:
        return '四季皆宜'
    months = sorted(set(int(m) for m in months))
    if len(months) == 12:
        return '全年'
    ranges = []
    start = prev = months[0]
    for m in months[1:]:
        if m == prev + 1:
            prev = m
            continue
        ranges.append((start, prev))
        start = prev = m
    ranges.append((start, prev))
    return '、'.join([f'{a}-{b}月' if a != b else f'{a}月' for a, b in ranges])

def process_station(epw_path):
    print(f"Processing {epw_path}...")
    with open(epw_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    metadata = parse_epw_location(lines[0])
    station_id = metadata['wmo']
    
    # EPW Columns:
    # 6: DBT (7th col), 8: RH (9th col), 13: GHR (14th col), 21: WindSpeed (22nd col), 22: TotalCloud (23rd col), 33: LiquidPrecip (34th col)
    
    data = []
    for line in lines:
        if re.match(r'^\d{4},', line):
            parts = line.strip().split(',')
            if len(parts) >= 34:
                try:
                    data.append({
                        'Month': int(parts[1]),
                        'Day': int(parts[2]),
                        'Temp': float(parts[6]),
                        'Humidity': float(parts[8]),
                        'Solar': float(parts[13]),
                        'WindSpeed': float(parts[21]),
                        'Cloud': float(parts[22]),
                        'OpaqueCloud': float(parts[23]) if parts[23] != '999' else float(parts[22]),
                        'Visibility': float(parts[24]) if parts[24] != '999' else 10.0,
                        'Precip': float(parts[33]) if parts[33] != '999' else 0.0
                    })
                except Exception:
                    continue
            
    df = pd.DataFrame(data)
    if df.empty:
        return None

    # Monthly aggregation
    monthly_stats = df.groupby('Month').agg({
        'Temp': ['mean', 'max', 'min'],
        'Humidity': 'mean',
        'WindSpeed': 'mean',
        'Precip': 'sum',
        'Solar': 'sum',
        'Cloud': 'mean',
        'OpaqueCloud': 'mean',
        'Visibility': 'mean'
    })
    
    monthly_stats.columns = ['temp_avg', 'temp_max', 'temp_min', 'humidity', 'wind', 'precip', 'solar', 'cloud', 'opaque_cloud', 'visibility']
    monthly_json = monthly_stats.to_dict(orient='index')
    for m, s in monthly_json.items():
        s.update(score_tourism_month(s))
    
    # Growing season: Days with T_avg > 5C (approximation)
    growing_days = 0
    # Group by Day,Month to get daily averages? EPW is already TMY, so we have 365 days
    daily = df.groupby(['Month', 'Day'])['Temp'].mean().reset_index()
    growing_days = len(daily[daily['Temp'] > 5])

    yearly_stats = {
        "avg_temp": round(float(df['Temp'].mean()), 2),
        "total_precip": round(float(df['Precip'].sum()), 2),
        "avg_humidity": round(float(df['Humidity'].mean()), 2),
        "avg_wind": round(float(df['WindSpeed'].mean()), 2),
        "total_solar": round(float(df['Solar'].sum() / 1000), 2), # kWh/m2
        "avg_cloud": round(float(df['Cloud'].mean()), 1),
        "avg_opaque_cloud": round(float(df['OpaqueCloud'].mean()), 1),
        "avg_visibility": round(float(df['Visibility'].mean()), 1),
        "growing_season": growing_days,
        "water_temp": round(float(df['Temp'].mean() + 1.5), 1), # Proxy estimation
        "solar_energy": round(float(df['Solar'].sum() / 1000 * 0.15), 2), # Solar potential (15% efficiency)
    }

    yearly_scores = [(s['tourism_score'], int(m)) for m, s in monthly_json.items()]
    yearly_scores.sort(reverse=True)
    top_months = [month for _, month in yearly_scores[:4] if month]
    comfy_months = [int(m) for m, s in monthly_json.items() if s['comfort_label'] == '舒适' and s['tourism_score'] >= 6.0]
    yearly_stats['tourism_score_avg'] = round(sum(s['tourism_score'] for s in monthly_json.values()) / max(len(monthly_json), 1), 1)
    yearly_stats['best_tourism_months'] = months_to_text(comfy_months or top_months[:3])
    yearly_stats['best_time'] = yearly_stats['best_tourism_months']
    yearly_stats['tourism_peak_month'] = top_months[0] if top_months else None
    
    yearly_stats["overview"] = get_climate_description(yearly_stats)
    
    station_data = {
        "metadata": metadata,
        "yearly": yearly_stats,
        "monthly": monthly_json
    }
    
    with open(os.path.join(PROCESSED_DIR, f"{station_id}.json"), 'w', encoding='utf-8') as f:
        json.dump(station_data, f, ensure_ascii=False, indent=2)
        
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [metadata['lon'], metadata['lat']]
        },
        "properties": {
            "id": station_id,
            "city": normalize_city_name(metadata['city']),
            "province": metadata['state'],
            **yearly_stats
        }
    }

def sync_public_outputs():
    if not os.path.exists(PUBLIC_DIR):
        os.makedirs(PUBLIC_DIR, exist_ok=True)

    for filename in os.listdir(PROCESSED_DIR):
        src = os.path.join(PROCESSED_DIR, filename)
        dst = os.path.join(PUBLIC_DIR, filename)
        if os.path.isfile(src):
            with open(src, 'rb') as fsrc, open(dst, 'wb') as fdst:
                fdst.write(fsrc.read())

def main():
    if not os.path.exists(PROCESSED_DIR):
        os.makedirs(PROCESSED_DIR, exist_ok=True)

    epw_files = sorted(glob.glob(os.path.join(RAW_DIR, "**", "*.epw"), recursive=True))
    features_by_id = {}
    
    for epw in epw_files:
        feat = process_station(epw)
        if feat:
            features_by_id[feat['properties']['id']] = feat
            
    geojson = {
        "type": "FeatureCollection",
        "features": list(features_by_id.values())
    }
    
    with open(os.path.join(PROCESSED_DIR, "stations.geojson"), 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    sync_public_outputs()
    
    print(f"Finished processing {len(features_by_id)} stations.")

if __name__ == "__main__":
    main()
