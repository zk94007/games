/* eslint-disable brace-style, camelcase, semi */

module.exports = HoldemPoker_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function HoldemPoker_MatchSettings (set, params) {
  this._super.call(this, 'holdem-poker', set, params);

  this.chips = 500;
  if (typeof set.chips === 'number') {
    this.chips = parseInt(Math.max(500, Math.min(1000, set.chips)), 10);
  }

  this.rounds = 50;
  if (typeof set.rounds === 'number') {
    this.rounds = parseInt(Math.max(0, Math.min(100, set.rounds)), 10);
  }
}

HoldemPoker_MatchSettings.prototype = Object.create(MatchSettings.prototype);
HoldemPoker_MatchSettings.prototype.constructor = HoldemPoker_MatchSettings;
HoldemPoker_MatchSettings.prototype._super = MatchSettings;
