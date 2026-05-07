/**
 * ✂️ STL Мастер — Фронтенд для VK Mini App
 * Редактор, генератор брелков и CAD-сборка 3D-моделей
 */

const API_BASE = 'https://3dcalk.freedynamicdns.net:8443/api';
let viewer, scene, camera, renderer, controls, currentMesh;
let currentBlob = null;
let cadObjectCount = 0;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', async () => {
  // Инициализация VK Bridge
  if (typeof vkBridge !== 'undefined') {
    try { 
      await vkBridge.send('VKWebAppInit'); 
      console.log('✅ VK Bridge инициализирован');
    } catch(e) { 
      console.warn('⚠️ VK Bridge:', e); 
    }
  }
  
  // Инициализация 3D (с задержкой для корректных размеров)
  setTimeout(init3DViewer, 100);
  
  // Настройка drag&drop
  setupFileDrop();
  
  // Инициализация вкладок
  switchTab('editor');
});

// ==================== 3D VIEWER ====================
function init3DViewer() {
  const container = document.getElementById('viewer');
  if (!container) return;
  
  // Проверка WebGL
  if (!window.WebGLRenderingContext) {
    showStatus('❌ WebGL не поддерживается', true);
    return;
  }
  
  try {
    // Сцена
    scene = new THREE.Scene();
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    scene.background = new THREE.Color(isDark ? 0x1a1a1a : 0xf4f6f8);
    
    // Камера
    const width = container.clientWidth || 300;
    const height = container.clientHeight || 280;
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    camera.position.set(0, 0, 150);
    
    // Рендерер
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    
    // Управление
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 2000;
    
    // Освещение
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(50, 50, 50);
    scene.add(dir);
    
    // Сетка
    const grid = new THREE.GridHelper(200, 20, 
      isDark ? 0x555555 : 0x888888, 
      isDark ? 0x333333 : 0x444444);
    grid.position.y = -50;
    scene.add(grid);
    
    // Анимация
    animate();
    
    // Ресайз
    window.addEventListener('resize', on3DResize);
    
    console.log('✅ 3D Viewer инициализирован');
  } catch (e) {
    console.error('❌ Ошибка 3D:', e);
    showStatus('⚠️ 3D-просмотр недоступен', true);
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function on3DResize() {
  const container = document.getElementById('viewer');
  if (!container || !camera || !renderer) return;
  
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  if (width > 0 && height > 0) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
}

function loadSTL(blob) {
  return new Promise((resolve, reject) => {
    if (!scene || !camera || typeof THREE.STLLoader === 'undefined') {
      reject(new Error('3D Viewer не готов'));
      return;
    }
    
    // Очистка старой модели
    if (currentMesh) {
      scene.remove(currentMesh);
      if (currentMesh.geometry) currentMesh.geometry.dispose();
      if (currentMesh.material) currentMesh.material.dispose();
      currentMesh = null;
    }
    
    const loader = new THREE.STLLoader();
    const url = URL.createObjectURL(blob);
    
    loader.load(url, 
      // Успех
      function(geometry) {
        URL.revokeObjectURL(url);
        
        if (!geometry || geometry.attributes.position.count === 0) {
          reject(new Error('Пустая геометрия'));
          return;
        }
        
        geometry.computeVertexNormals();
        geometry.center();
        
        const material = new THREE.MeshStandardMaterial({
          color: 0x4a76a8,
          roughness: 0.4,
          metalness: 0.1
        });
        
        currentMesh = new THREE.Mesh(geometry, material);
        scene.add(currentMesh);
        
        // Подгонка камеры
        fitCameraToObject(currentMesh);
        resolve();
      },
      // Прогресс (можно добавить индикатор)
      undefined,
      // Ошибка
      function(error) {
        URL.revokeObjectURL(url);
        console.error('❌ Ошибка загрузки STL:', error);
        reject(error);
      }
    );
  });
}

function fitCameraToObject(object) {
  if (!camera || !controls) return;
  
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  
  const fov = camera.fov * (Math.PI / 180);
  const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;
  
  camera.position.set(center.x, center.y, center.z + cameraZ);
  camera.lookAt(center);
  
  controls.target.copy(center);
  controls.update();
}

// ==================== UI: ВКЛАДКИ ====================
function switchTab(tabId) {
  // Скрыть все панели
  document.querySelectorAll('.tab-panel').forEach(el => {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  });
  
  // Деактивировать все кнопки
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  
  // Показать выбранную панель
  const panel = document.getElementById(`panel-${tabId}`);
  if (panel) {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
  }
  
  // Активировать кнопку
  const btn = document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
  }
  
  // Обновить 3D при переключении
  if (renderer) {
    setTimeout(() => on3DResize(), 50);
  }
  
  showStatus(`📂 Открыта вкладка: ${tabId === 'editor' ? 'Редактор' : tabId === 'keychain' ? 'Брелок' : 'CAD'}`);
}

function toggleParams() {
  const action = document.getElementById('action').value;
  ['text', 'hole', 'eyes', 'cut_box'].forEach(id => {
    const el = document.getElementById(`params-${id}`);
    if (el) {
      el.classList.toggle('hidden', action !== id);
    }
  });
}

// ==================== FILE DROP ====================
function setupFileDrop() {
  const drop = document.getElementById('fileDrop');
  const input = document.getElementById('stlFile');
  
  if (!drop || !input) return;
  
  // Клик по области
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  };
  
  // Drag&Drop
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.style.background = '#e8f0fe';
    drop.style.borderColor = '#2c5aa0';
  };
  
  drop.ondragleave = () => {
    drop.style.background = '';
    drop.style.borderColor = '';
  };
  
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.style.background = '';
    drop.style.borderColor = '';
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.stl')) {
      handleFile(file);
    } else {
      showStatus('❌ Выберите файл с расширением .stl', true);
    }
  };
  
  // Выбор через диалог
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    input.value = ''; // сброс для повторного выбора того же файла
  };
}

