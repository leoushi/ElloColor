import * as THREE from 'three';
import { Stage } from './stage.js?v=compact-studio-3';
import { PaintEngine, setSubstrate } from './paint.js?v=compact-studio-3';
import { surfaces } from './surfaces.js?v=surface-motion-1';
import { SprayParticles } from './particles.js';
import { SprayAudio } from './audio.js';
import { defaultLighting, lightingPresets } from './lighting.js?v=workbench-20261104r3';
import { galleryScenes } from './gallery-scenes.js?v=compact-studio-3';
import { collectCopy, language, modelTitle, partCountLabel, rememberLanguage, setLanguage, t } from './i18n.js?v=compact-studio-3';
import builtInModels from '../assets/demo/catalog.json';
import { discardImport, importFormat, localModels, readImport, readPaint, resetPaint, saveImport, savePaint, updateLocalModel, watchLibrary } from './model-store.js';

const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const canvas = $('stage');
const coarse = matchMedia('(pointer: coarse)').matches;
const inks = [
  { name: '白', code: 'CHALK', hex: '#F1EFE7' },
  { name: '黑', code: 'CARBON', hex: '#26272C' },
  { name: '钴蓝', code: 'COBALT', hex: '#285EED' },
  { name: '青', code: 'CYAN', hex: '#22CDE6' },
  { name: '黄', code: 'AMBER', hex: '#FFD341' },
  { name: '红', code: 'VERMILION', hex: '#EF4C3A' },
  { name: '橙', code: 'TANGERINE', hex: '#FF8743' },
  { name: '青柠', code: 'LIME', hex: '#BDE945' },
  { name: '松绿', code: 'PINE', hex: '#178568' },
  { name: '米白', code: 'IVORY', hex: '#F2DEB5' },
  { name: '雾灰', code: 'MIST', hex: '#AAB7C8' },
  { name: '钛灰', code: 'TITANIUM', hex: '#68717D' },
  { name: '玫瑰', code: 'ROSE', hex: '#E94C86' },
  { name: '金辉', code: 'GOLDEN', hex: '#EBA449' },
  { name: '薄荷', code: 'MINT', hex: '#6CDBAF' },
  { name: '靛蓝', code: 'INDIGO', hex: '#3C3E96' },
  { name: '薰衣草', code: 'LAVENDER', hex: '#A998E8' },
  { name: '紫', code: 'PLUM', hex: '#7D4287' }
];
const viewNames = { front: '正面', left: '左侧', right: '右侧', back: '背面', top: '俯视', bottom: '仰视', hero: '斜视' };
const foldLabels = {
  top: ['收起顶部', '展开顶部'], left: ['收起模型栏', '展开模型栏'],
  right: ['收起状态栏', '展开状态栏'], deck: ['收起底部', '展开底部']
};
const panelTravel = { top: '0 -100%', left: 'calc(-100% - 14px) 0', right: 'calc(100% + 14px) 0', deck: '0 calc(100% + 48px)' };
const deck = $('editor-deck');
const overlayDeck = matchMedia('(min-width: 991px) and (min-height: 600px)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const panelFlights = new Set();
const audio = new SprayAudio();
let low = coarse || new URLSearchParams(location.search).get('quality') === 'low';
let stage, paint, particles, catalog, model, selected, stroke, pointer, isolated;
let presetInk = inks.find(item => item.code === 'GOLDEN');
let ink = presetInk, customMode = false, tool = 'spray', view = 'hero';
let auto = false, scopeAll = true, loading = false, firing = false;
let paintAll = true;
let fillThreshold = .35, touchOrbit = false;
const touches = new Map();
const spraySettingIds = ['brush', 'flow', 'transparency', 'continuity', 'grain', 'fill-threshold'];
const spraySettingsKey = 'ellocolor-spray-settings';
let light = defaultLighting;
let galleryState = null, galleryScene = 'bench', galleryLight = defaultLighting;
let viewTransition = null, gallerySwitching = false;
let noticeTimer, inkTimer, lastHoverCheck = 0;
const unsavedPaint = new Map();
let paintSaveTimer;
let buttonsById = new Map();
const surfaceButtons = new Map();

function pressed(button, value) { button.setAttribute('aria-pressed', String(Boolean(value))); }
const partLabel = part => (language() === 'en' ? part.en ?? t(part.name) : part.name) + (part.number ? ' ' + part.number : '');
function availableParts() {
  return model?.parts ?? [];
}
function swatch(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.dataset.ink = item.code;
  const chip = document.createElement('i');
  button.style.setProperty('--sample', item.hex);
  button.append(chip);
  return button;
}
function message(text, duration = 2000) {
  $('notice').textContent = t(text);
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, duration);
}

