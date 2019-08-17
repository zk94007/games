/* eslint-disable brace-style, camelcase, semi */

module.exports = Align4_Match;

var Match = require('../Match.js');

const PLAYER_1 = 0; const PLAYER_2 = 1;
const BOARD_OUTSIDE = 2; const BOARD_EMPTY = -1;

// Constructor

function Align4_Match (set, match = false) {
  this._super.call(this, 'align-4', set, match);
}

Align4_Match.prototype = Object.create(Match.prototype);
Align4_Match.prototype.constructor = Align4_Match;
Align4_Match.prototype._super = Match;

// Public Methods

Align4_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }

  this.state.board = (new Array(8));
  this.state.draw = false;
  this.state.height = (new Array(8)).fill(5);
  this.state.to_play = 0;

  for (let i = 0; i < 7; i++) {
    this.state.board[i] = [];
    for (let j = 0; j < 6; j++) {
      this.state.board.push(BOARD_EMPTY);
    }
  }

  this.started();
};

Align4_Match.prototype.make_move = function (player, move) {
  if (!this._super.prototype.make_move.apply(this, arguments)) { return; }

  let players = this.players();
  let state = this.state;
  let turn = state.to_play;

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

  move = parseInt(move.col, 10);
  if (make_move(this, move) === false) {
    this.emit('message', this, player, 'Invalid move (2)');
    return;
  }

  update_state(this, turn, move);
};

Align4_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && typeof move.col !== 'number'
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Align4_Match.prototype.play_ai = function (play_now) {
  let ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  let state = this.state;
  let turn = state.to_play;

  let move = computer_move(this);
  if (make_move(this, move) === false) {
    console.log('Match ' + this.id + ': bad move by AI');
    console.log(move);
    return;
  }

  update_state(this, turn, move);
};

