const API_BASE = 'https://3dcalk.freedynamicdns.net:8443/api';
let viewer, scene, camera, renderer, controls, currentMesh;
let currentBlob = null;
let cadObjectCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof vkBridge !== 'undefined') {
    try { await vkBridge.send('VKWebAppInit'); } catch(e) { console.log('VK Bridge:', e); }
  }
  init3DViewer();
  setupFileDrop();
});

// ==================== 3D VIEWER ====================
function init3DViewer() {
  const container = document.getElementById('viewer');
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1a1a);
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(5, 5, 10);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(5, 5, 5); scene.add(dir);
  animate();
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight);
  });
}

function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }

function loadSTL(blob) {
  if (currentMesh) { scene.remove(currentMesh); currentMesh.geometry.dispose(); currentMesh.material.dispose(); }
  const url = URL.createObjectURL(blob);
  new THREE.STLLoader().load(url, (geometry) => {
    URL.revokeObjectURL(url); geometry.computeVertexNormals(); geometry.center();
    const material = new THREE.MeshStandardMaterial({ color: 0x4a76a8, roughness: 0.4 });
    currentMesh = new THREE.Mesh(geometry, material); scene.add(currentMesh);
    const box = new THREE.Box3().setFromObject(currentMesh);
    const size = box.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(0, 0, maxDim * 2.5); camera.lookAt(box.getCenter(new THREE.Vector3()));
    controls.target.copy(box.getCenter(new THREE.Vector3())); controls.update();
  });
}

// ==================== UI TABS ====================
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`panel-${tab}`).classList.remove('hidden');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

function toggleParams() {
  const action = document.getElementById('action').value;
  ['text','hole','eyes','cut_box'].forEach(id => {
    document.getElementById(`params-${id}`).classList.toggle('hidden', action !== id);
  });
}

// ==================== FILE DROP ====================
function setupFileDrop() {
  const drop = document.getElementById('fileDrop'), input = document.getElementById('stlFile');
  drop.onclick = () => input.click();
  drop.ondragover = e => { e.preventDefault(); drop.style.background = '#e0f0f5'; };
  drop.ondragleave = () => drop.style.background = '';
  drop.ondrop = e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.name.endsWith('.stl')) handleFile(file); };
  input.onchange = e => { if (e.target.files[0]) handleFile(e.target.files[0]); };
}

function handleFile(file) {
  document.getElementById('editorControls').classList.remove('hidden');
  loadSTL(file); showStatus(`📁 Загружен: ${file.name}`); window.currentFile = file;
}

// ==================== STL EDITOR ====================
async function processSTL() {
  if (!window.currentFile) return alert('Загрузите STL файл');
  const formData = new FormData(); 
  formData.append('file', window.currentFile);
  const action = document.getElementById('action').value;
  formData.append('action', action);
  
  if (action === 'text') {
    formData.append('text', document.getElementById('editText').value);
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
  
  await sendRequest('/stl/editor-advanced', formData, 'Модель обновлена');
}

// ==================== KEYCHAIN GENERATOR ====================
async function generateKeychain() {
  const payload = {
    text: document.getElementById('keyText').value,
    width: parseFloat(document.getElementById('keyWidth').value),
    height: parseFloat(document.getElementById('keyHeight').value),
    thickness: parseFloat(document.getElementById('keyThick').value),
    font_size: parseFloat(document.getElementById('keyFontSize').value),
    text_mode: document.getElementById('keyTextMode').value
  };
  await sendRequest('/generate/keychain-advanced', JSON.stringify(payload), 'Брелок сгенерирован', { 'Content-Type': 'application/json' });
}

// ==================== CAD EDITOR ====================
function addCadObject() {
  cadObjectCount++;
  const container = document.getElementById('cadObjects');
  const div = document.createElement('div');
  div.style.background = '#f8f9fa'; div.style.padding = '10px'; div.style.borderRadius = '8px'; div.style.marginBottom = '8px';
  div.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <select id="cad-type-${cadObjectCount}" style="flex:1;">
        <option value="box">📦 Куб</option>
        <option value="cylinder">🔵 Цилиндр</option>
      </select>
      <button onclick="this.closest('div').remove()" style="background:#dc3545; padding:8px 12px; border-radius:6px;">✕</button>
    </div>
    <div id="cad-params-${cadObjectCount}">
      <label>Ширина (мм)</label><input type="number" id="cad-w-${cadObjectCount}" value="10" min="1">
      <label>Высота (мм)</label><input type="number" id="cad-h-${cadObjectCount}" value="10" min="1">
      <label>Глубина (мм)</label><input type="number" id="cad-d-${cadObjectCount}" value="10" min="1">
    </div>
    <div class="row" style="margin-top:8px;">
      <div><label>X</label><input type="number" id="cad-x-${cadObjectCount}" value="0"></div>
      <div><label>Y</label><input type="number" id="cad-y-${cadObjectCount}" value="0"></div>
      <div><label>Z</label><input type="number" id="cad-z-${cadObjectCount}" value="0"></div>
    </div>
  `;
  div.querySelector(`#cad-type-${cadObjectCount}`).onchange = (e) => {
    const params = div.querySelector(`#cad-params-${cadObjectCount}`);
    if (e.target.value === 'cylinder') {
      params.innerHTML = `<label>Радиус (мм)</label><input type="number" id="cad-r-${cadObjectCount}" value="5" min="1"><label>Высота (мм)</label><input type="number" id="cad-h-${cadObjectCount}" value="20" min="1">`;
    } else {
      params.innerHTML = `<label>Ширина (мм)</label><input type="number" id="cad-w-${cadObjectCount}" value="10" min="1"><label>Высота (мм)</label><input type="number" id="cad-h-${cadObjectCount}" value="10" min="1"><label>Глубина (мм)</label><input type="number" id="cad-d-${cadObjectCount}" value="10" min="1">`;
    }
  };
  container.appendChild(div);
}

