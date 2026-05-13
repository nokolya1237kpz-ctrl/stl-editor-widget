const API_BASE = 'https://3dcalk.freedynamicdns.net:8443/api';

let scene, camera, renderer, controls, currentMesh;
let currentBlob = null;
let cadObjectCount = 0;
let _createdUrls = [];

function appendStlToolFormData(formData) {
  if (document.getElementById('chkBeginner')?.checked) formData.append('mode', 'beginner');
  if (document.getElementById('chkWirePreview')?.checked) formData.append('wire_preview', '1');
  if (document.getElementById('chkTransparentPreview')?.checked) formData.append('transparent_preview', '1');
}

function showPreviewFromResponse(res) {
  const id = res.headers.get('X-Preview-Id');
  const img = document.getElementById('previewImg');
  if (!img) return;
  if (id) {
    img.src = `${API_BASE}/stl/preview/${id}.png`;
    img.classList.add('show');
  }
}

function showJsonBlock(elId, obj) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = JSON.stringify(obj, null, 2);
  el.classList.remove('hidden');
}

// ================= INIT =================
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof vkBridge !== 'undefined') {
    try {
      await vkBridge.send('VKWebAppInit');
      console.log('✅ VK Bridge OK');
    } catch (e) { console.warn('⚠️ VK Bridge:', e); }
  }
  init3DViewer();
  setupFileDrop();
  setupKeychainControls();
  switchTab('editor');
});

// ================= 3D VIEWER =================
function init3DViewer() {
  const container = document.getElementById('viewer');
  if (!container) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
  camera.position.set(0, 0, 150);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(50, 50, 50);
  scene.add(light);
  const grid = new THREE.GridHelper(200, 20);
  grid.position.y = -50;
  scene.add(grid);
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

function loadSTL(blob) {
  return new Promise((resolve, reject) => {
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
      geometry.center();
      const material = new THREE.MeshStandardMaterial({ color: 0x4a76a8 });
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

function fitCamera(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2;
  camera.position.set(center.x, center.y, center.z + cameraZ);
  controls.target.copy(center);
  controls.update();
}

// ================= TABS =================
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(el => { if (el) el.classList.add('hidden'); });
  document.querySelectorAll('.tab-btn').forEach(el => { if (el) el.classList.remove('active'); });
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.classList.remove('hidden');
  const btn = document.querySelector(`.tab-btn[onclick*="${tab}"]`);
  if (btn) btn.classList.add('active');
  setTimeout(onResize, 100);
}

function toggleParams() {
  const action = document.getElementById('action')?.value;
  if (!action) return;
  ['text', 'hole', 'eyes', 'cut_box'].forEach(id => {
    const el = document.getElementById(`params-${id}`);
    if (el) el.classList.toggle('hidden', action !== id);
  });
}

// ================= FILE DROP =================
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
    if (file) handleFile(file);
  };
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };
}

function handleFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.stl')) {
    showStatus('❌ Выберите файл с расширением .stl', true);
    return;
  }
  window.currentFile = file;
  const controls = document.getElementById('editorControls');
  if (controls) controls.classList.remove('hidden');
  loadSTL(file).then(() => showStatus(`✅ ${file.name}`)).catch(() => showStatus('❌ Ошибка загрузки STL', true));
}

// ================= STL EDITOR =================
async function processSTL() {
  if (!window.currentFile) { showStatus('❌ Загрузите STL файл', true); return; }
  const formData = new FormData();
  formData.append('file', window.currentFile);
  const action = document.getElementById('action')?.value;
  if (!action) { showStatus('❌ Выберите действие', true); return; }
  formData.append('action', action);
  if (action === 'text') {
    formData.append('text', document.getElementById('editText')?.value || 'A');
    formData.append('size', document.getElementById('fontSize')?.value || '8');
    formData.append('depth', document.getElementById('textDepth')?.value || '1');
    formData.append('mode', document.getElementById('textMode')?.value || 'cut');
    formData.append('offset_x', document.getElementById('offsetX')?.value || 0);
    formData.append('offset_y', document.getElementById('offsetY')?.value || 0);
  }
  if (action === 'hole') {
    formData.append('radius', document.getElementById('holeRadius')?.value || '2');
    formData.append('depth', document.getElementById('holeDepth')?.value || '0');
    formData.append('offset_x', document.getElementById('offsetX')?.value || 0);
    formData.append('offset_y', document.getElementById('offsetY')?.value || 0);
  }
  if (action === 'eyes') {
    formData.append('radius', document.getElementById('eyeRadius')?.value || '2');
    formData.append('distance', document.getElementById('eyeDistance')?.value || '10');
    formData.append('offset_x', document.getElementById('offsetX')?.value || 0);
    formData.append('offset_y', document.getElementById('offsetY')?.value || 0);
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
    const timeout = setTimeout(() => controller.abort(), 30000);
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
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('edited_model.stl');
    showStatus('✅ Готово');
  } catch (e) {
    console.error('Process error:', e);
    if (e.name === 'AbortError') showStatus('❌ Таймаут: сервер не ответил за 30 сек', true);
    else showStatus(`❌ ${e.message.substring(0, 100)}`, true);
  }
}

