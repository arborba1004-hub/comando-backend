export const AZIDEIA_X9 = {
  type: 'x9',
  name: 'X9',
  modelUrl: 'https://static.wixstatic.com/3d/50f4bf_d07bb1c9327e4f0aaec0681e47314a9e.glb',
  iconUrl: 'https://static.wixstatic.com/media/50f4bf_ce2c97a1cf324091851178166ed02d29~mv2.png',
  costDirtyMoney: 5000,
  activeCount: 20,
  dailyLimitPerPlayer: 20,
  factionDailyRewardLimit: 100,
  rewardType: 'convoy_2x',
  rewardQuantity: 1,
};

export const AZIDEIA_CORRERIA = {
  type: 'correria',
  name: 'Correria',
  modelUrl: 'https://static.wixstatic.com/3d/50f4bf_20d89e99d4084eb4a12aea96fa04556d.glb',
  iconUrl: 'https://static.wixstatic.com/media/50f4bf_9bda4af1a12b47679336479a80b16eb8~mv2.png',
  costDirtyMoney: 0,
  activeCount: 10,
  dailyLimitPerPlayer: 10,
  factionDailyRewardLimit: 100,
  rewardType: 'corre',
  rewardQuantity: 1,
};

export const AZIDEIA_MESTRE_OBRAS = {
  type: 'mestre_obras',
  name: 'Mestre de Obras',
  modelUrl: 'https://static.wixstatic.com/3d/50f4bf_a57dc1f7521241bcb8f14e0912af8855.glb',
  // O custo é dinâmico por nível do barraco. Este valor é fallback/legado.
  costDirtyMoney: 3250,
  activeCount: 10,
  dailyLimitPerPlayer: 10,
  factionDailyRewardLimit: 100,
  rewardType: 'barraco_time',
  // Recompensa individual: 1h + 1min em aceleradores do barraco.
  rewardQuantitySeconds: 60 * 60 + 60,
  rewardQuantity: 60 * 60 + 60,
  // Recompensa de facção: 1 acelerador de 5min por membro/dia, limitada por claim.
  factionRewardQuantitySeconds: 5 * 60,
};

export function getMestreObrasCostDirtyMoney(barracoLevel = 1) {
  const level = Math.max(1, Math.min(100, Math.floor(Number(barracoLevel) || 1)));
  const raw = 2500 + level * 750 * Math.pow(1.015, Math.max(0, level - 1));
  return Math.max(1000, Math.floor(raw / 50) * 50);
}

export const AZIDEIA_TARGETS = {
  x9: AZIDEIA_X9,
  correria: AZIDEIA_CORRERIA,
  mestre_obras: AZIDEIA_MESTRE_OBRAS,
};
