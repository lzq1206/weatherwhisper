#!/usr/bin/env python3

"""download_climate_data.py

Recursively download all files linked from a base index page (same host/path) and save them
under the specified output directory preserving relative paths.

Example:
  python3 scripts/download_climate_data.py \
    https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/index.html data/CHN_China

This script uses requests and beautifulsoup4.
"""

from __future__ import annotations
import os
import sys
import time
import argparse
from urllib.parse import urljoin, urlparse, urlunparse
import requests
from bs4 import BeautifulSoup


SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "weatherwhisper-climate-downloader/1.0"})


def is_same_base(url: str, base: str) -> bool:
    # Compare scheme/netloc and ensure path starts with base path
    up = urlparse(url)
    bp = urlparse(base)
    if (up.scheme, up.netloc) != (bp.scheme, bp.netloc):
        return False
    # ensure normalized path
    return os.path.commonpath([up.path, bp.path]) == bp.path or up.path.startswith(bp.path.rstrip('/') + '/')


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def sanitize_path_component(component: str) -> str:
    # basic sanitation to avoid traversal
    return component.replace('..', '_')


def download_file(url: str, dest_path: str, chunk_size: int = 1024*16) -> None:
    ensure_dir(os.path.dirname(dest_path))
    try:
        r = SESSION.get(url, stream=True, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"[ERROR] Failed to download {url}: {e}")
        return
    with open(dest_path, 'wb') as f:
        for chunk in r.iter_content(chunk_size=chunk_size):
            if chunk:
                f.write(chunk)
    print(f"[OK] Saved {url} -> {dest_path}")


def find_links(html: str, base_url: str) -> list:
    soup = BeautifulSoup(html, 'html.parser')
    anchors = soup.find_all('a', href=True)
    links = []
    for a in anchors:
        href = a['href'].strip()
        if href.startswith('#') or href.lower().startswith('mailto:'):
            continue
        full = urljoin(base_url, href)
        links.append(full)
    return links


def is_directory_link(href: str) -> bool:
    # heuristic: trailing slash means directory
    return href.endswith('/')


def relative_path_from_base(url: str, base: str) -> str:
    up = urlparse(url)
    bp = urlparse(base)
    # compute relative path from bp.path
    rel = os.path.relpath(up.path, bp.path)
    # handle cases where rel is '.')
    if rel == '.':
        rel = ''
    # remove leading '../' if any
    rel = rel.replace('..', '_')
    # sanitize
    parts = [sanitize_path_component(p) for p in rel.split('/') if p]
    return os.path.join(*parts) if parts else ''


def crawl_and_download(start_url: str, output_dir: str, delay: float = 0.1, max_depth: int = 10) -> None:
    visited = set()
    to_visit = [(start_url, 0)]
    base_parsed = urlparse(start_url)
    base_root = urlunparse((base_parsed.scheme, base_parsed.netloc, base_parsed.path.rstrip('/'), '', '', ''))

    while to_visit:
        url, depth = to_visit.pop(0)
        if url in visited:
            continue
        if depth > max_depth:
            print(f"[WARN] Max depth reached for {url}")
            continue
        print(f"[INFO] Fetching index: {url}")
        visited.add(url)
        try:
            r = SESSION.get(url, timeout=30)
            r.raise_for_status()
        except Exception as e:
            print(f"[ERROR] Failed to fetch {url}: {e}")
            continue

        content_type = r.headers.get('Content-Type','')
        # If this is an HTML page, parse for links
        if 'text/html' in content_type.lower() or url.endswith('index.html') or url.endswith('/'): 
            links = find_links(r.text, url)
            for link in links:
                # Only follow links on the same host/root path
                if not is_same_base(link, start_url):
                    continue
                if link in visited:
                    continue
                # determine if directory
                if link.endswith('/') or link.endswith('index.html'):
                    to_visit.append((link, depth+1))
                else:
                    # treat as file to download
                    rel = relative_path_from_base(link, start_url)
                    dest = os.path.join(output_dir, rel)
                    # If link ends with '/', it's directory, skip
                    download_file(link, dest)
                    time.sleep(delay)
        else:
            # Non-HTML content: treat as file
            rel = relative_path_from_base(url, start_url)
            dest = os.path.join(output_dir, rel)
            download_file(url, dest)
            time.sleep(delay)


def main():
    parser = argparse.ArgumentParser(description='Recursively download files from a base index page and save to output dir')
    parser.add_argument('base_url', help='Base index URL, e.g. https://climate.onebuilding.org/WMO_Region_2_Asia/CHN_China/index.html')
    parser.add_argument('output_dir', help='Output directory to save files, e.g. data/CHN_China')
    parser.add_argument('--delay', type=float, default=0.1, help='Delay (s) between requests')
    parser.add_argument('--max-depth', type=int, default=10, help='Max recursion depth')
    args = parser.parse_args()

    ensure_dir(args.output_dir)
    crawl_and_download(args.base_url, args.output_dir, delay=args.delay, max_depth=args.max_depth)


if __name__ == '__main__':
    main()
