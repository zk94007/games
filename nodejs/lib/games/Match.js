/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = Match;

if (!global.R5) {
  require(`${__dirname}/../../config.js`);
}

var PAUSE_TIME = 5;

// Constructor

function Match (game, set, match = false) {
  R5.event_emitter.call(this);

  if (!match) { this.id = R5.short_id.generate(); }

  this.game = game;
  this.date = new Date();
  this.moves = [];
  this.state = {};
  this.users = [[], [], [], [], [], []];

  if (!match) {
    this.settings = set;
    this.waiters(this.settings.waiters);
    this.settings.waiters = null;
  
    this.status = R5.game.statuses.WAIT;
  
    return true;    
  }

  for (let prop in match) {
    if (
      ['date', 'saved', 'settings'].indexOf(prop) === -1 &&
      match.hasOwnProperty(prop)
    ) {
      this[prop] = match[prop];
    }
  }

  if (match.saved) {
    this.date = new Date(match.date);
    this.settings = new R5.games[this.game].match_settings(match.settings, {
      privileged: true,
      reloaded: true
    });
    this.status = match.saved.status;
    if (match.saved.engine) { this.engine = match.saved.engine; }
  }

  this.saved = null;
  return false;
}

Match.prototype.__proto__ = R5.event_emitter.prototype;

// Public Methods

Match.prototype.reload = function () {
  // TODO: decide whether stale matches should get new dates
  // this.date = new Date();
  // this.update_timer();
  if (this.is_paused()) { this.resume(); }
};

Match.prototype.start_sub_set_timer_details = function (i) {
  if (this.settings.timer_type === 'Byo-yomi') {
    this.timersb[i] = this.settings.timersb;
    this.timersbp[i] = this.settings.timersbp;
  }
  else { this.timersi[i] = this.settings.timersi; }
}

Match.prototype.start_sub_set_timers = function () {
  this.timers = new Array(nbr_players);
  if (this.settings.timer_type === 'Byo-yomi') {
    this.timersb = new Array(nbr_players);
    this.timersbp = new Array(nbr_players);
  }
  else {
    this.timersi = new Array(nbr_players);
  }

  for (let i = 0; i < nbr_players; i++) {
    this.decision.ratings[i] = 0;
    this.timers[i] = ((this.settings.timers === -1) ? (60 * 60 * 24) : this.settings.timers);
    this.timers[i] += (i === 0 ? PAUSE_TIME : 0);
    this.start_sub_set_timer_details(i);
  }
}

Match.prototype.start = function () {
  if (!this.can_start()) { return false; }
  let nbr_players = this.waiters().length;

  if (!this.state) { this.state = {}; }
  this.state.alive = [];

  for (let player; (player = this.waiters().pop());) {
    player.update_status(R5.game.statuses.PLAY);
    this.players().push(player);
    this.state.alive.push(true);
  }

  this.date = new Date();
  this.decision = {
    multielo: 1,
    result: 'IN_PROGRESS',
    ratings: new Array(nbr_players),
    text: ''
  };
  this.moves = []; this.illmoves = [];
  this.status = R5.game.statuses.PLAY;
  this.timer = false;

  this.start_sub_set_timers();

  return true;
};

Match.prototype.make_move = function (player, move) {
  if (this.names(R5.game.statuses.PLAY).indexOf(player.name) !== this.state.to_play) {
    this.emit('message', this, player, 'It is not your turn!');
    return false;
  }
  return true;
};

Match.prototype.started = function () {
  this.emit('started', this);
  //if (this.ai_to_play()) { this.play_ai(); }
};

Match.prototype.updated = function () {
  if (this.playing_ai) { this.played_ai(); }
  this.emit('updated', this);
  //if (this.ai_to_play()) { this.play_ai(); }
};

Match.prototype.should_save = function () {
  if (this.sid || this.players().some(function (player) {
    return !player.is_ai() && !player.is_guest();
  })) {
    return true;
  }

  return false;
};

