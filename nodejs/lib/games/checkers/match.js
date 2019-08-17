/* eslint-disable brace-style, camelcase, semi */

module.exports = Checkers_Match;

var Match = require('../Match.js');

// Constructor

function Checkers_Match (set, match = false) {
  this._super.call(this, 'checkers', set, match);
}
Checkers_Match.prototype = Object.create(Match.prototype);
Checkers_Match.prototype.constructor = Checkers_Match;
Checkers_Match.prototype._super = Match;

// Public Methods

Checkers_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }

  this.state.board = [];
  this.state.double_jump = false;
  this.state.draw = false;
  this.state.last_capture = 0;
  this.state.to_play = 0;

  var args = [
    0, 1, 0, 1, 0, 1, 0, 1,
    1, 0, 1, 0, 1, 0, 1, 0,
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    -1, 0, -1, 0, -1, 0, -1, 0,
    0, -1, 0, -1, 0, -1, 0, -1,
    -1, 0, -1, 0, -1, 0, -1, 0];
  for (var i = 0; i < 8; i++) {
    this.state.board[i] = [];
    for (var j = 0; j < 8; j++) {
      this.state.board[i][j] = args[8 * j + i];
    }
  }
  this.state.board[-2] = []; this.state.board[-1] = [];
  this.state.board[8] = []; this.state.board[9] = [];

  this.started();
};

Checkers_Match.prototype.make_move = function (player, move) {
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
    this.moves.push('resign');
    if (player.name === players[0].name) {
      this.finish(turn, ((1 * 3) + 2));
    }
    else { this.finish(turn, ((0 * 3) + 2)); }
    return;
  }

  var from = move.start;
  var to = move.end;

  var npc = 1; // var kpc = 1.1;
  var cx = [2, -2]; var cy = [-2, 2];
  if (state.to_play === 1) {
    npc = -1; // kpc = -1.1;
    cx = [-2, 2]; cy = [2, -2];
  }

  var mandatory;
  for (var j = 7; j >= 0; j--) {
    for (var i = 0; i < 8; i++) {
      if (to_integer(state.board[i][j]) === npc) {
        for (var l = 0; l < cy.length; l++) {
          for (var k = 0; k < cx.length; k++) {
            if (
              mandatory !== false &&
              legal_move(state, coord(i, j), coord((i + cx[k]), (j + cy[l])))
            ) {
              if (
                i === from.x && j === from.y &&
                (i + cx[k] === to.x) && (j + cy[l] === to.y)
              ) {
                mandatory = false;
              }
              else {
                mandatory = true;
              }
            }
          }
        }
      }
    }
  }

  if (mandatory || !legal_move(state, from, to)) {
    this.emit('message', this, player, 'Invalid move (2)');
    return;
  }

  this.state.draw = false;

  if (state.double_jump === true) {
    this.moves[this.moves.length - 1] += '-' + point_to_coord((to.y * 8) + to.x);
  }
  else {
    this.moves.push(point_to_coord((from.y * 8) + from.x) + '-' +
      point_to_coord((to.y * 8) + to.x));
  }

  if (Math.abs(to.y - from.y) > 1) {
    state.last_capture = this.moves.length - 1;
  }
  else if ((this.moves.length - state.last_capture) >= 50) {
    this.finish(turn, 0);
    return;
  }

  var piece = state.board[from.x][from.y];
  var distance = coord(to.x - from.x, to.y - from.y);

  if ((Math.abs(distance.x) === 1) && (state.board[to.x][to.y] === 0)) {
    swap(state, from, to);
  }
  else if (
    (Math.abs(distance.x) === 2) &&
    (to_integer(piece) !== to_integer(state.board[from.x + sign(distance.x)][from.y + sign(distance.y)]))
  ) {
    state.double_jump = false;
    swap(state, from, to);
    remove(state, from.x + sign(distance.x), from.y + sign(distance.y));
    if (
      (legal_move(state, to, coord(to.x + 2, to.y + 2))) ||
      (legal_move(state, to, coord(to.x + 2, to.y - 2))) ||
      (legal_move(state, to, coord(to.x - 2, to.y - 2))) ||
      (legal_move(state, to, coord(to.x - 2, to.y + 2)))
    ) {
      state.double_jump = true;
    }
  }

  if ((state.board[to.x][to.y] === 1) && (to.y === 7)) {
    king_me(state, to.x, to.y);
  }
  else if ((state.board[to.x][to.y] === -1) && (to.y === 0)) {
    king_me(state, to.x, to.y);
  }

  var oturn = ((!state.double_jump) ? turn + 1 : turn) % 2;
  if (game_over(state, ((oturn === 0) ? 1 : -1)) !== false) {
    this.finish(turn, ((turn * 3) + 1));
    return;
  }

  if (!state.double_jump) {
    state.to_play = this.next_turn();
  }

  this.update_timer(turn, true);
  this.updated();
};

