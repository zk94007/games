/* eslint-disable brace-style, camelcase, semi */

module.exports = Ludo_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Ludo_MatchSettings (set, params) {
  this._super.call(this, 'ludo', set, params);
}

Ludo_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Ludo_MatchSettings.prototype.constructor = Ludo_MatchSettings;
Ludo_MatchSettings.prototype._super = MatchSettings;
