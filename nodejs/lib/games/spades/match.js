/* eslint-disable brace-style, camelcase, semi */

module.exports = Spades_Match;

var Match = require('../Match.js');
var Cards = require('../Cards.js');

// Constructor

function Spades_Match (set, match = false) {
  this._super.call(this, 'spades', set, match);
}
Spades_Match.prototype = Object.create(Match.prototype);
Spades_Match.prototype.constructor = Spades_Match;
Spades_Match.prototype._super = Match;

// Public Methods

Spades_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }
  var nbr_players = this.settings.players;

  this.aimoves = [];
  this.state.hand = false;
  this.state.in_play = [];
  this.state.scores = {
    round: (new Array(nbr_players)).fill(0),
    total: (new Array(nbr_players)).fill(0)
  };
  this.state.setting = {
    broken: (this.settings.break_spades === false),
    decide: (new Array(nbr_players)).fill(-1),
    last: { player: false, move: false },
    play: false,
    played: [],
    round: 0,
    start: 0
  };
  this.state.to_play = 0;

  this.started();
};

Spades_Match.prototype.started = function () {
  deal_cards(this);

  this._super.prototype.started.apply(this, arguments);
};

Spades_Match.prototype.make_move = function (player, move) {
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

  if (state.setting.play === false) {
    move = check_decide(this, turn, move.decide);
    if (move === false) {
      this.emit('message', this, player, 'Invalid move (2)');
      return;
    }
  }
  else {
    if (check_move(this, turn, move.card) === false) {
      this.emit('message', this, player, 'Invalid move (3)');
      return;
    }
    move = move.card;
  }

  update_state(this, turn, move);
};

