
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE            from 'three';
import { OrbitControls }     from 'three/examples/jsm/controls/OrbitControls';
import { useNavigate }       from 'react-router-dom';
import { GLTFLoader }        from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader }       from 'three/examples/jsm/loaders/DRACOLoader';

import { mountFixedMapBuildings }                      from '@/components/game/fixedMapBuildings';
import { mountPlayerMapSpace, isPlayerSpaceAvailable } from '@/components/game/playerMapSpace';
import { mountRealtimeMapPlayersLayer }                from '@/components/game/realtimeMapPlayersLayer';
import { teleportPlayerMapSpace }                      from '@/components/game/playerTeleport';

import { usePlayerStore }        from '@/store/playerStore';
import { useChatStore }          from '@/store/chatStore';
import { useGangStore }          from '@/store/gangStore';
import { getSocket }             from '@/socket';
import { invitePlayerToFaction } from '@/services/factionInviteService';

import OtherPlayerBarracoModal, {
  type OtherPlayerBarracoTarget,
  createOtherPlayerBarracoModalState,
  openOtherPlayerBarracoModal,
  closeOtherPlayerBarracoModal,
} from '@/components/game/OtherPlayerBarracoModal';
import DirectMessageModal, { type DirectMessageTarget } from '@/components/game/DirectMessageModal';
import GangTrainingModal from '@/components/gang/GangTrainingModal';
import MapTargetActionModal      from '@/components/game/MapTargetActionModal';
import AttackResultOverlay        from '@/components/game/AttackResultOverlay';
import ConvoyAttackAnimation      from '@/components/game/ConvoyAttackAnimation';
import AttackIncomingToast        from '@/components/game/AttackIncomingToast';
import { useMapAttack }           from '@/hooks/useMapAttack';
import { useMapAttackStore }      from '@/store/mapAttackStore';
import { useActiveMapBattles }    from '@/hooks/useActiveMapBattles';
import { useRemoteSquadAnimations } from '@/hooks/useRemoteSquadAnimations';
import { Image } from '@/components/ui/image';
import AzideiaAttackModal from '@/components/game/AzideiaAttackModal';
import { mountAzideiaX9Layer, type MountedAzideiaX9Layer } from '@/components/game/azideiaX9Layer';
import {
  attackAzideiaX9,
  confirmAzideiaMissionArrival,
  confirmAzideiaMissionReturn,
  getActiveAzideiaMissions,
} from '@/api/azideiaApi';
import type { AzideiaMission, AzideiaX9Target } from '@/types/azideia';
import { mountAttackConvoy3D } from '@/components/game/convoy/convoy3DAnimator';
import { getConvoySkin } from '@/data/convoyCatalog';

const GRID_WIDTH      = 120;
const GRID_HEIGHT     = 120;
const TILE_SIZE       = 1;
const PLATFORM_HEIGHT = 1.2;

const FLOOR_TEXTURE =
  'https://static.wixstatic.com/media/50f4bf_df004e568945465ba2231dc36addfe09~mv2.jpeg';

const COMMANDS_ICON = 'https://static.wixstatic.com/media/50f4bf_9bda4af1a12b47679336479a80b16eb8~mv2.png';
const ICON_COMPLEXO = 'https://static.wixstatic.com/media/50f4bf_af442ef88fac45288bc762a40c07c343~mv2.png';
const ICON_FACCAO   = 'https://static.wixstatic.com/media/50f4bf_f00228a9eaa84c13ab83c4f3a6365649~mv2.png';
const ICON_MAIL     = 'https://static.wixstatic.com/media/50f4bf_e602f889654541a9aa2dfd057dad00bc~mv2.png';
const ICON_SHOP     = 'https://static.wixstatic.com/media/50f4bf_aee79b79a6ac4c89bbc8bbadfffdb2c6~mv2.png';

function fmt(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000)     return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)         return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('pt-BR');
}

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function parseIsoMs(value?: string | null) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function progressBetween(startMs: number, endMs: number, nowMs = Date.now()) {
  if (!startMs || !endMs || endMs <= startMs) return 0;
  return Math.max(0, Math.min(0.995, (nowMs - startMs) / (endMs - startMs)));
}

async function waitUntilIso(value?: string | null, extraMs = 220) {
  const targetMs = parseIsoMs(value);
  if (!targetMs) return;
  await sleep(targetMs + extraMs - Date.now());
}

function getRouteStartMsForMission(mission: AzideiaMission) {
  const launchedAtMs = parseIsoMs(mission.launchedAtIso);
  const arriveAtMs = parseIsoMs(mission.arriveAtIso);
  return launchedAtMs || Math.max(0, arriveAtMs - Math.max(0, Number(mission.travelDurationMs || 0)));
}

function getReturnStartMsForMission(mission: AzideiaMission) {
  const returnAtMs = parseIsoMs(mission.returnAtIso);
  return Math.max(0, returnAtMs - Math.max(0, Number(mission.returnDurationMs || 0)));
}