Match.prototype.finish = function (turn, decision) {
  if (this.playing_ai) { this.played_ai(); }

  if (this.status !== 'FINISH') {
    this.status = 'FINISHING';
    this.updated();
    setTimeout(function (_this) {
      _this.status = 'FINISH';
      _this.finish(turn, decision);
    }, PAUSE_TIME / 2 * 1000, this);
  }
};

Match.prototype.finished_sub_check_ladder = function (players) {
  if (this.is_ladder()) {
    this.rematch = false;
  }
  else {
    if (this.moves.length <= players.length) {
      this.decision.text = '(Cancelled) ' + this.decision.text;
      this.decision.result = 'CANCELLED';
    }
    this.rematch = { players: [], agreed: [] };
  }
};

Match.prototype.finished_sub_get_fileout = function () {
  let fileout = '';
  let players = this.players();
  let today = new Date();
  let dd = today.getDate();
  let mm = (today.getMonth() + 1).lpad(2);
  let yyyy = today.getFullYear();

  fileout += '[Date ' + yyyy + '/' + mm + '/' + dd + ']\n' +
      '[Site www.FunNode.com]\n';

  for (i = 0; i < players.length; i++) {
    fileout += '[P' + i + ' ' + players[i].name + ']\n' +
      '[P' + i + '-Elo ' + players[i].rate.elo.toFixed(1) + ']\n' +
      (this.is_ladder() ? '[P' + i + '-Ladder ' + players[i].rate.ladder +
      ']\n' : '');
  }

  fileout += '[Timer ' + this.settings.timer_type + ']\n';
  fileout += '[Timers ' + this.settings.timers + ' + ';
  if (this.settings.timer_type === 'Byo-yomi') {
    fileout += this.settings.timersb + ' (' + this.settings.timersbp + ')';
  }
  else { fileout += this.settings.timersi; }

  fileout += ']\n';

  return fileout;
};

Match.prototype.finished_sub_call_viewer = function () {
  let _this = this;
  this.viewers(function (viewers) {
    for (i = 0; i < viewers.length; i++) {
      _this.emit('player', {
        game: _this.game,
        name: viewers[i],
        status: R5.game.statuses.REVIEW,
        match: { id: _this.id }
      });
    }

    _this.state.review = { control: reviewers[0], next_control: reviewers[1], move: _this.moves.length };
    _this.status = R5.game.statuses.REVIEW;
    _this.emit('finished', _this);
  });
};

Match.prototype.finished = function (decision = {}) {
  let players = this.players();
  let i;

  this.decision = {
    file: decision.file,
    multielo: decision.multielo || 1,
    places: decision.places,
    ratings: decision.ratings,
    result: decision.result || 'COMPLETE',
    text: decision.text };

  this.finished_sub_check_ladder(players);

  let fileout = '';
  if (this.decision.file.generic === true) {
    fileout = this.finished_sub_get_fileout();
  }
  this.decision.file.out = fileout + this.decision.file.out.replace('%out', this.decision.text);

  let reviewers = [];
  for (i = 0; i < players.length; i++) {
    if (players[i].is_ai()) {
      continue;
    }
    this.viewers_add(players[i].name);
    reviewers.push(players[i].name);

    if (this.rematch) {
      this.rematch.players.push(players[i].name);
    }
  }

  this.finished_sub_call_viewer();
};

Match.prototype.review_move_sub_on_rematch = function(user, move) {
  let pos = this.rematch.agreed.indexOf(user.name);
  
  if (move.rematch && pos === -1) {
    this.rematch.agreed.push(user.name);
    if (this.rematch.agreed.length === this.rematch.players.length) {
      this.rematch = false;
      this.emit('rematch', this);
      return false;
    }
  }
  else if (move.rematch === false && pos >= 0) {
    this.rematch.agreed.splice(pos, 1);
    return false;
  }
  return true;
}