function handleFile(file) {
  // Показать элементы управления
  document.getElementById('editorControls')?.classList.remove('hidden');
  
  // Загрузить в 3D
  loadSTL(file)
    .then(() => {
      showStatus(`✅ Загружен: ${file.name} (${(file.size/1024).toFixed(1)} КБ)`);
      window.currentFile = file;
    })
    .catch(err => {
      console.error('❌ Ошибка загрузки:', err);
      showStatus('❌ Не удалось загрузить модель', true);
    });
}

// ==================== STL EDITOR ====================
async function processSTL() {
  if (!window.currentFile) {
    showStatus('❌ Сначала загрузите STL файл', true);
    return;
  }
  
  const btn = document.getElementById('btnProcess');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Обработка...';
  }
  
  showStatus('⏳ Отправка на сервер...');
  
  try {
    const formData = new FormData();
    formData.append('file', window.currentFile);
    
    const action = document.getElementById('action').value;
    formData.append('action', action);
    
    // Параметры в зависимости от действия
    if (action === 'text') {
      formData.append('text', document.getElementById('editText').value.trim() || 'A');
      formData.append('size', document.getElementById('fontSize').value);
      formData.append('depth', document.getElementById('textDepth').value);
      formData.append('mode', document.getElementById('textMode').value);
    } else if (action === 'hole') {
      formData.append('radius', document.getElementById('holeRadius').value);
      formData.append('depth', document.getElementById('holeDepth').value);
    } else if (action === 'eyes') {
      formData.append('radius', document.getElementById('eyeRadius').value);
      formData.append('distance', document.getElementById('eyeDistance').value);
    } else if (action === 'cut_box') {
      formData.append('x', document.getElementById('cutX').value);
      formData.append('y', document.getElementById('cutY').value);
      formData.append('z', document.getElementById('cutZ').value);
    }
    
    const res = await fetch(`${API_BASE}/stl/editor-advanced`, {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Неизвестная ошибка');
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 150)}`);
    }
    
    // Получить результат
    currentBlob = await res.blob();
    
    // Обновить 3D-просмотр
    await loadSTL(currentBlob);
    
    // Показать превью из заголовка
    const previewHeader = res.headers.get('X-Preview-PNG');
    const previewImg = document.getElementById('previewImg');
    if (previewHeader?.startsWith('image/png;base64,')) {
      previewImg.src = previewHeader;
      previewImg.classList.add('show');
    } else {
      previewImg.classList.remove('show');
    }
    
    // Кнопка скачивания
    const dl = document.getElementById('btnDownload');
    if (dl) {
      dl.href = URL.createObjectURL(currentBlob);
      dl.download = `edited_${Date.now()}.stl`;
      dl.classList.remove('hidden');
    }
    
    showStatus('✅ Модель обновлена! Нажмите «Скачать» для сохранения.');
    
  } catch (e) {
    console.error('❌ Ошибка:', e);
    showStatus(`❌ Ошибка: ${e.message.substring(0, 100)}`, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Применить изменения';
    }
  }
}

// ==================== KEYCHAIN GENERATOR ====================
async function generateKeychain() {
  const btn = document.getElementById('btnGenerate');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Генерация...';
  }
  
  showStatus('⏳ Создание брелка...');
  
  try {
    const payload = {
      text: document.getElementById('keyText').value.trim() || 'VK',
      width: parseFloat(document.getElementById('keyWidth').value) || 50,
      height: parseFloat(document.getElementById('keyHeight').value) || 30,
      thickness: parseFloat(document.getElementById('keyThick').value) || 3,
      font_size: parseFloat(document.getElementById('keyFontSize').value) || 10,
      text_mode: document.getElementById('keyTextMode').value,
      shape: document.getElementById('keyShape').value  // 👈 новая опция
    };
    
    const res = await fetch(`${API_BASE}/generate/keychain-advanced`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Ошибка генерации');
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 150)}`);
    }
    
    currentBlob = await res.blob();
    await loadSTL(currentBlob);
    
    // Превью
    const previewHeader = res.headers.get('X-Preview-PNG');
    const previewImg = document.getElementById('previewImg');
    if (previewHeader?.startsWith('image/png;base64,')) {
      previewImg.src = previewHeader;
      previewImg.classList.add('show');
    }
    
    // Скачать
    const dl = document.getElementById('btnDownload');
    if (dl) {
      dl.href = URL.createObjectURL(currentBlob);
      dl.download = `keychain_${payload.shape}_${Date.now()}.stl`;
      dl.classList.remove('hidden');
    }
    
    showStatus('✅ Брелок готов! Нажмите «Скачать» для сохранения.');
    
  } catch (e) {
    console.error('❌ Ошибка генерации:', e);
    showStatus(`❌ Ошибка: ${e.message.substring(0, 100)}`, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🖨️ Сгенерировать и скачать';
    }
  }
}

