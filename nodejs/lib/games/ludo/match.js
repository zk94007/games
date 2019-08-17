/* eslint-disable brace-style, camelcase, semi */

module.exports = Ludo_Match;

var Match = require('../Match.js');
var Engine = require('./engine.js');

// Constructor

function Ludo_Match (set, match = false) {
  this._super.call(this, 'ludo', set, match);
}
Ludo_Match.prototype = Object.create(Match.prototype);
Ludo_Match.prototype.constructor = Ludo_Match;
Ludo_Match.prototype._super = Match;

// Public Methods

Ludo_Match.prototype.reload = function () {
  this.state = Engine.reload_game(this.state);

  this._super.prototype.reload.apply(this, arguments);
};

Ludo_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }

  this.started();
};

Ludo_Match.prototype.started = function () {
  var state = Engine.new_game(this.players());
  for (var attr in state) { this.state[attr] = state[attr]; }
  console.log(this.state);

  this._super.prototype.started.apply(this, arguments);
};

Ludo_Match.prototype.make_move = function (player, move) {
  if (!this._super.prototype.make_move.apply(this, arguments)) { return; }

  var state = this.state;
  var turn = state.to_play;

  if (!this.valid_move(move)) {
    this.emit('message', this, player, 'Invalid move (1)');
    return;
  }

  if (move.resign === true) {
    this.finish(turn, -1);
    return;
  }

  move = check_move(this, move.move);
  if (move === false) {
    this.emit('message', this, player, 'Invalid move (2)');
    return;
  }

  var cont = update_state(this, turn);
  if (cont === false) { return; }

  this.update_timer(turn, true);
  this.updated();
};

Ludo_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        typeof move.move !== 'string' &&
        typeof move.move.player !== 'number' &&
        typeof move.move.position !== 'number'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Ludo_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var turn = this.state.to_play;

  check_move(this);
  var cont = update_state(this, turn);
  if (cont === false) { return; }

  this.update_timer(turn, true);
  this.updated();
};

Ludo_Match.prototype.finish = function (turn, decision) {
  var i;

  if (this.status !== 'FINISH') {
    if (decision < 0) {
      this.state.resign();

      if (this.state.has_ended() === false) {
        this.updated();
        return;
      }
    }

    this._super.prototype.finish.apply(this, arguments);
    return;
  }

  var players = this.players();

  var outputs = [[], []];
  var places = new Array(players.length);
  var ties = new Array(players.length);
  var ratings = new Array(players.length);

  if (this.is_ladder() || this.moves.length > players.length) {
    for (i = 0; i < players.length; i++) {
      places[i] = 1.0; ties[i] = 1;

      for (var j = 0; j < players.length; j++) {
        if (i !== j) {
          if (this.state.scores[i].final < this.state.scores[j].final) { places[i]++; ties[i] = 1; }
          if (this.state.scores[i].final === this.state.scores[j].final) { ties[i]++; }
        }
      }

      outputs[places[i] === 1 ? 0 : 1].push(`%p${i}`);
      ratings[i] = 0;
    }
  }
  else {
    for (i = 0; i < players.length; i++) {
      outputs[1].push(`%p${i}`);
    }
  }

  for (i = 0; i < players.length; i++) {
    places[i] += 1.0 - (1.0 / ties[i]);
  }

  var output = '';
  if (outputs[0].length > 0) {
    output = outputs[0].join(', ') + ' Win' + (outputs[0].length === 1 ? 's' : '') + '. ';
  }
  else {
    output = 'Draw: ';
  }
  output += outputs[1].join(', ');
  output += (outputs[0].length > 0 ? ' lose' + (outputs[1].length === 1 ? 's' : '') : '');

  var fileout = '[Result %out]\n\n';
  for (i = 0; i < this.moves.length; i++) {
    if (i > 0) { fileout += ', '; }
    fileout += get_move_text(this.moves[i]);
  }

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: ratings,
    text: output });
};

// Private Methods

function update_state (match, turn) {
  match.moves.push(match.state.game_state.pubSub.last_move);
  if (match.state.has_ended() === true) {
    match.finish(turn, 0);
    return false;
  }
  return true;
}

function check_move (match, move) {
  return (match.state.play(move) !== false);
}

function get_move_text (move) {
  return (move.player + ':' + move.roll + ':' + (move.piece !== false ? move.piece.id : 'pass'));
}
