// services/attack/buildAttackReport.js

function n(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatComposition(title, comp = {}) {
  const lines = [title];
  const types = [
    ['capanga',   'Capanga'],
    ['frente',    'Frente'],
    ['executor',  'Executor'],
    ['assassino', 'Assassino'],
    ['muralha',   'Muralha'],
    ['certeiro',  'Certeiro'],
    ['motorista', 'Motorista'],
    ['nitro',     'Nitro'],
  ];
  for (const [key, label] of types) {
    const qty = Number(comp[key] || 0);
    if (qty > 0) lines.push(`  ${label}: ${n(qty)}`);
  }
  return lines.join('\n');
}

function formatSide(label, side, isWinner) {
  return [
    `${label} ${isWinner ? '★ VENCEDOR' : ''}`.trim(),
    `Jogador: ${side.name}`,
    `Barraco: nível ${n(side.barracoLevel)}`,
    `Coordenadas: X:${side.coordinates.x} Y:${side.coordinates.y}`,
    '',
    `Tropas eliminadas: ${n(side.tropasEliminadas)}`,
    `Perdas (mortos): ${n(side.perdas)}`,
    `Feridos: ${n(side.machucados)}`,
    `Sobreviventes: ${n(side.vivos)}`,
    `Dano causado: ${n(side.danoTotalCausado)}`,
    `Dano recebido: ${n(side.danoTotalRecebido)}`,
    '',
    formatComposition('Composição enviada:', side.composicaoInicial),
    '',
    formatComposition('Composição final:', side.composicaoFinal),
  ].join('\n');
}

function formatGangLosses(label, losses) {
  if (!losses) return '';
  const types = ['capanga','frente','executor','assassino','muralha','certeiro','motorista','nitro'];
  const lines = [label];
  let any = false;
  for (const t of types) {
    const mortos  = Number(losses.mortos?.[t]  || 0);
    const feridos = Number(losses.feridos?.[t] || 0);
    if (mortos || feridos) {
      const name = t.charAt(0).toUpperCase() + t.slice(1);
      lines.push(`  ${name}: ${mortos > 0 ? `💀 ${mortos} morto(s)` : ''} ${feridos > 0 ? `🏥 ${feridos} ferido(s)` : ''}`.trim());
      any = true;
    }
  }
  return any ? lines.join('\n') : '';
}

export function buildAttackReport(result) {
  const isAttackerWinner = result.winner === 'atacante';
  const isTie            = result.winner === 'empate';

  const attackerWins = isAttackerWinner;
  const defenderWins = !isAttackerWinner && !isTie;

  // ── Espólios ──────────────────────────────────────────────────────────────
  const spoilsBlock = [
    '─── ESPÓLIOS ───────────────────────────────────────',
    `Dinheiro Sujo: R$ ${n(result.lootDirtyMoney)}`,
    result.spoils?.correLoot    > 0 ? `Giros (Corré): +${result.spoils.correLoot}`  : '',
    result.spoils?.prestigeLoot > 0 ? `Prestígio: +${result.spoils.prestigeLoot}`   : '',
    result.critical             ? '⚡ ATAQUE CRÍTICO!'                               : '',
  ].filter(Boolean).join('\n');

  // ── Perdas por tipo ────────────────────────────────────────────────────────
  const atkLossBlock = formatGangLosses('─── BAIXAS DO ATACANTE ─────────────────────────────', result.attackerGangLosses);
  const defLossBlock = formatGangLosses('─── BAIXAS DO DEFENSOR ─────────────────────────────', result.defenderGangLosses);

  // ── Corpo compartilhado ───────────────────────────────────────────────────
  const sharedBody = [
    isTie ? '⚔️  EMPATE' : (isAttackerWinner ? '🏆 VITÓRIA DO ATACANTE' : '🛡️  DEFESA BEM-SUCEDIDA'),
    `Rodadas: ${n(result.rounds)}`,
    '',
    spoilsBlock,
    '',
    formatSide('ATACANTE', result.attacker, attackerWins),
    '',
    formatSide('DEFENSOR', result.defender, defenderWins),
    '',
    atkLossBlock,
    atkLossBlock ? '' : '',
    defLossBlock,
    '',
    '────────────────────────────────────────────────────',
    'Este relatório foi gerado automaticamente pelo sistema.',
  ].filter((l) => l !== undefined).join('\n');

  // ── Assuntos personalizados ───────────────────────────────────────────────
  const attackerSubject = isAttackerWinner
    ? `✅ Vitória! Você atacou ${result.defender.name} e ganhou R$ ${n(result.lootDirtyMoney)}`
    : isTie
    ? `⚔️ Empate no ataque contra ${result.defender.name}`
    : `❌ Derrota! Seu ataque a ${result.defender.name} falhou`;

  const defenderSubject = isAttackerWinner
    ? `🚨 Você foi atacado por ${result.attacker.name} e perdeu R$ ${n(result.lootDirtyMoney)}`
    : isTie
    ? `⚔️ Ataque de ${result.attacker.name} resultou em empate`
    : `✅ Defesa! Você resistiu ao ataque de ${result.attacker.name}`;

  return {
    attackerSubject,
    attackerBody: sharedBody,
    defenderSubject,
    defenderBody: sharedBody,
  };
}