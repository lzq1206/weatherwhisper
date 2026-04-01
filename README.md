climate analysis and where to go

## Data collection

Download China region climate datasets from OneBuilding:

```bash
python3 /home/runner/work/weatherwhisper/weatherwhisper/scripts/crawler.py --extract-all
```

- 默认会抓取 `https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/index.html` 下的全部 ZIP 链接
- 使用 `--extract-all` 会提取 ZIP 中所有文件（如 epw/stat/wea/rain/clm/ddy 等），满足全量保存需求
- 可用 `--limit N` 做小批量测试
