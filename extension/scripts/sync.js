console.log('Pokeclicker Super Sync enabled.');

const DEBUG = true;

(() => {
  const syncCode = { current: '' };
  const playerName = { current: '' };

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

    const baseStartGame = joinSessionButton.onclick;

    joinSessionButton.onclick = () => {
      baseStartGame();

      const scriptElement = document.createElement('script');

      scriptElement.textContent = `const SUPER_SYNC_DEBUG = ${DEBUG ? 'true' : 'false'}; const SYNC_CODE = '${syncCode.current}'; const PLAYER_NAME = '${playerName.current || 'A player'}'; (${(() => {
        const waitInterval = { current: null };

        waitInterval.current = setInterval(() => {
          if (App.game) {
            console.log('Super sync hooks injected.');
            clearInterval(waitInterval.current);

            const ws = new WebSocket(SUPER_SYNC_DEBUG ? `ws://localhost:3000/` : 'wss://pokeclicker-super-sync.maybreak.com/');
            const isConnected = { current: false };
            
            console.log('Session joined!');

            function sendMessage(event, payload = {}) {
              if (isConnected) ws.send(JSON.stringify({ event, payload: { code: SYNC_CODE, ...payload } }));
            }

            ws.onopen = () => {
              isConnected.current = true;

              window.Notifier.notify({
                message: `Connected to Pokeclicker Super Sync server, attempting to join session...`,
              });
              
              sendMessage('join', { username: PLAYER_NAME });

              console.log('Connected to sync server.');

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

              injectMethodBefore(App.game.party, 'gainPokemonById', (id, shiny) => {
                if (!App.game.party.alreadyCaughtPokemon(id, shiny)) {
                  sendMessage('catch', {
                    id,
                    shiny
                  });
                }
              });  
            };

            ws.onclose = () => {
              isConnected.current = false;

              window.Notifier.notify({ 
                message: `Disconnected from Pokeclicker Super Sync! Gameplay will no longer be synchronized.`,
              });

              console.log('Disconnected from sync server.');
            };

            ws.onmessage = message => {
              const data = JSON.parse(message.data);

              console.log('[Sync event]', data);
              switch (data.event) {
                case 'alert':
                  window.Notifier.notify(data.payload);
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

                case 'initialSync':
                  data.payload.pokemon.forEach(({ id, shiny }) => {
                    if (!App.game.party.alreadyCaughtPokemon(id, shiny)) {
                      App.game.party.gainPokemonById(id, shiny, true);
                    }
                  });
                  
                  window.Notifier.notify({
                    message: `Synced ${data.payload.pokemon.length} caught Pokemon from the session.`,
                    type: NotificationConstants.NotificationOption .success
                  });

                  break;  
              }
            };
          }
        }, 100);
      })})()`;

      document.body.append(scriptElement);
    };

    wrapper.appendChild(joinSessionButton);

    document.querySelector('#saveSelector > .row').appendChild(wrapper);
  }
})();