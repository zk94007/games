/* eslint-disable brace-style, camelcase, semi */

module.exports = Warships_Match;

var Match = require('../Match.js');

// Constructor

function Warships_Match (set, match = false) {
  this._super.call(this, 'warships', set, match);
}
Warships_Match.prototype = Object.create(Match.prototype);
Warships_Match.prototype.constructor = Warships_Match;
Warships_Match.prototype._super = Match;

// Public Methods

Warships_Match.prototype.start = function () {
  if (!this._super.prototype.start.apply(this, arguments)) { return false; }
  var nbr_players = this.settings.players;
  var xmax = this.settings.bsize;
  var ymax = xmax - 3;
  var i, j;

  this.hands = [get_ships(), get_ships()];
  this.state.grids = [
    (new Array(xmax * ymax)).fill(false),
    (new Array(xmax * ymax)).fill(false)
  ];
  this.state.hand = false;
  this.state.score = (new Array(nbr_players)).fill(0);
  this.state.setup = false;
  this.state.to_play = 0;
  this.state.not_visited0 = [];
  this.state.not_visited1 = [];
  if (xmax % 2 === 0) {
    for (i = 0; i < ymax; i += 2) {
      for (j = 0; j < xmax; j += 2) {
        this.state.not_visited0.push(i * xmax + j);
        this.state.not_visited1.push(i * xmax + j);
      }
    }
    for (i = 1; i < ymax; i += 2) {
      for (j = 1; j < xmax; j += 2) {
        this.state.not_visited0.push(i * xmax + j);
        this.state.not_visited1.push(i * xmax + j);
      }
    }
  }
  else {
    for (i = 0; i < xmax * ymax; i += 2) {
      this.state.not_visited0.push(i);
      this.state.not_visited1.push(i);
    }
  }

  this.started();
};

Warships_Match.prototype.make_move = function (player, move) {
  if (!this._super.prototype.make_move.apply(this, arguments)) { return; }

  var players = this.players();
  var state = this.state;
  var turn = state.to_play;

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

  var move_result = this.check_move(turn, move);
  if (move_result !== false) {
    state.to_play = this.next_turn();

    if (move_result.string !== '') {
      this.moves.push(move_result.string);
    }
    if (move_result.done !== false) {
      this.finish(turn, move_result.done);
      return;
    }

    this.update_timer(turn, true);
    this.updated();
  }
  else {
    this.emit('message', this, player, 'Invalid move (2)');
  }
};

Warships_Match.prototype.valid_move = function (move) {
  if (!this._super.prototype.valid_move.apply(this, arguments)) { return false; }

  if (
    typeof move !== 'object' || (
      move.resign !== true && (
        typeof move.ships !== 'object' &&
        typeof move.square !== 'number'
      )
    )
  ) {
    console.log('Match ' + this.id + ': bad move');
    console.log(move);
    return false;
  }

  return true;
};

Warships_Match.prototype.check_move = function (turn, move) {
  var state = this.state;
  var hand = this.hands[turn];

  var xmax = this.settings.bsize;
  var ymax = xmax - 3;
  var i, j;

  var letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  var coord = letters[(move.square % xmax)] + (Math.floor(move.square / xmax) + 1);
  var result = { string: '', done: false };

  if (state.setup === false) {
    if (
      move === undefined ||
      move.ships === undefined ||
      move.ships.length !== hand.length
    ) {
      return false;
    }
    for (i = 0; i < hand.length; i++) {
      if (place_ship(hand[i].ship, move.ships[i].ship, i,
                     state.grids[turn], false, xmax, ymax) === false) { return false; }
    }
    for (j = 0; j < state.grids[turn].length; j++) {
      state.grids[turn][j] = false;
    }
  }
  else {
    var opp = (turn + 1) % this.players().length;
    var hit = false;

    for (i = 0; i < this.hands[opp].length; i++) {
      if (this.hands[opp][i].hits < this.hands[opp][i].ship.length) {
        var ship = this.hands[opp][i].ship;

        for (j = 0; j < ship.length; j++) {
          if (move.square === ship[j].pos) {
            hit = {i: i, j: j};
            result.string = coord + ' : hit';
            this.hands[opp][i].hits++; ship[j].hit = true;

            if (this.hands[opp][i].hits === ship.length) {
              for (var k = 0; k < ship.length; k++) {
                state.grids[turn][ship[k].pos] = i;
              }
              state.score[turn]++;
              result.string += ' .. sank ' + this.hands[opp][i].name;
            }
            else {
              state.grids[turn][ship[j].pos] = true;
            }

            break;
          }
        }

        if (hit !== false) { break; }
      }
    }

    if (hit === false) {
      state.grids[turn][move.square] = -1;
      result.string = coord + ' : miss';
    }
    if (state.score[turn] === this.hands[opp].length) {
      result.done = (state.to_play * 3) + 1;
    }
  }

  if (state.to_play === 1 && state.setup === false) { state.setup = true; }

  return result;
};

