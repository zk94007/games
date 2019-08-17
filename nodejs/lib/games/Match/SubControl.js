var Match = require(`${__dirname}/../Match.js`);

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
    
    return get_alive(state);
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
  