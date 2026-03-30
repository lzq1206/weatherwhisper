import os
import pandas as pd
import json
import glob
import re

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed")

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

def calculate_wind_rose(df):
    try:
        # Wind Rose: 16 directions (22.5 degrees each)
        # N: 348.75 - 11.25
        bins = [0, 11.25, 33.75, 56.25, 78.75, 101.25, 123.75, 146.25, 168.75, 191.25, 213.75, 236.25, 258.75, 281.25, 303.75, 326.25, 348.75, 361]
        labels = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N_"]
        
        df['dir_bin'] = pd.cut(df['WindDir'], bins=bins, labels=labels, include_lowest=True)
        df.loc[df['dir_bin'] == "N_", 'dir_bin'] = "N"
        
        speed_bins = [0, 2, 5, 10, 15, 100]
        speed_labels = ["0-2", "2-5", "5-10", "10-15", "15+"]
        df['speed_bin'] = pd.cut(df['WindSpeed'], bins=speed_bins, labels=speed_labels)
        
        rose = df.groupby(['dir_bin', 'speed_bin']).size().unstack(fill_value=0)
        return rose.to_dict()
    except:
        return {}

def process_station(epw_path):
    print(f"Processing {epw_path}...")
    with open(epw_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    metadata = parse_epw_location(lines[0])
    station_id = metadata['wmo']
    
    # Standard EPW Data Columns (1-indexed for reference, so parts[6] is column 7)
    # 7: DBT, 9: RH, 21: Wind Dir, 22: Wind Speed, 34: Precip Depth
    
    data = []
    for line in lines:
        if re.match(r'^\d{4},', line):
            parts = line.strip().split(',')
            if len(parts) >= 22:
                try:
                    # Indexing: 0=Year, 1=Month, 6=DBT, 8=RH, 20=WindDir, 21=WindSpeed
                    # Precip is usually at index 33 or 34 but can be missing
                    precip = 0.0
                    if len(parts) > 33:
                        try: precip = float(parts[33]) if parts[33] != '999' else 0.0
                        except: pass
                        
                    data.append({
                        'Month': int(parts[1]),
                        'DBT': float(parts[6]),
                        'RH': float(parts[8]),
                        'WindDir': float(parts[20]),
                        'WindSpeed': float(parts[21]),
                        'Precip': precip
                    })
                except Exception:
                    continue
            
    df = pd.DataFrame(data)
    if df.empty:
        print(f"  No valid data for {station_id}")
        return None

    monthly_stats = df.groupby('Month').agg({
        'DBT': ['mean', 'max', 'min'],
        'RH': 'mean',
        'WindSpeed': 'mean',
        'Precip': 'sum'
    })
    monthly_stats.columns = ['temp_avg', 'temp_max', 'temp_min', 'rh_avg', 'wind_avg', 'precip_sum']
    monthly_json = monthly_stats.to_dict(orient='index')
    
    yearly_stats = {
        "avg_temp": round(float(df['DBT'].mean()), 2),
        "max_temp": float(df['DBT'].max()),
        "min_temp": float(df['DBT'].min()),
        "avg_wind": round(float(df['WindSpeed'].mean()), 2),
        "total_precip": round(float(df['Precip'].sum()), 2)
    }
    
    wind_rose = calculate_wind_rose(df)
    
    station_data = {
        "metadata": metadata,
        "yearly": yearly_stats,
        "monthly": monthly_json,
        "wind_rose": wind_rose
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
            "city": metadata['city'],
            "province": metadata['state'],
            "elev": metadata['elev'],
            **yearly_stats
        }
    }

def main():
    if not os.path.exists(PROCESSED_DIR):
        os.makedirs(PROCESSED_DIR, exist_ok=True)
        
    epw_files = glob.glob(os.path.join(RAW_DIR, "*.epw"))
    features = []
    
    for epw in epw_files:
        feat = process_station(epw)
        if feat:
            features.append(feat)
            
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    with open(os.path.join(PROCESSED_DIR, "stations.geojson"), 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    
    print(f"Finished processing {len(features)} stations.")

if __name__ == "__main__":
    main()
