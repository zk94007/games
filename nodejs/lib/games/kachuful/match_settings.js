/* eslint-disable brace-style, camelcase, semi */

module.exports = Kachuful_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Kachuful_MatchSettings (set, params) {
  this._super.call(this, 'kachuful', set, params);

  if (set.cycles === 2 || set.cycles === 1.5 || set.cycles === 1) {
    this.cycles = set.cycles;
  }
  else {
    this.cycles = 0.5;
  }
  this.neutral = set.neutral !== false;
  this.decks = (set.decks === 2 ? 2 : 1);

  this.rounds = Math.floor(this.decks * 52 / this.players) * (this.cycles * 2);
}

Kachuful_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Kachuful_MatchSettings.prototype.constructor = Kachuful_MatchSettings;
Kachuful_MatchSettings.prototype._super = MatchSettings;
