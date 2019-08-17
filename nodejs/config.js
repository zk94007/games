/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

require('dotenv').config();

process.on('uncaughtException', function (err, req, res, next) {
  let err_message = `\n\n ${err.message}\n ${err.stack}`;
  if (R5) { R5.exit_and_alert(1, err_message); }
  else { console.log(err_message); process.exit(1); }
});

process.on('SIGTERM', function () {
  let err_message = 'SIGTERM received';
  R5.exit_and_alert(0, err_message);
});

global.R5 = {
  config: {
    GAME: {
      exchange_name: 'games_exchange',
      queue_name: 'to_games',
      message_type: '#'
    },
    MESSAGE: {
      exchange_name: 'messaging_exchange',
      queue_name: 'to_messaging',
      message_type: '#'
    },
    REDIS: {
      url: `redis://${process.env.REDIS_HOST}/1`
    }
  },

  crypto: require('crypto'),
  crypto_key: process.env.CRYPTO_KEY || 'funnode',

  decrypted: function (text) {
    var decipher = R5.crypto.createDecipher('aes-256-cbc', R5.crypto_key);
    var decrypted = decipher.update(text, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  },

  encrypted: function (text) {
    var cipher = R5.crypto.createCipher('aes-256-cbc', R5.crypto_key);
    var crypted = cipher.update(text, 'utf-8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
  },

  event_emitter: require('events').EventEmitter,

  exit_and_alert: function (code, message) {
    if (R5 && R5.out) {
      R5.out.error(message);
      if (code > 0) {
        R5.slack.send_message(message, function (_err) {
          process.exit(code);
        });
      }
    }
    else {
      console.log(message);
      process.exit(code);
    }
  },

  game: require(`${__dirname}/lib/games/Game.js`),
  games: { },
  host: {
    live: process.env.NODE_ENV === 'production',
    name: require('os').hostname()
  },

  out: console,

  parser: function (key, value) {
    for (let game in R5.games) {
      if (value instanceof R5.games[game].match) { return value.to_json(); }
    }
    if (value instanceof R5.player) { return value.to_json(); }
    else { return value; }
  },

  short_id: require('shortid'),
  util: require('util')
};

R5.setup = function (callback) {
  if (R5.games.length > 0) { return callback(); }
  R5.out.log(`R5.setup started (${R5.host.live ? 'production' : 'development'})..`);

  R5.db = new (require('@funnode/mysql'))(
    {
      host: process.env.DB_IN_HOST,
      user: process.env.DB_IN_USER,
      password: process.env.DB_IN_PASS,
      database: process.env.DB_IN_NAME
    },
    {
      host: process.env.DB_OUT_HOST,
      user: process.env.DB_OUT_USER,
      password: process.env.DB_OUT_PASS,
      database: process.env.DB_OUT_NAME
    }
  );

  R5.queue_games = new (require('@funnode/rabbitmq'))(
    process.env.RABBITMQ_HOST,
    process.env.RABBITMQ_USER,
    process.env.RABBITMQ_PASS,
    process.env.NODE_ENV
  );
  R5.queue_messaging = new (require('@funnode/rabbitmq'))(
    process.env.RABBITMQ_HOST,
    process.env.RABBITMQ_USER,
    process.env.RABBITMQ_PASS,
    process.env.NODE_ENV
  );

  R5.mailer = new (require('@funnode/mailgun'))(
    process.env.MAILGUN_DOMAIN,
    process.env.MAILGUN_API_KEY,
    process.env.NODE_ENV === 'production'
  );

  R5.redis = new (require('@funnode/redis'))(
    process.env.REDIS_HOST,
    process.env.REDIS_PORT,
    process.env.REDIS_PASS
  );

  R5.redlock = new (require('redlock'))(
    [require('redis').createClient(R5.config.REDIS)], { retryCount: 0 }
  );

  R5.slack = new (require('@funnode/slack'))(
    'alerts',
    process.env.SLACK_TOKEN,
    require('os').hostname() + ':' + process.title,
    process.env.NODE_ENV === 'production'
  );

  R5.storage = new (require(`${__dirname}/lib/Storage.js`))();

  R5.db.query(`SELECT g.id, g.url AS name, gs.ladder, gs.review,
                 g.players, g.timers, g.timersi, g.timersb
               FROM games g
                 JOIN game_settings gs ON g.id = gs.game_id
               WHERE g.status = 1`,
  function (err, results, fields) {
    if (err) { console.log(`SQL 1: ${err}`); process.exit(1); }
    else if (results.length === 0) {
      console.log('No games found');
      process.exit(1);
    }

    for (let i = 0; i < results.length; i++) {
      let result = results[i];
      let game = result['name'];

      let players = result['players'].split('-');
      let timers = result['timers'].split(':');
      let timersi = result['timersi'].split(':');
      let timersb = result['timersb'].split(':');

      R5.games[game] = {
        id: result['id'],

        name: game,
        settings: {
          ais: { },
          ladder: (result['ladder'] === 1),
          review: (result['review'] === 1),
          players: {
            min: parseInt(players[0], 10),
            max: parseInt(players.length > 1 ? players[1] : players[0], 10) },
          timers: {
            def: parseInt(timers[0], 10) * 60,
            min: parseInt(timers[1], 10) * 60,
            max: parseInt(timers[2], 10) * 60 },
          timersi: {
            def: parseInt(timersi[0], 10),
            min: parseInt(timersi[1], 10),
            max: parseInt(timersi[2], 10) },
          timersb: {
            def: parseInt(timersb[0], 10),
            min: parseInt(timersb[1], 10),
            max: parseInt(timersb[2], 10) } }
      };

      R5.games[game].dir = `${__dirname}/lib/games/${game}`;
      R5.games[game].match = require(`${R5.games[game].dir}/match.js`);
      R5.games[game].match_settings = require(`${R5.games[game].dir}/match_settings.js`);
    }

    R5.db.query(`SELECT g.url AS game, ga.name, ga.rating, ga.certainty, ga.pause_time
                 FROM games g
                   JOIN game_ais ga ON g.id = ga.game_id
                 WHERE g.status = 1 AND ga.status = 1`,
    function (err, results, fields) {
      if (err) { console.log(`SQL 2: ${err}`); process.exit(1); }

      for (let i = 0; i < results.length; i++) {
        let game = results[i]['game'];
        let ratings = results[i]['rating'].split(':');

        R5.games[game].settings.ais[results[i]['name']] = {
          name: '-AI-' + results[i]['name'],
          rate: {
            elo: parseInt(ratings[0], 10),
            cert: parseFloat(results[i]['certainty'])
          },
          level: {
            min: parseInt(ratings[1], 10),
            max: parseInt(ratings[2], 10),
            step: parseInt(ratings[3], 10)
          },
          pause_time: parseInt(results[i]['pause_time'], 10)
        };
      }

      R5.queue_games.connect(R5.config.GAME, 5, function () {
        R5.queue_messaging.connect(R5.config.MESSAGE, 5, function () {
          R5.out.log(`${process.title} is up and running`);
          return callback();
        });
      });
    });
  });
}

module.exports = R5;

Number.prototype.lpad = function (length) {
  let str = this.toString();
  return str.lpad(length, '0');
};

Object.extend = function (destination, source) {
  for (var property in source) {
    if (source.hasOwnProperty(property)) {
      destination[property] = source[property];
    }
  }
  return destination;
};

String.prototype.lpad = function (length, pad_string) {
  let str = this;
  pad_string = pad_string || '&nbsp;';
  for (let i = 0; i < (length - str.length); i++) {
    str = pad_string + str;
  }
  return str;
};