Warships_Match.prototype.play_ai = function (play_now) {
  var ai = this._super.prototype.play_ai.apply(this, arguments);
  if (!ai) { return; }

  var match = this;
  var state = this.state;
  var turn = state.to_play;
  var move = false;
  var hand = match.hands[turn];

  var xmax = match.settings.bsize;
  var ymax = xmax - 3;

  var i;

  if (state.setup === false) {
    move = { ships: new Array(hand.length) };

    for (i = 0; i < hand.length; i++) {
      move.ships[i] = { ship: new Array(hand[i].ship.length) };

      var orient = 1; if (Math.random() > 0.5) { orient = xmax; }
      var start = Math.floor(Math.random() * (xmax * ymax));

      do {
        start = (++start % (xmax * ymax));
        for (var j = 0; j < move.ships[i].ship.length; j++) {
          move.ships[i].ship[j] = { pos: false };
          move.ships[i].ship[j].pos = start + (orient * j);
        }
      } while (place_ship(hand[i].ship, move.ships[i].ship, i,
                          state.grids[turn], ai.name, xmax, ymax) === false);
    }

    state.grids[turn] = (new Array(xmax * ymax)).fill(false);
  }
  else {
    var not_visited;
    var finds;
    if (turn) {
      not_visited = this.state.not_visited1;
    }
    else {
      not_visited = this.state.not_visited0;
    }
    if (ai.name === 'Friedland') {
      finds = [{ move: not_visited[(Math.floor(Math.random() * not_visited.length))], rate: -1 }];
    }
    else {
      finds = [{ move: Math.floor(Math.random() * (xmax * ymax)), rate: -1 }];
    }

    for (i = 0; i < state.grids[turn].length; i++) {
      if (state.grids[turn][i] === true) {
        finds.push(best_target(state.grids[turn], i, xmax, ymax));
      }
    }

    var besti = 0; var best = finds[besti].rate;
    for (i = 1; i < finds.length; i++) {
      if (finds[i].rate > best) {
        besti = i;
        best = finds[besti].rate;
      }
    }

    move = { square: finds[besti].move };

    if (ai.name === 'Barham' || ai.name === 'Friedland') {
      var oturn = (turn + 1) % match.players().length;
      var maxl = 2;

      for (i = 0; i < match.hands[oturn].length; i++) {
        if (
          match.hands[oturn][i].hits < match.hands[oturn][i].ship.length - 1 &&
          match.hands[oturn][i].ship.length > maxl
        ) {
          maxl = match.hands[oturn][i].ship.length;
        }
      }

      if (best === -1) {
        if (ai.name === 'Friedland') {
          var moves = [];
          for (i = 0; i < not_visited.length; i++) {
            var open = open_squares(state.grids[turn], not_visited[i], xmax, ymax, maxl);
            if (open > best) { best = open; moves = [not_visited[i]]; }
            else if (open === best) { moves.push(not_visited[i]); }
          }
          move.square = moves[Math.floor(Math.random() * moves.length)];
          var index = not_visited.indexOf(move.square);
          if (turn) {
            this.state.not_visited1.splice(index, 1);
          }
          else {
            this.state.not_visited0.splice(index, 1);
          }
        }
        else if (ai.level === 1) {
          while (open_squares(state.grids[turn], move.square, xmax, ymax, maxl) === 0) {
            move.square += 1;
            if (move.square >= (xmax * ymax)) {
              move.square = 0;
            }
          }
        }
        else if (ai.level === 2) {
          var moves = [];
          for (i = 0; i < (xmax * ymax); i++) {
            var open = open_squares(state.grids[turn], i, xmax, ymax, maxl);
            if (open > best) { best = open; moves = [i]; }
            else if (open === best) { moves.push(i); }
          }
          move.square = moves[Math.floor(Math.random() * moves.length)];
        }
      }
    }
    else if (ai.name === 'Bismarck') {
      var inc = 2;
      while (state.grids[turn][move.square] !== false) {
        move.square += inc;
        if (move.square >= (xmax * ymax)) {
          move.square = 0; inc = 1;
        }
      }
    }
  }

  var move_result = this.check_move(turn, move);
  if (move_result !== false) {
    state.to_play = this.next_turn();

    if (move_result.string !== '') {
      this.moves.push(move_result.string);
    }
    if (move_result.done !== false) {
      this.finish(turn, move_result.done);
      return;
    }
  }

  this.update_timer(turn, true);
  this.updated();
};

