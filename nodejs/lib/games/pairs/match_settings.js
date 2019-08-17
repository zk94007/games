/* eslint-disable brace-style, camelcase, semi */

module.exports = Pairs_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Pairs_MatchSettings (set, params) {
  this._super.call(this, 'pairs', set, params);
}

Pairs_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Pairs_MatchSettings.prototype.constructor = Pairs_MatchSettings;
Pairs_MatchSettings.prototype._super = MatchSettings;
