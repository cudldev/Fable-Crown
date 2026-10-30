"""Local, declarative voxel recipe graph. No eval, generators or network services."""
from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path

import numpy as np


class RecipeError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise RecipeError(message)


def number(value, label, positive=False):
    require(isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and (not positive or value > 0), f'{label}: finite {"positive " if positive else ""}number required')
    return float(value)


def vector(value, label):
    require(isinstance(value, list) and len(value) == 3, f'{label}: XYZ array required')
    return np.array([number(v, label) for v in value])


def resolve(value, params):
    if isinstance(value, list):
        return [resolve(v, params) for v in value]
    if not isinstance(value, dict):
        return value
    if '$param' in value:
        require(len(value) == 1 and value['$param'] in params, f'Unknown parameter: {value}')
        return copy.deepcopy(params[value['$param']])
    arithmetic = {'$add', '$mul', '$sub', '$div'} & value.keys()
    if arithmetic:
        require(len(value) == 1, 'Expression must contain one operator')
        op = next(iter(arithmetic))
        values = resolve(value[op], params)
        require(isinstance(values, list) and len(values) >= 2, f'{op}: two or more operands required')
        values = [number(v, op) for v in values]
        if op == '$add': return sum(values)
        if op == '$mul': return math.prod(values)
        require(len(values) == 2, f'{op}: exactly two operands required')
        if op == '$sub': return values[0]-values[1]
        require(values[1] != 0, 'Division by zero')
        return values[0]/values[1]
    require(not any(k.startswith('$') for k in value), f'Unknown expression: {value}')
    return {k: resolve(v, params) for k, v in value.items()}


def parameters(definitions, supplied):
    require(isinstance(definitions, dict) and isinstance(supplied, dict), 'Parameters must be objects')
    require(not supplied.keys()-definitions.keys(), f'Unknown parameters: {supplied.keys()-definitions.keys()}')
    result = {}
    for key, spec in definitions.items():
        require(isinstance(spec, dict) and 'type' in spec and 'default' in spec, f'{key}: type/default required')
        require(not spec.keys()-{'type', 'default', 'min', 'max', 'description'}, f'{key}: unknown parameter fields')
        value = supplied.get(key, spec['default'])
        kind = spec['type']
        if kind in ('number', 'integer'):
            number(value, key)
            require(kind != 'integer' or isinstance(value, int), f'{key}: integer required')
            require(value >= spec.get('min', -math.inf) and value <= spec.get('max', math.inf), f'{key}: outside allowed range')
        elif kind == 'vector': vector(value, key)
        elif kind == 'material': require(isinstance(value, str) and value, f'{key}: material name required')
        elif kind == 'points':
            require(isinstance(value, list) and len(value) >= 2, f'{key}: at least two XYZR points required')
            for point in value:
                require(isinstance(point, list) and len(point) == 4, f'{key}: XYZR required')
                vector(point[:3], key)
                number(point[3], key, positive=True)
        else: raise RecipeError(f'{key}: unknown parameter type {kind}')
        result[key] = copy.deepcopy(value)
    return result


# Allowed fields double as the versioned node contract; typos fail explicitly.
FIELDS = {
    'box': ({'center', 'size', 'material'}, set()),
    'ellipsoid': ({'center', 'radii', 'material'}, {'exponent', 'step'}),
    'sweep': ({'points', 'material'}, set()),
    'lathe': ({'profile', 'material'}, {'center'}),
    'union': ({'inputs'}, set()),
    'intersection': ({'inputs'}, set()),
    'difference': ({'base', 'cut'}, set()),
    'transform': ({'input'}, {'translate', 'rotate', 'scale'}),
    'repeat': ({'input', 'count', 'offset'}, {'jitter'}),
    'module': ({'module'}, {'params'}),
    'paint': ({'input', 'mask', 'material'}, set()),
}


