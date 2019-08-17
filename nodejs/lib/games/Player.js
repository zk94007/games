/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = Player;

if (!global.R5) {
  require(`${__dirname}/../../config.js`);
}

// Constructor

function Player (params, get_rating = true) {
  R5.event_emitter.call(this);

  if (params['ai']) {
    this.ai = params['ai'];
  }

  this.game = params['game'];
  this.id = params['id'];
  this.name = params['name'];
  this.country = params['country'] || {};
  this.rate = params['rate'] || default_rating(this.is_guest());

  this.match = params['match'] || false;
  this.status = params['status'] || R5.game.statuses.IDLE;

  if (get_rating) { this.get_rating(); }
}

Player.prototype.__proto__ = R5.event_emitter.prototype;

// Public Methods

Player.prototype.is_ai = function () {
  return (this.ai !== undefined);
};

Player.prototype.is_guest = function () {
  return (this.name.indexOf('Guest') >= 0);
};

Player.prototype.is_online = function () {
  return (this.status !== R5.game.statuses.OFFLINE);
};

Player.prototype.is_playing = function () {
  return (this.status === R5.game.statuses.PLAY);
};

Player.prototype.is_reviewing = function () {
  return (this.status === R5.game.statuses.REVIEW);
};

Player.prototype.is_in_match = function () {
  return (this.match ? this.match : false);
};

Player.prototype.can_join_ladder = function () {
  if (!R5.games[this.game].settings.ladder) {
    R5.out.error(`${this.name}, ladder is not enabled for this game`);
    return false;
  }

  if (this.is_guest()) {
    R5.out.error(`${this.name}, guests cannot play in the ladder`);
    return false;
  }

  if (this.rate.ladder) {
    R5.out.error(`${this.name} has already joined the ladder`);
    return;
  }

  return true;
};

Player.prototype.can_play_ladder = function () {
  if (!R5.games[this.game].settings.ladder) {
    R5.out.error(`${this.name}, ladder is not enabled for this game`);
    return false;
  }

  if (this.is_guest()) {
    R5.out.error(`${this.name}, guests cannot play in the ladder`);
    return false;
  }

  if (!this.rate.ladder) {
    R5.out.error(`${this.name} has nobody to challenge on the ladder`);
    return false;
  }

  return true;
};

Player.prototype.join_ladder = function () {
  if (!this.can_join_ladder()) {
    this.emit('updated', this.to_json());
    return;
  }

  let _this = this;
  R5.db.query(`SELECT COUNT(*) AS count
               FROM player_ratings
               WHERE game_id = ${R5.games[_this.game].id}
                 AND ladder IS NOT NULL`,
  function (err, result, fields) {
    if (err || result.length !== 1) { R5.out.error(`SQL join_ladder_1: ${err}`); }
    let ladder = parseInt(result[0]['count'], 10) + 1;

    R5.db.query(`INSERT INTO player_ratings (player_id, game_id, ladder)
                 VALUES (
                   (SELECT id FROM players WHERE name = "${_this.name}"),
                   ${R5.games[_this.game].id},
                   ${ladder})
                 ON DUPLICATE KEY UPDATE ladder = ${ladder}`,
    function (err, result, fields) {
      if (err) { R5.out.error(`SQL join_ladder_2: ${err}`); return; }

      _this.rate.ladder = ladder;
      _this.get_ladder_opps();
    });
  });
}

Player.prototype.join_match = function (match, status, callback) {
  if (this.match) {
    if (this.match.id === match.id) { return callback(true); }
    this.leave_match();
  }

  let _this = this;
  match.add_user(this, status, function (status) {
    if (status !== false) {
      if (!_this.is_ai()) {
        _this.match = { id: match.id };
        _this.update_status(status);
      }
      return callback(true);
    }
    return callback(false);
  });
};

Player.prototype.leave_match = function () {
  this.match = false;

  if (this.status === R5.game.statuses.PLAY) {
    this.update_status(R5.game.statuses.OFFLINE);
  }
  else {
    this.update_status(R5.game.statuses.IDLE);
  }
};

