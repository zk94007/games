/* eslint-disable brace-style, camelcase, semi */

module.exports = Warships_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Warships_MatchSettings (set, params) {
  this._super.call(this, 'warships', set, params);

  this.bsize = (set.bsize === 15 ? 15 : 18);
}

Warships_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Warships_MatchSettings.prototype.constructor = Warships_MatchSettings;
Warships_MatchSettings.prototype._super = MatchSettings;
