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

export const AZIDEIA_TARGETS = {
  x9: AZIDEIA_X9,
  correria: AZIDEIA_CORRERIA,
};
