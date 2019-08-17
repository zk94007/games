/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = MatchProcessor;

if (!global.R5) {
  require(`${__dirname}/../../config.js`);
}

// Constructor

function MatchProcessor () {
  let games = Object.keys(R5.games);
  for (let g = 0; g < games.length; g++) {
    setInterval(auto_setup, 900000, this, games[g]);
  }
}

// Public Methods

MatchProcessor.prototype.create = function (game, players, settings = {}) {
  if (!R5.games[game]) { console.log(`invalid game ${game}`); return; }

  let match = new R5.games[game].match(
    new R5.games[game].match_settings(settings, {
      privileged: (players.length === 0 || !players[0].is_guest()),
      reloaded: false
    })
  );

  if (match) {
    R5.matches.set(match, function (match) {
      R5.match_emitter.send_summary(match);
      R5.matches.add_waiting(game);

      R5.match_emitter.listen(match);
      for (let i = 0; i < players.length; i++) {
        join_match(match, players[i], R5.game.statuses.WAIT, settings.password);
      }

      if (match.can_start()) { match.start(); }
    });
  }
};

MatchProcessor.prototype.join = function (match, user, status, password) {
  if (!match) {
    R5.match_emitter.send_message(user, { }, `Could not find match ${match.id} to join`);
    return;
  }

  if (match.is_in_progress() && status === R5.game.statuses.WAIT) {
    user.join_match(match, R5.game.statuses.PLAY, function (success) {
      if (success) {
        R5.match_emitter.send_update(match, user.name);
      }
    });
    return;
  }

  join_match(match, user, status, password);
};

MatchProcessor.prototype.leave = function (match, user) {
  if (!match) {
    R5.match_emitter.send_message(user, { }, `Could not find match ${match.id} to leave`);
    return;
  }

  user.leave_match(match);
  match.remove_user(user);
};

MatchProcessor.prototype.get_all = function (user) {
  R5.matches.current(user.game, function (match_ids) {
    for (let i = 0; i < match_ids.length; i++) {
      R5.matches.get_summary(match_ids[i], function (match_json) {
        if (match_json) {
          R5.match_emitter.send_summary_json(match_json, user);
        }
      });
    }
  });
};

MatchProcessor.prototype.add_match = function (match, callback) {
  if (!match.should_save()) { return callback(match); }
  let player_names = match.names(R5.game.statuses.PLAY);

  // TODO: save settings.password to allow reviewing of private matches

  R5.db.query(`
    INSERT INTO matches (chat_id, game_id, type, rated, players)
    VALUES (
      "${match.id}",
      (SELECT id FROM games WHERE url = "${match.settings.game}"),
      "${match.is_private() ? 'PRIVATE' : (match.is_ladder() ? 'LADDER' : 'STANDARD')}",
      ${match.is_rated() ? '1' : '0'},
      "${player_names.join(',')}"
    )
  `, function (err, result, fields) {
    if (err) { R5.out.error(`SQL 6: ${err}`); }

    match.sid = result['insertId'];
    add_match_players(match);
    return callback(match);
  });
};

MatchProcessor.prototype.update_match = function (match) {
  if (match.sid) {
    R5.db.query(`
      UPDATE matches SET decision = "${match.decision.result}"
      WHERE id = ${match.sid} AND decision = "IN_PROGRESS"
    `, function (err, result, fields) {
      if (err) { R5.out.error(`SQL 7: ${err}`); }
    });

    if (match.decision.file) {
      R5.storage.create_file({
        name: `${match.sid.lpad(8)}.txt`,
        directory: `matches/${match.settings.game}`,
        content: match.decision.file.out,
        upload: true
      }, function () { });

      let json = match.to_json(false, true);
      // delete json.engine; TODO: consider deleting engine to save space?

      R5.storage.create_file({
        name: `${match.sid.lpad(8)}.json`,
        directory: `matches/${match.settings.game}`,
        content: JSON.stringify(json, R5.parser),
        upload: true
      }, function () { });
    }
  }
};