Spades_Match.prototype.valid_move = function (move) {
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

Spades_Match.prototype.resume = function () {
  this._super.prototype.resume.apply(this, arguments);

  if (next_round(this) === true) {
    this.updated();
  }
};

Spades_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var match = this;
  var state = match.state;
  var turn = state.to_play;
  var hand = match.hands[turn];

  if (ai.name === 'Reneger') {
    var move = find_move();
    update_state(this, turn, move);
  }

  function find_move () {
    var bestmove;

    var val = function (card) {
      if (card.v === Cards.ACE) { return Cards.KING + 0.5; }
      return card.v;
    };

    var compare = function (a, b) {
      return val(a) - val(b);
    };

    var of_type = function (type, cards) {
      return cards.filter(function (card) { return card.s === type });
    };

    var not_of_type = function (type, cards) {
      return cards.filter(function (card) { return card.s !== type });
    };

    var pval = function (card, hand, played) {
      var max_val = 14;
      var out_same_type = of_type(card.s, played);
      var biggest = of_type(card.s, hand).sort(flip(compare))[0];
      var out_count = out_same_type.length;
      var big_out_count = range(val(biggest), max_val + 1)
                            .filter(function (v) {
                              return out_same_type.find(function (c) { return val(c) === v });
                            }).length;
      var out_spades_count = of_type(Cards.SPADE, played).length;
      var hand_spades_count = of_type(Cards.SPADE, hand).length;

      var big_left_count = max_val - val(card) - big_out_count;

      if (big_left_count === 0) {
        var spade_safe = card.s === Cards.SPADE ||
                         out_spades_count + hand_spades_count === 13 ||
                         [0, 4, 8].indexOf(out_count) !== -1;

        if (spade_safe) {
          return val(card) - val(biggest);
        }
        else {
          return -10 * val(card);
        }
      }
      else {
        return -10 * val(card);
      }
    };

    var cmp = function (hand, played) {
      return function (a, b) {
        return pval(a, hand, played) - pval(b, hand, played);
      };
    };

    if (state.setting.play === false) {
      var is_small_val = function (card) {
        return val(card) < 10;
      };
      var is_large_val = function (card) {
        return val(card) > 12;
      };

      var check_small = function (cards) {
        var is_spade_small = and(
          of_type(Cards.SPADE, cards).map(is_small_val)
        );

        var are_other_three_smaller = and(flatten(
          [Cards.DIAMOND, Cards.CLUB, Cards.HEART].map(function (type) {
            return of_type(type, cards)
                    .sort(compare)
                    .slice(0, 3)
                    .map(is_small_val);
          })
        ));

        return is_spade_small && are_other_three_smaller;
      };

      var count_large = function (cards) {
        var spades = of_type(Cards.SPADE, cards);
        var spade_left = spades.length;
        var spade_to_use;

        var other_big_count = sum(
          [Cards.DIAMOND, Cards.CLUB, Cards.HEART].map(function (type) {
            var typed_cards = of_type(type, cards);
            var count = typed_cards.length;
            var big_count = typed_cards.filter(is_large_val).length;

            if (count >= 6) {
              return Math.min(1, big_count);
            }
            else if (count > 2 && count <= 5) {
              return big_count;
            }
            else if (count <= 2) {
              spade_to_use = Math.min(spade_left, 3 - count);
              spade_left -= spade_to_use;
              return spade_to_use;
            }
          })
        );

        var spade_big_count = spades.sort(compare)
                                    .slice(spades.length - spade_left)
                                    .filter(is_large_val)
                                    .length;

        return other_big_count + spade_big_count;
      };

      bestmove = check_small(hand) ? 0 : count_large(hand);
    }
    else {
      var is_nil_bid = state.setting.decide[turn] === 0;
      var played = state.setting.played;
      var lead_card;
      var max_card;
      var typed_cards;
      var compareFn;
      var candidates;
      var card_to_play;

      if (state.in_play.length === 0) {
        var non_spades = not_of_type(Cards.SPADE, hand);

        if (!state.setting.broken && non_spades.length > 0 && hand.length > non_spades.length) {
          candidates = non_spades;
        }
        else {
          candidates = hand;
        }

        compareFn = is_nil_bid ? compare : flip(cmp(candidates, played));
      }
      else {
        lead_card = lead_card = state.in_play[0];
        max_card = of_type(lead_card.s, state.in_play).sort(flip(compare))[0];
        typed_cards = of_type(lead_card.s, hand).sort(flip(compare));

        if (is_nil_bid) {
          if (typed_cards.length > 0) {
            var smaller_cards = typed_cards.filter(function (card) {
              return val(card) < val(max_card);
            });

            if (smaller_cards.length > 0) {
              candidates = smaller_cards;
              compareFn = flip(compare);
            }
            else {
              candidates = typed_cards;
              compareFn = compare;
            }
          }
          else {
            var not_spade_cards = not_of_type(Cards.SPADE, hand);

            if (not_spade_cards.length > 0) {
              candidates = not_spade_cards;
              compareFn = flip(compare);
            }
            else {
              candidates = hand;
              compareFn = compare;
            }
          }
        }
        else {
          if (typed_cards.length > 0) {
            var larger_cards = typed_cards.filter(function (card) {
              return val(card) > val(max_card);
            });

            if (larger_cards.length > 0) {
              candidates = larger_cards;
              compareFn = flip(compare);
            }
            else {
              candidates = typed_cards;
              compareFn = compare;
            }
          }
          else {
            var largest_spade = of_type(Cards.SPADE, state.in_play)
                                  .sort(flip(compare))[0];
            var spade_cards = of_type(Cards.SPADE, hand);

            if (largest_spade) {
              spade_cards = spade_cards.filter(function (card) {
                return val(card) > val(largest_spade);
              });
            }

            if (spade_cards.length > 0) {
              candidates = spade_cards;
              compareFn = compare;
            }
            else {
              candidates = hand;
              compareFn = compare;
            }
          }
        }
      }

      card_to_play = candidates.slice().sort(compareFn)[0];
      bestmove = hand.findIndex(function (card) {
        return card_to_play.s === card.s && card_to_play.v === card.v;
      });
    }

    return bestmove;
  }

  function and (list) {
    return list.reduce(function (prev, cur) {
      return prev && cur;
    }, true);
  }

  function flatten (list_of_list) {
    return list_of_list.reduce(function (prev, cur) {
      return prev.concat(cur);
    }, []);
  }

  function flip (fn, context) {
    return function () {
      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      var params = args.slice(0, 2).reverse().concat(args.slice(2));
      return fn.apply(context, params);
    };
  }

  function range (start, end, step_) {
    var ret = [];
    var step = step_ || 1;

    for (var i = start; step > 0 ? i < end : i > end; i += step) {
      ret.push(i);
    }

    return ret;
  }

  function sum (list) {
    return list.reduce(function (prev, cur) {
      return prev + cur;
    }, 0);
  }
};

