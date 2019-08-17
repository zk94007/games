/* eslint-disable brace-style, camelcase, semi */

module.exports = LiarsDice_Match;

var Match = require('../Match.js');
var Dice = require('../Dice.js');

// Constructor

function LiarsDice_Match (set, match = false) {
  this._super.call(this, 'liars-dice', set, match);
}
LiarsDice_Match.prototype = Object.create(Match.prototype);
LiarsDice_Match.prototype.constructor = LiarsDice_Match;
LiarsDice_Match.prototype._super = Match;

// Public Methods

LiarsDice_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }
  var nbr_players = this.settings.players;

  this.hands = new Array(nbr_players);
  for (var i = 0; i < this.hands.length; i++) {
    this.hands[i] = new Array(this.settings.dice);
    for (var j = 0; j < this.hands[i].length; j++) {
      this.hands[i][j] = Dice.get_new_die();
    }
  }

  this.state.hand = false;
  this.state.previous = { move: false, round: false };
  this.state.scores = (new Array(nbr_players)).fill(0);
  this.state.setting = {
    bids: (new Array(nbr_players)).fill(false),
    dice: (new Array(nbr_players)),
    round: 0,
    start: 0
  };
  this.state.to_play = 0;

  reset_visible_dice(this);

  this.started();
};

LiarsDice_Match.prototype.make_move = function (player, move) {
  if (!this._super.prototype.make_move.apply(this, arguments)) { return; }

  var state = this.state;
  var turn = state.to_play;

  if (!this.valid_move(move)) {
    this.emit('message', this, player, 'Invalid move (1)');
    return;
  }

  if (move.resign === true) {
    this.moves.push({ player: turn, text: '-' });
    this.finish(turn, -1);
    return;
  }

  move = check_move(this, turn, move.move);
  if (move === false) {
    this.emit('message', this, player, 'Invalid move (2)');
    return;
  }

  if (update_state(this, turn, move)) {
    this.update_timer(turn, true);
    this.updated();
  }
};

LiarsDice_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        typeof move.move !== 'string' &&
        typeof move.move.face !== 'number' &&
        typeof move.move.count !== 'number' &&
        typeof move.move.re_roll !== 'object' &&
          !Array.isArray(move.move.re_roll)
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

LiarsDice_Match.prototype.resume = function () {
  this._super.prototype.resume.apply(this, arguments);

  var state = this.state;
  var turn = state.to_play;

  state.setting.round++;
  for (var i = 0; i < this.hands.length; i++) {
    if (this.get_alive(i)) {
      this.hands[i] = new Array(state.setting.dice[i].length);
      for (var j = 0; j < this.hands[i].length; j++) {
        this.hands[i][j] = Dice.get_new_die();
        state.setting.dice[i][j] = null;
      }
      state.setting.bids[i] = false;
    }
    else { this.hands[i] = []; }
  }
  state.to_play = state.next_to_play;

  this.update_timer(turn, true);
  this.updated();
};

