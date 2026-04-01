#!/usr/bin/env python3
from __future__ import annotations

import io
import os
import zipfile
from dataclasses import dataclass
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / 'data' / 'raw'

@dataclass(frozen=True)
class TargetZip:
    name: str
    url: str

TARGETS: list[TargetZip] = [
    TargetZip('Beijing-Capital', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/BJ_Beijing/CHN_BJ_Beijing-Capital.Intl.AP.545110_TMYx.zip'),
    TargetZip('Shanghai-Baoshan', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/SH_Shanghai/CHN_SH_Shanghai-Baoshan.583620_TMYx.zip'),
    TargetZip('Guangzhou', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/GD_Guangdong/CHN_GD_Guangzhou.592870_TMYx.zip'),
    TargetZip('Shenzhen', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/GD_Guangdong/CHN_GD_Shenzhen.594930_TMYx.zip'),
    TargetZip('Tianjin-Binhai', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/TJ_Tianjin/CHN_TJ_Tianjin-Binhai.Intl.AP.545273_TMYx.zip'),
    TargetZip('Wuhan-Tianhe', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/HB_Hubei/CHN_HB_Tianhe-Wuhan.574940_TMYx.zip'),
    TargetZip('Hangzhou', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/ZJ_Zhejiang/CHN_ZJ_Hangzhou.584570_TMYx.zip'),
    TargetZip('Nanjing', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/JS_Jiangsu/CHN_JS_Nanjing.582380_TMYx.zip'),
    TargetZip('Harbin-Taiping', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/HL_Heilongjiang/CHN_HL_Harbin-Taiping.AP.541611_TMYx.zip'),
    TargetZip('Qingdao', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/SD_Shandong/CHN_SD_Qingdao.Intl.AP.548570_TMYx.zip'),
    TargetZip('Dalian-Zhoushuizi', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/LN_Liaoning/CHN_LN_Dalian-Zhoushuizi.Intl.AP.546620_TMYx.zip'),
    TargetZip('Xiamen', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/FJ_Fujian/CHN_FJ_Xiamen.591340_TMYx.zip'),
    TargetZip('Kunming-Wujiaba', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/YN_Yunnan/CHN_YN_Kunming-Wujiaba.AP.567780_TMYx.zip'),
    TargetZip('Urumqi-Diwopu', 'https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/XZ_Tibet/CHN_XZ_Urumqi-Diwopu.AP.514635_TMYx.zip'),
    TargetZip('Taipei-Songshan', 'https://climate.onebuilding.org/WMO_Region_2_Asia/TWN_Taiwan/NOR_Northern_Region/TWN_NOR_Taipei-Songshan.AP.466960_TMYx.zip'),
]


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def download_bytes(url: str) -> bytes:
    req = Request(url, headers={
        'User-Agent': 'WeatherWhisper/1.0 (+OpenClaw)',
        'Accept': 'application/zip,application/octet-stream;q=0.9,*/*;q=0.8',
    })
    with urlopen(req, timeout=60) as resp:
        return resp.read()


def extract_zip(content: bytes, source_label: str) -> int:
    count = 0
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            lower = info.filename.lower()
            if not lower.endswith(('.epw', '.stat')):
                continue
            base_name = os.path.basename(info.filename)
            dest = RAW_DIR / base_name
            ensure_dir(dest.parent)
            with zf.open(info) as src, open(dest, 'wb') as dst:
                dst.write(src.read())
            count += 1
            print(f'  extracted {base_name}')
    print(f'[{source_label}] extracted {count} climate files')
    return count


def main() -> int:
    ensure_dir(RAW_DIR)
    total = 0
    for target in TARGETS:
        print(f'Fetching {target.name}...')
        try:
            content = download_bytes(target.url)
        except Exception as e:
            print(f'  failed: {e}')
            continue
        try:
            total += extract_zip(content, target.name)
        except Exception as e:
            print(f'  extract failed: {e}')
    print(f'Done. Total extracted files: {total}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
