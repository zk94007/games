/* eslint-disable brace-style, camelcase, semi */

module.exports = Backgammon_Match;

var Match = require('../Match.js');
var Engine = require('./engine.js');

// Constructor

function Backgammon_Match (set, match = false) {
  this._super.call(this, 'backgammon', set, match);
}
Backgammon_Match.prototype = Object.create(Match.prototype);
Backgammon_Match.prototype.constructor = Backgammon_Match;
Backgammon_Match.prototype._super = Match;

// Public Methods

Backgammon_Match.prototype.reload = function () {
  this.state = Engine.reload_game(this.state);

  this._super.prototype.reload.apply(this, arguments);
};

Backgammon_Match.prototype.start = function () {
  this.state = Engine.new_game();

  if (!this._super.prototype.start.apply(this, arguments)) { return false; }

  this.started();
};

Backgammon_Match.prototype.make_move = function (player, move) {
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
    this.moves.push({ player: turn });
    if (player.name === players[0].name) {
      this.finish(turn, ((1 * 3) + 2));
    }
    else { this.finish(turn, ((0 * 3) + 2)); }
    return;
  }

  var rtrn = false;
  if (move.pass === true) {
    rtrn = Engine.pass_move(state);
  }
  else {
    rtrn = Engine.make_move(state, move.sourcePoint, move.targetPoint);
  }

  if (rtrn === false) {
    this.emit('message', this, player, 'Invalid move (2)');
    return;
  }
  state = rtrn;

  state.draw = false;
  this.moves = state.history;

  if (state.winner !== false) {
    this.finish(turn, (state.winner * 3) + 1);
    return;
  }
  else if (this.moves.length > 500) {
    this.finish(turn, 0);
    return;
  }

  this.update_timer(turn, true);
  this.updated();
};

Backgammon_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && move.pass !== true && (
        typeof move.sourcePoint !== 'object' ||
        typeof move.targetPoint !== 'object' ||
        typeof move.player !== 'number'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Backgammon_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var state = this.state;
  var turn = state.to_play;

  var rtrn = Engine.make_ai_move(state);
  if (rtrn === false) {
    console.log('Match ' + this.id + ': bad move by AI');
    return;
  }

  state.draw = false;

  this.moves = state.history;

  if (state.winner !== false) {
    this.finish(turn, (state.winner * 3) + 1);
    return;
  }
  else if (this.moves.length > 500) {
    this.finish(turn, 0);
    return;
  }

  this.update_timer(turn, true);
  this.updated();
};

Backgammon_Match.prototype.finish = function (turn, decision) {
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
    if (decision % 3 === 1) { output += opp + ' loses'; }
    else if (decision % 3 === 2) { output += opp + ' resigns'; }
    else if (decision % 3 === 0) { output += opp + ' times-out'; }
  }

  var fileout = '[Result %out]\n\n'; var lastmove = 0;
  for (var i = 0; i < this.moves.length; i++) {
    if (lastmove !== this.moves[i].player) {
      fileout += '. '; lastmove = this.moves[i].player;
    }
    else if (i > 0) { fileout += ', '; }
    fileout += get_move_text(this.moves[i]);
  }
  fileout += '.';

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: [0, 0],
    text: output });
};

// Private Methods

function get_move_text (move) {
  if (move === 'resign') { return 'resign'; }
  else if (move.sourcePoint === undefined) { return 'pass'; }
  return move.sourcePoint.position.lpad(2) + '-' + move.targetPoint.position.lpad(2);
}
