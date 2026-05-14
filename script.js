// ============================================================================
// STL Мастер — клиентская логика
// Все комментарии на русском языке для удобства новичков
// ============================================================================

const API_BASE = 'https://3dcalk.freedynamicdns.net:8443/api';

// Глобальные переменные для 3D-сцены
let scene, camera, renderer, controls, currentMesh;
// Текущий файл модели (Blob) — используется и редактором, и инструментами печати
let currentBlob = null;
let currentModelName = 'model.stl';
let cadObjectCount = 0;
let _createdUrls = [];

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С API
// ============================================================================

/**
 * Добавляет к FormData флаги режима новичка, каркаса и прозрачного фона.
 * Эти флаги отправляются на сервер вместе с любым запросом к инструментам печати.
 */
function appendStlToolFormData(formData) {
  if (document.getElementById('chkBeginner')?.checked) formData.append('mode', 'beginner');
  if (document.getElementById('chkWirePreview')?.checked) formData.append('wire_preview', '1');
  if (document.getElementById('chkTransparentPreview')?.checked) formData.append('transparent_preview', '1');
}

/** Показывает PNG-превью модели из ответа сервера (по заголовку X-Preview-Id) */
function showPreviewFromResponse(res) {
  const id = res.headers.get('X-Preview-Id');
  const img = document.getElementById('previewImg');
  if (!img) return;
  if (id) {
    img.src = `${API_BASE}/stl/preview/${id}.png`;
    img.classList.add('show');
  }
}

/** Экранирует текст перед вставкой в HTML-отчёт */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Показывает HTML-отчёт в блоке анализа или советника */
function showReportBlock(elId, html) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = html;
  el.classList.remove('hidden');
}

/** Показывает JSON-данные, если сервер вернул неизвестный формат */
function showJsonBlock(elId, obj) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = JSON.stringify(obj, null, 2);
  el.classList.remove('hidden');
}

function ruYesNo(value) {
  return value ? 'да' : 'нет';
}

function ruDifficulty(value) {
  const map = {
    beginner: 'для новичка',
    intermediate: 'средняя сложность',
    advanced: 'сложно, лучше проверить специалисту'
  };
  return map[value] || value || 'не указано';
}

function formatMmList(value) {
  if (!Array.isArray(value)) return 'нет данных';
  return value.map(num => `${Number(num).toFixed(1).replace('.0', '')} мм`).join(' × ');
}

function renderTips(tips) {
  if (!Array.isArray(tips) || tips.length === 0) return '<p>Явных предупреждений нет.</p>';
  return `<ul>${tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>`;
}

/** Делает отчёт анализа понятным: сверху вывод для новичка, ниже точные параметры */
function renderAnalysisReport(data) {
  const analysis = data.analysis || data;
  const score = data.printability_score ?? analysis.printability_score ?? '—';
  const supports = data.needs_supports ?? analysis.needs_supports;
  const size = analysis.print_size_mm || data.print_size_mm;
  const watertight = analysis.watertight;
  const thinWall = analysis.thin_wall_risk;
  const overhang = analysis.overhang_score ?? analysis.support_area_hint;
  const filament = data.estimated_filament_g ?? analysis.estimated_filament_g;
  const time = data.estimated_time_h ?? analysis.estimated_time_h;

  return `
    <h4>Итог по печати</h4>
    <div class="report-grid">
      <div><strong>${escapeHtml(score)}</strong><span>оценка из 100</span></div>
      <div><strong>${escapeHtml(ruDifficulty(data.difficulty || analysis.difficulty))}</strong><span>сложность</span></div>
      <div><strong>${escapeHtml(ruYesNo(Boolean(supports)))}</strong><span>нужны поддержки</span></div>
    </div>
    <h4>Что важно проверить</h4>
    ${renderTips(data.tips || analysis.tips)}
    <h4>Точные параметры</h4>
    <dl class="report-list">
      <dt>Габариты модели</dt><dd>${escapeHtml(formatMmList(size))}</dd>
      <dt>Герметичная сетка</dt><dd>${watertight === undefined ? 'нет данных' : escapeHtml(ruYesNo(Boolean(watertight)))}</dd>
      <dt>Риск тонких стенок</dt><dd>${thinWall === undefined ? 'нет данных' : escapeHtml(ruYesNo(Boolean(thinWall)))}</dd>
      <dt>Нависания</dt><dd>${overhang === undefined ? 'нет данных' : `${escapeHtml(overhang)}%`}</dd>
      <dt>Примерно пластика</dt><dd>${filament ? `${escapeHtml(filament)} г` : 'нет данных'}</dd>
      <dt>Примерное время</dt><dd>${time ? `${escapeHtml(time)} ч` : 'нет данных'}</dd>
    </dl>
  `;
}