Player.prototype.calculate_rating = function (p1adjust, p2r, W1, W2, multi) {
  let p1r = { elo: this.rate.elo, cert: this.rate.cert };

  if ((p1r.cert === 0.0 && p2r.cert === 0.0) || (W1 === 0.0 && W2 === 0.0)) {
    p1r.elo = 0.0; p1r.cert = 0.0;
    p2r.elo = 0.0; p2r.cert = 0.0;
    return [p1r, p2r];
  }

  update_provision(this, p1adjust, p2r, W1, W2);

  let skp1 = false; let skp2 = false;

  if (p1r.cert === 0.0) { skp1 = true; p1r.cert = 0.1;
    p1r.elo = (W1 > W2) ? p2r.elo + 300 : p2r.elo - 300;
  }
  if (p2r.cert === 0.0) { skp2 = true; p2r.cert = 0.1;
    p2r.elo = (W2 > W1) ? p1r.elo + 300 : p1r.elo - 300;
  }

  let K1 = 48.0; let K2 = 48.0;
  if (p1r.elo > 2700) { K1 = 10.0; } if (p2r.elo > 2700) { K2 = 10.0; }
  else if (p1r.elo > 2400) { K1 = 16.0; } if (p2r.elo > 2400) { K2 = 16.0; }
  else if (p1r.elo > 2100) { K1 = 32.0; } if (p2r.elo > 2100) { K2 = 32.0; }

  K1 = K1 * p2r.cert / p1r.cert;
  K2 = K2 * p1r.cert / p2r.cert;

  let diff = Math.abs(p1r.elo - p2r.elo); let We1 = 1.0; let We2 = 0.0;
  if (diff < 800 && diff > 750) { We1 = 0.990; We2 = 0.010; }
  else if (diff > 700) { We1 = 0.983; We2 = 0.017; }
  else if (diff > 650) { We1 = 0.987; We2 = 0.013; }
  else if (diff > 600) { We1 = 0.977; We2 = 0.023; }
  else if (diff > 550) { We1 = 0.969; We2 = 0.031; }
  else if (diff > 500) { We1 = 0.960; We2 = 0.040; }
  else if (diff > 450) { We1 = 0.947; We2 = 0.053; }
  else if (diff > 400) { We1 = 0.930; We2 = 0.070; }
  else if (diff > 350) { We1 = 0.909; We2 = 0.091; }
  else if (diff > 300) { We1 = 0.882; We2 = 0.118; }
  else if (diff > 250) { We1 = 0.849; We2 = 0.151; }
  else if (diff > 200) { We1 = 0.808; We2 = 0.192; }
  else if (diff > 150) { We1 = 0.760; We2 = 0.240; }
  else if (diff > 100) { We1 = 0.703; We2 = 0.297; }
  else if (diff > 50) { We1 = 0.640; We2 = 0.360; }
  else if (diff > 25) { We1 = 0.571; We2 = 0.429; }
  else if (diff > 0) { We1 = 0.543; We2 = 0.457; }
  else if (diff === 0) { We1 = 0.50; We2 = 0.50; }

  let tmp1; let tmp2;
  if (p1r.elo > p2r.elo) {
    tmp1 = (W1 - We1);
    p1r.elo = multi * (K1 * tmp1);
    tmp2 = (W2 - We2);
    p2r.elo = multi * (K2 * tmp2);
    tmp2 *= -1;
  }
  else {
    tmp1 = (W1 - We2);
    p1r.elo = multi * (K1 * tmp1);
    tmp2 = (W2 - We1);
    p2r.elo = multi * (K2 * tmp2);
    tmp1 *= -1;
  }

  if (p1r.cert > 0.90 && tmp1 < 0) {
    p1r.cert = Math.max(-0.025, (tmp1 * (p2r.cert * p1r.cert)));
  }
  else {
    p1r.cert = (1.0 - p1r.cert) * (p2r.cert * p1r.cert) * 0.33;
  }
  if (p2r.cert > 0.90 && tmp2 < 0) {
    p2r.cert = Math.max(-0.025, (tmp2 * (p1r.cert * p2r.cert)));
  }
  else {
    p2r.cert = (1.0 - p2r.cert) * (p2r.cert * p1r.cert) * 0.33;
  }

  if (skp1 === true) { p1r.elo = 0.0; p1r.cert = 0.0; }
  if (skp2 === true) { p2r.elo = 0.0; p2r.cert = 0.0; }

  return [p1r, p2r];
};