function thumbnail() {
  stage.draw();
  const thumb = document.createElement('canvas');
  thumb.width = 184;
  thumb.height = 145;
  const height = Math.round(stage.framingHeight * canvas.height / canvas.clientHeight);
  const width = Math.min(canvas.width, Math.round(height * thumb.width / thumb.height));
  const viewOffset = stage.camera.view?.offsetX ?? 0;
  const x = Math.min(canvas.width - width, Math.max(0, (canvas.width - width) / 2 - viewOffset * canvas.width / canvas.clientWidth));
  thumb.getContext('2d').drawImage(canvas, x, 0, width, height, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/webp', .84);
}

function queuePaintSave(part) {
  const draft = part.model;
  if (!unsavedPaint.has(draft)) unsavedPaint.set(draft, new Set());
  unsavedPaint.get(draft).add(part);
  paintSaveTimer ??= setTimeout(flushPaintSaves, 320);
}

function flushPaintSaves(force = false) {
  clearTimeout(paintSaveTimer);
  paintSaveTimer = undefined;
  if (!unsavedPaint.size || stage.renderer.getContext().isContextLost()) return;
  if (!force && stroke?.mode === 'spray') {
    paintSaveTimer = setTimeout(flushPaintSaves, 320);
    return;
  }
  for (const [draft, parts] of unsavedPaint) {
    if (draft.resetting) continue;
    try {
      const changes = [...parts].map(part => [part.id, paint.savePart(part)]);
      let preview;
      if (draft === model && draft.parts.some(part => part.ink)) {
        try { preview = thumbnail(); } catch { /* The coat data can still be saved. */ }
      }
      unsavedPaint.delete(draft);
      savePaint(draft.definition.id, draft.paintGeneration ?? 0, changes, preview).then(saved => {
        if (!saved && !draft.resetting) message('此模型已在另一个窗口重置。请刷新后继续涂色。', 5500);
      }).catch(() => {
        for (const part of parts) {
          if (!unsavedPaint.has(draft)) unsavedPaint.set(draft, new Set());
          unsavedPaint.get(draft).add(part);
        }
        message('涂色暂未保存，请检查浏览器存储。', 5500);
      });
    } catch (error) {
      console.error(error);
      message('涂色暂未保存，请检查浏览器存储。', 5500);
    }
  }
}

async function restorePaint(draft) {
  if (draft.paintLoaded) return;
  draft.paintLoaded = true;
  const saved = await readPaint(draft.definition.id).catch(() => null);
  draft.paintGeneration = saved?.preview?.generation ?? 0;
  for (const entry of saved?.parts ?? []) {
    const part = draft.parts.find(item => item.id === entry.partId);
    if (part) paint.loadPart(part, entry.coat);
  }
}

function updateInk() {
  document.documentElement.style.setProperty('--ink', ink.hex);
  $('ink-name').textContent = t(ink.name);
  $('ink-hex').textContent = ink.hex;
  for (const button of all('[data-ink]')) {
    const title = t(inks.find(item => item.code === button.dataset.ink).name);
    button.title = title;
    button.setAttribute('aria-label', title);
    pressed(button, button.dataset.ink === ink.code);
  }
}

function setCustomColor(hex, updateSliders = true) {
  ink = { name: '自定义', code: 'CUSTOM', hex: hex.toUpperCase() };
  if (updateSliders) {
    const { h, s, l } = new THREE.Color(ink.hex).getHSL({}, THREE.SRGBColorSpace);
    $('hue').value = Math.min(359, Math.round(h * 360));
    $('saturation').value = Math.round(s * 100);
    $('lightness').value = Math.round(l * 100);
  }
  for (const [id, unit] of [['hue', '°'], ['saturation', '%'], ['lightness', '%']]) {
    $(id + '-value').textContent = $(id).value + unit;
  }
  $('custom-hex').setCustomValidity('');
  $('custom-hex').value = ink.hex;
  $('custom-color').value = hex.toLowerCase();
  updateInk();
}

function updatePaletteMode() {
  $('palette').hidden = customMode;
  $('custom-palette').hidden = !customMode;
  $('palette-mode').textContent = t(customMode ? '预设色板' : '自由调色');
  pressed($('palette-mode'), customMode);
}

function cycleOptions(options, current, direction) {
  const index = options.findIndex(option => option.id === current);
  return options[(index + direction + options.length) % options.length];
}

function updateCoverage(part) {
  if (!model?.parts.includes(part)) return;
  const badge = buttonsById.get(part.id)?.querySelector('small');
  if (badge) badge.textContent = part.coverage > 0 ? Math.floor(part.coverage * 100) + '%' : 'P–' + badge.dataset.index;
  if (part !== selected) return;
  const value = part.coverage * 100;
  $('coverage').replaceChildren(document.createTextNode(value.toFixed(1)), Object.assign(document.createElement('sub'), { textContent: '%' }));
  $('coat-meter').style.setProperty('--coverage', String(part.coverage));
  $('coat-meter').style.setProperty('--ink', part.ink ?? ink.hex);
  $('coat-meter').setAttribute('aria-valuenow', value.toFixed(1));
  $('coat-state').textContent = t(part.filled ? '补色完成' : part.fillStart !== null ? '补色中' : part.ink ? '漆层已沉积' : '待喷涂');
}

function renderInspector() {
  if (!selected) return;
  const index = availableParts().indexOf(selected) + 1;
  $('part-name').textContent = partLabel(selected);
  $('part-index').textContent = 'P–' + String(index).padStart(2, '0');
  const surface = surfaces.find(item => item.id === selected.substrate);
  $('part-material').textContent = t(surface.name);
  $('materials').textContent = t(surface.name);
  const chip = $('material-chip');
  if (chip.dataset.surface !== surface.id) {
    const preview = new Image(26, 26);
    preview.alt = '';
    preview.src = stage.surfacePreview(surface.id);
    chip.replaceChildren(preview);
    chip.dataset.surface = surface.id;
  }
  for (const [id, button] of surfaceButtons) pressed(button, id === surface.id);
  const visibility = $('visibility');
  const visibilityLabel = t(selected.hidden ? '显示' : '隐藏');
  visibility.querySelector('span').textContent = visibilityLabel;
  visibility.setAttribute('aria-label', visibilityLabel);
  pressed($('visibility'), selected.hidden);
  pressed($('solo'), isolated === selected.id);
  for (const [id, button] of buttonsById) pressed(button, id === selected.id);
  updateCoverage(selected);
}

function renderTree() {
  const parts = availableParts();
  buttonsById = new Map();
  $('model-count').textContent = parts.length;
  $('model-count').title = partCountLabel(parts.length);
  const rows = parts.map((part, index) => {
    const button = document.createElement('button');
    button.className = 'part';
    button.type = 'button';
    button.dataset.part = part.id;
    button.dataset.hidden = String(part.hidden);
    button.innerHTML = '<svg aria-hidden="true"><use href="#i-cube"/></svg><span class="part-title"></span><small></small>';
    button.querySelector('.part-title').textContent = partLabel(part);
    button.querySelector('small').dataset.index = String(index + 1).padStart(2, '0');
    button.addEventListener('click', () => {
      stop(true);
      selectPart(part);
    });
    buttonsById.set(part.id, button);
    return button;
  });
  $('parts').replaceChildren(...rows);
  for (const part of parts) updateCoverage(part);
  renderInspector();
}

function selectPart(part) {
  if (selected === part) return;
  selected = part;
  if (isolated && isolated !== part.id) {
    isolated = part.hidden ? null : part.id;
    showParts();
  }
  renderInspector();
}

function showParts() {
  stage.show(model, isolated);
  stage.focusPart(isolated ? selected : null);
}

function renderLibrary() {
  const nav = $('model-library');
  const previousScroll = nav.scrollTop;
  nav.replaceChildren(...catalog.models.map(definition => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'model-card';
    button.dataset.model = definition.id;
    button.title = modelTitle(definition);
    const thumb = document.createElement('img');
    thumb.alt = '';
    thumb.loading = 'lazy';
    if (definition.thumb) thumb.src = definition.thumb;
    const title = document.createElement('span');
    title.textContent = modelTitle(definition);
    const count = document.createElement('span');
    count.className = 'model-part-count';
    count.textContent = partCountLabel(definition.partCount);
    const caption = document.createElement('span');
    caption.className = 'model-caption';
    caption.append(title, count);
    button.append(thumb, caption);
    pressed(button, model?.definition.id === definition.id);
    button.addEventListener('click', () => { if (model?.definition.id !== definition.id) loadModel(definition.id); });
    return button;
  }));
  nav.scrollTop = previousScroll;
}

async function refreshLocalLibrary() {
  const imported = await localModels().catch(() => []);
  const known = new Set(catalog.models.map(item => item.id));
  const additions = imported.filter(item => !known.has(item.id));
  if (!additions.length) return;
  catalog.models.push(...additions);
  catalog.models.sort((a, b) => a.partCount - b.partCount);
  renderLibrary();
}

async function loadModel(id, reportError = false) {
  if (loading) return;
  paint.flushPending();
  flushPaintSaves(true);
  stop(true);
  loading = true;
  updateHistoryControls();
  $('loading').hidden = Boolean(model);
  $('model-library').inert = true;
  const cameraControls = document.querySelector('.views');
  cameraControls.inert = true;
  try {
    const definition = catalog.models.find(item => item.id === id);
    const next = await stage.model(definition);
    await restorePaint(next);
    const modelChanged = next !== model;
    const transitioning = modelChanged && Boolean(model);
    if (transitioning) await stage.departFor(next);
    model = next;
    isolated = null;
    stage.exploded = false;
    stage.explosionReturn = null;
    stage.explodeAmount = 0;
    const parts = availableParts();
    selected = parts.find(part => part.id === selected?.id) ?? parts.find(part => part.id === 'torso') ?? parts[0];
    stage.show(model, isolated, transitioning);
    if (modelChanged) paint.setOccluders(model.meshes);
    for (const button of all('[data-model]')) pressed(button, button.dataset.model === id);
    renderAssembly();
    if (transitioning) renderView('hero');
    else setView('hero', false);
    renderTree();
    if (transitioning) await stage.transitionModel(true);
    $('loading').hidden = true;
    return true;
  } catch (error) {
    $('loading').hidden = Boolean(model);
    if (reportError) throw error;
    console.error(error);
    const text = '模型加载失败。请检查资源后重新载入。';
    $('loading').querySelector('span').textContent = t(text);
    if (model) message(text);
  } finally {
    loading = false;
    updateHistoryControls();
    $('model-library').inert = false;
    cameraControls.inert = false;
  }
}

