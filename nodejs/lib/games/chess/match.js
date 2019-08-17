/* eslint-disable brace-style, camelcase, semi */

module.exports = Chess_Match;

var Match = require('../Match.js');
var Engine = require('./engine.js');

// Constructor

function Chess_Match (set, match = false) {
  this._super.call(this, 'chess', set, match);
}
Chess_Match.prototype = Object.create(Match.prototype);
Chess_Match.prototype.constructor = Chess_Match;
Chess_Match.prototype._super = Match;

// Public Methods

Chess_Match.prototype.reload = function () {
  let review_json = this.state.review;

  this.state = Engine.new_game(this.settings.rules !== 1);

  for (var i = 0; i < this.moves.length; i++) {
    this.state.move(this.moves[i]);
  }

  this.state.review = review_json;
  this.state.draw = false;
  this.state.undo = false;

  this._super.prototype.reload.apply(this, arguments);
};

Chess_Match.prototype.start = function () {
  this.state = Engine.new_game(this.settings.rules !== 1);

  if (!this._super.prototype.start.apply(this, arguments)) { return false; }

  this.state.draw = false;
  this.state.undo = false;
  this.settings.start = Engine.tofen(this.state);

  this.started();
};

Chess_Match.prototype.make_move = function (player, move) {
  if (!this._super.prototype.make_move.apply(this, arguments)) { return; }

  var players = this.players();
  var state = this.state;
  var turn = state.to_play;

  if (move.draw === true && state.draw !== player.name) {
    if (state.draw !== false) {
      this.finish(turn, 0);
    }
    else {
      state.draw = player.name;
      if (this.settings.ais > 0) {
        state.draw = false;
        this.emit('message', this, player, 'AI will not accept draw offers');
      }
      else {
        this.update_timer(turn, false);
        this.updated();
      }
    }

    return;
  }

  if (move.undo === true && state.undo !== player.name) {
    if (state.undo !== false && state.moveno > 0) {
      if (player.name === players[turn].name) {
        state.jump_to_moveno(this.moves.length);
      }
      else {
        state.jump_to_moveno(this.moves.length - 1);
        this.moves.pop();
      }
      state.undo = false;
      this.moves.pop();
    }
    else {
      state.undo = player.name;
    }

    this.update_timer(turn, false);

    if (this.settings.ais > 0) {
      state.undo = false;
      this.emit('message', this, player, 'AI will not accept undos');
    }
    else {
      this.updated();
    }

    return;
  }

  if (!this.valid_move(move)) {
    this.emit('message', this, player, 'Invalid move (1)');
    return;
  }

  if (move.resign === true) {
    this.moves.push('resign');
    if (player.name === players[0].name) {
      this.finish(turn, ((1 * 3) + 2));
    }
    else { this.finish(turn, ((0 * 3) + 2)); }
    return;
  }

  var move_result = state.move(move.start, move.end, move.promotion);
  if (move_result !== false && move_result.ok) {
    this.state.draw = false; this.state.undo = false;

    this.moves.push(move_result.string);
    if (move_result.flags & Engine.FLAG_MATE) {
      if (move_result.flags & Engine.FLAG_CHECK) {
        this.finish(turn, ((turn * 3) + 1));
      }
      else { this.finish(turn, 0); }
      return;
    }
    if (move_result.flags & Engine.FLAG_DRAW) {
      this.finish(turn, 0);
      return;
    }

    this.update_timer(turn, true);
    this.updated();
  }
  else {
    this.emit('message', this, player, 'Invalid move (2)');
  }
};

Chess_Match.prototype.review_move = function (player, move) {
  if (!this._super.prototype.review_move.apply(this, arguments)) { return; }

  if (move.control) {
    let next_control = this.state.review.control;
    this.state.review.control = this.state.review.next_control;
    this.state.review.next_control = next_control;
  }

  if (move.move < 0) { move.move = 0; }
  else {
    var max = ((this.moves[this.moves.length - 1] !== 'resign') ? this.moves.length : this.moves.length - 1);
    move.move = ((move.move > max) ? max : move.move);
  }

  if (move.move < this.state.review.move) {
    this.state.jump_to_moveno(move.move);
  }
  else if (move.move > this.state.review.move) {
    for (var i = this.state.review.move; i < move.move; i++) {
      if (this.moves[i] !== undefined && this.moves[i] !== 'resign') {
        var mv = Engine.interpret(this.state, this.moves[i]);
        this.state.move(mv[0], mv[1], mv[2]);
      }
    }
  }

  this.state.review.move = move.move;
  this.updated();
};

