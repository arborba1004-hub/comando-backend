import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getOrCreateGangWar,
  handleApplyBattleLosses,
  handleCompleteTraining,
  handlePayMaintenance,
  handleQueueTraining,
  handleRecruitMember,
  handleSetFormation,
  handleStartTraining,
  handleUpgradeCT,
  serializeGang,
} from '../services/gangWarService.js';

const router = express.Router();

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const doc = await getOrCreateGangWar(req.player._id);
    return res.json(serializeGang(doc, req.player));
  } catch (error) {
    console.error('Erro em /gang-war/me:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao carregar gangue' });
  }
});

router.post('/recruit', authMiddleware, async (req, res) => {
  try {
    const { type } = req.body || {};
    const payload = await handleRecruitMember(req.player, String(type || ''));
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/recruit:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao recrutar membro' });
  }
});

router.post('/train/queue', authMiddleware, async (req, res) => {
  try {
    const { type, quantity } = req.body || {};
    const payload = await handleQueueTraining(req.player, String(type || ''), Number(quantity || 0));
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/train/queue:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao enfileirar treino' });
  }
});

router.post('/train/start', authMiddleware, async (req, res) => {
  try {
    const { memberId } = req.body || {};
    const payload = await handleStartTraining(req.player, String(memberId || ''));
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/train/start:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao iniciar treino' });
  }
});

router.post('/train/complete', authMiddleware, async (req, res) => {
  try {
    const payload = await handleCompleteTraining(req.player);
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/train/complete:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao concluir treinos' });
  }
});

router.post('/ct/upgrade', authMiddleware, async (req, res) => {
  try {
    const payload = await handleUpgradeCT(req.player);
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/ct/upgrade:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao evoluir CT' });
  }
});

router.post('/maintenance/pay', authMiddleware, async (req, res) => {
  try {
    const payload = await handlePayMaintenance(req.player);
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/maintenance/pay:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao pagar manutenção' });
  }
});

router.post('/formation/set', authMiddleware, async (req, res) => {
  try {
    const { formation } = req.body || {};
    const payload = await handleSetFormation(req.player, String(formation || ''));
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/formation/set:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao alterar formação' });
  }
});

router.post('/apply-battle-losses', authMiddleware, async (req, res) => {
  try {
    const { losses } = req.body || {};
    const payload = await handleApplyBattleLosses(req.player, losses || {});
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/apply-battle-losses:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao aplicar perdas' });
  }
});

export default router;