Align4_Match.prototype.finish = function (turn, decision) {
  if (this.status !== 'FINISH') {
    this._super.prototype.finish.apply(this, arguments);
    return;
  }

  let output = ''; let places = [];
  if (decision === 0) {
    places = [1.5, 1.5];
    output = 'Draw: %p0 and %p1';
  }
  else {
    let opp;
    if (decision >= 1 && decision <= 3) {
      places = [1, 2];
      output = '%p0 Wins: '; opp = '%p1';
    }
    else if (decision >= 4 && decision <= 6) {
      places = [2, 1];
      output = '%p1 Wins: '; opp = '%p0';
    }
    if (decision % 3 === 1) { output += opp + ' loses'; }
    else if (decision % 3 === 2) { output += opp + ' resigns'; }
    else if (decision % 3 === 0) { output += opp + ' times-out'; }
  }

  let fileout = '[Result %out]\n\n';
  for (let i = 0; i < this.moves.length; i++) {
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

function make_move (match, move) {
  if (match.state.height[move] >= 0) {
    match.state.board[move][match.state.height[move]] = match.state.to_play;
    match.state.height[move]--;
    return true;
  }
  return false;
}

function update_state (match, turn, move) {
  let state = match.state;

  state.draw = false;
  match.moves.push(move);

  if (check_winner(match, move, state.height[move] + 1, 4, state.to_play, false) === true) {
    match.finish(turn, (state.to_play * 3) + 1);
    return;
  }

  if (
    state.height[0] === -1 && state.height[1] === -1 &&
    state.height[2] === -1 && state.height[3] === -1 &&
    state.height[4] === -1 && state.height[5] === -1 &&
    state.height[6] === -1
  ) {
    match.finish(turn, 0);
    return;
  }

  state.to_play = match.next_turn();

  match.update_timer(turn, true);
  match.updated();
}

function get_piece (match, column, row) {
  if (column < 0 || column > 6 || row < 0 || row > 5) { return BOARD_OUTSIDE; }
  else { return (match.state.board[column][row]); }
}
function check_winner (match, x, y, count, colour1, pruefe_bei_2) {
  let colour2 = (colour1 === PLAYER_1 ? PLAYER_2 : PLAYER_1);
  let win = false;
  let j;

  for (let k = 0; k <= 3; k++) {
    let sum1 = 0; let sum2 = 0; let sum3 = 0; let sum4 = 0;
    let sum12 = 0; let sum22 = 0; let sum32 = 0; let sum42 = 0;

    for (j = 0; j <= 3; j++) {
      if (get_piece(match, x - k + j, y) === colour1) { sum1++; }
      if (get_piece(match, x, y - k + j) === colour1) { sum2++; }
      if (get_piece(match, x - k + j, y - k + j) === colour1) { sum3++; }
      if (get_piece(match, x + k - j, y - k + j) === colour1) { sum4++; }
      if (get_piece(match, x - k + j, y) === colour2) { sum12++; }
      if (get_piece(match, x, y - k + j) === colour2) { sum22++; }
      if (get_piece(match, x - k + j, y - k + j) === colour2) { sum32++; }
      if (get_piece(match, x + k - j, y - k + j) === colour2) { sum42++; }
      if (get_piece(match, x - k + j, y) === BOARD_OUTSIDE) { sum12++; }
      if (get_piece(match, x, y - k + j) === BOARD_OUTSIDE) { sum22++; }
      if (get_piece(match, x - k + j, y - k + j) === BOARD_OUTSIDE) { sum32++; }
      if (get_piece(match, x + k - j, y - k + j) === BOARD_OUTSIDE) { sum42++; }
    }

    if (
      (sum1 >= count && sum12 === 0) ||
      (sum2 >= count && sum22 === 0) ||
      (sum3 >= count && sum32 === 0) ||
      (sum4 >= count && sum42 === 0)
    ) {
      win = true;
    }

    if (win === true && pruefe_bei_2 === true) {
      sum12 = 0; sum22 = 0; sum32 = 0; sum42 = 0;
      match.state.board[x][y] = colour1;
      match.state.height[x]--;

      for (j = 0; j <= 3; j++) {
        if (
          sum1 >= count &&
          get_piece(match, x - k + j, y) === BOARD_EMPTY &&
          get_piece(match, x - k + j, match.state.height[x - k + j] + 1) === BOARD_EMPTY
        ) {
          sum12++;
        }
        if (
          sum2 >= count &&
          get_piece(match, x, y - k + j) === BOARD_EMPTY &&
          get_piece(match, x, match.state.height[x] + 1) === BOARD_EMPTY
        ) {
          sum22++;
        }
        if (
          sum3 >= count &&
          get_piece(match, x - k + j, y - k + j) === BOARD_EMPTY &&
          get_piece(match, x - k + j, match.state.height[x - k + j] + 1) === BOARD_EMPTY
        ) {
          sum32++;
        }
        if (
          sum4 >= count &&
          get_piece(match, x + k - j, y - k + j) === BOARD_EMPTY &&
          get_piece(match, x + k - j, match.state.height[x + k - j] + 1) === BOARD_EMPTY
        ) {
          sum42++;
        }
      }

      if (sum12 === 1 || sum22 === 1 || sum32 === 1 || sum42 === 1) {
        win = false;
      }

      match.state.height[x]++;
      match.state.board[x][y] = BOARD_EMPTY;
    }
  }

  return win;
}

function computer_move (match) {
  let chance = [];
  let i, j, k;

  for (i = 0; i < 7; i++) {
    chance[i] = ((i >= 2 && i <= 4) ? 16 : 13) + Math.random() * 4;
  }

  for (i = 0; i <= 6; i++) {
    if (match.state.height[i] < 0) { chance[i] = chance[i] - 30000; }
  }

  let colour1 = match.state.to_play;
  let colour2 = (colour1 === PLAYER_1 ? PLAYER_2 : PLAYER_1);

  for (i = 0; i <= 6; i++) {
    if (check_winner(match, i, match.state.height[i], 3, colour1, false) === true) {
      chance[i] = chance[i] + 20000;
    }

    if (check_winner(match, i, match.state.height[i], 3, colour2, false) === true) {
      chance[i] = chance[i] + 10000;
    }

    if (check_winner(match, i, match.state.height[i] - 1, 3, colour2, false) === true) {
      chance[i] = chance[i] - 4000;
    }

    if (check_winner(match, i, match.state.height[i] - 1, 3, colour1, false) === true) {
      chance[i] = chance[i] - 200;
    }

    if (check_winner(match, i, match.state.height[i], 2, colour2, false) === true) {
      chance[i] = chance[i] + 50 + Math.random() * 3;
    }

    if (check_winner(match, i, match.state.height[i], 2, colour1, true) === true && match.state.height[i] > 0) {
      match.state.board[i][match.state.height[i]] = colour1;
      match.state.height[i]--;
      let count = 0;
      for (j = 0; j <= 6; j++) {
        if (check_winner(match, j, match.state.height[j], 3, colour1, false) === true) {
          count++;
        }
      }
      if (count === 0) { chance[i] = chance[i] + 60 + Math.random() * 2; }
      else { chance[i] = chance[i] - 60; }
      match.state.height[i]++;
      match.state.board[i][match.state.height[i]] = BOARD_EMPTY;
    }

    if (check_winner(match, i, match.state.height[i] - 1, 2, colour2, false) === true) {
      chance[i] = chance[i] - 10;
    }

    if (check_winner(match, i, match.state.height[i] - 1, 2, colour1, false) === true) {
      chance[i] = chance[i] - 8;
    }

    if (check_winner(match, i, match.state.height[i], 1, colour2, false) === true) {
      chance[i] = chance[i] + 5 + Math.random() * 2;
    }

    if (check_winner(match, i, match.state.height[i], 1, colour1, false) === true) {
      chance[i] = chance[i] + 5 + Math.random() * 2;
    }

    if (check_winner(match, i, match.state.height[i] - 1, 1, colour2, false) === true) {
      chance[i] = chance[i] - 2;
    }

    if (check_winner(match, i, match.state.height[i] - 1, 1, colour1, false) === true) {
      chance[i] = chance[i] + 1;
    }

    // search for tricks
    if (check_winner(match, i, match.state.height[i], 2, colour1, true) === true && match.state.height[i] > 0) {
      match.state.board[i][match.state.height[i]] = colour1;
      match.state.height[i]--;
      for (k = 0; k <= 6; k++) {
        if (check_winner(match, k, match.state.height[k], 3, colour1, false) === true && match.state.height[k] > 0) {
          match.state.board[k][match.state.height[k]] = colour2;
          match.state.height[k]--;
          for (j = 0; j <= 6; j++) {
            if (check_winner(match, j, match.state.height[j], 3, colour1, false) === true) {
              chance[i] = chance[i] + 2000;
            }
          }
          match.state.height[k]++;
          match.state.board[k][match.state.height[k]] = BOARD_EMPTY;
        }
      }
      match.state.height[i]++;
      match.state.board[i][match.state.height[i]] = BOARD_EMPTY;
    }

    // search opponent's tricks
    if (check_winner(match, i, match.state.height[i], 2, colour2, true) === true && match.state.height[i] > 0) {
      match.state.board[i][match.state.height[i]] = colour2;
      match.state.height[i]--;
      for (k = 0; k <= 6; k++) {
        if (check_winner(match, k, match.state.height[k], 3, colour2, false) === true && match.state.height[k] > 0) {
          match.state.board[k][match.state.height[k]] = colour1;
          match.state.height[k]--;
          for (j = 0; j <= 6; j++) {
            if (check_winner(match, j, match.state.height[j], 3, colour2, false) === true) {
              chance[i] = chance[i] + 1000;
            }
          }
          match.state.height[k]++;
          match.state.board[k][match.state.height[k]] = BOARD_EMPTY;
        }
      }
      match.state.height[i]++;
      match.state.board[i][match.state.height[i]] = BOARD_EMPTY;
    }

    if (check_winner(match, i, match.state.height[i] - 1, 2, colour2, true) === true && match.state.height[i] > 1) {
      match.state.board[i][match.state.height[i]] = colour2;
      match.state.height[i]--;
      for (k = 0; k <= 6; k++) {
        if (check_winner(match, k, match.state.height[k] - 1, 3, colour2, false) === true && match.state.height[k] > 0) {
          match.state.board[k][match.state.height[k]] = colour1;
          match.state.height[k]--;
          for (j = 0; j <= 6; j++) {
            if (check_winner(match, j, match.state.height[j] - 1, 3, colour2, false) === true) {
              chance[i] = chance[i] - 500;
            }
          }
          match.state.height[k]++;
          match.state.board[k][match.state.height[k]] = BOARD_EMPTY;
        }
      }
      match.state.height[i]++;
      match.state.board[i][match.state.height[i]] = BOARD_EMPTY;
    }
  }

  let column = 0;
  let x = -10000;
  for (i = 0; i <= 6; i++) {
    if (chance[i] > x) {
      x = chance[i];
      column = i;
    }
  }

  return column;
}