Chess_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && move.draw !== true && move.undo !== true && (
        typeof move.start !== 'number' ||
        typeof move.end !== 'number' ||
        typeof move.promotion !== 'number'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Chess_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var match = this;
  var state = this.state;

  if (ai.name === 'p4wn') {
    var move_result = state.findmove(ai.level);
    I_aiMakeMove(move_result, ai.name);
  }
  else if (ai.name === 'Stockfish') {
    // TODO: install Stockfish
    var fen = Engine.tofen(state);
    var sfish = require('child_process').spawn('/home/ravi/AIs/Stockfish/src/stockfish');
    sfish.stdout.on('data', M_aiMove_1);
    sfish.stdin.write('position fen ' + fen + '\n');
    sfish.stdin.write('go depth ' + (ai.level * 2) + '\n');
  }

  function M_aiMove_1 (data) {
    var str = data.toString(); var lines = str.split(/(\r?\n)/g);
    for (var i = 0; i < lines.length; i++) {
      var pos;
      if ((pos = lines[i].indexOf('bestmove')) !== -1) {
        var str2 = lines[i].substring(pos + 9);
        str2 = lines[i].substr(9, str2.indexOf(' ') + 9);
        var move_result = [];
        move_result[0] = str2.substring(0, 2);
        move_result[1] = str2.substring(2, 4);
        sfish.stdin.write('quit\n');
        sfish.unref();
        I_aiMakeMove(move_result, ai.name);
      }
    }
  }

  function I_aiMakeMove (move_result, ai_name) {
    var turn = match.state.to_play;

    move_result = match.state.move(move_result[0], move_result[1]);
    if (move_result !== false && move_result.ok) {
      match.moves.push(move_result.string);
      if (move_result.flags & Engine.FLAG_MATE) {
        if (move_result.flags & Engine.FLAG_CHECK) {
          match.finish(turn, ((turn * 3) + 1));
        }
        else { match.finish(turn, 0); }
        return;
      }
      if (move_result.flags & Engine.FLAG_DRAW) {
        match.finish(turn, 0);
        return;
      }

      match.update_timer(turn, true);
      match.updated();
    }
  }
};

Chess_Match.prototype.finish = function (turn, decision) {
  if (this.status !== 'FINISH') {
    this._super.prototype.finish.apply(this, arguments);
    return;
  }

  var output = ''; var places = [];
  if (decision === 0) {
    places = [1.5, 1.5];
    output = 'Stalemate: %p0 and %p1';
  }
  else {
    var opp;
    if (decision >= 1 && decision <= 3) {
      places = [1, 2];
      output = '%p0 Wins: '; opp = '%p1';
    }
    else if (decision >= 4 && decision <= 6) {
      places = [2, 1];
      output = '%p1 Wins: '; opp = '%p0';
    }
    if (decision % 3 === 1) { output += opp + ' is in Checkmate'; }
    else if (decision % 3 === 2) { output += opp + ' resigns'; }
    else if (decision % 3 === 0) { output += opp + ' times-out'; }
  }

  var fileout = '';
  fileout += '[Rules ' + ((this.settings.rules === 1) ? 'Chess960' : 'Standard') + ']\n';
  fileout += '[Board ' + this.settings.start + ']\n';
  fileout += '[Result %out]\n\n';
  for (var i = 0; i < this.moves.length; i++) {
    if (i % 2 === 0) { fileout += ((i + 2) / 2) + '. ' + this.moves[i] + ' '; }
    else { fileout += this.moves[i] + ' '; }
  }

  this.finished({
    file: { generic: true, out: fileout },
    places: places,
    ratings: [0, 0],
    text: output });
};
