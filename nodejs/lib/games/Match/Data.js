var Match = require(`${__dirname}/../Match.js`);

  Match.prototype.to_save = function () {
    this.saved = {
      status: this.status
    };
  }
  
  Match.prototype.json_build = function(users_to_json) {
    let json = {};
    this.to_save();
  
    for (let prop in this) {
      if (
        ['date', 'engine', 'timer', '_events', '_eventsCount', '_maxListeners', 'users'].indexOf(prop) === -1 &&
        this.hasOwnProperty(prop)
      ) {
        json[prop] = this[prop];
      }
    }
  
    json['date'] = this.date.toJSON();
    json['users'] = users_to_json;
    return json;
  }
  
  Match.prototype.json_new_sub_handle_hands = function(user_name, json) {
    let hands = this.hands;
    if (hands) {
      let i = this.players().findIndex(function (user) {
        return user.name === user_name;
      });
      json.state.hand = i >= 0 ? hands[i] : undefined;
    }
  
    return json;
  }
  
  Match.prototype.json_new = function(users_to_json, to_save, user_name) {
    let json = {
      id: this.id,
      sid: this.sid,
      decision: this.decision ? this.decision.text : '',
      players: users_to_json,
      settings: this.settings,
      status: to_save ? 'SAVED' : this.status,
      prev_status: this.prev_status
    };
  
    if (user_name !== false) {
      json.moves = this.moves;
      json.illmoves = this.illmoves;
      json.rematch = this.rematch;
      json.state = this.state;
      json.timers = this.timers;
      json.timersi = this.timersi;
      json.timersb = this.timersb;
      json.timersbp = this.timersbp;
  
      json = this.json_new_sub_handle_hands(user_name, json);
    }
  
    return json;
  }
  
  Match.prototype.to_json = function (user_name, to_save = false) {
    let json = {};
    to_save = (!user_name && to_save);
  
    let users_to_json = this.users.map(function (item) {
      if (item.length <= 0) { return item; }
  
      return item.map(on_item_map);
    });
  
    if (to_save) {
      json = this.json_build(users_to_json);
    }
    else {
      json = this.json_new(users_to_json, to_save, user_name);
    }
  
    return json;
  };
  
  function on_item_map(player_object) {
    if (!player_object) { return player_object; }
    return player_object.to_json();
  }
  