/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = Matches;

if (!global.R5) {
  require(`${__dirname}/../../config.js`);
}

// Constructor

function Matches () {
  this.match_expiration = 60 * 60 * 3; // 3 hours
}

// Public Methods

Matches.prototype.get = function (game, id, callback) {
  let _this = this;

  R5.redis.get(`match_${id}`, function (err, data) {
    if (!err && data) {
      R5.out.log(`LOAD ${game}:${id} from Redis`);
      _this.reload(JSON.parse(data), callback);
      return;
    }
    else {
      R5.out.log(`LOAD ${game}:${id} failed: ${err} / ${data}`);
    }

    R5.db.query({
      sql: `SELECT m.id
            FROM matches m
              JOIN games g ON m.game_id = g.id
            WHERE g.url = "${game}"
              AND (m.id = ? OR m.chat_id = ?)`,
      values: [id, id] }
    , function (err, results, fields) {
      if (err) { R5.out.error(`SQL get: ${err}`); }
      let result = results[0];

      if (!result) {
        return callback(false);
      }

      R5.storage.get_file({
        name: `${result.id.lpad(8)}.json`,
        directory: `matches/${game}`,
        remote: true
      }, function (data) {
        if (data) {
          R5.out.log(`LOAD ${game}:${id} from Storage`);
          _this.reload(JSON.parse(data), callback);
          return;
        }

        return callback(false);
      });
    });
  });
};

// TODO: allow for finished matches?
Matches.prototype.get_summary = function (id, callback) {
  R5.redis.get(`match_${id}_summary`, function (err, data) {
    if (err) {
      R5.out.log(`Could not load match_summary ${id}: ${err}`);
    }
    return callback(data && data !== 'undefined' ? JSON.parse(data) : false);
  });
};

Matches.prototype.get_waiting = function (game, callback) {
  R5.redis.get(`game_${game}_waiting`, function (err, data) {
    if (err) {
      R5.out.log(`Could not get_waiting ${game}: ${err}`);
    }
    return callback(data);
  });
};

Matches.prototype.add_waiting = function (game) {
  R5.redis.increment(`game_${game}_waiting`);
};

Matches.prototype.rem_waiting = function (game) {
  R5.redis.decrement(`game_${game}_waiting`);
};

Matches.prototype.set = function (match, callback) {
  if (!match) { return callback(false); }

  let game = match.settings.game;
  let match_id = match.id;
  let expiration = match.has_finished() ? this.match_expiration : false;
  let match_json;

  match_json = JSON.stringify(match.to_json(false, false));

  R5.redis.set_zlist(`game_${game}_matches`, match_id, Date.now(), function (err, res, body) {
    if (err) {
      R5.out.error(`Could not save match ${match_id} (1): ${err}`);
    }
  });

  R5.redis.set(`match_${match_id}_summary`, match_json, expiration, function (err, res, body) {
    if (err) {
      R5.out.error(`Could not save match ${match_id} (2): ${err}`);
    }
  });

  match_json = JSON.stringify(match.to_json(false, true));

  R5.redis.set(`match_${match_id}`, match_json, expiration, function (err, data) {
    if (err) {
      R5.out.error(`Could not save match ${match_id} (3): ${err}`);
      return callback(false);
    }

    R5.out.log(`SAVE ${game}:${match_id} in Redis`);
    return callback(match);
  });
};

Matches.prototype.delete = function (game, match_id) {
  R5.redis.delete_zlist(`game_${game}_matches`, match_id, function (err, res, body) {
    if (err) {
      R5.out.error(`Could not delete ${match_id} from_list: ${err}`);
    }
  });
  R5.redis.delete(`match_${match_id}_summary`, function (err, data) {
    if (err) {
      R5.out.error(`Could not delete summary for ${match_id}: ${err}`);
    }
  });
  R5.redis.delete(`match_${match_id}`, function (err, data) {
    if (err) {
      R5.out.error(`Could not delete ${match_id}: ${err}`);
    }
  });
};

Matches.prototype.reload = function (json, callback) {
  let match = new R5.games[json.settings.game].match(false, json);

  for (let i = 0; i < json.users.length; i++) {
    let users = json.users[i];

    for (let j = 0; j < users.length; j++) {
      let player = users[j];

      if (player) {
        player = new R5.player(player);
        // player.match = { id: match.id };
        // player.status = i;
      }

      json.users[i][j] = player;
    }
  }

  try {
    match.reload();
  }
  catch (error) {
    R5.out.error(`RELOAD match ${match.id} failed: ${error}`);
    return callback(false);
  }

  R5.match_emitter.listen(match);
  return callback(match);
};

Matches.prototype.current = function (game, callback) {
  R5.redis.rem_from_zlist(`game_${game}_matches`, 0, (Date.now() - (this.match_expiration * 1000)), function (_err, _data) {
    R5.redis.get_zlist(`game_${game}_matches`, function (err, data) {
      if (!err) { return callback(data); }
    });
  });
};

// Private Methods
