/* eslint-disable brace-style, camelcase, semi */

module.exports = Align4_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Align4_MatchSettings (set, params) {
  this._super.call(this, 'align-4', set, params);
}

Align4_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Align4_MatchSettings.prototype.constructor = Align4_MatchSettings;
Align4_MatchSettings.prototype._super = MatchSettings;
