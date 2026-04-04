const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  // existing fields
  lastSpinAt: { type: Date },
  mapPosition: {
    tileX: { type: Number, default: 10 },
    tileY: { type: Number, default: 5 },
    worldX: { type: Number, default: 10 },
    worldY: { type: Number, default: 5 },
  },
});

module.exports = mongoose.model('Player', playerSchema);