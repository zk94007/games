var STATE = {};

function player (name, bankroll, carda, cardb, status, round_bet) {
  this.name = name;
  this.bankroll = bankroll;
  this.cards = [carda, cardb];
  this.status = status;
  this.round_bet = round_bet;
}

function get_state() {
  return STATE;
}
exports.get_state = get_state;

function set_state (state) {
  STATE = state;
}
exports.set_state = set_state;

exports.new_game = function (names, settings) {
  var i;

  STATE = {
    blinds: undefined,
    button_i: 0,
    cards: new Array(52),
    hit_16: settings.hit_16,
    stand_17: settings.stand_17,
    deck_index: 0,
    last_win: {
      hand: '',
      text: []
    },
    players: new Array(names.length),
    round: 0,
    show_cards: false,
    to_play: 0
  };

  var j = 0;
  for (i = 2; i < 15; i++) {
    STATE.cards[j++] = 'h' + i;
    STATE.cards[j++] = 'd' + i;
    STATE.cards[j++] = 'c' + i;
    STATE.cards[j++] = 's' + i;
  }

  for (i = 0; i < names.length; i++) {
    STATE.players[i] = new player(names[i], settings.start_chips, '', '', '', 0);
  }

  return new_round(false, false);
};

function new_round (state, callback) {
  if (state !== false) { set_state(state); }

  STATE.round++;
  STATE.show_cards = false;
  STATE.last_win.hand = '';
  STATE.last_win.text = [];

  if (num_playing() < 2) {
    return (typeof callback === 'function' ? callback(get_state()) : callback);
  }

  for (var i = 0; i < STATE.players.length; i++) {
    STATE.players[i].round_bet = 0;

    if (STATE.players[i].status != 'BUST' && has_money(i)) {
      STATE.players[i].status = 'OPTION';
    }
    else {
      STATE.players[i].status = 'BUST';
    }
  }

  for (var i = 0; i < STATE.players.length; i++) {
    STATE.players[i].cards = ['', ''];
  }

  STATE.button_i = get_next_player_i(STATE.button_i, 1);

  shuffle();
  blinds_and_deal(callback);

  if (callback === false) {
    return get_state();
  }
}
exports.new_round = new_round;

function shuffle() {
  STATE.deck_index = 0;
  STATE.cards.sort(function () {
    return .5 - Math.random();
  });
}

function blinds_and_deal (callback) {
  var nbr_playing = num_playing();
  var i, j;

  if (nbr_playing >= 3) {
    STATE.blinds = 20;
  }
  else {
    STATE.blinds = 50;
  }

  for (i = 0; i < STATE.players.length; i++) {
    j = get_next_player_i(STATE.button_i, i + 1);

    if (STATE.players[j].status === 'BUST' || !has_money(j)) {
      STATE.players[j].round_bet = 0;
      STATE.players[j].bankroll = 0;
      STATE.players[j].cards = ['', ''];
      STATE.players[j].status = 'BUST';
    }
    else {
      STATE.players[j].cards[0] = STATE.cards[STATE.deck_index++];

      var bet_amount = j === STATE.button_i ? 0 : STATE.blinds;
      bet_amount = Math.min(bet_amount, STATE.players[j].bankroll);
      STATE.players[j].round_bet = bet_amount;
      STATE.players[j].bankroll -= bet_amount;
      STATE.players[j].status = 'OPTION';
    }
  }

  for (i = 0; i < STATE.players.length; i++) {
    j = get_next_player_i(STATE.button_i, i + 1);
    if (STATE.players[j].cards[0]) {
      STATE.players[j].cards[1] = STATE.cards[STATE.deck_index++];
    }
  }

  STATE.to_play = get_next_player_i(STATE.button_i, 1);
  main(callback);
}

function main (callback) {
  var in_play = get_num_betting();
  if (in_play === 0) {
    handle_end_of_round(callback);
    return;
  }

  if (
    ['BUST', 'FOLD', 'STAND'].indexOf(STATE.players[STATE.to_play].status) >= 0 ||
    (in_play > 1 && STATE.to_play === STATE.button_i)
  ) {
    STATE.to_play = get_next_player_i(STATE.to_play, 1);
  }
  else {
    return (typeof callback === 'function' ? callback(get_state()) : callback);
  }

  main(callback);
}

