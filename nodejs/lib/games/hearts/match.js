/* eslint-disable brace-style, camelcase, semi */

module.exports = Hearts_Match;

var Match = require('../Match.js');
var Cards = require('../Cards.js');

// Constructor

function Hearts_Match (set, match = false) {
  this._super.call(this, 'hearts', set, match);
}
Hearts_Match.prototype = Object.create(Match.prototype);
Hearts_Match.prototype.constructor = Hearts_Match;
Hearts_Match.prototype._super = Match;

// Public Methods

Hearts_Match.prototype.start = function () {
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
    broken: (this.settings.break_hearts === false),
    decide: (new Array(nbr_players)).fill([]),
    last: { player: false, move: false },
    play: (this.settings.pass_three === false),
    played: new Array(14),
    round: 0,
    start: 0
  };
  this.state.to_play = 0;

  this.started();
};

Hearts_Match.prototype.started = function () {
  deal_cards(this);

  this._super.prototype.started.apply(this, arguments);
};

Hearts_Match.prototype.make_move = function (player, move) {
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

  move = (state.setting.play === false ? move.decide : move.card);
  if (check_move(this, turn, move) === false) {
    this.emit('message', this, player, 'Invalid move (2)');
    return;
  }

  update_state(this, turn, move);
};

Hearts_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        Object.prototype.toString.call(move.decide) !== '[object Array]' &&
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

Hearts_Match.prototype.resume = function () {
  this._super.prototype.resume.apply(this, arguments);

  if (next_round(this) === true) {
    this.updated();
  }
};

Hearts_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var match = this;
  var state = match.state;
  var turn = state.to_play;
  var hand = match.hands[turn];

  if (ai.name === 'Taining') {
    var move = find_move();
    if (check_move(this, turn, move) === true) {
      update_state(this, turn, move);
    }
    else {
      console.log('Match ' + this.id + ': bad move by AI');
      console.log(move);
    }
  }

  function find_move () {
    var move, i;

    var penalty = { 'SQ': 13 };
    for (i = 1; i < 14; i++) {
      penalty['H' + Cards.render_number(i)] = 1;
    }

    var card_score = function card_score (card) {
      return penalty[show(card)] || 0;
    };

    var compare_penalty = function compare_penalty (card1, card2) {
      return (card_score(card1) - card_score(card2)) * 1000 + compare_cards(card1, card2);
    };

    if (state.setting.play === true) {
      var lead_card;
      var max_card;
      var compare;
      var candidates;

      var compare_number = function compare_number (card1, card2) {
        return compare_cards(card1, card2);
      };

      if (state.in_play.length === 0) {
        var non_hearts = hand.filter(function (card) {
          return card.s !== Cards.HEART;
        });

        if (!state.setting.broken && non_hearts.length > 0 && hand.length > non_hearts.length) {
          candidates = non_hearts;
        }
        else {
          candidates = hand;
        }
        compare = compare_number;
      }
      else {
        lead_card = state.in_play[0];

        if (lead_card && hand.find(function (card) {
          return card.s === lead_card.s;
        })) {
          max_card = state.in_play.filter(function (card) {
            return card.s === lead_card.s;
          }).sort(flip(compare_cards))[0];
          // all cards smaller than the biggest on table
          candidates = hand.filter(function (card) {
            return card.s === lead_card.s && compare_cards(max_card, card) > 0;
          });

          if (candidates.length > 0) {
            compare = flip(compare_penalty);
          }
          else {
            // otherwise the whole valid cards
            candidates = hand.filter(function (card) {
              return card.s === lead_card.s;
            });
            compare = state.in_play.length >= 2 ? flip(compare_penalty) : compare_penalty;
          }
        }
        else {
          candidates = hand;
          compare = flip(compare_penalty);
        }
      }

      move = candidates.slice().sort(compare)[0];
      for (i = 0; i < hand.length; i++) {
        if (hand[i].s === move.s && hand[i].v === move.v) {
          move = i;
          break;
        }
      }
    }
    else {
      var to_pass = [];

      var value_group = function value_group (cards) {
        cards = cards.slice();

        var is_spade_q = function is_spade_q (card) {
          return card.s === Cards.SPADE && card.v === Cards.QUEEN;
        };
        var remove_indexes = function remove_indexes (indexes, list) {
          return indexes.sort(function (a, b) {
            return b - a;
          }).reduce(function (prev, cur) {
            list.splice(cur, 1);
            return list;
          }, list);
        };
        var step1_spade_q = function step1_spade_q (tuple) {
          var result = tuple[0];
          var cards = tuple[1];
          var q = cards.findIndex(is_spade_q);

          return q !== -1 ? [(result.push([cards[q]]), result), remove_indexes([q], cards)] : tuple;
        };
        var step2_short_suite = function step2_short_suite (tuple) {
          var result = tuple[0];
          var cards = tuple[1];
          var suites = group(cards, function (card) {
            return card.s;
          }).reverse();
          var shortSuites = suites.filter(function (xs) {
            return xs.length <= 2;
          });
          var indexes = flatten(shortSuites).map(function (card) {
            return cards.findIndex(function (cd) {
              return cd.s === card.s && cd.v === card.v;
            });
          });

          return [result.concat(shortSuites), remove_indexes(indexes, cards)];
        };
        var step3_rest_by_penalty = function step3_rest_by_penalty (tuple) {
          var result = tuple[0];
          var cards = tuple[1];

          return [result.concat(cards.sort(flip(compare_penalty)).map(function (card) {
            return [card];
          })), []];
        };

        var tmp = compose(step3_rest_by_penalty,
                          step2_short_suite,
                          step1_spade_q)([[], cards]);

        return tmp[0];
      };

      var list = value_group(match.hands[turn]);
      var len = list.length;
      for (i = 0; i < len && to_pass.length < 3; i++) {
        if (to_pass.length + list[i].length <= 3) {
          to_pass = to_pass.concat(list[i]);
        }
      }

      if (to_pass.length < 3) {
        to_pass = match.hands[turn].slice().sort(flip(compare_penalty)).slice(0, 3);
      }

      move = [];
      for (i = 0; i < hand.length; i++) {
        for (var j = 0; j < to_pass.length; j++) {
          if (hand[i].s === to_pass[j].s && hand[i].v === to_pass[j].v) {
            move.push(i);
            break;
          }
        }
      }
    }

    return move;
  }

  function compose () {
    for (var _len4 = arguments.length, args = Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }

    return reduce_right(function (cur, prev) {
      return function (x) {
        return cur(prev(x));
      };
    }, function (x) {
      return x;
    }, args);
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

  function group (list, keyFn) {
    var obj = {};

    for (var i = 0, len = list.length; i < len; i++) {
      var key = keyFn(list[i]);
      obj[key] = obj[key] || [];
      obj[key].push(list[i]);
    }

    return Object.keys(obj).map(function (key) {
      return obj[key];
    }).sort(function (a, b) {
      return a.length - b.length;
    });
  }

  function reduce_right (fn, initial, list) {
    var ret = initial;

    for (var i = list.length - 1; i >= 0; i--) {
      ret = fn(list[i], ret);
    }

    return ret;
  }

  function show (card) {
    return Cards.render_card(card, true);
  }

  function compare_cards (card1, card2) {
    var val = function (card) {
      if (card.v === Cards.ACE) { return Cards.KING + 0.5; }
      return card.v;
    };

    return val(card1) - val(card2);
  }
};

