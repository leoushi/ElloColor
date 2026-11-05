const english = {
  '三维喷涂工作台': '3D Paint Studio', '喷涂工作台': 'Paint Studio', '三维模型喷涂画布': '3D paint canvas',
  '语言': 'Language', '操作指南': 'Controls', '标准画质': 'High Quality', '轻量画质': 'Performance', '加载进度': 'Loading progress',
  '资产库': 'Library', '白模资产库': 'Blank Model Library', '返回工作台': 'Back to Studio', '搜索模型': 'Search models',
  '选择一件白模，打开喷涂台开始上色。': 'Choose a blank model to start painting in the studio.',
  '模型来源与许可': 'Model Credits and Licenses',
  '资产分类': 'Model categories', '全部': 'All', '原创白模': 'Originals', '车辆': 'Vehicles', '飞船': 'Spacecraft',
  '角色': 'Figures', '道具': 'Props', '建筑': 'Structures', '没有符合条件的模型。': 'No models match your search.',
  '模型载入失败': 'Model failed to load', '工作台未就绪': 'Studio unavailable', '正在准备三维工作台': 'Preparing the studio',
  '模型加载失败。请检查资源后重新载入。': 'Model unavailable. Check the asset and reload.',
  '图形连接已中断，请重新载入页面。': 'Graphics context lost. Reload the page.',
  '此设备需要支持 WebGL 2 才能打开三维工作台。': 'This studio requires WebGL 2.',
  '模型配置无法读取。': 'Unable to read the model catalog.',
  '模型配置无法读取。请确认 assets 文件夹已完整复制。': 'Unable to read the model catalog. Make sure the entire assets folder was copied.',
  '模型库': 'Model Library', '模型和零件': 'Models and parts', '模型列表': 'Model list',
  '导入白模': 'Import Blank', '模型复杂度': 'Model detail', '基础': 'Basic', '标准': 'Standard', '进阶': 'Advanced',
  '模型库迁移': 'Library transfer', '导出模型库': 'Export Library', '合并导入': 'Merge Backup', '副本': 'Copy',
  '正在打包模型库…': 'Preparing the library backup…', '正在检查并合并备份…': 'Checking and merging the backup…',
  '已导出 {count} 件模型及其已保存的涂色和底材。': 'Exported {count} models with their saved paint and surfaces.',
  '已新增 {added} 件（其中副本 {copies} 件），跳过相同版本 {skipped} 件。': 'Added {added} models ({copies} copies). Skipped {skipped} matching versions.',
  '无法读取这份 ElloColor 模型库备份。': 'This ElloColor library backup could not be read.',
  '模型库备份超过 256 MB 的数据上限。': 'The library backup exceeds the 256 MB data limit.',
  '这份备份需要较新版本的 ElloColor。': 'This backup requires a newer version of ElloColor.',
  '导出失败，请检查模型资源和浏览器存储。': 'Export failed. Check the model assets and browser storage.',
  '合并失败，请检查模型资源和浏览器剩余存储空间。': 'Merge failed. Check the model assets and available browser storage.',
  '已上色': 'Painted', '正在导入模型…': 'Importing model…',
  '浏览器无法保存本地模型，请检查站点存储设置。': 'The browser could not save the local model. Check the site storage settings.',
  '涂色暂未保存，请检查浏览器存储。': 'Paintwork has not been saved. Check browser storage.',
  '此模型已在另一个窗口重置。请刷新后继续涂色。': 'This model was reset in another window. Reload to continue painting.',
  '找不到要导入的模型，请从资产库重新选择文件。': 'The import could not be found. Choose the file again in the library.',
  '零件树': 'Parts', '组装': 'Assembled', '爆炸': 'Exploded', '爆炸视图': 'Explode View', '恢复组装': 'Reassemble',
  '零件状态和视角': 'Part status and camera', '本轮覆盖': 'Coat Coverage', '当前零件的本轮覆盖率': 'Current coat coverage',
  '待喷涂': 'Unpainted', '漆层已沉积': 'Coat Applied', '补色中': 'Filling', '补色完成': 'Fill Complete',
  '隐藏': 'Hide', '显示': 'Show', '独显': 'Isolate', '拆下': 'Remove', '装回': 'Attach',
  '隐藏或显示当前零件': 'Show or hide the selected part', '单独显示当前零件': 'Isolate the selected part',
  '安装或拆下可选组件': 'Attach or remove an optional part',
  '快捷视角': 'Camera presets', '正面': 'Front', '左侧': 'Left', '右侧': 'Right', '背面': 'Back',
  '俯视': 'Top', '斜视': 'Angle', '自由观察': 'Orbit', '缩小': 'Zoom out', '放大': 'Zoom in',
  '仰视': 'Bottom', '旋转操纵器': 'View gizmo', '右视图': 'Right view', '左视图': 'Left view',
  '后视图': 'Back view', '前视图': 'Front view', '俯视图': 'Top view', '仰视图': 'Bottom view',
  '拖动或按方向键旋转，点击轴端切换视角。': 'Drag or use the arrow keys to orbit. Select an axis to snap to its view.',
  '缩放': 'Zoom', '观察缩放': 'View zoom',
  '上下': 'Pan', '上下视角': 'Vertical pan', '上下平移': 'Panning', '拖动移动视角': 'Drag to move the view',
  '右键或双指拖动旋转。滚轮和缩放滑杆控制距离。按住鼠标中键上下拖动，或用「上下」滑杆平移视角。': 'Right-drag or drag with two fingers to orbit. Use the wheel or Zoom slider to zoom. Middle-drag or use the Pan slider to move the view vertically.',
  '用鼠标右键或双指拖动旋转。滚轮和缩放滑杆控制距离，右侧按钮切换视角。': 'Right-drag or drag with two fingers to orbit. Use the wheel or the zoom slider to change distance.',
  '喷涂工具操作带': 'Paint tools', '颜料': 'Pigments', '当前喷色': 'Active Pigment', '底材与光影': 'Surface & Light',
  '底材': 'Surface', '光影环境': 'Lighting', '当前零件': 'Part Only', '全模型': 'All Parts',
  '上色范围': 'Paint scope', '切换上色范围': 'Change paint scope', '点按模型上色': 'Tap to paint the whole model',
  '欣赏涂色': 'View Paintwork', '返回喷涂': 'Back to Paint', '观赏场景': 'Viewing scene',
  '工作台': 'Workbench', '天空': 'Sky', '海洋': 'Ocean', '沙漠': 'Desert', '宇宙': 'Space',
  '表面状态': 'Surface', '观察视角': 'View',
  '收起顶部': 'Collapse top controls', '展开顶部': 'Expand top controls',
  '收起模型栏': 'Collapse models', '展开模型栏': 'Expand models',
  '收起状态栏': 'Collapse inspector', '展开状态栏': 'Expand inspector',
  '收起底部': 'Collapse paint controls', '展开底部': 'Expand paint controls',
  '按住拖动持续喷涂。「当前零件」锁定首次命中的零件，「全模型」可连续喷过多个零件。': 'Hold and drag to spray. Part Only locks onto the first part you hit. All Parts lets the stroke continue across parts.',
  '点按模型，按上色范围填充当前零件或全模型。': 'Tap the model to coat one part or all parts, depending on the paint scope.',
  '自由调色': 'Custom Color', '预设色板': 'Preset Palette', '自定义': 'Custom', '选取颜色': 'Pick a color',
  '色相': 'Hue', '饱和': 'Saturation', '明度': 'Lightness', '十六进制色值': 'Hex color value', '请输入六位 HEX 色值。': 'Enter a six-digit hex color.',
  '上一种底材': 'Previous surface', '下一种底材': 'Next surface', '上一种天气': 'Previous lighting', '下一种天气': 'Next lighting',
  '主光位置': 'Key Light', '移动主光': 'Move key light', '恢复预设光源位置': 'Reset key light position',
  '调整主光方向和高度': 'Adjust key light direction and height', '越靠中心，光源越高': 'Closer to center raises the light',
  '拖动调整补色阈值': 'Drag to set the auto-fill threshold',
  '直接上色': 'Solid Color', '点按零件上色': 'Tap a part to color it', '可上色': 'Colorable', '正在旋转': 'Orbiting',
  '点按零件，将整个零件涂成当前颜色。': 'Tap a part to coat it in the active color.',
  '左键／单指上色 · 右键／双指旋转 · 滚轮缩放': 'Left click or one finger to paint · Right drag or two fingers to orbit · Scroll to zoom',
  '用鼠标右键或双指拖动旋转。滚轮和 ＋／－ 控制距离，右侧按钮切换视角。': 'Right-drag or drag with two fingers to orbit. Scroll or use + / − to zoom. Camera presets are on the right.',
  '开启后，当前颜色达到阈值便会填满零件。拖动覆盖条上的标记可调整阈值。': 'Auto Fill coats a part when coverage reaches the threshold. Drag the marker on the coverage bar to adjust it.',
  '材质可应用到当前零件或全模型。': 'Apply the material to the selected part or the entire model.',
  '点击材质球打开底材库。材质可应用到当前零件或全模型。': 'Click the material sphere to browse surfaces. Apply them to the selected part or the whole model.',
  '底材库': 'Material Library', '打开底材库': 'Open material library',
  '喷涂控制': 'Spray Controls', '工具': 'Tools', '喷涂': 'Spray', '旋转': 'Orbit', '喷幅': 'Width', '流量': 'Flow',
  '透明度': 'Transparency', '连贯度': 'Continuity',
  '颗粒度': 'Grain', '细': 'Fine', '中': 'Medium', '粗': 'Coarse',
  '恢复斜视、缩放和高度': 'Reset angle, zoom, and vertical offset',
  '向左颗粒更细密，向右颗粒更粗': 'Left for a finer mist, right for coarser grains',
  '向左喷雾更细密，落在模型上的漆点更均匀。向右可保留较明显的颗粒。': 'Move left for a finer mist and more even paint on the model. Move right for a more pronounced grain.',
  '0% 为不透明，100% 为完全透明': '0% is opaque and 100% is fully transparent',
  '提高透明度可以保留底色。调整只影响接下来喷涂或上色的漆层。': 'Raise transparency to let the underlying color show through. This applies to the next coat you spray or fill.',
  '提高连贯度，快速拖动时的喷点会更密。调低可保留较分散的喷点。': 'Raise continuity for closer spray marks when moving quickly. Lower it for more separated marks.',
  '喷涂模式': 'Spray Mode', '旋转模式': 'Orbit Mode', '点按或按住拖动': 'Tap or hold and drag', '拖动观察模型': 'Drag to orbit',
  '正在喷涂': 'Spraying', '可喷涂': 'Paintable', '瞄准可喷表面': 'Aim at a paintable surface', '已锁定本笔零件': 'Locked to the first part',
  '空喷': 'Off surface',
  '自动补色': 'Auto Fill', '自动补色阈值': 'Auto-fill threshold',
  '喷涂历史': 'Stroke history', '撤销': 'Undo', '重做': 'Redo',
  '按下到松开算一笔。用撤销或重做逐笔调整，也可用 ⌘／Ctrl + Z 和 ⌘／Ctrl + Shift + Z。': 'Each press and release counts as one stroke. Use Undo or Redo, or press Cmd/Ctrl + Z and Cmd/Ctrl + Shift + Z.',
  '静音': 'Mute', '已静音': 'Muted', '重置': 'Reset', '当前模型已重置': 'Current model reset',
  '关闭': 'Close', '观察': 'Camera', '叠色': 'Mixing', '补色': 'Auto Fill', '底材与拆装': 'Materials & Parts',
  '开始喷涂': 'Start Painting', '重置当前模型': 'Reset Current Model', '取消': 'Cancel', '确认重置': 'Reset Model',
  '清除当前模型已保存的漆层，并恢复底材、零件状态和视角。': 'Clear the saved paint on this model and restore its original materials, parts and camera.',
  '左键 / 单指喷涂 · 右键拖动旋转 · 滚轮缩放': 'Left click or touch to paint · Right drag to orbit · Scroll to zoom',
  '选择颜料，在模型上点按或按住拖动。一次按住只喷最先命中的零件。': 'Pick a pigment and tap or drag across the model. Each stroke only affects the first part it hits.',
  '鼠标右键拖动，触屏切换到旋转工具。滚轮和 ＋／－ 控制距离，右侧按钮切换视角。': 'Right-drag to orbit, or use the Orbit tool on touchscreens. Scroll or use + / − to zoom. Camera presets are on the right.',
  '关闭自动补色，降低流量，再把黄色薄喷到青色上。重叠区会呈现绿色。': 'Turn off Auto Fill and lower the flow. Mist yellow over cyan to create a green overlap.',
  '开启后，当前颜色覆盖到 35% 时会填满该零件。换色后首次命中才开始统计新一轮。': 'When the active coat reaches 35% coverage, it fills that part. The next coat starts when the new pigment first lands.',
  '材质可应用到当前件或全模型。可拆装零件的漆层随拆装保留。': 'Apply a material to one part or to all parts. Removable parts keep their paint.',
  '选择单个静态 GLB。使用白色或浅灰材质，去掉纹理、动画和透明材质。文件最大 12 MB，最多 24 个网格、总计 5 万个三角面。单个网格最多 2 万个三角面。': 'Choose one static GLB with white or light gray materials. Remove textures, animations and transparency. Limits are 12 MB, 24 meshes, 50,000 total triangles and 20,000 triangles per mesh.',
  '模型会自动摆正到台面并生成喷涂 UV。文件只在当前浏览器处理。': 'The model is centered on the platform and gets dedicated paint UVs. The file is processed locally in this browser.',
  '选择 GLB 文件': 'Choose GLB File', '正在生成喷涂 UV…': 'Generating paint UVs…',
  '白模已导入': 'Blank imported', '模型已导入，本次使用后可重新选择文件。': 'Model imported. Select the file again to use it in a new session.',
  '导入失败，请检查白模格式。': 'Import failed. Check the blank model format.',
  '请选择不超过 12 MB 的 .glb 文件。': 'Choose a .glb file no larger than 12 MB.',
  '支持 GLB、FBX 和 STL 白模。请使用静态白色或浅灰模型，文件最大 24 MB。': 'Supports GLB, FBX and STL. Use a static white or light gray model, up to 24 MB.',
  '需要分件喷涂时，请保留独立网格。Blender 文件可先导出为 GLB。': 'Keep meshes separate to paint individual parts. Export Blender files to GLB first.',
  '选择模型文件': 'Choose Model File', '模型主体': 'Model Body',
  '格式': 'Formats', '材质': 'Materials', '分件喷涂': 'Parts',
  'GLB、FBX 或 STL，单文件不超过 24 MB。': 'GLB, FBX or STL, up to 24 MB per file.',
  '白色或浅灰色的静态不透明模型。请移除贴图、顶点色、动画和蒙皮。': 'Use a static, opaque white or light gray model. Remove textures, vertex colors, animation and skinning.',
  '最多 24 个网格、合计 12 万三角面。单网格最多 6 万个三角面、6 万个顶点。': 'Up to 24 meshes and 120,000 triangles total. Each mesh can have up to 60,000 triangles and 60,000 vertices.',
  '需要分件喷涂时，请保留独立网格。单个 STL 视为一个零件。Blender 文件请先导出为 GLB。': 'Keep meshes separate to paint parts individually. Each STL counts as one part. Export Blender files to GLB first.',
  '请选择不超过 24 MB 的 GLB、FBX 或 STL 文件。': 'Choose a GLB, FBX or STL file no larger than 24 MB.',
  '白模必须是没有动画和蒙皮的静态网格。': 'Use static meshes without animations or skinning.',
  '请去掉白模的外部贴图。': 'Remove textures from the blank model.',
  '白模限 24 个网格、12 万个三角面。单个网格限 6 万个面和 6 万个顶点。': 'Use up to 24 meshes and 120,000 triangles. Each mesh is limited to 60,000 faces and 60,000 vertices.',
  '文件不是有效的 glTF 2.0 GLB。': 'The file is not a valid glTF 2.0 GLB.',
  '请导出单文件 GLB，去掉纹理、动画、蒙皮、压缩扩展和透明材质。': 'Export a standalone GLB without textures, animations, skins, compression or transparency.',
  '只接受白色或浅灰色材质。请去掉顶点颜色。': 'Use white or light gray materials and remove vertex colors.',
  '白模必须含 1 至 24 个网格，总计不超过 5 万三角面，单个网格不超过 2 万。': 'Use 1 to 24 meshes, at most 50,000 total triangles and at most 20,000 triangles per mesh.',
  '模型没有可用的三维表面。': 'The model has no usable 3D surface.',
  '无法展开喷涂 UV。请清理模型网格后重试。': 'Paint UVs could not be generated. Clean up the mesh and try again.',
  '个人白模': 'My Blank', '网格': 'Mesh', '个零件': 'parts',
  '工程机甲': 'Mech', '几何试件': 'Forms', '玩具赛车': 'Racer', '玩具火箭': 'Rocket', '玩具卡车': 'Truck',
  '车身': 'Body', '车轮': 'Wheels', '驾驶座': 'Cockpit', '火箭主体': 'Rocket Body',
  '头部装甲': 'Head Armor', '胸部外壳': 'Chest Shell', '骨盆装甲': 'Hip Armor', '动力背板': 'Backplate',
  '左肩甲': 'L Shoulder', '右肩甲': 'R Shoulder', '左臂部': 'L Arm', '右臂部': 'R Arm',
  '左腿上装甲': 'L Thigh Armor', '右腿上装甲': 'R Thigh Armor', '左小腿与足部': 'L Shin & Foot', '右小腿与足部': 'R Shin & Foot',
  '左胸甲附板': 'L Chest Plate', '右胸甲附板': 'R Chest Plate', '左膝部护板': 'L Knee Guard', '右膝部护板': 'R Knee Guard',
  '左臂部护板': 'L Arm Guard', '右臂部护板': 'R Arm Guard', '左推进组件': 'L Thruster', '右推进组件': 'R Thruster',
  '切角方体': 'Chamfered Block', '弧面球体': 'Sphere', '圆柱试件': 'Cylinder',
  '哑光白模': 'Matte Primer', '拉丝金属': 'Brushed Metal', '木纹': 'Wood Grain', '磨砂塑料': 'Frosted Plastic', '釉面陶瓷': 'Glazed Ceramic',
  '镜面不锈钢': 'Mirror Stainless Steel', '抛光不锈钢': 'Polished Steel', '拉丝不锈钢': 'Brushed Steel', '喷砂铝': 'Bead-Blasted Aluminum', '黄铜': 'Brass',
  '素烧陶土': 'Terracotta', '亮面 ABS': 'Glossy ABS', '哑光橡胶': 'Matte Rubber',
  '浅色橡木': 'Light Oak', '深色胡桃木': 'Dark Walnut', '清水混凝土': 'Cast Concrete',
  '花岗岩': 'Granite', '粒面皮革': 'Grained Leather', '编织布料': 'Woven Fabric',
  '室内棚灯': 'Indoor Studio', '室外正午': 'Noon Sun', '室外阴天': 'Overcast', '室外清晨': 'Morning',
  '室外黄昏': 'Golden Hour', '室外夜间': 'Night',
  '白': 'Chalk', '黑': 'Carbon', '钴蓝': 'Cobalt', '青': 'Cyan', '黄': 'Amber', '红': 'Vermilion',
  '雾灰': 'Mist', '钛灰': 'Titanium', '米白': 'Ivory', '玫瑰': 'Rose', '橙': 'Tangerine', '珊瑚': 'Coral',
  '青柠': 'Lime', '松绿': 'Pine', '薄荷': 'Mint', '靛蓝': 'Indigo', '薰衣草': 'Lavender', '紫': 'Plum', '金辉': 'Golden Hour'
};

