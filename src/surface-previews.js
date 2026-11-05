import * as THREE from 'three';
import { applySurface, projectSurface, surfaceAppearance, surfaceUniforms } from './surfaces.js?v=surface-motion-1';

export class SurfacePreviews {
  constructor(renderer, environment) {
    this.renderer = renderer;
    this.images = new Map();
    this.scene = new THREE.Scene();
    this.scene.environment = environment;
    this.camera = new THREE.OrthographicCamera(-1.12, 1.12, 1.12, -1.12, .1, 10);
    this.camera.position.set(0, .28, 3.7);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xfff6e9, 1.55);
    key.position.set(-2, 3, 3);
    const fill = new THREE.DirectionalLight(0xe2edff, .30);
    fill.position.set(3, .5, 1);
    this.material = new THREE.MeshStandardMaterial();
    this.uniforms = surfaceUniforms();
    this.material.onBeforeCompile = shader => projectSurface(shader, this.uniforms);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), this.material);
    sphere.rotation.z = .18;
    this.scene.add(sphere, key, fill, new THREE.HemisphereLight(0xf1f5fa, 0x4f5863, .54));

    const size = 128;
    this.target = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    this.pixels = new Uint8Array(size * size * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.context = this.canvas.getContext('2d');
    this.image = this.context.createImageData(size, size);
    this.srgb = Uint8Array.from({ length: 256 }, (_, index) => {
      const linear = index / 255;
      return Math.round(255 * (linear < .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055));
    });
  }

  get(id) {
    if (this.images.has(id)) return this.images.get(id);
    applySurface(this.material, surfaceAppearance(id), this.uniforms);
    const { renderer, target, pixels } = this;
    const previousTarget = renderer.getRenderTarget();
    const previousClear = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0, 0);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClear, previousAlpha);
    }

    // The render target stores linear color and starts at the bottom row.
    const { data } = this.image;
    const rowBytes = target.width * 4;
    for (let y = 0; y < target.height; y++) {
      const row = (target.height - 1 - y) * rowBytes;
      for (let x = 0; x < rowBytes; x += 4) {
        const source = row + x, dest = y * rowBytes + x;
        const alpha = pixels[source + 3];
        data[dest + 3] = alpha;
        for (let channel = 0; channel < 3; channel++) {
          const linear = alpha ? Math.min(255, Math.round(pixels[source + channel] * 255 / alpha)) : 0;
          data[dest + channel] = this.srgb[linear];
        }
      }
    }
    this.context.putImageData(this.image, 0, 0);
    const url = this.canvas.toDataURL('image/png');
    this.images.set(id, url);
    return url;
  }
}
