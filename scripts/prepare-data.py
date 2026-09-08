"""Preserve source files and derive auditable, geographically consistent demo bundles.

Run with Python 3. All generated values remain explicitly synthetic. KML coordinates
are copied exactly; unrelated features are excluded only from a site's display layer.
"""
from pathlib import Path
from collections import Counter, defaultdict
import csv, hashlib, json, math, shutil, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('C:/Users/PC/Downloads')
PUBLIC=ROOT/'frontend/public/data'
RAW=ROOT/'data/source'
REPAIRS=json.loads((ROOT/'data/normalized/geometry-repairs.json').read_text())['features'] if (ROOT/'data/normalized/geometry-repairs.json').exists() else []
NS={'k':'http://www.opengis.net/kml/2.2'}
CONFIG=[
 dict(id='calangute',site_id=3,name='Calangute Beach',type='beach',region='North Goa, Goa',center=[73.7605,15.5417],zoom=14,kml='SIH Calangute Beach.kml',boundary='Polygon 2',description='Shoreline paths, coastal conditions and lifeguard access.',bounds=[73.749,15.525,73.795,15.553]),
 dict(id='muthathi',site_id=2,name='Muthathi River',type='river',region='Mandya, Karnataka',center=[77.2948,12.3075],zoom=13,kml='kml file for river.kml',boundary='Polygon 7',description='Cauvery riverbanks, upstream rainfall and higher-ground access.',bounds=[77.260,12.289,77.330,12.320]),
 dict(id='dudhsagar',site_id=1,name='Dudhsagar Falls',type='waterfall',region='South Goa, Goa',center=[74.3125,15.3122],zoom=15,kml='dudhsagar falls (3).kml',boundary='Stream Corridor / Catchment Area (existing trace)',description='Forest trails, catchment rainfall and flash-flood exposure.',bounds=[74.302,15.306,74.318,15.321])
]

def source_path(name):
 p=SOURCE/name
 if p.exists():return p
 return next(RAW.glob('*/'+name))

def read(name):
 p=source_path(name)
 if p.suffix=='.csv': return list(csv.DictReader(p.open(encoding='utf-8-sig')))
 t=p.read_text(encoding='utf-8-sig')
 try: return json.loads(t)
 except json.JSONDecodeError: return [json.loads(l) for l in t.splitlines() if l.strip()]

