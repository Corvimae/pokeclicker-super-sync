var express = require('express');
const { GameSession } = require('./gameSession');

const ROOM_EXPIRY_CHECK_MS = 1000 * 60 * 10; // 10 minutes
const ROOM_EXPIRY_TIMEOUT_MS = 1000 * 60 * 60 * 8; // 8 hours

var app = express();

require('express-ws')(app);

const rooms = {};

setInterval(() => {
  console.log(`Checking ${Object.keys(rooms).length} room(s) for inactivity...`);
  for (let room of Object.values(rooms)) {
    if (new Date().getTime() - room.lastUpdate.getTime() >= ROOM_EXPIRY_TIMEOUT_MS) {
      console.log(`Closing room due to inactivity: ${room.id}.`);

      room.clients.forEach(client => client.terminate());

      delete rooms[room.id];
    }
  }
}, ROOM_EXPIRY_CHECK_MS);

app.get('/', (req, res) => {
  res.json('This is Pokeclicker Super Sync.');
});

app.get('/session/new', (req, res) => {
  const newRoom = new GameSession();
  
  rooms[newRoom.id] = newRoom;

  res.json(newRoom);
});

function sendMessage(ws, event, payload = {}) {
  ws?.send(JSON.stringify({ event, payload }));
}

function sendAlert(ws, message, title, options = {}) {
  sendMessage(ws, 'alert', { message, title, ...options });
}

function sendError(ws, message, options = {}) {
  sendMessage(ws, 'alert', { message, type: 'danger', ...options }); // todo styling.

}

function usingRoom(ws, callback) {
  const room = Object.values(rooms).find(room => room.clients.find(({ socket }) => socket === ws) !== undefined);

  if (room) {
    callback(room)
  } else {
    sendError('Game session does not exist.');
  }
}

app.ws('/', ws => {
  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      switch (data.event) {
        case 'join': {
          const room = rooms[data.payload.code];

          if (room) {
            room.broadcastAlert(`${data.payload.username} has joined the super sync session.`, 'Player joined');

            room.addClient(ws, data.payload.username);

            sendAlert(ws, `Joined the super sync session (Sync code: ${data.payload.code}).`, 'Session joined')    
            sendMessage(ws, 'initialSync', Object.entries(room).reduce((acc, [key, value]) => (
              key === 'clients' ? acc : { ...acc, [key]: value }
            ), {}))
          } else {
            sendError('Game session does not exist.');
          }

          break;
        }

        case 'catch':
          usingRoom(ws, room => {
            room.addCatch(ws, data.payload.id, data.payload.shiny);
          });

          break;

        case 'badge':
          usingRoom(ws, room => {
            room.addBadge(ws, data.payload.badge);
          });

          break;
        default:
          console.log(`Unexpected event type on socket: ${data.event}.`);
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    usingRoom(ws, room => {
      room.broadcastAlert(`${room.getUsername(ws)} has left the super sync session.`, 'Player left');

      room.removeClient(ws);
    });
  });

  // ws.send(`New connection established from ${ws.`);
});

app.listen(3000);