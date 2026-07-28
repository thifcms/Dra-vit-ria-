import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { X, RotateCcw } from 'lucide-react';

// Modelo: "anAtomic Lex" — Kent Trammell / CG Cookie (cgcookie.com), download gratuito,
// licença Royalty Free. Aprovado por cirurgião plástico (Vinay Rao, MD, Brown University).

const LAYER_LABELS: Record<string, string> = {
  head_skin_full: 'Pele',
  bone_cranium: 'Crânio',
  'bone_jaw-bone': 'Mandíbula',
  'bone_teeth-upper': 'Dentes superiores',
  'bone_teeth-lower': 'Dentes inferiores',
  'eye.R': 'Olho direito',
  'eye.L': 'Olho esquerdo',
  CARTILAGE_septal: 'Cartilagem septal',
  'CARTILAGE_minor-alar': 'Cartilagem alar menor',
  'CARTILAGE_major-alar': 'Cartilagem alar maior',
  'CARTILAGE_lateral-septal': 'Cartilagem lateral septal',
  'muscle_zygomaticus-minor': 'Zigomático menor',
  'muscle_zygomaticus-major': 'Zigomático maior',
  muscle_temporalis: 'Temporal',
  muscle_risorius: 'Risório',
  muscle_procerus: 'Prócero',
  'muscle_obicularis-oris': 'Orbicular da boca',
  'muscle_obicularis-oculi': 'Orbicular do olho',
  muscle_nasalis: 'Nasal',
  muscle_mentalis: 'Mentual',
  muscle_masseter: 'Masseter',
  'muscle_levator-labii-superioris-alaeque-nasi': 'Levantador do lábio (asa do nariz)',
  'muscle_levator-labii-superioris': 'Levantador do lábio superior',
  muscle_frontalis: 'Frontal',
  'muscle_depressor-labi-inferioris': 'Depressor do lábio inferior',
  'muscle_depressor-anguli-oris': 'Depressor do ângulo da boca',
  'muscle_corrugator-supercilli': 'Corrugador do supercílio',
  muscle_buccinator: 'Bucinador',
  muscle_sternocleidomastoid: 'Esternocleidomastóideo',
  muscle_trapezius: 'Trapézio',
  muscle_digastric: 'Digástrico',
  muscle_mylohyoid: 'Milo-hióideo',
  gland_parotid: 'Glândula parótida',
  'FAT_superior-orbital': 'Gordura orbital superior',
  'FAT_superior-jowl': 'Gordura jowl superior',
  FAT_submental: 'Gordura submental',
  'FAT_submandibular-jowl': 'Gordura jowl submandibular',
  FAT_nasolabial: 'Gordura nasolabial',
  'FAT_middle-forehead': 'Gordura frontal média',
  'FAT_middle-cheek': 'Gordura malar média',
  FAT_mental: 'Gordura mentual',
  'FAT_medial-cheek': 'Gordura malar medial',
  'FAT_lateral-temporal': 'Gordura temporal lateral',
  'FAT_lateral-orbital': 'Gordura orbital lateral',
  'FAT_inferior-orbital': 'Gordura orbital inferior',
  'FAT_inferior-mental': 'Gordura mentual inferior',
  'FAT_inferior-jowl': 'Gordura jowl inferior',
  'FAT_central-forehead': 'Gordura frontal central',
};

const GROUP_ORDER: { prefix: string; label: string }[] = [
  { prefix: 'head_skin', label: 'Pele' },
  { prefix: 'eye.', label: 'Olhos' },
  { prefix: 'FAT_', label: 'Gordura' },
  { prefix: 'muscle_', label: 'Músculos' },
  { prefix: 'gland_', label: 'Glândulas' },
  { prefix: 'CARTILAGE_', label: 'Cartilagem' },
  { prefix: 'bone_', label: 'Ossos e dentes' },
];

function groupFor(key: string): string {
  const g = GROUP_ORDER.find(g => key.startsWith(g.prefix));
  return g ? g.label : 'Outros';
}

