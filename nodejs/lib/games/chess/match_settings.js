/* eslint-disable brace-style, camelcase, semi */

module.exports = Chess_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Chess_MatchSettings (set, params) {
  this._super.call(this, 'chess', set, params);

  this.rules = 0; // (set.rules === 1 ? 1 : 0);
}

Chess_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Chess_MatchSettings.prototype.constructor = Chess_MatchSettings;
Chess_MatchSettings.prototype._super = MatchSettings;
