import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  buyFugaCatalogAccessory,
  buyFugaVehicle,
  buyFugaVehicleUpgrade,
} from '../controllers/fugaController.js';

const router = Router();

// Garagem da Fuga AAA: compra principal autoritativa.
router.post('/buy', authMiddleware, buyFugaVehicle);

// Compatibilidade com o sistema anterior. Mantém o deploy vivo caso algum
// bundle antigo ainda chame essas rotas, mas força o jogador para a nova garagem.
router.post('/accessory/buy', authMiddleware, buyFugaCatalogAccessory);
router.post('/vehicle-upgrade/buy', authMiddleware, buyFugaVehicleUpgrade);

export default router;
