const LOBBY_CODE_CHARACTER_SET = 'ABCDEFGHJKMNPQRSTUVWXYZ123456789';
class GameSession {
  constructor() {
    this.id = [...new Array(6)].map(() => LOBBY_CODE_CHARACTER_SET[Math.floor(Math.random() * LOBBY_CODE_CHARACTER_SET.length)]).join('');
    this.clients = [];
    this.pokemon = [];
    this.badges = [];
    this.keyItems = [];
    this.wallet = { currencies: [] };
    this.statistics = {};
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
  
  addSaveData(ws, data) {
    const username = this.getUsername(ws);

    // Handle wallet data
    const wallet = data.wallet;
    this.wallet.currencies = wallet.currencies.map((v, i) => (this.wallet.currencies[i] || 0) + v);

    // Handle statistics data
    Object.entries(data.statistics).forEach(([key, value]) => {
      if (typeof value == 'number') {
        if (!this.statistics[key]) this.statistics[key] = 0;
        this.statistics[key] += value;
        return;
      }
      // Array
      if (value.constructor.name == 'Array') {
        if (!this.statistics[key]) this.statistics[key] = [];
        value.forEach((v, k) => {
          if (!this.statistics[key][k]) this.statistics[key][k] = 0;
          this.statistics[key][k] += v;
        })
        return;
      }
      // Object
      if (value.constructor.name == 'Object') {
        if (!this.statistics[key]) this.statistics[key] = {};
        if (key == 'routeKills') {
          Object.entries(value).forEach(([r, region]) => {
            if (!this.statistics[key][r]) this.statistics[key][r] = {};
            Object.entries(region).forEach(([k, v]) => {
              if (!this.statistics[key][r][k]) this.statistics[key][r][k] = 0;
              this.statistics[key][r][k] += v;
            });
          });
          return;
        }
        Object.entries(value).forEach(([k, v]) => {
          if (!this.statistics[key][k]) this.statistics[key][k] = 0;
          this.statistics[key][k] += v;
        });
        return;
      }
    });

    this.broadcast('saveTick', { 
      username,
      wallet: wallet,
      statistics: data.statistics,
    }, ws);

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