Checkers_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        typeof move.start !== 'object' ||
        typeof move.start.x !== 'number' ||
        typeof move.start.y !== 'number' ||
        typeof move.end !== 'object' ||
        typeof move.end.x !== 'number' ||
        typeof move.end.y !== 'number'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Checkers_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var state = this.state;
  var turn = state.to_play;
  var oturn = (turn + 1) % 2;

  var move = computer(state);
  this.state.draw = false;

  if (move === false) {
    this.finish(turn, ((oturn * 3) + 1));
    return;
  }

  move = '';
  for (var i = 0; i < state.comp_move_from.length; i++) {
    var from = state.comp_move_from[i]; var to = state.comp_move_to[i];
    if (i === 0) {
      move += point_to_coord((from.y * 8) + from.x) + '-' +
        point_to_coord((to.y * 8) + to.x);
    }
    else {
      move += '-' + point_to_coord((to.y * 8) + to.x);
    }
  }
  this.moves.push(move);
  state.comp_move_from = []; state.comp_move_to = [];

  if (Math.abs(to.y - from.y) > 1) {
    state.last_capture = this.moves.length - 1;
  }
  else if ((this.moves.length - state.last_capture) >= 50) {
    this.finish(turn, 0);
    return;
  }

  if (game_over(state, ((oturn === 0) ? 1 : -1)) !== false) {
    this.finish(turn, ((turn * 3) + 1));
    return;
  }

  state.to_play = this.next_turn();

  this.update_timer(turn, true);
  this.updated();
};

Checkers_Match.prototype.finish = function (turn, decision) {
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
      output = '%p0 Wins: '; opp = '%p1';
    }
    else if (decision >= 4 && decision <= 6) {
      places = [2, 1];
      output = '%p1 Wins: '; opp = '%p0';
    }
    if (decision % 3 === 1) { output += opp + ' has no moves'; }
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

function coord (x, y) {
  return { x: x, y: y };
}

function to_integer (num) {
  if (num != null) return Math.round(num);
  else return null;
}

function sign (num) {
  if (num < 0) return -1;
  else return 1;
}

function legal_move (state, from, to) {
  if ((to.x < 0) || (to.y < 0) || (to.x > 7) || (to.y > 7)) return false;

  var piece = state.board[from.x][from.y];
  var distance = coord(to.x - from.x, to.y - from.y);

  if (distance.x === 0 || distance.y === 0) {
    return false;
  }
  if (Math.abs(distance.x) !== Math.abs(distance.y)) {
    return false;
  }
  if (Math.abs(distance.x) > 2) {
    return false;
  }
  if (Math.abs(distance.x) === 1 && state.double_jump) {
    return false;
  }
  if (state.board[to.x][to.y] !== 0 || piece === 0) {
    return false;
  }
  if (
    (Math.abs(distance.x) === 2) &&
    (to_integer(piece) !== -to_integer(state.board[from.x + sign(distance.x)][from.y + sign(distance.y)]))
  ) {
    return false;
  }
  if ((to_integer(piece) === piece) && (sign(piece) !== sign(distance.y))) {
    return false;
  }

  return true;
}

function king_me (state, x, y) {
  if (state.board[x][y] === 1) {
    state.board[x][y] = 1.1;
  }
  else if (state.board[x][y] === -1) {
    state.board[x][y] = -1.1;
  }
}

function swap (state, from, to) {
  var dummy_num = state.board[from.x][from.y];
  state.board[from.x][from.y] = state.board[to.x][to.y];
  state.board[to.x][to.y] = dummy_num;
}

function remove (state, x, y) { state.board[x][y] = 0; }

function game_over (state, pl) {
  for (var i = 0; i < 8; i++) {
    for (var j = 0; j < 8; j++) {
      if (to_integer(state.board[i][j]) === pl) {
        var from = coord(i, j);
        if (
          (legal_move(state, from, coord(from.x + 1, from.y + 1))) ||
          (legal_move(state, from, coord(from.x + 1, from.y - 1))) ||
          (legal_move(state, from, coord(from.x - 1, from.y - 1))) ||
          (legal_move(state, from, coord(from.x - 1, from.y + 1))) ||
          (legal_move(state, from, coord(from.x + 2, from.y + 2))) ||
          (legal_move(state, from, coord(from.x + 2, from.y - 2))) ||
          (legal_move(state, from, coord(from.x - 2, from.y - 2))) ||
          (legal_move(state, from, coord(from.x - 2, from.y + 2)))
        ) {
          return false;
        }
      }
    }
  }

  return true;
}

