/* eslint-disable brace-style, camelcase, semi */

module.exports = Reversi_Match;

var Match = require('../Match.js');

// Constructor

function Reversi_Match (set, match = false) {
  this._super.call(this, 'reversi', set, match);
}
Reversi_Match.prototype = Object.create(Match.prototype);
Reversi_Match.prototype.constructor = Reversi_Match;
Reversi_Match.prototype._super = Match;

// Public Methods

Reversi_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }

  this.state.board = new Array(8);
  this.state.draw = false;
  this.state.score = [0, 0];
  this.state.to_play = 0;

  for (var i = 0; i < 8; i++) {
    this.state.board[i] = new Array(8);
    for (var j = 0; j < 8; j++) {
      this.state.board[i][j] = 0;
    }
  }
  this.state.board[3][4] = -1; this.state.board[3][3] = 1;
  this.state.board[4][4] = 1; this.state.board[4][3] = -1;
  this.state.board[-2] = []; this.state.board[-1] = [];
  this.state.board[8] = []; this.state.board[9] = [];

  this.started();
};

Reversi_Match.prototype.make_move = function (player, move) {
  if (!this._super.prototype.make_move.apply(this, arguments)) { return; }

  var players = this.players();
  var state = this.state;
  var turn = state.to_play;

  if (move.draw === true && state.draw !== player.name) {
    if (state.draw !== false) {
      this.finish(turn, 0);
    }
    else {
      state.draw = player.name;
      if (this.settings.ais > 0) {
        state.draw = false;
        this.emit('message', this, player, 'AI will not accept draw offers');
      }
      else {
        this.update_timer(turn, false);
        this.updated();
      }
    }

    return;
  }

  if (!this.valid_move(move)) {
    this.emit('message', this, player, 'Invalid move (1)');
    return;
  }

  if (move.resign === true) {
    this.moves.push(this.skip_move(turn));
    if (player.name === players[0].name) {
      this.finish(turn, ((1 * 3) + 2));
    }
    else { this.finish(turn, ((0 * 3) + 2)); }
    return;
  }

  if (is_valid_move(state, move.x + 1, move.y + 1, ((turn === 0) ? 1 : -1)) === false) {
    this.emit('message', this, player, 'Invalid move (2)');
    return;
  }

  commit_move(state, move.x + 1, move.y + 1, ((turn === 0) ? 1 : -1));
  state.draw = false;

  this.moves.push({ player: turn, text: point_to_coord((move.y * 8) + move.x) });

  var dec = 0;
  state.score[0] = calc_score(state, 1);
  state.score[1] = calc_score(state, -1);
  if (state.score[0] > state.score[1]) {
    state.fscore = state.score[0] - state.score[1]; dec = 0;
  }
  else if (state.score[1] > state.score[0]) {
    state.fscore = state.score[1] - state.score[0]; dec = 1;
  }

  state.to_play = this.next_turn();

  var vmoves = valid_moves_exist(state, ((state.to_play === 0) ? 1 : -1));
  if (vmoves === false) {
    this.moves.push({ player: state.to_play, text: 'pass' });
    state.to_play = this.next_turn();
    vmoves = valid_moves_exist(state, ((state.to_play === 0) ? 1 : -1));
    if (vmoves === false) {
      this.moves.push({ player: state.to_play, text: 'pass' });
      this.finish(turn, ((dec * 3) + 1));
      return;
    }
  }

  this.update_timer(turn, true);
  this.updated();
};

Reversi_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        typeof move.x !== 'number' ||
        typeof move.y !== 'number'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Reversi_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var state = this.state;
  var turn = state.to_play;

  var move = find_move((turn === 0) ? 1 : -1);
  state.draw = false;

  this.moves.push({ player: turn, text: point_to_coord((move.y * 8) + move.x) });

  var dec = 0;
  state.score[0] = calc_score(state, 1);
  state.score[1] = calc_score(state, -1);
  if (state.score[0] > state.score[1]) {
    state.fscore = state.score[0] - state.score[1]; dec = 0;
  }
  else if (state.score[1] > state.score[0]) {
    state.fscore = state.score[1] - state.score[0]; dec = 1;
  }

  state.to_play = this.next_turn();

  var vmoves = valid_moves_exist(state, ((state.to_play === 0) ? 1 : -1));
  if (vmoves === false) {
    this.moves.push({ player: state.to_play, text: 'pass' });
    state.to_play = this.next_turn();
    vmoves = valid_moves_exist(state, ((state.to_play === 0) ? 1 : -1));
    if (vmoves === false) {
      this.moves.push({ player: state.to_play, text: 'pass' });
      this.finish(turn, ((dec * 3) + 1));
      return;
    }
  }

  this.update_timer(turn, true);
  this.updated();

  function find_move (c) {
    var highy = 0; var highx = 0;
    var highscore = 0; var currscore = 0;

    for (var i = 1; i <= 8; i++) {
      for (var j = 1; j <= 8; j++) {
        currscore = get_value(state, i, j, c);
        if (currscore > highscore) {
          highx = i; highy = j;
          highscore = currscore;
        }
      }
    }

    commit_move(state, highx, highy, c);
    return { x: highx - 1, y: highy - 1 };
  }
};

Reversi_Match.prototype.skip_move = function (turn) {
  return { player: turn, text: 'resign' };
};

