/* eslint-disable brace-style, camelcase, semi */

module.exports = Kachuful_Match;

var Match = require('../Match.js');
var Cards = require('../Cards.js');

// Constructor

function Kachuful_Match (set, match = false) {
  this._super.call(this, 'kachuful', set, match);
}
Kachuful_Match.prototype = Object.create(Match.prototype);
Kachuful_Match.prototype.constructor = Kachuful_Match;
Kachuful_Match.prototype._super = Match;

// Public Methods

Kachuful_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }
  var nbr_players = this.settings.players;

  this.aimoves = [];
  this.hands = [];
  this.state.in_play = [];
  this.state.setting = {
    cards_init: 0,
    cards: 0,
    cycles: this.settings.cycles,
    cyc_dir: -1,
    decide: [],
    last: { player: false, move: false },
    play: false,
    round: 0,
    start: 0,
    trump: 0
  };
  this.state.scores = {
    round: (new Array(nbr_players)).fill(0),
    total: (new Array(nbr_players)).fill(0)
  };
  this.state.to_play = 0;

  reset_state(this, true);

  this.started();
};

Kachuful_Match.prototype.make_move = function (player, move) {
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

  if (state.setting.play) {
    if (!this.check_move(turn, move.card)) {
      this.emit('message', this, player, 'Invalid move (2)');
      return;
    }
    move = move.card;
  }
  else {
    move = this.check_decide(turn, move.decide);
    if (move === false) {
      this.emit('message', this, player, 'Invalid move (3)');
      return;
    }
  }

  update_state(this, turn, move);
};

Kachuful_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        typeof move.decide !== 'number' &&
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

Kachuful_Match.prototype.resume = function () {
  this._super.prototype.resume.apply(this, arguments);

  next_round(this);
};

Kachuful_Match.prototype.check_decide = function (turn, decide) {
  var state = this.state;
  var players = this.players();

  decide = parseInt(decide, 10);
  if (decide < 0 || decide > state.setting.cards) { return false; }

  var total = 0;
  for (var i = 0; i < players.length; i++) {
    if (i !== turn && this.get_alive(i)) {
      if (state.setting.decide[i] < 0) {
        total = -1; break;
      }
      else { total += state.setting.decide[i]; }
    }
  }

  if (total >= 0 && (decide + total) === state.setting.cards) { return false; }

  return decide;
};

Kachuful_Match.prototype.check_move = function (turn, card_i) {
  var state = this.state;
  var hands = this.hands;

  if (state.setting.play === false) { return false; }

  var card = hands[turn][card_i];
  if (card === undefined || card.s === undefined) { return false; }

  var playa = state.in_play;
  if (playa[0] !== undefined) {
    if (playa[0].s !== card.s) {
      for (var j = 0; j < hands[turn].length; j++) {
        if (hands[turn][j].s === playa[0].s) {
          return false;
        }
      }
    }
  }

  return true;
};