function move_comp (state, from, to) {
  swap(state, from, to);

  if (Math.abs(from.x - to.x) === 2) {
    remove(state, from.x + sign(to.x - from.x), from.y + sign(to.y - from.y));
  }
  if (
    (state.to_play === 0 && to.y === 7 && state.board[to.x][to.y] === 1) ||
    (state.to_play === 1 && to.y === 0 && state.board[to.x][to.y] === -1)
  ) {
    king_me(state, to.x, to.y);
  }

  if (state.comp_move_from === undefined) {
    state.comp_move_from = []; state.comp_move_to = [];
  }
  state.comp_move_from.push(from);
  state.comp_move_to.push(to);

  return true;
}

function computer (state) {
  var npc = 1; var kpc = 1.1;
  var j1 = 1; var j2 = 2; var j3 = -1; var j4 = -2;
  var i, j;

  if (state.to_play === 1) {
    npc = -1; kpc = -1.1;
    j1 = -1; j2 = -2; j3 = 1; j4 = 2;
  }

  // step one - look for jumps
  for (j = 7; j >= 0; j--) {
    for (i = 0; i < 8; i++) {
      if (jump(state, i, j)) return true;
    }
  }

  // step two - prevent any jumps
  for (j = 0; j < 8; j++) {
    for (i = 0; i < 8; i++) {
      if (to_integer(state.board[i][j]) === npc) {
        if (
          (legal_move(state, coord(i, j), coord(i + j2, j + j2))) &&
          (prevent(state, coord(i + j2, j + j2), coord(i + j1, j + j1)))
        ) {
          return true;
        }
        if (
          (legal_move(state, coord(i, j), coord(i + j4, j + j2))) &&
          (prevent(state, coord(i + j4, j + j2), coord(i + j3, j + j1)))
        ) {
          return true;
        }
      }
      if (state.board[i][j] === kpc) {
        if (
          (legal_move(state, coord(i, j), coord(i + j4, j + j4))) &&
          (prevent(state, coord(i + j4, j + j4), coord(i + j3, j + j3)))
        ) {
          return true;
        }
        if (
          (legal_move(state, coord(i, j), coord(i + j2, j + j4))) &&
          (prevent(state, coord(i + j2, j + j4), coord(i + j1, j + j3)))
        ) {
          return true;
        }
      }
    }
  }

  state.safe_from = state.safe_to = null;

  // step three - if step two not taken, look for safe single space moves
  for (j = 0; j < 8; j++) {
    for (i = 0; i < 8; i++) {
      if (single(state, i, j)) { return true; }
    }
  }

  // if no safe moves, just take whatever you can get
  if (state.safe_from != null) {
    move_comp(state, state.safe_from, state.safe_to);
    state.safe_from = state.safe_to = null;
    return true;
  }

  return false;
}

function jump (state, i, j) {
  var npc = 1; var kpc = 1.1;
  var j2 = 2; var j4 = -2; // var j1 = 1; var j3 = -1;

  if (state.to_play === 1) {
    npc = -1; kpc = -1.1;
    j2 = -2; j4 = 2; // j1 = -1; j3 = 1;
  }

  if (state.board[i][j] === kpc) {
    if (legal_move(state, coord(i, j), coord(i + j4, j + j4))) {
      move_comp(state, coord(i, j), coord(i + j4, j + j4));
      jump(state, i + j4, j + j4);
      return true;
    }
    if (legal_move(state, coord(i, j), coord(i + j2, j + j4))) {
      move_comp(state, coord(i, j), coord(i + j2, j + j4));
      jump(state, i + j2, j + j4);
      return true;
    }
  }
  if (to_integer(state.board[i][j]) === npc) {
    if (legal_move(state, coord(i, j), coord(i + j2, j + j2))) {
      move_comp(state, coord(i, j), coord(i + j2, j + j2));
      jump(state, i + j2, j + j2);
      return true;
    }
    if (legal_move(state, coord(i, j), coord(i + j4, j + j2))) {
      move_comp(state, coord(i, j), coord(i + j4, j + j2));
      jump(state, i + j4, j + j2);
      return true;
    }
  }

  return false;
}