Player.prototype.get_rating = function () {
  if (this.is_ai()) {
    return;
  }
  else if (this.is_guest()) {
    this.emit('updated', this.to_json());
    return;
  }

  // TODO: why is game invalid?
  let game = R5.games[this.game];
  if (!game) {
    R5.out.error(`Invalid game '${game}' for user '${this.name}'`);
    return;
  }

  let _this = this;
  R5.db.query(`SELECT pr.rating, pr.certainty, IFNULL(pr.ladder, 0) AS ladder
               FROM players p
                 LEFT JOIN player_ratings pr ON p.id = pr.player_id
               WHERE p.name = "${_this.name}"
                 AND pr.game_id = ${game.id}`,
  function (err, results, fields) {
    if (err) {
      R5.out.error(`Could not get_rating for ${_this.name} (${err})`);
    }
    else if (results.length !== 1) {
      R5.out.error(`Provisional rating for ${_this.name} (${_this.rate.elo})`);
    }
    else {
      let result = results[0];
      _this.rate.elo = parseFloat(result['rating']);
      _this.rate.cert = parseFloat(result['certainty']);
      _this.rate.ladder = result['ladder'] ? parseInt(result['ladder'], 10) : false;
    }

    R5.db.query(`SELECT mp.place
                 FROM matches m
                   LEFT JOIN match_players mp ON m.id = mp.match_id
                 WHERE m.game_id IN (
                   SELECT id FROM games WHERE url = "${_this.game}"
                 )
                   AND mp.player_id = (
                     SELECT id FROM players WHERE name = "${_this.name}"
                   )
                   AND m.decision = "COMPLETE"
                   AND m.rated = 1
                 ORDER BY m.finish DESC
                 LIMIT 10`,
    function (err, results, fields) {
      _this.rate.last = { count: 0, won: 0 };

      if (err) {
        R5.out.error(`Could not get_last_x for ${_this.name} (${err})`);
      }
      else {
        for (let i = 0; i < results.length; i++) {
          _this.rate.last.count++;
          _this.rate.last.won += (results[i]['place'] === 1 ? 1 : 0);
        }
      }

      _this.get_ladder_opps();
    });
  });
};

Player.prototype.get_ladder_opps = function (callback) {
  if (this.rate.ladder === false) {
    if (callback) { callback(); }
    else { this.emit('updated', this.to_json()); }
    return;
  }

  let _this = this;
  _this.rate.ladder_opps = [];

  R5.db.query(`SELECT p.id, p.name, pr.rating AS elo, pr.certainty AS cert, pr.ladder
               FROM players p
                 JOIN player_ratings pr ON p.id = pr.player_id
               WHERE pr.game_id = ${R5.games[_this.game].id}
                 AND pr.ladder < ${_this.rate.ladder}
               ORDER BY pr.ladder DESC LIMIT 5`,
  function (err, result, fields) {
    if (err || result.length === 0) {
      if (callback) { callback(); }
      else { _this.emit('updated', _this.to_json()); }
      return;
    }

    let opps = result;
    R5.db.query(`SELECT id, players
                 FROM matches
                 WHERE type = "LADDER"
                   AND players REGEXP "[[:<:]]${_this.name}[[:>:]]"
                   AND decision != "CANCELLED"
                 ORDER BY id DESC LIMIT 1`,
    function (err, result, fields) {
      if (err) {
        R5.out.error('SQL 10b: could not find previous ladder match');
        if (callback) { callback(); }
        else { _this.emit('updated', _this.to_json()); }
        return;
      }

      for (let i = opps.length - 1; i >= 0; i--) {
        let can_break = false;
        for (let j = 0; j < result.length; j++) {
          let plyrs = result[j]['players'].split(',');

          for (let k = 1; k < plyrs.length - 1; k++) {
            if (opps[i]['name'] === plyrs[k]) {
              opps.splice(i, 1);
              can_break = true;
              break;
            }
          }

          if (can_break) { break; }
        }

        if (opps[i] !== undefined && opps[i].rate === undefined) {
          _this.rate.ladder_opps.push({
            id: opps[i].id,
            name: opps[i].name,
            rate: {
              elo: opps[i].elo,
              cert: opps[i].cert,
              ladder: opps[i].ladder
            }
          });
        }
      }

      if (callback) { callback(); }
      else { _this.emit('updated', _this.to_json()); }
    });
  });
}