LiarsDice_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var match = this;
  var state = match.state;
  var turn = state.to_play;
  var hand = match.hands[turn];

  var move = find_move(match);
  if (update_state(this, turn, move)) {
    this.update_timer(turn, true);
    this.updated();
  }

  function find_move () {
    var alive = match.get_alive(false);
    var total_dice = 0; var my_dice = 0;
    var i;

    for (i = 0; i < state.setting.dice.length; i++) {
      total_dice += state.setting.dice[i].length;
      if (turn === i) { my_dice += state.setting.dice[i].length; }
    }

    var previous = { face: 0, count: 0 };
    var bestmove = {}; var bestmove_perc = 0;
    var adjust = Math.pow((
      (match.settings.spot_on ? 1.4 : 1.8) * (match.settings.wild_ones ? 1.8 : 1.4)
    ), alive - 1);

    var perc, adjusted;

    if (state.previous.move !== false) {
      previous = state.previous.move;

      var odds = calculate_odds(previous);
      perc = odds.percent;
      adjusted = Math.min(1, perc * adjust);

      var likely_liar = Math.floor(
        (total_dice - my_dice) / (match.settings.wild_ones && previous.face !== 1 ? 5 : 6)
      ) + odds.my_dice < previous.count;

      if (perc === 0) { return 'liar'; }
      else if (
        perc <= 1 && likely_liar && match.settings.spot_on &&
        random_advance(adjusted) && random_advance(0.75)
      ) {
        bestmove = 'spot';
        bestmove_perc = 1 - adjusted;
      }
      else if (perc < 1 && likely_liar && random_advance(adjusted)) {
        bestmove = 'liar';
        bestmove_perc = 1 - adjusted;
      }
      else if (previous.count === total_dice && previous.face === 6) {
        bestmove = (match.settings.spot_on ? (perc < 0.05 ? 'liar' : 'spot') : 'liar');
        bestmove_perc = 1 - adjusted;
      }

      bestmove_perc = Math.max(0, bestmove_perc / adjust);
    }

    var prev_count = previous.count;
    var max_count = prev_count + 1;
    var start = 1; var end = 6;
    if (match.settings.wild_ones) {
      if (previous.face === 1) { max_count++; }
      else { prev_count = previous.count / 2; }
      start = 2; end = 7;
    }

    for (i = prev_count; i <= max_count; i++) {
      for (var j = start; j <= end; j++) {
        var move = check_move(match, turn, { face: (j === 7 ? 1 : j), count: i });

        if (move !== false) {
          perc = (calculate_odds(move)).percent;
          adjusted = Math.min(1, perc * adjust);

          if (bestmove_perc === 0) {
            bestmove = move;
            bestmove_perc = adjusted;
          }
          if (adjusted >= bestmove_perc && random_advance(0.77)) {
            bestmove = move;
            bestmove_perc = adjusted;
          }
          else if (perc >= (bestmove_perc * 0.86) && random_advance(1 - perc)) {
            bestmove = move;
            bestmove_perc = perc;
          }
        }
      }
    }

    return bestmove;
  }

  function calculate_odds (move) {
    var rtrn = { my_dice: 0, percent: 0.0 };
    var i;

    var needed_dice = move.count;
    for (i = 0; i < hand.length; i++) {
      if (move.face === hand[i] || (match.settings.wild_ones && hand[i] === 1)) {
        needed_dice--;
        rtrn.my_dice++;
      }
    }

    var total_dice = 0;
    for (i = 0; i < state.setting.dice.length; i++) {
      if (i !== turn) {
        for (var j = 0; j < state.setting.dice[i].length; j++) {
          total_dice++;
          if (
            move.face === state.setting.dice[i][j] ||
            (match.settings.wild_ones && state.setting.dice[i][j] === 1)
          ) {
            needed_dice--;
          }
        }
      }
    }

    if (needed_dice <= 0) {
      rtrn.percent = (needed_dice < 0 ? 1.01 : 1);
    }
    else if (needed_dice > total_dice) {
      rtrn.percent = 0;
    }
    else {
      var total_perc = 1.0 * Math.pow(6, total_dice);
      var base_perc = 1.0 * Math.pow((match.settings.wild_ones ? 2 : 1), needed_dice);
      base_perc += Math.pow(6, total_dice - needed_dice);
      rtrn.percent = 1.0 * base_perc / total_perc;
    }

    return rtrn;
  }

  function random_advance (high) {
    return Math.random() > high;
  }
};