Spades_Match.prototype.finish = function (turn, decision) {
  var i;

  if (this.status !== 'FINISH') {
    if (decision < 0) {
      this.set_alive(turn, false);
      this.hands[turn] = [];

      var alive = this.get_alive(false);
      if (alive > 1) {
        var doned = true;
        for (i = 0; i < this.state.setting.decide.length; i++) {
          if (this.state.alive[i] === true && this.state.setting.decide[i] === -1) {
            doned = false; break;
          }
        }
        this.state.setting.play = doned;

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

      for (var j = 0; j < players.length; j++) { if (i !== j) {
        if (this.state.scores.total[i] < this.state.scores.total[j]) { places[i]++; ties[i] = 1; }
        if (this.state.scores.total[i] === this.state.scores.total[j]) { ties[i]++; }
      } }

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
  output += outputs[1].join(', ')
  output += (outputs[0].length > 0 ? ' lose' + (outputs[1].length === 1 ? 's' : '') : '');

  var fileout = '[Rounds ' + this.settings.rounds + ']\n';
  fileout += '[Broken Spades ' + this.settings.break_spades + ']\n';
  fileout += '[Result %out]\n\n';
  fileout += this.moves.join(', ');

  this.finished(
    { file: { generic: true, out: fileout },
      places: places,
      ratings: ratings,
      text: output });
};

// Private Methods

function update_state (match, turn, move) {
  var state = match.state;

  if (state.setting.play === false) {
    state.setting.decide[turn] = move;
    var doned = true;
    for (var i = 0; i < state.setting.decide.length; i++) {
      if (state.alive[i] === true && state.setting.decide[i] === -1) {
        doned = false; break;
      }
    }
    state.setting.play = doned;
    state.setting.last = { player: turn, move: move };
    state.to_play = match.next_turn(false);
  }
  else {
    if (match.hands[turn][move].s === 0) {
      state.setting.broken = true;
    }
    match.hands[turn][move].own = turn;
    state.in_play.push(match.hands[turn][move]);
    state.setting.played.push(match.hands[turn][move]);
    match.hands[turn].splice(move, 1);
    check_round_end(match);
  }

  match.update_timer(turn, true);
  match.updated();
}

function check_decide (match, turn, dec) {
  dec = parseInt(dec, 10);
  if (isNaN(dec)) { return false; }
  if (dec < 0 || dec > match.state.setting.cards) { return false; }
  return dec;
}

function check_move (match, turn, ci) {
  if (match.state.setting.play === false) { return false; }

  var card = match.hands[turn][ci];
  if (card === undefined || card.s === undefined) { return false; }

  var playa = match.state.in_play;
  var j;

  if (playa.length === 0) {
    if (match.state.setting.broken === false && card.s === Cards.SPADE) {
      for (j = 0; j < match.hands[turn].length; j++) {
        if (match.hands[turn][j].s !== Cards.SPADE) {
          return false;
        }
      }
    }
  }
  else {
    if (playa[0].s !== card.s) {
      for (j = 0; j < match.hands[turn].length; j++) {
        if (match.hands[turn][j].s === playa[0].s) {
          return false;
        }
      }
    }
  }

  return true;
}

function deal_cards (match) {
  var deck = Cards.get_new_deck(0, true);
  var cards = Math.floor(deck.length / match.settings.players);
  match.state.setting.cards = cards;

  match.hands = new Array(match.settings.players);
  for (var i = 0; i < match.hands.length; i++) {
    if (match.get_alive(i) === true) {
      match.hands[i] = new Array(cards);
      for (var j = 0; j < match.hands[i].length; j++) {
        match.hands[i][j] = deck.pop();
      }
    }
    else {
      match.hands[i] = [];
    }
  }
}

function check_round_end (match) {
  var state = match.state;
  var i;

  if (state.in_play.length >= match.get_alive(false)) {
    var hwon = hand_winner(match); state.next_to_play = hwon.own;
    state.scores.round[state.next_to_play]++;
    state.setting.played = [];

    var tmpmov = state.next_to_play + ': ';
    for (i = 0; i < state.in_play.length; i++) {
      tmpmov += (i > 0 ? '|' : '') + Cards.get_card_text(state.in_play, i);
    }
    match.moves.push(tmpmov);

    match.pause();
  }
  else { state.to_play = match.next_turn(false); }
}

function next_round (match) {
  var state = match.state;
  var players = match.players();

  state.in_play = [];
  if (empty_hands(match) === true) {
    var tmpscr = 'x: ';
    for (var i = 0; i < state.setting.decide.length; i++) {
      if (match.get_alive(i) && state.setting.decide[i] <= state.scores.round[i]) {
        var score = 10 * state.setting.decide[i];
        score += (state.scores.round[i] - state.setting.decide[i]);
        if (i > 0) { tmpscr += '|'; }
        tmpscr += score; state.scores.total[i] += score;
      }
      else {
        if (i > 0) { tmpscr += '|'; }
        tmpscr += '00';
      }
      state.setting.decide[i] = -1;
      state.scores.round[i] = 0;
    }
    match.moves.push(tmpscr);

    state.setting.broken = (match.settings.break_spades === false);
    state.setting.played = [];
    state.setting.play = false;
    state.setting.round++;
    if (match.settings.rounds === state.setting.round) {
      match.finish(false, 0);
      return false;
    }
    state.setting.start = match.next_turn(state.setting.start);
    state.to_play = state.setting.start;

    deal_cards(match);
  }
  else {
    state.to_play = match.next_turn(state.next_to_play - 1);
  }

  return true;
}

function hand_winner (match) {
  var ip = match.state.in_play;
  if (ip.length === 0) { return false; }
  var mx = ip[0]; var trump = 0; var mxtmp = (ip[0].s === trump);
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
  if (
    c1.s === c2.s &&
    (c1.v === Cards.ACE || (c1.v >= c2.v && c2.v !== Cards.ACE))
  ) {
    return 1;
  }
  return -1;
}

function empty_hands (match) {
  for (var i = 0; i < match.hands.length; i++) {
    if (match.get_alive(i) === true) {
      if (match.hands[i].length > 0) { return false; }
    }
  }
  return true;
}