Hearts_Match.prototype.finish = function (turn, decision) {
  var i;

  if (this.status !== 'FINISH') {
    if (decision < 0) {
      this.set_alive(turn, false);
      this.hands[turn] = [];

      var alive = this.get_alive(false);
      if (alive > 1) {
        var max_score = (this.settings.rounds * 26);
        this.state.scores.total[turn] = max_score + alive;

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
        if (this.state.scores.total[i] > this.state.scores.total[j]) { places[i]++; ties[i] = 1; }
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
  output += outputs[1].join(', ');
  output += (outputs[0].length > 0 ? ' lose' + (outputs[1].length === 1 ? 's' : '') : '');

  var fileout = '[Rounds ' + this.settings.rounds + ']\n';
  fileout += '[Broken Hearts ' + this.settings.break_hearts + ']\n';
  fileout += '[Pass Three ' + this.settings.pass_three + ']\n';
  fileout += '[Shoot Moon ' + this.settings.shoot_moon + ']\n';
  fileout += '[Result %out]\n\n';
  fileout += this.moves.join(', ');

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: ratings,
    text: output });
};

// Private Methods

function check_move (match, turn, move) {
  var j;

  if (match.state.setting.play === false) {
    if (move.length !== 3) { return false; }

    for (var i = 0; i < move.length; i++) {
      if (typeof move[i] !== 'number' && isNaN(parseInt(move[i], 10))) { return false; }
      if (move[i] < 0 || move[i] >= match.hands[turn].length) { return false; }
    }
  }
  else {
    if (typeof move !== 'number' && isNaN(parseInt(move, 10))) { return false; }

    var card = match.hands[turn][move];
    if (card === undefined || card.s === undefined) { return false; }

    var playa = match.state.in_play;
    if (playa.length === 0) {
      if (match.state.setting.broken === false && card.s === Cards.HEART) {
        for (j = 0; j < match.hands[turn].length; j++) {
          if (match.hands[turn][j].s !== Cards.HEART) {
            return false;
          }
        }
      }
    }
    else if (playa[0].s !== card.s) {
      for (j = 0; j < match.hands[turn].length; j++) {
        if (match.hands[turn][j].s === playa[0].s) {
          return false;
        }
      }
    }
  }

  return true;
}

function update_state (match, turn, move) {
  var state = match.state;
  var i, j;

  if (state.setting.play === false) {
    state.setting.decide[turn] = move;

    var doned = true;
    for (i = 0; i < state.setting.decide.length; i++) {
      if (match.get_alive(i) && state.setting.decide[i].length === 0) {
        doned = false; break;
      }
    }
    state.setting.play = doned;

    if (doned) {
      for (i = 0; i < state.setting.decide.length; i++) {
        if (match.get_alive(i) === true) {
          for (j = 0; j < state.setting.decide[i].length; j++) {
            var to_pass = match.hands[i][state.setting.decide[i][j]];
            match.hands[match.next_turn(i)].push(to_pass);
            match.hands[i][state.setting.decide[i][j]] = false;
          }
        }
      }
      for (i = 0; i < match.hands.length; i++) {
        for (j = match.hands[i].length - 1; j >= 0; j--) {
          if (match.hands[i][j] === false) {
            match.hands[i].splice(j, 1);
          }
        }
      }
    }

    state.to_play = match.next_turn();
  }
  else {
    if (match.hands[turn][move].s === Cards.HEART) {
      state.setting.played[match.hands[turn][move].v] = true;
      state.setting.broken = true;
    }
    match.hands[turn][move].own = turn;
    state.in_play.push(match.hands[turn][move]);
    match.hands[turn].splice(move, 1);
    check_round_end(match);
  }

  match.update_timer(turn, true);
  match.updated();
}

function deal_cards (match) {
  var deck = Cards.get_new_deck(0, true);
  var cards = Math.floor(deck.length / match.settings.players);

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
    state.scores.round[state.next_to_play] += hand_value(match);

    var tmpmov = state.next_to_play + ': ';
    for (i = 0; i < state.in_play.length; i++) {
      tmpmov += (i > 0 ? '|' : '') + Cards.get_card_text(state.in_play, i);
      match.aimoves.push(state.in_play[i]);
    }
    match.moves.push(tmpmov);

    match.pause();
  }
  else { state.to_play = match.next_turn(); }
}