// ==================== CAD EDITOR ====================
function addCadObject() {
  cadObjectCount++;
  const container = document.getElementById('cadObjects');
  if (!container) return;
  
  const id = cadObjectCount;
  const div = document.createElement('div');
  div.className = 'cad-object-card';
  div.innerHTML = `
    <div class="cad-object-header">
      <span class="cad-object-title">Объект #${id}</span>
      <button type="button" onclick="this.closest('.cad-object-card').remove()" 
              style="background:#dc3545; padding:6px 12px; border-radius:6px; font-size:12px; width:auto; margin:0;">
        ✕ Удалить
      </button>
    </div>
    
    <label>Тип фигуры:</label>
    <select id="cad-type-${id}" onchange="updateCadParams(${id})">
      <option value="box">📦 Куб / Прямоугольник</option>
      <option value="cylinder">🔵 Цилиндр</option>
      <option value="sphere">⚪ Сфера</option>
      <option value="cone">🔺 Конус / Пирамида</option>
    </select>
    
    <div id="cad-params-${id}">
      <label>Ширина (мм)</label>
      <input type="number" id="cad-w-${id}" value="20" min="1" max="100">
      <label>Высота (мм)</label>
      <input type="number" id="cad-h-${id}" value="10" min="1" max="100">
      <label>Глубина (мм)</label>
      <input type="number" id="cad-d-${id}" value="10" min="1" max="100">
    </div>
    
    <label>Операция:</label>
    <select id="cad-op-${id}">
      <option value="union">➕ Объединить (добавить к модели)</option>
      <option value="cut">➖ Вычесть (создать паз/отверстие)</option>
    </select>
    
    <label>Позиция (мм):</label>
    <div class="row">
      <div><small>X</small><input type="number" id="cad-x-${id}" value="0" step="1"></div>
      <div><small>Y</small><input type="number" id="cad-y-${id}" value="0" step="1"></div>
      <div><small>Z</small><input type="number" id="cad-z-${id}" value="0" step="1"></div>
    </div>
    
    <label>Поворот (градусы):</label>
    <div class="row">
      <div><small>X</small><input type="number" id="cad-rx-${id}" value="0" step="15"></div>
      <div><small>Y</small><input type="number" id="cad-ry-${id}" value="0" step="15"></div>
      <div><small>Z</small><input type="number" id="cad-rz-${id}" value="0" step="15"></div>
    </div>
  `;
  
  container.appendChild(div);
  showStatus(`➕ Добавлен объект #${id}. Настройте параметры и нажмите «Собрать».`,);
}

