/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = MatchSettings;

if (!global.R5) {
  require(`${__dirname}/../../config.js`);
}

// Constructor

function MatchSettings (game, set, params = {}) {
  this.game = game;

  if (set.type !== undefined && set.type.ladder) {
    this.type = { privat: false, rated: true, ladder: true };
    this.timers = -1;
  }
  else {
    this.type = {
      privat: (set.type !== undefined && set.type.privat),
      rated: (set.type === undefined || set.type.rated || !set.type.privat),
      ladder: false
    };
  }

  if (params.privileged && set.password && typeof set.password === 'string') {
    this.password = params.reloaded ? set.password : R5.encrypted(set.password);
  }

  if (params.privileged && set.challenge && typeof set.challenge === 'string') {
    this.challenge = set.challenge;
  }

  if (set.players >= R5.games[this.game].settings.players.min && set.players <= R5.games[this.game].settings.players.max) {
    this.players = set.players;
  }
  else {
    this.players = R5.games[this.game].settings.players.min;
  }

  if (set.player === 0 || set.player === 1) {
    this.player = set.player;
  }
  else {
    this.player = -1;
  }

  this.ais = [];
  this.waiters = new Array(this.players).fill(null);

  if (set.ais && set.ais.length > 0 && set.ais.length <= this.players) {
    let ai;

    if (set.ais.length > 1) {
      for (let i = 0; i < set.ais.length; i++) {
        ai = get_ai(this.game, set.ais[i]);

        if (ai) {
          this.ais.push(set.ais[i]);
          this.waiters[i] = ai;
        }
      }
    }
    else if ((ai = get_ai(this.game, set.ais[0]))) {
      this.ais.push(set.ais[0]);

      if (
        this.players === 2 &&
        (this.player === 0 || (this.player === -1 && Math.random() > 0.5))
      ) {
        this.waiters[0] = ai;
      }
      else {
        this.waiters[1] = ai;
      }
    }
  }

  if (set.timers !== undefined) {
    set.timers = parseInt(set.timers, 10);
  }
  else {
    set.timers = R5.games[this.game].settings.timers.def;
  }

  if (this.type.ladder || set.timers === 0) {
    this.timers = -1;
  }
  else if (
    set.timers >= R5.games[this.game].settings.timers.min &&
    set.timers <= R5.games[this.game].settings.timers.max &&
    (set.timers >= R5.games[this.game].settings.timers.def || this.ais.length === 0) &&
    (params.privileged || set.timers !== -1)
  ) {
    this.timers = set.timers;
  }
  else {
    this.timers = R5.games[this.game].settings.timers.def;
  }

  if (this.timers === -1) {
    this.timer_type = 'Fischer';
    this.timersi = 0;
  }
  else if (set.timer_type === 'Byo-yomi') {
    this.timer_type = 'Byo-yomi';

    if (set.timersb !== undefined) {
      set.timersb = parseInt(set.timersb, 10);
    }

    if (
      set.timersb &&
      set.timersb !== -1 &&
      set.timersb >= R5.games[this.game].settings.timersb.min &&
      set.timersb <= R5.games[this.game].settings.timersb.max
    ) {
      this.timersb = set.timersb;
    }
    else {
      this.timersb = R5.games[this.game].settings.timersb.def;
    }

    if (set.timersbp !== undefined) {
      set.timersbp = parseInt(set.timersbp, 10);
    }

    if (
      set.timersbp &&
      set.timersbp >= 1 &&
      set.timersbp <= 5
    ) {
      this.timersbp = set.timersbp;
    }
    else {
      this.timersbp = R5.games[this.game].settings.timersbp.def;
    }
  }
  else {
    this.timer_type = 'Fischer';

    if (set.timersi !== undefined) {
      set.timersi = parseInt(set.timersi, 10);
    }

    if (
      set.timersi &&
      set.timersi !== -1 &&
      set.timersi >= R5.games[this.game].settings.timersi.min &&
      set.timersi <= R5.games[this.game].settings.timersi.max
    ) {
      this.timersi = set.timersi;
    }
    else {
      this.timersi = R5.games[this.game].settings.timersi.def;
    }
  }
}

// Private Methods

function get_ai (game, set_ai) {
  let ai_names = Object.keys(R5.games[game].settings.ais);
  let ai_obj = false; let ai_level = false;

  try {
    for (let i = 0; i < ai_names.length; i++) {
      if (set_ai.name === ai_names[i]) {
        ai_obj = R5.games[game].settings.ais[ai_names[i]];
        if (set_ai.level >= ai_obj.level.min && set_ai.level <= ai_obj.level.max) {
          ai_level = parseInt(set_ai.level, 10);
        }
      }
    }
  }
  catch (e) {
    R5.out.error(`get_AI: ${e}`);
    return false;
  }

  if (!ai_obj) { return null; }

  return (new R5.player({
    ai: {
      name: set_ai.name,
      level: ai_level,
      pause_time: ai_obj.pause_time
    },
    game: game,
    name: ai_obj.name + '-' + ai_level,
    rate: {
      elo: (ai_obj.rate.elo - ((ai_obj.level.max - ai_level) * ai_obj.level.step)),
      cert: ai_obj.rate.cert
    }
  }));
}
