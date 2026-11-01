"""Exact native held-tool/shield poses; never modify the approved body or runtime."""
import json
import math
from pathlib import Path
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/source/voxel/valley-onboarding/pixel-actions-v1';OUT.mkdir(exist_ok=True)
TRACE=['.....HHHHHHHH.......','...HHHHHHHHHHHH..tt.','...hhSSSSSSSShh..TT.','...SSEESSSSEESS..TT.','.DDBBSSSSSSSSBBDDTT.','GGGDDBBBBBBBBDDGGGGG','DDDDDDDGGGGDDDDDDKK.','DDDWWWWWWWWWWWWDDAA.','...FFFF....FFFF.....']
P={'H':(140,78,54),'h':(136,76,54),'S':(253,213,155),'E':(60,38,28),'B':(66,94,191),'D':(45,67,126),'G':(249,199,101),'W':(248,238,215),'F':(128,75,58),'T':(178,172,169),'t':(208,202,196),'K':(148,84,60),'A':(253,214,155),'wood':(148,84,60),'woodLight':(166,116,65),'metal':(178,172,169),'gold':(249,199,101),'cream':(232,219,177),'shieldWood':(143,95,53),'shieldLight':(166,116,65),'shieldGold':(222,171,63)}
body={};sword={}
for row,line in enumerate(TRACE):
    for col,token in enumerate(line):
        if token not in P:continue
        target=body if col<17 else sword
        if col>=17 and token=='A':continue
        for dy in range(2):target[(7+col,10+row*2+dy)]=token

def rect(a,x,y,w,h,token):
    for py in range(y,y+h):
        for px in range(x,x+w):a[(px,py)]=token

tools={'sword':sword}
for name in ('axe','pickaxe','hammer','rod','bow'):
    a={};x,y,s=24,24,2
    if name=='axe':rect(a,x,y-5*s,s,5*s,'wood');rect(a,x+s,y-5*s,2*s,2*s,'metal')
    elif name=='pickaxe':
        rect(a,x,y-5*s,s,5*s,'wood');rect(a,x-2*s,y-5*s,5*s,s,'metal');rect(a,x-2*s,y-4*s,s,s,'metal');rect(a,x+2*s,y-4*s,s,s,'metal')
    elif name=='hammer':rect(a,x,y-4*s,s,4*s,'wood');rect(a,x-s,y-5*s,3*s,2*s,'metal')
    elif name=='rod':rect(a,x,y-7*s,1,7*s,'wood');rect(a,x+1,y-7*s,2*s,1,'cream');rect(a,x+2*s,y-7*s+1,1,4*s,'cream')
    else:rect(a,x+s,y-5*s,s,5*s,'wood');rect(a,x,y-6*s,s,s,'wood');rect(a,x,y-5*s,1,5*s,'cream')
    tools[name]=a

SHIELD=['.GGGGGG.','GGWLLWGG','GWWLLWWG','GWWGGWWG','GWWGGWWG','GWWLLWWG','GGWLLWGG','.GWLLWG.','..GWWG..','...GG...']
shield_tokens={'G':'shieldGold','W':'shieldWood','L':'shieldLight'}
shield={(21+x,19+y):shield_tokens[t] for y,row in enumerate(SHIELD) for x,t in enumerate(row) if t!='.'}
tools['shield']=shield
POSES={'rest':{'frame':0,'angleDegrees':0,'gripOffset':[0,0]},'windup':{'frame':5,'angleDegrees':0,'gripOffset':[0,-2]},'contact':{'frame':6,'angleDegrees':30,'gripOffset':[-3,-1]},'recovery':{'frame':7,'angleDegrees':12,'gripOffset':[-1,0]},'guard':{'frame':5,'angleDegrees':0,'gripOffset':[0,-3]}}

def transform(source,pose,name):
    settings=POSES[pose];angle=math.radians(settings['angleDegrees']);c,s=math.cos(angle),math.sin(angle)
    dx,dy=settings['gripOffset']
    if name=='rod' and pose=='contact':dx=-4
    px,py=25,25
    result={}
    # Inverse nearest-cell sampling: strict integer cell edges, no antialiasing.
    for y in range(-8,40):
        for x in range(-8,40):
            tx,ty=x+.5-(px+dx),y+.5-(py+dy)
            sx,sy=math.floor(c*tx+s*ty+px),math.floor(-s*tx+c*ty+py)
            if (sx,sy) in source:result[(x,y)]=source[(sx,sy)]
    assert all(0<=x<32 and 0<=y<32 for x,y in result), (name,pose,'clipped source cell')
    return result,(24+dx,24+dy)