async function analyzeStl() {
  if (!window.currentFile) { showStatus('❌ Загрузите STL', true); return; }
  const fd = new FormData();
  fd.append('file', window.currentFile);
  appendStlToolFormData(fd);
  try {
    showStatus('⏳ Анализ...');
    const res = await fetch(`${API_BASE}/stl/analyze`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showJsonBlock('analyzeOut', data);
    showStatus(`✅ Оценка печатности: ${data.printability_score ?? '—'}`);
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

async function repairStl() {
  if (!window.currentFile) { showStatus('❌ Загрузите STL', true); return; }
  const fd = new FormData();
  fd.append('file', window.currentFile);
  appendStlToolFormData(fd);
  try {
    showStatus('⏳ Восстановление сетки...');
    const res = await fetch(`${API_BASE}/stl/repair`, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    currentBlob = await res.blob();
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('repaired.stl');
    showStatus('✅ Модель восстановлена');
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

async function autoOrientStl() {
  if (!window.currentFile) { showStatus('❌ Загрузите STL', true); return; }
  const fd = new FormData();
  fd.append('file', window.currentFile);
  appendStlToolFormData(fd);
  try {
    showStatus('⏳ Авто-ориентация...');
    const res = await fetch(`${API_BASE}/stl/auto-orient`, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    currentBlob = await res.blob();
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('oriented.stl');
    showStatus('✅ Ориентация обновлена');
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

async function autoFixStl(withZipReport) {
  if (!window.currentFile) { showStatus('❌ Загрузите STL', true); return; }
  const fd = new FormData();
  fd.append('file', window.currentFile);
  appendStlToolFormData(fd);
  if (withZipReport) fd.append('bundle', 'zip');
  try {
    showStatus('⏳ Автоисправление...');
    const res = await fetch(`${API_BASE}/stl/auto-fix`, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('zip')) {
      currentBlob = await res.blob();
      prepareDownload('autofix_bundle.zip');
      showStatus('✅ ZIP с моделью, отчётом и превью');
      return;
    }
    currentBlob = await res.blob();
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('autofixed.stl');
    showStatus('✅ Автоисправление выполнено');
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

async function fetchPrintAdvisor() {
  const mat = document.getElementById('advisorMaterial')?.value || 'PLA';
  try {
    showStatus('⏳ Запрос советов...');
    let res;
    if (window.currentFile) {
      const fd = new FormData();
      fd.append('file', window.currentFile);
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
    showJsonBlock('advisorOut', data);
    showStatus('✅ Советы слайсера получены');
  } catch (e) {
    showStatus(`❌ ${e.message}`, true);
  }
}

// ================= KEYCHAIN =================
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
    showStatus('⏳ Генерация...');
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
    const timeout = setTimeout(() => controller.abort(), 30000);
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
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('keychain.stl');
    showStatus('✅ Брелок готов');
  } catch (e) {
    console.error('Keychain error:', e);
    if (e.name === 'AbortError') showStatus('❌ Таймаут: сервер не ответил за 30 сек', true);
    else showStatus(`❌ ${e.message.substring(0, 100)}`, true);
  }
}

// ================= CAD =================
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
    showStatus('⏳ Сборка...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
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
    await loadSTL(currentBlob);
    showPreviewFromResponse(res);
    prepareDownload('cad_model.stl');
    showStatus('✅ CAD готов');
  } catch (e) {
    console.error('CAD error:', e);
    if (e.name === 'AbortError') showStatus('❌ Таймаут: сервер не ответил за 30 сек', true);
    else showStatus(`❌ ${e.message.substring(0, 100)}`, true);
  }
}

// ================= DOWNLOAD =================
function prepareDownload(filename) {
  const btn = document.getElementById('btnDownload');
  if (!btn) return;
  btn.classList.remove('hidden');
  btn.onclick = () => downloadSTL(filename);
}

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

// ================= STATUS =================
function showStatus(text, error = false) {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = text;
  status.className = error ? 'status show error' : 'status show';
  if (!error) setTimeout(() => { if (status.textContent === text) status.classList.remove('show'); }, 5000);
}

// ================= CLEANUP =================
function cleanupUrls() {
  _createdUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
  _createdUrls = [];
}

// ================= GLOBAL HANDLERS =================
window.addEventListener('error', (e) => console.error('🔴 Global error:', e.error));
window.addEventListener('unhandledrejection', (e) => console.error('🔴 Unhandled rejection:', e.reason));
window.addEventListener('beforeunload', () => { cleanupUrls(); if (renderer) renderer.dispose(); });