// Обновить параметры при смене типа фигуры
function updateCadParams(id) {
  const type = document.getElementById(`cad-type-${id}`).value;
  const paramsDiv = document.getElementById(`cad-params-${id}`);
  
  if (!paramsDiv) return;
  
  if (type === 'box') {
    paramsDiv.innerHTML = `
      <label>Ширина (мм)</label>
      <input type="number" id="cad-w-${id}" value="20" min="1" max="100">
      <label>Высота (мм)</label>
      <input type="number" id="cad-h-${id}" value="10" min="1" max="100">
      <label>Глубина (мм)</label>
      <input type="number" id="cad-d-${id}" value="10" min="1" max="100">
    `;
  } else if (type === 'cylinder') {
    paramsDiv.innerHTML = `
      <label>Радиус (мм)</label>
      <input type="number" id="cad-r-${id}" value="5" min="1" max="50">
      <label>Высота (мм)</label>
      <input type="number" id="cad-h-${id}" value="20" min="1" max="100">
    `;
  } else if (type === 'sphere') {
    paramsDiv.innerHTML = `
      <label>Радиус сферы (мм)</label>
      <input type="number" id="cad-r-${id}" value="10" min="1" max="50">
    `;
  } else if (type === 'cone') {
    paramsDiv.innerHTML = `
      <label>Радиус основания (мм)</label>
      <input type="number" id="cad-r1-${id}" value="10" min="1" max="50">
      <label>Радиус вершины (мм, 0 = пирамида)</label>
      <input type="number" id="cad-r2-${id}" value="0" min="0" max="50">
      <label>Высота (мм)</label>
      <input type="number" id="cad-h-${id}" value="20" min="1" max="100">
    `;
  }
}

async function buildCadModel() {
  const objects = [];
  
  for (let i = 1; i <= cadObjectCount; i++) {
    const typeEl = document.getElementById(`cad-type-${i}`);
    if (!typeEl) continue;
    
    const type = typeEl.value;
    const params = {};
    
    // Собрать параметры в зависимости от типа
    if (type === 'box') {
      params.width = parseFloat(document.getElementById(`cad-w-${i}`).value) || 10;
      params.height = parseFloat(document.getElementById(`cad-h-${i}`).value) || 10;
      params.depth = parseFloat(document.getElementById(`cad-d-${i}`).value) || 10;
    } else if (type === 'cylinder') {
      params.radius = parseFloat(document.getElementById(`cad-r-${i}`).value) || 5;
      params.height = parseFloat(document.getElementById(`cad-h-${i}`).value) || 20;
    } else if (type === 'sphere') {
      params.radius = parseFloat(document.getElementById(`cad-r-${i}`).value) || 10;
    } else if (type === 'cone') {
      params.radius1 = parseFloat(document.getElementById(`cad-r1-${i}`).value) || 10;
      params.radius2 = parseFloat(document.getElementById(`cad-r2-${i}`).value) || 0;
      params.height = parseFloat(document.getElementById(`cad-h-${i}`).value) || 20;
    }
    
    const obj = {
      type,
      position: {
        x: parseFloat(document.getElementById(`cad-x-${i}`).value) || 0,
        y: parseFloat(document.getElementById(`cad-y-${i}`).value) || 0,
        z: parseFloat(document.getElementById(`cad-z-${i}`).value) || 0
      },
      rotation: {
        x: parseFloat(document.getElementById(`cad-rx-${i}`).value) || 0,
        y: parseFloat(document.getElementById(`cad-ry-${i}`).value) || 0,
        z: parseFloat(document.getElementById(`cad-rz-${i}`).value) || 0
      },
      scale: { x: 1, y: 1, z: 1 },
      operation: document.getElementById(`cad-op-${i}`).value,
      params
    };
    
    objects.push(obj);
  }
  
  if (objects.length === 0) {
    showStatus('❌ Добавьте хотя бы один объект', true);
    return;
  }
  
  // Отправить запрос
  const btn = document.querySelector('#panel-cad button[onclick="buildCadModel()"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Сборка...';
  }
  
  showStatus('⏳ Отправка на сервер...');
  
  try {
    const res = await fetch(`${API_BASE}/cad-editor/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects })
    });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Ошибка сборки');
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 150)}`);
    }
    
    currentBlob = await res.blob();
    await loadSTL(currentBlob);
    
    // Превью
    const previewHeader = res.headers.get('X-Preview-PNG');
    const previewImg = document.getElementById('previewImg');
    if (previewHeader?.startsWith('image/png;base64,')) {
      previewImg.src = previewHeader;
      previewImg.classList.add('show');
    }
    
    // Скачать
    const dl = document.getElementById('btnDownload');
    if (dl) {
      dl.href = URL.createObjectURL(currentBlob);
      dl.download = `cad_model_${Date.now()}.stl`;
      dl.classList.remove('hidden');
    }
    
    showStatus('✅ Модель собрана! Нажмите «Скачать» для сохранения.');
    
  } catch (e) {
    console.error('❌ Ошибка CAD:', e);
    showStatus(`❌ Ошибка: ${e.message.substring(0, 100)}`, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🖨️ Собрать и скачать STL';
    }
  }
}

