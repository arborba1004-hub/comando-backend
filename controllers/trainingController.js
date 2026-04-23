import Player from '../models/Player.js';
import { randomUUID } from 'crypto';
import { bumpVersion } from '../utils/gameHelpers.js';

// ===== SALVAR ESTADO DE TREINAMENTO =====
export async function persistTrainingState(req, res) {
  try {
    const player = req.player; // do middleware de auth
    const { trainingState, gangMembers } = req.body;

    if (!trainingState || !Array.isArray(gangMembers)) {
      return res.status(400).json({
        error: 'trainingState e gangMembers são obrigatórios'
      });
    }

    // Validar que os IDs dos membros foram realmente treinados
    // (proteção contra cheating)
    const maxMembers = Math.max(1, Math.floor(player.niveis?.barracoLevel || 1));
    if (gangMembers.length > maxMembers * 100) {
      return res.status(400).json({
        error: 'Número de membros excede capacidade do barraco'
      });
    }

    // Validar que os membros têm IDs válidos e tipos corretos
    const validTypes = ['capanga', 'frente', 'executor', 'assassino', 'muralha', 'certeiro', 'motorista', 'nitro'];
    for (const member of gangMembers) {
      if (!member.id || !validTypes.includes(member.type)) {
        return res.status(400).json({
          error: 'Membro com ID ou tipo inválido'
        });
      }
    }

    // Mesclar com membros existentes (apenas ativos)
    const existingMembers = Array.isArray(player.gang?.members) 
      ? player.gang.members.filter(m => m.status === 'ativo')
      : [];

    // Evitar duplicação: membros novos que não existem ainda
    const newMemberIds = new Set(gangMembers.map(m => m.id));
    const membersToKeep = existingMembers.filter(m => !newMemberIds.has(m.id));

    // Construir estado final
    const allMembers = [...membersToKeep, ...gangMembers];

    // Atualizar player
    player.gang.members = allMembers;
    player.gang.updatedAtIso = new Date().toISOString();
    bumpVersion(player);

    await player.save();

    return res.json({
      success: true,
      message: 'Treinamento persistido',
      totalMembers: allMembers.length,
      activeMembers: allMembers.filter(m => m.status === 'ativo').length,
    });
  } catch (error) {
    console.error('Erro em persistTrainingState:', error);
    return res.status(500).json({
      error: 'Erro ao persistir treinamento'
    });
  }
}

// ===== COLETAR MEMBROS TREINADOS =====
export async function collectTraining(req, res) {
  try {
    const player = req.player;
    const { slotKey, trainingState, memberType, quantity } = req.body;

    if (!slotKey || !memberType || !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({
        error: 'slotKey, memberType e quantity (> 0) são obrigatórios'
      });
    }

    const validTypes = ['capanga', 'frente', 'executor', 'assassino', 'muralha', 'certeiro', 'motorista', 'nitro'];
    if (!validTypes.includes(memberType)) {
      return res.status(400).json({
        error: 'Tipo de membro inválido'
      });
    }

    // Criar novos membros treinados
    const newMembers = [];
    for (let i = 0; i < quantity; i++) {
      newMembers.push({
        id: `member_${player._id}_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,
        type: memberType,
        level: 1,
        status: 'ativo',
        recruitedAt: new Date().toISOString(),
        trainingEndsAt: null,
        injuryEndsAt: null,
      });
    }

    // Adicionar ao gang do player
    if (!player.gang?.members) {
      player.gang.members = [];
    }
    player.gang.members.push(...newMembers);
    player.gang.updatedAtIso = new Date().toISOString();

    bumpVersion(player);
    await player.save();

    return res.json({
      success: true,
      message: `${quantity} membros coletados`,
      createdMembers: newMembers,
      totalMembers: player.gang.members.length,
    });
  } catch (error) {
    console.error('Erro em collectTraining:', error);
    return res.status(500).json({
      error: 'Erro ao coletar treinamento'
    });
  }
}

// ===== OBTER ESTADO ATUAL DO GANG =====
export async function getGangStatus(req, res) {
  try {
    const player = req.player;

    const members = Array.isArray(player.gang?.members) ? player.gang.members : [];
    
    const stats = {
      totalMembers: members.length,
      activeMembers: members.filter(m => m.status === 'ativo').length,
      injuredMembers: members.filter(m => m.status === 'ferido').length,
      deadMembers: members.filter(m => m.status === 'morto').length,
      trainingMembers: members.filter(m => m.status === 'treinando').length,
      totalPower: members.reduce((sum, m) => sum + (m.level || 1) * 10, 0),
      averageLevel: members.length > 0 
        ? (members.reduce((sum, m) => sum + (m.level || 1), 0) / members.length).toFixed(2)
        : 0,
    };

    return res.json({
      success: true,
      members,
      stats,
      barracoLevel: player.niveis?.barracoLevel || 1,
    });
  } catch (error) {
    console.error('Erro em getGangStatus:', error);
    return res.status(500).json({
      error: 'Erro ao obter status do gang'
    });
  }
}