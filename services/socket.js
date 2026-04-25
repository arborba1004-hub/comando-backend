import { Server } from 'socket.io';

let io;

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
    },
  });

  io.on('connection', (socket) => {
  console.log('🟢 conectou');

  socket.on('move', (data) => {
    console.log('📡 chegou no backend:', data);

    io.emit('playerMoved', {
      playerId: data.playerId, // 🔥 IMPORTANTE
      tileX: data.tileX,
      tileY: data.tileY,
    });
  });
});