function setView(name, smooth = true, snap = false) {
  stop(true);
  stage.view(name, smooth, undefined, snap);
  renderView(name);
}

function renderView(name) {
  view = name;
  $('view-label').textContent = t(viewNames[name]);
  for (const button of all('[data-view], [data-orbit-view]')) pressed(button, (button.dataset.view ?? button.dataset.orbitView) === name);
}

function setFreeView() {
  if (!view) return;
  view = null;
  $('view-label').textContent = t('自由观察');
  for (const button of all('[data-view], [data-orbit-view]')) pressed(button, false);
}

function bindOrbitDial() {
  const dial = $('orbit-dial');
  const buttons = [...dial.querySelectorAll('button')];
  const spokes = [...dial.querySelectorAll('line')];
  // The dial follows the model's front: Blender X points right, Y back, and Z up.
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, -1, 0]];
  const up = new THREE.Vector3(0, 1, 0), projected = new THREE.Vector3();
  const lastRotation = new THREE.Quaternion();
  let lastYaw, gesture, dragged = false;
  const available = () => model && !loading && !gallerySwitching && !galleryState;

  dial.addEventListener('pointerdown', event => {
    if (!available() || !event.isPrimary || event.button !== 0) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    dragged = false;
    (event.target.closest('button') ?? dial).setPointerCapture(event.pointerId);
  });
  dial.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id || !available()) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!dragged) {
      if (Math.hypot(dx, dy) < 4) return;
      dragged = true;
      dial.dataset.dragging = 'true';
      stop(true);
    }
    stage.rotate(dx * 2.5, dy * 2.5);
    setFreeView();
    gesture.x = event.clientX;
    gesture.y = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) dial.addEventListener(type, event => {
    if (event.pointerId !== gesture?.id) return;
    gesture = null;
    delete dial.dataset.dragging;
  });
  buttons.forEach((button, i) => button.addEventListener('click', event => {
    if (!available() || (event.detail && dragged)) return;
    // When the opposing ends overlap in a snapped view, the visible end flips the camera.
    const target = button.dataset.aligned === 'true' ? buttons[i ^ 1] : button;
    setView(target.dataset.orbitView, true, true);
  }));
  const nudges = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, 16], ArrowDown: [0, -16] };
  dial.addEventListener('keydown', event => {
    const nudge = nudges[event.key];
    if (!nudge || !available()) return;
    event.preventDefault();
    stop(true);
    stage.rotate(...nudge);
    setFreeView();
  });

  return () => {
    const { camera, preferredYaw } = stage;
    if (lastYaw === preferredYaw && lastRotation.equals(camera.quaternion)) return;
    lastYaw = preferredYaw;
    lastRotation.copy(camera.quaternion);
    for (const [i, axis] of axes.entries()) {
      projected.fromArray(axis).applyAxisAngle(up, preferredYaw).transformDirection(camera.matrixWorldInverse);
      const x = projected.x * .335, y = -projected.y * .335;
      buttons[i].style.setProperty('--orbit-x', x.toFixed(4));
      buttons[i].style.setProperty('--orbit-y', y.toFixed(4));
      buttons[i].style.zIndex = String(Math.round(100 + projected.z * 90));
      buttons[i].dataset.aligned = String(projected.z > .9998);
      spokes[i].setAttribute('x2', (50 + 100 * x).toFixed(2));
      spokes[i].setAttribute('y2', (50 + 100 * y).toFixed(2));
      spokes[i].setAttribute('opacity', projected.z >= 0 ? '.72' : '.33');
    }
  };
}

function setTool(next) {
  stop(true);
  tool = next;
  canvas.dataset.tool = tool;
  setRotating(false);
  for (const button of all('[data-tool]')) pressed(button, button.dataset.tool === tool);
}

function setRotating(rotating, panning = false) {
  canvas.dataset.dragging = String(rotating);
  $('tool-status').textContent = t(panning ? '上下平移' : rotating ? '正在旋转' : tool === 'spray' ? '喷涂模式' : '直接上色');
  setHint(panning ? '拖动移动视角' : rotating ? '拖动观察模型' : undefined);
}

function setHint(text) {
  const next = t(text ?? (tool === 'spray' ? '点按或按住拖动' : paintAll ? '点按模型上色' : '点按零件上色'));
  if ($('hit-status').textContent !== next) $('hit-status').textContent = next;
}

function setFiring(on) {
  if (firing === on) return;
  firing = on;
  $('reticle').dataset.firing = String(on);
  stage?.tintSprayCursor(on ? ink.hex : '#e7f0f8');
  if (!on) audio.spray(false);
}

function nozzlePoint(point, rect) {
  return {
    x: point.x + (point.x > rect.width - 172 ? -46 : 46),
    y: point.y + (point.y > stage.framingHeight - 106 ? -29 : 29)
  };
}
function penAt(nozzle, aim) {
  const angle = Math.atan2(nozzle.y - aim.y, nozzle.x - aim.x);
  $('pen').style.transform = `translate(${nozzle.x}px, ${nozzle.y}px) translateY(-50%) rotate(${angle}rad)`;
  $('pen').removeAttribute('hidden');
}

function cursor(point, hit, rect) {
  const reticle = $('reticle');
  reticle.hidden = Boolean(galleryState) || !point || tool !== 'spray' || (point.touch && !stroke);
  const active = stroke?.mode === 'spray';
  const pen = $('pen');
  if (reticle.hidden) {
    stage?.showSprayCursor(null);
    pen.setAttribute('hidden', '');
    return;
  }
  reticle.dataset.surface = String(Boolean(hit));
  stage.showSprayCursor(hit, Number($('brush').value), rect.height);
  reticle.style.transform = `translate(${point.x}px,${point.y}px)`;
  pen.dataset.idle = String(!active);
  if (active || (!point.touch && hit)) penAt(nozzlePoint(point, rect), point);
  else pen.setAttribute('hidden', '');
}

function inkFeedback(button) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  clearTimeout(inkTimer);
  const rect = canvas.getBoundingClientRect();
  const swatchRect = button.getBoundingClientRect();
  const start = { x: swatchRect.x + swatchRect.width / 2 - rect.x, y: swatchRect.y - rect.y };
  const tip = { x: Math.min(rect.width - 160, Math.max(32, start.x + 25)), y: stage.framingHeight - 53 };
  penAt(tip, { x: tip.x - 36, y: tip.y + 18 });
  const drop = $('ink-drop');
  $('pen').dataset.idle = 'false';
  drop.hidden = false;
  const animation = drop.animate([
    { transform: `translate(${start.x}px,${start.y}px) scale(.6)`, opacity: .4 },
    { transform: `translate(${tip.x - 4}px,${tip.y - 4}px) scale(1)`, opacity: 1 }
  ], { duration: 210, easing: 'cubic-bezier(.12,.75,.24,1)', fill: 'forwards' });
  inkTimer = setTimeout(() => {
    animation.cancel();
    drop.hidden = true;
    if (!stroke) $('pen').setAttribute('hidden', '');
  }, 235);
}