Player.prototype.update_rating = function (match_id, place, change) {
  if (this.is_ai()) {
    return;
  }
  if (!this.game) {
    R5.out.error('no game for:');
    R5.out.error(this);
    R5.slack.send_message('no game for:');
    R5.slack.send_message(this);
    return;
  }

  this.rate.last.count++;
  this.rate.last.won += (place === 1 ? 1 : 0);
  this.rate.elo += Math.min(3000, change.elo);
  this.rate.cert += Math.max(0, change.cert);

  if (this.is_guest()) {
    return;
  }

  let _this = this;

  R5.db.query(`UPDATE player_ratings
               SET
                 rating = rating + "${change.elo}",
                 certainty = certainty + "${change.cert}"
                 ${change.ladder > 0 ? `, ladder = ladder + ${change.ladder}` : ''}
               WHERE game_id = ${R5.games[_this.game].id}
                 AND player_id = (SELECT id FROM players WHERE name = "${_this.name}")`,
  function (err, result, fields) {
    if (err || result['affectedRows'] !== 1) {
      R5.out.error(`update_rating: ${err}`);
    }
    _this.get_rating();
  });

  R5.db.query(`UPDATE match_players
               SET
                 rating = "${change.elo}",
                 certainty = "${change.cert}",
                 ${change.ladder > 0 ? `ladder = ${change.ladder},` : ''}
                 place = ${isNaN(place) ? null : `"${place}"`}
               WHERE match_id = ${match_id}
                 AND player_id = (SELECT id FROM players WHERE name = "${_this.name}")`,
  function (err, result, fields) {
    if (err || result['affectedRows'] !== 1) {
      R5.out.error('SQL `I_update_match_player`: ' + err);
    }
  });
};

Player.prototype.update_status = function (status) {
  this.status = status;
  this.emit('updated', this.to_json());
};

Player.prototype.to_json = function () {
  let json = {
    ai: this.ai,
    id: this.id,
    game: this.game,
    name: this.name,
    country: this.country,
    match: this.match,
    rate: this.rate,
    status: this.status };

  return json;
};

// Private Methods

function default_rating (guest = false) {
  return {
    elo: guest ? 1000 : 0,
    cert: guest ? 50.0 : 0.0,
    ladder: false,
    ladder_opps: [],
    last: { count: 0, won: 0 } };
}



function update_provision (user, p1adjust, p2r, W1, W2) {
  if (user.is_ai() || user.is_guest()) { return; }
  if (user.rate.cert > 0) { return; }

  // TODO: why is game invalid?
  let game = R5.games[user.game];
  if (!game) {
    R5.out.error(`Invalid game '${game}' for user '${user.name}'`);
    return;
  }

  let won = (W1 > W2) ? 1 : 0;
  let rate = Math.max(1000, (p2r.elo - p1adjust));
  let cert = p2r.cert;

  insert_provisional();

  function insert_provisional () {
    R5.db.query(`INSERT INTO player_ratings_provisional
                   (player_id, game_id, rating, certainty, played, won)
                 VALUES (
                   (SELECT id FROM players WHERE name = "${user.name}"),
                   ${R5.games[user.game].id}, "${rate}", "${cert}", 1, ${won}
                 )
                 ON DUPLICATE KEY UPDATE
                   rating = rating + "${rate}",
                   certainty = certainty + "${cert}",
                   played = played + 1,
                   won = won + ${won}`,
    function (err, result, fields) {
      if (err) { R5.out.error('SQL 12a: ' + err); return; }
      if (won > 0) { insert_player_rating(); }
    });
  }

  function insert_player_rating () {
    R5.db.query(`SELECT pro.rating, pro.certainty, pro.played, pro.won
                 FROM players p
                   JOIN player_ratings_provisional pro ON p.id = pro.player_id
                 WHERE p.name = "${user.name}"
                   AND pro.game_id = ${R5.games[user.game].id}`,
    function (err, results, fields) {
      if (err || results.length !== 1) { R5.out.error('SQL 12b: ' + err); return; }

      let result = results[0];
      if (result['played'] < 5 || result['won'] < 5) { return; }

      let played = parseInt(result['played'], 10);
      let won = parseInt(result['won'], 10);
      let factor = Math.max(0.85, (won / played) * 1.10);
      let rating = Math.max(900.0, parseFloat(result['rating']) * factor / played);
      let certainty = Math.max(0.50, parseFloat(result['certainty']) * factor / played);

      R5.db.query(`INSERT INTO player_ratings (player_id, game_id, rating, certainty)
                   VALUES (
                     (SELECT id FROM players WHERE name = "${user.name}"),
                     ${R5.games[user.game].id}, "${rating}", "${certainty}"
                   )
                   ON DUPLICATE KEY
                   UPDATE rating = "${rating}", certainty = "${certainty}"`,
      function (err, result, fields) {
        if (err) { R5.out.error(`SQL 12c: ${err}`); return; }
        user.get_rating();

        R5.db.query(`UPDATE player_ratings_provisional
                     SET rating = "${rating}", certainty = "${certainty}"
                     WHERE game_id = ${R5.games[user.game].id}
                       AND player_id = (
                         SELECT id FROM players WHERE name = "${user.name}"
                       )`,
        function (err, result, fields) {
          if (err) { R5.out.error(`SQL 12d: ${err}`); }
        });
      });
    });
  }
}
