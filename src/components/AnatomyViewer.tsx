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

    const keyLight = new THREE.DirectionalLight(0xfff4e8, 2.4);
    keyLight.position.set(1, 1.2, 1);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xcfe0ff, 0.9);
    fillLight.position.set(-1, 0.3, -0.5);
    scene.add(fillLight);
    const rim = new THREE.DirectionalLight(0xEADFD4, 1.0);
    rim.position.set(0, 1, -1.2);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x404040, 0.8));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.15;
    controls.maxDistance = 1.5;
    controlsRef.current = controls;

    const loader = new GLTFLoader();
    loader.load(
      '/models/anatomy-lex.glb',
      (gltf) => {
        const model = gltf.scene;
        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const camPos = new THREE.Vector3(0, 0.02, maxDim * 1.7);
        camera.position.copy(camPos);
        controls.target.set(0, 0, 0);
        controls.update();
        defaultCameraRef.current = { position: camPos.clone(), target: new THREE.Vector3(0, 0, 0) };

        const objs: Record<string, THREE.Object3D> = {};
        const vis: Record<string, boolean> = {};
        model.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            objs[obj.name] = obj;
            vis[obj.name] = true;
            const mesh = obj as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat) {
              mat.roughness = obj.name === 'head_skin_full' ? 0.55 : 0.5;
              mat.metalness = 0.02;
            }
          }
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
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
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
      if (preset === 'skin') visible = key === 'head_skin_full' || key.startsWith('eye.');
      else if (preset === 'fat') visible = key.startsWith('FAT_') || key.startsWith('eye.');
      else if (preset === 'muscle') visible = key.startsWith('muscle_') || key.startsWith('eye.');
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
    <div className="fixed inset-0 z-50 bg-[#2A2622] flex flex-col md:flex-row">
      {/* Área 3D */}
      <div className="relative flex-1 min-h-[45vh] md:min-h-0">
        <div ref={containerRef} className="absolute inset-0" />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-[#EADFD4]">
            <div className="w-8 h-8 border-2 border-[#EADFD4]/20 border-t-[#EADFD4] rounded-full animate-spin" />
            <p className="text-[11px] uppercase tracking-widest font-medium opacity-70">Carregando modelo</p>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#EADFD4] px-8 text-center">
            <p className="text-sm">Não foi possível carregar o modelo 3D.</p>
          </div>
        )}

        <div className="absolute top-6 left-6 right-6 flex items-start justify-between pointer-events-none">
          <div>
            <h1 className="serif text-white text-xl mb-1">Anatomia Orofacial</h1>
            <p className="text-white/50 text-[11px] uppercase tracking-widest font-medium">Arraste para girar · Role para aproximar</p>
          </div>
          <button
            onClick={onClose}
            className="pointer-events-auto w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur flex items-center justify-center text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <button
          onClick={resetCamera}
          className="absolute bottom-6 left-6 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white text-[11px] font-medium uppercase tracking-widest transition-all"
        >
          <RotateCcw size={14} /> Resetar vista
        </button>

        <p className="absolute bottom-6 right-6 text-white/30 text-[10px] text-right max-w-[240px] leading-relaxed hidden md:block">
          Modelo "anAtomic Lex" — Kent Trammell / CG Cookie, licença Royalty Free
        </p>
      </div>

      {/* Painel de camadas */}
      <div className="w-full md:w-[300px] bg-[#26221E] border-t md:border-t-0 md:border-l border-white/10 flex flex-col max-h-[55vh] md:max-h-none">
        <div className="p-5 border-b border-white/10">
          <p className="text-[10px] font-bold text-[#EADFD4] uppercase tracking-[0.2em] mb-3">Atalhos</p>
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
                    ? 'bg-[#EADFD4] text-[#2A2622]'
                    : 'bg-white/5 text-[#EADFD4] border border-white/10 hover:bg-white/10'
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
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">{groupName}</p>
              <div className="space-y-1.5">
                {keys.map((key) => (
                  <button
                    key={key}
                    onClick={() => toggleLayer(key)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-all text-left"
                  >
                    <span className="text-[12px] text-white/85">{LAYER_LABELS[key] || key}</span>
                    <div className={`w-8 h-[18px] rounded-full relative shrink-0 ml-3 transition-colors ${visibility[key] ? 'bg-[#EADFD4]' : 'bg-white/15'}`}>
                      <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${visibility[key] ? 'left-[16px]' : 'left-[2px]'}`} />
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
