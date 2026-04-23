function formatComposition(title, composition = {}) {
  return [
    title,
    `Capanga: ${Number(composition.capanga || 0).toLocaleString('pt-BR')}`,
    `Frente: ${Number(composition.frente || 0).toLocaleString('pt-BR')}`,
    `Executor: ${Number(composition.executor || 0).toLocaleString('pt-BR')}`,
    `Assassino: ${Number(composition.assassino || 0).toLocaleString('pt-BR')}`,
    `Muralha: ${Number(composition.muralha || 0).toLocaleString('pt-BR')}`,
    `Certeiro: ${Number(composition.certeiro || 0).toLocaleString('pt-BR')}`,
    `Motorista: ${Number(composition.motorista || 0).toLocaleString('pt-BR')}`,
    `Nitro: ${Number(composition.nitro || 0).toLocaleString('pt-BR')}`,
  ].join('\n');
}

function formatSide(label, side) {
  return [
    label,
    `Jogador: ${side.name}`,
    `Coordenadas: X:${side.coordinates.x} Y:${side.coordinates.y}`,
    `Barraco: nível ${side.barracoLevel.toLocaleString('pt-BR')}`,
    `Tropas Eliminadas: ${side.tropasEliminadas.toLocaleString('pt-BR')}`,
    `Perdas: ${side.perdas.toLocaleString('pt-BR')}`,
    `Machucados: ${side.machucados.toLocaleString('pt-BR')}`,
    `Vivos: ${side.vivos.toLocaleString('pt-BR')}`,
    `Dano Total Causado: ${side.danoTotalCausado.toLocaleString('pt-BR')}`,
    `Dano Total Recebido: ${side.danoTotalRecebido.toLocaleString('pt-BR')}`,
    '',
    formatComposition('Composição Inicial', side.composicaoInicial),
    '',
    formatComposition('Composição Final', side.composicaoFinal),
  ].join('\n');
}

export function buildAttackReport(result) {
  const winnerName =
    result.winner === 'atacante'
      ? result.attacker.name
      : result.winner === 'defensor'
        ? result.defender.name
        : 'Empate';

  const loserName =
    result.winner === 'atacante'
      ? result.defender.name
      : result.winner === 'defensor'
        ? result.attacker.name
        : 'Nenhum';

  const top = [
    'ESPÓLIOS',
    `+ ${Number(result.lootDirtyMoney || 0).toLocaleString('pt-BR')} dinheiro sujo para ${winnerName}`,
    `- ${Number(result.lootDirtyMoney || 0).toLocaleString('pt-BR')} dinheiro sujo para ${loserName}`,
    `Vencedor: ${winnerName}`,
    `Rodadas: ${Number(result.rounds || 0).toLocaleString('pt-BR')}`,
    `Barraco do perdedor: nível ${Number(result.barracoLevelPerdedor || 0).toLocaleString('pt-BR')}`,
    '',
  ].join('\n');

  const body = [
    top,
    formatSide('ATACANTE', result.attacker),
    '',
    formatSide('DEFENSOR', result.defender),
  ].join('\n');

  return {
    attackerSubject: `Resultado do ataque em ${result.defender.name}`,
    attackerBody: body,
    defenderSubject: `Seu barraco foi atacado por ${result.attacker.name}`,
    defenderBody: body,
  };
}
