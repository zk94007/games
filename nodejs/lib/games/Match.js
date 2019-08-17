/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = Match;

if (!global.R5) {
  require(`${__dirname}/../../config.js`);
}

require(`${__dirname}/common.js`);

var PAUSE_TIME = 5;

// Constructor

function Match_sub_on_match_on_saved(match) {
  if (match.saved) {
    this.date = new Date(match.date);
    this.settings = new R5.games[this.game].match_settings(match.settings, {
      privileged: true,
      reloaded: true
    });
    this.status = match.saved.status;
    if (match.saved.engine) { this.engine = match.saved.engine; }
  }
}

function Match_sub_on_match(match) {
  for (let prop in match) {
    if (
      ['date', 'saved', 'settings'].indexOf(prop) === -1 &&
      match.hasOwnProperty(prop)
    ) {
      this[prop] = match[prop];
    }
  }

  Match_sub_on_match_on_saved(match);

  this.saved = null;
  return false;
}
function Match (game, set, match = false) {
  R5.event_emitter.call(this);

  if (!match) { this.id = R5.short_id.generate(); }

  this.game = game;
  this.date = new Date();
  this.moves = [];
  this.state = {};
  this.users = [[], [], [], [], [], []];

  if (match) {
    return Match_sub_on_match(match);
  }

  this.settings = set;
  this.waiters(this.settings.waiters);
  this.settings.waiters = null;

  this.status = R5.game.statuses.WAIT;

  return true;
}

Match.prototype.__proto__ = R5.event_emitter.prototype;
