"""Sample public Mapzen Terrarium terrain; never replace source KML elevations."""
import json, math, io, urllib.request
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
cache={}
def height(lng,lat):
 z=12;n=2**z;x=(lng+180)/360*n;y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
 key=(int(x),int(y))
 if key not in cache:
  url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{key[0]}/{key[1]}.png'
  with urllib.request.urlopen(url,timeout=40) as r: cache[key]=Image.open(io.BytesIO(r.read())).convert('RGB')
 r,g,b=cache[key].getpixel((min(255,int((x%1)*256)),min(255,int((y%1)*256))))
 return round(r*256+g+b/256-32768,1)
for site in ['calangute','muthathi','dudhsagar']:
 p=root/'frontend/public/data'/f'{site}.json';s=json.loads(p.read_text());b=s['bounds'];points=[]
 for y in range(33):
  for x in range(33):
   lng=b[0]+(b[2]-b[0])*x/32;lat=b[1]+(b[3]-b[1])*y/32
   points.append([round(lng,7),round(lat,7),height(lng,lat)])
 dem={'source':'Mapzen Terrain Tiles / AWS Open Data (SRTM and other sources)','url':'https://registry.opendata.aws/terrain-tiles/','retrieved_at':'2026-09-09','encoding':'Terrarium','tile_zoom':12,'bounds':b,'size':33,'points':points,'limitation':'Regional terrain visualization; resampling adds no survey detail. Not bathymetry or a flood model.'}
 (root/'frontend/public/data/elevation').mkdir(exist_ok=True)
 (root/'frontend/public/data/elevation'/f'{site}.json').write_text(json.dumps(dem))
 print(site,min(p[2] for p in points),max(p[2] for p in points),len(points))