Kachuful_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var match = this;
  var state = match.state;
  var turn = state.to_play;
  var hand = match.hands[turn];

  if (ai.name === 'Judger') {
    var move = find_move();
    update_state(this, turn, move);
  }

  function find_move () {
    var bestmove;
    var percents = get_hand_percents(match.aimoves);
    var likely = get_hand_likely_wins(percents);

    if (state.setting.play === false) {
      while (match.check_decide(turn, likely.hands) === false) {
        if (likely.hands === 0) { likely.hands++; }
        else { likely.hands--; }
      }
      bestmove = likely.hands;
    }
    else {
      var playable = get_playable_cards();
      var trump = match.state.setting.trump;

      var x = (state.in_play.length > 0 ? state.in_play[0].own : 0);
      var to_take = 0; var others_to_take = 0; var next_in_line = false;
      var hands_taken = 0; var hands_decided = 0;
      for (var i = 0; i < state.setting.decide.length; i++) {
        if (state.setting.decide[x] !== -1) {
          hands_taken += state.scores.round[x];
          hands_decided += state.setting.decide[x];
          if (x === turn) {
            to_take = state.setting.decide[x] - state.scores.round[x];
            next_in_line = true;
          }
          else if (next_in_line === true) {
            others_to_take += hands_decided - hands_taken;
          }
          x = (++x % state.setting.decide.length);
        }
      }

      var extra_hands = percents.length - (hands_decided - hands_taken);

      var take_hand = true;
      if (to_take === 0 || (to_take < 0 && extra_hands > 0)) {
        take_hand = false;
      }

      var high_x = 0;
      var high = playable[high_x].i;
      var high_trump = (hand[high_x].s === trump);
      for (x = 1; x < playable.length; x++) {
        var play_card = false;
        var this_trump = (hand[x].s === trump);

        if (take_hand === true) {
          if (playable[x].high === true && likely.cards[x] < 100) {
            if (playable[high_x].high !== true) {
              play_card = true;
            }
            else if (
              (others_to_take > 0 && percents[playable[x].i] > percents[playable[high_x].i]) ||
              (others_to_take <= 0 && percents[playable[x].i] < percents[playable[high_x].i])
            ) {
              play_card = true;
            }
          }
          else if (playable[high_x].high !== true) {
            if ((this_trump === false || high_trump === true) && percents[playable[x].i] < percents[playable[high_x].i]) {
              play_card = true;
            }
          }
        }
        else if (
          (playable[x].high !== true && percents[playable[x].i] > percents[playable[high_x].i]) ||
          (playable[high_x].high === true && percents[playable[x].i] < percents[playable[high_x].i])
        ) {
          play_card = true;
        }

        if (play_card === true) {
          high_x = x;
          high = playable[high_x].i;
          high_trump = (hand[high_x].s === trump);
        }
      }

      bestmove = high;
    }

    return bestmove;
  }

  function get_card_value (card) {
    if (card.v === 1) { return 13; }
    return card.v - 1;
  }
  function get_card_percent (card, trump, percent) {
    return add_card_percent((trump === card.s), 0, get_card_value(card) * (trump === card.s ? 9 : 8));
  }
  function add_card_percent (max, perc1, perc2) {
    return Math.min((max ? 100 : 99), perc1 + perc2);
  }

  function get_hand_percents (cards_out) {
    var percents = new Array(hand.length);
    var card1, card2, val2, j;

    for (var i = 0; i < percents.length; i++) {
      card1 = hand[i];
      var val1 = get_card_value(card1.v);
      percents[i] = get_card_percent(card1, match.state.setting.trump);

      if (percents[i] < 100 && percents[i] > 0) {
        for (j = 0; j < percents.length; j++) {
          if (i !== j) {
            card2 = hand[j];
            val2 = get_card_value(card2.v);
            if (card1.s === card2.s) {
              if (val2 > val1) {
                percents[i] = add_card_percent((match.state.setting.trump === card1.s), percents[i], 8);
              }
            }
          }
        }

        for (j = 0; j < cards_out.length; j++) {
          card2 = cards_out[j];
          val2 = get_card_value(card2.v);
          if (val2 > val1) {
            percents[i] = add_card_percent((match.state.setting.trump === card2.s), percents[i], 8);
          }
        }
      }
    }

    return percents;
  }

  function get_hand_likely_wins (percents) {
    var decide = 0; var cards = new Array(percents.length);
    var factor = (match.settings.decks * percents.length) / match.get_alive(false);

    for (var i = 0; i < percents.length; i++) {
      cards[i] = { percent: percents[i] };
      if (
        percents[i] === 100 ||
        (percents[i] > 95 && Math.random() > (0.01 / factor)) ||
        (Math.random() > ((100.0 - percents[i]) * 0.1 / factor))
      ) {
        decide++;
        cards[i].win = true;
        cards[i].guarantee = (percents[i] === 100);
      }
    }

    return { hands: decide, cards: cards };
  }

  function get_playable_cards () {
    var cards = [];
    var best_card = hand_winner(match);
    var trump = get_round_trump(match);

    for (var i = 0; i < match.hands[turn].length; i++) {
      if (match.check_move(turn, i) !== false) {
        var card = hand[i]; var high = false;

        if (best_card === false) {
          high = true;
        }
        else if (best_card.s === trump) {
          if (card.s === trump && compare_max(card, best_card) === 1) {
            high = true;
          }
        }
        else if (card.s === trump) { high = true; }
        else if (compare_max(card, best_card) === 1) { high = true; }

        cards.push({ i: i, high: high });
      }
    }

    return cards;
  }
};

