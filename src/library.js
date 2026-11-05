import { collectCopy, language, modelTitle, partCountLabel, rememberLanguage, setLanguage, t } from './i18n.js?v=compact-studio-3';
import models from '../assets/demo/catalog.json';
import { importFormat, localModels, queueImport, savedPreviews, watchLibrary } from './model-store.js';
import { exportLibrary, importLibrary, LibraryBackupError } from './library-backup.js';

const $ = id => document.getElementById(id);
const order = assets => assets.sort((a, b) => a.partCount - b.partCount);
let assets = order([...models]), previews = new Map(), importStatus;
let transferStatus, transferring = false;

function changeLanguage(next, persist = true) {
  setLanguage(next);
  if (persist) {
    rememberLanguage(next);
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    if (location.protocol !== 'file:') history.replaceState(null, '', url);
  }
  document.title = 'ElloColor · ' + t('白模资产库');
  $('back-to-studio').href = './index.html?lang=' + next;
  showImportStatus(importStatus);
  renderTransferStatus();
  for (const key of ['en', 'zh']) $('lang-' + key).setAttribute('aria-pressed', String(key === next));
  render();
}

function render() {
  const lang = language();
  const query = $('asset-search').value.trim().toLowerCase();
  const found = assets.filter(asset => [asset.zh, asset.en, asset.id].some(value => value.toLowerCase().includes(query)));
  $('asset-grid').replaceChildren(...found.map(asset => {
    const item = document.createElement('a');
    item.className = 'asset-card';
    item.href = './index.html?' + new URLSearchParams({ model: asset.id, lang });
    const image = document.createElement('img');
    const preview = previews.get(asset.id);
    const thumbnail = preview?.thumb || asset.thumb;
    if (thumbnail) image.src = thumbnail;
    image.alt = '';
    image.loading = 'lazy';
    image.width = 184;
    image.height = 126;
    const caption = document.createElement('div');
    caption.className = 'asset-caption';
    const title = document.createElement('strong');
    title.textContent = modelTitle(asset);
    const badge = document.createElement('small');
    badge.textContent = partCountLabel(asset.partCount) + (preview?.painted?.length ? ' · ' + t('已上色') : '');
    const icon = document.createElement('i');
    icon.textContent = '↗';
    icon.setAttribute('aria-hidden', 'true');
    caption.append(title, badge, icon);
    item.append(image, caption);
    return item;
  }));
  $('asset-count').textContent = lang === 'en' ? found.length + ' models' : found.length + ' 件白模';
  $('asset-empty').hidden = found.length !== 0;
}

function showImportStatus(status) {
  importStatus = status;
  $('import-status').textContent = status ? t(status) : '';
  $('import-status').hidden = !status;
}

function renderTransferStatus() {
  const status = $('library-transfer-status');
  status.hidden = !transferStatus;
  status.textContent = transferStatus ? t(transferStatus.message)
    .replace(/\{(\w+)\}/g, (token, key) => transferStatus.values?.[key] ?? token) : '';
}

function setTransferStatus(message, values) {
  transferStatus = { message, values };
  renderTransferStatus();
}

async function transferLibrary(file) {
  if (transferring) return;
  transferring = true;
  const buttons = ['export-library', 'merge-library', 'import-model'].map($);
  for (const button of buttons) button.disabled = true;
  setTransferStatus(file ? '正在检查并合并备份…' : '正在打包模型库…');
  try {
    if (file) {
      const result = await importLibrary(file, models);
      await refreshLibrary();
      setTransferStatus('已新增 {added} 件（其中副本 {copies} 件），跳过相同版本 {skipped} 件。', result);
    } else {
      const backup = await exportLibrary(models);
      const link = document.createElement('a');
      const url = URL.createObjectURL(backup.file);
      link.href = url;
      const date = new Date();
      const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, '0')).join('-');
      link.download = `ElloColor-${stamp}.ellocolor`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setTransferStatus('已导出 {count} 件模型及其已保存的涂色和底材。', backup);
    }
  } catch (error) {
    setTransferStatus(error instanceof LibraryBackupError ? error.message : file
      ? '合并失败，请检查模型资源和浏览器剩余存储空间。' : '导出失败，请检查模型资源和浏览器存储。');
  } finally {
    transferring = false;
    for (const button of buttons) button.disabled = false;
  }
}

async function refreshLibrary() {
  try {
    const [imports, coats] = await Promise.all([localModels(), savedPreviews()]);
    assets = order([...models, ...imports]);
    previews = new Map(coats.map(coat => [coat.id, coat]));
    render();
  } catch {
    // The built-in library remains available if local storage is blocked.
  }
}

async function importFile(file) {
  if (!importFormat(file)) {
    showImportStatus('请选择不超过 24 MB 的 GLB、FBX 或 STL 文件。');
    return;
  }
  const button = $('pick-import-file');
  button.disabled = true;
  showImportStatus('正在导入模型…');
  try {
    const id = 'local-' + [...crypto.getRandomValues(new Uint32Array(4))].map(word => word.toString(16)).join('-');
    await queueImport(id, file);
    location.assign('./index.html?' + new URLSearchParams({ import: id, lang: language() }));
  } catch {
    showImportStatus('浏览器无法保存本地模型，请检查站点存储设置。');
  } finally {
    button.disabled = false;
  }
}

collectCopy();
$('lang-zh').addEventListener('click', () => changeLanguage('zh'));
$('lang-en').addEventListener('click', () => changeLanguage('en'));
$('asset-search').addEventListener('input', render);
$('export-library').addEventListener('click', () => transferLibrary());
$('merge-library').addEventListener('click', () => $('library-backup-file').click());
$('library-backup-file').addEventListener('change', event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) transferLibrary(file);
});
$('import-model').addEventListener('click', () => {
  showImportStatus(null);
  $('import-dialog').showModal();
});
$('pick-import-file').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) importFile(file);
});
window.addEventListener('pageshow', refreshLibrary);
window.addEventListener('focus', refreshLibrary);
watchLibrary(refreshLibrary);
changeLanguage(language(), false);
