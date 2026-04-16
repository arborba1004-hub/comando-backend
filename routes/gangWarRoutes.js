import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getOrCreateGangWar,
  handleApplyBattleLosses,
  handleCompleteTraining,
  handlePayMaintenance,
  handleRecruitMember,
  handleSetFormation,
  handleStartTraining,
  handleUpgradeCT,
  serializeGang,
} from '../services/gangWarService.js';

const router = express.Router();

// GET /gang-war/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const doc = await getOrCreateGangWar(req.player._id);
    return res.json(serializeGang(doc, req.player));
  } catch (error) {
    console.error('Erro em /gang-war/me:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao carregar gangue',
    });
  }
});

// POST /gang-war/recruit
router.post('/recruit', authMiddleware, async (req, res) => {
  try {
    const { type } = req.body || {};
    const payload = await handleRecruitMember(req.player, String(type || ''));
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/recruit:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao recrutar membro',
    });
  }
});

// POST /gang-war/train/start
router.post('/train/start', authMiddleware, async (req, res) => {
  try {
    const { memberId } = req.body || {};
    const payload = await handleStartTraining(req.player, String(memberId || ''));
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/train/start:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao iniciar treino',
    });
  }
});

// POST /gang-war/train/complete
router.post('/train/complete', authMiddleware, async (req, res) => {
  try {
    const payload = await handleCompleteTraining(req.player);
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/train/complete:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao concluir treino',
    });
  }
});

// POST /gang-war/ct/upgrade
router.post('/ct/upgrade', authMiddleware, async (req, res) => {
  try {
    const payload = await handleUpgradeCT(req.player);
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/ct/upgrade:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao evoluir CT',
    });
  }
});

// POST /gang-war/maintenance/pay
router.post('/maintenance/pay', authMiddleware, async (req, res) => {
  try {
    const payload = await handlePayMaintenance(req.player);
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/maintenance/pay:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao pagar manutenção',
    });
  }
});

// POST /gang-war/formation/set
router.post('/formation/set', authMiddleware, async (req, res) => {
  try {
    const { formation } = req.body || {};
    const payload = await handleSetFormation(req.player, String(formation || ''));
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/formation/set:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao alterar formação',
    });
  }
});

// POST /gang-war/apply-battle-losses
router.post('/apply-battle-losses', authMiddleware, async (req, res) => {
  try {
    const { losses } = req.body || {};
    const payload = await handleApplyBattleLosses(req.player, losses || {});
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /gang-war/apply-battle-losses:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao aplicar perdas',
    });
  }
});

export default router;