// Olho construído inteiramente por código (formas geométricas + textura desenhada num
// canvas) — sem depender de nenhum arquivo/imagem externa, evita qualquer questão de
// direitos autorais e qualquer problema de exportação de material procedural.
function createProceduralEye(radius: number): THREE.Group {
  const group = new THREE.Group();

  // Esclera (parte branca) — tom levemente creme, não branco puro, e fosco (evita o
  // efeito "olhar vítreo assustador" que já tínhamos identificado antes)
  const scleraGeo = new THREE.SphereGeometry(radius, 32, 32);
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf0e9df, roughness: 0.85, metalness: 0 });
  group.add(new THREE.Mesh(scleraGeo, scleraMat));

  // Textura da íris desenhada por código (gradiente radial + linhas simulando o estroma)
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, '#2a1c12');
  grad.addColorStop(0.45, '#4a3220');
  grad.addColorStop(0.8, '#5c4530');
  grad.addColorStop(1, '#2e2318');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 180; i += 3) {
    ctx.beginPath();
    ctx.moveTo(128, 128);
    const angle = (i * Math.PI) / 90;
    ctx.lineTo(128 + Math.cos(angle) * 128, 128 + Math.sin(angle) * 128);
    ctx.stroke();
  }
  const irisTexture = new THREE.CanvasTexture(canvas);

  const irisRadius = radius * 0.42;
  const irisGeo = new THREE.CircleGeometry(irisRadius, 32);
  const irisMat = new THREE.MeshStandardMaterial({ map: irisTexture, roughness: 0.55 });
  const iris = new THREE.Mesh(irisGeo, irisMat);
  iris.position.z = radius * 0.97;
  group.add(iris);

  // Pupila
  const pupilGeo = new THREE.CircleGeometry(irisRadius * 0.4, 24);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0a0805 });
  const pupil = new THREE.Mesh(pupilGeo, pupilMat);
  pupil.position.z = radius * 0.975;
  group.add(pupil);

  // Córnea — camada transparente com um pouco de brilho, sem usar "transmission" (mais
  // pesado de processar, arriscado em celular) — um simples material transparente já dá
  // o efeito de umidade sem custo de performance
  const corneaGeo = new THREE.SphereGeometry(radius * 0.55, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const corneaMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.15,
    roughness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const cornea = new THREE.Mesh(corneaGeo, corneaMat);
  cornea.rotation.x = -Math.PI / 2;
  cornea.position.z = radius * 0.55;
  group.add(cornea);

  return group;
}

