"""Read only the supplied project datasets; retain a small reproducible inventory."""
from pathlib import Path
import json, csv, sys, xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')
root = Path('C:/Users/PC/Downloads')
extra = '''SIH Calangute Beach.kml|kml file for river.kml|dudhsagar falls (3).kml|Calangute_Wave_Current_Spike_Scripted_Events.json|historical_incidents_calangute_json.json|evacuation_route_candidate.geojson|hazard_zones_candidate.geojson|verification_status.csv|safe_zone_candidates.geojson|safe_zone_candidates.csv|05_synthetic_dudhsagar_river_water_level.csv|04_synthetic_slope_dem.tif|03_synthetic_terrain_dem.tif|02_synthetic_terrain_grid.csv|01_kml_elevation_control_points.csv|06_official_real_river_water_level_source.json|alert_delivery_message_log.txt|flash_flood_warning_alerts.json|06_corrected_mvp_data_matrix.csv|05_verified_historical_incidents.json|04_official_source_records.json|03_kml_features_needing_verification.geojson|01_kml_source_features.geojson|02_kml_feature_inventory.csv|tourist_gps_dudhsagar.json|rescue_team_gps_dudhsagar.json|upstream_rainfall_dudhsagar.json'''.split('|')
paths = sorted(set([*root.glob('calangute_*'), *root.glob('muthathi_*'), *root.glob('dudhsagar_*'), *[root / n for n in extra]]))
inventory=[]
for p in paths:
    if not p.exists():
        print('MISSING',p.name); continue
    if p.suffix not in ['.json','.jsonl','.ndjson','.geojson','.csv','.kml','.tif','.txt']: continue
    item={'file':p.name,'bytes':p.stat().st_size}
    try:
        if p.suffix in ['.json','.geojson']:
            data=json.loads(p.read_text(encoding='utf-8-sig'))
            item['structure'] = list(data)[:20] if isinstance(data,dict) else 'array'
            item['sample']= str(data[:1] if isinstance(data,list) else data)[:1800]
            item['records']=len(data) if isinstance(data,list) else len(data.get('features',data.get('data',data.get('records',[]))))
        elif p.suffix in ['.jsonl','.ndjson']:
            lines=p.read_text(encoding='utf-8-sig').splitlines(); item['records']=len(lines); item['sample']=lines[0][:1800]
        elif p.suffix=='.csv':
            rows=list(csv.DictReader(p.open(encoding='utf-8-sig'))); item['records']=len(rows); item['sample']=rows[:2]
        elif p.suffix=='.kml':
            tree=ET.parse(p); ns={'k':'http://www.opengis.net/kml/2.2'}
            item['features']=[{'name':x.findtext('k:name',namespaces=ns),'geometry':[q.tag.split('}')[-1] for q in x if q.tag.split('}')[-1] in ['Point','Polygon','LineString','MultiGeometry']]} for x in tree.findall('.//k:Placemark',ns)]
        elif p.suffix=='.txt': item['sample']=p.read_text(encoding='utf-8-sig')[:1600]
    except Exception as e: item['error']=str(e)
    inventory.append(item)
Path('tmp/audit/data-inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
for i in inventory: print(json.dumps(i,ensure_ascii=False))
