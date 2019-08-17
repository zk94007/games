/* eslint-disable brace-style, camelcase, semi */

var PLAYER_COLOURS = ['r', 'b', 'y', 'g'];
var SCENARIOS = [
  'passed',
  'moved a piece out of yard',
  'moved a piece from starting square',
  'captured another player\'s piece',
  'moved a piece'
];
exports.SCENARIOS = SCENARIOS;

exports.reload_game = function (state) {
  return new Game(state);
};

exports.new_game = function (players) {
  var plyrs = new Array(players.length);
  var alive = new Array(players.length);
  var scores = new Array(players.length);
  for (var i = 0; i < players.length; i++) {
    plyrs[i] = { name: players[i].name, ai: players[i].is_ai() };
    alive[i] = true;
    scores[i] = { current: 0, final: 0 };
  }
  return new Game({
    players: plyrs,
    alive: alive,
    scores: scores
  });
};

function get_alive (state) {
  var nbr = 0;
  for (var i = 0; i < state.alive.length; i++) {
    if (state.alive[i] === true) { nbr++; }
  }
  return nbr;
}

// Game

function Game (state) {
  this.players = state.players;
  this.alive = state.alive;
  this.scores = state.scores;

  if (state.mode) {
    this.to_play = state.to_play;
    this.mode = state.mode;
    this.winners = state.winners;
    this.game_state = new GameState(state.game_state);
  }
  else {
    this.to_play = 0;
    this.mode = 'multiple-winners';
    this.winners = [];
    this.game_state = new GameState();
  }

  for (var i = 0; i < this.players.length; i++) {
    var new_player = new Player(state.mode ? {
      name: this.players[i].name,
      id: i,
      colour: PLAYER_COLOURS[i],
      ai: this.players[i].ai
    } : this.players[i]);
    for (var j = 0; j < 4; j++) {
      var position = (state.mode ? state.players[i].pieces[j].position : 0);
      var control = new Piece(i, j, position);
      this.game_state.add_piece(control);
      new_player.add_piece(control);
    }
    this.players[i] = new_player;
  }

  if (!state.mode) { this.set_turn(0, false); }
}
Game.prototype.play = function (move) {
  if (this.players[this.to_play].ai === true) {
    this.players[this.to_play].aiPlay(this.game_state);
  }
  else {
    if (move !== 'pass') {
      this.game_state.move_piece(move.player, move.id, move.position);
      this.game_state.pubSub.last_move = {
        piece: { id: move.id, position: move.position },
        player: this.to_play,
        roll: this.game_state.last_roll.roll,
        scenery: 4
      };
    }
    else {
      this.game_state.pubSub.last_move = {
        piece: false,
        player: this.to_play,
        roll: this.game_state.last_roll.roll,
        scenery: 0
      };
    }
  }
  if (this.players[this.to_play].turn) {
    this.set_turn(this.to_play);
  }
  else {
    this.pass_turn();
  }
};
Game.prototype.has_ended = function () {
  return this.end() !== -1;
};
Game.prototype.set_turn = function (current) {
  if (this.has_ended()) { return false; }
  if (current === -1) {
    if (this.players[this.to_play].his_turn()) {
      current = this.to_play;
    }
    else {
      current = (this.to_play + 1) % this.players.length;
    }
  }
  while (this.players[current].is_finished()) {
    current = (current + 1) % this.players.length;
  }
  this.to_play = current;
  this.players[this.to_play].give_die_game(this.game_state);
};
Game.prototype.pass_turn = function () {
  this.set_turn((this.to_play + 1) % this.players.length);
};
Game.prototype.resign = function () {
  this.alive[this.to_play] = false;
  this.players[this.to_play].resign = true;
  this.scores[this.to_play].final = this.players.length - get_alive(this);
  this.pass_turn();
};
Game.prototype.end = function () {
  var finished = 0;
  var player, i;

  for (i = 0; i < this.players.length; i++) {
    player = this.players[i];
    this.scores[i].current = player.get_score();
    if (player.is_finished()) {
      finished++;
      if (player.resign === false && this.winners.indexOf(player.id) < 0) {
        this.scores[i].final = this.players.length - this.winners.length;
        this.winners.push(player.id);
      }
    }
  }
  if (finished >= (this.players.length - 1)) {
    for (i = 0; i < this.players.length; i++) {
      player = this.players[i];
      if (player.resign === false && this.winners.indexOf(player.id) < 0) {
        this.scores[i].final = this.players.length - this.winners.length;
      }
    }
  }

  if (
    (this.mode === 'one-winner' && this.winners.length > 0) ||
    (this.mode === 'multiple-winners' && finished >= (this.players.length - 1))
  ) {
    return this.winners;
  }

  return -1;
};

