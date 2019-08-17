var Match = require(`${__dirname}/../Match.js`);

  Match.prototype.add_user_sub_find_user = function(user) {
    return this.players().some(function (u) {
      if (u && u.name === user.name) {
        u.update_status(R5.game.statuses.PLAY);
        return true;
      }
    });
  };
  
  Match.prototype.add_user_sub_on_started = function(user, callback) {
    if (this.is_in_progress()) {
      this.update_timer();
  
      if (this.add_user_sub_find_user(user)) {
        return callback(R5.game.statuses.PLAY);
      }
      this.viewers_add(user.name, function () {
        return callback(R5.game.statuses.WATCH);
      });
      return;
    }
    this.viewers_add(user.name, function () {
      return callback(R5.game.statuses.REVIEW);
    });
  };
  
  Match.prototype.add_user_sub_on_wait_waiters = function(user, waiters) {
    let i;
    for (i = 0; i < waiters.length; i++) {
      if (!waiters[i]) {
        waiters[i] = user;
        break;
      }
    }
    return i;
  };
  
  Match.prototype.add_user_sub_on_wait = function(user) {
    let waiters = this.waiters();
    if (!waiters.some(function (u) { return u && u.name === user.name; })) {
      const index = this.add_user_sub_on_wait_waiters(user, waiters);
      if (index !== waiters.length) {
        return true;
      }
    }
    return false;
  };
  
  Match.prototype.add_user = function (user, status, callback) {
    if (this.has_started()) {
      return this.add_user_sub_on_started(user, callback);
    }
    else if (status === R5.game.statuses.WAIT) {
      if (this.add_user_sub_on_wait(user)) {
        return callback(R5.game.statuses.WAIT);
      }
    }
    else {
      console.log(`Invalid add_user status: ${status}`);
    }
  
    return callback(false);
  };
  
  Match.prototype.remove_user_sub_call_viewer = function (user, save_only) {
    let _this = this;
    this.viewers(function (viewers) {
      if (viewers.indexOf(user.name) >= 0) {
        _this.viewers_rem(user.name);
  
        if (!_this.is_in_progress()) {
          if (_this.rematch && _this.rematch.players.indexOf(user.name) >= 0) {
            _this.rematch = false;
          }
          else if (R5.games[_this.game].settings.review) {
            // TODO: update reviewers otherwise?
          }
          else {
            save_only = true;
          }
        }
      }
  
      _this.emit('updated', _this, save_only, false);
    });
  };
  
  Match.prototype.remove_user_sub_on_i_j = function(user, i, j, save_only) {
    const bContinue = !(this.users[i][j] && user.name === this.users[i][j].name);
    if (bContinue) {
      return save_only;
    }
    
    this.users[i][j].leave_match();
  
    if (i === R5.game.statuses.WAIT) {
      this.users[i][j] = null;
    }
    else if (i === R5.game.statuses.PLAY) {
      save_only = true;
    }
    else {
      console.log(`Unknown status ${i}`);
    }
    return save_only;
  }
  
  Match.prototype.remove_user_sub_on_i = function(user, i, save_only) {
    for (let j = 0; j < this.users.length; j++) {
      // TODO: why are there undefined values??
      save_only = this.remove_user_sub_on_i_j(user, i, j, save_only);
    }
    return save_only;
  }
  
  Match.prototype.remove_user = function (user) {
    let save_only = false;
  
    for (let i = 0; i < this.users.length; i++) {
      const bContinue = !this.is_in_progress() && i === R5.game.statuses.PLAY;
      if (bContinue) {
        continue;
      }
  
      save_only = this.remove_user_sub_on_i(user, i, save_only);
    }
  
    this.remove_user_sub_call_viewer(user, save_only);
  };
  
  Match.prototype.users_on_status = function(status, set) {
    const gamestatus = R5.game.statuses[status];
    if (set) { this.users[gamestatus] = set; }
    return this.users[gamestatus];
  };
  
  Match.prototype.players = function (set) {
    return this.users_on_status('PLAY', set);
  };
  
  Match.prototype.names = function (status) {
    let names = [];
    let users = this.users[status];
  
    for (let i = 0; i < users.length; i++) {
      names.push(users[i].name);
    }
  
    return names;
  };
  
  Match.prototype.player_names = function () {
    return this.names(R5.game.statuses.PLAY);
  };
  
  Match.prototype.player_jsons = function () {
    let jsons = [];
    let players = this.players();
  
    for (let i = 0; i < players.length; i++) {
      jsons.push(players[i].to_json(true));
    }
  
    return jsons;
  };
  
  Match.prototype.waiters = function (set) {
    return this.users_on_status('WAIT', set);
  };
  
  Match.prototype.viewers = function (callback) {
    R5.redis.get_set(`match_${this.id}_viewers`, function (_err, data) {
      return callback(data);
    });
  };
  
  Match.prototype.viewers_add = function (user_name, callback) {
    R5.redis.set_set(`match_${this.id}_viewers`, user_name, function (_err, _data) {
      return callback ? callback() : true;
    });
  };
  
  Match.prototype.viewers_rem = function (user_name) {
    R5.redis.delete_set(`match_${this.id}_viewers`, user_name, function (err, _data) {
      if (err) {
        console.log(`viewers_rem error: ${err}`);
      }
    });
  };
  