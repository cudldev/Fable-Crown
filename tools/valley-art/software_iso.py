"""CPU-only exact native cell-face inspection with unchanged common-scale pixel actor."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets/source/voxel/valley-onboarding'
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('asset');parser.add_argument('job');args=parser.parse_args();folder=BASE/args.asset/args.job
data=np.load(folder/'volume.npz');volume,palette=data['labels'],data['palette'];report=json.loads((folder/'report.json').read_text());pivot=np.array(report['physical_scale']['pivot_voxels']);pitch=.0625
eye=np.array([5.,-7.,5.]);eye/=np.linalg.norm(eye);right=np.array([-eye[1],eye[0],0]);right/=np.linalg.norm(right);up=np.cross(eye,right)
points=np.argwhere(volume>0);lo=(points.min(axis=0)-pivot)*pitch;hi=(points.max(axis=0)+1-pivot)*pitch
actor=np.array([lo[0]-.8,0.,0.]);actor_uv=np.array([actor@right,-actor@up]);corners=np.array([[x,y,z] for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (max(0,lo[2]),hi[2])]);uv=np.column_stack((corners@right,-corners@up))
mins=np.minimum(uv.min(axis=0),actor_uv-np.array([.58,1.15]));maxs=np.maximum(uv.max(axis=0),actor_uv+np.array([.58,0]))
size=np.maximum(maxs-mins,.1);ppm=max(64,int(min(1100/size[0],700/size[1])//16)*16);offset=np.array([640,470])-(mins+maxs)/2*ppm
image=Image.new('RGB',(1280,900),(232,229,216));draw=ImageDraw.Draw(image)
def project(p):return tuple(np.rint(np.array([p@right,-p@up])*ppm+offset).astype(int))
ground=[np.array([x,y,0.]) for x,y in [(lo[0]-1,lo[1]-1),(hi[0]+.8,lo[1]-1),(hi[0]+.8,hi[1]+1),(lo[0]-1,hi[1]+1)]];draw.polygon([project(p) for p in ground],fill=(181,181,156))
for x in range(int(np.floor(lo[0]-1)),int(np.ceil(hi[0]+1))):draw.line([project(np.array([x,lo[1]-1,0.])),project(np.array([x,hi[1]+1,0.]))],fill=(166,170,147),width=1)
for y in range(int(np.floor(lo[1]-1)),int(np.ceil(hi[1]+1))):draw.line([project(np.array([lo[0]-1,y,0.])),project(np.array([hi[0]+1,y,0.]))],fill=(166,170,147),width=1)
faces=[]
for cell in points:
    x,y,z=[int(v) for v in cell];base=(cell-pivot)*pitch;rgb=palette[int(volume[x,y,z])-1].astype(float)
    specs=[((1,0,0),[(1,0,0),(1,1,0),(1,1,1),(1,0,1)],.88),((0,-1,0),[(0,0,0),(1,0,0),(1,0,1),(0,0,1)],.95),((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)],1.)]
    for delta,corners,shade in specs:
        neighbor=cell+np.array(delta)
        if ((neighbor>=0)&(neighbor<np.array(volume.shape))).all() and volume[tuple(neighbor)]>0:continue
        world=[base+np.array(c)*pitch for c in corners]
        if max(p[2] for p in world)<0:continue
        faces.append((np.mean(world,axis=0)@eye,world,tuple(np.rint(rgb*shade).astype(int))))
for depth,world,color in sorted(faces,key=lambda v:v[0]):draw.polygon([project(p) for p in world],fill=color)
# Screen-aligned billboard; native body source is an unchanged copy for scale only.
body=Image.open(BASE/'pixel-actions-v1/body-unchanged.png').convert('RGBA');cell_pixels=ppm//16;body=body.resize((32*cell_pixels,32*cell_pixels),Image.Resampling.NEAREST);foot=np.array(project(actor));image.paste(body,tuple((foot-np.array([16,28])*cell_pixels).astype(int)),body)
draw.text((22,18),args.asset+' / '+args.job+' - actual native volume, CPU isometric inspection',fill=(45,49,42));draw.text((22,40),'Shared pitch6.25cm; unchanged body1.125m; '+str(ppm)+'pixels/metre. Face shading is preview-only; source RGB unchanged.',fill=(65,68,56));image.save(folder/'software-iso.png')
(folder/'software-review.json').write_text(json.dumps({'source':'volume.npz labels and palette; exact visible cube faces','gpuUsed':False,'pixelsPerMetre':ppm,'pitchMetres':pitch,'bodyHeightMetres':1.125,'bodyPixelsUnchanged':True,'previewShading':'flat face factors0.88/0.95/1.0 only; not baked into source','actualGameCameraReviewed':False,'artApproved':False},indent=2)+'\n');print('CPU_NATIVE_PREVIEW',folder/'software-iso.png')