def png(cells,size=(32,32),offset=(0,0)):
    image=Image.new('RGBA',size)
    for (x,y),token in cells.items():image.putpixel((x-offset[0],y-offset[1]),(*P[token],255))
    return image

recipe={'id':'fable-original-held-action-v1','nativeCellPitchMetres':.0625,'canvasPixels':[32,32],'bodySource':'src/render/pixel-units.ts ALDEN_TRACE col<17; unchanged preview copy only','bodyOccupiedPixels':[17,18],'footAnchorPixels':[16,28],'baseHandGripTopLeftPixels':[24,24],'baseHandSizePixels':[2,2],'rotationPivotPixelCentre':[25,25],'poses':POSES,'sampling':'inverse nearest-cell lookup, floor source coordinates after rotation around pixel-centre pivot; retain0/255 alpha and unchanged native cell pitch','paletteRGB':{k:list(v) for k,v in P.items()},'tools':{},'integration':{'runtimeOwnership':'lead; no shared pixel-unit or renderer source was edited','atlas':'Map source authored frames5/6/7 directly; existing renderer frame6->held1 and7->held0 would discard these silhouettes','toolHandTogether':'Apply the same pose grip offset to the2x2 holding hand. Body/feet remain still. Rod contact alone needsXoffset-4 to avoid atlas clipping.','shieldOrder':'Shield only whileblocking; active guard grip is[24,21], tool origin[21,16],8x10cells. Draw existing skin hand behind shield face forguard, or omit the occluded hand. No sword retained underneath.','normals':'Keep zero emission. Use flat normals initially or inverse-transform authored source normal coordinates with the same pose; do not treat pigment variation as height.','authority':'Pure presentation only; visual contact never awards damage/resources or sets60Hz action deadlines.'}}
review=Image.new('RGB',(5*320+200,7*340+50),(232,229,216));draw=ImageDraw.Draw(review)
for c,pose in enumerate(POSES):draw.text((210+c*320,12),pose,fill=(45,49,42))
for row,(name,source) in enumerate(tools.items()):
    draw.text((14,70+row*340),name,fill=(45,49,42));tool_record={'sourceCells':[{'x':x,'y':y,'pigment':t} for (x,y),t in sorted(source.items())],'frames':{}}
    for col,pose in enumerate(POSES):
        if (name=='shield')!=(pose=='guard') and name=='shield':continue
        if pose=='guard' and name!='shield':continue
        cells,grip=transform(source,pose,name);hand={}
        rect(hand,grip[0],grip[1],2,2,'A')
        combined={**body,**hand,**cells} if name=='shield' else {**body,**cells,**hand}
        native=png(cells);native.save(OUT/(name+'-'+pose+'-tool.png'));png(combined).save(OUT/(name+'-'+pose+'-assembled.png'))
        bigger=png(combined).resize((320,320),Image.Resampling.NEAREST);review.paste(bigger,(200+col*320,40+row*340),bigger)
        tool_record['frames'][pose]={'atlasFrame':POSES[pose]['frame'],'gripTopLeft':list(grip),'toolCells':[{'x':x,'y':y,'pigment':t} for (x,y),t in sorted(cells.items())],'nativeToolPNG':name+'-'+pose+'-tool.png','assembledPNG':name+'-'+pose+'-assembled.png'}
    recipe['tools'][name]=tool_record
png(body).save(OUT/'body-unchanged.png');review.save(OUT/'pose-review.png')
local={(x-21,y-19):t for (x,y),t in shield.items()};png(local,(8,10)).save(OUT/'shield-native.png')
guard=png({**body,**transform(shield,'guard','shield')[0]});guard.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(OUT/'shield-guard-mirrored.png')
(OUT/'recipe.json').write_text(json.dumps(recipe,indent=2)+'\n');print('ACTION_PIXEL_RECIPE',OUT,len(tools),'tools; body unchanged; allposesinside32x32')
