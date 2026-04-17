import mongoose from 'mongoose';

/**
 * COMMANDIA — GangWar Model (Refatorado)
 * 
 * Novo sistema com:
 * - 8 tipos de membros com atributos (Rajada, Blindagem, Fôlego, Quebra)
 * - Sistema de camadas (layer 1-8)
 * - Talento BONDE
 * - Hospital capacity dinâmica
 * - Compatibilidade com dados antigos
 */

const gangUnitSchema = new mongoose.Schema(
  {
    // ID único
    id: { type: String, required: true },

    // Tipo e nível
    type: {
      type: String,
      required: true,
      enum: [
        'muralha',     // Tanque (camada 1)
        'motorista',   // Defesa secundária (camada 2)
        'frente',      // Ataque pesado (camada 3)
        'nitro',       // Melee rápido + BONDE (camada 4)
        'capanga',     // Ranged curto + BONDE (camada 5)
        'wifi',        // Ranged médio (camada 6)
        'certeiro',    // Ranged longo (camada 7)
        'executor',    // Retaguarda (camada 8)
        // Manter compatibilidade com tipos antigos (non-canonical)
        'assassino',
        'armeiro',
        'informante',
        'medico',
        'lavador',
        'ladrao',
        'negociador',
      ],
      index: true,
    },

    // Atributos base (calculados a partir de level + investimentos)
    level: { type: Number, required: true, min: 1, max: 10, default: 1 },

    // Os 5 atributos de combate (Rajada, Blindagem, Fôlego, Quebra)
    rajada: { type: Number, default: 0, min: 0 },      // Dano bruto
    blindagem: { type: Number, default: 0, min: 0 },   // Reduz dano recebido
    folego: { type: Number, default: 0, min: 0 },      // HP
    quebra: { type: Number, default: 1, min: 1 },      // Multiplicador de dano

    // Metadata do tipo
    layer: { type: Number, default: 1, min: 1, max: 8 },  // Camada (1-8)
    talent: { type: String, default: '' },  // Talento especial (COLETE, BONDE, etc)
    hasBonde: { type: Boolean, default: false },  // Se tem talento BONDE (Nitro, Capanga)
    range: { type: Number, default: 1, min: 1 },  // Range de ataque

    // Status em combate
    status: {
      type: String,
      required: true,
      enum: ['ativo', 'ferido', 'morto', 'treinando'],
      default: 'ativo',
      index: true,
    },

    // Datas
    recruitedAt: { type: Date, required: true },
    trainingEndsAt: { type: Date, default: null },
    injuryEndsAt: { type: Date, default: null },  // Quando se recupera de ferimentos
    lastBattleAt: { type: Date, default: null },

    // Histórico de dano recebido em combate (para cálculo de ferido vs morto)
    lastDamageReceived: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const gangTrainingJobSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    memberId: { type: String, required: true },
    memberType: { type: String, required: true },

    fromLevel: { type: Number, required: true, min: 1, max: 9 },
    toLevel: { type: Number, required: true, min: 2, max: 10 },

    // Custo de treinamento
    costDirtyMoney: { type: Number, required: true, min: 0 },

    // Timeline
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    completed: { type: Boolean, default: false },

    // Bônus de investimento aplicado
    trainingSpeedBonus: { type: Number, default: 1 }, // Multiplicador
  },
  { _id: false }
);

const gangWarSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      unique: true,
      index: true,
    },

    // Command Tower (Centro de Treinamento)
    ct: {
      level: { type: Number, required: true, default: 1, min: 1, max: 10 },
      maxLevel: { type: Number, required: true, default: 10 },
      trainingSlots: { type: Number, required: true, default: 1, min: 1 },
      recoveryBonusPercent: { type: Number, required: true, default: 0 },
      trainingSpeedBonusPercent: { type: Number, required: true, default: 0 },
      gangCapacityBonus: { type: Number, required: true, default: 0 },
    },

    // Hospital (capacidade de feridos)
    hospital: {
      capacity: { type: Number, default: 1000, min: 0 },     // Máximo de feridos
      currentWounded: { type: Number, default: 0, min: 0 },  // Feridos agora
      investmentCapacityBonus: { type: Number, default: 0 }, // De expansão_hospital
      recoverySpeedBonus: { type: Number, default: 0 },      // De recuperacao_rapida (%)
      lastMaintenanceDate: { type: Date, default: null },
    },

    // Membros da gangue
    members: [gangUnitSchema],

    // Treinamentos em andamento
    trainingJobs: [gangTrainingJobSchema],

    // Formação de combate (1 das 5)
    formation: {
      type: String,
      enum: ['pressao_total', 'linha_fechada', 'bote_certo', 'cerco', 'saque_rapido'],
      default: 'pressao_total',
      index: true,
    },

    // Última manutenção de feridos (quando última recuperação foi processada)
    lastMaintenanceDate: { type: Date, default: null },

    // Versão para migração de dados
    version: { type: Number, default: 2, min: 1 },
  },
  {
    timestamps: true,
    collection: 'gangwars',
    versionKey: false,
  }
);

