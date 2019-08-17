/* eslint-disable brace-style, camelcase, semi */

module.exports = Checkers_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Checkers_MatchSettings (set, params) {
  this._super.call(this, 'checkers', set, params);
}

Checkers_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Checkers_MatchSettings.prototype.constructor = Checkers_MatchSettings;
Checkers_MatchSettings.prototype._super = MatchSettings;
