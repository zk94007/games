/* eslint-disable brace-style, camelcase, semi */

var SPADE = 0; exports.SPADE = SPADE;
var DIAMOND = 1; exports.DIAMOND = DIAMOND;
var CLUB = 2; exports.CLUB = CLUB;
var HEART = 3; exports.HEART = HEART;

var SUITS = [SPADE, DIAMOND, CLUB, HEART];
var SUITS_ASCII = ['&spades;', '&diams;', '&clubs;', '&hearts;'];
var SUITS_SHORT = ['S', 'D', 'C', 'H'];

var JOKER = 0; exports.JOKER = JOKER;
var ACE = 1; exports.ACE = ACE;
var TWO = 2; exports.TWO = TWO;
var THREE = 3; exports.THREE = THREE;
var FOUR = 4; exports.FOUR = FOUR;
var FIVE = 5; exports.FIVE = FIVE;
var SIX = 6; exports.SIX = SIX;
var SEVEN = 7; exports.SEVEN = SEVEN;
var EIGHT = 8; exports.EIGHT = EIGHT;
var NINE = 9; exports.NINE = NINE;
var TEN = 10; exports.TEN = TEN;
var JACK = 11; exports.JACK = JACK;
var QUEEN = 12; exports.QUEEN = QUEEN;
var KING = 13; exports.KING = KING;

var VALUES = [
  JOKER, ACE, TWO, THREE, FOUR, FIVE, SIX, SEVEN,
  EIGHT, NINE, TEN, JACK, QUEEN, KING];
var VALUES_TEXT = [
  'JK', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

exports.get_new_deck = function get_new_deck (jokers, shuffle) {
  var deck = [];

  for (var s = 0; s < SUITS.length; s++) {
    for (var v = 1; v < VALUES.length; v++) {
      deck.push({ s: SUITS[s], v: VALUES[v] });
    }
  }

  for (var x = 0; x < jokers; x++) {
    deck.push({ s: x, v: 0 });
  }

  if (shuffle === true) { deck = shuffle_deck(deck); }
  return deck;
};

exports.copy_card = function copy_card (card) {
  return { s: card.s, v: card.v };
};

exports.copy_deck = function copy_deck (deck) {
  var tdeck = new Array(deck.length);
  for (var i = 0; i < deck.length; i++) {
    tdeck[i] = deck[i];
  }
  return tdeck;
};

exports.turn_down = function turn_down (deck, i) {
  if (i !== false) { deck[i] = { s: -1, v: -1 }; }
  else {
    for (i = 0; i < deck.length; i++) {
      deck[i] = { s: -1, v: -1 };
    }
  }
  return deck;
};

exports.get_card_text = function get_card_text (deck, i) {
  if (deck[i].v === -1) { return false; }
  if (deck[i].v === 0) { return (VALUES_TEXT[deck[i].v]); }
  else { return (VALUES_TEXT[deck[i].v] + '-' + SUITS_SHORT[deck[i].s]); }
};

function shuffle_deck (o) {
  for (var j, x, i = o.length; i; j = parseInt(Math.random() * i, 10), x = o[--i], o[i] = o[j], o[j] = x);
  return o;
}
exports.shuffle_deck = shuffle_deck;

exports.render_card = function render_card (card, ss) {
  if (card.v === 0) { return (VALUES_TEXT[card.v]); }
  return ((ss ? SUITS_SHORT : SUITS_ASCII)[card.s] + VALUES_TEXT[card.v]);
};

exports.render_number = function render_number (v) {
  return VALUES_TEXT[v];
};

exports.render_suite = function render_suite (s) {
  return SUITS_ASCII[s] || '';
};