// GameState

function GameState (game_state = false) {
  if (game_state) {
    this.round_length = game_state.round_length;
    this.last_roll = game_state.last_roll;
    this.pieces = [];
    this.moves = game_state.moves;
    this.pubSub = game_state.pubSub;
  }
  else {
    this.round_length = 52;
    this.last_roll = {};
    this.pieces = [];
    this.moves = [];
    this.pubSub = {
      publish: [],
      last_move: false
    };
  }
}
GameState.prototype.add_piece = function (piece) {
  this.pieces.push(piece);
};
GameState.prototype.get_real_step = function (player, position) {
  if (position > 0 && position < this.round_length) {
    var player_distance = ((this.round_length) / 4);
    var real_step = (position - 1) + player_distance * player;
    real_step %= this.round_length;
    return real_step;
  }
  else if (position >= this.round_length) return position;
  else return -1;
};
GameState.prototype.on = function (player, position) {
  var ret = null; var real_step, steps;
  var link = this;
  if (position > 0 && position < 52) {
    real_step = this.get_real_step(player, position);
    if (real_step > -1) {
      steps = this.pieces.filter(function (figure) {
        return link.get_real_step(figure.player, figure.position) === real_step;
      });
      if (steps.length > 0) { ret = steps[0]; }
    }
  }
  else if (position > 51) {
    real_step = this.get_real_step(player, position);
    steps = this.pieces.filter(function (figure) {
      return (real_step !== 57 && link.get_real_step(figure.player, figure.position) === real_step && figure.player === player);
    });
    if (steps.length > 0) { ret = steps[0]; }
  }
  return ret;
};
GameState.prototype.move_piece = function (player, id, position) {
  this.pubSub.publish.push({
    'movePiece': { player: player, id: id, position: position }
  });
  var pieces = this.pieces;
  for (var i = 0; i < pieces.length; i++) {
    var piece = pieces[i];
    if (piece.id === id && piece.player === player) {
      if (!piece.move(position, this)) {
        // throw 'Possible that view is not in-sync with model';
      }
    }
  }
};

// Piece
// - mathematical representation of piece

function Piece (player_number, iid, position = 0) {
  this.player = player_number;
  this.id = iid;
  this.position = position;
}
Piece.prototype.move = function (newPos, game_state) { // try move piece to new position
  if (newPos > 57) { return false; }
  var conflict = game_state.on(this.player, newPos);
  if (conflict) {
    if (conflict.player !== this.player) { // check for eating
      conflict.eaten(game_state);
    }
    else {
      return false;
    }
  }
  this.position = newPos;
  return true;
};
Piece.prototype.get_position = function () {
  return this.position;
};
Piece.prototype.get_destination = function (sqares) { // test new position availability and returns posible new state
  if (this.position === 0 && sqares < 6) { // if in yard you need 6 to move
    return false;
  }
  if (this.position === 0) { // if you move out of yard you move 1 step
    sqares = 1;
  }
  if (this.position + sqares > 57) { // you run out of steps
    return false;
  }
  return this.position + sqares; // return new posible state
};
Piece.prototype.is_finished = function () {
  return this.position === 57; // test for piece finish
};
Piece.prototype.eaten = function (game_state) {
  this.position = 0;
  game_state.move_piece(this.player, this.id, this.position);
};

// Player