function stop(cancel, release = true) {
  const pointerId = stroke?.id;
  stroke = null;
  setFiring(false);
  audio.spray(false);
  $('pen').setAttribute('hidden', '');
  $('reticle').hidden = true;
  stage?.showSprayCursor(null);
  $('ink-drop').hidden = true;
  setRotating(false);
  if (release && pointerId !== undefined && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  if (cancel) {
    paint?.cancelPending();
    particles?.clear();
  }
  updateHistoryControls();
}

function updateHistoryControls() {
  const unavailable = !paint || !model || loading || Boolean(stroke) || touchOrbit;
  $('undo').disabled = unavailable || !paint.canUndo(model);
  $('redo').disabled = unavailable || !paint.canRedo(model);
}

function changePaintHistory(redo) {
  if ($(redo ? 'redo' : 'undo').disabled) return;
  particles.clear();
  paint.changeHistory(model, redo);
  flushPaintSaves(true);
}

function pointFromEvent(event, rect) {
  return { x: event.clientX - rect.x, y: event.clientY - rect.y, touch: event.pointerType !== 'mouse' };
}

function inCanvas(event, rect) {
  return event.clientX >= rect.left && event.clientX < rect.right &&
    event.clientY >= rect.top && event.clientY < rect.bottom &&
    document.elementFromPoint(event.clientX, event.clientY) === canvas;
}

function emit(point, rect, now, spacing = 0) {
  if (!stroke || stage.moving || loading) return;
  const hit = stage.pick(point.x, point.y, rect);
  const paintable = hit && (stroke.paintAll || !stroke.locked || stroke.locked === hit.part.id);
  if (paintable && stroke.locked !== hit.part.id) {
    stroke.locked = hit.part.id;
    selectPart(hit.part);
  }
  const flow = Number($('flow').value) / 100;
  const burst = now >= stroke.nextBurst;
  setFiring(true);
  setHint(paintable ? '正在喷涂' : hit ? '已锁定本笔零件' : '空喷');
  if (now - stroke.started >= 60) audio.spray(true);
  if (!paintable && !burst) return;

  if (paintable) stroke.depth = Math.max(.1, -hit.point.clone().applyMatrix4(stage.camera.matrixWorldInverse).z);
  const viewDistance = stroke.depth ?? stage.orbit.distance;
  const landing = paintable ? hit.point : stage.pointAtDepth(point, rect, viewDistance);
  const normal = paintable ? hit.normal : stage.camera.getWorldDirection(new THREE.Vector3()).negate();
  const sprayDepth = viewDistance - Math.min(.63, viewDistance * .32);
  const origin = stage.pointAtDepth(nozzlePoint(point, rect), rect, sprayDepth);
  const paintOrigin = paintable ? stage.pointAtDepth(point, rect, sprayDepth) : origin;
  const unitPerPixel = 2 * viewDistance * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)) / stage.framingHeight;
  const width = Number($('brush').value);
  const radius = width * .5 * unitPerPixel;
  const weight = spacing ? THREE.MathUtils.clamp(spacing / width * 3.2, .18, .78) : 1;
  const dose = (.13 + flow * .52) * weight;
  const flight = THREE.MathUtils.clamp(origin.distanceTo(landing) * .16, .078, .158);

  if (paintable && stroke.opacity > 0) paint.enqueue({
    part: hit.part, origin: paintOrigin, point: landing, normal,
    radius, ink: ink.hex, opacity: stroke.opacity, grain: stroke.grain, dose, wetness: 0, at: now + flight * 1000, gesture: stroke.gesture
  });
  if (burst) {
    particles.emit(origin, landing, normal, radius, ink.hex, Math.min(flow, 1.25), now / 1000, flight, stroke.grain);
    stroke.nextBurst = now + 22;
  }
}

function sweep(point, rect, now, finish = false) {
  const from = stroke.lastSample;
  const dx = point.x - from.x, dy = point.y - from.y;
  const distance = Math.hypot(dx, dy);
  const spacing = stroke.spacing;
  if (distance < spacing) {
    if (finish && distance > 1) emit(point, rect, now, distance);
    return;
  }
  const count = Math.min(96, Math.floor(distance / spacing));
  const step = Math.max(spacing, distance / 96);
  for (let i = 1; i <= count; i++) {
    const t = i * step / distance;
    stroke.lastSample = { x: from.x + dx * t, y: from.y + dy * t };
    emit(stroke.lastSample, rect, now, step);
  }
  const remainder = distance - count * step;
  if (finish && remainder > 1) emit(point, rect, now, remainder);
  stroke.next = now + 35;
}

function orbitTouch(event, point) {
  const previous = [...touches.values()].slice(0, 2);
  touches.set(event.pointerId, point);
  if (previous.length < 2) return;
  const [a, b] = previous;
  const [c, d] = [...touches.values()];
  const oldAngle = Math.atan2(b.y - a.y, b.x - a.x);
  const newAngle = Math.atan2(d.y - c.y, d.x - c.x);
  const twist = Math.atan2(Math.sin(newAngle - oldAngle), Math.cos(newAngle - oldAngle));
  stage.rotate((c.x + d.x - a.x - b.x) / 2 + twist * 65, (c.y + d.y - a.y - b.y) / 2);
  setFreeView();
}

function finishTouch(event) {
  const orbiting = touchOrbit;
  if (touches.delete(event.pointerId) && !touches.size && touchOrbit) {
    touchOrbit = false;
    setRotating(false);
    updateHistoryControls();
  }
  return orbiting;
}

canvas.addEventListener('pointerdown', event => {
  if (!model || loading || gallerySwitching || ![0, 1, 2].includes(event.button)) return;
  if (touchOrbit && event.pointerType !== 'touch') return;
  const rect = canvas.getBoundingClientRect();
  const point = pointFromEvent(event, rect);
  if (event.pointerType === 'touch') {
    touches.set(event.pointerId, point);
    canvas.setPointerCapture(event.pointerId);
    if (touches.size >= 2 || touchOrbit) {
      event.preventDefault();
      touchOrbit = true;
      stop(true, false);
      setRotating(true);
      return;
    }
  }
  if (stroke) return;
  event.preventDefault();
  clearTimeout(inkTimer);
  $('ink-drop').hidden = true;
  pointer = point;
  const mode = event.button === 1 ? 'pan' : galleryState || event.button === 2 ? 'rotate' : tool;
  const navigating = mode === 'rotate' || mode === 'pan';
  if (!navigating && stage.moving) return;
  const now = performance.now();
  const waitingTouch = event.pointerType === 'touch' && mode === 'spray';
  const continuity = Number($('continuity').value) / 100;
  stroke = {
    id: event.pointerId, mode, point, firstPoint: point, lastSample: point, next: now + (waitingTouch ? 75 : 36),
    nextBurst: now, started: now, locked: null, waitingTouch, paintAll,
    opacity: 1 - Number($('transparency').value) / 100,
    grain: Number($('grain').value) / 100,
    spacing: Math.max(1.7, Number($('brush').value) * THREE.MathUtils.lerp(.84, .065, continuity))
  };
  if (mode === 'spray') stroke.gesture = { model };
  updateHistoryControls();
  canvas.setPointerCapture(event.pointerId);
  setRotating(navigating, mode === 'pan');
  if (navigating) {
    paint.cancelPending();
    particles.clear();
    $('reticle').hidden = true;
    stage.showSprayCursor(null);
    return;
  }
  if (mode === 'spray') {
    cursor(pointer, stage.pick(pointer.x, pointer.y, rect), rect);
    if (!waitingTouch) {
      audio.tap();
      emit(pointer, rect, now);
    }
  }
});

