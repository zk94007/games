/* eslint-disable brace-style, camelcase, semi */

module.exports = Spades_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Spades_MatchSettings (set, params) {
  this._super.call(this, 'spades', set, params);

  this.break_spades = (set.break_spades !== false);
  this.rounds = ((set.rounds === 20) ? 20 : 10);
}

Spades_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Spades_MatchSettings.prototype.constructor = Spades_MatchSettings;
Spades_MatchSettings.prototype._super = MatchSettings;