// === ÍNDICES PARA PERFORMANCE ===
gangWarSchema.index({ 'members.status': 1 });
gangWarSchema.index({ 'members.layer': 1 });
gangWarSchema.index({ 'members.hasBonde': 1 });
gangWarSchema.index({ 'trainingJobs.endsAt': 1, 'trainingJobs.completed': 1 });
gangWarSchema.index({ 'ct.level': 1 });
gangWarSchema.index({ 'hospital.currentWounded': 1 });

// === VIRTUALS ÚTEIS ===

/**
 * Contar membros ativos (pronto para combate)
 */
gangWarSchema.virtual('activeMembersCount').get(function () {
  return this.members.filter(m => m.status === 'ativo').length;
});

/**
 * Contar membros feridos (recuperando)
 */
gangWarSchema.virtual('woundedMembersCount').get(function () {
  return this.members.filter(m => m.status === 'ferido').length;
});

/**
 * Contar membros mortos (permanentemente removidos)
 */
gangWarSchema.virtual('deadMembersCount').get(function () {
  return this.members.filter(m => m.status === 'morto').length;
});

/**
 * Total de membros (ativos + feridos)
 */
gangWarSchema.virtual('totalMembersCount').get(function () {
  return this.members.filter(m => m.status !== 'morto').length;
});

/**
 * Slots de treinamento disponíveis
 */
gangWarSchema.virtual('availableSlots').get(function () {
  const activeJobs = this.trainingJobs.filter(j => !j.completed).length;
  return Math.max(0, this.ct.trainingSlots - activeJobs);
});

/**
 * Hospital está cheio?
 */
gangWarSchema.virtual('hospitalFull').get(function () {
  return this.hospital.currentWounded >= this.hospital.capacity;
});

/**
 * Capacidade disponível no hospital
 */
gangWarSchema.virtual('hospitalAvailableCapacity').get(function () {
  return Math.max(0, this.hospital.capacity - this.hospital.currentWounded);
});

/**
 * Percentual de ocupação do hospital
 */
gangWarSchema.virtual('hospitalOccupancyPercent').get(function () {
  return this.hospital.capacity > 0
    ? Math.round((this.hospital.currentWounded / this.hospital.capacity) * 100)
    : 0;
});

/**
 * Contar membros por tipo
 */
gangWarSchema.methods.getMembersByType = function (type) {
  return this.members.filter(m => m.type === type && m.status !== 'morto');
};

/**
 * Contar membros ativos por tipo
 */
gangWarSchema.methods.getActiveMembersByType = function (type) {
  return this.members.filter(m => m.type === type && m.status === 'ativo');
};

/**
 * Contar membros com BONDE (Nitro + Capanga)
 */
gangWarSchema.methods.getBondeMembersCount = function () {
  return this.members.filter(m => m.hasBonde && m.status === 'ativo').length;
};

/**
 * Obter formação atual com seus modificadores
 */
gangWarSchema.methods.getFormationDetails = function () {
  const formationKey = this.formation || 'bote_certo';
  // Sera retornado pelo controller usando utils/formations.js
  return formationKey;
};

/**
 * Verificar se tem slots de treinamento disponíveis
 */
gangWarSchema.methods.hasAvailableTrainingSlots = function () {
  return this.availableSlots > 0;
};

/**
 * Recalcular stats de todos os membros (quando investimentos mudam)
 */
gangWarSchema.methods.recalculateMemberStats = function (investmentBonuses = {}) {
  // Será chamado por um controller util que importa gangMemberTypes.js
  // Isso permite refresh de stats quando investimentos são upgradados
  this.markModified('members');
};

const GangWar = mongoose.models.GangWar || mongoose.model('GangWar', gangWarSchema);

export default GangWar;
