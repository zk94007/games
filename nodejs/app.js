/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

process.title = 'games';

require(`${__dirname}/config.js`);
if (!global.R5) { console.log('R5 not defined'); process.exit(1); }

R5.setup(function () {
  R5.out.log('R5.setup complete');

  R5.queue_games.bind(handle_request);

  R5.player = require(`${__dirname}/lib/games/Player.js`);

  R5.match_emitter = new (require(`${__dirname}/lib/games/MatchEmitter.js`))();
  R5.match_processor = new (require(`${__dirname}/lib/games/MatchProcessor.js`))();
  R5.matches = new (require(`${__dirname}/lib/games/Matches.js`))();

  listen_to_player(R5.match_emitter, 'player');

  R5.match_emitter.on('chat', function (room, text) {
    let json = {
      category: 'chat',
      type: 'message',
      room: room,
      text: text
    };

    R5.queue_messaging.send(json);
  });

  R5.match_emitter.on('message', function (match, user, text) {
    let json = {
      category: 'match',
      type: 'message',
      room: `match_${match.id}`,
      user: user,
      text: text
    };

    R5.queue_messaging.send(json);
  });

  R5.match_emitter.on('summary', function (match, user) {
    let json = {
      category: 'match',
      type: 'summary',
      room: `game_${match.settings.game}`,
      match: match,
      user: user
    };

    R5.queue_messaging.send(json);
  });

  R5.match_emitter.on('update', function (match, user) {
    let json = {
      category: 'match',
      type: 'update',
      room: `match_${match.id}`,
      match: match,
      user: user
    };

    R5.queue_messaging.send(json);
  });
});

function handle_request (message) {
  R5.out.log(`RECV ${message.game}:${message.category}:${message.type}`);

  switch (message.category) {
    case 'info':
      R5.match_processor.get_all(message.user);
      break;
    case 'match':
      if (message.user) { message.user = new R5.player(message.user); }
      // TODO: ensure user is allowed to do actions before each of the below

      switch (message.type) {
        case 'new':
          R5.match_processor.create(message.game, [message.user], message.data);
          break;
        case 'new_ladder':
          let player = message.user;

          if (player.can_play_ladder()) {
            player.get_ladder_opps(function () {
              var pos = player.rate.ladder_opps.findIndex(function (user) {
                return user.name === message.data.challenge;
              });

              if (message.data.challenge && pos >= 0) {
                var user = player.rate.ladder_opps[pos];

                user = new R5.player(
                  { id: user.id,
                    name: user.name,
                    status: R5.game.statuses.PLAY });

                R5.match_processor.create(message.game, [player, user], { type: { ladder: true } });
              }
            });
          }
          break;
        case 'join':
          listen_to_player(message.user);
          R5.matches.get(message.game, message.data.id, function (match) {
            R5.match_processor.join(
              match,
              message.user,
              parseInt(message.data.status, 10),
              message.data.password
            );
          });
          break;
        case 'join_ladder':
          listen_to_player(message.user);
          message.user.join_ladder();
          break;
        case 'start':
          R5.matches.get(message.game, message.match.id, function (match) {
            if (match) {
              match.start();
            }
          });
          break;
        case 'move':
          R5.matches.get(message.game, message.match.id, function (match) {
            if (match) {
              match.make_move(message.user, message.data);
            }
          });
          break;
        case 'move_ai':
          R5.matches.get(message.game, message.match.id, function (match) {
            if (match) {
              match.play_ai();
            }
          });
          break;
        case 'move_review':
          R5.matches.get(message.game, message.match.id, function (match) {
            if (match) {
              match.review_move(message.user, message.data);
            }
          });
          break;
        case 'leave':
          listen_to_player(message.user);
          R5.matches.get(message.game, message.match.id, function (match) {
            R5.match_processor.leave(
              match,
              message.user
            );
          });
          break;
        default:
          // TODO: send email to dev?
          R5.out.error(`Invalid 'match' message '${message}'`);
          break;
      }
      break;
    case 'player':
      // TODO: any validations?
      let player = new R5.player(message.user, false);

      switch (message.type) {
        case 'get_rating':
          // TODO: create generic listener so player doesn't have to be initialized
          // or use user_updated after each match finishes and ratings are calc'd
          listen_to_player(player);
          player.get_rating();
          break;
        default:
          R5.out.error(`Invalid 'player' message type '${message.type}'`);
          break;
      }
      break;
    default:
      R5.out.error(`Invalid message category '${message.category}'`);
  }
}

function listen_to_player (object, emit_type = 'updated') {
  object.on(emit_type, function (player_json) {
    let json = {
      category: 'player',
      type: 'update',
      room: `game_${player_json.game}`,
      user: player_json
    };

    R5.queue_messaging.send(json);
  });
}
