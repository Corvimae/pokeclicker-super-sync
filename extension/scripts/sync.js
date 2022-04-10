console.log('Pokeclicker Super Sync enabled.');

const DEBUG = false;

(() => {
  const syncCode = { current: '' };
  const playerName = { current: '' };
  const _statistics = {};

  if (!document.querySelector('.sync-code-input')) {
    const wrapper = document.createElement('div');

    wrapper.classList.add('col-12', 'justify-content-center', 'align-items-center', 'd-flex');

    const startButton = [...document.querySelectorAll('.btn.btn-success')].find(x => x.textContent == 'New Save');
    const joinSessionButton = startButton.cloneNode();

    joinSessionButton.classList.add('disabled');
    
    const syncCodeInput = document.createElement('input');

    syncCodeInput.setAttribute('placeholder', 'Online Sync Code');
    syncCodeInput.classList.add('sync-code-input');

    syncCodeInput.addEventListener('keyup', event => {
      syncCode.current = event.target.value;

      if (syncCode.current.length === 6) {
        joinSessionButton.classList.remove('disabled');
      } else {
        joinSessionButton.classList.add('disabled');
      }
    });
            
    const playerNameInput = document.createElement('input');

    playerNameInput.setAttribute('placeholder', 'Username');

    playerNameInput.addEventListener('keyup', event => {
      playerName.current = event.target.value;
    });

    const requestCodeInput = document.createElement('label');
    
    requestCodeInput.classList.add('btn', 'btn-success', 'col-md-4', 'col-xs-12', 'mx-1');

    requestCodeInput.addEventListener('click', () => {
      syncCodeInput.value = 'Requesting sync code...';

      fetch(`${DEBUG ? 'http://localhost:3000' : 'https://pokeclicker-super-sync.maybreak.com'}/session/new`)
        .then(response => response.json())
        .then(data => {
          syncCode.current = data.id;
          syncCodeInput.value = data.id;

          joinSessionButton.classList.remove('disabled');
        });
    });

    requestCodeInput.textContent = 'Create new session'

    wrapper.appendChild(syncCodeInput);
    wrapper.appendChild(playerNameInput);
    wrapper.appendChild(requestCodeInput);

    joinSessionButton.textContent = 'Join Session';

    joinSessionButton.onclick = () => {
      startButton.click();

      const scriptElement = document.createElement('script');

      scriptElement.textContent = `const SUPER_SYNC_DEBUG = ${DEBUG ? 'true' : 'false'}; const SYNC_CODE = '${syncCode.current}'; const PLAYER_NAME = '${playerName.current || 'A player'}'; (${(() => {
        if (SUPER_SYNC_DEBUG) {
          window.grantDebugResources = () => {
            [...new Array(25)].map((k, i) => App.game.party.gainPokemonById(i + 151));
            App.game.wallet.gainMoney(100000);
            App.game.wallet.gainDungeonTokens(100000);
          };
        }
        
        const waitInterval = { current: null };

        waitInterval.current = setInterval(() => {
          if (App.game) {
            console.log('Super sync hooks injected.');
            clearInterval(waitInterval.current);

            console.log('Session joined!');
            
            const ws = { current: null };
            const heartbeatIntervalId = { current: null };
            const isConnected = { current: false };
            const isAttemptingConnection = { current: false };
            const hasInjected = { current: false };
            // Update our statistics object now that the game has loaded
            _statistics = App.game.statistics.toJSON();

            function sendMessage(event, payload = {}) {
              if (isConnected.current) ws.current.send(JSON.stringify({ event, payload: { code: SYNC_CODE, ...payload } }));
            }

            function handleSocketOpen() {
              isConnected.current = true;
              isAttemptingConnection.current = false;

              window.Notifier.notify({
                message: `Connected to Pokeclicker Super Sync server, attempting to join session...`,
              });
              
              sendMessage('join', { username: PLAYER_NAME });

              console.log('Connected to sync server.'); 

              heartbeatIntervalId.current = setInterval(() => sendMessage('heartbeat'), 1000);

              // Wait for game to finish setting up then hook into gameplay methods.
              function injectMethodBefore(object, method, callback) {
                const original = object[method].bind(object);
                
                object[method] = (...arguments) => {
                  callback(...arguments);
                  original(...arguments);
                };
              }

              function injectMethodAfter(object, method, callback) {
                const original = object[method].bind(object);
                
                object[method] = (...arguments) => {
                  original(...arguments);
                  callback(...arguments);
                };
              }

              if (!hasInjected.current) {
                hasInjected.current = true;

                injectMethodBefore(App.game.party, 'gainPokemonById', (id, shiny) => {
                  if (!App.game.party.alreadyCaughtPokemon(id, shiny)) {
                    sendMessage('catch', {
                      id,
                      shiny
                    });
                  }
                });  

                injectMethodBefore(App.game.badgeCase, 'gainBadge', badge => {
                  if (!App.game.badgeCase.hasBadge(badge)) {
                    sendMessage('badge', { badge });
                  }
                });

                injectMethodBefore(App.game.keyItems, 'gainKeyItem', keyItem => {
                  if (!App.game.keyItems.hasKeyItem(keyItem)) {
                    sendMessage('keyItem', { keyItem });
                  }
                });

                injectMethodBefore(Save, 'store', player => {
                  // only send the difference
                  // Handle statistics
                  const statistics = {};
                  const tempStatistics = App.game.statistics.toJSON();
                  Object.entries(tempStatistics).forEach(([key, value]) => {
                    if (typeof value === 'number') {
                      const val = value - _statistics[key];
                      // We don't want to bother sending values that haven't changed
                      if (!val) return;
                      statistics[key] = val;
                      return;
                    }
                    // Array
                    if (value.constructor.name === 'Array') {
                      value = value.map((v, i) => v - (_statistics[key][i] || 0));
                      // We don't want to bother sending values that haven't changed
                      const found = value.find(v => v != 0)
                      if (found) {
                        statistics[key] = value;
                      }
                      return;
                    }
                    // Object
                    if (value.constructor.name === 'Object') {
                      if (key === 'routeKills') {
                        Object.entries(value).forEach(([r, region]) => {
                          Object.entries(region).forEach(([k, v]) => {
                            const val = v - (_statistics[key][r][k] || 0)
                            // We don't want to bother sending values that haven't changed
                            if (!val) return;
                            if (!statistics[key]) statistics[key] = {};
                            if (!statistics[key][r]) statistics[key][r] = {};
                            statistics[key][r][k] = val;
                          });
                        });
                        return;
                      }
                      Object.entries(value).forEach(([k, v]) => {
                        const val = v - (_statistics[key]?.[k] || 0)
                        // We don't want to bother sending values that haven't changed
                        if (val) {
                          if (!statistics[key]) statistics[key] = {};
                          statistics[key][k] = val;
                        }
                      });
                      return;
                    }
                  });
                  _statistics = tempStatistics;

                  sendMessage('saveTick', { statistics });
                });
              }
            }

            function handleSocketClose() {
              isConnected.current = false;
              isAttemptingConnection.current = false;

              if (heartbeatIntervalId.current !== null) {
                clearInterval(heartbeatIntervalId.current);
                heartbeatIntervalId.current = null;
              }

              window.Notifier.notify({ 
                message: `Disconnected from Pokeclicker Super Sync! Gameplay will no longer be synchronized.`,
              });

              console.warn('Disconnected from sync server.');
            }
            
            function handleSocketMessage(message) {
              const data = JSON.parse(message.data);
  
              console.debug('[Sync event]', data);
              switch (data.event) {
                case 'alert':
                  window.Notifier.notify(data.payload);
                  break;

                case 'heartbeat-response':
                  break;

                case 'catch': {
                  const speciesData = PokemonHelper.getPokemonById(data.payload.id);

                  if (!App.game.party.alreadyCaughtPokemon(data.payload.id, data.payload.shiny)) {
                    if (data.payload.shiny) {
                      window.Notifier.notify({
                        message: `✨ ${data.payload.username} caught a shiny ${speciesData.name}! ✨`,
                        type: NotificationConstants.NotificationOption.warning,
                        sound: NotificationConstants.NotificationSound.new_catch,
                      })
                    } else {
                      window.Notifier.notify({
                        message: `${data.payload.username} captured ${GameHelper.anOrA(speciesData.name)} ${speciesData.name}!`,
                        type: NotificationConstants.NotificationOption.success,
                        sound: NotificationConstants.NotificationSound.new_catch,
                      });
                    }
                    App.game.party.gainPokemonById(data.payload.id, data.payload.shiny, true);
                  }

                  break;
                }

                case 'badge':
                  if (!App.game.badgeCase.hasBadge(data.payload.badge)) {
                    App.game.badgeCase.gainBadge(data.payload.badge);

                    window.Notifier.notify({
                      message: `${data.payload.username} obtained the ${BadgeEnums[data.payload.badge]} Badge!`,
                      type: NotificationConstants.NotificationOption.success
                    });
                  }
                  break;

                case 'keyItem':
                  if (!App.game.keyItems.hasKeyItem(data.payload.keyItem)) {
                    App.game.keyItems.gainKeyItem(data.payload.keyItem);

                    const itemName = GameConstants.humanifyString(KeyItems.KeyItem[data.payload.keyItem]);
                    
                    window.Notifier.notify({
                      message: `${data.payload.username} obtained the ${itemName}!`,
                      type: NotificationConstants.NotificationOption.success
                    });
                  }
                  break;

                case 'saveTick':
                  // Apply the differences

                  // Handle our statistics
                  Object.entries(data.payload.statistics).forEach(([key, value]) => {
                    if (typeof value == 'number') {
                      GameHelper.incrementObservable(App.game.statistics[key], value);
                      _statistics[key] += value;
                      return;
                    }
                    // Array
                    if (value.constructor.name == 'Array') {
                      value.forEach((v, k) => {
                        if (!v) return;
                        GameHelper.incrementObservable(App.game.statistics[key][k], v);
                        if (!_statistics[key][k]) _statistics[key][k] = 0;
                        _statistics[key][k] += value;
                      })
                      return;
                    }
                    // Object
                    if (value.constructor.name == 'Object') {
                      if (key == 'routeKills') {
                        Object.entries(value).forEach(([r, region]) => {
                          if (!_statistics[key][r]) _statistics[key][r] = {};
                          Object.entries(region).forEach(([k, v]) => {
                            if (!v) return;
                            GameHelper.incrementObservable(App.game.statistics[key][r][k], v);
                            if (!_statistics[key][r][k]) _statistics[key][r][k] = 0;
                            _statistics[key][r][k] += v;
                          });
                        });
                        return;
                      }
                      Object.entries(value).forEach(([k, v]) => {
                        if (!v) return;
                        GameHelper.incrementObservable(App.game.statistics[key][k], v);
                        if (!_statistics[key][k]) _statistics[key][k] = 0;
                        _statistics[key][k] += v;
                      });
                      return;
                    }
                  });

                  break;

                case 'initialSync':
                  data.payload.pokemon.forEach(({ id, shiny }) => {
                    if (!App.game.party.alreadyCaughtPokemon(id, shiny)) {
                      App.game.party.gainPokemonById(id, shiny, true);
                    }
                  });

                  data.payload.badges.forEach(badge => {
                    if (!App.game.badgeCase.hasBadge(badge)) {
                      App.game.badgeCase.gainBadge(badge)
                    }
                  });

                  data.payload.keyItems.forEach(keyItem => {
                    if (!App.game.keyItems.hasKeyItem(keyItem)) {
                      App.game.keyItems.gainKeyItem(keyItem)
                      if (keyItem == KeyItems.KeyItem.Dungeon_ticket) {
                        // We need to set a player starter, otherwise the player won't be able to continue, they can still select a starter though
                        player.starter(0);
                      }
                    }
                  });

                  // Handle our statistics
                  Object.entries(data.payload.statistics).forEach(([key, value]) => {
                    if (typeof value == 'number') {
                      GameHelper.incrementObservable(App.game.statistics[key], value);
                      if (!_statistics[key]) _statistics[key] = 0;
                      _statistics[key] += value;
                      return;
                    }
                    // Array
                    if (value.constructor.name == 'Array') {
                      if (!_statistics[key]) _statistics[key] = [];
                      value.forEach((v, k) => {
                        if (!v) return;
                        GameHelper.incrementObservable(App.game.statistics[key][k], v);
                        if (!_statistics[key][k]) _statistics[key][k] = 0;
                        _statistics[key][k] += value;
                      })
                      return;
                    }
                    // Object
                    if (value.constructor.name == 'Object') {
                      if (!_statistics[key]) _statistics[key] = {};
                      if (key == 'routeKills') {
                        Object.entries(value).forEach(([r, region]) => {
                          if (!_statistics[key][r]) _statistics[key][r] = {};
                          Object.entries(region).forEach(([k, v]) => {
                            if (!v) return;
                            GameHelper.incrementObservable(App.game.statistics[key][r][k], v);
                            if (!_statistics[key][r][k]) _statistics[key][r][k] = 0;
                            _statistics[key][r][k] += v;
                          });
                        });
                        return;
                      }
                      Object.entries(value).forEach(([k, v]) => {
                        if (!v) return;
                        GameHelper.incrementObservable(App.game.statistics[key][k], v);
                        if (!_statistics[key][k]) _statistics[key][k] = 0;
                        _statistics[key][k] += v;
                      });
                      return;
                    }
                  });
                  
                  window.Notifier.notify({
                    message: `- ${data.payload.pokemon.length} caught Pokemon\n - ${data.payload.badges.length} badges\n - ${data.payload.keyItems.length} key items`,
                    title: 'Synced:',
                    type: NotificationConstants.NotificationOption.success,
                    timeout: 15000
                  });

                  break;  
              }
            }

            function reconnect() {
              ws.current = new WebSocket(SUPER_SYNC_DEBUG ? `ws://localhost:3000/` : 'wss://pokeclicker-super-sync.maybreak.com/');
              isAttemptingConnection.current = true;

              ws.current.onopen = handleSocketOpen;
              ws.current.onclose = handleSocketClose;
              ws.current.onmessage = handleSocketMessage;
            }
            
            setInterval(() => {
              if(!isConnected.current && !isAttemptingConnection.current) {
                reconnect();
                window.Notifier.notify({
                  message: 'Attempting to rejoin session...',
                });
              }
            }, 1000);

            reconnect();
          }
        }, 100);
      })})()`;

      document.body.append(scriptElement);
      
      const codeDisplayElement = document.createElement('div');

      codeDisplayElement.textContent = `Sync code: ${syncCode.current}`;
      codeDisplayElement.classList.add('code-display');

      const versionDisplayElement = document.createElement('div');

      versionDisplayElement.textContent = `Pokéclicker Super Sync v${browser.runtime.getManifest().version}`;
      versionDisplayElement.classList.add('version-display');

      codeDisplayElement.appendChild(versionDisplayElement);
      
      document.body.appendChild(codeDisplayElement);

    };

    wrapper.appendChild(joinSessionButton);

    document.querySelector('#saveSelector > .row').appendChild(wrapper);
  }
})();