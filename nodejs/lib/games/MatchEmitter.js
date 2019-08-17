/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = MatchEmitter;

if (!global.R5) {
  require(`${__dirname}/../../config.js`);
}

// Constructor

function MatchEmitter () {
  R5.event_emitter.call(this);
}

MatchEmitter.prototype.__proto__ = R5.event_emitter.prototype;

// Public Methods

MatchEmitter.prototype.listen = function (match) {
  if (!match) { return; }
  let _this = this;

  match.on('player', function (player_json) {
    _this.emit('player', player_json);
  });

  match.on('message', message);
  match.on('started', started);
  match.on('updated', updated);
  match.on('finished', finished);
  match.on('rematch', rematch);

  function message (match, user, text) {
    _this.send_message(match.to_json(), user, text);
  }

  function started (match) {
    R5.redis.decrement(`game_${match.settings.game}_waiting`);

    // TODO: consider using ID instead of SID to avoid blocking?
    R5.match_processor.add_match(match, function (match) {
      _this.send_chat(
        `game_${match.settings.game}`,
        `/match=${match.id} ${match.names(R5.game.statuses.PLAY).join(' vs ')}`
      );

      _this.send_summary(match);
      _this.send_update(match, false, true);
    });
  }

  function updated (match, save_only = false, to_continue = true) {
    if (!match.has_started()) {
      _this.send_summary(match);
    }
    else if (save_only) {
      R5.matches.set(match, function (match) { });
    }
    else {
      _this.send_update(match, false, to_continue);
    }
  }

  function finished (match) {
    // TODO: consider using ID instead of SID to avoid blocking?
    R5.match_processor.finalize_match(match, function (match) {
      R5.match_processor.update_match(match);
      _this.send_summary(match);
      _this.send_update(match, false, true);
    });
  }

  function rematch (match) {
    R5.match_processor.create(match.game, match.players(), match.settings);
  }
};

MatchEmitter.prototype.send_update = function (_match, user_name, to_continue = true) {
  let _this = this;

  R5.matches.set(_match, function (match) {
    send_updates(match);
    if (!to_continue) { return; }

    if (match.has_started()) {
      let pause_time = match.ai_to_play();
      if (pause_time !== false) {
        if (pause_time > 0) {
          setTimeout(function () {
            R5.queue_games.send({
              category: 'match',
              type: 'move_ai',
              game: match.settings.game,
              match: { id: match.id }
            });
          }, pause_time);
        }
        else {
          // TODO: create a bots queue
          throw new Error('bots_queue_emitter not implemented');
          /* R5.bots_queue_emitter.send({
            category: 'match',
            type: 'move_ai',
            game: match.settings.game,
            match: match.to_json(match.players()[match.state.to_play])
          }); */
        }
      }
    }
    else if (match.can_start()) {
      R5.queue_games.send({
        category: 'match',
        type: 'start',
        game: match.settings.game,
        match: { id: match.id }
      });
    }

    function send_updates (match) {
      if (!match) { return; }

      if (!match.has_started()) {
        match.waiters().forEach(send_to_player);
      }
      else {
        if (match.is_in_progress()) {
          match.players().forEach(send_to_player);
        }
        match.viewers(function (viewers) {
          viewers.forEach(send_to_viewer);
        });
      }
    }

    function send_to_player (user) {
      if (user && user.name && !user.is_ai() && (!user_name || user_name === user.name)) {
        if (user.status !== R5.game.statuses.OFFLINE) {
          _this.emit('update', match.to_json(user.name), user.to_json());
        }
      }
    }

    function send_to_viewer (uname) {
      if (uname && (!user_name || user_name === uname)) {
        _this.emit('update', match.to_json(uname), {
          game: match.settings.game,
          name: uname
        });
      }
    }
  });
};

MatchEmitter.prototype.send_chat = function (room, text) {
  this.emit('chat', room, text);
};

MatchEmitter.prototype.send_message = function (match_json, user, text) {
  this.emit('message', match_json, user, text);
};

MatchEmitter.prototype.send_summary = function (match, user) {
  this.send_summary_json(match.to_json(false), user);
};

MatchEmitter.prototype.send_summary_json = function (match_json, user) {
  this.emit('summary', match_json, user ? user.to_json : false);
};