canvas.addEventListener('pointermove', event => {
  if (!model || loading || (stroke && stroke.id !== event.pointerId)) return;
  const rect = canvas.getBoundingClientRect();
  const point = pointFromEvent(event, rect);
  if (touches.has(event.pointerId)) {
    if (touchOrbit) { orbitTouch(event, point); return; }
    touches.set(event.pointerId, point);
  }
  if (!inCanvas(event, rect)) {
    pointer = null;
    stop(Boolean(stroke));
    return;
  }
  pointer = point;
  if (galleryState && !stroke) return;
  if (stroke?.mode === 'rotate' || stroke?.mode === 'pan') {
    if (stroke.mode === 'pan') stage.panByPixels(point.y - stroke.point.y, rect.height);
    else stage.rotate(point.x - stroke.point.x, point.y - stroke.point.y);
    stroke.point = point;
    setFreeView();
    return;
  }
  const now = performance.now();
  if (stroke) {
    stroke.point = point;
    if (stroke.mode === 'solid') {
      if (Math.hypot(point.x - stroke.firstPoint.x, point.y - stroke.firstPoint.y) > 12) stroke.moved = true;
      return;
    }
    if (stroke.waitingTouch) {
      cursor(point, null, rect);
      return;
    }
    for (const sample of event.getCoalescedEvents?.() ?? []) {
      if (!inCanvas(sample, rect)) { stop(true); return; }
      sweep(pointFromEvent(sample, rect), rect, now);
    }
    sweep(point, rect, now);
  }
  const hit = stage.moving ? null : stage.pick(point.x, point.y, rect);
  cursor(point, hit, rect);
  if (!stroke && now - lastHoverCheck > 80) {
    setHint(hit ? tool === 'spray' ? '可喷涂' : '可上色' : undefined);
    lastHoverCheck = now;
  }
});

canvas.addEventListener('pointerup', event => {
  if (finishTouch(event)) return;
  if (stroke?.id !== event.pointerId) return;
  const rect = canvas.getBoundingClientRect();
  const painted = stroke.mode === 'spray' || stroke.mode === 'solid';
  if (inCanvas(event, rect)) {
    const point = pointFromEvent(event, rect);
    if (stroke.waitingTouch) {
      audio.tap();
      emit(point, rect, performance.now());
    } else if (stroke.mode === 'spray') {
      sweep(point, rect, performance.now(), true);
    } else if (stroke.mode === 'solid' && !stroke.moved && !stage.moving) {
      const hit = stage.pick(point.x, point.y, rect);
      if (hit) {
        selectPart(hit.part);
        paint.paintSolid(stroke.paintAll ? model.parts : [hit.part], ink.hex, model, stroke.opacity);
      }
    }
  }
  stop(false);
  if (painted) {
    paint.flushPending();
    flushPaintSaves(true);
  }
  if (!galleryState && pointer && !pointer.touch) {
    if (inCanvas(event, rect)) cursor(pointer, stage.pick(pointer.x, pointer.y, rect), rect);
  }
});
canvas.addEventListener('pointercancel', event => {
  if (!finishTouch(event) && stroke?.id === event.pointerId) { pointer = null; stop(true); }
});
canvas.addEventListener('lostpointercapture', event => {
  if (!finishTouch(event) && stroke?.id === event.pointerId) stop(true);
});
canvas.addEventListener('pointerleave', () => { if (!touchOrbit) { pointer = null; stop(Boolean(stroke)); } });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('auxclick', event => { if (event.button === 1) event.preventDefault(); });
canvas.addEventListener('wheel', event => {
  if (!model) return;
  event.preventDefault();
  if (loading || gallerySwitching) return;
  stop(true);
  stage.zoom(Math.exp(event.deltaY * .0011));
  if (galleryState) stage.galleryPauseUntil = performance.now() + 1200;
  setFreeView();
}, { passive: false });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  stop(true);
  $('loading').hidden = false;
  $('loading').querySelector('span').textContent = t('图形连接已中断，请重新载入页面。');
});
window.addEventListener('pointerdown', () => audio.arm(), { capture: true, passive: true, once: true });
function cancelInteraction() {
  if (paint && !stage.renderer.getContext().isContextLost()) paint.flushPending();
  touches.clear();
  touchOrbit = false;
  pointer = null;
  stop(true);
}
window.addEventListener('blur', cancelInteraction);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelInteraction(); else audio.update(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && paint) flushPaintSaves(true); });
window.addEventListener('pagehide', () => { if (paint) flushPaintSaves(true); });

function updateControls() {
  const width = $('brush').value;
  $('brush-value').textContent = width + (language() === 'en' ? ' px' : ' 像素');
  $('flow-value').textContent = $('flow').value + '%';
  $('transparency-value').textContent = $('transparency').value + '%';
  $('continuity-value').textContent = $('continuity').value + '%';
  const grain = $('grain');
  const grainLabel = t(grain.value < 34 ? '细' : grain.value < 67 ? '中' : '粗');
  $('grain-value').textContent = `${grainLabel} · ${grain.value}`;
  grain.setAttribute('aria-valuetext', `${grainLabel} · ${grain.value} / 100`);
  document.documentElement.style.setProperty('--brush', width + 'px');
}

function renderThreshold() {
  const slider = $('fill-threshold');
  slider.parentElement.style.setProperty('--threshold', slider.value + '%');
  $('fill-threshold-value').textContent = t('补色') + ' ' + slider.value + '%';
}

function restoreSpraySettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(spraySettingsKey));
    for (const id of spraySettingIds) {
      if (Number.isFinite(settings?.[id])) $(id).value = String(settings[id]);
    }
    fillThreshold = Number($('fill-threshold').value) / 100;
  } catch {
    // Defaults are used if storage is disabled or unreadable.
  }
}

function saveSpraySettings() {
  try {
    localStorage.setItem(spraySettingsKey, JSON.stringify(Object.fromEntries(
      spraySettingIds.map(id => [id, Number($(id).value)])
    )));
  } catch {
    // The settings still apply for the open page.
  }
}

const lowLight = THREE.MathUtils.degToRad(10);
const highLight = THREE.MathUtils.degToRad(85);

function renderLightPosition() {
  const { azimuth, elevation } = stage.keyDirection();
  const radius = THREE.MathUtils.clamp((highLight - elevation) / (highLight - lowLight), 0, 1) * 41.875;
  const pad = $('light-pad');
  pad.style.setProperty('--light-x', 50 + Math.sin(azimuth) * radius + '%');
  pad.style.setProperty('--light-y', 50 - Math.cos(azimuth) * radius + '%');
  $('light-elevation').textContent = Math.round(THREE.MathUtils.radToDeg(elevation)) + '°';
}

function bindLightControl() {
  const toggle = $('light-position'), panel = $('light-panel'), pad = $('light-pad');
  const show = visible => {
    panel.hidden = !visible;
    toggle.setAttribute('aria-expanded', String(visible));
    if (visible) { renderLightPosition(); pad.focus(); }
  };
  toggle.addEventListener('click', () => show(panel.hidden));
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) show(false);
  });
  document.addEventListener('keydown', event => {
    if (!panel.hidden && event.key === 'Escape') { show(false); toggle.focus(); }
  });
  const move = event => {
    const rect = pad.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const radius = Math.min(1, Math.hypot(x, y) / (rect.width * .41875));
    stage.setKeyDirection(Math.atan2(x, -y), THREE.MathUtils.lerp(highLight, lowLight, radius));
    renderLightPosition();
  };
  pad.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    pad.setPointerCapture(event.pointerId);
    move(event);
  });
  pad.addEventListener('pointermove', event => { if (pad.hasPointerCapture(event.pointerId)) move(event); });
  pad.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const { azimuth, elevation } = stage.keyDirection();
    const turn = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const tilt = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    stage.setKeyDirection(azimuth + turn * .16, THREE.MathUtils.clamp(elevation + tilt * .08, lowLight, highLight));
    renderLightPosition();
  });
  $('light-reset').addEventListener('click', () => {
    stage.resetKeyDirection();
    renderLightPosition();
  });
}

