/* eslint-disable brace-style, camelcase, semi */

module.exports = Hearts_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Hearts_MatchSettings (set, params) {
  this._super.call(this, 'hearts', set, params);

  this.break_hearts = set.break_hearts !== false;
  this.pass_three = set.pass_three !== false;
  this.shoot_moon = set.shoot_moon !== false;
  this.rounds = (set.rounds === 20 ? 20 : 10);
}

Hearts_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Hearts_MatchSettings.prototype.constructor = Hearts_MatchSettings;
Hearts_MatchSettings.prototype._super = MatchSettings;