Kachuful_Match.prototype.finish = function (turn, decision) {
  var i;

  if (this.status !== 'FINISH') {
    if (decision < 0) {
      this.set_alive(turn, false);

      var alive = this.get_alive(false);
      if (alive > 1) {
        if (!this.state.setting.play) {
          update_decided(this);
        }

        check_round_end(this);

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
          if (this.state.scores.total[i] < this.state.scores.total[j]) { places[i]++; ties[i] = 1; }
          if (this.state.scores.total[i] === this.state.scores.total[j]) { ties[i]++; }
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

  var fileout = '[Decks ' + this.settings.decks + ']\n';
  fileout += '[Cycles ' + this.settings.cycles + ']\n';
  fileout += '[Neutral ' + this.settings.neutral + ']\n';
  fileout += '[Result %out]\n\n';
  fileout += this.moves.join(', ');

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: ratings,
    text: output });
};

// Private Methods

function reset_state (match, start = false) {
  var nbr_players = match.settings.players;
  var deck = [];
  var i;

  for (i = 0; i < match.settings.decks; i++) {
    deck = Cards.shuffle_deck(deck.concat(Cards.get_new_deck(0, false)));
  }

  var deck_length = deck.length;
  for (i = 0; i < nbr_players; i++) {
    match.state.setting.decide[i] = -1;
    match.hands[i] = [];

    if (start) {
      match.state.setting.cards_init = Math.floor(deck_length / nbr_players);
      match.state.setting.cards = match.state.setting.cards_init;
    }

    if (start || match.get_alive(i)) {
      for (var j = 0; j < match.state.setting.cards; j++) {
        match.hands[i][j] = deck.pop();
      }
    }
    else {
      match.hands[i] = [];
    }

    match.state.scores.round[i] = 0;
    if (start) { match.state.scores.total[i] = 0; }
  }
}

function update_state (match, turn, move) {
  var state = match.state;

  if (state.setting.play) {
    match.hands[turn][move].own = turn;
    state.in_play.push(match.hands[turn][move]);
    match.hands[turn].splice(move, 1);
    check_round_end(match);
  }
  else {
    state.setting.decide[turn] = move;

    update_decided(match);

    state.setting.last = { player: turn, move: move };
    state.to_play = match.next_turn();
  }

  match.update_timer(turn, true);
  match.updated();
}

function update_decided (match) {
  var state = match.state;

  var doned = true;
  for (var i = 0; i < state.setting.decide.length; i++) {
    if (match.get_alive(i) && state.setting.decide[i] === -1) {
      doned = false; break;
    }
  }

  state.setting.play = doned;
}

function check_round_end (match) {
  var state = match.state;
  var i;

  if (state.in_play.length >= match.get_alive(false)) {
    var hwon = hand_winner(match);

    state.next_to_play = hwon.own;
    state.scores.round[state.next_to_play]++;

    var tmpmov = state.next_to_play + ': ';
    for (i = 0; i < state.in_play.length; i++) {
      tmpmov += (i > 0 ? '|' : '') + Cards.get_card_text(state.in_play, i);
      match.aimoves.push(state.in_play[i]);
    }

    match.moves.push(tmpmov);
    match.pause();
  }
  else {
    state.to_play = match.next_turn();
  }
}

function next_round (match) {
  var state = match.state;
  var turn = state.to_play;

  state.in_play = [];
  if (empty_hands(match)) {
    var tmpscr = 'x: ';

    for (var i = 0; i < state.setting.decide.length; i++) {
      if (state.setting.decide[i] === state.scores.round[i]) {
        var tscr = parseInt(('1' + state.scores.round[i]), 10);
        if (i > 0) { tmpscr += '|'; }
        tmpscr += tscr; state.scores.total[i] += tscr;
      }
      else {
        if (i > 0) { tmpscr += '|'; }
        tmpscr += '00';
      }
    }
    match.moves.push(tmpscr);
    match.aimoves = [];

    state.setting.play = false;
    state.setting.round++; state.setting.cards += state.setting.cyc_dir;
    if (match.settings.rounds === state.setting.round) {
      match.finish(false, 0);
      return false;
    }
    else if (state.setting.cards < 1 || state.setting.cards > state.setting.cards_init) {
      state.setting.cyc_dir = state.setting.cyc_dir * -1;
      state.setting.cards += state.setting.cyc_dir;
      state.setting.cycles -= 0.5;
      state.setting.trump = get_round_trump(match);
    }
    state.setting.start = match.next_turn(state.setting.start);
    state.to_play = state.setting.start;

    reset_state(match);
  }
  else {
    state.to_play = match.next_turn(state.next_to_play - 1);
  }

  match.update_timer(turn, true);
  match.updated();
}

function get_round_trump (match) {
  var trump = -1;

  if (match.settings.neutral === true) {
    if ((match.state.setting.round % 5) !== 4) {
      trump = (match.state.setting.round % 5);
    }
  }
  else { trump = (match.state.setting.round % 4); }

  return trump;
}

function hand_winner (match) {
  var ip = match.state.in_play;
  if (ip.length === 0) { return false; }

  var mx = ip[0]; var mxtmp = false;
  var trump = get_round_trump(match);

  if (trump === -1) { trump = ip[0].s; mxtmp = true; }
  else { mxtmp = (ip[0].s === trump); }

  for (var i = 1; i < ip.length; i++) {
    if (mxtmp === true) {
      if (ip[i].s === trump && compare_max(ip[i], mx) === 1) {
        mx = ip[i];
      }
    }
    else if (ip[i].s === trump) { mx = ip[i]; mxtmp = true; }
    else if (compare_max(ip[i], mx) === 1) { mx = ip[i]; }
  }

  return mx;
}

function compare_max (c1, c2) {
  if (c1.s === c2.s && (c1.v === 1 || (c1.v >= c2.v && c2.v !== 1))) {
    return 1;
  }
  return -1;
}

function empty_hands (match) {
  for (var i = 0; i < match.hands.length; i++) {
    if (match.get_alive(i)) {
      if (match.hands[i].length > 0) { return false; }
    }
  }
  return true;
}
