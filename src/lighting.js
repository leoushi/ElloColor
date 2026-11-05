export const defaultLighting = 'studio';
// Key and fill are authored relative to the viewing side. The rim is fixed in the scene.
export const lightingPresets = [
  { id: 'studio', name: '室内棚灯', sky: 0x171b26, source: [3.6, 5.2, 2.9],
    key: [0xf4f7ff, 2.32, 1.9, 5.9, 4.2], rim: [0xb6cfff, .85, -4, 3.65, -4.6], fill: [0xfff2e6, .56, -4.1, 2.5, 4.6],
    ambient: [0xd9e3fa, 0x515259, 1.05], exposure: 1.12 },
  { id: 'sun', name: '室外正午', sky: 0x517ba1, source: [.72, .72, 7.4],
    key: [0xfff5dd, 2.95, 3.4, 7.4, 3.4], rim: [0xb8d7ff, .65, -4, 3, -5], fill: [0xd7ecff, .55, -3.7, 2.5, 4.8],
    ambient: [0xb9d6f5, 0xa88b70, .85], exposure: 1.06 },
  { id: 'cloud', name: '室外阴天', sky: 0x64717f, source: [10, 7, 1.5],
    key: [0xecf1ff, 1.55, -.9, 5.3, 4.5], rim: [0xb8d1ee, .48, -4, 3, -4], fill: [0xd9e0e7, .48, 3.4, 3.2, 4.6],
    ambient: [0xd6e0e8, 0x68737b, 1.19], exposure: 1.12 },
  { id: 'morning', name: '室外清晨', sky: 0x556f87, source: [1.1, 1.1, 5.8],
    key: [0xffd4ad, 2.55, -5.1, 2.8, 4.7], rim: [0xb4d3ff, .75, 4, 4, -4], fill: [0xcbdfff, .54, 4.1, 2.5, 4.4],
    ambient: [0xbbd1ef, 0x88776c, .89], exposure: 1.08 },
  { id: 'sunset', name: '室外黄昏', sky: 0x544642, source: [1.15, 1.15, 5.3],
    key: [0xffba86, 2.62, 5.3, 2.6, 4.4], rim: [0xb5c0ed, .73, 4, 3, -4], fill: [0xe4d8d1, .53, -4.0, 2.1, 4.1],
    ambient: [0xc9c7d9, 0x7c6658, .76], exposure: 1.04 },
  { id: 'night', name: '室外夜间', sky: 0x18263a, source: [1.25, 1.25, 3.6],
    key: [0xb4c8ff, 1.68, -2.7, 4.0, 4.2], rim: [0x759af1, .68, 3, 3, -5], fill: [0xffdcbd, .43, 3.8, 1.9, 4.3],
    ambient: [0x8fa5cf, 0x3f455b, .59], exposure: 1.02 }
];

export const galleryLighting = {
  sky: { key: [0xfff5df, 2.6, -3.2, 6.3, 4.6], rim: [0xa7caff, .72, 4, 3.4, 3], fill: [0xd6edff, .55, 3.8, 2.8, 4.3],
    ambient: [0xc8e6ff, 0x7f9bbc, 1.12], exposure: 1.10 },
  ocean: { key: [0xf9eee2, 2.02, -3.6, 5.2, 4.2], rim: [0x9fd6f5, .66, 3.8, 2.9, -4.8], fill: [0xa7c8da, .50, 4, 1.8, 4.1],
    ambient: [0xb9d5e4, 0x637f8a, .85], exposure: 1.04 },
  desert: { key: [0xffc489, 2.95, -4.9, 4.1, 4.9], rim: [0x9bc3ed, .57, 4, 4, 3], fill: [0xfacb95, .47, 4, 2.2, 4],
    ambient: [0xd4e3f5, 0xca9462, .92], exposure: 1.10 },
  space: { key: [0xc7dcff, 2.28, -4.8, 2.4, 4.7], rim: [0x9e9cfa, .86, 4, 2.5, 4], fill: [0xc0c9e4, .47, 4.6, 1.7, 3.7],
    ambient: [0x9daed4, 0x45445e, .44], exposure: 1.12 }
};