Match.prototype.review_move = function (user, move) {
  if (!this.has_finished()) { return false; }

  if (this.rematch) {
    return this.review_move_sub_on_rematch;
  }
  if (this.state.review) {
    if (user.name !== this.state.review.control) {
      this.emit('message', this, user, 'You do not have the review controls');
      return false;
    }
  }

  return true;
};

Match.prototype.valid_move = function (move) {
  return true;
  // TODO: validate generic move?
};

Match.prototype.next_turn = function (start = false) {
  let state = this.state;
  let players_count = state.alive.length;
  let to_play = ((start !== false ? start : state.to_play) + 1) % players_count;

  for (let j = 0; j < players_count; j++) {
    if (this.get_alive(to_play)) { break; }
    else if (typeof this.skip_move === 'function') {
      this.moves.push(this.skip_move(to_play));
    }
    to_play = (++to_play % players_count);
  }

  return to_play;
};

Match.prototype.get_alive = function (one = false) {
  let state = this.state;

  if (one !== false) { return (state.alive[one]); }
  let nbr = 0;
  for (let i = 0; i < state.alive.length; i++) {
    if (state.alive[i] === true) { nbr++; }
  }

  return nbr;
};

Match.prototype.set_alive = function (pos, set) {
  this.state.alive[pos] = set;
};

Match.prototype.ai_to_play = function () {
  if (!this.is_in_progress(false)) { return false; }

  let player = this.players()[this.state.to_play];
  if (player.is_ai()) {
    return player.ai.pause_time + (this.settings.ais.length === this.settings.players) ? 1500 : 0;
  }

  return false;
};

Match.prototype.play_ai = function (play_now) {
  if (this.ai_to_play() === false) { return false; }

  this.playing_ai = this.players()[this.state.to_play].ai;
  return this.playing_ai;
};

Match.prototype.played_ai = function () {
  this.playing_ai = false;
};

Match.prototype.finish_on_turn = function () {
  if (R5.games[this.game].settings.players.max === 2) {
    let opp_turn = ((turn + 1) % 2);
    this.finish(turn, (opp_turn * 3) + 3);
  }
  else {
    this.finish(turn, -1);
  }
}

Match.prototype.on_type_byo_yomi = function() {
  while (this.timers[turn] < 0 && this.timersbp[turn] > 0) {
    this.timers[turn] += this.timersb[turn];
    this.timersbp[turn]--;
  }
  if (this.timers[turn] > 0) {
    this.timers[turn] = Math.max(this.timers[turn], this.timersb[turn]);
  }
}

Match.prototype.on_type_not_byo_yomi_inc_true = function() {
  if (this.settings.timers === -1) {
    this.timers[turn] = (60 * 60 * 24);
  }
  else {
    this.timers[turn] += this.timersi[turn];
  }
}

Match.prototype.update_timer = function (turn = this.state.to_play, inc = false) {
  let date = new Date();

  if (this.timers[turn] < 0) {
    return;
  }

  let subt = date.getTime() - this.date.getTime();
  this.timers[turn] = Math.max(0, (this.timers[turn] - Math.floor(subt / 1000)));

  this.date = date;

  if (this.timers[turn] === 0) {
    this.finish_on_turn();
    return;
  }

  if (this.is_paused()) { this.timers[turn] += PAUSE_TIME; }
  if (this.settings.timer_type === 'Byo-yomi') {
    this.on_type_byo_yomi();
  }
  else if (inc === true) {
    this.on_type_not_byo_yomi_inc_true();
    this.timers[turn] = Math.min(this.timers[turn], this.settings.timers);
  }
};

Match.prototype.pause = function () {
  this.prev_status = this.status;
  this.status = 'PAUSED';

  setTimeout(function (match) { match.resume(); }, PAUSE_TIME * 1000, this);
};

Match.prototype.resume = function () {
  this.status = this.prev_status;
  this.prev_status = undefined;
};

Match.prototype.is_paused = function () {
  return (this.status === 'PAUSED');
};

Match.prototype.is_ladder = function () {
  return (this.settings.type.ladder);
};

Match.prototype.is_rated = function () {
  return (this.settings.type.rated);
};

