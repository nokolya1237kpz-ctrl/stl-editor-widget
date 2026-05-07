const API_BASE = 'https://3dcalk.freedynamicdns.net:8443/api';

let scene;
let camera;
let renderer;
let controls;
let currentMesh;
let currentBlob = null;
let cadObjectCount = 0;

// ================= INIT =================
document.addEventListener('DOMContentLoaded', async () => {

  if (typeof vkBridge !== 'undefined') {
    try {
      await vkBridge.send('VKWebAppInit');
      console.log('✅ VK Bridge OK');
    } catch (e) {
      console.warn(e);
    }
  }

  init3DViewer();

  setupFileDrop();

  switchTab('editor');

});

// ================= 3D =================
function init3DViewer() {

  const container = document.getElementById('viewer');

  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    10000
  );

  camera.position.set(0, 0, 150);

  renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setSize(
    container.clientWidth,
    container.clientHeight
  );

  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(
    camera,
    renderer.domElement
  );

  controls.enableDamping = true;

  // LIGHT
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));

  const light = new THREE.DirectionalLight(0xffffff, 1);

  light.position.set(50, 50, 50);

  scene.add(light);

  // GRID
  const grid = new THREE.GridHelper(200, 20);

  grid.position.y = -50;

  scene.add(grid);

  animate();

  window.addEventListener('resize', onResize);

}

function animate() {

  requestAnimationFrame(animate);

  controls.update();

  renderer.render(scene, camera);

}

function onResize() {

  const container = document.getElementById('viewer');

  if (!container) return;

  camera.aspect =
    container.clientWidth / container.clientHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    container.clientWidth,
    container.clientHeight
  );

}

function loadSTL(blob) {

  return new Promise((resolve, reject) => {

    if (currentMesh) {

      scene.remove(currentMesh);

      currentMesh.geometry.dispose();
      currentMesh.material.dispose();

      currentMesh = null;

    }

    const loader = new THREE.STLLoader();

    const url = URL.createObjectURL(blob);

    loader.load(

      url,

      (geometry) => {

        URL.revokeObjectURL(url);

        geometry.computeVertexNormals();
        geometry.center();

        const material = new THREE.MeshStandardMaterial({
          color: 0x4a76a8
        });

        currentMesh = new THREE.Mesh(
          geometry,
          material
        );

        scene.add(currentMesh);

        fitCamera(currentMesh);

        resolve();

      },

      undefined,

      (err) => {

        URL.revokeObjectURL(url);

        reject(err);

      }

    );

  });

}

