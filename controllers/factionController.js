const Faction = require('../models/Faction');
const Player = require('../models/Player');

exports.getMyFaction = async (req, res) => {
  try {
    const player = await Player.findById(req.user.id);
    if (!player.factionId) return res.json({ faction: null });
    const faction = await Faction.findById(player.factionId);
    res.json({ faction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createFaction = async (req, res) => {
  try {
    const { name, tag, description, minPowerToJoin, maxMembers } = req.body;
    const player = await Player.findById(req.user.id);
    if (player.factionId) return res.status(400).json({ error: 'Already in faction' });

    const existing = await Faction.findOne({ $or: [{ name }, { tag }] });
    if (existing) return res.status(400).json({ error: 'Name or tag taken' });

    const newFaction = new Faction({
      name,
      tag: tag.toUpperCase().slice(0,5),
      leaderId: req.user.id,
      description,
      minPowerToJoin: minPowerToJoin || 0,
      maxMembers: maxMembers || 20,
      members: [{
        playerId: req.user.id,
        name: player.name,
        power: player.power,
        role: 'leader',
        joinedAt: new Date(),
      }],
    });
    await newFaction.save();

    player.factionId = newFaction._id;
    await player.save();

    res.status(201).json({ faction: newFaction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.invitePlayer = async (req, res) => {
  try {
    const { invitedPlayerId, invitedPlayerName } = req.body;
    const faction = await Faction.findOne({ leaderId: req.user.id });
    if (!faction) return res.status(403).json({ error: 'Only leader can invite' });
    if (faction.members.length >= faction.maxMembers) return res.status(400).json({ error: 'Faction full' });

    const invite = {
      id: Math.random().toString(36).substr(2, 9),
      factionId: faction._id,
      factionName: faction.name,
      factionTag: faction.tag,
      invitedPlayerId,
      invitedPlayerName,
      invitedByPlayerId: req.user.id,
      invitedByPlayerName: (await Player.findById(req.user.id)).name,
      createdAt: new Date(),
    };
    faction.invites.push(invite);
    await faction.save();
    res.json({ invite });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.acceptInvite = async (req, res) => {
  try {
    const { inviteId } = req.body;
    const faction = await Faction.findOne({ 'invites.id': inviteId });
    if (!faction) return res.status(404).json({ error: 'Invite not found' });

    const invite = faction.invites.find(i => i.id === inviteId);
    if (invite.invitedPlayerId !== req.user.id) return res.status(403).json({ error: 'Not your invite' });
    if (faction.members.length >= faction.maxMembers) return res.status(400).json({ error: 'Faction full' });

    const player = await Player.findById(req.user.id);
    faction.members.push({
      playerId: req.user.id,
      name: player.name,
      power: player.power,
      role: 'member',
      joinedAt: new Date(),
    });
    faction.invites = faction.invites.filter(i => i.id !== inviteId);
    await faction.save();

    player.factionId = faction._id;
    await player.save();

    res.json({ faction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Adicione mais: leaveFaction, kickMember, promoteMember, etc.