/** Делает советы слайсера читаемыми без английских технических ключей */
function renderAdvisorReport(data) {
  return `
    <h4>Настройки для слайсера</h4>
    <dl class="report-list">
      <dt>Материал</dt><dd>${escapeHtml(data.material_label_ru || data.material || 'не указан')}</dd>
      <dt>Высота слоя</dt><dd>${data.layer_height ? `${escapeHtml(data.layer_height)} мм` : 'по умолчанию'}</dd>
      <dt>Поддержки</dt><dd>${escapeHtml(data.supports || 'по ситуации')}</dd>
      <dt>Прилипание к столу</dt><dd>${escapeHtml(data.adhesion || 'обычное')}</dd>
      <dt>Температура стола</dt><dd>${data.bed_temp_c_hint ? `${escapeHtml(data.bed_temp_c_hint)} °C` : 'по профилю материала'}</dd>
    </dl>
    <h4>Советы</h4>
    ${renderTips(data.tips)}
  `;
}

/**
 * Экспортирует текущую 3D-модель из просмотра в STL-Blob.
 * Нужно, чтобы клиентские трансформации (поворот, размещение) сохранялись при скачивании.
 */
function exportCurrentMeshAsBlob() {
  if (!currentMesh) return null;
  try {
    // Клонируем геометрию, чтобы не менять отображаемую модель
    const exportGeo = currentMesh.geometry.clone();
    // Убираем смещение на стол (центрирование), чтобы экспортировать чистую геометрию
    // и переводим обратно: Y-up (Three.js) -> Z-up (STL для 3D-печати)
    exportGeo.rotateX(Math.PI / 2);

    const exportMesh = new THREE.Mesh(exportGeo, currentMesh.material);
    const exporter = new THREE.STLExporter();
    const stlString = exporter.parse(exportMesh);
    exportGeo.dispose();
    return new Blob([stlString], { type: 'application/octet-stream' });
  } catch (e) {
    console.error('Ошибка экспорта STL из Three.js:', e);
    return null;
  }
}

/**
 * Обновляет currentBlob из текущей 3D-модели в просмотрщике.
 * Вызывается после клиентских трансформаций (поворот, размещение на столе).
 */
function syncBlobFromMesh() {
  const blob = exportCurrentMeshAsBlob();
  if (blob) {
    currentBlob = blob;
    window.currentFile = new File([blob], 'model.stl', { type: 'application/octet-stream' });
  }
}

/** Получает текущий Blob модели (из currentBlob или создаёт из 3D-сцены) */
function getCurrentBlob() {
  return currentBlob;
}

/** Получает текущий файл для отправки на сервер */
function getCurrentFile() {
  if (window.currentFile) return window.currentFile;
  if (currentBlob) return new File([currentBlob], 'model.stl', { type: 'application/octet-stream' });
  return null;
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Инициализация VK Bridge (для работы внутри VK Mini Apps)
  if (typeof vkBridge !== 'undefined') {
    try {
      await vkBridge.send('VKWebAppInit');
      console.log('✅ VK Bridge подключён');
    } catch (e) { console.warn('⚠️ VK Bridge:', e); }
  }
  init3DViewer();
  setupFileDrop();
  setupPrintFileDrop();
  setupKeychainControls();
  switchTab('editor');
});

// ============================================================================
// 3D ПРОСМОТРЩИК
// ============================================================================

/**
 * Создаёт 3D-сцену Three.js с освещением, сеткой стола и камерой.
 * Сетка стола располагается на Y=0 (в Three.js ось Y — вверх).
 */