function chooseSurface(id) {
  if (!selected || loading) return;
  stop(Boolean(stroke));
  const now = matchMedia('(prefers-reduced-motion: reduce)').matches ? null : performance.now();
  for (const part of scopeAll ? model.parts : [selected]) {
    setSubstrate(part, id, now);
    queuePaintSave(part);
  }
  renderInspector();
}

function renderSurfaceScope() {
  const label = t(scopeAll ? '全模型' : '当前零件');
  $('scope').querySelector('span').textContent = label;
  $('surface-scope').textContent = label;
}

function renderPaintScope() {
  const button = $('paint-scope');
  const label = t(paintAll ? '全模型' : '当前零件');
  button.querySelector('span').textContent = label;
  button.setAttribute('aria-label', t('上色范围') + ' · ' + label);
  pressed(button, paintAll);
}

function renderGalleryControls() {
  for (const button of all('[data-gallery-scene]')) {
    const option = galleryScenes.find(scene => scene.id === button.dataset.galleryScene);
    button.textContent = t(option.name);
    pressed(button, option.id === galleryScene);
  }
  $('gallery-light').value = t(lightingPresets.find(preset => preset.id === galleryLight).name);
}

async function toggleGallery(active) {
  if (!model || loading || gallerySwitching || panelFlights.size || Boolean(galleryState) === active) return;
  gallerySwitching = true;
  stop(Boolean(stroke));
  stage.holdView();
  if (active) stage.lockGalleryFrame();
  else stage.galleryPauseUntil = Infinity;
  const dock = $('fold-dock');
  const panels = all('[data-fold][aria-expanded=true]').filter(button => dock.querySelector(`[data-fold=${button.dataset.fold}]`).hidden);
  try {
    await viewTransition;
    if (active) {
      dock.hidden = true;
      await Promise.all(panels.map(button => movePanel(button, false)));
      applyGalleryMode(true);
      $('gallery-exit').focus({ preventScroll: true });
    } else {
      applyGalleryMode(false);
      await Promise.all(panels.map(button => movePanel(button, true)));
      dock.hidden = false;
      const focus = $('editor-top').hidden ? dock.querySelector('.fold-top') : $('appreciate');
      focus.focus({ preventScroll: true });
    }
  } finally {
    gallerySwitching = false;
    if (!galleryState) {
      layoutDeck();
      stage.unlockGalleryFrame();
    }
  }
}

function transitionView(change) {
  viewTransition ??= playViewTransition(change).finally(() => { viewTransition = null; });
  return viewTransition;
}

async function playViewTransition(change) {
  let previous;
  try {
    if (!reduceMotion.matches) {
      previous = document.createElement('canvas');
      previous.className = 'view-frame';
      previous.setAttribute('aria-hidden', 'true');
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.style.height = `${canvas.clientHeight}px`;
      stage.draw();
      previous.getContext('2d').drawImage(canvas, 0, 0);
      canvas.after(previous);
    }
    change();
    stage.update(performance.now(), 0);
    stage.draw();
    if (previous) await previous.animate({ opacity: [1, 0] }, { duration: 300, easing: 'ease-in-out' }).finished;
  } finally {
    previous?.remove();
  }
}

function applyGalleryMode(active) {
  if (active) {
    paint.flushPending();
    galleryState = {
      keyDirection: stage.hasCustomKey ? stage.keyDirection() : null, rotation: model.scene.rotation.y
    };
    galleryScene = 'bench';
    galleryLight = light;
    document.body.dataset.gallery = 'true';
    $('gallery-controls').hidden = false;
    stage.setGallery(true);
    stage.setGalleryScene(galleryScene);
    renderGalleryControls();
  } else {
    const editing = galleryState;
    galleryState = null;
    delete document.body.dataset.gallery;
    $('gallery-controls').hidden = true;
    stage.setGallery(false);
    if (galleryLight !== light) stage.setLighting(light);
    if (editing.keyDirection && (galleryScene !== 'bench' || galleryLight !== light)) {
      stage.setKeyDirection(editing.keyDirection.azimuth, editing.keyDirection.elevation);
    }
    if (model.scene.rotation.y !== editing.rotation) setFreeView();
  }
  stage.resize();
  stage.draw();
}

function bindGallery() {
  for (const option of galleryScenes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.galleryScene = option.id;
    button.addEventListener('click', () => {
      if (galleryScene === option.id || gallerySwitching) return;
      return transitionView(() => {
        galleryScene = option.id;
        stage.setGalleryScene(galleryScene);
        stage.updateCamera();
        renderGalleryControls();
      });
    });
    $('gallery-scenes').append(button);
  }
  for (const button of all('[data-gallery-light]')) button.addEventListener('click', () => {
    galleryLight = cycleOptions(lightingPresets, galleryLight, Number(button.dataset.galleryLight)).id;
    stage.setLighting(galleryLight);
    renderGalleryControls();
  });
  $('appreciate').addEventListener('click', () => toggleGallery(true));
  $('gallery-exit').addEventListener('click', () => toggleGallery(false));
}

function renderFoldControl(button) {
  const collapsed = button.getAttribute('aria-expanded') === 'false';
  const label = t(foldLabels[button.dataset.fold][Number(collapsed)]);
  button.setAttribute('aria-label', label);
  button.title = label;
}

function frameDeck() {
  if (gallerySwitching || galleryState) return;
  const covered = overlayDeck.matches && !deck.hidden
    ? Math.max(0, canvas.getBoundingClientRect().bottom - deck.getBoundingClientRect().top)
    : 0;
  stage.setDeckInset(covered);
}

function layoutDeck() {
  document.body.style.setProperty('--editor-deck-height', `${overlayDeck.matches ? deck.offsetHeight : 0}px`);
  frameDeck();
}

async function movePanel(button, open) {
  const key = button.dataset.fold;
  const panel = $(button.getAttribute('aria-controls'));
  panelFlights.add(key);
  panel.inert = true;
  if (open) panel.hidden = false;
  if (!reduceMotion.matches) {
    const offsets = [panelTravel[key], '0 0'];
    const animation = panel.animate({ translate: open ? offsets : offsets.reverse() }, {
      duration: open ? 255 : 210,
      easing: 'cubic-bezier(.24,.74,.25,1)',
      fill: 'both'
    });
    await animation.finished.catch(() => {});
    panel.hidden = !open;
    animation.cancel();
  } else {
    panel.hidden = !open;
  }
  panel.inert = !open;
  panelFlights.delete(key);
  if (key === 'deck') layoutDeck();
}

function bindEditorFolds() {
  for (const button of all('[data-fold]')) button.addEventListener('click', async () => {
    const key = button.dataset.fold;
    if (!model || loading || gallerySwitching || panelFlights.has(key)) return;
    const open = button.getAttribute('aria-expanded') === 'false';
    const reveal = $('fold-dock').querySelector(`[data-fold=${key}]`);
    const focus = document.activeElement === button;
    stop(Boolean(stroke));
    if (open) reveal.hidden = true;
    await movePanel(button, open);
    reveal.hidden = open;
    document.body.setAttribute('data-fold-' + key, String(!open));
    if (focus) {
      const next = open ? $(button.getAttribute('aria-controls')).querySelector(`[data-fold=${key}]`) : reveal;
      next.focus({ preventScroll: true });
    }
  });
  const deckResize = new ResizeObserver(layoutDeck);
  deckResize.observe(deck);
  deckResize.observe(canvas);
  overlayDeck.addEventListener('change', layoutDeck);
}

