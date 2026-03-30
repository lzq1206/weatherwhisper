import os
import requests
from bs4 import BeautifulSoup
import zipfile
import io
import argparse

BASE_URL = "https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/"
INDEX_URL = BASE_URL + "index.html"
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")

def crawl_china_data(limit=None):
    if not os.path.exists(RAW_DIR):
        os.makedirs(RAW_DIR, exist_ok=True)

    print(f"Fetching index from {INDEX_URL}...")
    try:
        response = requests.get(INDEX_URL, timeout=30)
        response.raise_for_status()
    except Exception as e:
        print(f"Failed to fetch index: {e}")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Extract all .zip links
    links = [a['href'] for a in soup.find_all('a', href=True) if a['href'].endswith('.zip')]
    print(f"Found {len(links)} total ZIP files.")
    
    if limit:
        links = links[:limit]
        print(f"Limiting to first {limit} files for testing.")

    for link in links:
        # Construct full URL safely (handling relative paths)
        zip_url = requests.compat.urljoin(BASE_URL, link)
        print(f"Downloading {zip_url}...")
        try:
            r = requests.get(zip_url, timeout=60)
            r.raise_for_status()
            
            with zipfile.ZipFile(io.BytesIO(r.content)) as z:
                for file_info in z.infolist():
                    if file_info.filename.lower().endswith(('.epw', '.stat')):
                        # Extract to RAW_DIR
                        z.extract(file_info, RAW_DIR)
                        print(f"  Extracted: {file_info.filename}")
        except Exception as e:
            print(f"  Error downloading/extracting {link}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean energy building climate data crawler.")
    parser.add_argument("--limit", type=int, default=None, help="Limit the number of files to download.")
    args = parser.parse_args()
    
    crawl_china_data(limit=args.limit)
