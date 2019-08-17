var Match = require(`${__dirname}/../Match.js`);

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
  
  Match.prototype.start_sub_set_timer_get_value = function(i) {
    return ((this.settings.timers === -1) ? (60 * 60 * 24) : this.settings.timers)
          + (i === 0 ? PAUSE_TIME : 0);
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
      this.timers[i] = this.start_sub_set_timer_get_value(i);
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
  
  Match.prototype.finished_sub_on_player_i = function(players, i, reviewers) {
    if (players[i].is_ai()) {
      return;
    }
    this.viewers_add(players[i].name);
    reviewers.push(players[i].name);
  
    if (this.rematch) {
      this.rematch.players.push(players[i].name);
    }
  }
  
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
      this.finished_sub_on_player_i(players, i, reviewers);
    }
  
    this.finished_sub_call_viewer();
  };
  