function bindSurfaceControl() {
  const toggle = $('surface-picker'), panel = $('surface-panel'), grid = $('surface-options');
  for (const surface of surfaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'surface-option';
    button.dataset.surface = surface.id;
    const preview = document.createElement('img');
    preview.alt = '';
    preview.width = preview.height = 54;
    const name = document.createElement('span');
    button.append(preview, name);
    button.addEventListener('click', () => chooseSurface(surface.id));
    surfaceButtons.set(surface.id, button);
    grid.append(button);
  }
  const hide = (restoreFocus = false) => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    if (!panel.hidden) { hide(); return; }
    if (!selected || loading) return;
    for (const [id, button] of surfaceButtons) {
      const preview = button.querySelector('img');
      if (!preview.hasAttribute('src')) preview.src = stage.surfacePreview(id);
    }
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    const active = surfaceButtons.get(selected.substrate);
    active.focus({ preventScroll: true });
    const card = active.getBoundingClientRect(), bounds = grid.getBoundingClientRect();
    if (card.top < bounds.top) grid.scrollTop += card.top - bounds.top;
    if (card.bottom > bounds.bottom) grid.scrollTop += card.bottom - bounds.bottom;
  });
  $('surface-close').addEventListener('click', () => hide(true));
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target) &&
        !$('scope').contains(event.target)) hide();
  });
  document.addEventListener('keydown', event => {
    if (!panel.hidden && event.key === 'Escape') hide(true);
  });
}

