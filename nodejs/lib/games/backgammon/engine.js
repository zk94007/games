/* eslint-disable brace-style, camelcase, semi */

// Checker - represents a single checker

function Checker (player) {
  this.player = player;
}

// DiceNumberGenerator - generates random numbers on dice

function DiceNumberGenerator () { }
DiceNumberGenerator.prototype.generate = function () {
  return Math.floor((Math.random() * 6) + 1);
};
function MockDiceNumberGenerator () {
  this.toGenerate = [];
}
MockDiceNumberGenerator.prototype.addNextPair = function (nr1, nr2) {
  this.toGenerate.push(nr1);
  this.toGenerate.push(nr2);
};
MockDiceNumberGenerator.prototype.generate = function () {
  return this.toGenerate.pop();
};

// DiceRoller - generate dice numbers

function DiceRoller (dice_roller = false) {
  this.firstValue = dice_roller ? dice_roller.firstValue : null;
  this.secondValue = dice_roller ? dice_roller.secondValue : null;
  this.values = dice_roller ? dice_roller.values : [];
  this.numberGenerator = new DiceNumberGenerator();
}
DiceRoller.prototype.roll = function () {
  this.values = [];
  this.firstValue = this.numberGenerator.generate();
  this.secondValue = this.numberGenerator.generate();
  this.values.push(this.firstValue);
  this.values.push(this.secondValue);
  if (this.gotPair()) {
    this.values.push(this.firstValue);
    this.values.push(this.firstValue);
  }
};
DiceRoller.prototype.rollUntilNotPair = function () {
  this.roll();
  if (this.gotPair()) {
    this.rollUntilNotPair();
  }
};
DiceRoller.prototype.gotPair = function () {
  return (this.firstValue === this.secondValue);
};
DiceRoller.prototype.hasValue = function (value) {
  return (this.indexOfValue(value) !== -1);
};
DiceRoller.prototype.useValue = function (value) {
  if (!this.hasValue(value)) {
    throw 'Can\'t use value that is not available';
  }
  this.values.splice(this.indexOfValue(value), 1);
};
DiceRoller.prototype.valuesLeft = function () {
  return this.values.length;
};
DiceRoller.prototype.indexOfValue = function (value) {
  for (var i = 0; i < this.values.length; i++) {
    if (this.values[i] === value) {
      return i;
    }
  }
  return -1;
};
DiceRoller.prototype.addValue = function (value) {
  this.values.push(value);
};
DiceRoller.prototype.removeAll = function () {
  this.values = [];
};

// Game - holds complete game

function prepare_state (state) {
  state.legal_moves = state.availableMoves();
  return state;
}

exports.reload_game = function (state) {
  state = new Game(state);
  return prepare_state(state);
};

exports.new_game = function () {
  var state = new Game();
  state.start();
  return prepare_state(state);
};

function Game (state = {}) {
  if (state.hasOwnProperty('to_play')) {
    this.draw = state.draw;
    this.winner = state.winner;
    this.to_play = state.to_play;
    this.dice_roller = new DiceRoller(state.dice_roller);
    this.createPoints(state.points);
    this.history = state.history;
    this.graveyards = new Array(state.graveyards.length);
    for (var i = 0; i < state.graveyards.length; i++) {
      this.graveyards[i] = new Point(state.graveyards[i].position, state.graveyards[i].checkers);
    }
    this.homes = new Array(state.homes.length);
    for (var i = 0; i < state.homes.length; i++) {
      this.homes[i] = new Point(state.homes[i].position, state.homes[i].checkers);
    }
  }
  else {
    this.draw = false;
    this.winner = false;
    this.to_play = null;
    this.dice_roller = new DiceRoller();
    this.createPoints();
    this.history = [];
    this.graveyards = [new Point(25), new Point(0)];
    this.homes = [new Point(0), new Point(25)];
  }
}

Game.prototype.start = function () {
  this.putCheckers(2, 0, 24);
  this.putCheckers(5, 0, 13);
  this.putCheckers(3, 0, 8);
  this.putCheckers(5, 0, 6);
  this.putCheckers(2, 1, 1);
  this.putCheckers(5, 1, 12);
  this.putCheckers(3, 1, 17);
  this.putCheckers(5, 1, 19);
  this.dice_roller.rollUntilNotPair();
  this.setCurrentPlayer(0);
};

