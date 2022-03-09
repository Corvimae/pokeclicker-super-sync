const LOBBY_CODE_CHARACTER_SET = 'ABCDEFGHJKMNPQRSTUVWXYZ123456789';
class GameSession {
  constructor() {
    this.id = [...new Array(6)].map(() => LOBBY_CODE_CHARACTER_SET[Math.floor(Math.random() * LOBBY_CODE_CHARACTER_SET.length)]).join('');
    this.clients = [];
    this.pokemon = [];
    this.badges = [];
    this.keyItems = [];
    this.lastUpdate = new Date();
  }

  addClient(socket, username) {
    this.clients.push({ socket, username });

    this.refreshLastUpdate();
  }
  
  removeClient(ws) {
    this.clients = this.clients.filter(({ socket }) => socket !== ws);
  }

  broadcast(event, payload = {}, exclude = null) {
    this.clients.forEach(({ socket }) => {
      if (socket === exclude) return;
      
      socket.send(JSON.stringify({ event, payload }));
    });
  }

  broadcastAlert(message, title, options = {}, exclude = null) {
    this.broadcast('alert', { message, title, ...options }, exclude);
  }

  getUsername(ws) {
    return this.clients.find(({ socket }) => socket === ws)?.username ?? null;
  }
  
  getSessionMembers(exclude) {
    return this.clients.filter(({ socket }) => socket !== exclude).map(client => client.username);
  }

  addCatch(ws, id, shiny) {
    const existingRecord = this.pokemon.find(record => record.id === id);

    if (existingRecord && shiny) {
      existingRecord.shiny = true;
    } else if (!existingRecord) {
      this.pokemon.push({ id, shiny });
    }
    
    this.broadcast('catch', { 
      username: this.getUsername(ws),
      id,
      shiny,
    }, ws);
    
    this.refreshLastUpdate();
  }
  
  addBadge(ws, badge) {
    if (this.badges.indexOf(badge) === -1) {
      this.badges.push(badge);

      this.broadcast('badge', { 
        username: this.getUsername(ws),
        badge
      }, ws);
    }

    this.refreshLastUpdate();
  }
  
  addKeyItem(ws, keyItem) {
    if (this.keyItems.indexOf(keyItem) === -1) {
      this.keyItems.push(keyItem);

      this.broadcast('keyItem', { 
        username: this.getUsername(ws),
        keyItem
      }, ws);
    }

    this.refreshLastUpdate();
  }
  
  refreshLastUpdate() {
    this.lastUpdate = new Date();
  }
}

module.exports = {
  GameSession
};