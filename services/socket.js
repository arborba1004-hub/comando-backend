import { Server } from 'socket.io';

let io;

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
    },
  });

  io.on('connection', (socket) => {
    console.log('Player conectado:', socket.id);

    socket.on('move', (data) => {
      socket.broadcast.emit('playerMoved', data);
    });

    socket.on('disconnect', () => {
      console.log('Player saiu:', socket.id);
    });
  });
}