Reversi_Match.prototype.finish = function (turn, decision) {
  if (this.status !== 'FINISH') {
    this._super.prototype.finish.apply(this, arguments);
    return;
  }

  var output = ''; var places = [];
  if (decision === 0) {
    places = [1.5, 1.5];
    output = 'Draw: %p0 and %p1';
  }
  else {
    var opp;
    if (decision >= 1 && decision <= 3) {
      places = [1, 2];
      output = '%p0 Wins'; opp = ': %p1';
    }
    else if (decision >= 4 && decision <= 6) {
      places = [2, 1];
      output = '%p1 Wins'; opp = ': %p0';
    }
    if (decision % 3 === 1) {
      output += ' with score ' + plus_minus(this.state.fscore) + '' + opp + ' loses';
    }
    else if (decision % 3 === 2) { output += opp + ' resigns'; }
    else if (decision % 3 === 0) { output += opp + ' times-out'; }
  }

  var fileout = '[Result %out]\n\n';
  for (var i = 0; i < this.moves.length; i++) {
    if (i % 2 === 0) { fileout += ((i + 2) / 2) + '. ' + this.moves[i] + ' '; }
    else { fileout += this.moves[i] + ' '; }
  }

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: [0, 0],
    text: output });
};

// Private Methods

function is_valid_move (state, c, d, e) {
  return c < 1 || c > 8 || d < 1 || d > 8 || state.board[c - 1][d - 1] !== 0 || !0 !== can_capture(state, c, d, e) ? !1 : !0;
}

function valid_moves_exist (state, c) {
  var result = false;
  for (var i = 1; i <= 8; ++i) {
    for (var j = 1; j <= 8; ++j) {
      if (is_valid_move(state, i, j, c)) {
        return true;
      }
    }
  }
  return result;
}

function can_capture (state, c, d, e) {
  for (var a = -1; a <= 1; ++a) {
    for (var b = -1; b <= 1; ++b) {
      if ((a !== 0 || b !== 0) && can_capture_dir(state, c, d, a, b, e)) {
        return !0;
      }
    }
  }
  return !1;
}

function can_capture_dir (state, c, d, e, f, g) {
  var thiscolor = g;
  var thatcolor = 0;
  if (thiscolor === 1) { thatcolor = -1; }
  if (thiscolor === -1) { thatcolor = 1; }
  return c + e + e < 1 || c + e + e > 8 || d + f + f < 1 || d + f + f > 8 || state.board[c + e - 1][d + f - 1] === 0 ? !1 : state.board[c + e - 1][d + f - 1] !== thatcolor || (state.board[c + e + e - 1][d + f + f - 1] !== thiscolor && !can_capture_dir(state, c + e, d + f, e, f, thiscolor)) ? !1 : !0;
}

function set_square (state, c, d, e) {
  state.board[c - 1][d - 1] = e;
}

function do_in_betweens (state, c, d, e) {
  for (var i = -1; i <= 1; ++i) {
    for (var j = -1; j <= 1; ++j) {
      (i !== 0 || j !== 0) && can_capture_dir(state, c, d, i, j, e) && do_in_betweens_dir(state, c, d, i, j, e);
    }
  }
}

function do_in_betweens_dir (state, c, d, e, f, g) {
  var thiscolor = g;
  var thatcolor = 0;
  if (thiscolor === 1) { thatcolor = -1; }
  if (thiscolor === -1) { thatcolor = 1; }
  if (state.board[c + e - 1][d + f - 1] === thatcolor) {
    set_square(state, c + e, d + f, thiscolor);
    do_in_betweens_dir(state, c + e, d + f, e, f, thiscolor);
  }
}

function score_in_betweens_dir (state, c, d, e, f, g) {
  var thiscolor = g;
  var result = 0; var thatcolor = 0;
  if (thiscolor === 1) { thatcolor = -1; }
  else if (thiscolor === -1) { thatcolor = 1; }
  if (state.board[c + e - 1][d + f - 1] === thatcolor) {
    ++result;
    result += score_in_betweens_dir(state, c + e, d + f, e, f, thiscolor);
  }
  return result;
}

function get_value (state, c, d, e) {
  var score = 0; var x;
  if (is_valid_move(state, c, d, e)) {
    for (score = 1, x = -1; x <= 1; x++) {
      for (var y = -1; y <= 1; y++) {
        (x !== 0 || y !== 0) && can_capture_dir(state, c, d, x, y, e) && (score += score_in_betweens_dir(state, c, d, x, y, e));
      }
    }
  }
  return score;
}

function commit_move (state, c, d, e) {
  is_valid_move(state, c, d, e);
  set_square(state, c, d, ((state.to_play === 0) ? 1 : -1));
  do_in_betweens(state, c, d, e);
}

function point_to_coord (move) {
  var ltrs = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  var nbrs = [1, 2, 3, 4, 5, 6, 7, 8];
  return (ltrs[(move % 8)] + '' + nbrs[Math.floor(move / 8)]);
}

function calc_score (state, col) {
  var result = 0;
  for (var i = 0; i < 8; i++) {
    for (var j = 0; j < 8; j++) {
      if (state.board[i][j] === col) { result++; }
    }
  }
  return result;
}

function plus_minus (nbr) {
  if (nbr > 0) { return '+' + nbr; }
  else { return nbr; }
}
