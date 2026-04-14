import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
  getOrCreateGangWar,
  handleApplyBattleLosses,
  handleCompleteTraining,
  handlePayMaintenance,
  handleRecruitMember,
  handleStartTraining,
  handleUpgradeCT,
  serializeGang,
} from '../services/gangWarService.js';

const router = express.Router();

router.get('/gang-war/me', authMiddleware, async (req, res) => {
  try {
    const doc = await getOrCreateGangWar(req.player._id);
    return res.json(serializeGang(doc, req.player));
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao carregar gangue',
    });
  }
});

router.post('/gang-war/recruit', authMiddleware, async (req, res) => {
  try {
    const { type } = req.body || {};
    const payload = await handleRecruitMember(req.player, String(type || ''));
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao recrutar membro',
    });
  }
});

router.post('/gang-war/train/start', authMiddleware, async (req, res) => {
  try {
    const { memberId } = req.body || {};
    const payload = await handleStartTraining(req.player, String(memberId || ''));
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao iniciar treino',
    });
  }
});

router.post('/gang-war/train/complete', authMiddleware, async (req, res) => {
  try {
    const payload = await handleCompleteTraining(req.player);
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao concluir treino',
    });
  }
});

router.post('/gang-war/ct/upgrade', authMiddleware, async (req, res) => {
  try {
    const payload = await handleUpgradeCT(req.player);
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao evoluir CT',
    });
  }
});

router.post('/gang-war/maintenance/pay', authMiddleware, async (req, res) => {
  try {
    const payload = await handlePayMaintenance(req.player);
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao pagar manutenção',
    });
  }
});

router.post('/gang-war/apply-battle-losses', authMiddleware, async (req, res) => {
  try {
    const { losses } = req.body || {};
    const payload = await handleApplyBattleLosses(req.player, losses || {});
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao aplicar perdas',
    });
  }
});

export default router;