export const DEFAULT_CONVOY_SKIN_ID = 'comboio_padrao';

export const CONVOY_CATALOG = [
  {
    id: 'comboio_padrao',
    name: 'Comboio Padrão',
    description: 'Comboio inicial. Liberado para todo jogador e usado como fallback seguro.',
    rarity: 'gratis',
    price: 0,
    currency: 'cleanMoney',
    modelUrl: null,
    icon: '🚚',
    accentColor: '#d9b764',
    modelScale: 1,
    fitTileLength: 2.2,
    speedBonusPercent: 0,
  },
  {
    id: 'comboio_moto',
    name: 'Bonde Rápido',
    description: 'Comboio leve para ataques visuais mais ágeis. O bônus real depende do backend.',
    rarity: 'comum',
    price: 25000,
    currency: 'cleanMoney',
    modelUrl: null,
    icon: '🏍️',
    accentColor: '#f59e0b',
    modelScale: 1,
    fitTileLength: 1.7,
    speedBonusPercent: 0,
  },
  {
    id: 'comboio_blindado',
    name: 'Comboio Blindado',
    description: 'Visual pesado e protegido para invasões de alto impacto.',
    rarity: 'raro',
    price: 95000,
    currency: 'cleanMoney',
    modelUrl: null,
    icon: '🛡️',
    accentColor: '#ef4444',
    modelScale: 1,
    fitTileLength: 2.6,
    speedBonusPercent: 0,
  },
  {
    id: 'comboio_pesado',
    name: 'Comboio Pesado',
    description: 'Visual premium para marcha de guerra. Ideal para pacote futuro de loja.',
    rarity: 'epico',
    price: 180000,
    currency: 'cleanMoney',
    modelUrl: null,
    icon: '🚛',
    accentColor: '#a855f7',
    modelScale: 1,
    fitTileLength: 3,
    speedBonusPercent: 0,
  },
  {
    id: 'comboio_teste_glb',
    name: 'Comboio de Teste GLB',
    description: 'Comboio de teste comprado com Commands Sujo para validar loja, posse e animação no ataque.',
    rarity: 'comum',
    price: 1000,
    currency: 'dirtyMoney',
    modelUrl: 'https://static.wixstatic.com/3d/50f4bf_3d710d145f1b455d9360a59766a17f45.glb',
    icon: '🚐',
    accentColor: '#22c55e',
    modelScale: 1,
    fitTileLength: 2.8,
    speedBonusPercent: 0,
  },
,
  {
    id: 'comboio_real_199_glb',
    name: 'Comboio Real GLB',
    description: 'Comboio premium comprado com dinheiro real via Mercado Pago Checkout Pro.',
    rarity: 'raro',
    price: 1.99,
    currency: 'realMoney',
    purchaseType: 'realMoney',
    realCurrency: 'BRL',
    modelUrl: 'https://static.wixstatic.com/3d/50f4bf_3946576a583344c78d1d912657570015.glb',
    icon: '💳',
    accentColor: '#38bdf8',
    modelScale: 0.42,
    fitTileLength: 1.15,
    speedBonusPercent: 0,
    maxModelHeight: 1.35,
    groundOffsetY: -0.12,
    materialBoost: 2.4,
  },];

export const CONVOY_BY_ID = CONVOY_CATALOG.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export function getConvoySkin(skinId) {
  const id = String(skinId || DEFAULT_CONVOY_SKIN_ID).trim();
  return CONVOY_BY_ID[id] || CONVOY_BY_ID[DEFAULT_CONVOY_SKIN_ID];
}

export function isValidConvoySkinId(skinId) {
  return Boolean(CONVOY_BY_ID[String(skinId || '').trim()]);
}