function init3DViewer() {
  const container = document.getElementById('viewer');
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
  camera.position.set(80, 80, 120);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Освещение: рассеянный свет + направленный
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(50, 100, 50);
  scene.add(light);
  const light2 = new THREE.DirectionalLight(0xffffff, 0.3);
  light2.position.set(-30, 50, -50);
  scene.add(light2);

  // Сетка стола (строительная платформа принтера) на Y=0
  const grid = new THREE.GridHelper(200, 20, 0x555555, 0x333333);
  grid.position.y = 0;
  scene.add(grid);

  // Тонкая плоскость-подложка, чтобы модель визуально «стояла» на столе
  const planeGeo = new THREE.PlaneGeometry(200, 200);
  const planeMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.01;
  scene.add(plane);

  // Оси координат (небольшие линии-указатели)
  const axisLen = 15;
  const axisHelper = new THREE.Group();
  const xMat = new THREE.LineBasicMaterial({ color: 0xff4444 });
  const yMat = new THREE.LineBasicMaterial({ color: 0x44ff44 });
  const zMat = new THREE.LineBasicMaterial({ color: 0x4444ff });
  const xGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(axisLen,0,0)]);
  const yGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,axisLen,0)]);
  const zGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,axisLen)]);
  axisHelper.add(new THREE.Line(xGeo, xMat));
  axisHelper.add(new THREE.Line(yGeo, yMat));
  axisHelper.add(new THREE.Line(zGeo, zMat));
  scene.add(axisHelper);

  animate();
  window.addEventListener('resize', onResize);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function onResize() {
  const container = document.getElementById('viewer');
  if (!container || !camera || !renderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

/**
 * Загружает STL из Blob в просмотрщик.
 * Модель центрируется по X/Z и ставится низом на стол (Y=0).
 */
function loadSTL(blob) {
  return new Promise((resolve, reject) => {
    // Удаляем предыдущую модель
    if (currentMesh) {
      scene.remove(currentMesh);
      if (currentMesh.geometry) currentMesh.geometry.dispose();
      if (currentMesh.material) currentMesh.material.dispose();
      currentMesh = null;
    }
    const loader = new THREE.STLLoader();
    const url = URL.createObjectURL(blob);
    _createdUrls.push(url);
    loader.load(url, (geometry) => {
      URL.revokeObjectURL(url);
      _createdUrls = _createdUrls.filter(u => u !== url);

      geometry.computeVertexNormals();

      // STL-файлы для 3D-печати используют Z вверх, а Three.js — Y вверх.
      // Поворачиваем геометрию: Z-up -> Y-up, чтобы модель правильно отображалась.
      geometry.rotateX(-Math.PI / 2);

      // Центрируем модель по горизонтали (X и Z) и ставим низ на стол (Y=0)
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      const center = new THREE.Vector3();
      box.getCenter(center);

      const offsetX = -center.x;
      const offsetY = -box.min.y;  // низ модели на столе (Y=0)
      const offsetZ = -center.z;
      geometry.translate(offsetX, offsetY, offsetZ);

      const material = new THREE.MeshStandardMaterial({
        color: 0x4a76a8,
        roughness: 0.5,
        metalness: 0.1
      });
      currentMesh = new THREE.Mesh(geometry, material);
      scene.add(currentMesh);
      fitCamera(currentMesh);
      resolve();
    }, undefined, (err) => {
      URL.revokeObjectURL(url);
      _createdUrls = _createdUrls.filter(u => u !== url);
      reject(err);
    });
  });
}

/** Подгоняет камеру так, чтобы модель целиком была видна */
function fitCamera(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.2;
  camera.position.set(center.x + cameraZ * 0.3, center.y + cameraZ * 0.5, center.z + cameraZ);
  controls.target.copy(center);
  controls.update();
}

// ============================================================================
// ВКЛАДКИ
// ============================================================================

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(el => { if (el) el.classList.add('hidden'); });
  document.querySelectorAll('.tab-btn').forEach(el => { if (el) el.classList.remove('active'); });
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.classList.remove('hidden');
  const btn = document.querySelector(`.tab-btn[onclick*="${tab}"]`);
  if (btn) btn.classList.add('active');
  setTimeout(onResize, 100);
}

/** Показывает/прячет блоки параметров в зависимости от выбранного действия */
function toggleParams() {
  const action = document.getElementById('action')?.value;
  if (!action) return;
  ['text', 'hole', 'eyes', 'cut_box'].forEach(id => {
    const el = document.getElementById(`params-${id}`);
    if (el) el.classList.toggle('hidden', action !== id);
  });
}

// ============================================================================
// ЗАГРУЗКА ФАЙЛОВ
// ============================================================================

/** Настраивает зону загрузки файла (основная, для редактора) */
function setupFileDrop() {
  const drop = document.getElementById('fileDrop');
  const input = document.getElementById('stlFile');
  if (!drop || !input) return;
  drop.onclick = () => input.click();
  drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = '#4a76a8'; };
  drop.ondragleave = () => { drop.style.borderColor = ''; };
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.style.borderColor = '';
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file, { showEditor: true, source: 'editor' });
  };
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file, { showEditor: true, source: 'editor' });
  };
}

/** Настраивает зону загрузки файла для инструментов печати (отдельная) */
function setupPrintFileDrop() {
  const drop = document.getElementById('printFileDrop');
  const input = document.getElementById('printStlFile');
  if (!drop || !input) return;
  drop.onclick = () => input.click();
  drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = '#4a76a8'; };
  drop.ondragleave = () => { drop.style.borderColor = ''; };
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.style.borderColor = '';
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file, { showEditor: false, source: 'print' });
  };
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file, { showEditor: false, source: 'print' });
  };
}

/**
 * Обрабатывает загруженный STL-файл.
 * Файл сохраняется в window.currentFile и currentBlob,
 * показываются редактор и инструменты ориентации.
 */
