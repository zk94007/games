/* eslint-disable brace-style, camelcase, semi */

module.exports = Blackjack_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Blackjack_MatchSettings (set, params) {
  this._super.call(this, 'blackjack', set, params);

  this.chips = 500;
  if (typeof set.chips === 'number') {
    this.chips = parseInt(Math.max(500, Math.min(1000, set.chips)), 10);
  }

  this.rounds = 25;
  if (typeof set.rounds === 'number') {
    this.rounds = parseInt(Math.max(0, Math.min(50, set.rounds)), 10);
  }

  this.hit_16 = set.hit_16 !== false;
  this.stand_17 = set.stand_17 !== false;
}

Blackjack_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Blackjack_MatchSettings.prototype.constructor = Blackjack_MatchSettings;
Blackjack_MatchSettings.prototype._super = MatchSettings;