function Player (settings) {
  this.name = settings.name;
  this.id = settings.id;
  this.colour = settings.colour;
  this.last_roll = settings.last_roll || 0;
  this.turn = settings.turn || false;
  this.moving = settings.moving || false;
  this.sixInRow = settings.sixInRow || 0;
  this.ai = settings.ai; // change later to AI for development just use ai;
  this.pieces = settings.pieces || [];
  this.resign = settings.resign || false;
}
Player.prototype.give_die_game = function (game_state) {
  this.turn = true;
  this.moving = true;
  var roll = Math.floor((Math.random() * 6) + 1);
  game_state.last_roll = { player: this.id, roll: roll };
  this.process_roll(roll);
  game_state.moves = [];
  if (this.moving) {
    game_state.moves = this.get_available_moves(this.id, roll, game_state);
  }
};
Player.prototype.get_available_moves = function (id, roll, game_state) {
  var moves = [];
  var pieces = this.pieces;
  for (var i = 0; i < 4; i++) {
    var piece = pieces[i];
    var dest = piece.get_destination(roll);
    if (dest) {
      var pieceConflict = game_state.on(this.id, dest); // test for confilcts
      if (pieceConflict) {
        if (pieceConflict.player !== this.id) {
          moves.push({ player: this.id, id: piece.id, position: dest, tr: roll, eat: true });
        }
      }
      else {
        moves.push({ player: this.id, id: piece.id, position: dest, tr: roll, eat: false });
      }
    }
  }
  return moves;
};
Player.prototype.process_roll = function (roll) {
  this.last_roll = roll;
  this.turn = false;
  if (this.last_roll === 6) {
    this.sixInRow += 1;
  }
  else {
    this.sixInRow = 0;
  }
  if (this.sixInRow > 0 && this.sixInRow < 3) {
    this.turn = true;
  }
  if (this.sixInRow > 2) {
    this.moving = false;
    this.sixInRow = 0;
  }
  return this.last_roll;
};
Player.prototype.get_last_roll = function () {
  return this.last_roll;
};
Player.prototype.get_score = function () {
  var score = 0;
  for (var i = 0; i < this.pieces.length; i++) {
    if (this.pieces[i].is_finished()) {
      score++;
    }
  }
  return score;
};
Player.prototype.is_finished = function () {
  var ret = true;
  if (this.resign) { return true; }
  for (var i = 0; i < this.pieces.length; i++) {
    if (!this.pieces[i].is_finished()) {
      ret = false;
    }
  }
  return ret;
};
Player.prototype.his_turn = function () {
  return this.turn;
};
Player.prototype.add_piece = function (piece) {
  this.pieces.push(piece);
};
Player.prototype.aiPlay = function (game_state) {
  if (game_state.moves.length === 0) {
    this.aiShowAndPass(0, game_state.last_roll.roll, false, game_state.pubSub);
  }
  else {
    this.aiDecide(game_state);
  }
};
Player.prototype.aiDecide = function (game_state) {
  var moves = game_state.moves;
  var pubSub = game_state.pubSub;
  var exit = moves.filter(function (params) {
    return params.position === 1 || (params.position - params.tr) === 1;
  });
  if (exit.length > 0) { // move to get out of yard
    game_state.move_piece(exit[0].player, exit[0].id, exit[0].position);
    if (exit[0].position === 1) {
      this.aiShowAndPass(1, exit[0].tr, exit[0], pubSub);
    }
    else {
      this.aiShowAndPass(2, exit[0].tr, exit[0], pubSub);
    }
    return;
  }
  var eat = moves.filter(function (params) {
    return params.eat;
  });
  if (eat.length > 0) { // move to eat
    game_state.move_piece(eat[0].player, eat[0].id, eat[0].position);
    this.aiShowAndPass(3, eat[0].tr, eat[0], pubSub);
    return;
  }
  var maxp = 0;
  for (var i = 0; i < moves.length; i++) {
    if (moves[i].position > maxp) {
      maxp = moves[i].position;
    }
  }
  var run = moves.filter(function (params) {
    return params.position === maxp;
  });
  game_state.move_piece(run[0].player, run[0].id, run[0].position);
  this.aiShowAndPass(4, run[0].tr, run[0], pubSub);
};
Player.prototype.aiShowAndPass = function (scenery, roll, piece, pubSub) {
  pubSub.last_move = {
    player: this.id, roll: roll, piece: piece, scenery: scenery
  };
};
