var STATE = {};

function player (name, bankroll, carda, cardb, status, total_bet, subtotal_bet) {
  this.name = name;
  this.bankroll = bankroll;
  this.cards = [carda, cardb];
  this.status = status;
  this.total_bet = total_bet;
  this.subtotal_bet = subtotal_bet;
}

function make_deck() {
  STATE.cards = new Array(52);
  var i, j = 0;
  for (i = 2; i < 15; i++) {
    STATE.cards[j++] = 'h' + i;
    STATE.cards[j++] = 'd' + i;
    STATE.cards[j++] = 'c' + i;
    STATE.cards[j++] = 's' + i;
  }
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
  STATE = {
    blinds: {
      small: undefined,
      big: undefined
    },
    board: [],
    button_i: 0,
    cards: [],
    current: {
      bet: 0,
      min_raise: 0
    },
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

  make_deck();
  for (var i = 0; i < names.length; i++) {
    STATE.players[i] = new player(names[i], settings.start_chips, '', '', '', 0, 0);
  }
  reset_player_statuses(0);
  clear_bets();

  return new_round(false, false);
};

function new_round (state, callback) {
  if (state !== false) { set_state(state); }

  STATE.round++; STATE.show_cards = false;
  STATE.last_win.hand = '';
  STATE.last_win.text = [];

  if (num_playing() < 2) {
    if (typeof callback === 'function') { return (callback(get_state())); }
    return;
  }

  reset_player_statuses(1);
  clear_bets();
  clear_pot();
  STATE.current.min_raise = 0;
  collect_cards();
  STATE.button_i = get_next_player_position(STATE.button_i, 1);

  shuffle();
  blinds_and_deal(callback);

  if (callback === false) {
    return get_state();
  }
}
exports.new_round = new_round;

function collect_cards() {
  STATE.board = new Array(5);
  for (var i = 0; i < STATE.players.length; i++) {
    STATE.players[i].cards = ['', ''];
  }
}

function shuffle() {
  STATE.deck_index = 0;
  STATE.cards.sort(compRan);
}

function blinds_and_deal (callback) {
  STATE.blinds.small = 5;
  STATE.blinds.big = 10;

  var nbr_playing = num_playing();
  if (nbr_playing == 3) {
    STATE.blinds.small = 10;
    STATE.blinds.big = 20;
  }
  else if (nbr_playing < 3) {
    STATE.blinds.small = 25;
    STATE.blinds.big = 50;
  }

  var small_blind = get_next_player_position(STATE.button_i, 1);
  bet(small_blind, STATE.blinds.small);

  var big_blind = get_next_player_position(small_blind, 1);
  bet(big_blind, STATE.blinds.big);

  STATE.players[big_blind].status = 'OPTION';
  STATE.to_play = get_next_player_position(big_blind, 1);
  deal_and_write_a(callback);
}
function deal_and_write_a (callback) {
  for (var i = 0; i < STATE.players.length; i++) {
    var j = get_next_player_position(STATE.button_i, 1+i);
    if (STATE.players[j].cards[0]) break;
    STATE.players[j].cards[0] = STATE.cards[STATE.deck_index++];
  }
  deal_and_write_b(callback);
}

function deal_and_write_b (callback) {
  for (var i = 0; i < STATE.players.length; i++) {
    var j = get_next_player_position(STATE.button_i, 1+i);
    if (STATE.players[j].cards[1]) break;
    STATE.players[j].cards[1] = STATE.cards[STATE.deck_index++];
  }
  main(callback);
}

function deal_flop (callback) {
  for (var i = 0; i < 3; i++) {
    STATE.board[i] = STATE.cards[STATE.deck_index++];
  }
  if (get_num_betting() > 1) return (callback(get_state()));
  ready_for_next_card(callback);
}

function deal_fourth (callback) {
  STATE.board[3] = STATE.cards[STATE.deck_index++];
  if (get_num_betting() > 1) return (callback(get_state()));
  else ready_for_next_card(callback);
}

function deal_fifth (callback) {
  STATE.board[4] = STATE.cards[STATE.deck_index++];
  if (get_num_betting() > 1) return (callback(get_state()));
  else ready_for_next_card(callback);
}

function main (callback) {
  var increment_bettor_index = 0;
  if (['BUST', 'FOLD'].indexOf(STATE.players[STATE.to_play].status) >= 0) {
    increment_bettor_index = 1;
  }
  else if (!has_money(STATE.to_play)) {
    STATE.players[STATE.to_play].status = 'CALL';
    increment_bettor_index = 1;
  }
  else if (STATE.players[STATE.to_play].status == 'CALL' && STATE.players[STATE.to_play].subtotal_bet == STATE.current.bet) {
    increment_bettor_index = 1;
  }
  else {
    STATE.players[STATE.to_play].status = '';
    if (get_num_betting() > 1) {
      if (typeof callback === 'function') { return (callback(get_state())); }
      return;
    }
    else {
      STATE.players[STATE.to_play].status = 'CALL';
      bet(STATE.to_play, STATE.current.bet - STATE.players[STATE.to_play].subtotal_bet);
    }
  }

  var can_break = true;
  for (var j = 0; j < STATE.players.length; j++) {
    var s = STATE.players[j].status;
    if (s == 'OPTION') {
      can_break = false;
      break;
    }
    if (s != 'BUST' && s != 'FOLD') {
      if (has_money(j) && STATE.players[j].subtotal_bet < STATE.current.bet) {
        can_break = false;
        break;
      }
    }
  }

  if (increment_bettor_index) {
    STATE.to_play = get_next_player_position(STATE.to_play, 1);
  }

  if (can_break) ready_for_next_card(callback);
  else main(callback);
}

function handle_end_of_round (callback) {
  var candidates = new Array(STATE.players.length);
  var allocations = new Array(STATE.players.length);
  var my_total_bets_per_player = new Array(STATE.players.length);

  for (var i = 0; i < candidates.length; i++) {
    allocations[i] = 0;
    my_total_bets_per_player[i] = STATE.players[i].total_bet;
    if (['FOLD', 'BUST'].indexOf(STATE.players[i].status) === -1) candidates[i] = STATE.players[i];
  }

  var my_total_pot_size = get_pot_size();
  var my_best_hand_name = '';
  var best_hand_players;

  while (1) {
    var winners = get_winners(candidates);

    if (!my_best_hand_name) {
      my_best_hand_name = get_last_winning_hand_name();
      best_hand_players = winners;
    }
    if (!winners) break;

    var lowest_in_for = my_total_pot_size*2;
    var num_winners = 0;
    for (var i = 0; i < winners.length; i++) {
      if (!winners[i]) continue;
      num_winners++;
      if (my_total_bets_per_player[i] < lowest_in_for) {
        lowest_in_for = my_total_bets_per_player[i];
      }
    }

    var my_pot = 0;
    for (var i = 0; i < STATE.players.length; i++) {
      if (lowest_in_for >= my_total_bets_per_player[i]) {
        my_pot += my_total_bets_per_player[i];
        my_total_bets_per_player[i] = 0;
      }
      else {
        my_pot += lowest_in_for;
        my_total_bets_per_player[i] -= lowest_in_for;
      }
    }

    var share = my_pot/num_winners;
    for (var i = 0; i < winners.length; i++) {
      if (my_total_bets_per_player[i] < .01) candidates[i] = null;
      if (!winners[i]) continue;
      allocations[i] += share;
      my_total_pot_size -= share;
    }
  }

  STATE.last_win.text = []; STATE.show_cards = true;
  for (var i = 0; i < allocations.length; i++) {
    if (allocations[i] > 0) {
      var a_string = '' + allocations[i];
      var dot_index = a_string.indexOf('.');
      if (dot_index > 0) {
        a_string = '' + a_string + '00';
        allocations[i] = a_string.substring(0, dot_index+3) - 0;
      }
      STATE.last_win.text.push(STATE.players[i].name + ' (+' + allocations[i] + ' chips)');
      STATE.players[i].bankroll += allocations[i];
    }
    else {
      if (!has_money(i) && STATE.players[i].status != 'BUST') {
        STATE.players[i].status = 'BUST';
      }
    }
  }

  var detail = '';
  for (var i = 0; i < STATE.players.length; i++) {
    detail += STATE.players[i].name + ' bet ' + STATE.players[i].total_bet + ' & got ' + allocations[i] + ".\\n";
  }

  if (typeof callback === 'function') { return (callback(get_state())); }
  return;
}

function ready_for_next_card (callback) {
  var num_betting = get_num_betting();

  for (var i = 0; i < STATE.players.length; i++) {
    STATE.players[i].total_bet += STATE.players[i].subtotal_bet;
  }
  clear_bets();

  if (STATE.board[4]) {
    handle_end_of_round(callback);
    return;
  }

  STATE.current.min_raise = STATE.blinds.big;
  reset_player_statuses(2);
  if (STATE.players[STATE.button_i].status == 'FOLD') {
    STATE.players[get_next_player_position(STATE.button_i, -1)].status = 'OPTION';
  }
  else {
    STATE.players[STATE.button_i].status = 'OPTION';
  }

  STATE.to_play = get_next_player_position(STATE.button_i, 1);
  if (num_betting < 2) STATE.show_cards = true;

  if (!STATE.board[0]) deal_flop(callback);
  else if (!STATE.board[3]) deal_fourth(callback);
  else if (!STATE.board[4]) deal_fifth(callback);
}

function bet (player_index, bet_amount) {
  var old_current_bet;

  if (STATE.players[player_index].status == 'FOLD') {}
  else if (bet_amount >= STATE.players[player_index].bankroll) { // ALL IN
    bet_amount = STATE.players[player_index].bankroll;
    old_current_bet = STATE.current.bet;
    if (STATE.players[player_index].subtotal_bet + bet_amount > STATE.current.bet) {
      STATE.current.bet = STATE.players[player_index].subtotal_bet + bet_amount;
    }
    var new_current_min_raise = STATE.current.bet - old_current_bet;
    if (new_current_min_raise > STATE.current.min_raise) STATE.current.min_raise = new_current_min_raise;
    STATE.players[player_index].status = 'CALL';
  }
  else if (bet_amount + STATE.players[player_index].subtotal_bet == STATE.current.bet) { // CALL
    STATE.players[player_index].status = 'CALL';
  }
  else if (STATE.current.bet > STATE.players[player_index].subtotal_bet + bet_amount) { // 2 SMALL
    if (player_index == 0) {
      console.log('The current bet to match is ' + STATE.current.bet);
      console.log('You must bet a total of at least ' + (STATE.current.bet-STATE.players[player_index].subtotal_bet) + ' or fold');
    }
    return 0;
  }
  else if (
    bet_amount + STATE.players[player_index].subtotal_bet > STATE.current.bet &&
    get_pot_size() > 0 &&
    bet_amount + STATE.players[player_index].subtotal_bet - STATE.current.bet < STATE.current.min_raise
  ) {
    if (player_index == 0) {
      console.log('Minimum raise is currently ' + STATE.current.min_raise);
    }
    return 0;
  }
  else { // RAISE
    STATE.players[player_index].status = 'CALL';
    old_current_bet = STATE.current.bet;
    STATE.current.bet = STATE.players[player_index].subtotal_bet + bet_amount;
    if (get_pot_size() > 0) {
      STATE.current.min_raise = STATE.current.bet - old_current_bet;
      if (STATE.current.min_raise < STATE.blinds.big) STATE.current.min_raise = STATE.blinds.big;
    }
  }
  STATE.players[player_index].subtotal_bet += bet_amount;
  STATE.players[player_index].bankroll -= bet_amount;
  return 1;
}

exports.human_move = function (state, player_i, move, callback) {
  set_state(state);

  switch (move.move) {
    case 'check':
    case 'call':
      human_call(player_i, callback);
      break;
    case 'bet':
    case 'raise':
      human_bet(player_i, move.amount, callback);
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
};

function human_call (player_i, callback) {
  STATE.players[player_i].status = 'CALL';
  var is_ok_bet = bet(player_i, STATE.current.bet - STATE.players[player_i].subtotal_bet);
  if (is_ok_bet) {
    STATE.to_play = get_next_player_position(player_i, 1);
    main(callback);
  }
  else { return (callback(false)); }
}

function human_bet (player_i, bet_amount, callback) {
  bet_amount = '' + bet_amount;
  var m = '';

  for (var i = 0; i < bet_amount.length; i++) {
    var c = bet_amount.substring(i, i+1);
    if (c == '0' || c > 0) m += '' + c;
  }
  if (m == '') return false;

  bet_amount = m-0;
  if (bet_amount < 0 || isNaN(bet_amount)) bet_amount = 0;
  var to_call = STATE.current.bet - STATE.players[player_i].subtotal_bet;
  bet_amount += to_call;

  var is_ok_bet = bet(player_i, bet_amount);
  if (is_ok_bet) {
    STATE.players[player_i].status = 'CALL';
    STATE.to_play = get_next_player_position(player_i, 1);
    main(callback);
  }
  else { return (callback(false)); }
}

function human_fold (player_i, callback) {
  STATE.players[player_i].status = 'FOLD';
  STATE.to_play = get_next_player_position(player_i, 1);
  main(callback);
}

function human_resign (player_i, callback) {
  STATE.players[player_i].status = 'FOLD';
  STATE.players[player_i].bankroll = 0;
  STATE.to_play = get_next_player_position(player_i, 1);
  main(callback);
}

exports.bot_bet = function (state, x, callback) {
  set_state(state);

  var b = 0;
  var n = STATE.current.bet - STATE.players[x].subtotal_bet;

  if (!STATE.board[0]) b = get_preflop_bet();
  else b = get_postflop_bet();

  if (b >= STATE.players[x].bankroll) { // ALL IN
    STATE.players[x].status = '';
  }
  else if (b < n) { // BET 2 SMALL
    b = 0;
    STATE.players[x].status = 'FOLD';
  }
  else if (b == n) { // CALL
    STATE.players[x].status = 'CALL';
  }
  else if (b > n) {
    if (b-n < STATE.current.min_raise) { // RAISE 2 SMALL
      b = n;
      STATE.players[x].status = 'CALL';
    }
    else STATE.players[x].status = ''; // RAISE
  }

  if (bet(x, b) == 0) {
    STATE.players[x].status = 'FOLD';
    bet(x, 0);
  }

  STATE.to_play = get_next_player_position(STATE.to_play, 1);
  main(callback);
};

function make_readable_rank (r) {
  if (r < 11) return r;
  else if (r == 11) return 'J';
  else if (r == 12) return 'Q';
  else if (r == 13) return 'K';
  else if (r == 14) return 'A';
}

function get_pot_size() {
  var p = 0;
  for (var i = 0; i < STATE.players.length; i++) {
    p += STATE.players[i].total_bet + STATE.players[i].subtotal_bet;
  }
  return p;
}

function clear_bets() {
  for (var i = 0; i < STATE.players.length; i++) {
    STATE.players[i].subtotal_bet = 0;
  }
  STATE.current.bet = 0;
}

function clear_pot() {
  for (var i = 0; i < STATE.players.length; i++) {
    STATE.players[i].total_bet = 0;
  }
}

function reset_player_statuses (type) {
  for (var i = 0; i < STATE.players.length; i++) {
    if (type == 0) STATE.players[i].status = '';
    else if (type == 1 && STATE.players[i].status != 'BUST') STATE.players[i].status = '';
    else if (type == 2 && ['BUST', 'FOLD'].indexOf(STATE.players[i].status) === -1) STATE.players[i].status = '';
  }
}

function get_num_betting() {
  var n = 0;
  for (var i = 0; i < STATE.players.length; i++) {
    if (['BUST', 'FOLD'].indexOf(STATE.players[i].status) === -1 && has_money(i)) n++;
  }
  return n;
}

function get_next_player_position (i, delta) {
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
function compRan() {
  return .5 - Math.random();
}

function num_playing() {
  var count = 0;
  for (var i = 0; i < STATE.players.length; i++) {
    if (has_money(i)) count += 1;
  }
  return count;
}

/* AI */

var P, HCONF, ID_CONF, CALL_LEVEL, BET_LEVEL, POT_LEVEL,
    BANKROLL, NUM_IN_HAND, NUM_IN_GAME, RANKA, RANKB,
    FOLD, CALL, SMALL, MED, BIG, ALLIN;

// PREFLOP
function get_preflop_bet() {
  setup();

  if (HCONF > 60 || RANKA == RANKB || RANKA > 13 || RANKB > 13) {
    var other_making_stand = 0;
    for (var i = 1; i < STATE.players.length; i++) {
      if (STATE.players[i].bankroll < 1 && STATE.players[i].status != 'BUST') {
        other_making_stand = 1;
        break;
      }
    }
    if (other_making_stand < 1) {
      // should really check to see if bet_level is big and anyone has called...that's taking a stand too...
      if (BET_LEVEL > 70) return eval(whatdo('40:CALL,60:ALLIN'));
      else return eval(whatdo('15:MED,40:SMALL,45:CALL'));
    }
  }

  if (HCONF > 99) {
    if (POT_LEVEL > 75) return eval(whatdo('60:ALLIN,10:BIG,20:MED,5:SMALL,5:CALL'));
    if (NUM_IN_HAND < 4) return eval(whatdo('2:BIG,15:MED,33:SMALL,50:CALL'));
    return eval(whatdo('2:ALLIN,8:BIG,40:MED,40:SMALL,10:CALL'));
  }
  if (HCONF > 90) {
    if (POT_LEVEL > 50) return eval(whatdo('15:ALLIN,35:BIG,30:MED,15:SMALL,5:CALL'));
    if (NUM_IN_HAND > 3) return eval(whatdo('5:ALLIN,15:BIG,35:MED,35:SMALL,10:CALL'));
    return eval(whatdo('2:ALLIN,6:BIG,15:MED,55:SMALL,22:CALL'));
  }
  if (HCONF > 80) {
    if (POT_LEVEL > 50) {
      if (ID_CONF == 'LO') return eval(whatdo('100:ALLIN'));
      return eval(whatdo('100:CALL'));
    }
    return eval(whatdo('5:ALLIN,15:BIG,15:MED,30:SMALL,35:CALL'));
  }

  if (P.subtotal_bet > 0 && CALL_LEVEL < 40) {
    if (HCONF > 20 || RANKA > 10 || RANKB > 10) return eval(whatdo('5:SMALL,95:CALL'));
  }

  if (HCONF > 70) {
    if (POT_LEVEL > 75) {
      if (ID_CONF == 'LO') return eval(whatdo('100:ALLIN'));
      return eval(whatdo('100:CALL'));
    }
    if (POT_LEVEL > 50) {
      if (ID_CONF == 'LO') return eval(whatdo('50:ALLIN,50:BIG'));
      return eval(whatdo('100:CALL'));
    }
    if (NUM_IN_HAND > 3) return eval(whatdo('5:ALLIN,15:BIG,30:MED,30:SMALL,20:CALL'));
    return eval(whatdo('2:ALLIN,7:BIG,35:MED,36:SMALL,20:CALL'));
  }
  if (HCONF > 60) {
    if (POT_LEVEL > 75) {
      if (ID_CONF == 'LO') return eval(whatdo('100:ALLIN'));
      if (CALL_LEVEL < 70) return CALL;
      if (ID_CONF == 'HI') return eval(whatdo('25:CALL'));
      return eval(whatdo('34:CALL'));
    }
    if (POT_LEVEL > 50){
      if (ID_CONF == 'LO') return eval(whatdo('75:ALLIN,25:BIG'));
      if (CALL_LEVEL < 70) return CALL;
      return eval(whatdo('65:CALL'));
    }
    if (NUM_IN_HAND > 3) return eval(whatdo('3:ALLIN,17:BIG,30:MED,30:SMALL,20:CALL'));
    return eval(whatdo('1:ALLIN,2:BIG,7:MED,40:SMALL,50:CALL'));
  }
  if (HCONF > 50) {
    if (POT_LEVEL > 75) {
      if (CALL_LEVEL < 40) return CALL;
      return FOLD;
    }
    if (POT_LEVEL > 50) {
      if (CALL_LEVEL < 40) return CALL;
      return eval(whatdo('1:ALLIN,8:CALL'));
    }
    return eval(whatdo('1:ALLIN,1:BIG,5:MED,20:SMALL,73:CALL'));
  }
  if (HCONF > 40) {
    if (BET_LEVEL > 40) {
      if (CALL_LEVEL < 40) return CALL;
      return FOLD;
    }
    if (BET_LEVEL > 30) {
      if (CALL_LEVEL < 30) return CALL;
      if (ID_CONF == 'LO') return eval(whatdo('24:CALL'));
      return eval(whatdo('37:CALL'));
    }
    return eval(whatdo('1:ALLIN,1:BIG,19:SMALL,79:CALL'));
  }
  if (HCONF > 30) {
    if (BET_LEVEL > 40) {
      if (CALL_LEVEL < 30) return CALL;
      return FOLD;
    }
    if (BET_LEVEL > 30) {
      if (CALL_LEVEL < 30) return eval(whatdo('15:SMALL,85:CALL'));
      if (ID_CONF == 'LO') return eval(whatdo('1:CALL'));
      return eval(whatdo('20:CALL'));
    }
    return eval(whatdo('1:ALLIN,1:BIG,9:SMALL,89:CALL'));
  }
  if (HCONF > 20) {
    if (BET_LEVEL > 30) {
      if (CALL_LEVEL < 30) return CALL;
      return FOLD;
    }
    if (BET_LEVEL > 20) {
      if (CALL_LEVEL < 20) return CALL;
      if (ID_CONF == 'LO') return eval(whatdo('1:CALL'));
      return eval(whatdo('20:CALL'));
    }
    return eval(whatdo('1:ALLIN,99:CALL'));
  }
  if (CALL_LEVEL > 20) return FOLD;
  if (CALL_LEVEL > 10) {
    if (ID_CONF == 'LO') return eval(whatdo('20:CALL'));
    return eval(whatdo('1:MED,40:CALL'));
  }
  if (CALL_LEVEL > 5) {
    if (ID_CONF == 'LO') return eval(whatdo('1:BIG,15:CALL'));
    return eval(whatdo('35:CALL'));
  }
  if (ID_CONF == 'LO') return eval(whatdo('1:ALLIN,79:CALL'));

  return CALL;
}

var hole_rankings =
  'AA:100,KK:96,QQ:95,JJ:93,AKs:94,' +
  'TT:86,AQs:85,AJs:84,KQs:84,AK:85,' +
  '99:76,JTs:75,QJs:75,KJs:74,ATs:74,AQ:73,' +
  'T9s:66,KQ:66,88:66,QTs:65,98s:64,J9s:65,AJ:65,KTs:65,' + // THIS & ABOVE: EARLY POSITION
  '77:56,87s:55,Q9s:55,T8s:54,KJ:55,QJ:54,JT:54,76s:53,97s:53,Axs:54,65s:53,' + // THIS & ABOVE: LATE POSITION
  '66:46,AT:46,55:45,86s:44,KT:45,QT:44,54s:45,K9s:45,J8s:44,75s:43,' +
  '44:36,J9:35,64s:33,T9:34,53s:33,33:35,98:34,43s:34,22:34,Kxs:34,T7s:33,Q8s:33,' + // THIS & ABOVE: BUTTON
  '87:26,A9:26,Q9:25,76:25,42s:23,32s:23,96s:23,85s:22,J8:22,J7s:22,65:22,54:22,74s:21,K9:22,T8:21,';

function get_hole_ranking() {
  var player = STATE.players[STATE.to_play];
  var a = player.cards[0];
  var b = player.cards[1];
  var n_rank_a = get_rank(a);
  var n_rank_b = get_rank(b);
  if (n_rank_b > n_rank_a) {
    a = player.cards[1];
    b = player.cards[0];
    n_rank_a = get_rank(a);
    n_rank_b = get_rank(b);
  }
  var r_rank_a = my_make_readable_rank(n_rank_a);
  var r_rank_b = my_make_readable_rank(n_rank_b);
  var suited='';
  if (get_suit(a) == get_suit(b)) suited = 's';
  var h = '';
  if (n_rank_a == n_rank_b) h = '' + r_rank_a + '' + r_rank_b;
  else h = '' + r_rank_a + '' + r_rank_b + suited;
  var q = lookup_hole_ranking(h);
  if (!q) {
    h = '' + r_rank_a + 'x' + suited;
    q = lookup_hole_ranking(h);
  }
  return q;
}
function my_make_readable_rank (r) {
  var rank = make_readable_rank(r);
  if (rank == 10) rank = 'T';
  return rank;
}
function lookup_hole_ranking (h) {
  var i = hole_rankings.indexOf(h + ':');
  if (i < 0) return 0;
  var j = hole_rankings.indexOf(',', i);
  var r = hole_rankings.substring(i + h.length+1, j);
  return r - 0;
}

// POSTFLOP
function get_postflop_bet() {
  setup();
  var ROUND = 3;
  if (STATE.board[4]) ROUND = 5;
  else if (STATE.board[3]) ROUND = 4;

  if (P.subtotal_bet > 0) { // so no check-raising!!!!!
    if (HCONF > 20 || RANKA > 10 || RANKB > 10) {
      if ((CALL_LEVEL < 40 && ROUND < 4) || (CALL_LEVEL < 30 && ROUND < 5)) return CALL;
    }
  }

  var VERDICT = '';
  var STRAIGHT_FLUSH = test_straight_flush(P);
  var FOUR_OF_A_KIND = test_four_of_a_kind(P);
  var FULL_HOUSE = test_full_house(P);
  var FLUSH = test_flush(P);
  var STRAIGHT = test_straight(P);
  var THREE_OF_A_KIND = test_three_of_a_kind(P);
  var TWO_PAIR = test_two_pair(P);
  var ONE_PAIR = test_one_pair(P);
  var HI_CARD = test_hi_card(P);
  var FLUSH_DRAW = 0, STRAIGHT_DRAW = 0;

  if (ROUND < 5) {
    if (get_xml('num_needed', FLUSH) == 1) {
      var suit = get_xml('suit', FLUSH);
      if (P.cards[0].substring(0, 1) == suit || P.cards[1].substring(0, 1) == suit) FLUSH_DRAW = 1;
    }
    if (get_xml('num_needed', STRAIGHT) == 1) { // of course, it might be on the board...
      STRAIGHT_DRAW = 1; // .....bottom ended & top ended straight draws? 1 point for each?!!.....
    }
  }

  if (get_xml('num_needed', STRAIGHT_FLUSH) < 1) {
    if (get_xml('num_mine', STRAIGHT_FLUSH) > 0) VERDICT = 'GREAT';
    else VERDICT = 'PLAY BOARD';
  }
  if (VERDICT == '' && get_xml('num_needed', FOUR_OF_A_KIND) < 1) {
    if (get_xml('num_mine', FOUR_OF_A_KIND) > 0) VERDICT = 'GREAT';
    else {
      VERDICT = 'PLAY BOARD'; // SHOULD CHECK MY KICKER!!!!!.....
    }
  }
  if (VERDICT == '' && get_xml('num_needed', FULL_HOUSE) < 1) { // consider 2 or 3 on the board, (higher full house, 4 of a kind)
    if (get_xml('num_mine', FULL_HOUSE) > 0) VERDICT = 'GREAT';
    else VERDICT = 'PLAY BOARD';
  }
  if (VERDICT == '' && get_xml('num_needed', FLUSH) < 1) { // look for full house, etc.
    var num_mine = get_xml('num_mine', FLUSH);
    if (num_mine > 1) VERDICT = 'GREAT';
    else if (num_mine > 0) {
      var rank = 0;
      if (P.cards[0].substring(0, 1) == get_xml('suit', FLUSH)) rank = RANKA;
      else rank = RANKB;
      if (rank < 11) VERDICT = 'GOOD'; //12?????
      else VERDICT = 'GREAT';
    }
    else VERDICT = 'MAYBE'; // could look @ board & decide if person was tryin' for flush...FACTOR: ANALYZE BETTING PATTERNS!...
  }
  if (VERDICT == '' && get_xml('num_needed', STRAIGHT) < 1) { // look for flush, etc.
    if (get_xml('num_mine', STRAIGHT) > 0) VERDICT = 'GREAT';
    else VERDICT = 'PLAY BOARD';
    if (exists_flush_potential() < 3) VERDICT = 'MAYBE'; ///// POTENTIALLY BAD!!!!! unless i can get it...!!!!!
  }
  if (VERDICT == '' && get_xml('num_needed', THREE_OF_A_KIND) < 1) { // look for straight, etc.
    if (get_xml('num_mine', THREE_OF_A_KIND) > 0) VERDICT = 'GREAT';
    else {
      var k1 = get_xml('kicker_1',THREE_OF_A_KIND);
      var k2 = get_xml('kicker_2',THREE_OF_A_KIND);
      if ((k1 == RANKA && k2 == RANKB) || (k1 == RANKB && k2 == RANKA)) VERDICT = 'GREAT';
      else if (k1 == RANKA || k1 == RANKB) VERDICT = 'GOOD';
      else if (k1 > 11 && k2 > 9) VERDICT = 'GOOD';
      else VERDICT = 'MAYBE'; // should really bet 'POTENTIALLY BAD'.....but can i get it?.....!!!!!
    }
    if (exists_flush_potential() < 3) VERDICT = 'MAYBE'; ///// POTENTIALLY BAD!!!!! unless i can get it...!!!!!
    if (exists_straight_potential() < 2) VERDICT = 'MAYBE'; ///// POTENTIALLY BAD!!!!! unless i can get it...!!!!!
  }
  if (VERDICT == '' && get_xml('num_needed', TWO_PAIR) < 1) {
    var num_mine = get_xml('num_mine', TWO_PAIR);
    if (num_mine > 1) {
      if (RANKA == RANKB) VERDICT = 'GOOD';
      else VERDICT = 'GREAT';
    }
    else if (num_mine > 0) {
      if (ROUND < 4) VERDICT = 'GREAT'; //hmmmmm.....
      else {
        var rank = get_xml('rank_1', TWO_PAIR);
        if (rank != RANKA && rank != RANKB) var rank = get_xml('rank_2', TWO_PAIR);
        if (rank < 10) VERDICT = 'MAYBE'; // 11?????
        else VERDICT = 'GOOD';
      }
    }
    else {
      var kick = get_xml('kicker', TWO_PAIR);
      if (kick == RANKA || kick == RANKB || kick > 10) VERDICT = 'PLAY BOARD';
      else VERDICT = 'MAYBE'; // POTENTIALLY BAD??????..... unless i can get it.....!!!!!
    }
    if (exists_flush_potential() < 3) VERDICT = 'MAYBE'; ///// POTENTIALLY BAD!!!!! unless i can get it.....!!!!!
    if (exists_straight_potential() < 2) VERDICT = 'MAYBE'; ///// POTENTIALLY BAD!!!!! unless i can get it.....!!!!!
  }
  if (VERDICT == '' && get_xml('num_needed', ONE_PAIR) < 1) {
    if (get_xml('num_mine', ONE_PAIR) > 0) {
      var my_rank = get_xml('rank', ONE_PAIR);
      var num_overcards = 0;
      for (var i = 0; i < STATE.board.length; i++) {
        if (STATE.board[i] && get_rank(STATE.board[i]) > my_rank) num_overcards++;
      }
      if (num_overcards < 1) {
        if (my_rank > 11) VERDICT = 'GREAT';
        VERDICT = 'GOOD';
      }
      else if (num_overcards < 2) {
        if (my_rank > 7) VERDICT = 'GOOD';
        VERDICT = 'MAYBE';
      }
      else VERDICT = 'MAYBE';
      if (exists_flush_potential() < 3) VERDICT = 'MAYBE'; /////POTENTIALLY BAD!!!!! unless i can get it.....!!!!!
      if (exists_straight_potential() < 2) VERDICT = 'MAYBE'; /////POTENTIALLY BAD!!!!! unless i can get it.....!!!!!
    }
    // add verdict 'POTENTIALLY BAD' here, for example, for when the board looks dangerous?
    // but what if i can get it!?!?!
  }

  //special case if verdict is MAYBE AND i have a draw...tend not to fold
  //special case where verdict is good & i have a draw...tend not to fold

  if (VERDICT == 'GREAT' || VERDICT == 'GOOD' || VERDICT == 'MAYBE' || RANKA == RANKB) {
    var other_making_stand = 0;
    for (var i = 1; i < STATE.players.length; i++) {
      if (STATE.players[i].bankroll < 1 && STATE.players[i].status != 'BUST') {
        other_making_stand = 1;
        break;
      }
    }
    if (other_making_stand < 1) { // should really check to see if bet_level is big and anyone has called...that's taking a stand too...
      if (BET_LEVEL > 70) return eval(whatdo('40:CALL,60:ALLIN'));
      else return eval(whatdo('10:MED,40:SMALL,50:CALL'));
    }
  }

  if (VERDICT == 'GREAT') {
    if (ROUND < 5) return eval(whatdo('5:ALLIN,5:BIG,25:MED,45:SMALL,20:CALL'));
    return eval(whatdo('30:ALLIN,40:BIG,30:MED'));
  }
  if (VERDICT == 'GOOD') {
    if (ROUND < 4) {
      if (BET_LEVEL > 79) {
        if (CALL_LEVEL < 70 || FLUSH_DRAW) return CALL;
        return eval(whatdo('59:CALL'));
      }
      if (P.subtotal_bet > 0) return eval(whatdo('1:ALLIN,2:BIG,5:MED,20:SMALL,72:CALL'));
      return eval(whatdo('3:ALLIN,40:BIG,42:MED,10:SMALL,5:CALL'));
    }
    if (BET_LEVEL < 50) {
      if (P.subtotal_bet > 0) return eval(whatdo('1:BIG,3:MED,21:SMALL,75:CALL'));
      return eval(whatdo('10:BIG,20:MED,50:SMALL,20:CALL'));
    }
    if (BET_LEVEL < 80) {
      if (CALL_LEVEL < 50) return CALL;
      return eval(whatdo('65:CALL')); // SOME THINGS DEPEND ON THE BOARD, POT ODDS, CONFIDENCE!!!!!
    }
    if (CALL_LEVEL < 70) return CALL;
    if (ROUND < 5) return eval(whatdo('35:CALL'));
    return eval(whatdo('25:CALL'));
  }
  if (VERDICT == 'MAYBE') {
    if (BET_LEVEL < 50) {
      if (CALL > 0) return eval(whatdo('5:MED,15:SMALL,80:CALL'));
      return eval(whatdo('5:BIG,20:MED,50:SMALL,25:CALL'));
    }
    if (BET_LEVEL < 70) {
      if (ROUND < 4 && FLUSH_DRAW) return CALL;
      if (CALL_LEVEL < 40) return CALL;
      if (ID_CONF == 'LO') {
        if (ROUND < 4) return eval(whatdo('35:CALL'));
        if (ROUND < 5) return eval(whatdo('65:CALL'));
        return eval(whatdo('89:CALL'));
      }
      if (ROUND < 4) return eval(whatdo('61:CALL'));
      if (ROUND < 5) return eval(whatdo('31:CALL'));
      return eval(whatdo('19:CALL'));
    }
    if (CALL_LEVEL < 40) return CALL;
    if (ROUND < 4) {
      if (CALL_LEVEL < 50) return CALL;
      return eval(whatdo('50:CALL'));
    }
    return eval(whatdo('11:CALL'));
  }
  if (FLUSH_DRAW) {
    if (ROUND < 4) return eval(whatdo('20:MED,40:SMALL,40:CALL'));
    if (ROUND < 5) {
      if (CALL < 1) return eval(whatdo('10:MED,90:SMALL'));
      if (CALL_LEVEL < 40) return CALL;
      return eval(whatdo('33:CALL')); // depends on how good my cards are!!!!!
    }
    else if (STRAIGHT_DRAW) {
      if (BET_LEVEL < 50) {
        if (ROUND < 4) return eval(whatdo('20:MED,40:SMALL,40:CALL'));
        if (ROUND < 5) return eval(whatdo('5:MED,40:SMALL,55:CALL'));
      }
      else {
        if (CALL_LEVEL < 40) return CALL;
        if (ROUND < 4) return eval(whatdo('29:CALL')); // depends on how good my cards are!!!!!
        if (ROUND < 5) return eval(whatdo('9:CALL'));
      }
    }
    // otherwise, cleanup process handles it
  }
  if (VERDICT == 'PLAY BOARD') return CALL;

  // perhaps use the ranking to come up w/ a preliminary strategy & then modify that strategy:
  // bluff
  // slow play
  // take a stand...human wins 4 in a row & human still playing & num players is 2 & i have good/maybe cards then call!
  // play straight

  var hi_rank = RANKA, lo_rank = RANKB;
  if (RANKA < RANKB) { hi_rank = RANKB; lo_rank = RANKA; }
  if (HCONF > 80) {
    if (CALL < 1) {
      if (ROUND < 5) return eval(whatdo('10:MED,80:SMALL,10:CALL'));
      return eval(whatdo('20:MED,70:SMALL,10:CALL'));
    }
    if (CALL_LEVEL < 50) return CALL;
    if (CALL_LEVEL < 70 && ROUND < 5) return CALL;
    if (CALL_LEVEL < 80 && ROUND < 4) return CALL;
    return FOLD;
  }
  if (HCONF > 70) {
    if (CALL < 1) {
      if (ROUND < 5) return eval(whatdo('10:MED,75:SMALL,15:CALL'));
      return eval(whatdo('10:MED,80:SMALL,10:CALL'));
    }
    if (CALL_LEVEL < 40) return CALL;
    if (CALL_LEVEL < 50) return eval(whatdo('50:CALL'));
    return FOLD;
  }
  if (hi_rank > 13 || HCONF > 50) {
    if (CALL < 1) {
     if (ROUND < 5) return eval(whatdo('5:MED,75:SMALL,20:CALL'));
     return eval(whatdo('5:MED,75:SMALL,20:CALL'));
    }
    if (CALL_LEVEL < 30) return CALL;
    if (CALL_LEVEL < 40 && ROUND < 4) return CALL;
    return FOLD;
  }
  if (CALL < 1) {
    if (ROUND < 5) return eval(whatdo('20:SMALL,80:CALL'));
    return eval(whatdo('5:MED,70:SMALL,25:CALL'));
  }
  if (CALL_LEVEL < 20) return CALL;
  if (CALL_LEVEL < 30) return eval(whatdo('10:SMALL,20:CALL'));

  return FOLD;
}

function exists_flush_potential() {
  return get_xml('num_needed', test_flush(new player()));
}
function exists_straight_potential() {
  return get_xml('num_needed', test_straight(new player()));
} // BUT inside draws!!!!!

function setup() {
  P = STATE.players[STATE.to_play];
  CALL = STATE.current.bet-P.subtotal_bet;
  RANKA = get_rank(P.cards[0]);
  RANKB = get_rank(P.cards[1]);
  HCONF = get_hole_ranking();
  CALL_LEVEL = get_bet_level(CALL);
  BET_LEVEL = get_bet_level(STATE.current.bet); //feed function data we calc here so we don't gotta doubl do it!..
  POT_LEVEL = get_pot_level();
  BANKROLL = P.bankroll;
  NUM_IN_HAND = 0;
  NUM_IN_GAME = 0;
  FOLD = 0;
  var total_bankrolls = get_pot_size();
  for (var i = 0; i < STATE.players.length; i++) {
    total_bankrolls += STATE.players[i].bankroll;
    if (STATE.players[i].status != 'BUST') {
      NUM_IN_GAME++;
      if (STATE.players[i].status != 'FOLD') NUM_IN_HAND++;
    }
  }
  ID_CONF = 'MID';
  var avg_bankroll = total_bankrolls / NUM_IN_GAME;
  if (BANKROLL < avg_bankroll / 2) ID_CONF = 'LO';
  if (BANKROLL > avg_bankroll * 1.5) ID_CONF = 'HI';
  SMALL = CALL + STATE.blinds.big * 2; // consider MINIMUM RAISE here & below!!!!!
  if (POT_LEVEL  >40) SMALL += 5;
  if (NUM_IN_GAME > 3) {
    MED = CALL + STATE.blinds.big*4;
    BIG = CALL + STATE.blinds.big*10;
  }
  else {
    SMALL += 5;
    MED = round5(CALL + .1 * BANKROLL); // consider minimum raise!!!!!
    BIG = round5(CALL + .2 * BANKROLL); // consider minimum raise!
  }
  ALLIN = BANKROLL;
}

function whatdo (q, r) {
  q += ',';
  if (!r) r = Math.random();
  var p = 0;
  while (1) {
    var a = q.indexOf(':');
    var b = q.indexOf(',', a);
    if (a < 0 || b < 0) return 'FOLD';
    var probability = (q.substring(0, a) - 0) / 100;
    var action = q.substring(a+1, b);
    q = q.substring(b+1);
    p += probability;
    if (r <= p) return action;
  }
}
function round5 (n) {
  if (n < 5) return 5;
  var s = '' + n;
  var i = s.indexOf('.');
  if (i > 0) s = s.substring(0, i);
  n = s - 0;
  while (n%5 != 0) n++;
  return n;
}
function get_bet_level (b) {
  var size = b/P.bankroll;
  if (size <= .015 || b <= 5) return 5;
  if (size <= .02 || b <= 10) return 10;
  if (size <= .03 || b <= 15) return 20;
  if (size <= .06 || b <= 30) return 30;
  if (size <= .12 || b <= 60) return 40;
  if (size <= .21 || b <= 100) return 50;
  if (size <= .35 || b <= 150) return 70;
  if (size <= .41 || b <= 200) return 80;
  return 100;
}
function get_pot_level() {
  var p = get_pot_size();
  var b = STATE.players[STATE.to_play].bankroll;
  if (p > .5*b) return 100;
  else if (p > .25*b) return 51;
  else return 1;
}

/* HANDS */

var tests = [
  'straight_flush',
  'four_of_a_kind',
  'full_house',
  'flush',
  'straight',
  'three_of_a_kind',
  'two_pair',
  'one_pair',
  'hi_card'
];

function get_winners (my_players) {
  var winners;
  for (var i = 0; i < tests.length; i++) {
    winners = winners_helper(my_players,tests[i]);
    if (winners) {
      //var s="";for(var j=0;j<winners.length;j++){if(winners[j]>0)s+=my_players[j].name+",\n";}alert(tests[i]+"!!!\n\n"+s);
      break;
    }
  }
  return winners;
}

function get_last_winning_hand_name() { return STATE.last_win.hand; }
function winners_helper (my_players, test) {
  var best = '';
  var winners = new Array(my_players.length);

  for (var i = 0; i < my_players.length; i++) {
    if (!my_players[i]) continue;
    var a = eval('test_' + test + '(my_players[i])');
    var num_needed = get_xml('num_needed', a);
    if (num_needed > 0 || (num_needed == 0 && num_needed != '0')) continue;
    STATE.last_win.hand = get_xml('hand_name', a);
    var comp = eval('compare_' + test + '(a, best)');

    //alert("TESTING "+my_players[i].name+"'s "+test+"\na: "+a+"\nb: "+best+"\n\nwinner: "+comp);

    if (comp == 'a') {
      best = a;
      winners = new Array(my_players.length);
      winners[i] = 1;
    }
    else if (comp == 'b') { }
    else if (comp == 'c') {
      winners[i] = 1;
    }
  }

  for (var i = 0; i < winners.length; i++) {
    if (winners[i]) return winners;
  }

  return null;
}

function test_straight_flush (player) {
  var my_cards = group_cards(player);
  var the_suit = get_predominant_suit(my_cards);
  var working_cards = new Array(8);
  var working_index = 0;

  for(var i = 0; i < 7; i++) {
    if (get_suit(my_cards[i]) == the_suit) {
      var my_rank = get_rank(my_cards[i]);
      working_cards[working_index++] = my_rank;
      if (my_rank == 14) working_cards[7] = 1; //ace==1 too
    }
  }

  for (var i = 0; i < working_cards.length; i++) {
    if (working_cards[i] == null) {
      working_cards[i] =- 1; //FF
    }
  }

  working_cards.sort(compNum);
  var absolute_longest_stretch = 0;
  var absolute_hi_card = 0;
  var current_longest_stretch = 1;
  var current_hi_card = 0;

  for (var i = 0; i < 8; i++) {
    var a = working_cards[i];
    var b = working_cards[i+1];
    if (a && b && a - b == 1) {
      current_longest_stretch++;
      if (current_hi_card < 1) current_hi_card = a;
    }
    else if (a) {
      if (current_longest_stretch > absolute_longest_stretch) {
        absolute_longest_stretch = current_longest_stretch;
        if (current_hi_card < 1) current_hi_card = a;
        absolute_hi_card = current_hi_card;
      }
      current_longest_stretch=1;
      current_hi_card=0;
    }
  }

  var num_mine = 0;
  for (var i = 0; i < absolute_longest_stretch; i++) {
    if (the_suit + (absolute_hi_card - i) == player.cards[0] || the_suit + (absolute_hi_card - i) == player.cards[1]) {
      num_mine++;
    }
  }

  return (make_xml('straight_hi', absolute_hi_card) + make_xml('num_needed', 5-absolute_longest_stretch) + make_xml('num_mine', num_mine) + make_xml('hand_name', 'Straight Flush'));
}

function compare_straight_flush (a, b) { return compare_straight(a, b); }

function test_four_of_a_kind (player) {
  var my_cards = group_cards(player);
  var ranks = new Array(13);

  for (var i = 0; i < 13; i++) ranks[i] = 0;
  for (var i = 0; i < my_cards.length; i++) ranks[get_rank(my_cards[i])-2]++;

  var four = '', kicker = '';
  for (var i = 0; i < 13; i++) {
    if (ranks[i] == 4) four = i + 2;
    else if (ranks[i] > 0) kicker = i + 2;
  }

  var num_mine = 0;
  if (get_rank(player.cards[0]) == four) num_mine++;
  if (get_rank(player.cards[1]) == four) num_mine++;

  var num_needed = 4;
  if (four) num_needed = 0;

  return make_xml('rank', four) + make_xml('kicker', kicker) + make_xml('num_needed', num_needed) + make_xml('num_mine', num_mine) + make_xml('hand_name', 'Four of a Kind');
}

function compare_four_of_a_kind (a, b) {
  var rank_a = get_xml('rank', a);
  var rank_b = get_xml('rank', b);

  if (rank_a > rank_b) return 'a';
  else if (rank_b > rank_a) return 'b';
  else {
    var kicker_a = get_xml('kicker', a);
    var kicker_b = get_xml('kicker', b);
    if (kicker_a > kicker_b) return 'a';
    else if (kicker_b > kicker_a) return 'b';
    else return 'c';
  }
}

function test_full_house (player) {
  var my_cards = group_cards(player);
  var ranks = new Array(13);

  for (var i = 0; i < 13; i++) ranks[i] = 0;
  for (var i = 0; i < my_cards.length; i++) ranks[get_rank(my_cards[i])-2]++;

  var three = '';
  var two = '';
  for (var i = 0; i < 13; i++) {
    if (ranks[i] == 3) {
      if (three > two) two = three;
      three = i + 2;
    }
    else if (ranks[i] == 2) two = i + 2;
  }

  var result = '';
  var num_needed = 5;
  var major_rank = '';
  var num_mine_major = 0;

  if (three) {
    num_needed -= 3;
    major_rank = three;
    if (get_rank(player.cards[0]) == three) num_mine_major += 1;
    if (get_rank(player.cards[1]) == three) num_mine_major += 1;
  }

  result += make_xml('major_rank', major_rank);
  result += make_xml('num_mine_major', num_mine_major);

  var minor_rank = '';
  var num_mine_minor = 0;
  if (two) {
    num_needed -= 2;
    minor_rank = two;
    if (get_rank(player.cards[0]) == two) num_mine_minor += 1;
    if (get_rank(player.cards[1]) == two) num_mine_minor += 1;
  }

  result += make_xml('minor_rank', minor_rank) + make_xml('num_mine_minor', num_mine_minor) + make_xml('num_mine', num_mine_minor + num_mine_major) + make_xml('num_needed', num_needed) + make_xml('hand_name', 'Full House');
  return result;
}

function compare_full_house (a, b) {
  var major_a = get_xml('major_rank', a);
  var major_b = get_xml('major_rank', b);

  if (major_a > major_b) return 'a';
  else if (major_b > major_a) return 'b';
  else {
    var minor_a = get_xml('minor_rank', a);
    var minor_b = get_xml('minor_rank', b);
    if (minor_a > minor_b) return 'a';
    else if (minor_b > minor_a) return 'b';
    else return 'c';
  }
}

function test_flush (player) {
  var my_cards = group_cards(player);
  var the_suit = get_predominant_suit(my_cards);
  var working_cards = new Array(7);
  var working_index = 0;
  var num_in_flush = 0;

  for (var i = 0; i < my_cards.length; i++) {
    if (get_suit(my_cards[i]) == the_suit) {
      num_in_flush++;
      working_cards[working_index++]=get_rank(my_cards[i]);
    }
  }

  for (var i = 0; i < working_cards.length; i++) {
    if (working_cards[i] == null) working_cards[i] =- 1; //FF
  }
  working_cards.sort(compNum);

  var result = '';
  var num_mine = 0;
  for (var i = 0; i < 5; i++) {
    var s = working_cards[i];
    if (!s) s = '';
    result += make_xml('flush_' + i, s);
    if (the_suit + working_cards[i] == player.cards[0] || the_suit + working_cards[i] == player.cards[1]) {
      num_mine++;
    }
  }

  result += make_xml('num_needed', 5-num_in_flush) + make_xml('num_mine', num_mine) + make_xml('suit', the_suit) + make_xml('hand_name', 'Flush');
  return result;
}

function compare_flush (a, b) {
  for (var i = 0; i < 5; i++) {
    var flush_a = get_xml('flush_' + i, a);
    var flush_b = get_xml('flush_' + i, b);
    if (flush_a > flush_b) return 'a';
    else if (flush_b > flush_a) return 'b';
  }
  return 'c';
}

function test_straight (player) {
  var my_cards = group_cards(player);
  var working_cards = new Array(8);
  var ranks = new Array(13);

  for (var i = 0; i < 7; i++) {
    var my_rank = get_rank(my_cards[i]);
    if (ranks[my_rank-2]) continue;
    else ranks[my_rank-2] = 1;
    working_cards[i] = my_rank;
    if (my_rank == 14) working_cards[7] = 1; //ace==1 too
  }

  for (var i = 0; i < working_cards.length; i++) {
    if (working_cards[i] == null) working_cards[i] =- 1; //FF
  }
  working_cards.sort(compNum);

  var absolute_longest_stretch = 0;
  var absolute_hi_card = 0;
  var current_longest_stretch = 1;
  var current_hi_card = 0;
  for (var i = 0; i < 8; i++) {
    var a = working_cards[i];
    var b = working_cards[i+1];
    if (a && b && a - b == 1) {
      current_longest_stretch++;
      if (current_hi_card < 1) current_hi_card = a;
    }
    else if (a) {
      if (current_longest_stretch > absolute_longest_stretch) {
        absolute_longest_stretch = current_longest_stretch;
        if (current_hi_card < 1) current_hi_card = a;
        absolute_hi_card = current_hi_card;
      }
      current_longest_stretch = 1;
      current_hi_card = 0;
    }
  }

  var num_mine = 0;
  for (var i = 0; i < absolute_longest_stretch; i++) {
    if (absolute_hi_card - i == get_rank(player.cards[0]) || absolute_hi_card - i == get_rank(player.cards[1])) {
      num_mine++;
    }
  }
  return make_xml('straight_hi', absolute_hi_card) + make_xml('num_needed', 5-absolute_longest_stretch) + make_xml('num_mine', num_mine) + make_xml('hand_name', 'Straight');
}

function compare_straight(a,b){
  var hi_a = get_xml('straight_hi', a);
  var hi_b = get_xml('straight_hi', b);
  if (hi_a > hi_b) return 'a';
  else if (hi_b > hi_a) return 'b';
  else return 'c';
}

function test_three_of_a_kind (player) {
  var my_cards = group_cards(player);
  var ranks = new Array(13);

  for (var i = 0; i < 13; i++) ranks[i] = 0;
  for (var i = 0; i < my_cards.length; i++) ranks[get_rank(my_cards[i])-2]++;

  var three = '', kicker_1 = '', kicker_2 = '';
  for (var i = 0; i < 13; i++) {
    if (ranks[i] == 3) three = i + 2;
    else if (ranks[i] == 1) {
      kicker_2 = kicker_1;
      kicker_1 = i + 2;
    }
    else if (ranks[i] > 1) {
      kicker_1 = i + 2;
      kicker_2 = i + 2;
    }
  }

  var num_mine = 0;
  if (get_rank(player.cards[0]) == three) num_mine++;
  if (get_rank(player.cards[1]) == three) num_mine++;
  var num_needed = 3;
  if (three) num_needed = 0;

  return make_xml('rank', three) + make_xml('num_needed', num_needed) + make_xml('num_mine', num_mine) + make_xml('kicker_1', kicker_1) + make_xml('kicker_2', kicker_2) + make_xml('hand_name', 'Three of a Kind');
}

function compare_three_of_a_kind (a ,b) {
  var rank_a = get_xml('rank', a);
  var rank_b = get_xml('rank', b);

  if (rank_a > rank_b) return 'a';
  else if (rank_b > rank_a) return 'b';
  else {
    var kicker_a = get_xml('kicker_1', a);
    var kicker_b = get_xml('kicker_1', b);
    if (kicker_a > kicker_b) return 'a';
    else if (kicker_b > kicker_a) return 'b';
    else {
      kicker_a = get_xml('kicker_2',a);
      kicker_b = get_xml('kicker_2',b);
      if (kicker_a > kicker_b) return 'a';
      else if (kicker_b > kicker_a) return 'b';
      else return 'c';
    }
  }
}

function test_two_pair (player) {
  var my_cards = group_cards(player);
  var ranks = new Array(13);

  for (var i = 0; i < 13; i++) ranks[i] = 0;
  for (var i = 0; i < my_cards.length; i++) ranks[get_rank(my_cards[i])-2]++;

  var first = '', second = '', kicker = '';
  for (var i = 12; i >- 1; i--) {
    if (ranks[i] == 2) {
      if (!first) first = i + 2;
      else if (!second) second = i + 2;
      else if (!kicker) kicker = i + 2;
      else break;
    }
    else if (!kicker && ranks[i] > 0) kicker = i + 2;
  }

  var num_mine = 0;
  if (get_rank(player.cards[0]) == first || get_rank(player.cards[0]) == second) num_mine++;
  if (get_rank(player.cards[1]) == first || get_rank(player.cards[1]) == second) num_mine++;

  var num_needed = 2;
  if (second) num_needed = 0;
  else if (first) num_needed = 1;
  else num_needed = 2;

  return make_xml('rank_1', first) + make_xml('rank_2', second) + make_xml('num_needed', num_needed) + make_xml('num_mine', num_mine) + make_xml('kicker', kicker) + make_xml('hand_name', 'Two Pairs');
}

function compare_two_pair (a, b) {
  var rank_a = get_xml('rank_1', a);
  var rank_b = get_xml('rank_1', b);

  if (rank_a > rank_b) return 'a';
  else if (rank_b > rank_a) return 'b';
  else {
    rank_a = get_xml('rank_2', a);
    rank_b = get_xml('rank_2', b);
    if (rank_a > rank_b) return 'a';
    else if (rank_b > rank_a) return 'b';
    else {
      var kicker_a = get_xml('kicker', a);
      var kicker_b = get_xml('kicker', b);
      if (kicker_a > kicker_b) return 'a';
      else if (kicker_b > kicker_a) return 'b';
      else return 'c';
    }
  }
}

function test_one_pair (player) {
  var my_cards = group_cards(player);
  var ranks = new Array(13);

  for (var i = 0; i < 13; i++) ranks[i] = 0;
  for (var i = 0; i < my_cards.length; i++) ranks[get_rank(my_cards[i])-2]++;

  var pair = '', kicker_1 = '', kicker_2 = '', kicker_3 = '';
  for (var i = 0; i < 13; i++) {
    if (ranks[i] == 2) pair = i + 2;
    else if (ranks[i] == 1) { kicker_3 = kicker_2; kicker_2 = kicker_1; kicker_1 = i + 2; }
    else if (ranks[i] > 2) { kicker_1 = i + 2; kicker_2 = i + 2; kicker_3 = i + 2; }
  }

  var num_mine = 0;
  if (get_rank(player.cards[0]) == pair) num_mine++;
  if (get_rank(player.cards[1]) == pair) num_mine++;

  var num_needed = 1;
  if (pair) num_needed = 0;

  return make_xml('rank', pair) + make_xml('num_needed', num_needed) + make_xml('num_mine', num_mine) + make_xml('kicker_1', kicker_1) + make_xml('kicker_2', kicker_2) + make_xml('kicker_3', kicker_3) + make_xml('hand_name', 'One Pair');
}

function compare_one_pair (a, b) {
  var rank_a = get_xml('rank', a);
  var rank_b = get_xml('rank', b);

  if (rank_a > rank_b) return 'a';
  else if (rank_b > rank_a) return 'b';
  else {
    var kicker_a = get_xml('kicker_1', a);
    var kicker_b = get_xml('kicker_1', b);
    if (kicker_a > kicker_b) return 'a';
    else if (kicker_b > kicker_a) return 'b';
    else {
      kicker_a = get_xml('kicker_2', a);
      kicker_b = get_xml('kicker_2', b);
      if (kicker_a > kicker_b) return 'a';
      else if (kicker_b > kicker_a) return 'b';
      else {
        kicker_a = get_xml('kicker_3', a);
        kicker_b = get_xml('kicker_3', b);
        if (kicker_a > kicker_b) return 'a';
        else if (kicker_b > kicker_a) return 'b';
        else return 'c';
      }
    }
  }
}

function test_hi_card (player) {
  var my_cards = group_cards(player);
  var working_cards = new Array(my_cards.length);

  for (var i = 0; i < working_cards.length; i++) {
    working_cards[i] = get_rank(my_cards[i]);
  }
  for (var i = 0; i < working_cards.length; i++) {
    if (working_cards[i] == null) working_cards[i] =- 1; //FF
  }
  working_cards.sort(compNum);

  var result = '';
  for (var i = 0; i < 5; i++) {
    if (!working_cards[i]) working_cards[i] = '';
    result += make_xml('hi_card_' + i, working_cards[i]);
  }
  return result + make_xml('num_needed', 0) + make_xml('hand_name', 'High Card');
}

function compare_hi_card (a, b) {
  for (var i = 0; i < 5; i++) {
    var hi_a = get_xml('hi_card_' + i, a);
    var hi_b = get_xml('hi_card_' + i, b);
    if (hi_a > hi_b) return 'a';
    else if (hi_b > hi_a) return 'b';
  }
  return 'c';
}

function make_xml (tag, dat) {
  return '<' + tag + '>' + dat + '</' + tag + '>';
}
function get_xml (tag, dat) {
  var a = dat.indexOf('<' + tag + '>');
  if (a < 0) return '';
  var b = dat.indexOf('</' + tag + '>');
  if (b <= a) return '';
  var ret = dat.substring(a + tag.length + 2, b);
  var r = ret.match(/^(\d+)$/);
  if (r) return (ret - 0);
  else return ret;
}

function get_suit (card) {
  if (card) return card.substring(0, 1);
  else return '';
}
function get_rank (card) {
  if (card) return card.substring(1) - 0;
  else return '';
}
function get_predominant_suit (my_cards) {
  var suit_count = [0, 0, 0, 0];
  for (var i = 0; i < my_cards.length; i++) {
    var s = get_suit(my_cards[i]);
    if (s == 'c') suit_count[0]++;
    else if (s == 's') suit_count[1]++;
    else if (s == 'h') suit_count[2]++;
    else if (s == 'd') suit_count[3]++;
  }
  var suit_index = 0;
  if (suit_count[1] > suit_count[suit_index]) suit_index = 1;
  if (suit_count[2] > suit_count[suit_index]) suit_index = 2;
  if (suit_count[3] > suit_count[suit_index]) suit_index = 3;
  if (suit_index == 0) return 'c';
  else if(suit_index == 1) return 's';
  else if(suit_index == 2) return 'h';
  else if(suit_index == 3) return 'd';
  return '';
}

function group_cards (player) {
  var c = new Array(7);
  for (var i = 0; i < 5; i++) c[i] = STATE.board[i];
  c[5] = player.cards[0];
  c[6] = player.cards[1];
  return c;
}

function compNum (a, b) { return b - a; }
