/* eslint-disable brace-style, camelcase, semi */

module.exports = LiarsDice_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function LiarsDice_MatchSettings (set, params) {
  this._super.call(this, 'liars-dice', set, params);

  if (typeof set.dice !== 'number' || set.dice < 3 || set.dice > 10) {
    this.dice = 5;
  }
  else {
    this.dice = set.dice;
  }

  if (set.first_play !== 'next' && set.first_play !== 'least' && set.first_play !== 'winner') {
    this.first_play = 'loser';
  }
  else {
    this.first_play = set.first_play;
  }

  this.liar_loses = set.liar_loses === 0 ? 0 : 1;
  this.re_roll = set.re_roll !== false;
  this.spot_on = set.spot_on !== false;
  this.wild_ones = set.wild_ones !== false;
}

LiarsDice_MatchSettings.prototype = Object.create(MatchSettings.prototype);
LiarsDice_MatchSettings.prototype.constructor = LiarsDice_MatchSettings;
LiarsDice_MatchSettings.prototype._super = MatchSettings;