Game.prototype.availableMoves = function () {
  var graveyard = this.currentPlayerGraveyard();
  var moves = [];
  var i, j;

  for (i = 1; i < 25; i++) {
    var pointX = this.getPoint(i);
    for (j = 1; j < 25; j++) {
      var pointY = this.getPoint(j);
      if (this.isAvailable(pointX, pointY)) {
        moves.push({
          from: pointX,
          to: pointY,
          good: (pointY.otherPlayerCheckersCount(this.to_play) > 0)
        });
      }
    }
    if (this.isAvailable(graveyard, pointX)) {
      moves.push({ from: graveyard, to: pointX });
    }
  }

  // If all checkers at home board, find additional moves
  if (!this.hasCheckersOutsideHomeArea(this.to_play)) {
    var nextHeightest = [6, 5, 4, 3, 2, 1]; // 0 is Home bar
    if (this.to_play !== 0) {
      nextHeightest = [19, 20, 21, 22, 23, 24]; // 25 is Home bar
    }
    for (i = 0; i < this.dice_roller.values.length; i++) {
      var val = this.dice_roller.values[i];
      var yesAvailable = false;
      // is there any available move for this value
      for (j = 0; j < moves.length; j++) {
        var distance = this.getDistanceBetweenPoints(moves[j].from, moves[j].to);
        if (val === distance) {
          yesAvailable = true;
          break;
        }
      }
      if (!yesAvailable) {
        // try to create moves with second highest value
        nextHeightest.reverse();
        var ptH = this.currentPlayerHome();
        for (var k = val; k > 0; k--) {
          var ptS = this.getPoint(nextHeightest[k - 1]);
          var dst = this.getDistanceBetweenPoints(ptS, ptH);
          if (dst <= val) {
            if (ptS.checkersCount() > 0) {
              if (ptS.checkers[0].player === this.to_play) {
                moves.push({ from: ptS, to: ptH });
                break;
              }
            }
          }
        }
      }
    }
  }

  return moves;
};

Game.prototype.isAvailable = function (sourcePoint, targetPoint) {
  // is moving to correct direction
  if (!this.isCorrectDirection(sourcePoint, targetPoint, this.to_play)) {
    return false;
  }
  // if graveyard have any checker and current point is not graveyard
  var graveyard = this.currentPlayerGraveyard();
  if (graveyard.checkersCount() > 0 && sourcePoint !== graveyard) {
    return false;
  }
  // if current point don't have any checker, then nothing to move
  if (sourcePoint.playerCheckersCount(this.to_play) === 0) {
    return false;
  }
  // if target have more then 1 checker for other player, then you can't move checker
  if (targetPoint.otherPlayerCheckersCount(this.to_play) >= 2) {
    return false;
  }
  // if all check are not at home board
  if (targetPoint === this.currentPlayerHome()) {
    if (this.hasCheckersOutsideHomeArea(this.to_play)) {
      return false;
    }
  }
  var distance = this.getDistanceBetweenPoints(sourcePoint, targetPoint);
  return this.dice_roller.hasValue(distance); // don't want additonal moves, just return value
};

exports.pass_move = function (state) {
  if (state.availableMoves().length > 0) {
    return false;
  }
  state.finishTurn();
  return prepare_state(state);
};
exports.make_move = function (state, sP, tP) {
  var moved = false;

  var sourcePoint;
  var targetPoint = state.getPoint(tP.position);

  var graveyard = state.currentPlayerGraveyard();
  if (graveyard.checkers.length > 0) {
    sourcePoint = graveyard;
  }
  else {
    sourcePoint = state.getPoint(sP.position);
  }

  if (sourcePoint && targetPoint) {
    if (state.canMove(sourcePoint, targetPoint)) {
      state.moveChecker(sourcePoint, targetPoint);
      state.finishTurn();
      moved = prepare_state(state);
    }
  }

  return moved;
};

Game.prototype.canMove = function (sourcePoint, targetPoint) {
  var moves = this.availableMoves();
  for (var i = 0; i < moves.length; i++) {
    if (
      moves[i].from.position === sourcePoint.position &&
      moves[i].to.position === targetPoint.position
    ) {
      return true;
    }
  }
  return false;
};

Game.prototype.moveChecker = function (sourcePoint, targetPoint) {
  if (this.dice_roller.valuesLeft() === 0) {
    console.log('No moves left');
  }

  if (!this.canMove(sourcePoint, targetPoint)) {
    console.log('Invalid move');
  }

  var checker = sourcePoint.popChecker();
  targetPoint.addChecker(checker);

  checker = targetPoint.firstChecker();
  if (checker.player !== this.to_play) {
    targetPoint.removeChecker(checker);
    this.oppositePlayerGraveyard().addChecker(checker);
  }

  var distance = this.getDistanceBetweenPoints(sourcePoint, targetPoint);

  this.history.push({
    sourcePoint: sourcePoint,
    targetPoint: targetPoint,
    player: this.to_play
  });

  if (this.hasCheckersOutsideHomeArea(this.to_play)) {
    this.dice_roller.useValue(distance);
  }
  else {
    // if all are at home board and value is not exists in pair, try to use upper value
    while (!this.dice_roller.hasValue(distance)) {
      if (distance < 6) { distance++; }
    }
    this.dice_roller.useValue(distance);
  }
};

