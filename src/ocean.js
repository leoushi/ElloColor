import * as THREE from 'three';

const waveField = `
  uniform float time;
  vec3 wave(vec2 p, vec2 k, float speed, float amplitude) {
    float phase = dot(p, k) - time * speed;
    return amplitude * vec3(sin(phase), cos(phase) * k);
  }
  vec3 swell(vec2 p) {
    return wave(p, vec2(.83, .72), .67, .045)
         + wave(p, vec2(-.62, 1.67), .97, .025)
         + wave(p, vec2(2.9, -.91), 1.21, .012);
  }
  float openSea(vec2 p) { return smoothstep(.55, 3.6, length(p)); }
`;

export function makeOcean(sun, height) {
  const mirrorCamera = new THREE.PerspectiveCamera();
  const mirrorMatrix = new THREE.Matrix4();
  const uvBias = new THREE.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, 1, 0, 0, 0, 0, 1);
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4(), corner = new THREE.Vector4();
  const forward = new THREE.Vector3(), lookAt = new THREE.Vector3();
  const size = new THREE.Vector2();
  let target;
  const uniforms = {
    sun: { value: sun }, time: { value: 0 },
    mirrorMap: { value: null }, mirrorMatrix: { value: mirrorMatrix }, liveReflection: { value: false }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      ${waveField}
      uniform mat4 mirrorMatrix;
      varying vec3 world;
      varying vec4 mirrorPosition;
      void main() {
        vec4 p = modelMatrix * vec4(position, 1.);
        mirrorPosition = mirrorMatrix * p;
        p.y += swell(p.xz).x * openSea(p.xz);
        world = p.xyz;
        gl_Position = projectionMatrix * viewMatrix * p;
      }
    `,
    fragmentShader: `
      ${waveField}
      uniform vec3 sun;
      uniform sampler2D mirrorMap;
      uniform bool liveReflection;
      varying vec3 world;
      varying vec4 mirrorPosition;
      void main() {
        vec2 p = world.xz;
        vec3 waveShape = swell(p);
        float calm = openSea(p);
        float distanceToEye = length(cameraPosition - world);
        float detail = 1. - smoothstep(9., 37., distanceToEye);
        vec2 ripple = wave(p, vec2(8.7, 5.6), 2.12, .0044).yz
                    + wave(p, vec2(-6.1, 13.7), 2.75, .0026).yz
                    + wave(p, vec2(18., 10.), 3.24, .00145).yz;
        vec2 slope = waveShape.yz * mix(.14, 1., calm) + ripple * detail * mix(.36, 1., calm);
        vec3 n = normalize(vec3(-slope.x, 1., -slope.y));
        vec3 view = normalize(cameraPosition - world);
        vec3 light = normalize(sun + vec3(0., .001, 0.));
        float facing = clamp(dot(view, n), 0., 1.);
        float fresnel = pow(1. - facing, 4.);
        vec3 skyHorizon = vec3(.337, .491, .597);
        vec3 sky = mix(skyHorizon, vec3(.055, .20, .34), sqrt(max(0., reflect(-view, n).y)));
        vec3 reflected = sky;
        if (liveReflection && mirrorPosition.w > 0.) {
          vec2 uv = mirrorPosition.xy / mirrorPosition.w;
          vec2 warp = slope * (.085 / (1. + distanceToEye * .09));
          uv += vec2(warp.x + warp.y * .4, warp.y - warp.x * .27);
          vec2 border = min(uv, 1. - uv);
          float edge = smoothstep(0., .016, min(border.x, border.y));
          reflected = mix(sky, texture2D(mirrorMap, clamp(uv, .001, .999)).rgb, edge);
        }
        vec3 deepWater = vec3(.009, .071, .092);
        vec3 waterBody = deepWater + vec3(.019, .113, .139) * (.46 + waveShape.x * 3.1);
        vec3 color = mix(waterBody, reflected, .53 + .42 * fresnel);
        float sunGlint = max(dot(reflect(-light, n), view), 0.);
        color += vec3(1., .83, .58) * (.14 * pow(sunGlint, 22.) + 1.75 * pow(sunGlint, 145.));
        color = mix(color, skyHorizon, smoothstep(29., 60., distanceToEye));
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const geometry = new THREE.PlaneGeometry(142, 142, 88, 88);
  const points = geometry.attributes.position;
  const stretch = v => Math.sign(v) * (Math.abs(v) / 71) ** 2 * 71;
  for (let i = 0; i < points.count; i++) points.setXY(i, stretch(points.getX(i)), stretch(points.getY(i)));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = height;

  return {
    mesh,
    update(time) { uniforms.time.value = time; },
    reflect(renderer, scene, camera, sky, low) {
      if (camera.position.y <= mesh.position.y) return;
      renderer.getDrawingBufferSize(size);
      const scale = Math.min(low ? .49 : .69, (low ? 720 : 1280) / Math.max(size.x, size.y));
      const width = Math.max(1, Math.round(size.x * scale));
      const height = Math.max(1, Math.round(size.y * scale));
      target ??= new THREE.WebGLRenderTarget(width, height, {
        type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType
      });
      target.setSize(width, height);

      // Reflect the camera across the still waterline, then clip geometry below it.
      const waterline = mesh.position.y;
      mirrorCamera.position.copy(camera.position);
      mirrorCamera.position.y = 2 * waterline - camera.position.y;
      camera.getWorldDirection(forward);
      forward.y *= -1;
      mirrorCamera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      mirrorCamera.up.y *= -1;
      mirrorCamera.lookAt(lookAt.copy(mirrorCamera.position).add(forward));
      mirrorCamera.far = camera.far;
      mirrorCamera.updateMatrixWorld(true);
      const projection = mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
      const p = projection.elements;
      // Leave room around the visible reflection for waves to sample off screen.
      for (const index of [0, 5, 8, 9]) p[index] *= .86;
      mirrorMatrix.copy(uvBias).multiply(projection).multiply(mirrorCamera.matrixWorldInverse);
      plane.normal.set(0, 1, 0);
      plane.constant = -waterline + .002;
      plane.applyMatrix4(mirrorCamera.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      mirrorCamera.projectionMatrixInverse.copy(projection).invert();
      corner.set(Math.sign(clip.x), Math.sign(clip.y), 1, 1).applyMatrix4(mirrorCamera.projectionMatrixInverse);
      clip.multiplyScalar(2 / clip.dot(corner));
      p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1; p[14] = clip.w;
      mirrorCamera.projectionMatrixInverse.copy(projection).invert();

      const previous = renderer.getRenderTarget();
      const shadows = renderer.shadowMap.needsUpdate;
      mesh.visible = false;
      sky.position.copy(mirrorCamera.position);
      renderer.shadowMap.needsUpdate = false;
      try {
        renderer.setRenderTarget(target);
        renderer.state.buffers.depth.setMask(true);
        renderer.clear(true, true, false);
        renderer.render(scene, mirrorCamera);
      } finally {
        renderer.setRenderTarget(previous);
        renderer.shadowMap.needsUpdate = shadows;
        mesh.visible = true;
        sky.position.copy(camera.position);
      }
      uniforms.mirrorMap.value = target.texture;
      uniforms.liveReflection.value = true;
    },
    finish() { uniforms.liveReflection.value = false; }
  };
}
