import os
import csv
import json
import re

data_dir = 'data'
all_monuments = []

def get_file_number(filename):
    match = re.search(r'\d+', filename)
    return int(match.group()) if match else 999

def clean_kingdom_name(name):
    cleaned = re.sub(r'^Delhi\s+Monuments\s*\d*\s*', '', name, flags=re.IGNORECASE).strip()
    return cleaned if cleaned else name

if os.path.exists(data_dir):
    csv_files = [f for f in os.listdir(data_dir) if f.endswith('.csv')]
    csv_files.sort(key=get_file_number)

    for filename in csv_files:
        raw_name = os.path.splitext(filename)[0].replace('_', ' ').replace('-', ' ').title()
        default_kingdom = clean_kingdom_name(raw_name)
        filepath = os.path.join(data_dir, filename)
        
        with open(filepath, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row:
                    continue
                
                # Fetch Column 1 value directly as fallback
                col_values = [v.strip() for v in row.values() if v is not None]
                first_col_val = col_values[0] if col_values else ''

                clean_row = {k.strip().lower(): v.strip() for k, v in row.items() if k and v}
                
                lat = clean_row.get('latitude') or clean_row.get('lat')
                lng = clean_row.get('longitude') or clean_row.get('lng') or clean_row.get('long')
                
                # Try common headers first, otherwise default directly to Column 1 value
                name = (
                    clean_row.get('name') or 
                    clean_row.get('monument') or 
                    clean_row.get('monument name') or 
                    clean_row.get('monuments') or 
                    clean_row.get('site') or 
                    clean_row.get('structure') or 
                    first_col_val or 
                    'Historical Site'
                )

                date_century = (
                    clean_row.get('date / century') or 
                    clean_row.get('date/century') or 
                    clean_row.get('date') or 
                    clean_row.get('century') or 
                    clean_row.get('era') or 'N/A'
                )
                
                raw_k = clean_row.get('kingdom') or default_kingdom
                clean_k = clean_kingdom_name(raw_k)
                
                if lat and lng:
                    try:
                        all_monuments.append({
                            'name': name,
                            'lat': float(lat),
                            'lng': float(lng),
                            'description': clean_row.get('description') or clean_row.get('desc') or 'No description available.',
                            'era': date_century,
                            'kingdom': clean_k
                        })
                    except ValueError:
                        continue

    with open('monuments.json', 'w', encoding='utf-8') as f:
        json.dump(all_monuments, f, indent=2)
    print(f"Success! Processed {len(all_monuments)} monuments with correct names into monuments.json")
else:
    print("Error: /data folder not found!")