Game.prototype.finishTurn = function () {
  if (this.homes[0].checkersCount() === 15) {
    this.winner = 0;
  }
  if (this.homes[1].checkersCount() === 15) {
    this.winner = 1;
  }
  if (this.availableMoves().length === 0 && this.dice_roller.valuesLeft() > 0) {
    this.history.push({
      player: this.to_play
    });
    this.dice_roller.removeAll();
  }
  if (this.dice_roller.valuesLeft() === 0) {
    this.switchPlayer();
  }
};

Game.prototype.undo = function () {
  var lastMovement = this.history[this.history.length - 1];
  if (lastMovement && lastMovement.player === this.to_play) {
    var sourcePoint = lastMovement.sourcePoint;
    var targetPoint = lastMovement.targetPoint;
    this.history.splice(-1, 1);
    var checker = targetPoint.popChecker();
    sourcePoint.addChecker(checker);
    var distance = this.getDistanceBetweenPoints(sourcePoint, targetPoint);
    this.dice_roller.addValue(distance);
  }
};

Game.prototype.getDistanceBetweenPoints = function (source, target) {
  return Math.abs(source.position - target.position);
};

Game.prototype.currentPlayerGraveyard = function () {
  return this.graveyards[this.to_play];
};

Game.prototype.currentPlayerHome = function () {
  return this.homes[this.to_play];
};

Game.prototype.getPoint = function (id) {
  switch (id) {
    case 0:
      return this.homes[0];
    case 25:
      return this.homes[1];
    default:
      return this.points[id - 1];
  }
};

Game.prototype.switchPlayer = function () {
  if (this.to_play === 0) {
    this.to_play = 1;
  }
  else {
    this.to_play = 0;
  }
  this.dice_roller.roll();
};

Game.prototype.setCurrentPlayer = function (player) {
  this.to_play = player;
};

Game.prototype.putCheckers = function (count, player, position) {
  var checker;
  var point = this.getPoint(position);
  for (var i = 0; i < count; i++) {
    checker = new Checker(player);
    point.addChecker(checker);
  }
};

Game.prototype.getCheckersCountOnPoint = function (position) {
  var point = this.getPoint(position);
  return point.checkersCount();
};

Game.prototype.createPoints = function (points = []) {
  this.points = [];
  for (var i = 0; i < 24; i++) {
    if (points[i]) {
      this.points[i] = new Point(points[i].position, points[i].checkers);
    }
    else {
      this.points.push(new Point(i + 1));
    }
  }
};

Game.prototype.isCorrectDirection = function (source, target, player) {
  if (player === 0) {
    return source.position > target.position;
  }
  else {
    return target.position > source.position;
  }
};

Game.prototype.hasCheckersOutsideHomeArea = function (player) {
  var from = 7; var to = 24;
  if (player !== 0) {
    from = 1;
    to = 18;
  }
  var graveyard = this.currentPlayerGraveyard();
  if (graveyard.checkers.length > 0) { return true; }
  for (var i = from; i <= to; i++) {
    if (this.getPoint(i).playerCheckersCount(player) > 0) {
      return true;
    }
  }
};

Game.prototype.oppositePlayerGraveyard = function () {
  if (this.to_play === 0) { return this.graveyards[1]; }
  else { return this.graveyards[0]; }
};

// Point

function Point (position, checkers = []) {
  this.position = position;
  this.checkers = checkers;
}

Point.prototype.addChecker = function (checker) {
  this.checkers.push(checker);
};

Point.prototype.removeChecker = function (checker) {
  for (var i = 0; i < this.checkers.length; i++) {
    if (this.checkers[i] === checker) {
      this.checkers.splice(i, 1);
      break;
    }
  }
};

Point.prototype.popChecker = function () {
  var checker = this.firstChecker();
  this.removeChecker(checker);
  return checker;
};

Point.prototype.firstChecker = function () {
  return this.checkers[0];
};

Point.prototype.checkersCount = function () {
  return this.checkers.length;
};

Point.prototype.playerCheckersCount = function (player) {
  var count = 0;
  for (var i = 0; i < this.checkersCount(); i++) {
    if (this.checkers[i].player === player) {
      count++;
    }
  }
  return count;
};

Point.prototype.otherPlayerCheckersCount = function (player) {
  return this.checkersCount() - this.playerCheckersCount(player);
};

// Bot

exports.make_ai_move = function (GAME) {
  var moved = false;

  if (GAME.dice_roller.valuesLeft() > 0) {
    var moves = GAME.availableMoves();

    if (moves.length === 0) {
      GAME.finishTurn();
      return prepare_state(GAME);
    }

    var move = Math.round(Math.random() * (moves.length-1));
    for (var i = 0; i < moves.length; i++) {
      if (i !== move && moves[i].good) { move = i; }
    }
    move = moves[move];

    if (GAME.canMove(move.from, move.to)) {
      GAME.moveChecker(move.from, move.to);
      GAME.finishTurn();
      moved = prepare_state(GAME);
    }
  }

  return moved;
};
