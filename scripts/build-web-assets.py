"""Build static bundles and lossless on-demand map data; Python standard library only."""
from pathlib import Path
import json,gzip,hashlib,re
root=Path(__file__).resolve().parents[1];dist=root/'dist';order=json.loads((root/'scripts/web-assets.json').read_text());packed=dist/'packed';packed.mkdir(exist_ok=True)
config={};sizes={};skip={}
for id,file,key in [('world','world-map.js','CBWorldMap'),('m1','m1-public-data.js','CBM1PublicData'),('conflict','conflict-data.js','CBConflictData'),('exposure','exposure-data.js','CBExposureData')]:
 source=(dist/file).read_bytes();text=source.decode();value=json.loads(text.split('window.'+key+'=',1)[1].strip().rstrip(';'));raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode();payload=gzip.compress(raw,compresslevel=9,mtime=0);name=id+'.json.gz';(packed/name).write_bytes(payload);h=hashlib.sha256(payload).hexdigest()[:12]
 config[id]={'global':key,'packed':'packed/'+name+'?v='+h,'script':file+'?v='+hashlib.sha256(source).hexdigest()[:12]};sizes[id]={'original':len(source),'packed':len(payload)}
 if id=='m1':config[id]['summary']={'pricingSample':value['pricingSample'],'count':len(value['events'])}
 skip[file]=("window.CBWorldMap="+json.dumps({'points':value['points']},separators=(',',':'))+';')if id=='world'else''
event_urls={}
for f in sorted((dist/'events').glob('*.json')):
 payload=gzip.compress(f.read_bytes(),compresslevel=9,mtime=0);name='events-'+f.stem+'.json.gz';(packed/name).write_bytes(payload);event_urls[f.stem]='packed/'+name+'?v='+hashlib.sha256(payload).hexdigest()[:12]
parts=['window.CBEventManifest='+json.dumps(event_urls,separators=(',',':'))+';','window.CBRiskManifest='+json.dumps(config,separators=(',',':'))+';']
for name in order['scripts']:parts.append(skip[name] if name in skip else (dist/name).read_text())
js='\n;\n'.join(parts);css='\n'.join((dist/name).read_text() for name in order['styles']);(dist/'app.bundle.js').write_text(js);(dist/'app.bundle.css').write_text(css)
h=hashlib.sha256((js+css).encode()).hexdigest()[:12];index=(dist/'index.html').read_text();index=re.sub(r'  <link rel="stylesheet"[^>]*>\n','',index);index=re.sub(r'  <script defer[^>]*></script>\n','',index);index=index.replace('</head>',f'  <link rel="stylesheet" href="app.bundle.css?v={h}">\n  <script defer src="app.bundle.js?v={h}"></script>\n</head>');(dist/'index.html').write_text(index)
print(json.dumps({'version':h,'initialBytes':len(js.encode())+len(css.encode()),'datasets':sizes},indent=2))