function fitCamera(object) {

  const box = new THREE.Box3().setFromObject(object);

  const center = box.getCenter(new THREE.Vector3());

  const size = box.getSize(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = camera.fov * (Math.PI / 180);

  let cameraZ =
    Math.abs(maxDim / 2 / Math.tan(fov / 2));

  cameraZ *= 2;

  camera.position.set(
    center.x,
    center.y,
    center.z + cameraZ
  );

  controls.target.copy(center);

  controls.update();

}

// ================= TABS =================
function switchTab(tab) {

  document.querySelectorAll('.tab-panel')
    .forEach(el => el.classList.add('hidden'));

  document.querySelectorAll('.tab-btn')
    .forEach(el => el.classList.remove('active'));

  document
    .getElementById(`panel-${tab}`)
    .classList.remove('hidden');

  event.target.classList.add('active');

  setTimeout(onResize, 100);

}

function toggleParams() {

  const action =
    document.getElementById('action').value;

  ['text', 'hole', 'eyes', 'cut_box']
    .forEach(id => {

      const el =
        document.getElementById(`params-${id}`);

      if (!el) return;

      el.classList.toggle(
        'hidden',
        action !== id
      );

    });

}

// ================= FILE =================
function setupFileDrop() {

  const drop = document.getElementById('fileDrop');

  const input = document.getElementById('stlFile');

  drop.onclick = () => input.click();

  drop.ondragover = (e) => {
    e.preventDefault();
  };

  drop.ondrop = (e) => {

    e.preventDefault();

    const file = e.dataTransfer.files[0];

    if (file) {
      handleFile(file);
    }

  };

  input.onchange = (e) => {

    const file = e.target.files[0];

    if (file) {
      handleFile(file);
    }

  };

}

function handleFile(file) {

  window.currentFile = file;

  document
    .getElementById('editorControls')
    .classList.remove('hidden');

  loadSTL(file)
    .then(() => {
      showStatus(`✅ ${file.name}`);
    })
    .catch(() => {
      showStatus('❌ Ошибка STL', true);
    });

}

// ================= STL EDIT =================
async function processSTL() {

  if (!window.currentFile) {
    showStatus('❌ Загрузите STL', true);
    return;
  }

  const formData = new FormData();

  formData.append('file', window.currentFile);

  const action =
    document.getElementById('action').value;

  formData.append('action', action);

  if (action === 'text') {

    formData.append(
      'text',
      document.getElementById('editText').value
    );

    formData.append(
      'size',
      document.getElementById('fontSize').value
    );

    formData.append(
      'depth',
      document.getElementById('textDepth').value
    );

    formData.append(
      'mode',
      document.getElementById('textMode').value
    );

  }

  if (action === 'hole') {

    formData.append(
      'radius',
      document.getElementById('holeRadius').value
    );

    formData.append(
      'depth',
      document.getElementById('holeDepth').value
    );

  }

  try {

    showStatus('⏳ Обработка...');

    const res = await fetch(
      `${API_BASE}/stl/editor-advanced`,
      {
        method: 'POST',
        body: formData
      }
    );

    if (!res.ok) {
      throw new Error(await res.text());
    }

    currentBlob = await res.blob();

    await loadSTL(currentBlob);

    prepareDownload('edited_model.stl');

    showStatus('✅ Готово');

  } catch (e) {

    console.error(e);

    showStatus('❌ Ошибка', true);

  }

}

// ================= KEYCHAIN =================
async function generateKeychain() {

  try {

    showStatus('⏳ Генерация...');

    const payload = {

      text:
        document.getElementById('keyText').value,

      width:
        parseFloat(document.getElementById('keyWidth').value),

      height:
        parseFloat(document.getElementById('keyHeight').value),

      thickness:
        parseFloat(document.getElementById('keyThick').value),

      font_size:
        parseFloat(document.getElementById('keyFontSize').value),

      text_mode:
        document.getElementById('keyTextMode').value,

      shape:
        document.getElementById('keyShape').value

    };

    const res = await fetch(
      `${API_BASE}/generate/keychain-advanced`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) {
      throw new Error(await res.text());
    }

    currentBlob = await res.blob();

    await loadSTL(currentBlob);

    prepareDownload('keychain.stl');

    showStatus('✅ Брелок готов');

  } catch (e) {

    console.error(e);

    showStatus('❌ Ошибка', true);

  }

}

// ================= CAD =================
function addCadObject() {

  cadObjectCount++;

  const id = cadObjectCount;

  const container =
    document.getElementById('cadObjects');

  const div = document.createElement('div');

  div.className = 'cad-object-card';

  div.innerHTML = `
    <h3>Объект #${id}</h3>

    <select id="cad-type-${id}">
      <option value="box">Куб</option>
      <option value="cylinder">Цилиндр</option>
      <option value="sphere">Сфера</option>
      <option value="cone">Конус</option>
    </select>

    <input type="number" id="cad-x-${id}" placeholder="X" value="0">
    <input type="number" id="cad-y-${id}" placeholder="Y" value="0">
    <input type="number" id="cad-z-${id}" placeholder="Z" value="0">

    <button onclick="this.parentElement.remove()">
      ✕ Удалить
    </button>
  `;

  container.appendChild(div);

}

async function buildCadModel() {

  const objects = [];

  for (let i = 1; i <= cadObjectCount; i++) {

    const typeEl =
      document.getElementById(`cad-type-${i}`);

    if (!typeEl) continue;

    objects.push({

      type: typeEl.value,

      position: {
        x: parseFloat(document.getElementById(`cad-x-${i}`).value),
        y: parseFloat(document.getElementById(`cad-y-${i}`).value),
        z: parseFloat(document.getElementById(`cad-z-${i}`).value)
      },

      rotation: {
        x: 0,
        y: 0,
        z: 0
      },

      scale: {
        x: 1,
        y: 1,
        z: 1
      },

      operation: 'union',

      params: {
        width: 20,
        height: 20,
        depth: 20
      }

    });

  }

  try {

    showStatus('⏳ Сборка...');

    const res = await fetch(
      `${API_BASE}/cad-editor/build`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ objects })
      }
    );

    if (!res.ok) {
      throw new Error(await res.text());
    }

    currentBlob = await res.blob();

    await loadSTL(currentBlob);

    prepareDownload('cad_model.stl');

    showStatus('✅ CAD готов');

  } catch (e) {

    console.error(e);

    showStatus('❌ CAD ошибка', true);

  }

}

// ================= DOWNLOAD =================
function prepareDownload(filename) {

  const btn =
    document.getElementById('btnDownload');

  btn.classList.remove('hidden');

  btn.onclick = () => {

    const a = document.createElement('a');

    a.href = URL.createObjectURL(currentBlob);

    a.download = filename;

    a.click();

  };

}

function downloadSTL() {

  if (!currentBlob) {
    showStatus('❌ Нет STL', true);
    return;
  }

  const a = document.createElement('a');

  a.href = URL.createObjectURL(currentBlob);

  a.download = 'model.stl';

  a.click();

}

// ================= STATUS =================
function showStatus(text, error = false) {

  const status =
    document.getElementById('status');

  status.textContent = text;

  status.className =
    error
      ? 'status show error'
      : 'status show';

}

// ================= ERRORS =================
window.addEventListener('error', (e) => {

  console.error(e);

});

window.addEventListener('unhandledrejection', (e) => {

  console.error(e.reason);

});