MatchProcessor.prototype.finalize_match = function (match, callback) {
  let players = match.players();
  let i;

  let ratings = new Array(players.length);
  for (i = players.length - 1; i >= 0; i--) {
    if (match.is_rated() && !match.is_cancelled() && !players[i].is_ai()) {
      let tmprat = { elo: 0.0, cert: 0.0, ladder: 0 };

      for (let j = 0; j < players.length; j++) {
        if (i !== j) {
          let Ws = [0, 0];
          if (match.decision.places[i] < match.decision.places[j]) { // Win
            Ws = [1, 0];
            if (match.is_ladder()) {
              tmprat.ladder = Math.min(players[i].rate.ladder, players[j].rate.ladder);
            }
          }
          else if (match.decision.places[i] > match.decision.places[j]) { // Lose
            Ws = [0, 1];
            if (match.is_ladder()) {
              tmprat.ladder = Math.max(players[i].rate.ladder, players[j].rate.ladder);
            }
          }
          else if (match.decision.places[i] === match.decision.places[j]) { // Tie
            Ws = [0.5, 0.5];
          }

          let p2r = { elo: players[j].rate.elo, cert: players[j].rate.cert };
          p2r.elo += (p2r.cert !== 0.0 ? match.decision.ratings[j] : 0);

          let temp = players[i].calculate_rating(
            match.decision.ratings[i],
            p2r,
            Ws[0],
            Ws[1],
            match.decision.multielo);
          tmprat.elo += temp[0].elo;
          tmprat.cert += temp[0].cert;
        }
      }

      ratings[i] = {
        elo: tmprat.elo / (players.length - 1),
        cert: tmprat.cert / (players.length - 1),
        ladder: (tmprat.ladder !== 0 ? tmprat.ladder - players[i].rate.ladder : 0) };
    }
    else {
      ratings[i] = { elo: 0.0, cert: 0.0, ladder: 0 };
    }

    let string = `${players[i].name} (${plus_minus(ratings[i].elo.toFixed(1))}` +
      `${match.is_ladder() ? `, ${plus_minus(ratings[i].ladder)}` : ''})`;

    match.decision.text = replace_all(match.decision.text, `%p${i}`, string);
    match.decision.file.out = replace_all(
      match.decision.file.out,
      `%p${i}r`,
      (plus_minus(ratings[i].elo.toFixed(1)) +
        (match.is_ladder() ? ', ' + plus_minus(ratings[i].ladder) : '')));
    match.decision.file.out = replace_all(
      match.decision.file.out,
      `%p${i}`,
      players[i].name);
  }

  for (i = 0; i < players.length; i++) {
    if (!players[i].is_ai()) {
      players[i].update_rating(match.sid, match.decision.places[i], ratings[i]);
      R5.match_emitter.send_message({ }, players[i]);
    }
  }

  return callback(match);
};

// Private Methods

function auto_setup (_this, game) {
  // TODO: auto-start ladder matches

  R5.redlock.lock(`${game}_lock`, 10000, function (err, lock) {
    if (err) {
      R5.out.error(`Could not ${game}_lock': ${err}`);
    }
    else {
      R5.matches.current(game, function (match_ids) {
        if (match_ids.length < 2) { auto_create(_this, game); }
        auto_update(_this, game, match_ids);

        lock.unlock(function (err) {
          R5.out.error(`Could not ${game}_unlock': ${err}`);
        });
      });
    }
  });
}

function auto_create (_this, game) {
  let ais = Object.keys(R5.games[game].settings.ais);
  if (ais.length === 0) { return; }

  let players = R5.games[game].settings.players;
  let settings = {
    ais: [],
    player: -1,
    players: Math.floor(Math.random() * (players.max - players.min) + players.min)
  };

  for (let i = 0; i < settings.players; i++) {
    let name = ais[Math.floor(Math.random() * ais.length)];
    let ai = R5.games[game].settings.ais[name];
    settings.ais.push({
      name: name,
      level: Math.floor(Math.random() * (ai.level.max - ai.level.min) + ai.level.min)
    });
  }

  _this.create(game, [], settings);

  R5.matches.get_waiting(game, function (count) {
    if (count < 2) {
      settings.ais.pop();
      _this.create(game, [], settings);
    }
  });
}

function auto_update (_this, game, match_ids) {
  for (let i = 0; i < match_ids.length; i++) {
    R5.matches.get(game, match_ids[i], update_match);
  }
}

function update_match (match) {
  if (!match || (new Date() - match.date.getTime()) < (1000 * 60 * 60 * 3)) { return; }

  if (match.has_started()) {
    match.update_timer();
  }
  else {
    match.status = 'DELETED';

    let waiters = match.waiters();
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i] && !waiters[i].is_ai()) {
        match.remove_user(waiters[i]);
      }
    }

    R5.match_emitter.emit('summary', match.to_json(false));

    R5.matches.rem_waiting(match.settings.game);
    R5.matches.delete(match.settings.game, match.id);
  }
}

function join_match (match, user, status, password) {
  if (user.is_ai()) { return; }

  if (match.can_join(user, password)) {
    user.join_match(match, status, function (success) {
      if (!success) {
        R5.match_emitter.send_message(user, { }, `Could not join match ${match.id} (1)`);
        return;
      }

      let broadcast = [R5.game.statuses.PLAY, R5.game.statuses.WATCH].indexOf(status) === -1;
      R5.matches.set(match, function (match) {
        if (!match.has_started()) {
          R5.match_emitter.send_summary(match);
        }
        R5.match_emitter.send_update(match, broadcast ? false : user.name, status === R5.game.statuses.WAIT);
      });
    });
  }
  else {
    R5.match_emitter.send_message(user, { }, `Could not join match ${match.id} (2)`);
  }
}

function add_match_players (match) {
  match.players().forEach(function (player) {
    if (!player.is_ai() && !player.is_guest()) {
      R5.db.query(`
        INSERT INTO match_players (match_id, player_id)
        VALUES (${match.sid}, ${player.id})
      `, function (err, result, fields) {
        if (err) { R5.out.error(`SQL 'add_match_player': ${err}`); }
      });
    }
  });
}

function plus_minus (nbr) {
  if (nbr > 0 || parseFloat(nbr) > 0) { return '+' + nbr; }
  else { return nbr; }
}

function replace_all (str, search, replacement) {
  return str.replace(new RegExp(search, 'g'), replacement);
}