Match.prototype.is_private = function () {
  return (this.settings.type.privat);
};

Match.prototype.is_cancelled = function () {
  return (this.decision.result === 'CANCELLED');
};

Match.prototype.can_start = function () {
  return (
    !this.has_started() &&
    this.waiters().length === this.settings.players &&
    this.waiters().every(function (user) { return (user !== null); })
  );
};

Match.prototype.has_started = function () {
  return this.status !== R5.game.statuses.WAIT;
};

Match.prototype.has_finished = function () {
  return this.status === R5.game.statuses.REVIEW;
};

Match.prototype.is_in_progress = function (include_paused = true) {
  let valid_statuses = [R5.game.statuses.PLAY];
  if (include_paused) { valid_statuses.push('PAUSED', 'FINISHING'); }

  return (valid_statuses.indexOf(this.status) >= 0);
};

Match.prototype.can_join = function (user, password) {
  if (this.settings.password && this.settings.password !== R5.encrypted(password)) {
    console.log('incorrect password');
    return false;
  }

  if (!this.has_started() && this.settings.challenge && this.settings.challenge !== user.name) {
    console.log('incorrect challenger');
    return false;
  }

  return true;
};

Match.prototype.add_user_sub_find_user = function(user) {
  return this.players().some(function (u) {
    if (u && u.name === user.name) {
      u.update_status(R5.game.statuses.PLAY);
      return true;
    }
  });
};

Match.prototype.add_user_sub_on_started = function(user, callback) {
  if (this.is_in_progress()) {
    this.update_timer();

    if (this.add_user_sub_find_user(user)) {
      return callback(R5.game.statuses.PLAY);
    }
    else {
      this.viewers_add(user.name, function () {
        return callback(R5.game.statuses.WATCH);
      });
      return;
    }
  }
  else {
    this.viewers_add(user.name, function () {
      return callback(R5.game.statuses.REVIEW);
    });
    return;
  }
};

Match.prototype.add_user_sub_on_wait_waiters = function(user, callback, waiters) {
  for (let i = 0; i < waiters.length; i++) {
    if (waiters[i]) {
      continue;
    }
    waiters[i] = user;
    return callback(R5.game.statuses.WAIT);
  }
};

Match.prototype.add_user_sub_on_wait = function(user, callback) {
  let waiters = this.waiters();
  if (!waiters.some(function (u) { return u && u.name === user.name; })) {
    this.add_user_sub_on_wait_waiters(user, callback, waiters);
  }
};

Match.prototype.add_user = function (user, status, callback) {
  if (this.has_started()) {
    this.add_user_sub_on_started(user, callback);
  }
  else if (status === R5.game.statuses.WAIT) {
    this.add_user_sub_on_wait(user, callback);
  }
  else {
    console.log(`Invalid add_user status: ${status}`);
  }

  return callback(false);
};

Match.prototype.remove_user_sub_call_viewer = function (user, save_only) {
  let _this = this;
  this.viewers(function (viewers) {
    if (viewers.indexOf(user.name) >= 0) {
      _this.viewers_rem(user.name);

      if (!_this.is_in_progress()) {
        if (_this.rematch && _this.rematch.players.indexOf(user.name) >= 0) {
          _this.rematch = false;
        }
        else if (R5.games[_this.game].settings.review) {
          // TODO: update reviewers otherwise?
        }
        else {
          save_only = true;
        }
      }
    }

    _this.emit('updated', _this, save_only, false);
  });
};

Match.prototype.remove_user_sub_on_i = function(user, i, save_only) {
  for (let j = 0; j < this.users.length; j++) {
    // TODO: why are there undefined values??
    const bContinue = !(this.users[i][j] && user.name === this.users[i][j].name);
    if (bContinue) {
      continue;
    }
    
    this.users[i][j].leave_match();

    if (i === R5.game.statuses.WAIT) {
      this.users[i][j] = null;
    }
    else if (i === R5.game.statuses.PLAY) {
      save_only = true;
    }
    else {
      console.log(`Unknown status ${i}`);
    }
  }
  return save_only;
}

