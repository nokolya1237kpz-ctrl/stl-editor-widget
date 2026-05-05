const API_BASE = 'https://3dcalk.freedynamicdns.net:8443/api';
let viewer, scene, camera, renderer, controls, currentMesh;
let currentBlob = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof vkBridge !== 'undefined') { try { await vkBridge.send('VKWebAppInit'); } catch(e) {} }
    init3DViewer();
    setupFileDrop();
});

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

function switchTab(tab) {
    document.querySelectorAll('.tab-panel').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`panel-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

function toggleParams() {
    const action = document.getElementById('action').value;
    document.getElementById('params-text').classList.toggle('hidden', action !== 'add_text');
    document.getElementById('params-hole').classList.toggle('hidden', action !== 'cut_hole');
}

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

async function processSTL() {
    if (!window.currentFile) return alert('Загрузите STL файл');
    const formData = new FormData(); formData.append('file', window.currentFile);
    const action = document.getElementById('action').value;
    if (action === 'add_text') {
        formData.append('text', document.getElementById('editText').value);
        formData.append('size', document.getElementById('fontSize').value);
        formData.append('depth', document.getElementById('textDepth').value);
    } else {
        formData.append('radius', document.getElementById('holeRadius').value);
        formData.append('depth', document.getElementById('holeDepth').value);
    }
    const endpoint = action === 'add_text' ? '/stl/add-text' : '/stl/add-hole';
    await sendRequest(endpoint, formData, action === 'add_text' ? 'Текст добавлен' : 'Отверстие вырезано');
}

async function generateKeychain() {
    const payload = {
        text: document.getElementById('keyText').value,
        width: parseFloat(document.getElementById('keyWidth').value),
        height: parseFloat(document.getElementById('keyHeight').value),
        thickness: parseFloat(document.getElementById('keyThick').value),
        font_size: parseFloat(document.getElementById('keyFontSize').value),
        text_mode: document.getElementById('textMode').value,
        loop_radius: 5, hole_radius: 2
    };
    await sendRequest('/generate/keychain', JSON.stringify(payload), 'Брелок сгенерирован', { 'Content-Type': 'application/json' });
}

async function sendRequest(endpoint, body, successMsg, headers = {}) {
    const btn = document.getElementById('btnProcess') || document.getElementById('btnGenerate');
    btn.disabled = true; btn.textContent = '⏳ Обработка...'; showStatus('⏳ Отправка на сервер...');
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body, headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        currentBlob = await res.blob(); loadSTL(currentBlob); showStatus(`✅ ${successMsg}`);
        const dl = document.getElementById('btnDownload');
        dl.href = URL.createObjectURL(currentBlob); dl.download = `model_${Date.now()}.stl`; dl.classList.remove('hidden');
    } catch (e) { showStatus(`❌ Ошибка: ${e.message}`); }
    finally { btn.disabled = false; btn.textContent = action === 'add_text' ? '⚡ Применить' : '🖨️ Сгенерировать'; }
}

function downloadSTL() { if (currentBlob) { const a = document.createElement('a'); a.href = URL.createObjectURL(currentBlob); a.download = `model_${Date.now()}.stl`; a.click(); } }
function showStatus(msg) { const el = document.getElementById('status'); el.textContent = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 5000); }
