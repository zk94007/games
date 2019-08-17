/* eslint-disable brace-style, camelcase, semi */

module.exports = HoldemPoker_Match;

var Match = require('../Match.js');
var Engine = require('./engine.js');

// Constructor

function HoldemPoker_Match (set, match = false) {
  this._super.call(this, 'holdem-poker', set, match);
}
HoldemPoker_Match.prototype = Object.create(Match.prototype);
HoldemPoker_Match.prototype.constructor = HoldemPoker_Match;
HoldemPoker_Match.prototype._super = Match;

// Public Methods

HoldemPoker_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }
  var nbr_players = this.settings.players;

  this.hands = new Array(nbr_players);
  this.state.board = false;
  this.state.hand = false;
  this.state.previous = { move: false, win: { text: [], hand: '' } };
  this.state.scores = (new Array(nbr_players)).fill(nbr_players);
  this.state.to_play = 0;
  this.state.setting = {
    round: 0,
    blinds: {},
    button_i: 0,
    current: {},
    players: new Array(nbr_players)
  };

  this.started();
};

HoldemPoker_Match.prototype.started = function () {
  this.engine = Engine.new_game(this.player_names(), {
    start_chips: this.settings.chips,
    max_rounds: this.settings.rounds
  });

  update_state(this, false);
  this._super.prototype.started.apply(this, arguments);
};

HoldemPoker_Match.prototype.make_move = function (player, move) {
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

  var match = this;
  Engine.human_move(match.engine, turn, move, function (rtrn) {
    if (rtrn === false) {
      match.emit('message', match, player, 'Invalid move (2)');
      return;
    }

    match.engine = rtrn;

    var cont = update_state(match);
    if (cont !== true) { return; }

    match.update_timer(turn, true);
    match.updated();
  });
};

HoldemPoker_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        typeof move.move !== 'string'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

HoldemPoker_Match.prototype.resume = function () {
  this._super.prototype.resume.apply(this, arguments);

  this.engine = Engine.new_round(this.engine, false);
  update_state(this, false);

  this.updated();
};

HoldemPoker_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var match = this;
  var turn = match.state.to_play;

  Engine.bot_bet(match.engine, match.state.to_play, function (rtrn) {
    match.engine = rtrn;

    var cont = update_state(match);
    if (cont !== true) { return; }

    match.update_timer(turn, true);
    match.updated();
  });
};

HoldemPoker_Match.prototype.get_alive = function (one = false) {
  if (this.has_started()) {
    return this._super.prototype.get_alive.apply(this, arguments);
  }
  else {
    return this.waiters().length;
  }
};

HoldemPoker_Match.prototype.finish = function (turn, decision) {
  var i;

  if (this.status !== 'FINISH') {
    if (decision < 0) {
      this.set_alive(turn, false);

      var alive = this.get_alive(false);
      if (alive > 1) {
        var match = this;
        var args = arguments;

        Engine.human_move(this.engine, turn, { move: 'resign' }, function (rtrn) {
          match.engine = rtrn;
          update_state(match, false);

          alive = match.get_alive(false);
          if (alive > 1) {
            match.updated();
            return;
          }

          match._super.prototype.finish.apply(match, args);
        });

        return;
      }
      else {
        this.state.scores[turn] = this.players().length - alive;
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

  var fileout = '[Chips ' + this.settings.chips + ']\n';
  fileout += '[Rounds ' + this.settings.rounds + ']\n';
  fileout += '[Result %out]\n\n';
  for (i = 0; i < this.moves.length; i++) {
    fileout += (i > 0 ? '; ' : '') + '[' + (i + 1) + '] ' +
      this.moves[i].hand + ': ' + this.moves[i].text.join(', ');
  }

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: ratings,
    text: output });
};

HoldemPoker_Match.prototype.to_save = function () {
  this._super.prototype.to_save.apply(this, arguments);

  this.saved.engine = (this.is_in_progress() ? this.engine : undefined);
};

// Private Methods

function update_state (match, update = true) {
  var engine = match.engine;
  var end_round = false;
  var i;

  if (engine.last_win.text.length > 0) {
    end_round = true;
    match.moves.push({
      hand: engine.last_win.hand,
      text: engine.last_win.text
    });
  }

  match.state.board = engine.board;
  match.state.to_play = engine.to_play;
  match.state.setting.button_i = engine.button_i;
  match.state.setting.round = engine.round;
  match.state.setting.blinds = engine.blinds;
  match.state.setting.current = engine.current;

  var nbr_alive = match.get_alive(false);
  var nbr_players = engine.players.length;

  for (i = 0; i < nbr_players; i++) {
    if (end_round && engine.players[i].bankroll === 0) {
      match.state.alive[i] = false;
      match.state.scores[i] = nbr_players - nbr_alive;
    }
    match.hands[i] = {
      i: i,
      cards: engine.players[i].cards
    };
    match.state.setting.players[i] = {
      bet: {
        subtotal: engine.players[i].subtotal_bet,
        total: engine.players[i].total_bet
      },
      cards: [],
      chips: engine.players[i].bankroll,
      status: engine.players[i].status
    };
    if (engine.show_cards === true) {
      match.state.setting.players[i].cards = match.hands[i].cards;
    }
  }

  nbr_alive = match.get_alive(false);
  if (nbr_alive <= 1) {
    if (update !== false) { match.finish(false, 0); }
    return false;
  }
  else if (end_round === true) {
    if (match.settings.rounds > 0 && match.state.setting.round >= match.settings.rounds) {
      var max_v = 0;

      while (nbr_alive > 0) {
        var low_i = [];
        var low_v = match.settings.chips * nbr_players;

        for (i = 0; i < nbr_players; i++) {
          if (match.state.alive[i]) {
            if (
              match.state.setting.players[i].chips > max_v &&
              match.state.setting.players[i].chips < low_v
            ) {
              low_v = match.state.setting.players[i].chips;
              low_i = [i];
            }
            else if (match.state.setting.players[i].chips === low_v) {
              low_i.push(i);
            }
          }
        }

        for (i = 0; i < low_i.length; i++) {
          match.state.scores[low_i[i]] = nbr_players - nbr_alive;
        }

        nbr_alive -= low_i.length;
        max_v = low_v;
      }

      if (update !== false) { match.finish(false, 0); }
      return false;
    }
    else {
      match.pause();
    }
  }

  return true;
}