function bindControls() {
  for (const item of inks) {
    const button = swatch(item);
    button.addEventListener('click', () => {
      stop(Boolean(stroke));
      ink = presetInk = item;
      updateInk();
      inkFeedback(button);
    });
    $('palette').append(button);
  }
  $('palette-mode').addEventListener('click', () => {
    stop(Boolean(stroke));
    customMode = !customMode;
    updatePaletteMode();
    if (customMode) setCustomColor(ink.hex);
    else { ink = presetInk; updateInk(); }
  });
  $('custom-color').addEventListener('input', event => setCustomColor(event.target.value));
  $('custom-hex').addEventListener('input', event => {
    const hex = event.target.value.trim().replace(/^#/, '');
    event.target.setCustomValidity(/^[a-f0-9]{6}$/i.test(hex) ? '' : t('请输入六位 HEX 色值。'));
    if (event.target.validity.valid) setCustomColor('#' + hex);
  });
  $('custom-hex').addEventListener('change', event => {
    if (!event.target.validity.valid) setCustomColor(ink.hex);
  });
  for (const id of ['hue', 'saturation', 'lightness']) $(id).addEventListener('input', () => {
    const color = new THREE.Color().setHSL(Number($('hue').value) / 360, Number($('saturation').value) / 100,
      Number($('lightness').value) / 100, THREE.SRGBColorSpace);
    setCustomColor('#' + color.getHexString(), false);
  });
  for (const button of all('[data-cycle]')) button.addEventListener('click', () => {
    const direction = Number(button.dataset.direction);
    if (button.dataset.cycle === 'light') {
      const option = cycleOptions(lightingPresets, light, direction);
      light = option.id;
      $('lighting').textContent = t(option.name);
      stage.setLighting(light);
      renderLightPosition();
    } else if (selected) {
      chooseSurface(cycleOptions(surfaces, selected.substrate, direction).id);
    }
  });
  for (const button of all('[data-tool]')) button.addEventListener('click', () => setTool(button.dataset.tool));
  for (const button of all('[data-view]')) button.addEventListener('click', () => { if (model) setView(button.dataset.view); });
  $('view-zoom').addEventListener('input', event => {
    if (!model || loading) return;
    stop(true);
    stage.setZoom(Number(event.target.value) / 100);
    $('view-zoom-value').value = event.target.value + '%';
    setFreeView();
  });
  $('view-pan').addEventListener('input', event => {
    if (!model || loading) return;
    stop(true);
    stage.setPan(Number(event.target.value) / 100);
    $('view-pan-value').value = event.target.value + '%';
    setFreeView();
  });
  $('explode').addEventListener('click', () => {
    if (!model) return;
    stop(true);
    stage.setExploded(!stage.exploded);
    renderAssembly();
  });
  $('visibility').addEventListener('click', () => {
    if (!selected) return;
    stop(true);
    selected.hidden = !selected.hidden;
    if (selected.hidden && isolated === selected.id) isolated = null;
    showParts();
    renderTree();
  });
  $('solo').addEventListener('click', () => {
    if (!selected) return;
    stop(true);
    isolated = isolated === selected.id ? null : selected.id;
    if (isolated) selected.hidden = false;
    showParts();
    renderTree();
  });
  $('scope').addEventListener('click', () => {
    stop(true);
    scopeAll = !scopeAll;
    pressed($('scope'), scopeAll);
    renderSurfaceScope();
  });
  $('paint-scope').addEventListener('click', () => {
    stop(Boolean(stroke));
    paintAll = !paintAll;
    renderPaintScope();
    setHint();
  });
  $('auto').addEventListener('click', () => {
    stop(true);
    auto = !auto;
    pressed($('auto'), auto);
    if (auto && selected) paint.maybeFill(selected, performance.now());
  });
  $('fill-threshold').addEventListener('input', renderThreshold);
  $('fill-threshold').addEventListener('change', () => {
    fillThreshold = Number($('fill-threshold').value) / 100;
    if (selected) paint.maybeFill(selected, performance.now());
  });
  for (const id of spraySettingIds) $(id).addEventListener('change', saveSpraySettings);
  bindSurfaceControl();
  bindLightControl();
  bindGallery();
  bindEditorFolds();
  $('mute').addEventListener('click', () => {
    audio.mute(!audio.muted);
    pressed($('mute'), audio.muted);
    $('mute').querySelector('use').setAttribute('href', audio.muted ? '#i-mute' : '#i-sound');
    updateSound();
  });
  $('quality').addEventListener('click', () => {
    stop(true);
    low = !low;
    stage.setQuality(low);
    particles.low = low;
    renderQuality();
  });
  for (const id of ['brush', 'flow', 'transparency', 'continuity', 'grain']) $(id).addEventListener('input', updateControls);
  $('undo').addEventListener('click', () => changePaintHistory(false));
  $('redo').addEventListener('click', () => changePaintHistory(true));
  $('guide').addEventListener('click', () => { stop(true); $('help').showModal(); });
  $('reset').addEventListener('click', () => {
    if (!model || model.resetting) return;
    stop(true);
    $('reset-dialog').returnValue = '';
    $('reset-dialog').showModal();
  });
  for (const button of all('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
  $('reset-dialog').addEventListener('close', () => {
    if ($('reset-dialog').returnValue !== 'reset') return;
    const draft = model;
    unsavedPaint.delete(draft);
    draft.resetting = resetPaint(draft.definition.id).then(generation => {
      draft.paintGeneration = generation;
    }).catch(() => message('涂色暂未保存，请检查浏览器存储。', 5500)).finally(() => {
      draft.resetting = null;
      flushPaintSaves();
    });
    paint.reset(draft);
    for (const part of draft.parts) {
      part.hidden = false;
      setSubstrate(part, 'matte');
    }
    isolated = null;
    stage.setExploded(false);
    renderAssembly();
    showParts();
    setView('hero');
    renderTree();
    message('当前模型已重置');
  });
  window.addEventListener('keydown', event => {
    if (gallerySwitching) return;
    if (galleryState) {
      if (event.key === 'Escape') toggleGallery(false);
      if (event.target === canvas && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const dx = event.key === 'ArrowLeft' ? -14 : event.key === 'ArrowRight' ? 14 : 0;
        const dy = event.key === 'ArrowUp' ? 14 : event.key === 'ArrowDown' ? -14 : 0;
        stage.rotate(dx, dy);
        setFreeView();
        stage.galleryPauseUntil = performance.now() + 1200;
      }
      return;
    }
    if (!model || loading || document.querySelector('dialog[open]') ||
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        changePaintHistory(key === 'y' || event.shiftKey);
      }
      return;
    }
    if (event.target.tagName === 'BUTTON') return;
    if (key === 'f') setView('front');
    if (event.key === 'Escape') stop(true);
  });
  $('lang-toggle').addEventListener('click', () => changeLanguage(language() === 'zh' ? 'en' : 'zh'));
  $('library-link').addEventListener('click', () => {
    paint.flushPending();
    flushPaintSaves(true);
  });
}

function updateSound() {
  const label = t(audio.muted ? '已静音' : '静音');
  $('mute').querySelector('span').textContent = label;
  $('mute').title = label;
}

function renderAssembly() {
  const button = $('explode');
  const label = t(stage.exploded ? '恢复组装' : '爆炸视图');
  button.title = label;
  button.setAttribute('aria-label', label);
  pressed(button, stage.exploded);
}

function renderQuality() {
  const button = $('quality');
  const label = t(low ? '轻量画质' : '标准画质');
  button.title = label;
  button.setAttribute('aria-label', label);
  pressed(button, low);
}

function changeLanguage(next, persist = true) {
  if (persist) {
    stop(Boolean(stroke));
    rememberLanguage(next);
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    if (location.protocol !== 'file:') history.replaceState(null, '', url);
  }
  setLanguage(next);
  const nextLanguage = next === 'zh' ? 'English' : '中文';
  $('lang-toggle').title = nextLanguage;
  $('lang-toggle').setAttribute('aria-label', nextLanguage);
  $('library-link').href = './library.html?lang=' + next;
  $('lighting').textContent = t(lightingPresets.find(option => option.id === light).name);
  updatePaletteMode();
  renderQuality();
  renderSurfaceScope();
  renderPaintScope();
  renderGalleryControls();
  for (const button of all('[data-fold]')) renderFoldControl(button);
  for (const surface of surfaces) surfaceButtons.get(surface.id).querySelector('span').textContent = t(surface.name);
  setRotating(touchOrbit || stroke?.mode === 'rotate' || stroke?.mode === 'pan', stroke?.mode === 'pan');
  renderThreshold();
  renderLightPosition();
  $('view-label').textContent = t(view ? viewNames[view] : '自由观察');
  renderAssembly();
  setHint();
  updateInk();
  updateSound();
  updateControls();
  renderLibrary();
  if (model) renderTree();
}

async function importModel(id) {
  const { file } = (await readImport(id)) ?? {};
  if (!file) return catalog.models.find(item => item.id === id);
  const format = importFormat(file);
  if (!format) throw new Error('请选择不超过 24 MB 的 GLB、FBX 或 STL 文件。');
  $('intro-status').textContent = t('正在生成喷涂 UV…');
  const label = file.name.slice(0, -(format.length + 1)).slice(0, 42);
  const definition = { id, name: label, zh: label, en: label, format, white: true, imported: true };
  const draft = await stage.model({ ...definition, file });
  definition.partCount = draft.parts.length;
  await saveImport(definition, draft.packed, id);
  draft.packed = null;
  delete draft.definition.file;
  catalog.models.push(definition);
  return definition;
}

function startLoop(drawOrbitDial) {
  let previous = performance.now();
  let frame;
  function tick(now) {
    const dt = Math.min(.05, (now - previous) / 1000);
    previous = now;
    if (model && !stage.renderer.getContext().isContextLost()) {
      if (panelFlights.has('deck')) frameDeck();
      if (galleryState && (stroke || touchOrbit)) stage.galleryPauseUntil = now + 1200;
      stage.update(now, dt);
      if (!galleryState) drawOrbitDial();
      const zoom = String(Math.round(stage.zoomScale * 100));
      if ($('view-zoom-value').value !== zoom + '%') {
        $('view-zoom').value = zoom;
        $('view-zoom-value').value = zoom + '%';
      }
      const pan = String(Math.round(stage.panGoal * 100));
      if ($('view-pan-value').value !== pan + '%') {
        $('view-pan').value = pan;
        $('view-pan-value').value = pan + '%';
      }
      if (stroke?.mode === 'spray' && now >= stroke.next) {
        const rect = canvas.getBoundingClientRect();
        if (stroke.waitingTouch) {
          stroke.waitingTouch = false;
          audio.tap();
        }
        emit(stroke.point, rect, now);
        stroke.lastSample = stroke.point;
        stroke.next = now + 35;
      }
      paint.tick(now);
      particles.tick(now / 1000, stage.renderer.getPixelRatio());
      stage.draw();
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  window.addEventListener('pagehide', event => { if (!event.persisted) cancelAnimationFrame(frame); });
}

async function boot() {
  collectCopy();
  setLanguage(language());
  const progress = $('intro-progress');
  const setProgress = value => {
    progress.setAttribute('aria-valuenow', String(value));
    progress.style.setProperty('--intro-fill', String(value / 100));
  };
  const opened = performance.now();
  try {
    await new Promise(requestAnimationFrame);
    stage = new Stage(canvas, low);
    setProgress(23);
    paint = new PaintEngine(stage.renderer, {
      lowQuality: low,
      onCoverage: updateCoverage,
      onHistory: updateHistoryControls,
      onPaint: queuePaintSave,
      autoFill: () => auto,
      threshold: () => fillThreshold
    });
    particles = new SprayParticles(stage.scene, low);
    setProgress(57);
    const params = new URLSearchParams(location.search);
    const pendingId = params.get('import');
    let imported, importError;
    catalog = { models: [...builtInModels, ...await localModels().catch(() => [])] };
    if (pendingId) {
      try {
        imported = await importModel(pendingId);
        if (!imported) throw new Error('找不到要导入的模型，请从资产库重新选择文件。');
      } catch (error) {
        importError = error.message || '导入失败，请检查白模格式。';
        await discardImport(pendingId).catch(() => {});
      }
      if (location.protocol !== 'file:') {
        const url = new URL(location.href);
        url.searchParams.delete('import');
        if (imported) url.searchParams.set('model', imported.id);
        history.replaceState(null, '', url);
      }
    }
    catalog.models.sort((a, b) => a.partCount - b.partCount);
    pressed($('quality'), low);
    restoreSpraySettings();
    bindControls();
    changeLanguage(language(), false);
    const requested = imported?.id ?? params.get('model');
    const initial = catalog.models.some(item => item.id === requested) ? requested : 'atlas';
    if (!await loadModel(initial, true)) throw new Error('工作台未就绪');
    if (requested) $('model-library').querySelector('[aria-pressed=true]')?.scrollIntoView({ block: 'nearest' });
    setProgress(91);
    startLoop(bindOrbitDial());
    watchLibrary(event => { if (event.data === 'models') refreshLocalLibrary(); });
    window.addEventListener('focus', refreshLocalLibrary);
    await document.fonts?.ready;
    setProgress(100);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await new Promise(resolve => setTimeout(resolve, Math.max(160, 700 - (performance.now() - opened))));
    }
    document.body.dataset.intro = 'ready';
    $('intro').setAttribute('inert', '');
    setTimeout(() => {
      $('intro').hidden = true;
      document.body.dataset.intro = 'done';
      if (importError) message(importError, 7000);
      if (imported && !imported.thumb) {
        imported.thumb = thumbnail();
        updateLocalModel(imported).catch(() => {});
        renderLibrary();
        message('白模已导入');
      }
    }, 750);
  } catch (error) {
    console.error(error);
    window.dispatchEvent(new CustomEvent('ellocolor-start-error', { detail: t(error.message || '工作台未就绪') }));
  }
}
boot();