export default function GamePage() {
  const mountRef    = useRef<HTMLDivElement | null>(null);
  const navigate    = useNavigate();
  const player      = usePlayerStore((s) => s.player);
  const isPlayerLoaded = usePlayerStore((s) => s.isLoaded);
  const myFactionId = usePlayerStore((s) => s.player.factionId) ?? null;

  const mailMessages    = useChatStore((s) => s.mailMessages);
  const unreadMailCount = mailMessages.filter(
    (m) => String(m.recipientId) === String((player as any)?._id) && !m.read
  ).length;

  const dirtyMoney = player?.balances?.dirtyMoney ?? 0;
  const cleanMoney = player?.balances?.cleanMoney ?? 0;
  const avatarUrl  = (player as any)?.headerCustomization?.customAvatar || (player as any)?.avatar || '';
  const playerName = (player as any)?.headerCustomization?.customName   || player?.name || '—';
  const playerLevel = player?.niveis?.barracoLevel ?? 0;

  const playerMapSpaceRef = useRef<any>(null);
  const azideiaLayerRef = useRef<MountedAzideiaX9Layer | null>(null);
  const activeAzideiaVisualsRef = useRef<Set<string>>(new Set());
  const [azideiaTarget, setAzideiaTarget] = useState<AzideiaX9Target | null>(null);

  // ── Refs do three.js (compartilhados com o sistema de ataque) ──────────
  // Preenchidos dentro do useEffect THREE.js. Necessários para animação 3D
  // do squad marchando até o alvo durante o ataque.
  const sceneRef  = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const [threeReady, setThreeReady] = useState(false);

  // ── Modal: barraco de outro jogador
  const [modalState,       setModalState]       = useState(createOtherPlayerBarracoModalState());
  const [isInviting,       setIsInviting]       = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [dmModalOpen,      setDmModalOpen]      = useState(false);
  const [dmTarget,         setDmTarget]         = useState<DirectMessageTarget | null>(null);

  // ── Sistema de ataque PvP (orquestrado pelo useMapAttack) ─────────────
  const mapAttack             = useMapAttack();
  const mapAttackPreviewOpen  = useMapAttackStore((s) => s.previewOpen);

  // ── Modal: treinamento de gangue (CT)
  const gang = useGangStore((s) => s.gang);
  const trainingSlots = useGangStore((s) => s.trainingSlots);
  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
  const [selectedCT, setSelectedCT] = useState<string | null>(null);
  const [isSubmittingTraining, setIsSubmittingTraining] = useState(false);

  // ── Automatic training completion check
  useEffect(() => {
    const interval = setInterval(() => {
      useGangStore.getState().completeFinishedTrainings();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // ── Load persisted training state and gang data on mount
  useEffect(() => {
    useGangStore.getState().loadTrainingState();
    useGangStore.getState().loadGang();
  }, []);



  // ── Handler: mensagem privada
  const handleSendPrivateMessage = useCallback(
    (target: OtherPlayerBarracoTarget) => {
      setModalState(closeOtherPlayerBarracoModal());
      setDmTarget({ id: target.id, name: target.name, avatarUrl: target.avatarUrl });
      setDmModalOpen(true);
    },
    []
  );

  // ── Handler: convidar para facção
  const handleInviteToFaction = useCallback(
    async (target: OtherPlayerBarracoTarget) => {
      if (!target?.id) return;
      setIsInviting(true);
      try {
        await invitePlayerToFaction(target.id);
        console.log('✅ Convite enviado para:', target.name);
        setModalState(closeOtherPlayerBarracoModal());
      } catch (error) {
        console.error('❌ Erro ao convidar:', error);
      } finally {
        setIsInviting(false);
      }
    },
    []
  );

  // ── Handler: atacar (orquestrado por useMapAttack) ─────────────────────
  // Fluxo:
  //  1. Clique no botão "Atacar" em OtherPlayerBarracoModal → handleAttack
  //  2. Fecha OtherPlayerBarracoModal, chama mapAttack.initiateAttack(target)
  //  3. MapTargetActionModal abre, valida via /can-attack, mostra seleção de tropas
  //  4. Jogador clica "INVADIR" → handleConfirmAttack chama mapAttack.confirmAttack
  //  5. useMapAttack: anima squad pelo mapa → resolve no backend → mostra AttackResultOverlay
  //
  // Os tiles do alvo vêm de realtimePlayersLayer (armazenados num cache via state).
  const [lastClickedTargetTile, setLastClickedTargetTile] = useState<{ x: number; y: number } | null>(null);
  const lastClickedTargetTileRef = useRef<{ x: number; y: number } | null>(null);

  const rememberTargetTile = useCallback((tile: { x: number; y: number }) => {
    lastClickedTargetTileRef.current = tile;
    setLastClickedTargetTile(tile);
  }, []);

  const handleAttack = useCallback(
    (target: OtherPlayerBarracoTarget) => {
      if (!target?.id) return;

      // tileX/Y do alvo: vem do click no mapa 3D (armazenado em lastClickedTargetTile)
      const cachedTargetTile = lastClickedTargetTileRef.current ?? lastClickedTargetTile;
      const targetTileX = cachedTargetTile?.x ?? 0;
      const targetTileY = cachedTargetTile?.y ?? 0;

      console.log('[GamePage] handleAttack target tile', {
        targetId: target.id,
        targetName: target.name,
        cachedTargetTile,
      });

      // Fecha o modal de info do barraco
      setModalState(closeOtherPlayerBarracoModal());

      // Abre o MapTargetActionModal via useMapAttack
      mapAttack.initiateAttack({
        playerId:     String(target.id),
        playerName:   String(target.name || 'Alvo'),
        tileX:        targetTileX,
        tileY:        targetTileY,
        barracoLevel: target.barracoLevel,
        factionId:    target.factionId ?? null,
      });
    },
    [mapAttack, lastClickedTargetTile]
  );

  // Handler: jogador confirmou ataque no MapTargetActionModal
  const handleConfirmAttack = useCallback(async () => {
    const scene  = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) {
      console.warn('[GamePage] scene/camera não disponíveis para animar ataque');
      return;
    }

    // Coletar seleção atual do store
    const selectedTroops = useMapAttackStore.getState().selectedTroops;
    const selection: Record<string, number> = {};
    for (const t of selectedTroops) {
      if (t.quantity > 0) selection[t.type] = t.quantity;
    }

    if (Object.keys(selection).length === 0) {
      console.warn('[GamePage] Tentativa de ataque sem seleção de tropas');
      return;
    }

    await mapAttack.confirmAttack(
      selection as any,
      scene,
      camera,
      GRID_WIDTH,
      GRID_HEIGHT
    );
  }, [mapAttack]);

  const runAzideiaMissionCycle = useCallback(async (mission: AzideiaMission) => {
    const missionId = String(mission?.missionId || '');
    if (!missionId || activeAzideiaVisualsRef.current.has(missionId)) return;

    activeAzideiaVisualsRef.current.add(missionId);

    let forward: ReturnType<typeof mountAttackConvoy3D> | null = null;
    let returning: ReturnType<typeof mountAttackConvoy3D> | null = null;

    try {
      let current: AzideiaMission = mission;
      const scene = sceneRef.current;
      const currentPlayer = usePlayerStore.getState().player as any;
      const equippedSkinId = currentPlayer?.convoys?.equippedSkinId ?? 'comboio_padrao';
      const skin = getConvoySkin(equippedSkinId);

      if (current.status === 'travelling') {
        const route = Array.isArray(current.routeTiles) ? current.routeTiles : [];
        const arriveAtMs = parseIsoMs(current.arriveAtIso);

        if (scene && route.length > 1 && (!arriveAtMs || Date.now() < arriveAtMs)) {
          forward = mountAttackConvoy3D({
            scene,
            route,
            gridWidth: GRID_WIDTH,
            gridHeight: GRID_HEIGHT,
            skin,
            durationMs: Math.max(1200, Number(current.travelDurationMs || 2500)),
            initialProgress: progressBetween(getRouteStartMsForMission(current), arriveAtMs),
            coordinateMode: 'tile-center',
            memberCount: 1,
            label: 'Azidéia',
          });

          await forward.start();
          forward.cleanup();
          forward = null;
        } else {
          await waitUntilIso(current.arriveAtIso);
        }

        const arrival = await confirmAzideiaMissionArrival(missionId);
        if (arrival.player) {
          usePlayerStore.getState().hydratePlayerFromServer(arrival.player as any);
        }

        current = { ...current, ...arrival, status: 'returning' };

        await azideiaLayerRef.current?.playDeathAndRemove(current.targetId, 950);
        void azideiaLayerRef.current?.refresh();
      }

      if (current.status === 'returning') {
        const returnRoute = Array.isArray(current.returnRouteTiles) && current.returnRouteTiles.length > 1
          ? current.returnRouteTiles
          : Array.isArray(current.routeTiles)
            ? [...current.routeTiles].reverse()
            : [];
        const returnAtMs = parseIsoMs(current.returnAtIso);

        if (scene && returnRoute.length > 1 && (!returnAtMs || Date.now() < returnAtMs)) {
          returning = mountAttackConvoy3D({
            scene,
            route: returnRoute,
            gridWidth: GRID_WIDTH,
            gridHeight: GRID_HEIGHT,
            skin,
            durationMs: Math.max(1200, Number(current.returnDurationMs || current.travelDurationMs || 2500)),
            initialProgress: progressBetween(getReturnStartMsForMission(current), returnAtMs),
            coordinateMode: 'tile-center',
            memberCount: 1,
            label: 'Retorno Azidéia',
          });

          await returning.start();
          returning.cleanup();
          returning = null;
        } else {
          await waitUntilIso(current.returnAtIso);
        }

        const returned = await confirmAzideiaMissionReturn(missionId);
        if (returned.player) {
          usePlayerStore.getState().hydratePlayerFromServer(returned.player as any);
        }
      }
    } catch (error) {
      console.error('[GamePage] Falha no ciclo visual da Azidéia:', error);
      void azideiaLayerRef.current?.refresh();
    } finally {
      forward?.cleanup();
      returning?.cleanup();
      activeAzideiaVisualsRef.current.delete(missionId);
    }
  }, []);

  useEffect(() => {
    if (!threeReady || !player?._id) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await getActiveAzideiaMissions();
        if (cancelled) return;

        for (const mission of response.missions || []) {
          void runAzideiaMissionCycle(mission);
        }
      } catch (error) {
        console.error('[GamePage] Falha ao recuperar Azidéias ativas:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threeReady, player?._id, runAzideiaMissionCycle]);

  const handleConfirmAzideia = useCallback(async (target: AzideiaX9Target) => {
    const result = await attackAzideiaX9(target.id);

    if (result.player) {
      usePlayerStore.getState().hydratePlayerFromServer(result.player as any);
    }

    setAzideiaTarget(null);
    void runAzideiaMissionCycle(result);

    return result;
  }, [runAzideiaMissionCycle]);



  // ═══════════════════════════════════════════════════════════════════════════
  // EFEITO THREE.JS
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    if (!isPlayerLoaded || !player?._id) {
      return;
    }

    let isMounted = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050505');
    sceneRef.current = scene;  // exposto para o sistema de ataque (animação 3D)

    const camera = new THREE.PerspectiveCamera(
      50,
      mountEl.clientWidth / Math.max(mountEl.clientHeight, 1),
      0.1,
      1000
    );
    cameraRef.current = camera;  // exposto para o sistema de ataque

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    mountEl.appendChild(renderer.domElement);

    // Sinaliza que scene/camera estão prontas APÓS renderer estar no DOM
    setThreeReady(true);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.06;
    controls.minDistance    = 10;
    controls.maxDistance    = 70;
    controls.maxPolarAngle  = Math.PI / 2.05;

    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.35);
    dirLight.position.set(40, 90, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width  = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near   = 1;
    dirLight.shadow.camera.far    = 300;
    dirLight.shadow.camera.left   = -90;
    dirLight.shadow.camera.right  = 90;
    dirLight.shadow.camera.top    = 90;
    dirLight.shadow.camera.bottom = -90;
    scene.add(dirLight);

    const textureLoader = new THREE.TextureLoader();
    const floorTexture  = textureLoader.load(FLOOR_TEXTURE);
    floorTexture.wrapS     = THREE.ClampToEdgeWrapping;
    floorTexture.wrapT     = THREE.ClampToEdgeWrapping;
    floorTexture.repeat.set(1, 1);
    floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    floorTexture.magFilter  = THREE.LinearFilter;
    floorTexture.minFilter  = THREE.LinearMipmapLinearFilter;

    const platformGeometry = new THREE.BoxGeometry(
      GRID_WIDTH * TILE_SIZE, PLATFORM_HEIGHT, GRID_HEIGHT * TILE_SIZE
    );
    const platformMaterial = new THREE.MeshStandardMaterial({
      map: floorTexture, roughness: 1, metalness: 0,
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.set(0, -PLATFORM_HEIGHT / 2, 0);
    platform.receiveShadow = true;
    scene.add(platform);

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const fixedBuildingsLayer = mountFixedMapBuildings({
      scene,
      loader,
      camera,
      container: mountEl,
      onNavigate: (path: string) => {
        // Intercepta cliques em CTs para abrir modal de treinamento
        if (path.startsWith('ct:')) {
          const ctKey = path.replace('ct:', '');
          setSelectedCT(ctKey);
          setTrainingModalOpen(true);
        } else {
          navigate(path);
        }
      },
      onMessage:  () => {},
    });

    // Cache de posições dos outros jogadores
    const localPlayers = new Map<string, { tileX: number; tileY: number }>();

    // myId inicializado do store; playerInit o atualiza via closure
    let myId: string | null = player?._id ? String(player._id) : null;

    // ── Camada de jogadores em tempo real ─────────────────────────────────
    const realtimePlayersLayer = mountRealtimeMapPlayersLayer({
      scene,
      gridWidth:  GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      tileSize:   TILE_SIZE,
      pollingMs:  10000,
      showSpaces: true,
      getMyId:    () => myId,   // closure lê myId em tempo real
    });
    realtimePlayersLayer.start();

    const occupiedOrigins = Array.from(localPlayers.values()).map((p) => ({
      tileX: p.tileX, tileY: p.tileY,
    }));

    const playerMapSpace = mountPlayerMapSpace({
      scene,
      tileX:        Number(player?.mapPosition?.tileX ?? 0),
      tileY:        Number(player?.mapPosition?.tileY ?? 0),
      barracoLevel: Number(player?.niveis?.barracoLevel ?? 1),
      gridWidth:    GRID_WIDTH,
      gridHeight:   GRID_HEIGHT,
      tileSize:     TILE_SIZE,
      occupiedOrigins,
    });
    playerMapSpaceRef.current = playerMapSpace;

    const azideiaLayer = mountAzideiaX9Layer({
      scene,
      loader,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      tileSize: TILE_SIZE,
      onTargetClick: (target) => {
        setAzideiaTarget(target);
      },
    });
    azideiaLayerRef.current = azideiaLayer;
    void azideiaLayer.start();

    controls.target.set(playerMapSpace.worldX, 0, playerMapSpace.worldZ);
    camera.position.set(playerMapSpace.worldX + 12, 10, playerMapSpace.worldZ + 12);
    controls.update();

    const clickPlaneGeo = new THREE.PlaneGeometry(
      GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE
    );
    const clickPlaneMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    const clickPlane = new THREE.Mesh(clickPlaneGeo, clickPlaneMat);
    clickPlane.rotation.x = -Math.PI / 2;
    clickPlane.position.y = 0.05;
    scene.add(clickPlane);

    const selectionGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const selectionMat = new THREE.MeshBasicMaterial({
      color: 0xd9b764, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const selectionMesh = new THREE.Mesh(selectionGeo, selectionMat);
    selectionMesh.rotation.x = -Math.PI / 2;
    selectionMesh.position.set(0.5 - GRID_WIDTH / 2, 0.06, 0.5 - GRID_HEIGHT / 2);
    selectionMesh.visible = false;
    scene.add(selectionMesh);

    // ═════════════════════════════════════════════════════════════════════════
    // SOCKET.IO
    // ═════════════════════════════════════════════════════════════════════════
    let socket: any = null;
    try {
      if (typeof window !== 'undefined') {
        socket = getSocket();
        console.log('✅ GamePage: Socket obtido com sucesso');
      }
    } catch (err) {
      console.error('❌ GamePage: Erro ao obter socket:', err);
      // Socket unavailable during SSR/build
    }

    const onPlayerInit = (data: { player: any; faction?: any }) => {
      if (!isMounted) return;
      const incomingId = String(data.player?._id || data.player?.id || '');
      if (incomingId) {
        myId = incomingId;
        console.log('✅ playerInit: myId =', myId);
      }
      usePlayerStore.getState().hydratePlayerFromServer(data.player);
    };

    const onBarracoInfo = (data: any) => {
      if (!isMounted) return;
      console.log('🏠 barracoInfo:', data.playerName, '| power:', data.power);

      // Atualiza modal com dados completos (avatar, factionName, etc.)
      setModalState(
        openOtherPlayerBarracoModal({
          id:           String(data.playerId),
          name:         data.playerName  || 'Jogador',
          avatarUrl:    data.avatarUrl   ?? null,
          factionId:    data.factionId   ?? null,
          factionName:  data.factionName ?? null,
          barracoLevel: Number(data.barracoLevel ?? 1),
        })
      );

      // Se o backend enviou tileX/Y, atualiza memória do alvo
      if (typeof data.tileX === 'number' && typeof data.tileY === 'number') {
        rememberTargetTile({
          x: Number(data.tileX),
          y: Number(data.tileY),
        });
      }
    };
    
    if (socket) {
      socket.on('playerInit', onPlayerInit);
    } else {
      console.warn('⚠️ GamePage: Socket não disponível, eventos em tempo real desabilitados');
    }

    async function processSnapshot(players: any[]) {
      if (!isMounted || !Array.isArray(players)) return;
      const currentId = myId || (player?._id ? String(player._id) : null);
      const others = players.filter((p) => {
        const pId = String(p.id || p._id || '');
        return pId && pId !== currentId;
      });
      localPlayers.clear();
      for (const p of others) {
        localPlayers.set(String(p.id), { tileX: Number(p.tileX), tileY: Number(p.tileY) });
        await realtimePlayersLayer.upsertPlayer({
          id:           String(p.id),
          name:         p.name || 'Jogador',
          tileX:        Number(p.tileX),
          tileY:        Number(p.tileY),
          barracoLevel: Number(p.barracoLevel ?? 1),
          power:        Number(p.power ?? 0),
          factionId:    p.factionId ?? null,
        });
      }
    }

    function handleMapSnapshot(players: any[]) {
      if (!isMounted) return;
      void processSnapshot(players);
    }

    async function handlePlayerJoined(p: any) {
      if (!isMounted) return;
      const pId = String(p.id || p._id || '');
      if (pId === (myId || String(player?._id || ''))) return;
      localPlayers.set(pId, { tileX: Number(p.tileX), tileY: Number(p.tileY) });
      await realtimePlayersLayer.upsertPlayer({
        id:           pId,
        name:         p.name || 'Jogador',
        tileX:        Number(p.tileX),
        tileY:        Number(p.tileY),
        barracoLevel: Number(p.barracoLevel ?? 1),
        power:        Number(p.power ?? 0),
        factionId:    p.factionId ?? null,
      });
    }

    async function handlePlayerMoved(data: any) {
      if (!isMounted) return;
      const pId = String(data.playerId || data.id || '');
      if (pId === (myId || String(player?._id || ''))) {
        console.log('⏭️ playerMoved ignorado (próprio jogador)');
        return;
      }
      localPlayers.set(pId, { tileX: Number(data.tileX), tileY: Number(data.tileY) });
      await realtimePlayersLayer.upsertPlayer({
        id:    pId,
        name:  data.name,
        tileX: Number(data.tileX),
        tileY: Number(data.tileY),
      });
    }

    async function handlePlayerTeleported(data: any) {
      if (!isMounted) return;
      const pId = String(data.playerId || data.id || '');
      if (pId === (myId || String(player?._id || ''))) {
        console.log('⏭️ playerTeleported ignorado (próprio jogador)');
        return;
      }
      localPlayers.set(pId, {
        tileX: Number(data.newPosition.tileX),
        tileY: Number(data.newPosition.tileY),
      });
      await realtimePlayersLayer.upsertPlayer({
        id:    pId,
        name:  data.name,
        tileX: Number(data.newPosition.tileX),
        tileY: Number(data.newPosition.tileY),
      });
    }

    function handlePlayerLeft(data: { playerId: string }) {
      if (!isMounted) return;
      localPlayers.delete(String(data.playerId));
      void realtimePlayersLayer.refresh();
    }

    if (socket) {
      socket.on('mapSnapshot', handleMapSnapshot);
      socket.on('playerJoined', handlePlayerJoined);
      socket.on('playerMoved', handlePlayerMoved);
      socket.on('playerTeleported', handlePlayerTeleported);
      socket.on('playerLeft', handlePlayerLeft);
      socket.on('barracoInfo', onBarracoInfo);

      if (socket.connected) {
        socket.emit('requestMapSnapshot');
      } else {
        socket.once('connect', () => {
          if (isMounted) socket.emit('requestMapSnapshot');
        });
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // POINTER / TOUCH HANDLER
    // ═════════════════════════════════════════════════════════════════════════
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();
    let pendingTeleportTile: { tileX: number; tileY: number } | null = null;
    let pointerDownState: {
      pointerId: number;
      clientX: number;
      clientY: number;
      startedAt: number;
      pointerType: string;
    } | null = null;

    const TAP_MOVE_TOLERANCE_MOUSE_PX = 18;
    const TAP_MOVE_TOLERANCE_TOUCH_PX = 42;
    const TAP_MAX_DURATION_MOUSE_MS = 800;
    const TAP_MAX_DURATION_TOUCH_MS = 1100;
    const previousTouchAction = renderer.domElement.style.touchAction;
    renderer.domElement.style.touchAction = 'none';

    function handleMapTap(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x =  ((clientX - rect.left) / Math.max(1, rect.width))  * 2 - 1;
      mouse.y = -((clientY - rect.top)  / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // X9 precisa ter prioridade absoluta no toque. Antes ele era testado
      // depois dos prédios fixos; em touchscreen, o raycast de prédio/label
      // podia roubar o tap e impedir abrir o modal Azidéia.
      if (azideiaLayer.tryHandlePointer(clientX, clientY, camera, renderer.domElement, raycaster)) {
        return;
      }

      if (
        fixedBuildingsLayer.tryHandleBuildingClick(
          clientX,
          clientY
        )
      ) {
        return;
      }

      // Próprio barraco → /barraco
      const ownHits = raycaster.intersectObjects(
        playerMapSpaceRef.current?.modelContainer?.children || [], true
      );
      if (ownHits.length > 0) {
        navigate('/barraco');
        return;
      }

      // Barraco de outro jogador → modal
      const otherHits = raycaster.intersectObjects(
        realtimePlayersLayer.group.children, true
      );
      if (otherHits.length > 0) {
        let current: any = otherHits[0].object;
        while (current) {
          if (current.userData?.playerId) {
            const playerId   = String(current.userData.playerId);
            const playerData = realtimePlayersLayer.players()
              .find((p: any) => String(p.id) === playerId);

            if (playerData) {
              // 1) Abre imediatamente com dados básicos (UX otimista)
              setModalState(openOtherPlayerBarracoModal({
                id:           playerData.id,
                name:         playerData.name || 'Jogador',
                barracoLevel: playerData.barracoLevel,
                factionId:    playerData.factionId,
              }));
              // Memoriza tile do alvo (necessário para cálculo de viagem do ataque)
              rememberTargetTile({
                x: Number(playerData.tileX ?? 0),
                y: Number(playerData.tileY ?? 0),
              });
              // 2) Solicita dados ricos → barracoInfo event atualizará modal + attackTarget
              socket.emit('requestBarracoInfo', { targetPlayerId: playerId });
            }
            return;
          }
          current = current.parent;
        }
      }

      // Chão → teleporte (dois cliques para confirmar)
      const hits = raycaster.intersectObject(clickPlane, false);
      if (!hits.length) return;

      const point       = hits[0].point;
      const clickedTileX = Math.floor(point.x + GRID_WIDTH  / 2);
      const clickedTileY = Math.floor(point.z + GRID_HEIGHT / 2);

      if (
        clickedTileX < 0 || clickedTileX >= GRID_WIDTH ||
        clickedTileY < 0 || clickedTileY >= GRID_HEIGHT
      ) return;

      // Bloqueia tile de outro jogador
      if (
        Array.from(localPlayers.values()).find(
          (p) => `${p.tileX},${p.tileY}` === `${clickedTileX},${clickedTileY}`
        )
      ) {
        console.log('⚠️ Tile ocupado por outro jogador');
        return;
      }

      const currentOccupied = Array.from(localPlayers.values()).map((p) => ({
        tileX: p.tileX, tileY: p.tileY,
      }));

      if (!isPlayerSpaceAvailable(clickedTileX, clickedTileY, currentOccupied, GRID_WIDTH, GRID_HEIGHT)) {
        console.log('⚠️ Tile não está livre');
        return;
      }

      // Segundo clique no mesmo tile → confirma teleporte
      if (
        pendingTeleportTile &&
        pendingTeleportTile.tileX === clickedTileX &&
        pendingTeleportTile.tileY === clickedTileY
      ) {
        console.log('✅ Confirmando teleporte:', clickedTileX, clickedTileY);
        pendingTeleportTile   = null;
        selectionMesh.visible = false;

        // ── teleportPlayerMapSpace: resolve colisão + atualiza posição 3D ──
        const result = teleportPlayerMapSpace(playerMapSpaceRef.current, {
          clickedTileX,
          clickedTileY,
          occupiedOrigins: currentOccupied,
          gridWidth:  GRID_WIDTH,
          gridHeight: GRID_HEIGHT,
        });

        // Atualiza store de forma otimista
        usePlayerStore.getState().applyPlayerUpdate((p) => ({
          ...p,
          mapPosition: {
            tileX:  result.tileX,
            tileY:  result.tileY,
            worldX: result.worldX,
            worldY: result.worldZ,
          },
        }));

        // 'teleport' tem cooldown de 30s no backend (diferente de 'move' que é 1s)
        socket.emit('teleport', {
          tileX:        result.tileX,
          tileY:        result.tileY,
          teleportType: 'manual',
        });

        return;
      }

      // Primeiro clique → mostra seletor, aguarda confirmação
      console.log('🎯 Selecionando tile:', clickedTileX, clickedTileY);
      pendingTeleportTile = { tileX: clickedTileX, tileY: clickedTileY };
      selectionMesh.position.set(
        clickedTileX - GRID_WIDTH  / 2 + 0.5,
        0.06,
        clickedTileY - GRID_HEIGHT / 2 + 0.5
      );
      selectionMesh.visible = true;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!event.isPrimary) return;
      pointerDownState = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        startedAt: performance.now(),
        pointerType: event.pointerType || 'mouse',
      };
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Alguns WebViews antigos podem recusar capture; o toque ainda funciona via pointerup.
      }
    }

    function handlePointerUp(event: PointerEvent) {
      if (!event.isPrimary) return;
      const down = pointerDownState;
      pointerDownState = null;

      try {
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignora WebViews sem suporte completo a pointer capture.
      }

      if (!down || down.pointerId !== event.pointerId) return;

      const moved = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY);
      const duration = performance.now() - down.startedAt;
      const isTouchLike = down.pointerType === 'touch' || down.pointerType === 'pen';
      const tolerance = isTouchLike ? TAP_MOVE_TOLERANCE_TOUCH_PX : TAP_MOVE_TOLERANCE_MOUSE_PX;
      const maxDuration = isTouchLike ? TAP_MAX_DURATION_TOUCH_MS : TAP_MAX_DURATION_MOUSE_MS;
      if (moved > tolerance || duration > maxDuration) return;

      event.preventDefault();

      // Em celular o dedo pode escorregar alguns pixels ou o OrbitControls pode
      // atualizar a câmera entre pointerdown e pointerup. Primeiro tenta o ponto
      // inicial do toque para X9; se não acertar, segue o fluxo normal no ponto final.
      if (azideiaLayer.tryHandlePointer(down.clientX, down.clientY, camera, renderer.domElement, raycaster)) {
        return;
      }

      handleMapTap(event.clientX, event.clientY);
    }

    function handlePointerCancel(event: PointerEvent) {
      if (pointerDownState?.pointerId === event.pointerId) {
        pointerDownState = null;
      }
    }

    function handleClickFallback(event: MouseEvent) {
      if ('PointerEvent' in window) return;
      handleMapTap(event.clientX, event.clientY);
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerCancel);
    renderer.domElement.addEventListener('click', handleClickFallback);

    function handleResize() {
      if (!mountEl) return;
      const w = mountEl.clientWidth;
      const h = Math.max(mountEl.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mountEl);

    let animationFrameId = 0;
    function animate() {
      animationFrameId = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      isMounted = false;
      setThreeReady(false);
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
      renderer.domElement.removeEventListener('click', handleClickFallback);
      renderer.domElement.style.touchAction = previousTouchAction;

      if (socket) {
        socket.off('playerInit', onPlayerInit);
        socket.off('mapSnapshot', handleMapSnapshot);
        socket.off('playerJoined', handlePlayerJoined);
        socket.off('playerMoved', handlePlayerMoved);
        socket.off('playerTeleported', handlePlayerTeleported);
        socket.off('playerLeft', handlePlayerLeft);
        socket.off('barracoInfo', onBarracoInfo);
      }

      controls.dispose();
      realtimePlayersLayer.cleanup();
      fixedBuildingsLayer.cleanup();
      azideiaLayer.cleanup();
      if (azideiaLayerRef.current === azideiaLayer) azideiaLayerRef.current = null;
      playerMapSpaceRef.current?.cleanup();

      platformGeometry.dispose();
      platformMaterial.dispose();
      clickPlaneGeo.dispose();
      clickPlaneMat.dispose();
      selectionGeo.dispose();
      selectionMat.dispose();
      floorTexture.dispose();

      scene.remove(platform);
      scene.remove(clickPlane);
      scene.remove(selectionMesh);

  renderer.dispose();
      if (mountEl && renderer.domElement?.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
      sceneRef.current  = null;
      cameraRef.current = null;
    };
  }, [navigate, isPlayerLoaded, player?._id]);

  // ── Recuperar batalhas ativas ao montar (após scene estar pronta) ──────────
  useActiveMapBattles({
    scene: threeReady ? sceneRef.current : null,
    camera: threeReady ? cameraRef.current : null,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
  });

  useRemoteSquadAnimations({
    scene: threeReady ? sceneRef.current : null,
    camera: threeReady ? cameraRef.current : null,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
  });

  return (
    <div className="fixed inset-0 z-40 bg-black overflow-hidden">

      {/* MAPA — tela cheia */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* ── HUD TOPO ESQUERDO — avatar + nome + saldos ─────────────────── */}
      <div className="absolute top-3 left-3 z-10 flex items-start gap-2 pointer-events-none">

        {/* Avatar com nível */}
        <div className="relative shrink-0">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={playerName} className="h-16 w-16 rounded-2xl border-2 border-[#d9b764] object-cover shadow-[0_0_12px_rgba(217,183,100,0.4)]" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#d9b764] bg-zinc-900 text-2xl font-black text-[#d9b764]">
              {playerName[0]?.toUpperCase() || '?'}
            </div>
          )}
          {/* Badge de nível */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#d9b764] px-2 py-0.5 text-[9px] font-black text-black whitespace-nowrap shadow">
            {playerLevel}
          </div>
        </div>

        {/* Nome + saldos */}
        <div className="flex flex-col gap-1">
          <div className="rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 px-3 py-1">
            <p className="font-black text-[#f6d27b] text-sm leading-none tracking-wide uppercase truncate max-w-[140px]">
              {playerName}
            </p>
          </div>

          {/* Commands Sujo */}
          <div className="flex items-center gap-1.5 rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 px-2.5 py-1">
            <Image src={COMMANDS_ICON} alt="" className="h-4 w-4 object-contain" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase">Sujo</span>
            <span className="text-xs font-black text-white ml-0.5">{fmt(dirtyMoney)}</span>
          </div>

          {/* Commands Limpo */}
          <div className="flex items-center gap-1.5 rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 px-2.5 py-1">
            <Image src={COMMANDS_ICON} alt="" className="h-4 w-4 object-contain" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase">Limpo</span>
            <span className="text-xs font-black text-white ml-0.5">{fmt(cleanMoney)}</span>
          </div>
        </div>
      </div>

      {/* ── HUD INFERIOR DIREITO — ícones de chat ─────────────────────── */}
      <div className="absolute bottom-8 right-4 z-10 flex flex-col gap-4 pointer-events-auto">

        <button type="button" onClick={() => navigate('/shop')}
          className="active:scale-90 transition-transform">
          <Image src={ICON_SHOP} alt="Loja" className="h-16 w-16 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]" />
        </button>

        <button type="button" onClick={() => navigate('/chat?channel=complexo')}
          className="active:scale-90 transition-transform">
          <Image src={ICON_COMPLEXO} alt="Complexo" className="h-16 w-16 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]" />
        </button>

        <button type="button" onClick={() => navigate('/chat?channel=faccao')}
          className="active:scale-90 transition-transform">
          <Image src={ICON_FACCAO} alt="Facção" className="h-16 w-16 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]" />
        </button>

        <button type="button" onClick={() => navigate('/chat?channel=mail')}
          className="relative active:scale-90 transition-transform">
          <Image src={ICON_MAIL} alt="Correio" className="h-16 w-16 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]" />
          {unreadMailCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-yellow-400 px-1 text-[10px] font-black text-black shadow">
              {unreadMailCount}
            </span>
          )}
        </button>

      </div>

      {/* ── Modais ───────────────────────────────────────────────────── */}
      <OtherPlayerBarracoModal
        state={modalState}
        myFactionId={myFactionId}
        isInviting={isInviting}
        isSendingMessage={isSendingMessage}
        isAttacking={mapAttack.isResolving}
        onClose={() => setModalState(closeOtherPlayerBarracoModal())}
        onSendPrivateMessage={handleSendPrivateMessage}
        onInviteToFaction={handleInviteToFaction}
        onAttack={handleAttack}
      />

      {/* ── Sistema de ataque PvP ───────────────────────────────────── */}
      {mapAttackPreviewOpen && (
        <MapTargetActionModal
          isStartingBattle={mapAttack.isResolving}
          onAttack={() => { void handleConfirmAttack(); }}
        />
      )}
      <AttackResultOverlay />
      <ConvoyAttackAnimation />
      <AttackIncomingToast />

      <AzideiaAttackModal
        target={azideiaTarget}
        onClose={() => setAzideiaTarget(null)}
        onConfirm={handleConfirmAzideia}
      />

      <DirectMessageModal
        isOpen={dmModalOpen}
        target={dmTarget}
        onClose={() => { setDmModalOpen(false); setDmTarget(null); }}
      />

      {/* ── Modal de Treinamento de Gangue (CT) ─────────────────────── */}
      {trainingModalOpen && selectedCT && (
        <GangTrainingModal
          isOpen={trainingModalOpen}
          slotKey={selectedCT as any}
          player={player as any}
          trainingState={{
            slots: {},
            trainingSlots,
          } as any}
          isSubmitting={isSubmittingTraining}
          onClose={() => {
            setTrainingModalOpen(false);
            setSelectedCT(null);
          }}
          onStartTraining={async (_slotKey, memberType, troopLevel) => {
            setIsSubmittingTraining(true);

            try {
              const ok = await useGangStore.getState().queueTraining(_slotKey, memberType, troopLevel);

              if (!ok) {
                console.error(useGangStore.getState().error);
                return;
              }

              console.log('✅ Treinamento iniciado:', memberType, 'lvl', troopLevel, 'no CT:', selectedCT);
            } catch (error) {
              console.error('❌ Erro ao iniciar treinamento:', error);
            } finally {
              setIsSubmittingTraining(false);
            }
          }}
          onCollectTraining={async (slotId) => {
            setIsSubmittingTraining(true);

            try {
              const ok = await useGangStore.getState().collectTraining(slotId);

              if (!ok) {
                console.error(useGangStore.getState().error);
                return;
              }

              console.log('✅ Treinamento coletado:', slotId);
            } catch (error) {
              console.error('❌ Erro ao coletar treinamento:', error);
            } finally {
              setIsSubmittingTraining(false);
            }
          }}
        />
      )}
    </div>
  );
}