import mongoose from 'mongoose';

const routeTileSchema = new mongoose.Schema(
  {
    tileX: { type: Number, required: true, min: 0, max: 119 },
    tileY: { type: Number, required: true, min: 0, max: 119 },
  },
  { _id: false }
);

const azideiaMissionSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true, index: true },
    playerName: { type: String, default: 'Jogador' },
    factionId: { type: String, default: null, index: true },

    targetId: { type: String, required: true, index: true },
    targetType: { type: String, enum: ['x9', 'correria', 'mestre_obras'], default: 'x9', index: true },
    targetName: { type: String, default: 'X9' },
    targetModelUrl: { type: String, default: '' },
    targetTileX: { type: Number, required: true, min: 0, max: 119 },
    targetTileY: { type: Number, required: true, min: 0, max: 119 },

    originTileX: { type: Number, required: true, min: 0, max: 119 },
    originTileY: { type: Number, required: true, min: 0, max: 119 },

    routeTiles: { type: [routeTileSchema], default: [] },
    returnRouteTiles: { type: [routeTileSchema], default: [] },
    travelDurationMs: { type: Number, default: 0, min: 0 },
    returnDurationMs: { type: Number, default: 0, min: 0 },

    costDirtyMoney: { type: Number, default: 0, min: 0 },
    rewardType: { type: String, enum: ['convoy_2x', 'corre', 'barraco_time'], default: 'convoy_2x' },
    rewardQuantity: { type: Number, default: 1, min: 0 },

    selectedGangMemberId: { type: String, default: null },

    status: {
      type: String,
      enum: ['travelling', 'returning', 'completed', 'cancelled'],
      default: 'travelling',
      index: true,
    },

    launchedAtIso: { type: String, default: () => new Date().toISOString() },
    arriveAtIso: { type: String, required: true, index: true },
    arrivedAtIso: { type: String, default: null },
    returnAtIso: { type: String, required: true, index: true },
    completedAtIso: { type: String, default: null },
    // Legado: mantido para não quebrar missões antigas.
    rewardGrantedAtIso: { type: String, default: null },
    // Controle separado para tornar a recompensa idempotente e recuperável.
    individualRewardGrantedAtIso: { type: String, default: null },
    factionRewardGrantedAtIso: { type: String, default: null },
    factionRewardSkippedAtIso: { type: String, default: null },
    factionRewardLastError: { type: String, default: null },
    factionRewardRetryCount: { type: Number, default: 0, min: 0 },
    factionRewardBatchId: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

azideiaMissionSchema.index({ playerId: 1, status: 1 });
azideiaMissionSchema.index({ targetId: 1, status: 1 });

export default mongoose.models.AzideiaMission || mongoose.model('AzideiaMission', azideiaMissionSchema);