Warships_Match.prototype.finish = function (turn, decision) {
  if (this.status !== 'FINISH') {
    this._super.prototype.finish.apply(this, arguments);
    return;
  }

  var bsize = this.settings.bsize;
  var multip = 1; if (bsize === 15) { multip = 0.66; }

  var output = ''; var places = [];
  if (decision === 0) {
    places = [1.5, 1.5];
    output = 'Draw: %p0 and %p1';
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
    if (decision % 3 === 1) { output += opp + ' has no ships'; }
    else if (decision % 3 === 2) { output += opp + ' resigns'; }
    else if (decision % 3 === 0) { output += opp + ' times-out'; }
  }

  var fileout = '';
  fileout += '[Board ' + bsize + 'x' + (bsize - 3) + ']\n';
  fileout += '[Result %out]\n\n';
  for (var i = 0; i < this.moves.length; i++) {
    if (i % 2 === 0) {
      fileout += ((i + 2) / 2) + '. ' + this.moves[i] + ' ';
    }
    else {
      fileout += this.moves[i] + ' ';
    }
  }

  this.finished({
    file: { generic: true, out: fileout },
    multielo: multip,
    places: places,
    ratings: [0, 0],
    text: output });
};

// Private Methods

function place_ship (mship, ship, nbr, grid, ai_name, xmax, ymax) {
  var row = Math.floor(ship[0].pos / xmax);
  var last = ship[0].pos - 1;
  var i;

  for (i = 0; i < ship.length; i++) {
    if (
      (ship[i].pos === last + 1 && (Math.floor(ship[i].pos / xmax) !== row)) ||
      (ship[i].pos > last + 1 && ship[i].pos !== last + xmax) ||
      (grid[ship[i].pos] !== false)
    ) {
      return false;
    }

    if (
      ai_name !== false && (
        (ai_name === 'Barham' && Math.random() > 0.05) ||
        (ai_name === 'Bismarck' && Math.random() > 0.25)
      )
    ) {
      var neigh = [
        ship[i].pos - xmax, ship[i].pos - 1,
        ship[i].pos + xmax, ship[i].pos + 1];
      for (var j = 0; j < neigh.length; j++) {
        if (
          neigh[j] >= 0 &&
          neigh[j] < (xmax & ymax) && grid[neigh[j]] !== false
        ) {
          return false;
        }
      }
    }

    last = ship[i].pos;
  }

  for (i = 0; i < ship.length; i++) {
    grid[ship[i].pos] = nbr;
    mship[i].pos = ship[i].pos;
  }

  return true;
}

function best_target (grid, sq, xmax, ymax) {
  var targets = [sq - xmax, sq - 1, sq + xmax, sq + 1];
  var ratings = [0, 0, 0, 0];
  var i;

  for (i = 0; i < targets.length; i++) {
    if (targets[i] >= 0 && targets[i] < (xmax * ymax)) {
      if (grid[targets[i]] === false) {
        ratings[i] = 1;
        if (grid[targets[((i + 2) % 4)]] === true) {
          ratings[i] = 2;
        }
      }
      else if (grid[targets[i]] === true) {
        ratings[i] = -1;
        var tar = (i + 2) % 4;
        if (grid[targets[tar]] === false) {
          ratings[tar] = 2;
        }
      }
    }
    else { ratings[i] = -1; }
  }

  var besti = 0; var best = ratings[besti];
  for (i = 1; i < ratings.length; i++) {
    if (ratings[i] > best) {
      besti = i;
      best = ratings[besti];
    }
  }

  return { move: targets[besti], rate: ratings[besti] };
}

function open_squares (grid, sq, xmax, ymax, maxl) {
  var squares = [[], [], [], []];
  var i, j;

  for (j = 0; j < maxl; j++) {
    squares[0].push(sq - (xmax * j));
    squares[1].push(sq + (xmax * j));
    squares[2].push(sq - j);
    squares[3].push(sq + j);
  }

  var total = 0;
  for (i = 0; i < squares.length; i++) {
    var open = 0;
    for (j = 0; j < squares[i].length; j++) {
      if (grid[squares[i][j]] === false) { open++; }
      else break;
    }
    if (open === squares[i].length) { total++; }
  }

  return total;
}

function get_ships () {
  return [{ name: 'Carrier', hits: 0, ship: get_ship(5) },
          { name: 'Battleship', hits: 0, ship: get_ship(4) },
          { name: 'Submarine', hits: 0, ship: get_ship(3) },
          { name: 'Cruiser', hits: 0, ship: get_ship(3) },
          { name: 'Destroyer', hits: 0, ship: get_ship(2) }];
}

function get_ship (size) {
  var ship = [];
  for (var i = 0; i < size; i++) {
    ship.push({ pos: false, hit: false });
  }
  return ship;
}
