/* eslint-disable brace-style, camelcase, semi */

module.exports = Backgammon_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Backgammon_MatchSettings (set, params) {
  this._super.call(this, 'backgammon', set, params);
}

Backgammon_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Backgammon_MatchSettings.prototype.constructor = Backgammon_MatchSettings;
Backgammon_MatchSettings.prototype._super = MatchSettings;