// ==================== API REQUESTS ====================
async function sendRequest(endpoint, body, successMsg, headers = {}) {
  const btn = document.getElementById('btnProcess') || document.getElementById('btnGenerate');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Обработка...';
  }
  
  showStatus('⏳ Отправка на сервер...');
  
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { 
      method: 'POST', 
      body, 
      headers 
    });
    
    if (!res.ok) {
      const err = await res.text().catch(() => 'Неизвестная ошибка');
      throw new Error(`HTTP ${res.status}: ${err.substring(0, 150)}`);
    }
    
    currentBlob = await res.blob();
    await loadSTL(currentBlob);
    
    // Превью
    const previewHeader = res.headers.get('X-Preview-PNG');
    const previewImg = document.getElementById('previewImg');
    if (previewHeader?.startsWith('image/png;base64,')) {
      previewImg.src = previewHeader;
      previewImg.classList.add('show');
    } else {
      previewImg.classList.remove('show');
    }
    
    // Скачать
    const dl = document.getElementById('btnDownload');
    if (dl) {
      dl.href = URL.createObjectURL(currentBlob);
      dl.download = `model_${Date.now()}.stl`;
      dl.classList.remove('hidden');
    }
    
    showStatus(`✅ ${successMsg}`);
    
  } catch (e) {
    console.error('❌ Ошибка запроса:', e);
    showStatus(`❌ Ошибка: ${e.message.substring(0, 100)}`, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.id === 'btnProcess' ? '⚡ Применить изменения' : '🖨️ Сгенерировать и скачать';
    }
  }
}

// ==================== УТИЛИТЫ ====================
function downloadSTL() {
  if (!currentBlob) {
    showStatus('❌ Нет модели для скачивания', true);
    return;
  }
  
  const a = document.createElement('a');
  a.href = URL.createObjectURL(currentBlob);
  a.download = `model_${Date.now()}.stl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  showStatus('💾 Файл скачивается...');
}

function showStatus(msg, isError = false) {
  const el = document.getElementById('status');
  if (!el) return;
  
  el.textContent = msg;
  el.className = `status show${isError ? ' error' : ''}`;
  
  // Автоскрытие через 6 секунд (кроме ошибок)
  if (!isError) {
    setTimeout(() => {
      if (el.textContent === msg) {
        el.classList.remove('show');
      }
    }, 6000);
  }
}

// ==================== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ====================
window.addEventListener('error', (e) => {
  console.error('🔴 Global error:', e.error);
  showStatus('⚠️ Произошла ошибка в приложении', true);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('🔴 Unhandled promise:', e.reason);
});

// Очистка при закрытии
window.addEventListener('beforeunload', () => {
  if (renderer) {
    renderer.dispose();
  }
});