function handleFile(file, options = {}) {
  if (!file || !file.name.toLowerCase().endsWith('.stl')) {
    showStatus('❌ Выберите файл с расширением .stl', true);
    return;
  }
  const showEditor = options.showEditor !== false;
  window.currentFile = file;
  currentBlob = file;
  currentModelName = file.name || 'model.stl';
  // Показываем блоки управления
  const editorCtrl = document.getElementById('editorControls');
  if (editorCtrl && showEditor) editorCtrl.classList.remove('hidden');
  const orientCtrl = document.getElementById('orientControls');
  if (orientCtrl) orientCtrl.classList.remove('hidden');
  updatePrintFileInfo(file.name, options.source);
  // Загружаем модель в 3D-просмотр
  loadSTL(file).then(() => showStatus(`✅ Загружено: ${file.name}`)).catch(() => showStatus('❌ Ошибка загрузки STL', true));
}

/** Обновляет подпись около инструментов печати, чтобы было видно, какой STL сейчас выбран */
function updatePrintFileInfo(filename, source) {
  const info = document.getElementById('printFileInfo');
  if (!info) return;
  const sourceText = source === 'print' ? 'загружен для инструментов печати' : 'взят из редактора';
  info.textContent = `Активная модель: ${filename || 'model.stl'} (${sourceText}).`;
  info.classList.remove('hidden');
}

// ============================================================================
// ОРИЕНТАЦИЯ И РАЗМЕЩЕНИЕ МОДЕЛИ НА СТОЛЕ
// ============================================================================

/**
 * Поворачивает модель указанной стороной вниз (на стол).
 * После поворота модель автоматически ставится низом на Y=0 (Z=0 в координатах печати).
 *
 * @param {string} face — какая сторона модели смотрит вниз:
 *   'bottom' — текущий низ остаётся внизу (без поворота, только выравнивание)
 *   'top'    — перевернуть модель вверх ногами
 *   'front'  — передняя стенка вниз
 *   'back'   — задняя стенка вниз
 *   'left'   — левая стенка вниз
 *   'right'  — правая стенка вниз
 */
function orientFace(face) {
  if (!currentMesh) {
    showStatus('❌ Сначала загрузите STL-модель', true);
    return;
  }

  // Повороты вокруг осей (в координатах просмотрщика Three.js: Y — вверх)
  // Кнопки соответствуют сторонам модели так, как она видна на экране.
  const HALF_PI = Math.PI / 2;

  switch (face) {
    case 'bottom':
      // Текущий низ остаётся внизу — просто выравниваем на стол
      break;
    case 'top':
      // Перевернуть модель (тот край, который сейчас вверху, станет на стол)
      currentMesh.rotation.z += Math.PI;
      break;
    case 'front':
      // Передняя стенка (ближе к зрителю) вниз — поворот вокруг X
      currentMesh.rotation.x -= HALF_PI;
      break;
    case 'back':
      // Задняя стенка (дальше от зрителя) вниз — поворот вокруг X
      currentMesh.rotation.x += HALF_PI;
      break;
    case 'left':
      // Левая стенка вниз — поворот вокруг Z
      currentMesh.rotation.z += HALF_PI;
      break;
    case 'right':
      // Правая стенка вниз — поворот вокруг Z
      currentMesh.rotation.z -= HALF_PI;
      break;
    default:
      showStatus('❌ Неизвестная сторона ориентации', true);
      return;
  }

  // Применяем поворот к геометрии и обнуляем rotation
  applyRotationToGeometry();

  // Ставим модель низом на стол (Y=0)
  placeMeshOnBed();

  // Синхронизируем Blob с трансформированной моделью
  syncBlobFromMesh();
  prepareDownload(`oriented_${currentModelName.replace(/\.stl$/i, '')}.stl`);

  showStatus(`✅ Модель ориентирована стороной «${getFaceName(face)}» вниз`);
  fitCamera(currentMesh);
}

/** Человекочитаемое название стороны */
function getFaceName(face) {
  const names = {
    'bottom': 'низ', 'top': 'верх',
    'front': 'перед', 'back': 'зад',
    'left': 'лево', 'right': 'право'
  };
  return names[face] || face;
}

/**
 * Применяет текущий rotation меша к его геометрии
 * (чтобы поворот «запекался» в вершины, а rotation сбрасывался).
 */
function applyRotationToGeometry() {
  if (!currentMesh) return;
  currentMesh.updateMatrix();
  currentMesh.geometry.applyMatrix4(currentMesh.matrix);
  currentMesh.position.set(0, 0, 0);
  currentMesh.rotation.set(0, 0, 0);
  currentMesh.scale.set(1, 1, 1);
  currentMesh.updateMatrix();
}

/**
 * Ставит модель нижней точкой на Y=0 (строительный стол принтера).
 * Горизонтально модель не сдвигается — только по вертикали.
 */
