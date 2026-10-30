import copy
import json
from pathlib import Path
import struct
import tempfile
import unittest

import numpy as np
from PIL import Image

from engine import Recipe, RecipeError, resolve
from build import build_asset, first_hits, plan_recipe

HERE = Path(__file__).resolve().parent


class RecipeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.test-', dir=HERE)
        self.root = Path(self.temp.name)
        self.assertEqual(self.root.resolve().parent, HERE)
        self.addCleanup(self.temp.cleanup)
        (self.root/'style.json').write_text(json.dumps({'version':1,'status':'candidate','materials':{
            'a':{'colors':['996633','bb8844'],'patchSize':.2}, 'b':{'colors':['334455']}}}))
        self.base = {'version':1,'id':'test','seed':7,'parameters':{},
            'space':{'min':[-1,-1,0],'max':[1,1,2],'voxelSize':.125,'worldUnitsPerTile':1,'footprintTiles':[1,1],'sizeStatus':'test'},
            'style':'style.json','nodes':{'shape':{'op':'box','center':[0,0,1],'size':[1,1,1],'material':'a'}},'output':'shape'}

    def recipe(self, document=None, overrides=None, seed=None):
        file = self.root/'recipe.json'
        file.write_text(json.dumps(document or self.base))
        return Recipe(file, overrides, seed)

    def build(self, nodes, output):
        document = copy.deepcopy(self.base)
        document.update(nodes=nodes, output=output)
        return self.recipe(document).build()[0]

    def test_parameter_expressions_and_unknown_override(self):
        d = copy.deepcopy(self.base)
        d['parameters'] = {'width':{'type':'number','default':1,'min':.25,'max':1.5}}
        d['nodes']['shape']['size'][0] = {'$param':'width'}
        a = self.recipe(d).build()[0]
        b = self.recipe(d, {'width':.5}).build()[0]
        self.assertEqual((b>0).sum()*2, (a>0).sum())
        self.assertEqual(resolve({'$mul':[2,{'$add':[1,2]}]},{}),6)
        for value in (2, True, float('nan')):
            with self.assertRaises(RecipeError): self.recipe(d, {'width':value})
        with self.assertRaises(RecipeError): self.recipe(d, {'widht':1})
        with self.assertRaises(RecipeError): resolve({'$eval':'open("anything")'}, {})
        with self.assertRaises(RecipeError): resolve({'$div':[1,0]}, {})

    def test_boolean_material_precedence_and_cutouts(self):
        nodes = {'a':self.base['nodes']['shape'], 'b':{'op':'box','center':[.5,0,1],'size':[1,1,1],'material':'b'}}
        a, b = self.build(nodes,'a'), self.build(nodes,'b')
        for op, expected in [('union',(a>0)|(b>0)),('intersection',(a>0)&(b>0))]:
            nodes['result']={'op':op,'inputs':['a','b']}
            actual=self.build(nodes,'result')
            np.testing.assert_array_equal(actual>0,expected)
            if op == 'union': self.assertTrue(np.all(actual[b>0]==3))
        nodes['result']={'op':'difference','base':'a','cut':'b'}
        np.testing.assert_array_equal(self.build(nodes,'result')>0,(a>0)&~(b>0))

    def test_transform_preserves_world_axes_and_rotates_shape(self):
        nodes={'a':{'op':'box','center':[0,0,1],'size':[1,.25,.5],'material':'b'},
            'rotated':{'op':'transform','input':'a','rotate':[0,0,90]},
            'shift':{'op':'transform','input':'a','translate':[.25,0,0]}}
        a,b=self.build(nodes,'a'),self.build(nodes,'rotated')
        np.testing.assert_array_equal(b>0,np.rot90(a>0,axes=(0,1)))
        np.testing.assert_array_equal(self.build(nodes,'shift')>0,np.roll(a>0,2,axis=0))

    def test_repeat_has_reproducible_seeded_geometry(self):
        d=copy.deepcopy(self.base)
        d['nodes']={'block':{'op':'box','center':[-.5,0,.5],'size':[.25,.25,.25],'material':'b'},
            'copies':{'op':'repeat','input':'block','count':3,'offset':[.5,0,0],'jitter':[0,.3,.2]}}
        d['output']='copies'
        a=self.recipe(d,seed=42).build()[0]
        np.testing.assert_array_equal(a,self.recipe(d,seed=42).build()[0])
        self.assertFalse(np.array_equal(a,self.recipe(d,seed=43).build()[0]))

    def test_paint_changes_only_occupied_intersection(self):
        nodes={'body':self.base['nodes']['shape'], 'mask':{'op':'box','center':[.5,0,1],'size':[1,2,2],'material':'b'},
            'painted':{'op':'paint','input':'body','mask':'mask','material':'b'}}
        a,b=self.build(nodes,'body'),self.build(nodes,'painted')
        np.testing.assert_array_equal(a>0,b>0)
        self.assertTrue(np.all(b[8:,:,:][a[8:,:,:]>0]==3))

    def test_lathe_stays_round_and_sweep_tapers(self):
        nodes={'lathe':{'op':'lathe','profile':[[.125,.3],[1,.6],[1.5,.3]],'material':'b'},
            'limb':{'op':'sweep','points':[[0,0,.125,.3],[0,0,1.5,.1]],'material':'a'}}
        a=self.build(nodes,'lathe')>0
        np.testing.assert_array_equal(a,np.swapaxes(a,0,1))
        np.testing.assert_array_equal(a,np.flip(a,axis=0))
        b=self.build(nodes,'limb')>0
        self.assertGreater(b[:,:,2].sum(),b[:,:,10].sum())

    def test_module_instances_parameters_and_recursive_library(self):
        library={'version':1,'modules':{'block':{'parameters':{'width':{'type':'number','default':1}},
            'nodes':{'a':{'op':'box','center':[0,0,1],'size':[{'$param':'width'},.5,.5],'material':'a'}},'output':'a'}}}
        (self.root/'modules.json').write_text(json.dumps(library))
        d=copy.deepcopy(self.base)
        d.update(libraries=['modules.json'],nodes={'shape':{'op':'module','module':'block','params':{'width':.5}}})
        volume=self.recipe(d).build()[0]
        self.assertEqual((volume>0).sum(),4**3)
        library['modules']['block']['nodes']['a']={'op':'module','module':'block'}
        (self.root/'modules.json').write_text(json.dumps(library))
        with self.assertRaisesRegex(RecipeError,'Recursive'): self.recipe(d).build()

    def test_cycles_missing_nodes_unknown_operations_and_fields_fail(self):
        cases=[{'op':'transform','input':'shape'}, {'op':'transform','input':'absent'},
            {'op':'python','code':'anything'}, {'op':'box','center':[0,0,0],'size':[1,1,1],'material':'a','typo':1},
            {'op':'ellipsoid','center':[0,0,1],'radii':[-1,1,1],'material':'a'}]
        for node in cases:
            with self.subTest(node=node), self.assertRaises(RecipeError): self.build({'shape':node},'shape')

    def test_physical_contract_rejects_fractional_or_oversized_grid(self):
        for update in ({'max':[1.01,1,2]},{'max':[100,1,2]},{'voxelSize':0},{'min':[-1,-1,-1]}):
            d=copy.deepcopy(self.base);d['space'].update(update)
            with self.subTest(update=update),self.assertRaises(RecipeError): self.recipe(d)

    def test_export_bundle_rebuild_and_refuse_overwrite(self):
        r=self.recipe()
        out=self.root/'output'
        report=build_asset(r.path,out)
        spec=json.loads((out/'source-bundle/build.json').read_text())
        again=self.root/'rebuilt'
        build_asset(out/'source-bundle'/spec['recipe'],again,spec['parameters'],spec['seed'])
        for name in ('asset.vox','asset.glb'):
            self.assertEqual((out/name).read_bytes(),(again/name).read_bytes())
        self.assertTrue(report['vox_roundtrip'])
        with Image.open(out/'six-view-clean.png') as sheet:
            self.assertEqual(sheet.size,(1536,1024))
        with self.assertRaises(RecipeError): build_asset(r.path,out)
        self.assertEqual((out/'asset.vox').read_bytes(),(again/'asset.vox').read_bytes())

    def test_glb_respects_asymmetric_ground_pivot(self):
        d=copy.deepcopy(self.base)
        d['space'].update(min=[-.5,-1,0],max=[1.5,1,2])
        d['nodes']['shape'].update(center=[.5,0,.5],size=[1,1,1])
        r=self.recipe(d);out=self.root/'asymmetric'
        build_asset(r.path,out)
        raw=(out/'asset.glb').read_bytes()
        length=struct.unpack_from('<I',raw,12)[0]
        gltf=json.loads(raw[20:20+length])
        self.assertEqual(gltf['accessors'][0]['min'],[0,-.5,0])
        self.assertEqual(gltf['accessors'][0]['max'],[1,.5,1])

    def test_empty_background_and_first_hit_occlusion(self):
        volume=np.zeros((4,4,4),dtype=np.uint8)
        volume[1,0,2],volume[1,3,2]=1,3
        self.assertEqual(first_hits(volume,'front')[1,1],1)
        self.assertEqual(first_hits(volume,'back')[1,2],3)
        for name in ('front','back','left','right','top','bottom'):
            self.assertEqual(np.count_nonzero(first_hits(volume,name)),2 if name in ('left','right','top','bottom') else 1)

    def test_real_recipes_and_parameter_variants(self):
        for name,overrides in [('oak',{'crownScale':.9}),('barrel',{'radius':.375,'height':.75})]:
            r=Recipe(HERE/'recipes'/f'{name}.json',overrides)
            a,p=r.build();b,q=Recipe(r.path,overrides).build()
            np.testing.assert_array_equal(a,b);np.testing.assert_array_equal(p,q)
            self.assertTrue((a[:,:,0]>0).any())
            self.assertLessEqual(a.max(),len(p))

    def test_shared_scale_profile_and_explicit_material_colors(self):
        oak=Recipe(HERE/'recipes/oak.json');barrel=Recipe(HERE/'recipes/barrel.json')
        self.assertEqual(oak.pitch,barrel.pitch)
        self.assertEqual(oak.pitch,.0625)
        self.assertEqual(oak.space['worldUnitsPerTile'],barrel.space['worldUnitsPerTile'])
        a,b=plan_recipe(oak),plan_recipe(barrel)
        for key in ('origins','pixelsPerVoxel','viewFrameGrid','cellSize','pixelsPerWorldUnit'):
            self.assertEqual(a[key],b[key])
        for recipe,height in ((oak,4),(barrel,1)):
            volume,_=recipe.build()
            indices=np.argwhere(volume>0)
            self.assertEqual((indices[:,2].max()+1)*recipe.pitch,height)
        d=copy.deepcopy(self.base)
        (self.root/'scale.json').write_text(json.dumps({'version':1,'voxelSize':.125,'worldUnitsPerTile':1}))
        d['scale']='scale.json'
        with self.assertRaisesRegex(RecipeError,'profile owns'): self.recipe(d)
        del d['space']['voxelSize'];del d['space']['worldUnitsPerTile']
        self.assertEqual(self.recipe(d).pitch,.125)
        solid=self.recipe().build()[0]
        self.assertEqual(set(np.unique(solid)),{0,1})


if __name__=='__main__': unittest.main()