function handle_end_of_round (callback) {
  var dealer = STATE.players[STATE.button_i];
  var best_score = get_score(STATE.button_i);
  var winners = [];

  STATE.last_win = { hand: '', text: [] };
  STATE.show_cards = true;

  if (['BUST', 'FOLD'].indexOf(dealer.status) === -1) {
    STATE.last_win.hand = 'dealer (' + best_score + ')';

    var winnings = 0; var beat = 0;
    for (var i = 0; i < STATE.players.length; i++) {
      var score = get_score(i);
      if (i !== STATE.button_i) {
        if (score <= 21 && score > best_score) {
          winners.push(STATE.players[i]);
        }
        else if (STATE.players[i].status !== 'BUST') {
          beat++;
          winnings += STATE.players[i].round_bet;
        }
      }
    }

    if (beat > 0) {
      dealer.bankroll += winnings;
      STATE.last_win.hand += ' beats ' + beat + ' player' + (beat !== 1 ? 's' : '');
      STATE.last_win.text.push(
        dealer.name + ' (+' + winnings + ' chips)'
      );
    }
    else {
      STATE.last_win.hand += ' loses';
    }
  }
  else {
    winners = STATE.players.filter(function (player, i) {
      return (
        ['BUST', 'FOLD'].indexOf(player.status) === -1 &&
        i !== STATE.button_i
      );
    });

    if (winners.length === 0) {
      STATE.last_win.hand = 'no winners';
    }
    else {
      STATE.last_win.hand = 'dealer busts';
    }
  }

  for (var i = 0; i < winners.length; i++) {
    var share =  winners[i].round_bet * 2;
    winners[i].bankroll += share;

    STATE.last_win.text.push(
      winners[i].name + ' (+' + share + ' chips)'
    );
  }

  return (typeof callback === 'function' ? callback(get_state()) : callback);
}

exports.human_move = function (state, player_i, move, callback) {
  set_state(state);

  switch (move.move) {
    case 'hit':
      human_hit(player_i, callback);
      break;
    case 'double':
      human_double(player_i, callback);
      break;
    case 'stand':
      human_stand(player_i, callback);
      break;
    case 'fold':
      human_fold(player_i, callback);
      break;
    case 'resign':
      human_resign(player_i, callback);
      break;
    default:
      return (callback(false));
  }

  if (player_i !== STATE.button_i) {
    STATE.to_play = get_next_player_i(player_i, 1);
  }
  main(callback);
};

function human_hit (player_i, callback) {
  if (get_score(player_i) > 21) {
    human_fold(player_i, callback);
    return;
  }
  else if (
    STATE.stand_17 &&
    player_i === STATE.button_i &&
    get_score(player_i) >= 17
  ) {
    human_stand(player_i, callback);
    return;
  }

  STATE.players[player_i].cards.push(STATE.cards[STATE.deck_index++]);
}

function human_double (player_i, callback) {
  if (get_score(player_i) > 21) {
    human_fold(player_i, callback);
    return;
  }
  else if (player_i === STATE.button_i) {
    return;
  }

  var player = STATE.players[player_i];
  var to_double = Math.min(player.round_bet, player.bankroll);

  player.cards.push(STATE.cards[STATE.deck_index++]);
  player.round_bet += to_double;
  player.bankroll -= to_double;
  player.status = 'STAND';
}

function human_stand (player_i, callback) {
  if (get_score(player_i) > 21) {
    human_fold(player_i, callback);
    return;
  }
  else if (
    STATE.hit_17 &&
    player_i === STATE.button_i &&
    get_score(player_i) < 17
  ) {
    human_hit(player_i, callback);
    return;
  }

  STATE.players[player_i].status = 'STAND';
}

function human_fold (player_i, callback) {
  STATE.players[player_i].status = 'FOLD';
}

function human_resign (player_i, callback) {
  human_fold(player_i, callback);
  STATE.players[player_i].bankroll = 0;
}

exports.ai_move = function (state, player_i, callback) {
  set_state(state);

  var score = get_score(player_i);

  if (score > 21) {
    STATE.players[player_i].status = 'FOLD';
  }
  else if (score >= 17) {
    STATE.players[player_i].status = 'STAND';
  }
  else {
    STATE.players[player_i].cards.push(STATE.cards[STATE.deck_index++]);
  }

  if (player_i !== STATE.button_i) {
    STATE.to_play = get_next_player_i(player_i, 1);
  }
  main(callback);
};

function get_score (player_i) {
  var cards = STATE.players[player_i].cards;
  var total = 0; var aces = 0;
  var i;

  for (i = 0; i < cards.length; i++) {
    var val = parseInt(cards[i].substring(1), 10);

    if (val == 11 || val == 12 || val == 13) {
      total += 10;
    }
    else if (val == 14) {
      total += 11, aces++;
    }
    else {
      total += val;
    }
  }

  for (var i = 0; i < aces; i++) {
    if (total > 21) {
      total -= 10;
    }
  }

  return total;
}

function get_pot_size() {
  return STATE.players.reduce(function (sum, player) {
    return player.round_bet + sum;
  }, 0);
}

function get_num_betting() {
  return STATE.players.reduce(function (sum, player) {
    return (player.status === 'OPTION' ? 1 : 0) + sum;
  }, 0);
}

function get_next_player_i (i, delta) {
  var j = 0, step = 1;
  if (delta < 0) step =- 1;
  while (1) {
    i += step;
    if (i >= STATE.players.length) i = 0;
    else if (i < 0) i = STATE.players.length - 1;
    if (['BUST', 'FOLD'].indexOf(STATE.players[i].status) >= 0 || ++j < delta) {}
    else break;
  }
  return i;
}

function has_money (i) {
  if (STATE.players[i].bankroll >= .01) return true;
  return false;
}

function num_playing() {
  var count = 0;
  for (var i = 0; i < STATE.players.length; i++) {
    if (has_money(i)) count += 1;
  }
  return count;
}