function placeMeshOnBed() {
  if (!currentMesh) return;
  currentMesh.geometry.computeBoundingBox();
  const box = currentMesh.geometry.boundingBox;
  const minY = box.min.y;
  if (Math.abs(minY) > 0.001) {
    currentMesh.geometry.translate(0, -minY, 0);
  }
}

/**
 * Кнопка «Положить на стол (Z=0)» — ставит модель низом на Y=0.
 * Полезно, если модель «висит» в воздухе.
 */
function placeOnBed() {
  if (!currentMesh) {
    showStatus('❌ Сначала загрузите STL-модель', true);
    return;
  }
  placeMeshOnBed();
  syncBlobFromMesh();
  prepareDownload(`z0_${currentModelName.replace(/\.stl$/i, '')}.stl`);
  showStatus('✅ Модель установлена на стол (Z = 0)');
  fitCamera(currentMesh);
}

// ============================================================================
// РЕДАКТОР STL — ОТПРАВКА ИЗМЕНЕНИЙ НА СЕРВЕР
// ============================================================================

/**
 * Применяет выбранное действие к модели (текст, отверстие, глаза, вырез).
 * Отправляет файл и параметры на сервер, получает изменённый STL обратно.
 */
async function processSTL() {
  const file = getCurrentFile();
  if (!file) { showStatus('❌ Загрузите STL файл', true); return; }
  const formData = new FormData();
  formData.append('file', file);
  const action = document.getElementById('action')?.value;
  if (!action) { showStatus('❌ Выберите действие', true); return; }
  formData.append('action', action);

  if (action === 'text') {
    formData.append('text', document.getElementById('editText')?.value || 'A');
    formData.append('size', document.getElementById('fontSize')?.value || '8');
    formData.append('depth', document.getElementById('textDepth')?.value || '1');
    formData.append('mode', document.getElementById('textMode')?.value || 'cut');
    // Направление текста: горизонтально или вертикально
    formData.append('text_direction', document.getElementById('textDirection')?.value || 'horizontal');
    formData.append('offset_x', document.getElementById('offsetX')?.value || 0);
    formData.append('offset_y', document.getElementById('offsetY')?.value || 0);
  }
  if (action === 'hole') {
    formData.append('radius', document.getElementById('holeRadius')?.value || '2');
    formData.append('depth', document.getElementById('holeDepth')?.value || '0');
    formData.append('offset_x', document.getElementById('holeOffsetX')?.value || 0);
    formData.append('offset_y', document.getElementById('holeOffsetY')?.value || 0);
  }
  if (action === 'eyes') {
    formData.append('radius', document.getElementById('eyeRadius')?.value || '2');
    formData.append('distance', document.getElementById('eyeDistance')?.value || '10');
    formData.append('offset_x', document.getElementById('eyeOffsetX')?.value || 0);
    formData.append('offset_y', document.getElementById('eyeOffsetY')?.value || 0);
  }
  if (action === 'cut_box') {
    formData.append('x', document.getElementById('cutX')?.value || '5');
    formData.append('y', document.getElementById('cutY')?.value || '5');
    formData.append('z', document.getElementById('cutZ')?.value || '5');
  }
  appendStlToolFormData(formData);

  try {
    showStatus('⏳ Обработка...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`${API_BASE}/stl/editor-advanced`, { method: 'POST', body: formData, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      let errorText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errorText = errJson.error;
        if (errJson.message) errorText += `: ${errJson.message}`;
      } catch (e) { try { const txt = await res.clone().text(); if (txt) errorText += `: ${txt.substring(0, 200)}`; } catch (_) {} }
      throw new Error(errorText);
    }
    currentBlob = await res.blob();
    window.currentFile = new File([currentBlob], 'edited_model.stl', { type: 'application/octet-stream' });
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('edited_model.stl');
    showStatus('✅ Изменения применены');
  } catch (e) {
    console.error('Ошибка обработки:', e);
    if (e.name === 'AbortError') showStatus('❌ Таймаут: сервер не ответил за 60 сек', true);
    else showStatus(`❌ ${e.message.substring(0, 100)}`, true);
  }
}

// ============================================================================
// ИНСТРУМЕНТЫ ДЛЯ ПЕЧАТИ
// Все эти функции работают независимо от редактора —
// достаточно загрузить STL через любую зону загрузки.
// ============================================================================

