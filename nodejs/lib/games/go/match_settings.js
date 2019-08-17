/* eslint-disable brace-style, camelcase, semi */

module.exports = Go_MatchSettings;

var MatchSettings = require('../MatchSettings.js');

// Constructor

function Go_MatchSettings (set, params) {
  this._super.call(this, 'go', set, params);

  if (set.bsize === 13 || set.bsize === 9) {
    this.bsize = set.bsize;
  }
  else {
    this.bsize = 19;
  }

  if (!is_integer(set.handicap) || set.handicap < -1 || set.handicap > 9) {
    if (this.type.ladder === true) { this.handicap = 0; }
    else { this.handicap = -1; }
  }
  else {
    this.handicap = set.handicap;
  }

  this.set_komi(set);
  this.set_rules(set);
}

Go_MatchSettings.prototype = Object.create(MatchSettings.prototype);
Go_MatchSettings.prototype.constructor = Go_MatchSettings;
Go_MatchSettings.prototype._super = MatchSettings;

Go_MatchSettings.prototype.set_komi = function (settings = this) {
  if (settings.komi === 6.5 && settings.handicap > 0) {
    this.komi = 0.5;
  }
  else if (settings.komi === 7.0 && settings.handicap > 0) {
    this.komi = 0;
  }
  else {
    this.komi = (settings.handicap > 0 ? 0.5 : 7.5);
  }
}

Go_MatchSettings.prototype.set_rules = function (settings = this, players) {
  if (
    settings.rules === 'Chinese' ||
    (players && (
      players[0].name.indexOf('-AI-fuego') !== -1 ||
      players[1].name.indexOf('-AI-fuego') !== -1)
    )
  ) {
    this.rules = 'Chinese';
  }
  else {
    this.rules = 'Japanese';
  }
}

function is_integer (n) {
  return parseFloat(n) === parseInt(n, 10) && !isNaN(n);
}