function next_round (match) {
  var state = match.state;

  state.in_play = [];
  if (empty_hands(match) === true) {
    var tmpscr = 'x: ';
    var shot_moon = match.settings.shoot_moon && state.scores.round.some(function (score) {
      return score === 26;
    });

    for (var i = 0; i < state.setting.decide.length; i++) {
      if (i > 0) { tmpscr += '|'; }
      if (shot_moon) {
        var score = state.scores.round[i] === 0 ? 26 : 0;
        state.scores.total[i] += score;
        tmpscr += score;
      }
      else {
        state.scores.total[i] += state.scores.round[i];
        tmpscr += state.scores.round[i];
      }
      state.setting.decide[i] = [];
      state.scores.round[i] = 0;
    }
    match.moves.push(tmpscr);
    match.aimoves = [];

    state.setting.round++;
    if (match.settings.rounds === state.setting.round) {
      match.finish(false, 0);
      return false;
    }

    state.setting.broken = (match.settings.break_hearts === false);
    state.setting.played = new Array(14);
    state.setting.play = (match.settings.pass_three === false);
    state.setting.start = match.next_turn(state.setting.start);
    state.to_play = state.setting.start;

    deal_cards(match);
  }
  else {
    state.to_play = match.next_turn(state.next_to_play - 1);
  }

  return true;
}

function empty_hands (match) {
  for (var i = 0; i < match.hands.length; i++) {
    if (match.get_alive(i) === true) {
      if (match.hands[i].length > 0) { return false; }
    }
  }
  return true;
}

function hand_winner (match) {
  var ip = match.state.in_play;
  if (ip.length === 0) { return false; }
  var mx = ip[0]; var trump = ip[0].s; var mxtmp = true;
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

function hand_value (match) {
  var total = 0;
  for (var i = 0; i < match.state.in_play.length; i++) {
    if (match.state.in_play[i].s === Cards.HEART) {
      total++;
    }
    else if (
      match.state.in_play[i].s === Cards.SPADE &&
      match.state.in_play[i].v === Cards.QUEEN
    ) {
      total += 13;
    }
  }
  return total;
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
