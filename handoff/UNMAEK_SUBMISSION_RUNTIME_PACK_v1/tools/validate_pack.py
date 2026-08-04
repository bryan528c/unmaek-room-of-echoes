#!/usr/bin/env python3
import json, sys
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
errors=[]; warns=[]; passes=[]
def ok(name, cond, detail=""):
    (passes if cond else errors).append((name,detail))
def load(p):
    try: return json.loads((ROOT/p).read_text(encoding="utf-8"))
    except Exception as e: errors.append((f"JSON {p}",str(e))); return {}
cm=load("manifest/creature_manifest_v1.json"); mm=load("manifest/map_manifest_v1.json"); ds=load("manifest/display_strings_v1.json")
creatures=cm.get("creatures",[]); maps=mm.get("maps",[])
ok("creature manifest 11 entries",len(creatures)==11,str(len(creatures)))
ok("boss subset 3 entries",sum(c.get("role")=="boss" for c in creatures)==3)
ok("map manifest 6 entries",len(maps)==6,str(len(maps)))
slots=0; unique=0; aliases=0
for c in creatures:
    states=c.get("states",{}); als=c.get("stateAliases",{}); slots+=len(states)+len(als); unique+=len(states); aliases+=len(als)
    ok(f"{c.get('id')} common canvas",all(Image.open(ROOT/s["file"]).size==(c["canvasSize"]["width"],c["canvasSize"]["height"]) for s in states.values()))
    for s,v in states.items():
        p=ROOT/v["file"]; ok(f"file {v['file']}",p.is_file())
        if p.is_file():
            im=Image.open(p); ok(f"alpha {v['file']}","A" in im.getbands());
            if "A" in im.getbands(): ok(f"transparent corner {v['file']}",im.getchannel("A").getpixel((0,0))==0)
    for s,a in als.items():
        ok(f"alias {c['id']}:{s}",a.get("sourceState") in states and a.get("sourceState")!=s)
    gp=c["groundPoint"]["original"]["normalized"]; ok(f"ground point {c['id']}",0<=gp["x"]<=1 and 0<=gp["y"]<=1)
    hb=c.get("hurtbox")
    if hb:
        r=hb["original"]; W=c["canvasSize"]["width"]; H=c["canvasSize"]["height"]
        ok(f"hurtbox bounds {c['id']}",r["x"]>=0 and r["y"]>=0 and r["x"]+r["width"]<=W and r["y"]+r["height"]<=H)
        if c["directionMode"]!="fixed":
            f=hb["flippedX"]; ok(f"flipX hurtbox {c['id']}",f["x"]==W-r["x"]-r["width"])
    if c["directionMode"]!="fixed":
        f=c["groundPoint"]["flippedX"]["normalized"]; ok(f"flipX anchor {c['id']}",abs(f["x"]-(1-gp["x"]))<1e-6)
    if c["role"]=="boss": ok(f"boss phase map {c['id']}",bool(c.get("bossPhaseMap")))
ok("required state slots 58",slots==58,str(slots)); ok("unique PNG count 41",unique==41,str(unique)); ok("alias count 17",aliases==17,str(aliases))
for m in maps:
    for key in ["backgroundFile","collisionMaskFile"]: ok(f"map file {m['id']} {key}",(ROOT/m[key]).is_file())
    bg=Image.open(ROOT/m["backgroundFile"]); co=Image.open(ROOT/m["collisionMaskFile"])
    ok(f"map background size {m['id']}",bg.size==(1280,720)); ok(f"collision size {m['id']}",co.size==(1280,720))
    colors=set(co.convert("L").getdata()); ok(f"collision binary {m['id']}",colors.issubset({0,255}) and colors=={0,255},str(colors))
    hz=None
    if m.get("hazardMaskFile"):
        hz=Image.open(ROOT/m["hazardMaskFile"]).convert("L"); colors=set(hz.getdata()); ok(f"hazard binary {m['id']}",hz.size==(1280,720) and colors.issubset({0,255}),str(colors))
    points=[m["playerSpawn"]]+m.get("enemySpawnSlots",[])+([m["bossSpawn"]] if m.get("bossSpawn") else [])
    for p in points:
        x,y=int(p["x"]),int(p["y"]); inside=0<=x<1280 and 0<=y<720
        safe=inside and co.getpixel((x,y))==255 and (hz is None or hz.getpixel((x,y))==0)
        ok(f"spawn safe {m['id']} {p.get('id','point')}",safe,f"{x},{y}")
for c in creatures:
    for v in list(c.get("masterFiles",{}).values())+list(c.get("runtimeFiles",{}).values()): ok(f"manifest ref {v}",(ROOT/v).is_file())
    for o in c.get("optionalOverlays",[]): ok(f"overlay ref {o['file']}",(ROOT/o["file"]).is_file())
forbidden=["background-cue","chaser-melee","projectile","area-control","defense-melee","boss-3phase"]
def display_values(value):
    if isinstance(value,dict):
        for item in value.values(): yield from display_values(item)
    elif isinstance(value,list):
        for item in value: yield from display_values(item)
    elif isinstance(value,str): yield value
text=" ".join(display_values(ds))
ok("display strings hide internal roles",not any(x in text for x in forbidden))
if errors:
    print("FAIL")
    for n,d in errors: print("FAIL",n,d)
    sys.exit(1)
print("PASS")
for n,d in passes: print("PASS",n,d)
print(f"SUMMARY creatures={len(creatures)} bosses={sum(c.get('role')=='boss' for c in creatures)} maps={len(maps)} slots={slots} unique={unique} aliases={aliases}")
