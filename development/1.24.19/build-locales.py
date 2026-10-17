"""Compile offline UI catalogs. Missing translations fail a production build."""
from pathlib import Path
import json,sys
root=Path(__file__).resolve().parent/'overlay/core';folder=root/'locales'
codes=['en','es','fr','ru','ar','zh-CN','zh-TW','ja','ko','de','pt-BR','it','hi','tr','pl']
keys=json.loads((folder/'en.json').read_text());result={'en':{k:k for k in keys}}
for code in codes[1:]:
 p=folder/(code+'.json')
 if not p.exists() and '--allow-incomplete' in sys.argv:result[code]={};continue
 data=json.loads(p.read_text());assert data.keys()==keys.keys(),code+' incomplete keys'
 assert all(isinstance(v,str) and v.strip() for v in data.values()),code+' blank translation'
 assert not any(any(0x202a<=ord(c)<=0x202e or 0x2066<=ord(c)<=0x2069 for c in v) for v in data.values()),code+' unexpected bidi control'
 result[code]=data
# Store English keys once instead of repeating them for every language. The
# runtime contract stays a language -> source -> translation object. Escaped '<'
# is safe when this script is embedded in the native desktop's script element.
packed={code:[result[code][k] for k in keys] for code in codes[1:]}
def js(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
body="globalThis.PlazCodeLocaleData=(()=>{const keys="+js(list(keys))+",values="+js(packed)+";const data={en:Object.fromEntries(keys.map(k=>[k,k]))};for(const [code,rows]of Object.entries(values))data[code]=Object.fromEntries(keys.map((k,i)=>[k,rows[i]]));return data;})();\n"
out=root/'i18n-catalog.js';out.write_text('// SPDX-License-Identifier: GPL-3.0-or-later\n// Generated offline from core/locales; no user content or network translation.\n'+body)
print(len(keys),'UI keys;',len(result),'languages;',out.stat().st_size,'bytes')
