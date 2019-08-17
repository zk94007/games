/* eslint-disable brace-style, camelcase, semi */

module.exports = Go_Match;

var Match = require('../Match.js');
var Engine = require('./engine.js');
var FS = require('fs');

// Constructor

function Go_Match (set, match = false) {
  this._super.call(this, 'go', set, match);
}
Go_Match.prototype = Object.create(Match.prototype);
Go_Match.prototype.constructor = Go_Match;
Go_Match.prototype._super = Match;

// Public Methods

Go_Match.prototype.reload = function () {
  this.engine = Engine.initialize(this.settings.bsize, this.settings.handicap, this.settings.komi);

  var to_play = 0; if (this.settings.handicap > 0) { to_play = 1; }
  for (var i = 0; i < this.moves.length; i++) {
    this.engine.playMove(this.moves[i], (to_play === 0) ? 'W' : 'B');
    this.engine.forward();
    to_play = (++to_play % 2);
  }
  this.state.board = this.engine.cursor.getGameRoot().toSgf();

  this._super.prototype.reload.apply(this, arguments);
};

Go_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }
  var players = this.players();

  if (this.settings.handicap === -1) {
    if (this.settings.player === -1) {
      if (players[0].rate.elo > players[1].rate.elo) {
        players = this.players([players[1], players[0]]);
      }
    }

    if (players[0].rate.elo > 0 && players[1].rate.elo > 0) {
      var diff = players[1].rate.elo - players[0].rate.elo;
      if (this.settings.bsize === 13) { diff = diff / 2; }
      else if (this.settings.bsize === 9) { diff = diff / 4; }
      this.settings.handicap = Math.max(0, Math.min(9, Math.round(diff / 100)));
    }
    else { this.settings.handicap = 0; }
  }

  this.settings.set_komi();
  this.settings.set_rules(this.settings, players);

  this.engine = Engine.initialize(this.settings.bsize,
                                  this.settings.handicap,
                                  this.settings.komi);
  this.state.board = this.engine.cursor.getGameRoot().toSgf();
  this.state.history = [[], []];
  this.state.passed = 0;
  this.state.score = [0, 0];
  this.state.to_play = (this.settings.handicap > 0 ? 1 : 0);
  this.state.draw = false;
  this.state.undo = false;

  this.started();
};