export default function AnatomyViewer({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerObjectsRef = useRef<Record<string, THREE.Object3D>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [layerKeys, setLayerKeys] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [activePreset, setActivePreset] = useState('all');
  const controlsRef = useRef<OrbitControls | null>(null);
  const defaultCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.01, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    const keyLight = new THREE.DirectionalLight(0xfff4e8, 2.0);
    keyLight.position.set(1, 1.2, 1);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xf5ece0, 0.7); // tom quente neutro, em vez de azulado — harmoniza melhor com pele/músculo/osso
    fillLight.position.set(-1, 0.3, -0.5);
    scene.add(fillLight);
    const rim = new THREE.DirectionalLight(0xEADFD4, 0.8);
    rim.position.set(0, 1, -1.2);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x504840, 1.0)); // luz ambiente mais forte e quente, suaviza sombras muito duras

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.15;
    controls.maxDistance = 4.5;
    controlsRef.current = controls;

    const loader = new GLTFLoader();
    loader.load(
      '/models/head-anatomy.glb',
      (gltf) => {
        const model = gltf.scene;
        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);

        // Distância calculada considerando altura E largura da tela (não só uma
        // aproximação por diagonal) — pega a maior distância necessária entre as duas
        // direções, garantindo que o modelo caiba sem cortar em qualquer proporção de tela.
        const fovVertical = (camera.fov * Math.PI) / 180;
        const fovHorizontal = 2 * Math.atan(Math.tan(fovVertical / 2) * camera.aspect);
        const distanceForHeight = (size.y / 2) / Math.tan(fovVertical / 2);
        const distanceForWidth = (size.x / 2) / Math.tan(fovHorizontal / 2);
        let distance = Math.max(distanceForHeight, distanceForWidth);
        distance *= 2.1; // margem ao redor do modelo (reduzido ~30% a pedido, em cima do ajuste anterior)
        const camPos = new THREE.Vector3(0, 0.02, distance);
        camera.position.copy(camPos);
        controls.target.set(0, 0, 0);
        controls.update();
        defaultCameraRef.current = { position: camPos.clone(), target: new THREE.Vector3(0, 0, 0) };

        const objs: Record<string, THREE.Object3D> = {};
        const vis: Record<string, boolean> = {};
        const oldEyeMeshes: THREE.Object3D[] = [];
        model.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const isEye = obj.name.startsWith('eye.');
            if (isEye) {
              // Os olhos do modelo original saem — substituídos por olhos construídos por
              // código logo abaixo (formas geométricas + textura desenhada, sem depender
              // de nenhum arquivo/textura externa)
              oldEyeMeshes.push(obj);
              return;
            }
            objs[obj.name] = obj;
            vis[obj.name] = true;
            const mesh = obj as THREE.Mesh;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((m) => {
              const mat = m as THREE.MeshStandardMaterial;
              if (!mat) return;
              mat.roughness = obj.name === 'head_skin_full' ? 0.55 : 0.5;
              mat.metalness = 0.02;
            });
          }
        });

        // Captura a posição/tamanho reais dos olhos originais (já com a recentralização
        // do modelo aplicada) antes de escondê-los, pra encaixar os novos exatamente no
        // mesmo lugar
        const eyeSlots = oldEyeMeshes.map((obj) => {
          const box = new THREE.Box3().setFromObject(obj);
          const c = box.getCenter(new THREE.Vector3());
          const s = box.getSize(new THREE.Vector3());
          obj.visible = false;
          return { center: c, radius: Math.max(s.x, s.y, s.z) / 2, name: obj.name };
        });

        eyeSlots.forEach(({ center, radius, name }) => {
          const eyeGroup = createProceduralEye(radius);
          eyeGroup.position.copy(center);
          scene.add(eyeGroup);
          objs[name] = eyeGroup;
          vis[name] = true;
        });

        layerObjectsRef.current = objs;
        setLayerKeys(Object.keys(objs).sort((a, b) => {
          const ga = GROUP_ORDER.findIndex(g => a.startsWith(g.prefix));
          const gb = GROUP_ORDER.findIndex(g => b.startsWith(g.prefix));
          return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
        }));
        setVisibility(vis);
        setLoading(false);
      },
      undefined,
      () => {
        setLoading(false);
        setLoadError(true);
      }
    );

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    // ResizeObserver detecta qualquer mudança de tamanho do próprio container (inclusive
    // as causadas por layout/flexbox, não só quando a janela do navegador muda) — sem
    // isso, no celular a área 3D podia ficar com o tamanho errado, "vazando" por cima dos
    // botões de camada abaixo dela.
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.dispose();
      controls.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const toggleLayer = (key: string, force?: boolean) => {
    const obj = layerObjectsRef.current[key];
    if (!obj) return;
    const next = force !== undefined ? force : !obj.visible;
    obj.visible = next;
    setVisibility(prev => ({ ...prev, [key]: next }));
  };

  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    Object.keys(layerObjectsRef.current).forEach((key) => {
      let visible = true;
      // Os olhos só ficam visíveis junto com a pele — sem a pele/pálpebra ao redor, o globo
      // ocular sozinho (só músculo/osso) fica com aparência de "filme de terror"
      if (preset === 'skin') visible = key === 'head_skin_full' || key.startsWith('eye.');
      else if (preset === 'fat') visible = key.startsWith('FAT_');
      else if (preset === 'muscle') visible = key.startsWith('muscle_');
      else if (preset === 'bone') visible = key.startsWith('bone_') || key.startsWith('CARTILAGE_');
      toggleLayer(key, visible);
    });
  };

  const resetCamera = () => {
    if (!controlsRef.current || !defaultCameraRef.current || !cameraRef.current) return;
    cameraRef.current.position.copy(defaultCameraRef.current.position);
    controlsRef.current.target.copy(defaultCameraRef.current.target);
    controlsRef.current.update();
  };

  const grouped: Record<string, string[]> = {};
  layerKeys.forEach((key) => {
    const g = groupFor(key);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(key);
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#FDFBF9] flex flex-col md:flex-row">
      {/* Área 3D */}
      <div className="relative h-[42vh] md:h-auto md:flex-1 bg-[#F5F2F0] shrink-0 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0 touch-none" />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-[#9CA3AF]">
            <div className="w-8 h-8 border-2 border-[#EADFD4]/40 border-t-[#EADFD4] rounded-full animate-spin" />
            <p className="text-[11px] uppercase tracking-widest font-medium opacity-70">Carregando modelo</p>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#9CA3AF] px-8 text-center">
            <p className="text-sm">Não foi possível carregar o modelo 3D.</p>
          </div>
        )}

        <div className="absolute top-6 left-6 right-6 flex items-start justify-between pointer-events-none">
          <div>
            <h1 className="serif text-[#5C544E] text-xl mb-1">Anatomia Orofacial</h1>
            <p className="text-[#9CA3AF] text-[11px] uppercase tracking-widest font-medium">Arraste para girar · Role para aproximar</p>
          </div>
          <button
            onClick={onClose}
            className="pointer-events-auto w-11 h-11 rounded-full bg-white hover:bg-[#F5F2F0] shadow-sm border border-[#F5F2F0] flex items-center justify-center text-[#5C544E] transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <button
          onClick={resetCamera}
          className="absolute bottom-6 left-6 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white hover:bg-[#FDFBF9] shadow-sm border border-[#F5F2F0] text-[#5C544E] text-[11px] font-medium uppercase tracking-widest transition-all"
        >
          <RotateCcw size={14} /> Resetar vista
        </button>

        <p className="absolute bottom-6 right-6 text-[#9CA3AF] text-[10px] text-right max-w-[240px] leading-relaxed hidden md:block">
          Modelo "anAtomic Lex" — Kent Trammell / CG Cookie, licença Royalty Free
        </p>
      </div>

      {/* Painel de camadas */}
      <div className="w-full md:w-[300px] bg-white border-t md:border-t-0 md:border-l border-[#F5F2F0] flex flex-col flex-1 min-h-0 md:flex-none">
        <div className="p-5 border-b border-[#F5F2F0]">
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-3">Atalhos</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'all', label: 'Tudo' },
              { key: 'skin', label: 'Pele' },
              { key: 'fat', label: 'Gordura' },
              { key: 'muscle', label: 'Músculos' },
              { key: 'bone', label: 'Ossos' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                  activePreset === p.key
                    ? 'bg-[#EADFD4] text-white'
                    : 'bg-[#FDFBF9] text-[#5C544E] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {Object.entries(grouped).map(([groupName, keys]) => (
            <div key={groupName}>
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-2">{groupName}</p>
              <div className="space-y-1.5">
                {keys.map((key) => (
                  <button
                    key={key}
                    onClick={() => toggleLayer(key)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#FDFBF9] transition-all text-left"
                  >
                    <span className="text-[12px] text-[#5C544E]">{LAYER_LABELS[key] || key}</span>
                    <div className={`w-8 h-[18px] rounded-full relative shrink-0 ml-3 transition-colors ${visibility[key] ? 'bg-[#EADFD4]' : 'bg-[#F1F3F5]'}`}>
                      <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all ${visibility[key] ? 'left-[16px]' : 'left-[2px]'}`} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