const chinese = {
  'SPRAY LAB': '喷涂实验室', MODEL: '模型', PIGMENT: '颜料', COVERAGE: '覆盖率', RENDER: '渲染', FPS: '帧/秒',
  'ELLOCOLOR / SURFACE LAB': 'ElloColor / 表面实验室', 'OPTICAL STAGE 07': '光学展台 07', '01 / MODEL INDEX': '01 / 模型档案',
  '02 / SURFACE': '02 / 表面状态', '03 / VIEW': '03 / 观察视角', 'OPERATOR GUIDE': '操作手册',
  PALETTE: '色板', 'SPRAY CONTROL': '喷涂参数', 'COBALT': '钴蓝', 'ELLOCOLOR / 01': 'ElloColor / 01',
  'ASSET ARCHIVE': '白模目录'
};

let lang = new URLSearchParams(location.search).get('lang');
if (!['zh', 'en'].includes(lang)) {
  try { lang = localStorage.getItem('ellocolor-language') === 'en' ? 'en' : 'zh'; }
  catch { lang = 'zh'; }
}
const staticCopy = [];
const hasCopy = text => Object.hasOwn(english, text) || Object.hasOwn(chinese, text);
export const language = () => lang;
export const t = text => (lang === 'en' ? english[text] : chinese[text]) ?? text;
export const partCountLabel = count => `${count} ${lang === 'en' && count === 1 ? 'part' : t('个零件')}`;
export function modelTitle(definition) {
  const name = (lang === 'en' ? definition.en : definition.zh) ?? definition.name;
  return definition.mergeVersion ? `${name} · ${t('副本')} ${definition.mergeVersion}` : name;
}

export function rememberLanguage(value) {
  try { localStorage.setItem('ellocolor-language', value); }
  catch { /* Language changes still apply for the open page. */ }
}

export function collectCopy() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const key = node.data.trim();
    if (hasCopy(key)) staticCopy.push(() => {
      if (node.isConnected) node.data = t(key);
    });
  }
  for (const element of document.querySelectorAll('[aria-label],[title]')) {
    for (const attribute of ['aria-label', 'title']) {
      const key = element.getAttribute(attribute);
      if (hasCopy(key)) staticCopy.push(() => element.setAttribute(attribute, t(key)));
    }
  }
}

export function setLanguage(value) {
  lang = value;
  document.documentElement.lang = value === 'en' ? 'en' : 'zh-CN';
  document.title = 'ElloColor · ' + t('三维喷涂工作台');
  for (const apply of staticCopy) apply();
}
