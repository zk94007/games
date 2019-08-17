/* eslint-disable brace-style, camelcase, semi */

module.exports = Pairs_Match;

var Match = require('../Match.js');
var Cards = require('../Cards.js');

// Constructor

function Pairs_Match (set, match = false) {
  this._super.call(this, 'pairs', set, match);
}
Pairs_Match.prototype = Object.create(Match.prototype);
Pairs_Match.prototype.constructor = Pairs_Match;
Pairs_Match.prototype._super = Match;

// Public Methods

Pairs_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }
  var deck = Cards.get_new_deck(0, true);
  var nbr_players = this.settings.players;

  this.aimoves = [];
  this.hstate = deck;
  this.state.board = Cards.turn_down(Cards.copy_deck(deck), false);
  this.state.revealed = [{ i: false, card: false },
                         { i: false, card: false }];
  this.state.scores = (new Array(nbr_players)).fill(0);
  this.state.to_play = 0;

  this.started();
};

Pairs_Match.prototype.make_move = function (player, move) {
  if (!this._super.prototype.make_move.apply(this, arguments)) { return; }

  var players = this.players();
  var state = this.state;
  var turn = state.to_play;

  if (!this.valid_move(move)) {
    this.emit('message', this, player, 'Invalid move (1)');
    return;
  }

  var plyri = -1;
  for (var i = 0; i < players.length; i++) {
    if (players[i].pI === player.pI) { plyri = i; }
  }

  if (move.resign === true) {
    this.moves.push(this.skip_move(turn));
    this.finish(turn, -1);
    return;
  }

  var move_result = this.check_move(move);
  if (move_result === false) {
    this.emit('message', this, player, 'Invalid move (2)');
    return;
  }

  this.aimoves.push({ pos: move.card, card: move_result.card });
  this.moves.push({ player: turn, text: move_result.string });
  if (move_result.nextmove) {
    state.to_play = this.next_turn();
  }

  if (move_result.done) {
    this.finish(plyri, 0);
    return;
  }

  this.update_timer(turn, true);
  this.updated();
};

Pairs_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        typeof move.card !== 'number'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Pairs_Match.prototype.check_move = function (move) {
  var state = this.state;
  var hstate = this.hstate;

  if (hstate[move.card] === false) { return false; }

  var result = { string: '', done: false, nextmove: false, card: false };
  result.string = Cards.get_card_text(hstate, move.card);
  result.card = hstate[move.card];

  if (state.revealed[0].card === false || state.revealed[1].card !== false) {
    state.revealed = [{ i: move.card, card: hstate[move.card] }, { i: false, card: false }];
    state.board[move.card] = hstate[move.card];
    hstate[move.card] = false;
  }
  else {
    if (hstate[move.card].v === state.revealed[0].card.v) {
      state.board[state.revealed[0].i] = false;
      state.board[move.card] = false;
      hstate[move.card] = false;
      state.revealed[0] = { i: false, card: false };
      state.scores[state.to_play]++;
    }
    else {
      state.board = Cards.turn_down(state.board, state.revealed[0].i);
      hstate[state.revealed[0].i] = state.revealed[0].card;
      state.revealed[1] = { i: move.card, card: hstate[move.card] };
      result.nextmove = true;
    }
  }

  var paired = 0;
  for (var i = 0; i < state.scores.length; i++) {
    paired += state.scores[i];
  }

  if (paired === 26) { result.done = true; }
  return result;
};

Pairs_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var state = this.state;
  var hstate = this.hstate;

  if (ai.name === 'Tammet') {
    var turn = state.to_play;
    var plyri = state.to_play;

    var move = find_move(this, ai.level * this.players().length);
    var move_result = this.check_move(move);

    this.aimoves.push({ pos: move.card, card: move_result.card });
    this.moves.push({ player: turn, text: move_result.string });
    if (move_result.nextmove) {
      state.to_play = this.next_turn();
    }

    if (move_result.done) {
      this.finish(plyri, 0);
      return;
    }

    this.update_timer(turn, true);
    this.updated();
  }

  function find_move (match, memory) {
    var card = false; var i;

    var matches = {}; var called = [];
    for (i = Math.max(0, match.aimoves.length - memory); i < match.aimoves.length; i++) {
      if (hstate[match.aimoves[i].pos] !== false) {
        called.push(match.aimoves[i].pos);
        if (state.revealed[0].card === false || state.revealed[0].i !== match.aimoves[i].pos) {
          if (matches[match.aimoves[i].card.v] === undefined) {
            matches[match.aimoves[i].card.v] = [];
          }
          matches[match.aimoves[i].card.v].push(match.aimoves[i].pos);
        }
      }
    }

    if (state.revealed[0].card !== false) {
      if (matches[state.revealed[0].card.v] !== undefined) {
        card = matches[state.revealed[0].card.v][0];
      }
    }
    else {
      for (var m in matches) {
        if (matches[m].length > 1) { card = matches[m][0]; }
      }
    }

    i = Math.floor(Math.random() * hstate.length);
    while (card === false) {
      if (hstate[i] !== false && called.indexOf(i) === -1) {
        card = i;
      }
      i++;
      if (i >= hstate.length) { i = 0; }
    }

    return { card: card };
  }
};

Pairs_Match.prototype.skip_move = function (turn) {
  return { player: turn, text: '-' };
};

Pairs_Match.prototype.finish = function (turn, decision) {
  var i;

  if (this.status !== 'FINISH') {
    if (decision < 0) {
      this.moves.push(this.skip_move(turn));
      this.set_alive(turn, false);

      var alive = this.get_alive(false);
      if (alive > 1) {
        this.state.to_play = this.next_turn();
        this.updated();
        return;
      }
      else if (alive === 1) {
        var paired = 0; var one = false;
        for (i = 0; i < this.state.scores.length; i++) {
          paired += this.state.scores[i];
          if (this.get_alive(i)) { one = i; }
        }
        if (paired < 26) { this.state.scores[one] += 26 - paired; }
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
          if (this.state.scores[i] < this.state.scores[j]) { places[i]++; ties[i] = 1; }
          if (this.state.scores[i] === this.state.scores[j]) { ties[i]++; }
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
    fileout += (i > 0 ? ', ' : '') + this.moves[i].text;
  }

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: ratings,
    text: output });
};