def validate_graph(graph):
    require(isinstance(graph, dict) and isinstance(graph.get('nodes'), dict) and graph['nodes'], 'Nonempty nodes object required')
    require(graph.get('output') in graph['nodes'], 'Graph output must name a node')
    for name, node in graph['nodes'].items():
        require(isinstance(node, dict) and node.get('op') in FIELDS, f'{name}: unknown node operation')
        needed, optional = FIELDS[node['op']]
        require(needed <= node.keys(), f'{name}: missing fields {needed-node.keys()}')
        require(not node.keys()-needed-optional-{'op'}, f'{name}: unknown fields {node.keys()-needed-optional-{"op"}}')


class Recipe:
    def __init__(self, path, overrides=None, seed=None):
        self.path = Path(path).resolve()
        self.sources = {}
        self.document = self.read(self.path)
        d = self.document
        require(d.get('version') == 1, 'Unsupported recipe version')
        require(not d.keys()-{'version', 'id', 'description', 'seed', 'parameters', 'space', 'scale', 'style', 'libraries', 'nodes', 'output', 'checks'}, 'Unknown recipe fields')
        require(isinstance(d.get('id'), str) and d['id'], 'Recipe id required')
        self.params = parameters(d.get('parameters', {}), overrides or {})
        self.seed = d.get('seed', 0) if seed is None else seed
        require(isinstance(self.seed, int) and not isinstance(self.seed, bool) and 0 <= self.seed < 2**32, 'Seed must be a uint32')
        self.space = resolve(d['space'], self.params)
        self.scale = None
        if 'scale' in d:
            self.scale = self.read(self.path.parent/d['scale'])
            require(self.scale.get('version') == 1, 'Unsupported scale profile version')
            require(not {'voxelSize', 'worldUnitsPerTile'} & self.space.keys(), 'Shared scale profile owns voxelSize/worldUnitsPerTile; remove per-asset overrides')
            self.space.update({k: self.scale[k] for k in ('voxelSize', 'worldUnitsPerTile')})
        require(not self.space.keys()-{'min', 'max', 'voxelSize', 'worldUnitsPerTile', 'footprintTiles', 'sizeStatus'}, 'Unknown space fields')
        pitch = number(self.space['voxelSize'], 'voxelSize', positive=True)
        self.low = vector(self.space['min'], 'space.min')
        high = vector(self.space['max'], 'space.max')
        require(np.all(high > self.low), 'Bounds must have positive extent')
        low_grid, high_grid = self.low/pitch, high/pitch
        require(np.allclose(low_grid, np.rint(low_grid), atol=1e-7, rtol=0) and np.allclose(high_grid, np.rint(high_grid), atol=1e-7, rtol=0), 'Bounds must align to cubic voxel grid')
        self.shape = tuple(int(n) for n in np.rint(high_grid-low_grid))
        require(min(self.shape) >= 1 and max(self.shape) <= 256 and math.prod(self.shape) <= 2_000_000, 'Grid must fit 256 per axis and two million cells')
        require(self.low[2] == 0 and self.low[0] <= 0 <= high[0] and self.low[1] <= 0 <= high[1], 'Ground pivot must be inside XY bounds; min Z must be zero')
        tile = number(self.space['worldUnitsPerTile'], 'worldUnitsPerTile', positive=True)
        require(math.isclose(tile/pitch, round(tile/pitch), abs_tol=1e-7), 'Integer voxels per tile required')
        footprint = self.space['footprintTiles']
        require(isinstance(footprint, list) and len(footprint) == 2 and all(isinstance(v, int) and not isinstance(v, bool) and v > 0 for v in footprint), 'Positive integer footprintTiles pair required')
        require(isinstance(self.space.get('sizeStatus'), str), 'Declare physical sizeStatus')
        self.pitch = pitch
        self.pivot = (-self.low/pitch).tolist()
        style = self.read(self.path.parent/d['style'])
        require(style.get('version') == 1 and style.get('status') in ('exploration', 'candidate', 'approved'), 'Style version/status required')
        self.materials, palette = {}, []
        for name, spec in style['materials'].items():
            require(not spec.keys()-{'colors', 'patchSize', 'pattern'}, f'{name}: unknown material fields')
            require(spec.get('pattern', 'solid') in ('solid', 'patches'), f'{name}: solid or patches pattern required')
            require(isinstance(spec.get('colors'), list) and spec['colors'], f'{name}: colors required')
            ids = []
            for code in spec['colors']:
                require(isinstance(code, str) and len(code) == 6 and all(c in '0123456789abcdefABCDEF' for c in code), f'{name}: six digit RGB required')
                palette.append([int(code[i:i+2], 16) for i in (0, 2, 4)])
                ids.append(len(palette))
            self.materials[name] = (ids, number(spec.get('patchSize', .25), name+'.patchSize', positive=True), spec.get('pattern', 'solid'))
        require(0 < len(palette) <= 255, 'Palette must contain 1..255 colors')
        self.palette = np.array(palette, dtype=np.uint8)
        self.style = style
        self.modules = {}
        for file in d.get('libraries', []):
            library = self.read(self.path.parent/file)
            require(library.get('version') == 1, 'Unsupported module library version')
            for name, module in library['modules'].items():
                require(name not in self.modules, 'Duplicate module '+name)
                validate_graph(module)
                self.modules[name] = module
        validate_graph(d)
        axes = [self.low[i]+(np.arange(self.shape[i])+.5)*pitch for i in range(3)]
        self.coords = tuple(np.meshgrid(*axes, indexing='ij'))

    def read(self, file):
        file = Path(file).resolve()
        raw = file.read_bytes()
        self.sources[str(file)] = hashlib.sha256(raw).hexdigest()
        return json.loads(raw.decode('utf-8-sig'))

    def stable_seed(self, name):
        return int.from_bytes(hashlib.sha256(f'{self.seed}:{name}'.encode()).digest()[:8], 'little')

    def color(self, name, coords):
        require(name in self.materials, f'Unknown material: {name}')
        ids, size, pattern = self.materials[name]
        if len(ids) == 1 or pattern == 'solid': return np.full(self.shape, ids[0], dtype=np.uint8)
        phase = np.random.default_rng(self.stable_seed('material:'+name)).uniform(-math.pi, math.pi, 3)
        x, y, z = [np.floor(c/size)*size for c in coords]
        field = (np.sin(x/size*.71+z/size*.31+phase[0]) + np.cos(y/size*.57-z/size*.29+phase[1]) + np.sin(z/size*.41+x/size*.19+phase[2]))/3
        indices = np.clip(((field+1)*.5*len(ids)).astype(int), 0, len(ids)-1)
        return np.array(ids, dtype=np.uint8)[indices]

    def graph(self, graph, params, coords, output=None, trail=(), scope='root', memo=None):
        name = output or graph['output']
        key = scope+':'+name
        require(key not in trail and len(trail) < 80, 'Cyclic or excessive graph expansion: '+key)
        require(name in graph['nodes'], 'Missing node '+key)
        memo = {} if memo is None else memo
        if name in memo: return memo[name]
        trail = (*trail, key)
        node = resolve(graph['nodes'][name], params)
        op = node['op']

        def child(ref, at=None, suffix=''):
            return self.graph(graph, params, coords if at is None else at, ref, trail, scope+suffix, memo if at is None else {})

        x, y, z = coords
        if op in ('box', 'ellipsoid', 'sweep', 'lathe'):
            if op == 'box':
                center, size = vector(node['center'], key), vector(node['size'], key)
                require(np.all(size > 0), key+': positive box size required')
                mask = np.logical_and.reduce([abs(c-p) <= s/2 for c, p, s in zip(coords, center, size)])
            elif op == 'ellipsoid':
                center, radii = vector(node['center'], key), vector(node['radii'], key)
                exponent = number(node.get('exponent', 2), key, positive=True)
                require(np.all(radii > 0) and 1 <= exponent <= 8, key+': positive radii/exponent1..8 required')
                step = number(node.get('step', self.pitch), key, positive=True)
                quantized = [np.floor(c/step)*step+step/2 for c in coords]
                mask = sum(abs((c-p)/r)**exponent for c, p, r in zip(quantized, center, radii)) <= 1
            elif op == 'sweep':
                points = parameters({'points': {'type': 'points', 'default': node['points']}}, {})['points']
                mask = np.zeros(self.shape, dtype=bool)
                for a, b in zip(np.array(points), np.array(points)[1:]):
                    d = b[:3]-a[:3]
                    length2 = np.dot(d, d)
                    t = np.zeros(self.shape) if length2 == 0 else np.clip(sum((c-p)*delta for c, p, delta in zip(coords, a, d))/length2, 0, 1)
                    radius = a[3]+t*(b[3]-a[3])
                    mask |= sum((c-(p+t*delta))**2 for c, p, delta in zip(coords, a, d)) <= radius**2
            else:
                profile = np.array(node['profile'], dtype=float)
                require(profile.ndim == 2 and profile.shape[0] >= 2 and profile.shape[1] == 2 and np.isfinite(profile).all(), key+': [height,radius] profile required')
                require(np.all(np.diff(profile[:,0]) > 0) and np.all(profile[:,1] > 0), key+': rising heights/positive radii required')
                cx, cy, cz = vector(node.get('center', [0,0,0]), key)
                radius = np.interp(z-cz, profile[:,0], profile[:,1])
                mask = ((x-cx)**2+(y-cy)**2 <= radius**2) & (z-cz >= profile[0,0]) & (z-cz <= profile[-1,0])
            result = np.where(mask, self.color(node['material'], coords), 0).astype(np.uint8)
        elif op in ('union', 'intersection'):
            require(isinstance(node['inputs'], list) and len(node['inputs']) >= 2, key+': two or more inputs required')
            result = child(node['inputs'][0]).copy()
            for ref in node['inputs'][1:]:
                other = child(ref)
                if op == 'union': result[other > 0] = other[other > 0]
                else: result[other == 0] = 0
        elif op == 'difference':
            result = child(node['base']).copy()
            result[child(node['cut']) > 0] = 0
        elif op == 'paint':
            result = child(node['input']).copy()
            mask = (result > 0) & (child(node['mask']) > 0)
            colors = self.color(node['material'], coords)
            result[mask] = colors[mask]
        elif op == 'transform':
            translate = vector(node.get('translate', [0,0,0]), key)
            scale = number(node.get('scale', 1), key, positive=True)
            angles = np.radians(vector(node.get('rotate', [0,0,0]), key))
            rotation = np.eye(3)
            for axis, angle in enumerate(angles):
                a, b = (axis+1)%3, (axis+2)%3
                matrix = np.eye(3)
                matrix[a,a] = matrix[b,b] = math.cos(angle)
                matrix[a,b], matrix[b,a] = -math.sin(angle), math.sin(angle)
                rotation = matrix @ rotation
            local = tuple(sum(rotation[j,i]*(coords[j]-translate[j]) for j in range(3))/scale for i in range(3))
            result = child(node['input'], local)
        elif op == 'repeat':
            count = node['count']
            require(isinstance(count, int) and not isinstance(count, bool) and 1 <= count <= 64, key+': count1..64 required')
            offset, jitter = vector(node['offset'], key), vector(node.get('jitter', [0,0,0]), key)
            require(np.all(jitter >= 0), key+': nonnegative jitter required')
            rng = np.random.default_rng(self.stable_seed(key))
            result = np.zeros(self.shape, dtype=np.uint8)
            for i in range(count):
                shift = i*offset+rng.uniform(-jitter, jitter)
                other = child(node['input'], tuple(c-p for c,p in zip(coords, shift)))
                result[other > 0] = other[other > 0]
        elif op == 'module':
            module = node['module']
            require(module in self.modules, 'Missing module '+str(module))
            spec = self.modules[module]
            values = parameters(spec.get('parameters', {}), node.get('params', {}))
            # Keep module identity in the stack so recursive libraries cannot hide cycles.
            require('module:'+module not in trail, 'Recursive module '+module)
            result = self.graph(spec, values, coords, trail=(*trail, 'module:'+module), scope=key+'/'+module)
        else: raise RecipeError('Unknown op '+op)
        memo[name] = result
        return result

    def build(self):
        result = self.graph(self.document, self.params, self.coords)
        require(np.any(result), 'Recipe produced no occupied cells')
        return result, self.palette.copy()