Match.prototype.remove_user = function (user) {
  let save_only = false;

  for (let i = 0; i < this.users.length; i++) {
    const bContinue = !this.is_in_progress() && i === R5.game.statuses.PLAY;
    if (bContinue) {
      continue;
    }

    save_only = this.remove_user_sub_on_i(user, i, save_only);
  }

  this.remove_user_sub_call_viewer(user, save_only);
};

Match.prototype.users_on_status = function(status, set) {
  const gamestatus = R5.game.statuses[status];
  if (set) { this.users[gamestatus] = set; }
  return this.users[gamestatus];
};

Match.prototype.players = function (set) {
  return this.users_on_status('PLAY', set);
};

Match.prototype.names = function (status) {
  let names = [];
  let users = this.users[status];

  for (let i = 0; i < users.length; i++) {
    names.push(users[i].name);
  }

  return names;
};

Match.prototype.player_names = function () {
  return this.names(R5.game.statuses.PLAY);
};

Match.prototype.player_jsons = function () {
  let jsons = [];
  let players = this.players();

  for (let i = 0; i < players.length; i++) {
    jsons.push(players[i].to_json(true));
  }

  return jsons;
};

Match.prototype.waiters = function (set) {
  return this.users_on_status('WAIT', set);
};

Match.prototype.viewers = function (callback) {
  R5.redis.get_set(`match_${this.id}_viewers`, function (_err, data) {
    return callback(data);
  });
};

Match.prototype.viewers_add = function (user_name, callback) {
  R5.redis.set_set(`match_${this.id}_viewers`, user_name, function (_err, _data) {
    return callback ? callback() : true;
  });
};

Match.prototype.viewers_rem = function (user_name) {
  R5.redis.delete_set(`match_${this.id}_viewers`, user_name, function (err, _data) {
    if (err) {
      console.log(`viewers_rem error: ${err}`);
    }
  });
};

Match.prototype.to_save = function () {
  this.saved = {
    status: this.status
  };
}

Match.prototype.json_build = function() {
  let json = {};
  this.to_save();

  for (let prop in this) {
    if (
      ['date', 'engine', 'timer', '_events', '_eventsCount', '_maxListeners', 'users'].indexOf(prop) === -1 &&
      this.hasOwnProperty(prop)
    ) {
      json[prop] = this[prop];
    }
  }

  json['date'] = this.date.toJSON();
  json['users'] = users_to_json;
  return json;
}

Match.prototype.json_new_sub_handle_hands = function(user, json) {
  let hands = this.hands;
  if (hands) {
    let i = this.players().findIndex(function (user) {
      return user.name === user_name;
    });
    json.state.hand = i >= 0 ? hands[i] : undefined;
  }

  return json;
}

Match.prototype.json_new = function() {
  let json = {
    id: this.id,
    sid: this.sid,
    decision: this.decision ? this.decision.text : '',
    players: users_to_json,
    settings: this.settings,
    status: to_save ? 'SAVED' : this.status,
    prev_status: this.prev_status
  };

  if (user_name !== false) {
    json.moves = this.moves;
    json.illmoves = this.illmoves;
    json.rematch = this.rematch;
    json.state = this.state;
    json.timers = this.timers;
    json.timersi = this.timersi;
    json.timersb = this.timersb;
    json.timersbp = this.timersbp;

    json = this.json_new_sub_handle_hands(user, json);
  }

  return json;
}

Match.prototype.to_json = function (user_name, to_save = false) {
  let json = {};
  to_save = (!user_name && to_save);

  let users_to_json = this.users.map(function (item) {
    if (item.length <= 0) { return item; }

    return item.map(function (playerObject) {
      if (!playerObject) { return playerObject; }
      return playerObject.to_json();
    });
  });

  if (to_save) {
    json = this.json_build();
  }
  else {
    json = this.json_new();
  }

  return json;
};