function single (state, i, j) {
  var npc = 1; var kpc = 1.1;
  var j1 = 1; var j3 = -1; // var j2 = 2; var j4 = -2;

  if (state.to_play === 1) {
    npc = -1; kpc = -1.1;
    j1 = -1; j3 = 1; // j2 = -2; j4 = 2;
  }

  if (state.board[i][j] === kpc) {
    if (legal_move(state, coord(i, j), coord(i + j3, j + j3))) {
      state.safe_from = coord(i, j);
      state.safe_to = coord(i + j3, j + j3);
      if (wise(state, coord(i, j), coord(i + j3, j + j3))) {
        move_comp(state, coord(i, j), coord(i + j3, j + j3));
        return true;
      }
    }
    if (legal_move(state, coord(i, j), coord(i + j1, j + j3))) {
      state.safe_from = coord(i, j);
      state.safe_to = coord(i + j1, j + j3);
      if (wise(state, coord(i, j), coord(i + j1, j + j3))) {
        move_comp(state, coord(i, j), coord(i + j1, j + j3));
        return true;
      }
    }
  }
  if (to_integer(state.board[i][j]) === npc) {
    if (legal_move(state, coord(i, j), coord(i + j3, j + j1))) {
      state.safe_from = coord(i, j);
      state.safe_to = coord(i + j3, j + j1);
      if (wise(state, coord(i, j), coord(i + j3, j + j1))) {
        move_comp(state, coord(i, j), coord(i + j3, j + j1));
        return true;
      }
    }
    if (legal_move(state, coord(i, j), coord(i + j1, j + j1))) {
      state.safe_from = coord(i, j);
      state.safe_to = coord(i + j1, j + j1);
      if (wise(state, coord(i, j), coord(i + j1, j + j1))) {
        move_comp(state, coord(i, j), coord(i + j1, j + j1));
        return true;
      }
    }
  }

  return false;
}

function possibilities (state, x, y) {
  if (!jump(state, x, y)) {
    if (!single(state, x, y)) {
      return true;
    }
    else {
      return false;
    }
  }
  else {
    return false;
  }
}

function prevent (state, end, s) {
  var i = end.x; var j = end.y;
  var pcs = [1, 1.1]; var cx = [i + 1, i - 1]; var cy = [j - 1, j + 1];

  if (state.to_play === 1) {
    pcs = [-1, -1.1]; cx = [i - 1, i + 1]; cy = [j + 1, j - 1];
  }

  if (!possibilities(state, s.x, s.y)) return true;
  else {
    for (var x = 0; x < cx.length; x++) {
      for (var y = 0; y < cy.length; y++) {
        if (
          (to_integer(state.board[cx[x]][cy[y]]) === pcs[y]) &&
          (legal_move(state, coord(cx[x], cy[y]), coord(i, j)))
        ) {
          return move_comp(state, coord(cx[x], cy[y]), coord(i, j));
        }
      }
    }
  }

  return false;
}

function wise (state, from, to) {
  var i = to.x; var j = to.y;

  var opcs = [-1, -1.1]; var cx = [i + 1, i - 1]; var cy = [j + 1, j - 1];
  var n = (j > 0); var s = (j < 7); var e = (i < 7); var w = (i > 0);

  if (state.to_play === 1) {
    opcs = [1, 1.1]; cx = [i - 1, i + 1]; cy = [j - 1, j + 1];
    n = (j < 7); s = (j > 0); e = (i > 0); w = (i < 7);
  }

  var ne = null; var nw = null; var se = null; var sw = null;
  if (n && e) ne = state.board[cx[0]][cy[0]];
  if (n && w) nw = state.board[cx[1]][cy[0]];
  if (s && e) se = state.board[cx[0]][cy[1]];
  if (s && w) sw = state.board[cx[1]][cy[1]];
  if (state.to_play === 1) {
    eval(((j - from.y < 0) ? 's' : 'n') + ((i - from.x < 0) ? 'w' : 'e') + '=0;');
  }
  else {
    eval(((j - from.y > 0) ? 's' : 'n') + ((i - from.x > 0) ? 'w' : 'e') + '=0;');
  }

  if (sw === 0 && to_integer(ne) === opcs[0]) { return false; }
  if (se === 0 && to_integer(nw) === opcs[0]) { return false; }
  if (nw === 0 && se === opcs[1]) { return false; }
  if (ne === 0 && sw === opcs[1]) { return false; }

  return true;
}

function point_to_coord (move) {
  var ltrs = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  var nbrs = [1, 2, 3, 4, 5, 6, 7, 8];
  return (ltrs[(move % 8)] + '' + nbrs[Math.floor(move / 8)]);
}
