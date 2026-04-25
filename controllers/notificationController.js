import { emitToPlayer } from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';
export async function getNotifications(req, res) {
  try {
    const player = req.player;
    return res.json({
      notifications: player.notifications || [],
    });
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
    return res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
}

export async function getAttackNotifications(req, res) {
  try {
    const player = req.player;
    const notifications = (player.notifications || []).filter((n) =>
      ['attack_received', 'attack_success', 'attack_failed'].includes(n.type)
    );

    return res.json({
      notifications,
    });
  } catch (error) {
    console.error('Erro ao buscar notificações de ataque:', error);
    return res.status(500).json({ error: 'Erro ao buscar notificações de ataque' });
  }
}

export async function markNotificationAsRead(req, res) {
  try {
    const player = req.player;
    const { id } = req.params;

    const notification = (player.notifications || []).find((n) => n.id === id);

    if (!notification) {
      return res.status(404).json({ error: 'Notificação não encontrada' });
    }

    notification.read = true;
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar notificação:', error);
    return res.status(500).json({ error: 'Erro ao marcar notificação' });
  }
}