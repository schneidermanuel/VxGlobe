#!/usr/bin/env python3
"""Build data/airports.js from the public-domain OurAirports dataset.

Fetches https://davidmegginson.github.io/ourairports-data/airports.csv,
filters to airports with scheduled service, and writes a compact JSON
array of {name, city, country, iata, icao, lat, lng} to data/airports.js
as `window.AIRPORTS_DATA = [...];` (a plain <script> tag, not fetch()ed,
so the app works when index.html is opened directly via file:// too).

Usage:
    python3 scripts/build-airports.py [--input path/to/airports.csv]

If --input is omitted, the CSV is downloaded from the URL above.
"""
import argparse
import csv
import json
import os
import sys
import urllib.request

SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
KEEP_TYPES = {"large_airport", "medium_airport"}


def load_rows(input_path):
    if input_path:
        with open(input_path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    with urllib.request.urlopen(SOURCE_URL) as resp:
        text = resp.read().decode("utf-8")
    return list(csv.DictReader(text.splitlines()))


def build(rows):
    out = []
    for row in rows:
        if row.get("type") not in KEEP_TYPES:
            continue
        if row.get("scheduled_service") != "yes":
            continue
        try:
            lat = float(row["latitude_deg"])
            lng = float(row["longitude_deg"])
        except (KeyError, ValueError):
            continue
        iata = (row.get("iata_code") or "").strip()
        icao = (row.get("icao_code") or "").strip()
        if not iata and not icao:
            continue
        out.append({
            "name": row.get("name", "").strip(),
            "city": row.get("municipality", "").strip(),
            "country": row.get("iso_country", "").strip(),
            "iata": iata,
            "icao": icao,
            "lat": lat,
            "lng": lng,
        })
    out.sort(key=lambda a: (a["iata"] or a["icao"]))
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="local airports.csv path (skip download)")
    parser.add_argument("--output", default=None, help="output .js path")
    args = parser.parse_args()

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_path = args.output or os.path.join(repo_root, "data", "airports.js")

    rows = load_rows(args.input)
    airports = build(rows)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("window.AIRPORTS_DATA = ")
        json.dump(airports, f, separators=(",", ":"))
        f.write(";\n")

    print(f"Wrote {len(airports)} airports to {output_path}")


if __name__ == "__main__":
    sys.exit(main())
