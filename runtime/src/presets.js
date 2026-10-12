// Built-in procedural models. Units: 1 unit = 10 mm. Front faces +Z, up is +Y.
// Part names (Body, Screen, Lens, Keys, ...) are what deck.json `colors`/`textures` target.
// Every shape id is also an anchor for callouts.
export const PRESETS = {
  phone: () => ({
    shapes: [
      { id: 'Body', kind: 'slab', size: [7.2, 15, 0.85], radius: 1.0, color: '#E14A48', part: 'Body' },
      { id: 'Screen', kind: 'roundRect', size: [6.75, 14.55], radius: 0.8, pos: [0, 0, 0.432], shade: 'flat', color: '#2a2740', part: 'Screen' },
      { id: 'Island', kind: 'roundRect', size: [1.9, 0.45], radius: 0.22, pos: [0, 6.55, 0.436], shade: 'flat', color: '#1E1B2E', part: 'Island' },
      { id: 'CameraBump', kind: 'slab', size: [3.3, 3.3, 0.16], radius: 0.8, pos: [-1.55, 5.3, -0.5], color: '#E14A48', part: 'Body' },
      ...[[-2.3, 6.05], [-2.3, 4.55], [-0.8, 5.3]].flatMap(([x, y], i) => [
        { id: `LensRing${i + 1}`, kind: 'cylinder', size: [0.74, 0.74, 0.1], rot: [90, 0, 0], pos: [x, y, -0.6], color: '#3a3650', part: 'LensRing' },
        { id: `Lens${i + 1}`, kind: 'cylinder', size: [0.58, 0.58, 0.24], rot: [90, 0, 0], pos: [x, y, -0.66], color: '#232036', part: 'Lens', outline: false },
      ]),
      { id: 'Flash', kind: 'disc', size: [0.22], rot: [0, 180, 0], pos: [-0.75, 6.25, -0.59], shade: 'flat', color: '#FFE9A8', part: 'Flash' },
      { id: 'VolumeUp', kind: 'box', size: [0.12, 1.2, 0.3], pos: [-3.62, 3.3, 0], color: '#E14A48', part: 'Body' },
      { id: 'VolumeDown', kind: 'box', size: [0.12, 1.2, 0.3], pos: [-3.62, 1.8, 0], color: '#E14A48', part: 'Body' },
      { id: 'Power', kind: 'box', size: [0.12, 2.0, 0.34], pos: [3.62, 3.0, 0], color: '#E14A48', part: 'Body' },
      { id: 'Port', kind: 'box', size: [0.9, 0.06, 0.22], pos: [0, -7.5, 0], color: '#1E1B2E', part: 'Port', outline: false },
    ],
    anchors: { Speaker: [1.9, -7.5, 0], Mic: [-1.9, -7.5, 0], Front: [0, 0, 0.45], Back: [0, -2, -0.45] },
  }),

  laptop: () => ({
    shapes: [
      { id: 'Base', kind: 'group', rot: [-90, 0, 0], children: [
        { id: 'BaseBody', kind: 'slab', size: [12, 8.4, 0.45], radius: 0.5, color: '#CFCAC2', part: 'Body' },
        { id: 'Keys', kind: 'roundRect', size: [10.4, 3.8], radius: 0.2, pos: [0, 1.4, 0.228], shade: 'flat', color: '#2a2740', part: 'Keys' },
        { id: 'Trackpad', kind: 'roundRect', size: [4.2, 2.5], radius: 0.25, pos: [0, -2.3, 0.228], shade: 'flat', color: '#B9B3AA', part: 'Trackpad' },
      ] },
      { id: 'Lid', kind: 'group', pos: [0, 0.225, -4.0], rot: [-15, 0, 0], children: [
        { id: 'LidBody', kind: 'slab', size: [12, 8.2, 0.3], radius: 0.5, pos: [0, 4.1, 0], color: '#CFCAC2', part: 'Body' },
        { id: 'Screen', kind: 'roundRect', size: [11.2, 7.3], radius: 0.25, pos: [0, 4.25, 0.153], shade: 'flat', color: '#2a2740', part: 'Screen' },
        { id: 'Camera', kind: 'disc', size: [0.12], pos: [0, 7.92, 0.154], shade: 'flat', color: '#1E1B2E', part: 'Camera' },
        { id: 'Logo', kind: 'disc', size: [0.7], rot: [0, 180, 0], pos: [0, 4.1, -0.153], shade: 'flat', color: '#F4EEE3', part: 'Logo' },
      ] },
      { id: 'PortUSB1', kind: 'box', size: [0.08, 0.18, 0.7], pos: [-6.0, 0.2, -1.6], color: '#2a2740', part: 'Port', outline: false },
      { id: 'PortUSB2', kind: 'box', size: [0.08, 0.18, 0.7], pos: [-6.0, 0.2, -0.4], color: '#2a2740', part: 'Port', outline: false },
      { id: 'Audio', kind: 'cylinder', size: [0.13, 0.13, 0.1], rot: [0, 0, 90], pos: [6.0, 0.2, -1.2], color: '#2a2740', part: 'Port', outline: false },
    ],
    anchors: {},
  }),
};