Go_Match.prototype.make_move = function (player, move) {
  if (!this._super.prototype.make_move.apply(this, arguments)) { return; }

  var players = this.players();
  var state = this.state;
  var turn = state.to_play;

  if (move.undo === true && state.undo !== player.name) {
    if (state.undo !== false && state.moves.length > 0) {
      if (player.name === players[turn].name) {
        undo_move(this);
      }
      undo_move(this);
      state.undo = false;
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

  var match = this;
  I_checkmove(match, move, function (check, sgfmove) {
    var state = match.state;
    var turn = state.to_play;

    if (check !== true) {
      var x = sgfmove.charAt(0).toUpperCase();
      if (x.charCodeAt(0) >= 'I'.charCodeAt(0)) {
        x = String.fromCharCode(x.charCodeAt(0) + 1);
      }
      var msg = check + ': [' + x + ', ' + (match.settings.bsize - move.y) + ']';
      match.illmoves.push({ move: sgfmove, msg: msg });
      match.emit('message', match, player, 'Invalid move (2)');
      return;
    }

    match.moves.push(sgfmove);
    match.illmoves = [];

    state.undo = false;

    match.engine.playMove(sgfmove, (state.to_play === 0) ? 'W' : 'B');
    match.engine.forward();

    state.board = match.engine.cursor.getGameRoot().toSgf();
    state.score[0] = match.engine.board.captures.W;
    state.score[1] = match.engine.board.captures.B;

    if (sgfmove === 'tt') { state.passed++;
      if (state.passed === 2) {
        calc_score(match, function (decision) {
          match.finish(turn, decision);
        });
        return;
      }
    }
    else { state.passed = 0; }

    state.to_play = match.next_turn();

    match.update_timer(turn, true);
    match.updated();
  });
};

Go_Match.prototype.review_move = function (player, move) {
  if (!this._super.prototype.review_move.apply(this, arguments)) { return; }

  if (move.control) {
    let next_control = this.state.review.control;
    this.state.review.control = this.state.review.next_control;
    this.state.review.next_control = next_control;
  }

  this.state.review.move = move.move;
  this.state.board = move.sgf;
  this.state.review.path = move.path;

  this.updated();
};

Go_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && move.undo !== true && (
        typeof move.x === 'undefined' ||
        typeof move.y === 'undefined'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Go_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var match = this;
  var state = this.state;
  var turn = state.to_play;
  var color = (state.to_play === 0) ? 'B' : 'W';

  var filename = '/tmp/go_ai_' + this.id;
  var sgf = state.board;

  FS.writeFile(filename, sgf, M_aiMove_1);

  function M_aiMove_1 (err) {
    if (err) { console.log(`${ai.name} file error 1: ${err}`); return; }

    var cmd = 'genmove ' + color + '\nquit\n';
    FS.writeFile(`${filename}-cmd`, cmd, M_aiMove_2);
  }

  function M_aiMove_2 (err) {
    if (err) { console.log(`${ai.name} file error 2: ${err}`); return; }

    var cmd2 = '';
    if (ai.name === 'fuego') {
      cmd2 = 'uct_param_search number_threads 8\n' +
        'uct_param_search lock_free 1\n' +
        'uct_max_memory 250000000\n' +
        'loadsgf ' + filename + '\n';
    }

    FS.writeFile(`${filename}-cmd2`, cmd2, M_aiMove_3);
  }

  function M_aiMove_3 (err) {
    if (err) { console.log(`${ai.name} file error 3: ${err}`); return; }

    var exec = require('child_process').exec;
    var exectext = '';
    if (ai.name === 'fuego') {
      exectext = 'fuego --quiet --config ' + filename + '-cmd2' +
        ' ' + filename + '-cmd';
    }
    else if (ai.name === 'GNUGo') {
      exectext = 'gnugo --level ' + ai.level + ' --mode gtp' +
        ' --' + match.settings.rules.toLowerCase() + '-rules' +
        ' --infile ' + filename +
        ' --gtp-input ' + filename + '-cmd';
    }

    exec(exectext, M_aiMove_4);
  }
  function M_aiMove_4 (error, stdout, stderr) {
    if (error) { console.log(`${ai.name} file error 4: ${error}`); return; }

    var move = stdout.substr(2, (stdout.indexOf('\n') - 2));
    var moves = /([A-Z])([0-9]+)/g.exec(move);

    match.state.undo = false;

    if (move.indexOf('resign') !== -1) {
      match.moves.push('resign');
      calc_score(match, function (decision) {
        if (turn === 0) {
          match.finish(turn, ((1 * 3) + 2));
        }
        else {
          match.finish(turn, ((0 * 3) + 2));
        }
      });
      return;
    }
    else if (moves === null || move.indexOf('PASS') !== -1) {
      move = 'tt'; state.passed++;
      if (state.passed === 2) {
        match.engine.playMove(move, (state.to_play === 0) ? 'W' : 'B');
        match.engine.forward();
        match.moves.push(move);
        calc_score(match, function (decision) {
          match.finish(match, decision);
        });
        return;
      }
    }
    else if (moves[0] !== '') { state.passed = 0;
      var x = moves[0].charAt(0); x = x.toLowerCase();
      var y = moves[0].substr(1);
      if (x.charCodeAt(0) >= 'i'.charCodeAt(0)) {
        x = String.fromCharCode(x.charCodeAt(0) - 1);
      }
      y = String.fromCharCode((match.settings.bsize - y) + 'a'.charCodeAt(0));

      move = x + '' + y;
    }
    else { console.log(`${ai.name} move error: ${move}`); return; }

    match.engine.playMove(move, (state.to_play === 0) ? 'W' : 'B');
    match.engine.forward();
    match.moves.push(move);

    match.illmoves = [];

    state.board = match.engine.cursor.getGameRoot().toSgf();

    state.score[0] = match.engine.board.captures.W;
    state.score[1] = match.engine.board.captures.B;

    state.to_play = match.next_turn();

    match.update_timer(turn, true);
    match.updated();
  }
};

Go_Match.prototype.finish = function (turn, decision) {
  if (this.status !== 'FINISH') {
    this._super.prototype.finish.apply(this, arguments);
    return;
  }

  var multip = 1; var diffadd = this.settings.handicap;
  if (this.settings.bsize === 13) { multip = 0.50; diffadd *= 2; }
  else if (this.settings.bsize === 9) { multip = 0.25; diffadd *= 4; }

  var p1adjust = (100 * diffadd);

  var output = ''; var go_result = ''; var places = [];
  if (decision === 0) {
    places = [1.5, 1.5];
    output = 'Draw: %p0 and %p1';
  }
  else {
    var opp;
    if (decision >= 1 && decision <= 3) {
      places = [1, 2];
      output = '%p0 Wins '; opp = ': %p1';
      go_result = 'B+';
    }
    else if (decision >= 4 && decision <= 6) {
      places = [2, 1];
      output = '%p1 Wins '; opp = ': %p0';
      go_result = 'W+';
    }
    if (decision % 3 === 1 || this.state.fscore !== undefined) {
      output += ' with score ' + plus_minus(this.state.fscore) + '' + opp + ' Loses';
      go_result += plus_minus(this.state.fscore);
    }
    else if (decision % 3 === 2) {
      output += opp + ' resigns'; go_result += 'Res.';
    }
    else if (decision % 3 === 0) {
      output += opp + ' times-out'; go_result += 'Time';
    }
  }

  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth() + 1; // January is 0!
  var yyyy = today.getFullYear();

  var fileout = '(;FF[4]GM[1]SZ[' + this.settings.bsize + ']\n' +
    'HA[' + this.settings.handicap + ']KM[' + this.settings.komi + ']\n' +
    'RU[' + this.settings.rules + ']\n' +
    'PB[%p0]PW[%p1]BR[%p0r]BW[%p1r]\n' +
    'DT[' + yyyy + '-' + mm + '-' + dd + ']' +
    'TM[' + this.settings.timers + ']' +
    'OT[' + (this.settings.timer_type === 'Byo-yomi' ? this.settings.timersbp +
      'x' + this.settings.timersb : this.settings.timersi) + ' ' +
      this.settings.timer_type + ']\n' +
    'PC[FunNode Go Server]SO[www.FunNode.com]\n' +
    'RE[' + go_result + ']\n\n';
  fileout += Engine.handicapped(this.settings.bsize, this.settings.handicap);
  for (var i = 0; i < this.moves.length; i++) {
    if (this.settings.handicap > 0) {
      if (i % 2 === 0) { fileout += ';W[' + this.moves[i] + ']'; }
      else { fileout += ';B[' + this.moves[i] + ']'; }
    }
    else {
      if (i % 2 === 0) { fileout += ';B[' + this.moves[i] + ']'; }
      else { fileout += ';W[' + this.moves[i] + ']'; }
    }
  }
  fileout += ')'; this.state.board = fileout.replace(/\n/g, '');

  this.state.history = false;
  this.finished({
    file: { generic: false, out: fileout },
    multielo: multip,
    places: places,
    ratings: [p1adjust, 0],
    text: output });
};

// Private Methods

function I_checkmove (match, move, callback) {
  var sgfmove = match.engine.pointToSgfCoord({ x: move.x, y: move.y });
  if (!sgfmove || sgfmove === '' || sgfmove === 'tt') {
    return (callback(true, 'tt'));
  }

  var state = match.state;
  var players = match.players();

  var color = (state.to_play === 0) ? 'B' : 'W';
  var filename = '/tmp/go_check_' + match.id + '_' + players[0].name + '_' + players[1].name;
  var sgf = state.board;

  var x = sgfmove.charAt(0).toUpperCase(); var y = move.y;
  if (x.charCodeAt(0) >= 'I'.charCodeAt(0)) {
    x = String.fromCharCode(x.charCodeAt(0) + 1);
  }
  y = (match.settings.bsize - y);

  var cmd = 'play ' + color + ' ' + x + '' + y + '\nquit\n';

  FS.writeFile(filename, sgf, I_checkmove_1);

  function I_checkmove_1 (err) {
    if (err) { console.log(`checkmove file error 1: ${err}`); }
    FS.writeFile(filename + '-cmd', cmd, I_checkmove_2);
  }

  function I_checkmove_2 (err) {
    if (err) { console.log(`checkmove file error 2: ${err}`); }
    var exec = require('child_process').exec;
    var exectext = 'gnugo --mode gtp' +
      ' --' + match.settings.rules.toLowerCase() + '-rules' +
      ' --infile ' + filename +
      ' --gtp-input ' + filename + '-cmd';
    exec(exectext, I_checkmove_3);
  }

  function I_checkmove_3 (error, stdout, stderr) {
    if (error) { console.log(`checkmove file error 3a: ${error}`); }

    var check = stdout.indexOf('?');
    if (check === -1) { check = true; }
    else { check = stdout.substr(check + 2, (stdout.indexOf('\n') - 2)); }

    FS.unlink(filename, function (err) {
      if (err) { console.log(`checkmove file error 3b: ${err}`); }
    });
    FS.unlink(filename + '-cmd', function (err) {
      if (err) { console.log(`checkmove file error 3c: ${err}`); }
    });

    return (callback(check, sgfmove));
  }
}

function undo_move (match) {
  match.engine.back();
  match.engine.cursor.node._children = [];

  match.moves.pop();
  match.illmoves = [];

  match.state.board = match.engine.cursor.getGameRoot().toSgf();
  match.state.score[0] = match.engine.board.captures.W;
  match.state.score[1] = match.engine.board.captures.B;

  match.state.to_play--; if (match.state.to_play < 0) {
    match.state.to_play = 1;
  }
}

function calc_score (match, callback) {
  var filename = '/tmp/go_calc_' + match.id + '.txt';
  var decision = 0;

  FS.writeFile(filename, match.state.board, function (err) {
    if (err) { return (callback(decision)); }

    var exec = require('child_process').exec;
    var exectext = 'gnugo --score --komi ' + match.settings.komi +
      ' --' + match.settings.rules.toLowerCase() + '-rules' +
      ' --infile ' + filename +
      ' --until ' + match.moves.length;
    exec(exectext, function (error, stdout, stderr) {
      if (error) { console.log(`GNUGo file error 5a ${error}`); }

      if (stdout !== '') {
        var score = stdout.split(' ');
        match.state.fscore = score[3].match('^[-+]?[0-9]*.?[0-9]+$');
        if (stdout.indexOf('Black') >= 0) { decision = ((0 * 3) + 1); }
        else if (stdout.indexOf('White') >= 0) { decision = ((1 * 3) + 1); }
        FS.unlink(filename, function (err) {
          if (err) { console.log(`GNUGo file error 5b ${err}`); }
        });
      }
      else { console.log('GNUGo score error : ' + stderr); }
      return (callback(decision));
    });
  });
}

function plus_minus (nbr) {
  if (nbr > 0) { return '+' + nbr; } else { return nbr; }
}
