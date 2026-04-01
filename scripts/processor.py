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
        # Comfort: 18-26C, Precip < 100mm
        if 15 <= s['temp_avg'] <= 28 and s['precip'] < 100:
            best_months.append(m)
    
    if not best_months: return "四季皆宜"
    
    # Range processing
    if len(best_months) == 12: return "全年"
    return f"{min(best_months)}-{max(best_months)}月"

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
        'Cloud': 'mean'
    })
    
    monthly_stats.columns = ['temp_avg', 'temp_max', 'temp_min', 'humidity', 'wind', 'precip', 'solar', 'cloud']
    monthly_json = monthly_stats.to_dict(orient='index')
    
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
        "growing_season": growing_days,
        "best_time": get_best_time(monthly_json),
        "water_temp": round(float(df['Temp'].mean() + 1.5), 1), # Proxy estimation
        "solar_energy": round(float(df['Solar'].sum() / 1000 * 0.15), 2), # Solar potential (15% efficiency)
    }
    
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