/** Анализирует STL-модель: оценивает пригодность для печати, нависания, герметичность */
async function analyzeStl() {
  const file = getCurrentFile();
  if (!file) { showStatus('❌ Загрузите STL-файл для анализа', true); return; }
  const fd = new FormData();
  fd.append('file', file);
  appendStlToolFormData(fd);
  try {
    showStatus('⏳ Анализ модели...');
    const res = await fetch(`${API_BASE}/stl/analyze`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showReportBlock('analyzeOut', renderAnalysisReport(data));
    showStatus(`✅ Оценка печатности: ${data.printability_score ?? '—'} баллов`);
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

/** Восстанавливает сетку STL: исправляет дыры, нормали, дубликаты граней */
async function repairStl() {
  const file = getCurrentFile();
  if (!file) { showStatus('❌ Загрузите STL-файл для восстановления', true); return; }
  const fd = new FormData();
  fd.append('file', file);
  appendStlToolFormData(fd);
  try {
    showStatus('⏳ Восстановление сетки...');
    const res = await fetch(`${API_BASE}/stl/repair`, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    currentBlob = await res.blob();
    window.currentFile = new File([currentBlob], 'repaired.stl', { type: 'application/octet-stream' });
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('repaired.stl');
    showStatus('✅ Сетка восстановлена');
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

/**
 * Автоматически подбирает ориентацию модели для наилучшей печати.
 * Сервер пробует разные повороты и выбирает тот, где меньше нависаний.
 */
async function autoOrientStl() {
  const file = getCurrentFile();
  if (!file) { showStatus('❌ Загрузите STL-файл для авто-ориентации', true); return; }
  const fd = new FormData();
  fd.append('file', file);
  appendStlToolFormData(fd);
  try {
    showStatus('⏳ Авто-ориентация модели...');
    const res = await fetch(`${API_BASE}/stl/auto-orient`, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    currentBlob = await res.blob();
    window.currentFile = new File([currentBlob], 'oriented.stl', { type: 'application/octet-stream' });
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('oriented.stl');
    showStatus('✅ Модель автоматически ориентирована для печати');
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

/**
 * Автоматическое исправление: восстановление сетки + ориентация + анализ.
 * С опцией withZipReport=True — скачивается ZIP-архив с отчётом и превью.
 */
async function autoFixStl(withZipReport) {
  const file = getCurrentFile();
  if (!file) { showStatus('❌ Загрузите STL-файл для автоисправления', true); return; }
  const fd = new FormData();
  fd.append('file', file);
  appendStlToolFormData(fd);
  if (withZipReport) fd.append('bundle', 'zip');
  try {
    showStatus('⏳ Автоисправление модели...');
    const res = await fetch(`${API_BASE}/stl/auto-fix`, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('zip')) {
      currentBlob = await res.blob();
      prepareDownload('autofix_bundle.zip');
      showStatus('✅ ZIP с моделью, отчётом и превью готов');
      return;
    }
    currentBlob = await res.blob();
    window.currentFile = new File([currentBlob], 'autofixed.stl', { type: 'application/octet-stream' });
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('autofixed.stl');
    showStatus('✅ Автоисправление выполнено');
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

/**
 * Помощник по настройкам слайсера — даёт советы по печати
 * (слой, поддержки, температура стола) с учётом выбранного материала.
 */
async function fetchPrintAdvisor() {
  const mat = document.getElementById('advisorMaterial')?.value || 'PLA';
  try {
    showStatus('⏳ Получение советов по печати...');
    let res;
    const file = getCurrentFile();
    if (file) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('material', mat);
      if (document.getElementById('chkBeginner')?.checked) fd.append('mode', 'beginner');
      res = await fetch(`${API_BASE}/stl/print-advisor`, { method: 'POST', body: fd });
    } else {
      res = await fetch(`${API_BASE}/stl/print-advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material: mat,
          ...(document.getElementById('chkBeginner')?.checked ? { mode: 'beginner' } : {})
        })
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showReportBlock('advisorOut', renderAdvisorReport(data));
    showStatus('✅ Советы по настройкам слайсера получены');
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

// ============================================================================
// БРЕЛОК
// ============================================================================

function setupKeychainControls() {
  const shape = document.getElementById('keyShape');
  const hole = document.getElementById('keyHoleDiameter');
  const loopX = document.getElementById('keyLoopX');
  const loopY = document.getElementById('keyLoopY');
  if (shape) shape.addEventListener('change', updateKeychainControls);
  if (hole) hole.addEventListener('input', updateKeychainControls);
  if (loopX) loopX.addEventListener('input', () => { loopX.dataset.touched = '1'; updateKeychainControls(); });
  if (loopY) loopY.addEventListener('input', () => { loopY.dataset.touched = '1'; updateKeychainControls(); });
  updateKeychainControls();
}

function updateKeychainControls() {
  const shape = document.getElementById('keyShape')?.value || 'rect';
  const hole = document.getElementById('keyHoleDiameter');
  const value = document.getElementById('keyHoleDiameterValue');
  const heartControls = document.getElementById('heartHoleControls');

  if (value && hole) value.textContent = `${Number(hole.value).toFixed(1).replace('.0', '')} мм`;
  if (heartControls) heartControls.classList.toggle('hidden', shape !== 'heart');

  if (shape === 'heart') {
    const loopX = document.getElementById('keyLoopX');
    const loopY = document.getElementById('keyLoopY');
    if (loopX && !loopX.dataset.touched) loopX.value = '-7';
    if (loopY && !loopY.dataset.touched) loopY.value = '4';
  }
}

async function generateKeychain() {
  try {
    showStatus('⏳ Генерация брелка...');
    const shape = document.getElementById('keyShape')?.value || 'rect';
    const payload = {
      text: document.getElementById('keyText')?.value || 'VK',
      language: document.getElementById('keyLanguage')?.value || 'auto',
      width: parseFloat(document.getElementById('keyWidth')?.value) || 50,
      height: parseFloat(document.getElementById('keyHeight')?.value) || 30,
      thickness: parseFloat(document.getElementById('keyThick')?.value) || 3,
      font_size: parseFloat(document.getElementById('keyFontSize')?.value) || 10,
      text_mode: document.getElementById('keyTextMode')?.value || 'cut',
      shape,
      hole_diameter: parseFloat(document.getElementById('keyHoleDiameter')?.value) || 4
    };
    if (shape === 'heart') {
      payload.loop_x = parseFloat(document.getElementById('keyLoopX')?.value) || -7;
      payload.loop_y = parseFloat(document.getElementById('keyLoopY')?.value) || 4;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`${API_BASE}/generate/keychain-advanced`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      let errorText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errorText = errJson.error;
        if (errJson.message) errorText += `: ${errJson.message}`;
      } catch (e) { try { const txt = await res.clone().text(); if (txt) errorText += `: ${txt.substring(0, 200)}`; } catch (_) {} }
      throw new Error(errorText);
    }
    currentBlob = await res.blob();
    window.currentFile = new File([currentBlob], 'keychain.stl', { type: 'application/octet-stream' });
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('keychain.stl');
    showStatus('✅ Брелок сгенерирован');
  } catch (e) {
    console.error('Ошибка генерации брелка:', e);
    if (e.name === 'AbortError') showStatus('❌ Таймаут: сервер не ответил за 60 сек', true);
    else showStatus(`❌ ${e.message.substring(0, 100)}`, true);
  }
}

// ============================================================================
// CAD КОНСТРУКТОР
// ============================================================================

function addCadObject() {
  cadObjectCount++;
  const id = cadObjectCount;
  const container = document.getElementById('cadObjects');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'cad-object-card';
  div.innerHTML = `
    <div class="cad-object-header">
      <span class="cad-object-title">Объект #${id}</span>
      <button type="button" onclick="this.closest('.cad-object-card')?.remove()" style="background:#dc3545;padding:6px 12px;border-radius:6px;font-size:12px;width:auto;margin:0;">✕ Удалить</button>
    </div>
    <label>Тип фигуры:</label>
    <select id="cad-type-${id}" onchange="updateCadParams(${id})">
      <option value="box">📦 Куб</option>
      <option value="cylinder">🔵 Цилиндр</option>
      <option value="sphere">⚪ Сфера</option>
      <option value="cone">🔺 Конус</option>
    </select>
    <div id="cad-params-${id}"></div>
    <label>Операция:</label>
    <select id="cad-op-${id}"><option value="union">➕ Объединить</option><option value="cut">➖ Вычесть</option></select>
    <label>Позиция (мм):</label>
    <div class="row">
      <div><small>X</small><input type="number" id="cad-x-${id}" value="0" step="1"></div>
      <div><small>Y</small><input type="number" id="cad-y-${id}" value="0" step="1"></div>
      <div><small>Z</small><input type="number" id="cad-z-${id}" value="0" step="1"></div>
    </div>`;
  container.appendChild(div);
  updateCadParams(id);
}

function updateCadParams(id) {
  const type = document.getElementById(`cad-type-${id}`)?.value;
  const paramsDiv = document.getElementById(`cad-params-${id}`);
  if (!type || !paramsDiv) return;
  if (type === 'box') {
    paramsDiv.innerHTML = `<label>Ширина (мм)</label><input type="number" id="cad-w-${id}" value="20" min="1" max="100"><label>Высота (мм)</label><input type="number" id="cad-h-${id}" value="10" min="1" max="100"><label>Глубина (мм)</label><input type="number" id="cad-d-${id}" value="10" min="1" max="100">`;
  } else if (type === 'cylinder') {
    paramsDiv.innerHTML = `<label>Радиус (мм)</label><input type="number" id="cad-r-${id}" value="5" min="1" max="50"><label>Высота (мм)</label><input type="number" id="cad-h-${id}" value="20" min="1" max="100">`;
  } else if (type === 'sphere') {
    paramsDiv.innerHTML = `<label>Радиус сферы (мм)</label><input type="number" id="cad-r-${id}" value="10" min="1" max="50">`;
  } else if (type === 'cone') {
    paramsDiv.innerHTML = `<label>Радиус основания (мм)</label><input type="number" id="cad-r1-${id}" value="10" min="1" max="50"><label>Радиус вершины (мм)</label><input type="number" id="cad-r2-${id}" value="0" min="0" max="50"><label>Высота (мм)</label><input type="number" id="cad-h-${id}" value="20" min="1" max="100">`;
  }
}

async function buildCadModel() {
  const objects = [];
  for (let i = 1; i <= cadObjectCount; i++) {
    const typeEl = document.getElementById(`cad-type-${i}`);
    if (!typeEl) continue;
    const type = typeEl.value;
    const params = {};
    if (type === 'box') {
      params.width = parseFloat(document.getElementById(`cad-w-${i}`)?.value) || 20;
      params.height = parseFloat(document.getElementById(`cad-h-${i}`)?.value) || 10;
      params.depth = parseFloat(document.getElementById(`cad-d-${i}`)?.value) || 10;
    } else if (type === 'cylinder') {
      params.radius = parseFloat(document.getElementById(`cad-r-${i}`)?.value) || 5;
      params.height = parseFloat(document.getElementById(`cad-h-${i}`)?.value) || 20;
    } else if (type === 'sphere') {
      params.radius = parseFloat(document.getElementById(`cad-r-${i}`)?.value) || 10;
    } else if (type === 'cone') {
      params.radius1 = parseFloat(document.getElementById(`cad-r1-${i}`)?.value) || 10;
      params.radius2 = parseFloat(document.getElementById(`cad-r2-${i}`)?.value) || 0;
      params.height = parseFloat(document.getElementById(`cad-h-${i}`)?.value) || 20;
    }
    objects.push({
      type,
      position: { x: parseFloat(document.getElementById(`cad-x-${i}`)?.value) || 0, y: parseFloat(document.getElementById(`cad-y-${i}`)?.value) || 0, z: parseFloat(document.getElementById(`cad-z-${i}`)?.value) || 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      operation: document.getElementById(`cad-op-${i}`)?.value || 'union',
      params
    });
  }
  if (objects.length === 0) { showStatus('❌ Добавьте хотя бы один объект', true); return; }
  try {
    showStatus('⏳ Сборка CAD-модели...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`${API_BASE}/cad-editor/build`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objects,
        mode: document.getElementById('cadBeginnerMode')?.checked ? 'beginner' : undefined
      }), signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      let errorText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errorText = errJson.error;
        if (errJson.message) errorText += `: ${errJson.message}`;
      } catch (e) { try { const txt = await res.clone().text(); if (txt) errorText += `: ${txt.substring(0, 200)}`; } catch (_) {} }
      throw new Error(errorText);
    }
    currentBlob = await res.blob();
    window.currentFile = new File([currentBlob], 'cad_model.stl', { type: 'application/octet-stream' });
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('cad_model.stl');
    showStatus('✅ CAD-модель собрана');
  } catch (e) {
    console.error('Ошибка сборки CAD:', e);
    if (e.name === 'AbortError') showStatus('❌ Таймаут: сервер не ответил за 60 сек', true);
    else showStatus(`❌ ${e.message.substring(0, 100)}`, true);
  }
}

// ============================================================================
// СКАЧИВАНИЕ STL
// ============================================================================

/** Подготавливает кнопку скачивания с нужным именем файла */
function prepareDownload(filename) {
  const btn = document.getElementById('btnDownload');
  if (!btn) return;
  btn.classList.remove('hidden');
  btn.onclick = () => downloadSTL(filename);
}

/**
 * Скачивает текущую модель как STL-файл.
 * Использует currentBlob (результат серверной обработки или клиентского экспорта).
 */
function downloadSTL(filename = 'model.stl') {
  if (!currentBlob) { showStatus('❌ Нет модели для скачивания', true); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(currentBlob);
  a.download = filename;
  setTimeout(() => { URL.revokeObjectURL(a.href); }, 1000);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showStatus('💾 Файл скачивается...');
}

// ============================================================================
// СТАТУС И УВЕДОМЛЕНИЯ
// ============================================================================

/** Показывает уведомление внизу экрана */
function showStatus(text, error = false) {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = text;
  status.className = error ? 'status show error' : 'status show';
  if (!error) setTimeout(() => { if (status.textContent === text) status.classList.remove('show'); }, 5000);
}

// ============================================================================
// ОЧИСТКА ПАМЯТИ
// ============================================================================

function cleanupUrls() {
  _createdUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
  _createdUrls = [];
}

// ============================================================================
// ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ
// ============================================================================

window.addEventListener('error', (e) => console.error('🔴 Глобальная ошибка:', e.error));
window.addEventListener('unhandledrejection', (e) => console.error('🔴 Необработанный Promise:', e.reason));
window.addEventListener('beforeunload', () => { cleanupUrls(); if (renderer) renderer.dispose(); });