async function buildCadModel() {
  const objects = [];
  for (let i = 1; i <= cadObjectCount; i++) {
    const typeEl = document.getElementById(`cad-type-${i}`);
    if (!typeEl) continue;
    const type = typeEl.value;
    const obj = {
      type,
      position: {
        x: parseFloat(document.getElementById(`cad-x-${i}`).value) || 0,
        y: parseFloat(document.getElementById(`cad-y-${i}`).value) || 0,
        z: parseFloat(document.getElementById(`cad-z-${i}`).value) || 0
      },
      scale: { x: 1, y: 1, z: 1 },
      params: {}
    };
    if (type === 'box') {
      obj.params = {
        width: parseFloat(document.getElementById(`cad-w-${i}`).value) || 10,
        height: parseFloat(document.getElementById(`cad-h-${i}`).value) || 10,
        depth: parseFloat(document.getElementById(`cad-d-${i}`).value) || 10
      };
    } else if (type === 'cylinder') {
      obj.params = {
        radius: parseFloat(document.getElementById(`cad-r-${i}`).value) || 5,
        height: parseFloat(document.getElementById(`cad-h-${i}`).value) || 20
      };
    }
    objects.push(obj);
  }
  if (objects.length === 0) return alert('Добавьте хотя бы один объект');
  await sendRequest('/cad-editor/build', JSON.stringify({ objects }), 'Модель собрана', { 'Content-Type': 'application/json' });
}

// ==================== API REQUESTS ====================
async function sendRequest(endpoint, body, successMsg, headers = {}) {
  const btn = document.getElementById('btnProcess') || document.getElementById('btnGenerate');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Обработка...'; }
  showStatus('⏳ Отправка на сервер...');
  
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body, headers });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.substring(0, 200)}`);
    }
    currentBlob = await res.blob(); 
    loadSTL(currentBlob); 
    showStatus(`✅ ${successMsg}`);
    
    // 🔹 PNG Preview из заголовка
    const previewHeader = res.headers.get('X-Preview-PNG');
    const previewImg = document.getElementById('previewImg');
    if (previewHeader && previewHeader.startsWith('image/png;base64,')) {
      previewImg.src = previewHeader;
      previewImg.classList.add('show');
    } else {
      previewImg.classList.remove('show');
    }
    
    const dl = document.getElementById('btnDownload');
    dl.href = URL.createObjectURL(currentBlob); 
    dl.download = `model_${Date.now()}.stl`; 
    dl.classList.remove('hidden');
  } catch (e) { 
    showStatus(`❌ Ошибка: ${e.message}`); 
    console.error(e);
  } finally { 
    if (btn) { btn.disabled = false; btn.textContent = 'Готово'; }
  }
}

function downloadSTL() { 
  if (currentBlob) { 
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(currentBlob); 
    a.download = `model_${Date.now()}.stl`; 
    a.click(); 
  } 
}

function showStatus(msg) { 
  const el = document.getElementById('status'); 
  el.textContent = msg; 
  el.classList.add('show'); 
  setTimeout(() => el.classList.remove('show'), 5000); 
}