def dump(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

def distance(a,b):
 p,q=map(math.radians,[a[1],b[1]])
 h=math.sin((q-p)/2)**2+math.cos(p)*math.cos(q)*math.sin(math.radians(b[0]-a[0])/2)**2
 return 6371000*2*math.asin(min(1,math.sqrt(h)))

def coords(el): return [list(map(float,p.split(','))) for p in (el.text or '').split()]

def kml_features(config):
 features=[]
 for i,p in enumerate(ET.parse(source_path(config['kml'])).findall('.//k:Placemark',NS)):
  name=(p.findtext('k:name',namespaces=NS) or 'Unnamed feature').strip()
  geom=None
  for kind in ['Point','LineString','Polygon']:
   g=p.find('k:'+kind,NS)
   if g is not None:
    if kind=='Polygon': c=[coords(el) for el in g.findall('.//k:coordinates',NS)]
    else: c=coords(g.find('k:coordinates',NS)); c=c[0] if kind=='Point' else c
    geom=dict(type=kind,coordinates=c);break
  if not geom: continue
  category='landmark'
  if geom['type']=='Polygon': category='boundary'
  elif geom['type']=='LineString':
   category='water' if any(x in name.lower() for x in ['water boundary','shore line','river boundary','water stream']) else 'route'
   if 'railway' in name.lower(): category='restricted_route'
  elif any(x in name.lower() for x in ['hospital','police','medical','traffic','watchtower','watch tower']): category='facility'
  props=dict(id=f"{config['id']}-kml-{i}",name=name,category=category,source_file=config['kml'],provenance='user_mapped',verification='field_verification_required')
  if geom['type']=='LineString':
   length=sum(distance(a,b) for a,b in zip(c,c[1:]));props.update(distance_m=round(length),duration_min=max(1,math.ceil(length/65)),difficulty='Moderate' if config['type']=='waterfall' else 'Easy',source_trace_count=0)
  features.append(dict(type='Feature',properties=props,geometry=geom))
 return features

def feature_collection(features): return dict(type='FeatureCollection',features=features)

def unwrap(data):
 if isinstance(data,list): return data
 for key in ['records','observations','events','alerts','computed_values','data','days']:
  if isinstance(data.get(key),list): return data[key]
 return [data]

def point(record):
 lat=record.get('latitude',record.get('lat'));lon=record.get('longitude',record.get('lng',record.get('lon')))
 return [float(lon),float(lat)] if lat is not None and lon is not None else None

def within(p,b): return b[0]<=p[0]<=b[2] and b[1]<=p[1]<=b[3]

def along(line,fraction):
 lengths=[distance(a,b) for a,b in zip(line,line[1:])];target=sum(lengths)*fraction
 for a,b,d in zip(line,line[1:],lengths):
  if target<=d:
   t=target/d if d else 0
   return [round(a[i]+(b[i]-a[i])*t,7) for i in [0,1]]
  target-=d
 return line[-1][:2]

def normalize_gps(records,site,routes,role):
 groups=defaultdict(list)
 for r in records:
  ident=r.get('tourist_id',r.get('user_id',r.get('rescue_unit_id',r.get('team_id','unknown'))))
  if point(r):groups[ident].append(r)
 output=[]; corrected=0
 route_list=[r for r in routes if r['properties']['category']=='route' and r['properties']['distance_m']>=100]
 for i,(ident,rows) in enumerate(sorted(groups.items())):
  rows.sort(key=lambda r:r.get('timestamp',''))
  bad=any(not within(point(r),site['bounds']) for r in rows)
  # Off-site synthetic beach tracks are regenerated along existing mapped paths.
  line=route_list[i%len(route_list)]['geometry']['coordinates']
  length=sum(distance(a,b) for a,b in zip(line,line[1:]))
  from datetime import datetime
  start=datetime.fromisoformat(rows[0]['timestamp'])
  for j,r in enumerate(rows):
   p=point(r)
   if bad:
    elapsed=max(0,(datetime.fromisoformat(r['timestamp'])-start).total_seconds())
    f=(i*.13+elapsed*.8/max(length,1))%2
    p=along(line,1-abs(1-f));corrected+=1
   output.append(dict(id=f"{site['id']}-{'visitor' if role=='visitor' else 'team'}-{i+1:02d}",lng=p[0],lat=p[1],timestamp=r.get('timestamp'),accuracy_m=float(r.get('accuracy_m',r.get('accuracy',r.get('gps_accuracy_m',8)))),source='synthetic_repaired' if bad else 'supplied_demo',role=role))
 return output,corrected

def make_bundle(site):
 all_features=kml_features(site)
 features=[f for f in all_features if not(site['id']=='calangute' and f['properties']['name']=='Polygon 1')]
 routes=[f for f in features if f['properties']['category']=='route']
 files={'calangute': ['calangute_danger_zones.geojson','calangute_swimming_restricted_zones.geojson','calangute_safe_zones.geojson','calangute_lifeguard_towers.geojson'],
 'muthathi':['muthathi_dynamic_danger_polygons.geojson','muthathi_danger_restricted_zones.geojson','muthathi_high_ground_safe_zones.geojson','muthathi_continuous_risk_surface_geojson_file.geojson','muthathi_elevation_slope_grid.geojson'],
 'dudhsagar':['hazard_zones_candidate.geojson','safe_zone_candidates.geojson','evacuation_route_candidate.geojson','dudhsagar_falls_danger_zone_synthetic.geojson']}[site['id']]
 layers=[]
 for file in files:
  data=read(file);fs=data['features'] if data['type']=='FeatureCollection' else [data]
  for i,f in enumerate(fs):
   p=f.setdefault('properties',{});p['source_file']=file;p['id']=p.get('id',p.get('zone_id',f"{file}-{i}"))
   p['provenance']='candidate' if 'candidate' in file or 'safe_zone' in file or 'high_ground' in file or 'lifeguard' in file else 'synthetic'
   p['verification']='field_verification_required'
   p['category']='candidate' if 'safe_zone' in file or 'high_ground' in file else 'facility' if 'lifeguard' in file else 'restricted_route' if 'evacuation_route' in file else 'terrain' if 'elevation' in file else 'risk_surface' if 'risk_surface' in file else 'hazard'
   p['level']=str(p.get('danger_level',p.get('zone_level','high'))).lower()
   p['name']=p.get('name',p.get('zone_id',p['category'].replace('_',' ').title()))
   # Estimated ML/confidence claims in inputs have no validated model behind them.
   p.pop('confidence_score',None);p.pop('confidence',None)
   repair=next((r for r in REPAIRS if r['site_id']==site['id'] and r['feature_id']==p['id']),None)
   if repair:
    def coordinates_close(a,b):
     if len(a)!=len(b):return False
     return all(abs(x-y)<1e-10 if isinstance(x,(int,float)) else coordinates_close(x,y) for x,y in zip(a,b))
    if not coordinates_close(f['geometry']['coordinates'],repair['original_geometry']['coordinates']):raise ValueError('Geometry repair is stale; inspect changed source before regenerating.')
    f['geometry']=repair['geometry'];p['topology_repair']='PostGIS ST_MakeValid; self-intersections split, no new survey evidence'
   layers.append(f)
 gps_files={'calangute':['calangute_tourist_gps_streamed_json.json','calangute_rescue_gps_stream_json.ndjson'],'muthathi':['muthathi_live_tourist_gps_streamed_json.jsonl','muthathi_live_rescue_gps_streamed_json.jsonl'],'dudhsagar':['tourist_gps_dudhsagar.json','rescue_team_gps_dudhsagar.json']}[site['id']]
 streams={};fixes=0
 for file,role in zip(gps_files,['visitor','team']):
  stream,c=normalize_gps(unwrap(read(file)),site,routes,role);streams[role]=stream;fixes+=c
 dump(ROOT/'data/normalized'/f"{site['id']}-gps.json",streams)
 # Keep full corrected tracks in the data archive; bounded replay frames in the browser.
 replay=[]
 for frame in range(61):
  frame_rows=[]
  for role,stream in streams.items():
   grouped=defaultdict(list)
   for r in stream:grouped[r['id']].append(r)
   for ident,rows in grouped.items(): frame_rows.append(rows[min(len(rows)-1,round(frame/60*(len(rows)-1)))])
  replay.append(frame_rows)
 if site['id']=='calangute':
  waves=read('calangute_wave_height_dummy.json'); currents=read('calangute_current_speed_dummy.json')
  wind=read('calangute_wind_data_sep2026.json');wind_rows=[dict(r,timestamp=d['date']+'T'+r['time']+':00+05:30') for d in wind['days'] for r in d['hourly']]
  timeline=[]
  for i,r in enumerate(waves):
   nearest=min(wind_rows,key=lambda w:abs(__import__('datetime').datetime.fromisoformat(w['timestamp']).timestamp()-__import__('datetime').datetime.fromisoformat(r['timestamp']).timestamp()))
   timeline.append(dict(timestamp=r['timestamp'],wave_height=r.get('wave_height_m'),flow_speed=currents[i].get('current_speed_mps'),wind=round(nearest['wind_speed_kts']*1.852,2),rainfall=None,water_level=None,temperature=None))
  tides=read('calangute_tides_sep2026.json');history=read('historical_incidents_calangute_json.json')
  raw_crowd=read('calangute_crowd_density_synthetic_json.json')['records'];first_time=raw_crowd[0]['timestamp'];raw_crowd=[x for x in raw_crowd if x['timestamp']==first_time]
  crowd=[]
  for i,r in enumerate(raw_crowd):
   p=along(routes[(i*3)%len(routes)]['geometry']['coordinates'],.5)
   crowd.append(dict(id=r['zone_id'],lng=p[0],lat=p[1],count=r['crowd_count'],area_m2=r['cell_area_sqm'],source='synthetic_repaired',source_timestamp=r['timestamp']))
 elif site['id']=='muthathi':
  timeline=[dict(timestamp=r['timestamp'],rainfall=r['rainfall_mm'],temperature=r['temperature_c'],wind=r['wind_speed_kmph'],water_level=None,flow_speed=None,wave_height=None) for r in read('muthathi_weather_timeseries_dummy.json')]
  tides=None;history=read('muthathi_historical_incidents_structured_records.json')['records']
  cr=read('muthathi_crowd_density_json.json')['observations'];first_time=cr[0]['timestamp']
  crowd=[dict(id=r['grid_id'],lat=r['lat'],lng=r['lng'],count=r['count'],source='supplied_synthetic',source_timestamp=r['timestamp']) for r in cr if r['timestamp']==first_time]
 else:
  timeline=[dict(timestamp=r['datetime'].replace(' ','T')+'+05:30',rainfall=float(r['synthetic_rainfall_1h_mm']),rainfall_3h=float(r['synthetic_rainfall_3h_mm']),rainfall_24h=float(r['synthetic_rainfall_24h_mm']),water_level=float(r['synthetic_water_level_m']),level_rise=float(r['hourly_rise_m']),flow_speed=None,wind=None,temperature=None,wave_height=None) for r in read('05_synthetic_dudhsagar_river_water_level.csv')]
  tides=None;history=read('05_verified_historical_incidents.json')
  cr=read('dudhsagar_falls_crowd_density_2026_synthetic.json');first_time=cr[0]['timestamp'];crowd=[]
  landmarks=[f for f in features if f['geometry']['type']=='Point']
  for i,r in enumerate([x for x in cr if x['timestamp']==first_time]):
   p=landmarks[i%len(landmarks)]['geometry']['coordinates'];crowd.append(dict(id=r['segment_id'],lng=p[0],lat=p[1],count=r['count'],source='synthetic_estimated_location',source_timestamp=r['timestamp']))
 for r in history:
  r['verification']='official_document_checked' if site['id']=='dudhsagar' else 'source_check_required';r['location_precision']='site-level only; do not use as a surveyed incident point'
  if site['id']=='dudhsagar':r['checked_on']='2026-09-08';r['document_page']=4
 for r in timeline:r['provenance']='synthetic' if site['id']!='calangute' else 'mixed_demo_and_transcribed';r['source_timestamp']=r['timestamp']
 bundle=dict(**site,features=feature_collection(features+layers),all_kml_features=len(all_features),routes_count=len(routes),timeline=timeline,replay=replay,crowd=crowd,history=history,tides=tides,corrections=dict(gps_records_regenerated=fixes,excluded_kml_features=1 if site['id']=='calangute' else 0),source_mode='demonstration',kml_url=f"/data/kml/{site['id']}.kml")
 dump(PUBLIC/f"{site['id']}.json",bundle)
 (PUBLIC/'kml').mkdir(parents=True,exist_ok=True);shutil.copy2(source_path(site['kml']),PUBLIC/'kml'/f"{site['id']}.kml")
 return {k:v for k,v in bundle.items() if k not in ['features','timeline','replay','crowd','history','tides']}

def main():
 inventory_path=ROOT/'tmp/audit/data-inventory.json'
 inventory=json.loads((inventory_path if inventory_path.exists() else ROOT/'data/manifest.json').read_text())
 manifest=[];catalog={}
 for item in inventory:
  name=item['file'];p=source_path(name)
  site='calangute' if 'calangute' in name.lower() else 'muthathi' if 'muthathi' in name or name=='kml file for river.kml' else 'dudhsagar'
  dest=RAW/site/name;dest.parent.mkdir(parents=True,exist_ok=True)
  if p.resolve()!=dest.resolve():shutil.copy2(p,dest)
  rows=[]
  if p.suffix in ['.json','.jsonl','.ndjson','.geojson','.csv']:
   data=read(name);rows=data['features'] if isinstance(data,dict) and 'features' in data else unwrap(data)
   dump(ROOT/'data/normalized/tables'/(name+'.json'),rows)
   catalog[name]={'sample':rows[:3],'keys':list(rows[0]) if rows and isinstance(rows[0],dict) else [],'sample_label':'Original supplied records; not necessarily verified or correctly located'}
  elif p.suffix=='.kml':catalog[name]={'sample':kml_features(next(s for s in CONFIG if s['id']==site))[:2],'sample_label':'Exact source geometry; metadata added in the derivative'}
  elif p.suffix=='.txt':catalog[name]={'sample':p.read_text(encoding='utf-8-sig').splitlines()[:3],'sample_label':'Supplied demonstration log'}
  elif p.suffix=='.tif':
   from PIL import Image
   image=Image.open(p);catalog[name]={'sample':{'width':image.width,'height':image.height,'mode':image.mode,'range':image.getextrema(),'geo_tags':{str(k):str(v) for k,v in image.tag_v2.items() if k in [33550,33922,34735,34737]}},'sample_label':'Synthetic raster metadata; not an authoritative DEM'}
  provenance='synthetic'
  if p.suffix=='.kml' or 'kml_' in name: provenance='user_mapped'
  if 'candidate' in name or 'verification' in name:provenance='candidate'
  if 'official' in name:provenance='source_reference'
  if 'historical' in name:provenance='reported_unverified'
  if name=='05_verified_historical_incidents.json':provenance='official_document_reference'
  if 'tides' in name or 'wind_data' in name:provenance='transcribed_unverified'
  if name in ['muthathi_kaveri_flow.jsonl','muthathi_kaveri_waterlevel.jsonl']:provenance='regional_reference_not_local_gauge'
  problems=[]
  if item.get('error'):problems.append('File extension is JSON but content is newline-delimited JSON; parsed as JSONL.')
  bound=next(x['bounds'] for x in CONFIG if x['id']==site)
  offsite=sum(1 for r in rows if isinstance(r,dict) and point(r) and not within(point(r),bound))
  if offsite:problems.append(f'{offsite} coordinate records outside the site bounds; raw retained, excluded or explicitly regenerated in demo derivatives.')
  if name=='SIH Calangute Beach.kml':problems.append('Polygon 1 is at Dudhsagar; Polygon 2 selected for Calangute display. Original KML unchanged.')
  if name=='muthathi_elevation_slope_grid.geojson':problems.append('Modeled ~690 m river baseline conflicts with KML higher-ground points near 428–433 m; excluded from route safety cost.')
  if name=='muthathi_danger_restricted_zones.geojson':problems.append('Two self-intersecting polygons repaired in the app derivative using PostGIS ST_MakeValid. Original rough GeoJSON and all KMLs remain unchanged.')
  if name=='evacuation_route_candidate.geojson':problems.append('Railway route blocked from pedestrian navigation pending authority verification.')
  if name=='calangute_wind_data_sep2026.json':problems.append('Wind knots converted to km/h (×1.852); visually transcribed directions remain approximate.')
  if 'safe_zone' in name or 'high_ground' in name:problems.append('Mapped or elevated does not establish evacuation safety; candidate status retained.')
  manifest.append(dict(file=name,site=site,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),records=len(rows) if rows else item.get('records',0),provenance=provenance,issues=problems))
 sites=[make_bundle(s) for s in CONFIG]
 dump(PUBLIC/'manifest.json',dict(version=1,prepared_at='2026-09-08',files=manifest,sites=sites,notice='Original KMLs are byte-preserved. Demonstration records are not real-time observations. No field-certified evacuation route or safe zone is asserted.'))
 dump(ROOT/'data/manifest.json',manifest)
 dump(PUBLIC/'catalog.json',catalog)
 print(f'Prepared {len(manifest)} source files and {len(sites)} sites. '+str({s['id']:s['corrections'] for s in sites}))

if __name__=='__main__':main()