LiarsDice_Match.prototype.finish = function (turn, decision) {
  var i;

  if (this.status !== 'FINISH') {
    if (decision < 0) {
      this.set_alive(turn, false);
      this.state.setting.dice[turn] = new Array();
      this.hands[turn] = [];

      var alive = this.get_alive(false);
      this.state.scores[turn] = alive;

      if (alive > 1) {
        this.state.to_play = this.next_turn();
        this.updated();
        return;
      }
    }

    this._super.prototype.finish.apply(this, arguments);
    return;
  }

  var players = this.players();
  this.hands = (new Array(players.length)).fill([]);

  var outputs = [[], []];
  var places = new Array(players.length);
  var ties = new Array(players.length);
  var ratings = new Array(players.length);

  if (this.is_ladder() || this.moves.length > players.length) {
    for (i = 0; i < players.length; i++) {
      places[i] = 1.0; ties[i] = 1;

      for (var j = 0; j < players.length; j++) {
        if (i !== j) {
          if (this.state.scores[i] > this.state.scores[j]) { places[i]++; ties[i] = 1; }
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

  var fileout = '[Re-roll ' + this.settings.re_roll + ']\n';
  fileout += '[Spot On ' + this.settings.spot_on + ']\n';
  fileout += '[Wild Ones ' + this.settings.wild_ones + ']\n';
  fileout += '[First to play ' + this.settings.first_play + ']\n';
  fileout += '[Result %out]\n\n';
  fileout += this.moves.join(', ');

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: ratings,
    text: output });
};

// Private Methods

function update_state (match, turn, move) {
  var state = match.state;
  var players = match.players();
  var i, j;

  if (move === 'liar' || (match.settings.spot_on && move === 'spot')) {
    match.moves.push(move);

    var count = 0;
    for (i = 0; i < match.hands.length; i++) {
      for (j = 0; j < match.hands[i].length; j++) {
        if (
          state.previous.move.face === match.hands[i][j] ||
          (match.settings.wild_ones && match.hands[i][j] === 1)
        ) {
          count++;
        }
      }
    }

    state.previous.round = {
      acc: turn,
      bdr: state.previous.move.by,
      count: count,
      hands: false,
      move: state.previous.move,
      lsr: false,
      wnr: false
    };

    if (move === 'spot') {
      if (count === state.previous.move.count) {
        state.previous.round.wnr = turn;
      }
      else {
        state.previous.round.lsr = turn;
      }
    }
    else if (count >= state.previous.move.count) {
      state.previous.round.wnr = 1;
      state.previous.round.lsr = turn;
    }
    else {
      state.previous.round.wnr = 0;
      state.previous.round.lsr = state.previous.move.by;
      state.previous.round.lose = match.settings.liar_loses === 0 ? Math.abs(count - state.previous.move.count) : 1;
    }

    state.previous.round.hands = new Array(players.length);
    for (i = 0; i < state.previous.round.hands.length; i++) {
      state.previous.round.hands[i] = new Array(match.hands[i].length);
      for (j = 0; j < match.hands[i].length; j++) {
        state.previous.round.hands[i][j] = match.hands[i][j];
      }
    }

    if (move === 'spot') {
      match.moves.push(players[state.previous.round.acc].name +
        ' calls \'Spot On\' ( d-' + state.previous.round.move.face + ' x ' +
        state.previous.round.move.count + ' ) .. there ' +
        (state.previous.round.count === 1 ? 'was ' : 'were ') +
        (state.previous.round.lsr === false ? 'exactly ' : '') +
        state.previous.round.count);
    }
    else {
      match.moves.push(players[state.previous.round.acc].name +
        ' accuses ' + players[state.previous.round.bdr].name +
        ' ( d-' + state.previous.round.move.face + ' x ' +
        state.previous.round.move.count + ' ) .. there ' +
        (state.previous.round.count === 1 ? 'was ' : 'were ') +
        (state.previous.round.wnr === 0 ? 'only ' : '') +
        state.previous.round.count);
    }

    if (state.previous.round.lsr === false) {
      var score = match.get_alive(false) - 1;
      for (i = 0; i < match.hands.length; i++) {
        if (match.get_alive(i) && state.previous.round.wnr !== i) {
          state.setting.dice[i].splice(0, 1);
          if (state.setting.dice[i].length === 0) {
            state.alive[i] = false;
            state.scores[i] = score;
          }
        }
      }
    }
    else {
      if (state.previous.round.lose === undefined) { state.previous.round.lose = 1; }
      for (i = 0; i < state.previous.round.lose; i++) {
        if (state.setting.dice[state.previous.round.lsr].length > 0) {
          state.setting.dice[state.previous.round.lsr].splice(0, 1);
        }
      }
      if (state.setting.dice[state.previous.round.lsr].length === 0) {
        state.alive[state.previous.round.lsr] = false;
        state.scores[state.previous.round.lsr] = match.get_alive(false);
      }
    }

    var to_play;
    if (match.settings.first_play === 'loser' && state.previous.round.lsr !== false) {
      if (state.alive[state.previous.round.lsr] === true) {
        to_play = state.previous.round.lsr;
      }
    }
    else if (match.settings.first_play === 'winner' && state.previous.round.wnr !== false) {
      if (state.alive[state.previous.round.wnr] === true) {
        to_play = state.previous.round.wnr;
      }
    }
    else if (match.settings.first_play === 'least') {
      var least = match.settings.dice;
      var x = state.to_play + 1;
      for (i = 0; i < state.alive.length + 1; i++) {
        if (state.alive[x] === true) {
          if (state.setting.dice[x].length < least) {
            least = state.setting.dice[x].length;
            to_play = x;
          }
        }
        x = (++x % state.alive.length);
      }
    }

    if (to_play === undefined) {
      to_play = match.next_turn();
    }

    state.previous.move = false;

    if (match.get_alive(false) === 1) {
      match.finish(turn, 0);
      return false;
    }
    else {
      state.next_to_play = to_play;
      state.setting.start = to_play;
      match.pause();
    }
  }
  else {
    if (move.re_roll.length > 0) {
      for (i = 0; i < match.hands[turn].length; i++) {
        var di = match.hands[turn][i];
        if (move.re_roll.indexOf(i) >= 0) {
          match.hands[turn][i] = Dice.get_new_die();
        }
        else {
          state.setting.dice[turn][i] = di;
        }
      }
    }

    state.setting.bids[turn] = move;
    state.previous.move = move;
    state.previous.move.by = turn;
    state.previous.round = false;
    match.moves.push(players[turn].name + ' - ' + move.face + ' x ' + move.count);
    state.to_play = match.next_turn();
  }

  return true;
}

function reset_visible_dice (match) {
  for (var i = 0; i < match.hands.length; i++) {
    match.state.setting.dice[i] = new Array(match.hands[i].length);
    for (var j = 0; j < match.state.setting.dice[i].length; j++) {
      match.state.setting.dice[i][j] = null;
    }
  }
}

function check_move (match, turn, move) {
  var state = match.state;

  if (move === 'liar' || move === 'spot') {
    if (state.previous.move !== false) { return move; }
  }
  else {
    var previous_move = 0;
    if (state.previous.move !== false) {
      previous_move = state.previous.move;
    }
    move.count = parseInt(move.count, 10);
    if (move_score(match, move) > move_score(match, previous_move)) {
      if (
        move.re_roll &&
        match.settings.re_roll &&
        move.re_roll.length < state.setting.dice[turn].filter(function (di) {
          return di === null;
        }).length
      ) {
        for (var i = 0; i < move.re_roll.length; i++) {
          if (state.setting.dice[turn][move.re_roll[i]] !== null) {
            return false;
          }
        }
      }
      else { move.re_roll = []; }
      return move;
    }
  }

  return false;
}

function move_score (match, move) {
  if (move === 0) { return 0; }
  var score = 0;
  if (match.settings.wild_ones && move.face === 1) {
    score = move.face + (6 * ((move.count * 2) - 1));
  }
  else {
    score = move.face + (6 * (move.count - 1));
  }
  return score;
}
