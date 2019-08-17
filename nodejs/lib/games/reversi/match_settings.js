/* eslint-disable brace-style, camelcase, semi */

module.exports = Reversi_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Reversi_MatchSettings (set, params) {
  this._super.call(this, 'reversi', set, params);
}

Reversi_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Reversi_MatchSettings.prototype.constructor = Reversi_MatchSettings;
Reversi_MatchSettings.prototype._super = MatchSettings;
