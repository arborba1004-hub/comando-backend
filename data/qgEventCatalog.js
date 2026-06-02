// data/qgEventCatalog.js
// Catálogo autoritativo do evento Tomada do QG.
// Inspirado em eventos de controle de prédio central/prefeitura de jogos 4X,
// adaptado para Domínio do Comando sem custo de entrada e com recompensas de facção.

export const QG_EVENT = {
  slug: 'tomada_qg',
  title: 'Tomada do QG',
  subtitle: 'O Complexo disputa o comando político do mapa.',
  durationMs: 90 * 60 * 1000,
  preparationMs: 10 * 60 * 1000,
  finalRushMs: 12 * 60 * 1000,
  minBarracoLevel: 5,
  maxActiveParticipantsPerFaction: 30,
  winnerBuffDurationMs: 24 * 60 * 60 * 1000,
  participantRewardCooldownMs: 0,
};

export const QG_EVENT_ACTIONS = {
  hack_panel: {
    id: 'hack_panel',
    label: 'Hackear Painel do QG',
    description: 'Invade o painel central e injeta influência para a facção.',
    points: 42,
    heat: 8,
    cooldownMs: 95 * 1000,
    icon: '▣',
  },
  hold_gate: {
    id: 'hold_gate',
    label: 'Segurar Portão',
    description: 'Ocupa a entrada do prédio e impede avanço rival.',
    points: 34,
    heat: 6,
    cooldownMs: 75 * 1000,
    icon: '▰',
  },
  disrupt_signal: {
    id: 'disrupt_signal',
    label: 'Cortar Sinal Rival',
    description: 'Derruba comunicação inimiga e ganha ponto de virada.',
    points: 28,
    heat: 5,
    cooldownMs: 65 * 1000,
    icon: '⌁',
  },
  reinforce_convoy: {
    id: 'reinforce_convoy',
    label: 'Reforçar Comboio',
    description: 'Traz munição, remédios e equipe para sustentar a ocupação.',
    points: 24,
    heat: 3,
    cooldownMs: 55 * 1000,
    icon: '◆',
  },
  final_push: {
    id: 'final_push',
    label: 'Avanço Final',
    description: 'Só fica disponível na reta final. Grande pontuação, grande risco.',
    points: 75,
    heat: 16,
    cooldownMs: 180 * 1000,
    finalOnly: true,
    icon: '★',
  },
};

export const QG_OFFICE_TITLES = [
  {
    id: 'prefeito_do_comando',
    title: 'Prefeito do Comando',
    description: 'Líder simbólico do mandato. A facção vencedora vira referência do mapa.',
  },
  {
    id: 'chefe_de_gabinete',
    title: 'Chefe de Gabinete',
    description: 'Destaque individual do evento, dado ao jogador com maior pontuação.',
  },
  {
    id: 'dono_da_antena',
    title: 'Dono da Antena',
    description: 'Especialista em hack e sinal. Reconhecimento por controle tático.',
  },
  {
    id: 'seguranca_do_qg',
    title: 'Segurança do QG',
    description: 'Jogador que mais sustentou a ocupação e defendeu os acessos.',
  },
];

export const QG_WINNER_STAT_SOURCE = {
  idPrefix: 'evento_tomada_qg_mandato',
  label: 'Mandato do QG',
  source: 'evento',
  targetScope: 'global',
  percent: {
    rajada: 3,
    blindagem: 3,
    folego: 2,
    quebra: 2,
  },
  flat: {
    rajada: 0,
    blindagem: 0,
    folego: 0,
    quebra: 0,
  },
};

export function getQGEventPhase(nowMs, event = {}) {
  const startMs = new Date(event.startsAt || Date.now()).getTime();
  const endMs = new Date(event.endsAt || Date.now()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || nowMs >= endMs) return 'finished';

  if (nowMs - startMs < QG_EVENT.preparationMs) return 'preparation';
  if (endMs - nowMs <= QG_EVENT.finalRushMs) return 'final';
  return 'war';
}

export function getQGIndividualReward(score = 0, rank = 999) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const rankBonus = rank === 1 ? 1.55 : rank === 2 ? 1.35 : rank === 3 ? 1.2 : 1;
  const participationTier = safeScore >= 1800 ? 4 : safeScore >= 1000 ? 3 : safeScore >= 450 ? 2 : safeScore >= 100 ? 1 : 0;

  const base = {
    cleanMoney: Math.floor((120 + safeScore * 0.72) * rankBonus),
    dirtyMoney: Math.floor((2500 + safeScore * 14) * rankBonus),
    corre: Math.floor((3 + participationTier * 2 + safeScore / 650) * rankBonus),
    battlePrestige: Math.floor((10 + safeScore / 18) * rankBonus),
    barracoAcceleratorSeconds: participationTier * 15 * 60,
    convoyAcceleratorTwoX: Math.max(0, participationTier - 1),
  };

  return {
    cleanMoney: Math.max(0, base.cleanMoney),
    dirtyMoney: Math.max(0, base.dirtyMoney),
    corre: Math.max(0, base.corre),
    battlePrestige: Math.max(0, base.battlePrestige),
    barracoAcceleratorSeconds: Math.max(0, base.barracoAcceleratorSeconds),
    convoyAcceleratorTwoX: Math.max(0, base.convoyAcceleratorTwoX),
  };
}

export function getQGFactionReward(totalScore = 0, memberCount = 1) {
  const safeScore = Math.max(0, Math.floor(Number(totalScore) || 0));
  const safeMembers = Math.max(1, Math.floor(Number(memberCount) || 1));
  return {
    factionExp: Math.min(2500, Math.floor(150 + safeScore / 12)),
    treasury: {
      cleanMoney: Math.min(120000, Math.floor(2000 + safeScore * 0.55 + safeMembers * 100)),
      dirtyMoney: Math.min(900000, Math.floor(25000 + safeScore * 8 + safeMembers * 1200)),
      corre: Math.min(500, Math.floor(20 + safeScore / 220 + safeMembers)),
    },
  };
}
