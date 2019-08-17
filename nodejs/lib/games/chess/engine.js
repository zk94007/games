/* p4wn, AKA 5k chess - by Douglas Bagnall <douglas@paradise.net.nz>
 *
 * This code is in the public domain, or as close to it as various
 * laws allow. No warranty; no restrictions.
 *
 * lives at http://p4wn.sf.net/
 */

/*Compatibility tricks:
 * backwards for old MSIEs (to 5.5)
 * sideways for seed command-line javascript.*/
var p4_log;
if (this.imports !== undefined &&
  this.printerr !== undefined){//seed or gjs
  p4_log = function(){
    var args = Array.prototype.slice.call(arguments);
    printerr(args.join(', '));
  };
}
else if (this.console === undefined){//MSIE
  p4_log = function(){};
}
else {
  p4_log = function(){console.log.apply(console, arguments);};
}

/*MSIE Date.now backport */
if (Date.now === undefined)
    Date.now = function(){return (new Date).getTime();};

/* The pieces are stored as numbers between 2 and 13, inclusive.
 * Empty squares are stored as 0, and off-board squares as 16.
 * There is some bitwise logic to it:
 *  piece & 1 -> colour (white: 0, black: 1)
 *  piece & 2 -> single move piece (including pawn)
 *  if (piece & 2) == 0:
 *     piece & 4  -> row and column moves
 *     piece & 8  -> diagonal moves
 */
var P4_PAWN = 2, P4_ROOK = 4, P4_KNIGHT = 6, P4_BISHOP = 8, P4_QUEEN = 12, P4_KING = 10;
var P4_EDGE = 16;

/* in order, even indices: <nothing>, pawn, rook, knight, bishop, king, queen. Only the
 * even indices are used.*/
var P4_MOVES = [[], [],
                [], [],
                [1,10,-1,-10], [],
                [21,19,12,8,-21,-19,-12,-8], [],
                [11,9,-11,-9], [],
                [1,10,11,9,-1,-10,-11,-9], [],
                [1,10,11,9,-1,-10,-11,-9], []
               ];

/*P4_VALUES defines the relative value of various pieces.
 *
 * It follows the 1,3,3,5,9 pattern you learn as a kid, multiplied by
 * 20 to give sub-pawn resolution to other factors, with bishops given
 * a wee boost over knights.
 */
var P4_VALUES=[0, 0,      //Piece values
               20, 20,    //pawns
               100, 100,  //rooks
               60, 60,    //knights
               61, 61,    //bishops
               8000, 8000,//kings
               180, 180,  //queens
               0];

/* A score greater than P4_WIN indicates a king has been taken. It is
 * less than the value of a king, in case someone finds a way to, say,
 * sacrifice two queens in order to checkmate.
 */
var P4_KING_VALUE = P4_VALUES[10];
var P4_WIN = P4_KING_VALUE >> 1;

/* every move, a winning score decreases by this much */
var P4_WIN_DECAY = 300;
var P4_WIN_NOW = P4_KING_VALUE - 250;

/* P4_{MAX,MIN}_SCORE should be beyond any possible evaluated score */

var P4_MAX_SCORE = 9999;    // extremes of evaluation range
var P4_MIN_SCORE = -P4_MAX_SCORE;

/*initialised in p4_initialise_state */
var P4_CENTRALISING_WEIGHTS;
var P4_BASE_PAWN_WEIGHTS;
var P4_KNIGHT_WEIGHTS;

/*P4_DEBUG turns on debugging features */
var P4_DEBUG = 0;
var P4_INITIAL_BOARD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 1 1";

/*use javascript typed arrays rather than plain arrays
 * (faster in some browsers, unsupported in others, possibly slower elsewhere) */
var P4_USE_TYPED_ARRAYS = this.Int32Array !== undefined;

var P4_PIECE_LUT = { /*for FEN, PGN interpretation */
  P: 2,
  p: 3,
  R: 4,
  r: 5,
  N: 6,
  n: 7,
  B: 8,
  b: 9,
  K: 10,
  k: 11,
  Q: 12,
  q: 13
};

var P4_ENCODE_LUT = '  PPRRNNBBKKQQ';

function p4_alphabeta_treeclimber(state, count, colour, score, s, e, alpha, beta){
  var move = p4_make_move(state, s, e, P4_QUEEN);
  var i;
  var ncolour = 1 - colour;
  var movelist = p4_parse(state, colour, move.ep, -score);
  var movecount = movelist.length;
  if(count){
    //branch nodes
    var t;
    for(i = 0; i < movecount; i++){
      var mv = movelist[i];
      var mscore = mv[0];
      var ms = mv[1];
      var me = mv[2];
      if (mscore > P4_WIN){ //we won! Don't look further.
        alpha = P4_KING_VALUE;
        break;
      }
      t = -p4_alphabeta_treeclimber(state, count - 1, ncolour, mscore, ms, me,
                                    -beta, -alpha);
      if (t > alpha){
        alpha = t;
      }
      if (alpha >= beta){
        break;
      }
    }
    if (alpha < -P4_WIN_NOW && ! p4_check_check(state, colour)){
      /* Whatever we do, we lose the king.
       * But if it is not check then this is stalemate, and the
       * score doesn't apply.
       */
      alpha = state.stalemate_scores[colour];
    }
    if (alpha < -P4_WIN){
      /*make distant checkmate seem less bad */
      alpha += P4_WIN_DECAY;
    }
  }
  else{
    //leaf nodes
    while(beta > alpha && --movecount != -1){
      if(movelist[movecount][0] > alpha){
        alpha = movelist[movecount][0];
      }
    }
  }
  p4_unmake_move(state, move);
  return alpha;
}

/* p4_prepare() works out weightings for assessing various moves,
 * favouring centralising moves early, for example.
 *
 * It is called before each tree search, not for each parse(), so it
 * is OK for it to be a little bit slow. But that also means it drifts
 * out of sync with the real board state, especially on deep searches.
 */

function p4_prepare(state){
  var i, j, x, y, a;
  var pieces = state.pieces = [[], []];
  /*convert state.moveno half move count to move cycle count */
  var moveno = state.moveno >> 1;
  var board = state.board;

  /* high earliness_weight indicates a low move number. The formula
   * should work above moveno == 50, but this is javascript.
   */
  var earliness_weight = (moveno > 50) ? 0 : parseInt(6 * Math.exp(moveno * -0.07));
  var king_should_hide = moveno < 12;
  var early = moveno < 5;
  /* find the pieces, kings, and weigh material*/
  var kings = [0, 0];
  var material = [0, 0];
  var best_pieces = [0, 0];
  for(i = 20; i  < 100; i++){
    a = board[i];
    var piece = a & 14;
    var colour = a & 1;
    if(piece){
      pieces[colour].push([a, i]);
      if (piece == P4_KING){
        kings[colour] = i;
      }
      else{
        material[colour] += P4_VALUES[piece];
        best_pieces[colour] = Math.max(best_pieces[colour], P4_VALUES[piece]);
      }
    }
  }

  /*does a draw seem likely soon?*/
  var draw_likely = (state.draw_timeout > 90 || state.current_repetitions >= 2);
  if (draw_likely)
    p4_log("draw likely", state.current_repetitions, state.draw_timeout);
  state.values = [[], []];
  var qvalue = P4_VALUES[P4_QUEEN]; /*used as ballast in various ratios*/
  var material_sum = material[0] + material[1] + 2 * qvalue;
  var wmul = 2 * (material[1] + qvalue) / material_sum;
  var bmul = 2 * (material[0] + qvalue) / material_sum;
  var multipliers = [wmul, bmul];
  var emptiness = 4 * P4_QUEEN / material_sum;
  state.stalemate_scores = [parseInt(0.5 + (wmul - 1) * 2 * qvalue),
                            parseInt(0.5 + (bmul - 1) * 2 * qvalue)];
  //p4_log("value multipliers (W, B):", wmul, bmul,
  //       "stalemate scores", state.stalemate_scores);
  for (i = 0; i < P4_VALUES.length; i++){
    var v = P4_VALUES[i];
    if (v < P4_WIN){//i.e., not king
      state.values[0][i] = parseInt(v * wmul + 0.5);
      state.values[1][i] = parseInt(v * bmul + 0.5);
    }
    else {
      state.values[0][i] = v;
      state.values[1][i] = v;
    }
  }
  /*used for pruning quiescence search */
  state.best_pieces = [parseInt(best_pieces[0] * wmul + 0.5),
                       parseInt(best_pieces[1] * bmul + 0.5)];

  var kx = [kings[0] % 10, kings[1] % 10];
  var ky = [parseInt(kings[0] / 10), parseInt(kings[1] / 10)];

  /* find the frontmost pawns in each file */
  var pawn_cols = [[], []];
  for (y = 3; y < 9; y++){
    for (x = 1; x < 9; x++){
      i = y * 10 + x;
      a = board[i];
      if ((a & 14) != P4_PAWN)
        continue;
      if ((a & 1) == 0){
        pawn_cols[0][x] = y;
      }
      else if (pawn_cols[1][x] === undefined){
        pawn_cols[1][x] = y;
      }
    }
  }
  var target_king = (moveno >= 20 || material_sum < 5 * qvalue);
  var weights = state.weights;

  for (y = 2; y < 10; y++){
    for (x = 1; x < 9; x++){
      i = y * 10 + x;
      var early_centre = P4_CENTRALISING_WEIGHTS[i] * earliness_weight;
      var plateau = P4_KNIGHT_WEIGHTS[i];
      for (var c = 0; c < 2; c++){
        var dx = Math.abs(kx[1 - c] - x);
        var dy = Math.abs(ky[1 - c] - y);
        var our_dx = Math.abs(kx[c] - x);
        var our_dy = Math.abs(ky[c] - y);

        var d = Math.max(Math.sqrt(dx * dx + dy * dy), 1) + 1;
        var mul = multipliers[c]; /*(mul < 1) <==> we're winning*/
        var mul3 = mul * mul * mul;
        var at_home = y == 2 + c * 7;
        var pawn_home = y == 3 + c * 5;
        var row4 = y == 5 + c;
        var promotion_row = y == 9 - c * 7;
        var get_out = (early && at_home) * -5;

        var knight = parseInt(early_centre * 0.3) + 2 * plateau + get_out;
        var rook = parseInt(early_centre * 0.3);
        var bishop = parseInt(early_centre * 0.6) + plateau + get_out;
        if (at_home){
          rook += (x == 4 || x == 5) * (earliness_weight + ! target_king);
          rook += (x == 1 || x == 8) * (moveno > 10 && moveno < 20) * -3;
          rook += (x == 2 || x == 7) * (moveno > 10 && moveno < 20) * -1;
        }

        /*Queen wants to stay home early, then jump right in*/
        /*keep kings back on home row for a while*/
        var queen = parseInt(plateau * 0.5 + early_centre * (0.5 - early));
        var king = (king_should_hide && at_home) * 2 * earliness_weight;

        /*empty board means pawn advancement is more urgent*/
        var get_on_with_it = Math.max(emptiness * 2, 1);
        var pawn = get_on_with_it * P4_BASE_PAWN_WEIGHTS[c ? 119 - i : i];
        if (early){
          /* Early pawn weights are slightly randomised, so each game is different.
           */
          if (y >= 4 && y <= 7){
            var boost = 1 + 3 * (y == 5 || y == 6);
            pawn += parseInt((boost + p4_random_int(state, 4)) * 0.1 *
                             early_centre);
          }
          if (x == 4 || x == 5){
            //discourage middle pawns from waiting at home
            pawn -= 3 * pawn_home;
            pawn += 3 * row4;
          }
        }
        /*pawn promotion row is weighted as a queen minus a pawn.*/
        if (promotion_row)
          pawn += state.values[c][P4_QUEEN] - state.values[c][P4_PAWN];

        /*pawns in front of a castled king should stay there*/
        pawn += 4 * (y == 3 && ky[c] == 2 && Math.abs(our_dx) < 2 &&
                     kx[c] != 5 && x != 4 && x != 5);
        /*passed pawns (having no opposing pawn in front) are encouraged. */
        var cols = pawn_cols[1 - c];
        if (cols[x] == undefined ||
            (c == 0 && cols[x] < y) ||
            (c == 1 && cols[x] > y))
            pawn += 2;

        /* After a while, start going for opposite king. Just
         * attract pieces into the area so they can mill about in
         * the area, waiting for an opportunity.
         *
         * As prepare is only called at the beginning of each tree
         * search, the king could wander out of the targetted area
         * in deep searches. But that's OK. Heuristics are
         * heuristics.
         */
        if (target_king){
          knight += 2 * parseInt(8 * mul / d);
          rook += 2 * ((dx < 2) + (dy < 2));
          bishop += 3 * (Math.abs((dx - dy))  < 2);
          queen += 2 * parseInt(8 / d) + (dx * dy == 0) + (dx - dy == 0);
          /* The losing king wants to stay in the middle, while
           the winning king goes in for the kill.*/
          var king_centre_wt = 8 * emptiness * P4_CENTRALISING_WEIGHTS[i];
          king += parseInt(150 * emptiness / (mul3 * d) + king_centre_wt * mul3);
        }
        weights[P4_PAWN + c][i] = pawn;
        weights[P4_KNIGHT + c][i] = knight;
        weights[P4_ROOK + c][i] = rook;
        weights[P4_BISHOP + c][i] = bishop;
        weights[P4_QUEEN + c][i] = queen;
        weights[P4_KING + c][i] = king;

        if (draw_likely && mul < 1){
          /*The winning side wants to avoid draw, so adds jitter to its weights.*/
          var range = 3 / mul3;
          for (j = 2 + c; j < 14; j += 2){
            weights[j][i] += p4_random_int(state, range);
          }
        }
      }
    }
  }
  state.prepared = true;
}

function p4_maybe_prepare(state){
  if (! state.prepared)
      p4_prepare(state);
}


function p4_parse(state, colour, ep, score) {
  var board = state.board;
  var s, e;    //start and end position
  var E, a;       //E=piece at end place, a= piece moving
  var i, j;
  var other_colour = 1 - colour;
  var dir = (10 - 20 * colour); //dir= 10 for white, -10 for black
  var movelist = [];
  var captures = [];
  var weight;
  var pieces = state.pieces[colour];
  var castle_flags = (state.castles >> (colour * 2)) & 3;
  var values = state.values[other_colour];
  var all_weights = state.weights;
  for (j = pieces.length - 1; j >= 0; j--){
    s = pieces[j][1]; // board position
    a = board[s]; //piece number
    var weight_lut = all_weights[a];
    weight = score - weight_lut[s];
    a &= 14;
    if(a > 2){    //non-pawns
      var moves = P4_MOVES[a];
      if(a & 2){
        for(i = 0; i < 8; i++){
          e = s + moves[i];
          E = board[e];
          if(!E){
            movelist.push([weight + values[E] + weight_lut[e], s, e]);
          }
          else if((E&17)==other_colour){
            captures.push([weight + values[E] + weight_lut[e] + all_weights[E][e], s, e]);
          }
        }
        if(a == P4_KING && castle_flags){
          if((castle_flags & 1) &&
            (board[s-1] + board[s-2] + board[s-3] == 0) &&
            p4_check_castling(board, s - 2,other_colour,dir,-1)){//Q side
            movelist.push([weight + 12, s, s - 2]);     //no analysis, just encouragement
          }
          if((castle_flags & 2) && (board[s+1]+board[s+2] == 0)&&
            p4_check_castling(board, s, other_colour, dir, 1)){//K side
            movelist.push([weight + 13, s, s + 2]);
          }
        }
      }
      else{//rook, bishop, queen
        var mlen = moves.length;
        for(i=0;i<mlen;){     //goeth thru list of moves
          var m = moves[i++];
          e=s;
          do {
            e+=m;
            E=board[e];
            if(!E){
              movelist.push([weight + values[E] + weight_lut[e], s, e]);
            }
            else if((E&17)==other_colour){
              captures.push([weight + values[E] + weight_lut[e] + all_weights[E][e], s, e]);
            }
          }while(!E);
        }
      }
    }
    else{    //pawns
      e=s+dir;
      if(!board[e]){
        movelist.push([weight + weight_lut[e], s, e]);
        /* s * (120 - s) < 3200 true for outer two rows on either side.*/
        var e2 = e + dir;
        if(s * (120 - s) < 3200 && (!board[e2])){
            movelist.push([weight + weight_lut[e2], s, e2]);
        }
      }
      /* +/-1 for pawn capturing */
      E = board[--e];
      if(E && (E & 17) == other_colour){
        captures.push([weight + values[E] + weight_lut[e] + all_weights[E][e], s, e]);
      }
      e += 2;
      E = board[e];
      if(E && (E & 17) == other_colour){
        captures.push([weight + values[E] + weight_lut[e] + all_weights[E][e], s, e]);
      }
    }
  }
  if(ep){
    var pawn = P4_PAWN | colour;
    var taken;
    /* Some repetitive calculation here could be hoisted out, but that would
      probably slow things: the common case is no pawns waiting to capture
      enpassant, not 2.
     */
    s = ep - dir - 1;
    if (board[s] == pawn){
      taken = values[P4_PAWN] + all_weights[P4_PAWN | other_colour][ep - dir];
      captures.push([score - weight_lut[s] + weight_lut[ep] + taken, s, ep]);
    }
    s += 2;
    if (board[s] == pawn){
      taken = values[P4_PAWN] + all_weights[P4_PAWN | other_colour][ep - dir];
      captures.push([score - weight_lut[s] + weight_lut[ep] + taken, s, ep]);
    }
  }
  return captures.concat(movelist);
}

/*Explaining the bit tricks used in check_castling and check_check:
 *
 * in binary:    16 8 4 2 1
 *   empty
 *   pawn               1 c
 *   rook             1   c
 *   knight           1 1 c
 *   bishop         1     c
 *   king           1   1 c
 *   queen          1 1   c
 *   wall         1
 *
 * so:
 *
 * piece & (16 | 4 | 2 | 1) is:
 *  2 + c  for kings and pawns
 *  4 + c  for rooks and queens
 *  6 + c  for knights
 *  0 + c  for bishops
 * 16      for walls
 *
 * thus:
 * ((piece & 23) == 4 | colour) separates the rooks and queens out
 * from the rest.
 * ((piece & 27) == 8 | colour) does the same for queens and bishops.
 */

/* check_castling
 *
 * s - "start" location (either king home square, or king destination)
 *     the checks are done left to right.
 * * dir - direction of travel (White: 10, Black: -10)
 * side: -1 means Q side; 1, K side
 */

function p4_check_castling(board, s, colour, dir, side){
  var e;
  var E;
  var m, p;
  var knight = colour + P4_KNIGHT;
  var diag_slider = P4_BISHOP | colour;
  var diag_mask = 27;
  var grid_slider = P4_ROOK | colour;
  var king_pawn = 2 | colour;
  var grid_mask = 23;

  /* go through 3 positions, checking for check in each
   */
  for(p = s; p < s + 3; p++){
    //bishops, rooks, queens
    e = p;
    do{
      e += dir;
      E=board[e];
    } while (! E);
    if((E & grid_mask) == grid_slider)
      return 0;
    e = p;
    var delta = dir - 1;
    do{
      e += delta;
      E=board[e];
    } while (! E);
    if((E & diag_mask) == diag_slider)
      return 0;
    e = p;
    delta += 2;
    do{
      e += delta;
      E=board[e];
    } while (! E);
    if((E & diag_mask) == diag_slider)
      return 0;
    /*knights on row 7. (row 6 is handled below)*/
    if (board[p + dir - 2] == knight ||
        board[p + dir + 2] == knight)
        return 0;
  }

  /* a pawn or king in any of 5 positions on row 7.
   * or a knight on row 6. */
  for(p = s + dir - 1; p < s + dir + 4; p++){
    E = board[p] & grid_mask;
    if(E == king_pawn || board[p + dir] == knight)
        return 0;
  }
  /* scan back row for rooks, queens on the other side.
   * Same side check is impossible, because the castling rook is there
   */
  e = (side < 0) ? s + 2 : s;
  do {
    e -= side;
    E=board[e];
  } while (! E);
  if((E & grid_mask) == grid_slider)
    return 0;

  return 1;
}

function p4_check_check(state, colour){
  var board = state.board;
  /*find the king.  The pieces list updates from the end,
   * so the last-most king is correctly placed.*/
  var pieces = state.pieces[colour];
  var p;
  var i = pieces.length;
  do {
    p = pieces[--i];
  } while (p[0] != (P4_KING | colour));
  var s = p[1];
  var other_colour = 1 - colour;
  var dir = 10 - 20 * colour;
  if (board[s + dir - 1] == (P4_PAWN | other_colour) ||
      board[s + dir + 1] == (P4_PAWN | other_colour))
      return true;
  var knight_moves = P4_MOVES[P4_KNIGHT];
  var king_moves = P4_MOVES[P4_KING];
  var knight = P4_KNIGHT | other_colour;
  var king = P4_KING | other_colour;
  for (i = 0; i < 8; i++){
    if (board[s + knight_moves[i]] == knight ||
        board[s + king_moves[i]] == king)
        return true;
  }
  var diagonal_moves = P4_MOVES[P4_BISHOP];
  var grid_moves = P4_MOVES[P4_ROOK];

  /* diag_mask ignores rook moves of queens,
   * grid_mask ignores the bishop moves*/
  var diag_slider = P4_BISHOP | other_colour;
  var diag_mask = 27;
  var grid_slider = P4_ROOK | other_colour;
  var grid_mask = 23;
  for (i = 0; i < 4; i++){
    var m = diagonal_moves[i];
    var e = s;
    var E;
    do {
      e += m;
      E = board[e];
    } while (!E);
    if((E & diag_mask) == diag_slider)
      return true;

    m = grid_moves[i];
    e = s;
    do {
      e += m;
      E = board[e];
    } while (!E);
    if((E & grid_mask) == grid_slider)
      return true;
  }
  return false;
}

function p4_optimise_piece_list(state){
  var i, p, s, e;
  var movelists = [
    p4_parse(state, 0, 0, 0),
    p4_parse(state, 1, 0, 0)
  ];
  var weights = state.weights;
  var board = state.board;
  for (var colour = 0; colour < 2; colour++){
    var our_values = state.values[colour];
    var pieces = state.pieces[colour];
    var movelist = movelists[colour];
    var threats = movelists[1 - colour];
    /* sparse array to index by score. */
    var scores = [];
    for (i = 0; i < pieces.length; i++){
      p = pieces[i];
      scores[p[1]] = {
        score: 0,
        piece: p[0],
        pos: p[1],
        threatened: 0
      };
    }
    /* Find the best score for each piece by pure static weights,
     * ignoring captures, which have their own path to the top. */
    for(i = movelist.length - 1; i >= 0; i--){
      var mv = movelist[i];
      var score = mv[0];
      s = mv[1];
      e = mv[2];
      if(! board[e]){
        var x = scores[s];
        x.score = Math.max(x.score, score);
      }
    }
    /* moving out of a threat is worth considering, especially
     * if it is a pawn and you are not.*/
    for(i = threats.length - 1; i >= 0; i--){
      var mv = threats[i];
      var x = scores[mv[2]];
      if (x !== undefined){
        var S = board[mv[1]];
        var r = (1 + x.piece > 3 + S < 4) * 0.01;
        if (x.threatened < r)
          x.threatened = r;
      }
    }
    var pieces2 = [];
    for (i = 20; i < 100; i++){
      p = scores[i];
      if (p !== undefined){
        p.score += p.threatened * our_values[p.piece];
        pieces2.push(p);
      }
    }
    pieces2.sort(function(a, b){return a.score - b.score;});
    for (i = 0; i < pieces2.length; i++){
      p = pieces2[i];
      pieces[i] = [p.piece, p.pos];
    }
  }
}

function p4_findmove(state, level, colour, ep){
  p4_prepare(state);
  p4_optimise_piece_list(state);
  var board = state.board;
  if (arguments.length == 2){
    colour = state.to_play;
    ep = state.enpassant;
  }
  var movelist = p4_parse(state, colour, ep, 0);
  var alpha = P4_MIN_SCORE;
  var mv, t, i;
  var bs = 0;
  var be = 0;

  if (level <= 0){
    for (i = 0; i < movelist.length; i++){
      mv = movelist[i];
      if(movelist[i][0] > alpha){
        alpha = mv[0];
        bs = mv[1];
        be = mv[2];
      }
    }
    return [bs, be, alpha];
  }

  for(i = 0; i < movelist.length; i++){
    mv = movelist[i];
    var mscore = mv[0];
    var ms = mv[1];
    var me = mv[2];
    if (mscore > P4_WIN){
      p4_log("XXX taking king! it should never come to this");
      alpha = P4_KING_VALUE;
      bs = ms;
      be = me;
      break;
    }
    t = -state.treeclimber(state, level - 1, 1 - colour, mscore, ms, me,
                           P4_MIN_SCORE, -alpha);
    if (t > alpha){
      alpha = t;
      bs = ms;
      be = me;
    }
  }
  if (alpha < -P4_WIN_NOW && ! p4_check_check(state, colour)){
    alpha = state.stalemate_scores[colour];
  }
  return [bs, be, alpha];
}

/*p4_make_move changes the state and returns an object containing
 * everything necesary to undo the change.
 *
 * p4_unmake_move uses the p4_make_move return value to restore the
 * previous state.
 */

function p4_make_move(state, s, e, promotion){
  var board = state.board;
  var S = board[s];
  var E = board[e];
  board[e] = S;
  board[s] = 0;
  var piece = S & 14;
  var moved_colour = S & 1;
  var end_piece = S; /* can differ from S in queening*/
  //now some stuff to handle queening, castling
  var rs = 0, re, rook;
  var ep_taken = 0, ep_position;
  var ep = 0;
  if(piece == P4_PAWN){
    if((60 - e) * (60 - e) > 900){
      /*got to end; replace the pawn on board and in pieces cache.*/
      promotion |= moved_colour;
      board[e] = promotion;
      end_piece = promotion;
    }
    else if (((s ^ e) & 1) && E == 0){
      /*this is a diagonal move, but the end spot is empty, so we surmise enpassant */
      ep_position = e - 10 + 20 * moved_colour;
      ep_taken = board[ep_position];
      board[ep_position] = 0;
    }
    else if ((s - e) * (s - e) == 400){
      /*delta is 20 --> two row jump at start*/
      ep = (s + e) >> 1;
    }
  }
  else if (piece == P4_KING && ((s - e) * (s - e) == 4)){  //castling - move rook too
    rs = s - 4 + (s < e) * 7;
    re = (s + e) >> 1; //avg of s,e=rook's spot
    rook = moved_colour + P4_ROOK;
    board[rs] = 0;
    board[re] = rook;
    //piece_locations.push([rook, re]);
  }

  var old_castle_state = state.castles;
  if (old_castle_state){
    var mask = 0;
    var shift = moved_colour * 2;
    var side = moved_colour * 70;
    var s2 = s - side;
    var e2 = e + side;
    //wipe both our sides if king moves
    if (s2 == 25)
      mask |= 3 << shift;
    //wipe one side on any move from rook points
    else if (s2 == 21)
      mask |= 1 << shift;
    else if (s2 == 28)
      mask |= 2 << shift;
    //or on any move *to* opposition corners
    if (e2 == 91)
      mask |= 4 >> shift;
    else if (e2 == 98)
      mask |= 8 >> shift;
    state.castles &= ~mask;
  }

  var old_pieces = state.pieces.concat();
  var our_pieces = old_pieces[moved_colour];
  var dest = state.pieces[moved_colour] = [];
  for (var i = 0; i < our_pieces.length; i++){
    var x = our_pieces[i];
    var pp = x[0];
    var ps = x[1];
    if (ps != s && ps != rs){
      dest.push(x);
    }
  }
  dest.push([end_piece, e]);
  if (rook)
    dest.push([rook, re]);

  if (E || ep_taken){
    var their_pieces = old_pieces[1 - moved_colour];
    dest = state.pieces[1 - moved_colour] = [];
    var gone = ep_taken ? ep_position : e;
    for (i = 0; i < their_pieces.length; i++){
      var x = their_pieces[i];
      if (x[1] != gone){
        dest.push(x);
      }
    }
  }

  return {
    /*some of these (e.g. rook) could be recalculated during
     * unmake, possibly more cheaply. */
    s: s,
    e: e,
    S: S,
    E: E,
    ep: ep,
    castles: old_castle_state,
    rs: rs,
    re: re,
    rook: rook,
    ep_position: ep_position,
    ep_taken: ep_taken,
    pieces: old_pieces
  };
}

function p4_unmake_move(state, move){
  var board = state.board;
  if (move.ep_position){
    board[move.ep_position] = move.ep_taken;
  }
  board[move.s] = move.S;
  board[move.e] = move.E;
  //move.piece_locations.length--;
  if(move.rs){
    board[move.rs] = move.rook;
    board[move.re] = 0;
    //move.piece_locations.length--;
  }
  state.pieces = move.pieces;
  state.castles = move.castles;
}


function p4_insufficient_material(state){
  var knights = false;
  var bishops = undefined;
  var i;
  var board = state.board;
  for(i = 20; i  < 100; i++){
    var piece = board[i] & 14;
    if(piece == 0 || piece == P4_KING){
        continue;
    }
    if (piece == P4_KNIGHT){
      /* only allow one knight of either colour, never with a bishop */
      if (knights || bishops !== undefined){
        return false;
      }
      knights = true;
    }
    else if (piece == P4_BISHOP){
      /*any number of bishops, but on only one colour square */
      var x = i & 1;
      var y = parseInt(i / 10) & 1;
      var parity = x ^ y;
      if (knights){
        return false;
      }
      else if (bishops === undefined){
        bishops = parity;
      }
      else if (bishops != parity){
        return false;
      }
    }
    else {
       return false;
    }
  }
  return true;
}

/* p4_move(state, s, e, promotion)
 * s, e are start and end positions
 *
 * promotion is the desired pawn promotion if the move gets a pawn to the other
 * end.
 *
 * return value contains bitwise flags
*/

exports.FLAG_OK = P4_MOVE_FLAG_OK = 1;
exports.FLAG_CHECK = P4_MOVE_FLAG_CHECK = 2;
exports.FLAG_MATE = P4_MOVE_FLAG_MATE = 4;
exports.FLAG_CAPTURE = P4_MOVE_FLAG_CAPTURE = 8;
exports.FLAG_CASTLE_KING = P4_MOVE_FLAG_CASTLE_KING = 16;
exports.FLAG_CASTLE_QUEEN = P4_MOVE_FLAG_CASTLE_QUEEN = 32;
exports.FLAG_DRAW = P4_MOVE_FLAG_DRAW = 64;

var P4_MOVE_ILLEGAL = 0;
var P4_MOVE_MISSED_MATE = P4_MOVE_FLAG_CHECK | P4_MOVE_FLAG_MATE;
var P4_MOVE_CHECKMATE = P4_MOVE_FLAG_OK | P4_MOVE_FLAG_CHECK | P4_MOVE_FLAG_MATE;
var P4_MOVE_STALEMATE = P4_MOVE_FLAG_OK | P4_MOVE_FLAG_MATE;

function p4_move(state, s, e, promotion){
  var board = state.board;
  var colour = state.to_play;
  var other_colour = 1 - colour;
  if (s != parseInt(s)){
    if (e === undefined){
      var mv = p4_interpret_movestring(state, s);
      s = mv[0];
      e = mv[1];
      if (s == 0)
        return {flags: P4_MOVE_ILLEGAL, ok: false};
      promotion = mv[2];
    }
    else {/*assume two point strings: 'e2', 'e4'*/
      s = p4_destringify_point(s);
      e = p4_destringify_point(e);
    }
  }
  if (promotion === undefined)
    promotion = P4_QUEEN;
  var E=board[e];
  var S=board[s];

  /*See if this move is even slightly legal, disregarding check.
   */
  var i;
  var legal = false;
  p4_maybe_prepare(state);
  var moves = p4_parse(state, colour, state.enpassant, 0);
  for (i = 0; i < moves.length; i++){
    if (e == moves[i][2] && s == moves[i][1]){
      legal = true;
      break;
    }
  }
  if (! legal) {
    return {flags: P4_MOVE_ILLEGAL, ok: false};
  }

  /*Try the move, and see what the response is.*/
  var changes = p4_make_move(state, s, e, promotion);

  /*is it check? */
  if (p4_check_check(state, colour)){
    p4_unmake_move(state, changes);
    p4_log('in check', changes);
    return {flags: P4_MOVE_ILLEGAL, ok: false, string: "in check!"};
  }
  /*The move is known to be legal. We won't be undoing it.*/

  var flags = P4_MOVE_FLAG_OK;

  state.enpassant = changes.ep;
  state.history.push([s, e, promotion]);

  /*draw timeout: 50 moves without pawn move or capture is a draw */
  if (changes.E || changes.ep_position){
    state.draw_timeout = 0;
    flags |= P4_MOVE_FLAG_CAPTURE;
  }
  else if ((S & 14) == P4_PAWN){
    state.draw_timeout = 0;
  }
  else{
    state.draw_timeout++;
  }
  if (changes.rs){
    flags |= (s > e) ? P4_MOVE_FLAG_CASTLE_QUEEN : P4_MOVE_FLAG_CASTLE_KING;
  }
  var shortfen = p4_state2fen(state, true);
  var repetitions = (state.position_counts[shortfen] || 0) + 1;
  state.position_counts[shortfen] = repetitions;
  state.current_repetitions = repetitions;
  if (state.draw_timeout > 100 || repetitions >= 3 ||
    p4_insufficient_material(state)){
    flags |= P4_MOVE_FLAG_DRAW;
  }
  state.moveno++;
  state.to_play = other_colour;

  if (p4_check_check(state, other_colour)){
    flags |= P4_MOVE_FLAG_CHECK;
  }
  /* check for (stale|check)mate, by seeing if there is a move for
   * the other side that doesn't result in check. (In other words,
   * reduce the pseudo-legal-move list down to a legal-move list,
   * and check it isn't empty).
   *
   * We don't need to p4_prepare because other colour pieces can't
   * have moved (just disappeared) since previous call. Also,
   * setting the promotion piece is unnecessary, because all
   * promotions block check equally well.
  */
  var is_mate = true;
  var replies = p4_parse(state, other_colour, changes.ep, 0);
  for (i = 0; i < replies.length; i++){
    var m = replies[i];
    var change2 = p4_make_move(state, m[1], m[2], P4_QUEEN);
    var check = p4_check_check(state, other_colour);
    p4_unmake_move(state, change2);
    if (!check){
      is_mate = false;
      break;
    }
  }
  if (is_mate)
    flags |= P4_MOVE_FLAG_MATE;

  var movestring = p4_move2string(state, s, e, S, promotion, flags, moves);
  p4_log("successful move", s, e, movestring, flags);
  state.prepared = false;
  return {
    flags: flags,
    string: movestring,
    ok: true
  };
}

function p4_move2string(state, s, e, S, promotion, flags, moves){
  var piece = S & 14;
  var src, dest;
  var mv, i;
  var capture = flags & P4_MOVE_FLAG_CAPTURE;

  src = p4_stringify_point(s);
  dest = p4_stringify_point(e);
  if (piece == P4_PAWN){
    if (capture){
      mv = src.charAt(0) + 'x' + dest;
    }
    else
      mv = dest;
    if (e > 90 || e < 30){  //end row, queening
      if (promotion === undefined)
        promotion = P4_QUEEN;
      mv += '=' + P4_ENCODE_LUT.charAt(promotion);
    }
  }
  else if (piece == P4_KING && (s-e) * (s-e) == 4) {
    if (e < s)
      mv = 'O-O-O';
    else
      mv = 'O-O';
  }
  else {
    var row_qualifier = '';
    var col_qualifier = '';
    var pstr = P4_ENCODE_LUT.charAt(S);
    var sx = s % 10;
    var sy = parseInt(s / 10);

    /* find any other pseudo-legal moves that would put the same
     * piece in the same place, for which we'd need
     * disambiguation. */
    var co_landers = [];
    for (i = 0; i < moves.length; i++){
      var m = moves[i];
      if (e == m[2] && s != m[1] && state.board[m[1]] == S){
        co_landers.push(m[1]);
      }
    }
    if (co_landers.length){
      for (i = 0; i < co_landers.length; i++){
        var c = co_landers[i];
        var cx = c % 10;
        var cy = parseInt(c / 10);
        if (cx == sx)/*same column, so qualify by row*/
          row_qualifier = src.charAt(1);
        if (cy == sy)
          col_qualifier = src.charAt(0);
      }
      if (row_qualifier == '' && col_qualifier == ''){
        /*no co-landers on the same rank or file, so one or the other will do.
         * By convention, use the column (a-h) */
        col_qualifier = src.charAt(0);
      }
    }
    mv = pstr + col_qualifier + row_qualifier + (capture ? 'x' : '') + dest;
  }
  if (flags & P4_MOVE_FLAG_CHECK){
    if (flags & P4_MOVE_FLAG_MATE)
      mv += '#';
    else
      mv += '+';
  }
  else if (flags & P4_MOVE_FLAG_MATE)
    mv += ' stalemate';
  return mv;
}

function p4_jump_to_moveno(state, moveno){
  p4_log('jumping to move', moveno);
  if (moveno === undefined || moveno > state.moveno)
    moveno = state.moveno;
  else if (moveno < 0){
    moveno = state.moveno + moveno;
  }
  var state2 = p4_fen2state(state.beginning);
  var i = 0;
  while (state2.moveno < moveno){
    var m = state.history[i++];
    p4_move(state2, m[0], m[1], m[2]);
  }
  /* copy the replayed state across, not all that deeply, but
   * enough to cover, eg, held references to board. */
  var attr, dest;
  for (attr in state2){
    var src = state2[attr];
    if (attr instanceof Array){
      dest = state[attr];
      dest.length = 0;
      for (i = 0; i < src.length; i++){
        dest[i] = src[i];
      }
    }
    else {
      state[attr] = src;
    }
  }
  state.prepared = false;
}


/* write a standard FEN notation
 * http://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation
 * */
function p4_state2fen(state, reduced) {
  var piece_lut = '  PpRrNnBbKkQq';
  var board = state.board;
  var fen = '';
  //fen does Y axis backwards, X axis forwards */
  for (var y = 9; y > 1; y--){
    var count = 0;
    for (var x = 1; x < 9; x++){
      var piece = board[y * 10 + x];
      if (piece == 0)
        count++;
      else{
        if (count)
            fen += count.toString();
        fen += piece_lut.charAt(piece);
        count = 0;
      }
    }
    if (count)
      fen += count;
    if (y > 2)
      fen += '/';
  }
  /*white or black */
  fen += ' ' + 'wb'.charAt(state.to_play) + ' ';
  /*castling */
  if (state.castles){
    var lut = [2, 'K', 1, 'Q', 8, 'k', 4, 'q'];
    for (var i = 0; i < 8; i += 2){
      if (state.castles & lut[i]){
        fen += lut[i + 1];
      }
    }
  }
  else
    fen += '-';
  /*enpassant */
  if (state.enpassant !== 0){
    fen += ' ' + p4_stringify_point(state.enpassant);
  }
  else
      fen += ' -';
  if (reduced){
    /*if the 'reduced' flag is set, the move number and draw
     *timeout are not added. This form is used to detect draws by
     *3-fold repetition.*/
    return fen;
  }
  fen += ' ' + state.draw_timeout + ' ';
  fen += (state.moveno >> 1) + 1;
  return fen;
}
exports.tofen = p4_state2fen;

function p4_stringify_point(p){
  var letters = " abcdefgh";
  var x = p % 10;
  var y = (p - x) / 10 - 1;
  return letters.charAt(x) + y;
}

function p4_destringify_point(p){
  var x = parseInt(p.charAt(0), 19) - 9; //a-h <-> 10-18, base 19
  var y = parseInt(p.charAt(1)) + 1;
  if (y >= 2 && y < 10 && x >= 1 && x < 9)
    return y * 10 + x;
  return undefined;
}

/* read a standard FEN notation
 * http://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation
 * */
function p4_fen2state(fen, state){
  if (state === undefined)
      state = p4_initialise_state();
  var board = state.board;
  var fenbits = fen.split(' ');
  var fen_board = fenbits[0];
  var fen_toplay = fenbits[1];
  var fen_castles = fenbits[2];
  var fen_enpassant = fenbits[3];
  var fen_timeout = fenbits[4];
  var fen_moveno = fenbits[5];
  if (fen_timeout === undefined)
      fen_timeout = 0;
  //fen does Y axis backwards, X axis forwards */
  var y = 90;
  var x = 1;
  var i;
  for (var j = 0; j < fen_board.length; j++){
    var c = fen_board.charAt(j);
    if (c == '/'){
      x = 1;
      y -= 10;
      if (y < 20)
          break;
      continue;
    }
    var piece = P4_PIECE_LUT[c];
    if (piece && x < 9){
      board[y + x] = piece;
      x++;
    }
    else {
      var end = Math.min(x + parseInt(c), 9);
      for (; x < end; x++){
          board[y + x] = 0;
      }
    }
  }
  state.to_play = (fen_toplay.toLowerCase() == 'b') ? 1 : 0;
  state.castles = 0;
  for (i = 0; i < fen_castles.length; i++){
      var bit = {k: 8, q: 4, K: 2, Q: 1}[fen_castles.charAt(i)];
      state.castles |= (bit || 0);
  }
  state.enpassant = (fen_enpassant != '-') ? p4_destringify_point(fen_enpassant) : 0;
  state.draw_timeout = parseInt(fen_timeout);
  if (fen_moveno === undefined){
      /*have a guess based on entropy and pieces remaining*/
      var pieces = 0;
      var mix = 0;
      var p, q, r;
      for (y = 20; y < 100; y+=10){
          for (x = 1; x < 9; x++){
              p = board[y + x] & 15;
              pieces += (!!p);
              if (x < 8){
                  q = board[y + x + 1];
                  mix += (!q) != (!p);
              }
              if (y < 90){
                  q = board[y + x + 10];
                  mix += (!q) != (!p);
              }
          }
      }
      fen_moveno = Math.max(1, parseInt((32 - pieces) * 1.3 + (4 - fen_castles.length) * 1.5 + ((mix - 16) / 5)));
      //p4_log("pieces", pieces, "mix", mix, "estimate", fen_moveno);
  }
  state.moveno = 2 * (parseInt(fen_moveno) - 1) + state.to_play;
  state.history = [];
  state.beginning = fen;
  state.prepared = false;
  state.position_counts = {};
  /* Wrap external functions as methods. */
  state.move = function(s, e, promotion){
      return p4_move(this, s, e, promotion);
  };
  state.findmove = function(level){
      return p4_findmove(this, level);
  };
  state.jump_to_moveno = function(moveno){
      return p4_jump_to_moveno(this, moveno);
  };
  return state;
}

/*
Weights would all fit within an Int8Array *except* for the last row
for pawns, which is close to the queen value (180, max is 127).

Int8Array seems slightly quicker in Chromium 18, no different in
Firefox 12.

Int16Array is no faster, perhaps slower than Int32Array.

Int32Array is marginally slower than plain arrays with Firefox 12, but
significantly quicker with Chromium.
 */

var P4_ZEROS = [];
function p4_zero_array(){
  if (P4_USE_TYPED_ARRAYS)
    return new Int32Array(120);
  if (P4_ZEROS.length == 0){
    for(var i = 0; i < 120; i++){
      P4_ZEROS[i] = 0;
    }
  }
  return P4_ZEROS.slice();
}

/* p4_initialise_state() creates the board and initialises weight
 * arrays etc.  Some of this is really only needs to be done once.
 */

function p4_initialise_state(){
  var board = p4_zero_array();
  P4_CENTRALISING_WEIGHTS = p4_zero_array();
  P4_BASE_PAWN_WEIGHTS = p4_zero_array();
  P4_KNIGHT_WEIGHTS = p4_zero_array();
  for(var i = 0; i < 120; i++){
    var y = parseInt(i / 10);
    var x = i % 10;
    var dx = Math.abs(x - 4.5);
    var dy = Math.abs(y - 5.5);
    P4_CENTRALISING_WEIGHTS[i] = parseInt(6 - Math.pow((dx * dx + dy * dy) * 1.5, 0.6));
     //knights have a flat topped centre (bishops too, but less so).
    P4_KNIGHT_WEIGHTS[i] = parseInt(((dx < 2) + (dy < 2) * 1.5)
                                    + (dx < 3) + (dy < 3)) - 2;
    P4_BASE_PAWN_WEIGHTS[i] = parseInt('000012347000'.charAt(y));
    if (y > 9 || y < 2 || x < 1 || x > 8)
      board[i] = 16;
  }
  var weights = [];
  for (i = 0; i < 14; i++){
    weights[i] = p4_zero_array();
  }
  var state = {
    board: board,
    weights: weights,
    history: [],
    treeclimber: p4_alphabeta_treeclimber
  };
  p4_random_seed(state, P4_DEBUG ? 1 : Date.now());
  return state;
}

exports.new_game = function p4_new_game (standard, board) {
  if (standard === true) { board = P4_INITIAL_BOARD; }
  else if (board === undefined) { board = chess960(); }
  return p4_fen2state(board);
}

/*convert an arbitrary movestring into a pair of integers offsets into
 * the board. The string might be in any of these forms:
 *
 *  "d2-d4" "d2d4" "d4" -- moving a pawn
 *
 *  "b1-c3" "b1c3" "Nc3" "N1c3" "Nbc3" "Nb1c3" -- moving a knight
 *
 *  "b1xc3" "b1xc3" "Nxc3" -- moving a knight, also happens to capture.
 *
 *  "O-O" "O-O-O" -- special cases for castling ("e1-c1", etc, also work)
 *
 *  Note that for the "Nc3" (pgn) format, some knowledge of the board
 *  is necessary, so the state parameter is required. If it is
 *  undefined, the other forms will still work.
 */

function p4_interpret_movestring(state, str){
  /* Ignore any irrelevant characters, then tokenise.
   *
   */
  var FAIL = [0, 0];
  var algebraic_re = /^\s*([RNBQK]?[a-h]?[1-8]?)[ :x-]*([a-h][1-8]?)(=[RNBQ])?[!?+#e.p]*\s*$/;
  var castle_re = /^\s*([O0o]-[O0o](-[O0o])?)\s*$/;
  var position_re = /^[a-h][1-8]$/;

  var m = algebraic_re.exec(str);
  if (m == null){
    /*check for castling notation (O-O, O-O-O) */
    m = castle_re.exec(str);
    if ((m = castle_re.exec(str)) ||
        (m = castle_re.exec(str.substring(0, str.length-1)))) {
          s = 25 + state.to_play * 70;
          if (m[2])/*queenside*/
            e = s - 2;
          else
            e = s + 2;
    }
    else
      return FAIL;
  }
  var src = m[1];
  var dest = m[2];
  var queen = m[3];
  var s, e, q;
  var moves, i;
  if (src == '' || src == undefined){
      /* a single coordinate pawn move */
      e = p4_destringify_point(dest);
      s = p4_find_source_point(state, e, 'P' + dest.charAt(0));
  }
  else if (/^[RNBQK]/.test(src)){
      /*pgn format*/
      e = p4_destringify_point(dest);
      s = p4_find_source_point(state, e, src);
  }
  else if (position_re.test(src) && position_re.test(dest)){
      s = p4_destringify_point(src);
      e = p4_destringify_point(dest);
  }
  else if (/^[a-h]$/.test(src)){
      e = p4_destringify_point(dest);
      s = p4_find_source_point(state, e, 'P' + src);
  }
  if (s == 0)
      return FAIL;

  if (queen){
      /* the chosen queen piece */
      q = P4_PIECE_LUT[queen.charAt(1)];
  }
  return [s, e, q];
}
exports.interpret = p4_interpret_movestring;

function p4_find_source_point(state, e, str){
  var colour = state.to_play;
  var piece = P4_PIECE_LUT[str.charAt(0)];
  piece |= colour;
  var s, i;

  var row, column;
  /* can be specified as Na, Na3, N3, and who knows, N3a? */
  for (i = 1; i < str.length; i++){
    var c = str.charAt(i);
    if (/[a-h]/.test(c)){
      column = str.charCodeAt(i) - 96;
    }
    else if (/[1-8]/.test(c)){
      /*row goes 2 - 9 */
      row = 1 + parseInt(c);
    }
  }
  var possibilities = [];
  p4_prepare(state);
  var moves = p4_parse(state, colour, state.enpassant, 0);
  for (i = 0; i < moves.length; i++){
    var mv = moves[i];
    if (e == mv[2]){
      s = mv[1];
      if (state.board[s] == piece &&
        (column === undefined || column == s % 10) &&
        (row === undefined || row == parseInt(s / 10))
      ){
        var change = p4_make_move(state, s, e, P4_QUEEN);
        if (! p4_check_check(state, colour))
          possibilities.push(s);
        p4_unmake_move(state, change);
      }
    }
  }
  p4_log("finding", str, "that goes to", e, "got", possibilities);

  if (possibilities.length == 0){
      return 0;
  }
  else if (possibilities.length > 1){
      p4_log("p4_find_source_point seems to have failed",
             state, e, str,
             possibilities);
  }
  return possibilities[0];
}


/*random number generator based on
 * http://burtleburtle.net/bob/rand/smallprng.html
 */
function p4_random_seed(state, seed){
  seed &= 0xffffffff;
  state.rng = (P4_USE_TYPED_ARRAYS) ? new Uint32Array(4) : [];
  state.rng[0] = 0xf1ea5eed;
  state.rng[1] = seed;
  state.rng[2] = seed;
  state.rng[3] = seed;
  for (var i = 0; i < 20; i++)
    p4_random31(state);
}

function p4_random31(state){
  var rng = state.rng;
  var b = rng[1];
  var c = rng[2];
  /* These shifts amount to rotates.
   * Note the three-fold right shift '>>>', meaning an unsigned shift.
   * The 0xffffffff masks are needed to keep javascript to 32bit. (supposing
   * untyped arrays).
   */
  var e = rng[0] - ((b << 27) | (b >>> 5));
  rng[0] = b ^ ((c << 17) | (c >>> 15));
  rng[1] = (c + rng[3]) & 0xffffffff;
  rng[2] = (rng[3] + e) & 0xffffffff;
  rng[3] = (e + rng[0]) & 0xffffffff;
  return rng[3] & 0x7fffffff;
}

function p4_random_int(state, top){
  /* uniform integer in range [0 < n < top), supposing top < 2 ** 31
   *
   * This method is slightly (probably pointlessly) more accurate
   * than converting to 0-1 float, multiplying and truncating, and
   * considerably more accurate than a simple modulus.
   * Obviously it is a bit slower.
   */
  /* mask becomes one less than the next highest power of 2 */
  var mask = top;
  mask--;
  mask |= mask >>> 1;
  mask |= mask >>> 2;
  mask |= mask >>> 4;
  mask |= mask >>> 8;
  mask |= mask >>> 16;
  var r;
  do {
    r = p4_random31(state) & mask;
  } while (r >= top);
  return r;
}



function chess960() {

  var aKnight = "N";
  var aBishop = "B";
  var aRook   = "R";
  var aQueen  = "Q";
  var aKing   = "K";

  var sLetter = "01234567";
  var nPlace;
  var sPlace = '';

  var sPiece = new Array("X","X","X","X","X","X","X","X");

  var aPlace = new Array("0246", "1357");
  for (var i=0; i<2; i++)
  {
    nPlace = Math.floor(Math.random() * 4);
    sPlace = aPlace[i].substring(nPlace, nPlace + 1);
    sPiece[sPlace] = aBishop;
    nPlace = sLetter.indexOf(sPlace);
    sLetter = sLetter.substring(0,nPlace) + sLetter.substring(nPlace+1, sLetter.length);
  }

  var aPiece = new Array(aQueen, aKnight, aKnight);
  for (var i=0; i<3; i++)
  {
    nPlace = Math.floor(Math.random() * (6 - i));
    sPlace = sLetter.substring(nPlace, nPlace + 1);
    sPiece[sPlace] = aPiece[i];
    sLetter = sLetter.substring(0,nPlace) + sLetter.substring(nPlace+1, sLetter.length);
  }

  aPiece = new Array(aRook, aKing, aRook);
  for (var i=0; i<3; i++)
  {
    sPiece[sLetter.substring(i, i+1)] = aPiece[i];
  }

  var sp="";
  for (var i=0; i<8; i++)
  {
    sp=sp.concat(sPiece[i]);
  }

  return sp.toLowerCase() + "/pppppppp/8/8/8/8/PPPPPPPP/" + sp + " w KQkq - 1 1";

}

function chess960_switch (cvt) {
  var sp;

  switch (cvt.toUpperCase()) {
    case "000" : sp = "BBQNNRKR"; break;
    case "001" : sp = "BQNBNRKR"; break;
    case "002" : sp = "BQNNRBKR"; break;
    case "003" : sp = "BQNNRKRB"; break;
    case "004" : sp = "QBBNNRKR"; break;
    case "005" : sp = "QNBBNRKR"; break;
    case "006" : sp = "QNBNRBKR"; break;
    case "007" : sp = "QNBNRKRB"; break;
    case "008" : sp = "QBNNBRKR"; break;
    case "009" : sp = "QNNBBRKR"; break;
    case "010" : sp = "QNNRBBKR"; break;
    case "011" : sp = "QNNRBKRB"; break;
    case "012" : sp = "QBNNRKBR"; break;
    case "013" : sp = "QNNBRKBR"; break;
    case "014" : sp = "QNNRKBBR"; break;
    case "015" : sp = "QNNRKRBB"; break;
    case "016" : sp = "BBNQNRKR"; break;
    case "017" : sp = "BNQBNRKR"; break;
    case "018" : sp = "BNQNRBKR"; break;
    case "019" : sp = "BNQNRKRB"; break;
    case "020" : sp = "NBBQNRKR"; break;
    case "021" : sp = "NQBBNRKR"; break;
    case "022" : sp = "NQBNRBKR"; break;
    case "023" : sp = "NQBNRKRB"; break;
    case "024" : sp = "NBQNBRKR"; break;
    case "025" : sp = "NQNBBRKR"; break;
    case "026" : sp = "NQNRBBKR"; break;
    case "027" : sp = "NQNRBKRB"; break;
    case "028" : sp = "NBQNRKBR"; break;
    case "029" : sp = "NQNBRKBR"; break;
    case "030" : sp = "NQNRKBBR"; break;
    case "031" : sp = "NQNRKRBB"; break;
    case "032" : sp = "BBNNQRKR"; break;
    case "033" : sp = "BNNBQRKR"; break;
    case "034" : sp = "BNNQRBKR"; break;
    case "035" : sp = "BNNQRKRB"; break;
    case "036" : sp = "NBBNQRKR"; break;
    case "037" : sp = "NNBBQRKR"; break;
    case "038" : sp = "NNBQRBKR"; break;
    case "039" : sp = "NNBQRKRB"; break;
    case "040" : sp = "NBNQBRKR"; break;
    case "041" : sp = "NNQBBRKR"; break;
    case "042" : sp = "NNQRBBKR"; break;
    case "043" : sp = "NNQRBKRB"; break;
    case "044" : sp = "NBNQRKBR"; break;
    case "045" : sp = "NNQBRKBR"; break;
    case "046" : sp = "NNQRKBBR"; break;
    case "047" : sp = "NNQRKRBB"; break;
    case "048" : sp = "BBNNRQKR"; break;
    case "049" : sp = "BNNBRQKR"; break;
    case "050" : sp = "BNNRQBKR"; break;
    case "051" : sp = "BNNRQKRB"; break;
    case "052" : sp = "NBBNRQKR"; break;
    case "053" : sp = "NNBBRQKR"; break;
    case "054" : sp = "NNBRQBKR"; break;
    case "055" : sp = "NNBRQKRB"; break;
    case "056" : sp = "NBNRBQKR"; break;
    case "057" : sp = "NNRBBQKR"; break;
    case "058" : sp = "NNRQBBKR"; break;
    case "059" : sp = "NNRQBKRB"; break;
    case "060" : sp = "NBNRQKBR"; break;
    case "061" : sp = "NNRBQKBR"; break;
    case "062" : sp = "NNRQKBBR"; break;
    case "063" : sp = "NNRQKRBB"; break;
    case "064" : sp = "BBNNRKQR"; break;
    case "065" : sp = "BNNBRKQR"; break;
    case "066" : sp = "BNNRKBQR"; break;
    case "067" : sp = "BNNRKQRB"; break;
    case "068" : sp = "NBBNRKQR"; break;
    case "069" : sp = "NNBBRKQR"; break;
    case "070" : sp = "NNBRKBQR"; break;
    case "071" : sp = "NNBRKQRB"; break;
    case "072" : sp = "NBNRBKQR"; break;
    case "073" : sp = "NNRBBKQR"; break;
    case "074" : sp = "NNRKBBQR"; break;
    case "075" : sp = "NNRKBQRB"; break;
    case "076" : sp = "NBNRKQBR"; break;
    case "077" : sp = "NNRBKQBR"; break;
    case "078" : sp = "NNRKQBBR"; break;
    case "079" : sp = "NNRKQRBB"; break;
    case "080" : sp = "BBNNRKRQ"; break;
    case "081" : sp = "BNNBRKRQ"; break;
    case "082" : sp = "BNNRKBRQ"; break;
    case "083" : sp = "BNNRKRQB"; break;
    case "084" : sp = "NBBNRKRQ"; break;
    case "085" : sp = "NNBBRKRQ"; break;
    case "086" : sp = "NNBRKBRQ"; break;
    case "087" : sp = "NNBRKRQB"; break;
    case "088" : sp = "NBNRBKRQ"; break;
    case "089" : sp = "NNRBBKRQ"; break;
    case "090" : sp = "NNRKBBRQ"; break;
    case "091" : sp = "NNRKBRQB"; break;
    case "092" : sp = "NBNRKRBQ"; break;
    case "093" : sp = "NNRBKRBQ"; break;
    case "094" : sp = "NNRKRBBQ"; break;
    case "095" : sp = "NNRKRQBB"; break;
    case "096" : sp = "BBQNRNKR"; break;
    case "097" : sp = "BQNBRNKR"; break;
    case "098" : sp = "BQNRNBKR"; break;
    case "099" : sp = "BQNRNKRB"; break;
    case "100" : sp = "QBBNRNKR"; break;
    case "101" : sp = "QNBBRNKR"; break;
    case "102" : sp = "QNBRNBKR"; break;
    case "103" : sp = "QNBRNKRB"; break;
    case "104" : sp = "QBNRBNKR"; break;
    case "105" : sp = "QNRBBNKR"; break;
    case "106" : sp = "QNRNBBKR"; break;
    case "107" : sp = "QNRNBKRB"; break;
    case "108" : sp = "QBNRNKBR"; break;
    case "109" : sp = "QNRBNKBR"; break;
    case "110" : sp = "QNRNKBBR"; break;
    case "111" : sp = "QNRNKRBB"; break;
    case "112" : sp = "BBNQRNKR"; break;
    case "113" : sp = "BNQBRNKR"; break;
    case "114" : sp = "BNQRNBKR"; break;
    case "115" : sp = "BNQRNKRB"; break;
    case "116" : sp = "NBBQRNKR"; break;
    case "117" : sp = "NQBBRNKR"; break;
    case "118" : sp = "NQBRNBKR"; break;
    case "119" : sp = "NQBRNKRB"; break;
    case "120" : sp = "NBQRBNKR"; break;
    case "121" : sp = "NQRBBNKR"; break;
    case "122" : sp = "NQRNBBKR"; break;
    case "123" : sp = "NQRNBKRB"; break;
    case "124" : sp = "NBQRNKBR"; break;
    case "125" : sp = "NQRBNKBR"; break;
    case "126" : sp = "NQRNKBBR"; break;
    case "127" : sp = "NQRNKRBB"; break;
    case "128" : sp = "BBNRQNKR"; break;
    case "129" : sp = "BNRBQNKR"; break;
    case "130" : sp = "BNRQNBKR"; break;
    case "131" : sp = "BNRQNKRB"; break;
    case "132" : sp = "NBBRQNKR"; break;
    case "133" : sp = "NRBBQNKR"; break;
    case "134" : sp = "NRBQNBKR"; break;
    case "135" : sp = "NRBQNKRB"; break;
    case "136" : sp = "NBRQBNKR"; break;
    case "137" : sp = "NRQBBNKR"; break;
    case "138" : sp = "NRQNBBKR"; break;
    case "139" : sp = "NRQNBKRB"; break;
    case "140" : sp = "NBRQNKBR"; break;
    case "141" : sp = "NRQBNKBR"; break;
    case "142" : sp = "NRQNKBBR"; break;
    case "143" : sp = "NRQNKRBB"; break;
    case "144" : sp = "BBNRNQKR"; break;
    case "145" : sp = "BNRBNQKR"; break;
    case "146" : sp = "BNRNQBKR"; break;
    case "147" : sp = "BNRNQKRB"; break;
    case "148" : sp = "NBBRNQKR"; break;
    case "149" : sp = "NRBBNQKR"; break;
    case "150" : sp = "NRBNQBKR"; break;
    case "151" : sp = "NRBNQKRB"; break;
    case "152" : sp = "NBRNBQKR"; break;
    case "153" : sp = "NRNBBQKR"; break;
    case "154" : sp = "NRNQBBKR"; break;
    case "155" : sp = "NRNQBKRB"; break;
    case "156" : sp = "NBRNQKBR"; break;
    case "157" : sp = "NRNBQKBR"; break;
    case "158" : sp = "NRNQKBBR"; break;
    case "159" : sp = "NRNQKRBB"; break;
    case "160" : sp = "BBNRNKQR"; break;
    case "161" : sp = "BNRBNKQR"; break;
    case "162" : sp = "BNRNKBQR"; break;
    case "163" : sp = "BNRNKQRB"; break;
    case "164" : sp = "NBBRNKQR"; break;
    case "165" : sp = "NRBBNKQR"; break;
    case "166" : sp = "NRBNKBQR"; break;
    case "167" : sp = "NRBNKQRB"; break;
    case "168" : sp = "NBRNBKQR"; break;
    case "169" : sp = "NRNBBKQR"; break;
    case "170" : sp = "NRNKBBQR"; break;
    case "171" : sp = "NRNKBQRB"; break;
    case "172" : sp = "NBRNKQBR"; break;
    case "173" : sp = "NRNBKQBR"; break;
    case "174" : sp = "NRNKQBBR"; break;
    case "175" : sp = "NRNKQRBB"; break;
    case "176" : sp = "BBNRNKRQ"; break;
    case "177" : sp = "BNRBNKRQ"; break;
    case "178" : sp = "BNRNKBRQ"; break;
    case "179" : sp = "BNRNKRQB"; break;
    case "180" : sp = "NBBRNKRQ"; break;
    case "181" : sp = "NRBBNKRQ"; break;
    case "182" : sp = "NRBNKBRQ"; break;
    case "183" : sp = "NRBNKRQB"; break;
    case "184" : sp = "NBRNBKRQ"; break;
    case "185" : sp = "NRNBBKRQ"; break;
    case "186" : sp = "NRNKBBRQ"; break;
    case "187" : sp = "NRNKBRQB"; break;
    case "188" : sp = "NBRNKRBQ"; break;
    case "189" : sp = "NRNBKRBQ"; break;
    case "190" : sp = "NRNKRBBQ"; break;
    case "191" : sp = "NRNKRQBB"; break;
    case "192" : sp = "BBQNRKNR"; break;
    case "193" : sp = "BQNBRKNR"; break;
    case "194" : sp = "BQNRKBNR"; break;
    case "195" : sp = "BQNRKNRB"; break;
    case "196" : sp = "QBBNRKNR"; break;
    case "197" : sp = "QNBBRKNR"; break;
    case "198" : sp = "QNBRKBNR"; break;
    case "199" : sp = "QNBRKNRB"; break;
    case "200" : sp = "QBNRBKNR"; break;
    case "201" : sp = "QNRBBKNR"; break;
    case "202" : sp = "QNRKBBNR"; break;
    case "203" : sp = "QNRKBNRB"; break;
    case "204" : sp = "QBNRKNBR"; break;
    case "205" : sp = "QNRBKNBR"; break;
    case "206" : sp = "QNRKNBBR"; break;
    case "207" : sp = "QNRKNRBB"; break;
    case "208" : sp = "BBNQRKNR"; break;
    case "209" : sp = "BNQBRKNR"; break;
    case "210" : sp = "BNQRKBNR"; break;
    case "211" : sp = "BNQRKNRB"; break;
    case "212" : sp = "NBBQRKNR"; break;
    case "213" : sp = "NQBBRKNR"; break;
    case "214" : sp = "NQBRKBNR"; break;
    case "215" : sp = "NQBRKNRB"; break;
    case "216" : sp = "NBQRBKNR"; break;
    case "217" : sp = "NQRBBKNR"; break;
    case "218" : sp = "NQRKBBNR"; break;
    case "219" : sp = "NQRKBNRB"; break;
    case "220" : sp = "NBQRKNBR"; break;
    case "221" : sp = "NQRBKNBR"; break;
    case "222" : sp = "NQRKNBBR"; break;
    case "223" : sp = "NQRKNRBB"; break;
    case "224" : sp = "BBNRQKNR"; break;
    case "225" : sp = "BNRBQKNR"; break;
    case "226" : sp = "BNRQKBNR"; break;
    case "227" : sp = "BNRQKNRB"; break;
    case "228" : sp = "NBBRQKNR"; break;
    case "229" : sp = "NRBBQKNR"; break;
    case "230" : sp = "NRBQKBNR"; break;
    case "231" : sp = "NRBQKNRB"; break;
    case "232" : sp = "NBRQBKNR"; break;
    case "233" : sp = "NRQBBKNR"; break;
    case "234" : sp = "NRQKBBNR"; break;
    case "235" : sp = "NRQKBNRB"; break;
    case "236" : sp = "NBRQKNBR"; break;
    case "237" : sp = "NRQBKNBR"; break;
    case "238" : sp = "NRQKNBBR"; break;
    case "239" : sp = "NRQKNRBB"; break;
    case "240" : sp = "BBNRKQNR"; break;
    case "241" : sp = "BNRBKQNR"; break;
    case "242" : sp = "BNRKQBNR"; break;
    case "243" : sp = "BNRKQNRB"; break;
    case "244" : sp = "NBBRKQNR"; break;
    case "245" : sp = "NRBBKQNR"; break;
    case "246" : sp = "NRBKQBNR"; break;
    case "247" : sp = "NRBKQNRB"; break;
    case "248" : sp = "NBRKBQNR"; break;
    case "249" : sp = "NRKBBQNR"; break;
    case "250" : sp = "NRKQBBNR"; break;
    case "251" : sp = "NRKQBNRB"; break;
    case "252" : sp = "NBRKQNBR"; break;
    case "253" : sp = "NRKBQNBR"; break;
    case "254" : sp = "NRKQNBBR"; break;
    case "255" : sp = "NRKQNRBB"; break;
    case "256" : sp = "BBNRKNQR"; break;
    case "257" : sp = "BNRBKNQR"; break;
    case "258" : sp = "BNRKNBQR"; break;
    case "259" : sp = "BNRKNQRB"; break;
    case "260" : sp = "NBBRKNQR"; break;
    case "261" : sp = "NRBBKNQR"; break;
    case "262" : sp = "NRBKNBQR"; break;
    case "263" : sp = "NRBKNQRB"; break;
    case "264" : sp = "NBRKBNQR"; break;
    case "265" : sp = "NRKBBNQR"; break;
    case "266" : sp = "NRKNBBQR"; break;
    case "267" : sp = "NRKNBQRB"; break;
    case "268" : sp = "NBRKNQBR"; break;
    case "269" : sp = "NRKBNQBR"; break;
    case "270" : sp = "NRKNQBBR"; break;
    case "271" : sp = "NRKNQRBB"; break;
    case "272" : sp = "BBNRKNRQ"; break;
    case "273" : sp = "BNRBKNRQ"; break;
    case "274" : sp = "BNRKNBRQ"; break;
    case "275" : sp = "BNRKNRQB"; break;
    case "276" : sp = "NBBRKNRQ"; break;
    case "277" : sp = "NRBBKNRQ"; break;
    case "278" : sp = "NRBKNBRQ"; break;
    case "279" : sp = "NRBKNRQB"; break;
    case "280" : sp = "NBRKBNRQ"; break;
    case "281" : sp = "NRKBBNRQ"; break;
    case "282" : sp = "NRKNBBRQ"; break;
    case "283" : sp = "NRKNBRQB"; break;
    case "284" : sp = "NBRKNRBQ"; break;
    case "285" : sp = "NRKBNRBQ"; break;
    case "286" : sp = "NRKNRBBQ"; break;
    case "287" : sp = "NRKNRQBB"; break;
    case "288" : sp = "BBQNRKRN"; break;
    case "289" : sp = "BQNBRKRN"; break;
    case "290" : sp = "BQNRKBRN"; break;
    case "291" : sp = "BQNRKRNB"; break;
    case "292" : sp = "QBBNRKRN"; break;
    case "293" : sp = "QNBBRKRN"; break;
    case "294" : sp = "QNBRKBRN"; break;
    case "295" : sp = "QNBRKRNB"; break;
    case "296" : sp = "QBNRBKRN"; break;
    case "297" : sp = "QNRBBKRN"; break;
    case "298" : sp = "QNRKBBRN"; break;
    case "299" : sp = "QNRKBRNB"; break;
    case "300" : sp = "QBNRKRBN"; break;
    case "301" : sp = "QNRBKRBN"; break;
    case "302" : sp = "QNRKRBBN"; break;
    case "303" : sp = "QNRKRNBB"; break;
    case "304" : sp = "BBNQRKRN"; break;
    case "305" : sp = "BNQBRKRN"; break;
    case "306" : sp = "BNQRKBRN"; break;
    case "307" : sp = "BNQRKRNB"; break;
    case "308" : sp = "NBBQRKRN"; break;
    case "309" : sp = "NQBBRKRN"; break;
    case "310" : sp = "NQBRKBRN"; break;
    case "311" : sp = "NQBRKRNB"; break;
    case "312" : sp = "NBQRBKRN"; break;
    case "313" : sp = "NQRBBKRN"; break;
    case "314" : sp = "NQRKBBRN"; break;
    case "315" : sp = "NQRKBRNB"; break;
    case "316" : sp = "NBQRKRBN"; break;
    case "317" : sp = "NQRBKRBN"; break;
    case "318" : sp = "NQRKRBBN"; break;
    case "319" : sp = "NQRKRNBB"; break;
    case "320" : sp = "BBNRQKRN"; break;
    case "321" : sp = "BNRBQKRN"; break;
    case "322" : sp = "BNRQKBRN"; break;
    case "323" : sp = "BNRQKRNB"; break;
    case "324" : sp = "NBBRQKRN"; break;
    case "325" : sp = "NRBBQKRN"; break;
    case "326" : sp = "NRBQKBRN"; break;
    case "327" : sp = "NRBQKRNB"; break;
    case "328" : sp = "NBRQBKRN"; break;
    case "329" : sp = "NRQBBKRN"; break;
    case "330" : sp = "NRQKBBRN"; break;
    case "331" : sp = "NRQKBRNB"; break;
    case "332" : sp = "NBRQKRBN"; break;
    case "333" : sp = "NRQBKRBN"; break;
    case "334" : sp = "NRQKRBBN"; break;
    case "335" : sp = "NRQKRNBB"; break;
    case "336" : sp = "BBNRKQRN"; break;
    case "337" : sp = "BNRBKQRN"; break;
    case "338" : sp = "BNRKQBRN"; break;
    case "339" : sp = "BNRKQRNB"; break;
    case "340" : sp = "NBBRKQRN"; break;
    case "341" : sp = "NRBBKQRN"; break;
    case "342" : sp = "NRBKQBRN"; break;
    case "343" : sp = "NRBKQRNB"; break;
    case "344" : sp = "NBRKBQRN"; break;
    case "345" : sp = "NRKBBQRN"; break;
    case "346" : sp = "NRKQBBRN"; break;
    case "347" : sp = "NRKQBRNB"; break;
    case "348" : sp = "NBRKQRBN"; break;
    case "349" : sp = "NRKBQRBN"; break;
    case "350" : sp = "NRKQRBBN"; break;
    case "351" : sp = "NRKQRNBB"; break;
    case "352" : sp = "BBNRKRQN"; break;
    case "353" : sp = "BNRBKRQN"; break;
    case "354" : sp = "BNRKRBQN"; break;
    case "355" : sp = "BNRKRQNB"; break;
    case "356" : sp = "NBBRKRQN"; break;
    case "357" : sp = "NRBBKRQN"; break;
    case "358" : sp = "NRBKRBQN"; break;
    case "359" : sp = "NRBKRQNB"; break;
    case "360" : sp = "NBRKBRQN"; break;
    case "361" : sp = "NRKBBRQN"; break;
    case "362" : sp = "NRKRBBQN"; break;
    case "363" : sp = "NRKRBQNB"; break;
    case "364" : sp = "NBRKRQBN"; break;
    case "365" : sp = "NRKBRQBN"; break;
    case "366" : sp = "NRKRQBBN"; break;
    case "367" : sp = "NRKRQNBB"; break;
    case "368" : sp = "BBNRKRNQ"; break;
    case "369" : sp = "BNRBKRNQ"; break;
    case "370" : sp = "BNRKRBNQ"; break;
    case "371" : sp = "BNRKRNQB"; break;
    case "372" : sp = "NBBRKRNQ"; break;
    case "373" : sp = "NRBBKRNQ"; break;
    case "374" : sp = "NRBKRBNQ"; break;
    case "375" : sp = "NRBKRNQB"; break;
    case "376" : sp = "NBRKBRNQ"; break;
    case "377" : sp = "NRKBBRNQ"; break;
    case "378" : sp = "NRKRBBNQ"; break;
    case "379" : sp = "NRKRBNQB"; break;
    case "380" : sp = "NBRKRNBQ"; break;
    case "381" : sp = "NRKBRNBQ"; break;
    case "382" : sp = "NRKRNBBQ"; break;
    case "383" : sp = "NRKRNQBB"; break;
    case "384" : sp = "BBQRNNKR"; break;
    case "385" : sp = "BQRBNNKR"; break;
    case "386" : sp = "BQRNNBKR"; break;
    case "387" : sp = "BQRNNKRB"; break;
    case "388" : sp = "QBBRNNKR"; break;
    case "389" : sp = "QRBBNNKR"; break;
    case "390" : sp = "QRBNNBKR"; break;
    case "391" : sp = "QRBNNKRB"; break;
    case "392" : sp = "QBRNBNKR"; break;
    case "393" : sp = "QRNBBNKR"; break;
    case "394" : sp = "QRNNBBKR"; break;
    case "395" : sp = "QRNNBKRB"; break;
    case "396" : sp = "QBRNNKBR"; break;
    case "397" : sp = "QRNBNKBR"; break;
    case "398" : sp = "QRNNKBBR"; break;
    case "399" : sp = "QRNNKRBB"; break;
    case "400" : sp = "BBRQNNKR"; break;
    case "401" : sp = "BRQBNNKR"; break;
    case "402" : sp = "BRQNNBKR"; break;
    case "403" : sp = "BRQNNKRB"; break;
    case "404" : sp = "RBBQNNKR"; break;
    case "405" : sp = "RQBBNNKR"; break;
    case "406" : sp = "RQBNNBKR"; break;
    case "407" : sp = "RQBNNKRB"; break;
    case "408" : sp = "RBQNBNKR"; break;
    case "409" : sp = "RQNBBNKR"; break;
    case "410" : sp = "RQNNBBKR"; break;
    case "411" : sp = "RQNNBKRB"; break;
    case "412" : sp = "RBQNNKBR"; break;
    case "413" : sp = "RQNBNKBR"; break;
    case "414" : sp = "RQNNKBBR"; break;
    case "415" : sp = "RQNNKRBB"; break;
    case "416" : sp = "BBRNQNKR"; break;
    case "417" : sp = "BRNBQNKR"; break;
    case "418" : sp = "BRNQNBKR"; break;
    case "419" : sp = "BRNQNKRB"; break;
    case "420" : sp = "RBBNQNKR"; break;
    case "421" : sp = "RNBBQNKR"; break;
    case "422" : sp = "RNBQNBKR"; break;
    case "423" : sp = "RNBQNKRB"; break;
    case "424" : sp = "RBNQBNKR"; break;
    case "425" : sp = "RNQBBNKR"; break;
    case "426" : sp = "RNQNBBKR"; break;
    case "427" : sp = "RNQNBKRB"; break;
    case "428" : sp = "RBNQNKBR"; break;
    case "429" : sp = "RNQBNKBR"; break;
    case "430" : sp = "RNQNKBBR"; break;
    case "431" : sp = "RNQNKRBB"; break;
    case "432" : sp = "BBRNNQKR"; break;
    case "433" : sp = "BRNBNQKR"; break;
    case "434" : sp = "BRNNQBKR"; break;
    case "435" : sp = "BRNNQKRB"; break;
    case "436" : sp = "RBBNNQKR"; break;
    case "437" : sp = "RNBBNQKR"; break;
    case "438" : sp = "RNBNQBKR"; break;
    case "439" : sp = "RNBNQKRB"; break;
    case "440" : sp = "RBNNBQKR"; break;
    case "441" : sp = "RNNBBQKR"; break;
    case "442" : sp = "RNNQBBKR"; break;
    case "443" : sp = "RNNQBKRB"; break;
    case "444" : sp = "RBNNQKBR"; break;
    case "445" : sp = "RNNBQKBR"; break;
    case "446" : sp = "RNNQKBBR"; break;
    case "447" : sp = "RNNQKRBB"; break;
    case "448" : sp = "BBRNNKQR"; break;
    case "449" : sp = "BRNBNKQR"; break;
    case "450" : sp = "BRNNKBQR"; break;
    case "451" : sp = "BRNNKQRB"; break;
    case "452" : sp = "RBBNNKQR"; break;
    case "453" : sp = "RNBBNKQR"; break;
    case "454" : sp = "RNBNKBQR"; break;
    case "455" : sp = "RNBNKQRB"; break;
    case "456" : sp = "RBNNBKQR"; break;
    case "457" : sp = "RNNBBKQR"; break;
    case "458" : sp = "RNNKBBQR"; break;
    case "459" : sp = "RNNKBQRB"; break;
    case "460" : sp = "RBNNKQBR"; break;
    case "461" : sp = "RNNBKQBR"; break;
    case "462" : sp = "RNNKQBBR"; break;
    case "463" : sp = "RNNKQRBB"; break;
    case "464" : sp = "BBRNNKRQ"; break;
    case "465" : sp = "BRNBNKRQ"; break;
    case "466" : sp = "BRNNKBRQ"; break;
    case "467" : sp = "BRNNKRQB"; break;
    case "468" : sp = "RBBNNKRQ"; break;
    case "469" : sp = "RNBBNKRQ"; break;
    case "470" : sp = "RNBNKBRQ"; break;
    case "471" : sp = "RNBNKRQB"; break;
    case "472" : sp = "RBNNBKRQ"; break;
    case "473" : sp = "RNNBBKRQ"; break;
    case "474" : sp = "RNNKBBRQ"; break;
    case "475" : sp = "RNNKBRQB"; break;
    case "476" : sp = "RBNNKRBQ"; break;
    case "477" : sp = "RNNBKRBQ"; break;
    case "478" : sp = "RNNKRBBQ"; break;
    case "479" : sp = "RNNKRQBB"; break;
    case "480" : sp = "BBQRNKNR"; break;
    case "481" : sp = "BQRBNKNR"; break;
    case "482" : sp = "BQRNKBNR"; break;
    case "483" : sp = "BQRNKNRB"; break;
    case "484" : sp = "QBBRNKNR"; break;
    case "485" : sp = "QRBBNKNR"; break;
    case "486" : sp = "QRBNKBNR"; break;
    case "487" : sp = "QRBNKNRB"; break;
    case "488" : sp = "QBRNBKNR"; break;
    case "489" : sp = "QRNBBKNR"; break;
    case "490" : sp = "QRNKBBNR"; break;
    case "491" : sp = "QRNKBNRB"; break;
    case "492" : sp = "QBRNKNBR"; break;
    case "493" : sp = "QRNBKNBR"; break;
    case "494" : sp = "QRNKNBBR"; break;
    case "495" : sp = "QRNKNRBB"; break;
    case "496" : sp = "BBRQNKNR"; break;
    case "497" : sp = "BRQBNKNR"; break;
    case "498" : sp = "BRQNKBNR"; break;
    case "499" : sp = "BRQNKNRB"; break;
    case "500" : sp = "RBBQNKNR"; break;
    case "501" : sp = "RQBBNKNR"; break;
    case "502" : sp = "RQBNKBNR"; break;
    case "503" : sp = "RQBNKNRB"; break;
    case "504" : sp = "RBQNBKNR"; break;
    case "505" : sp = "RQNBBKNR"; break;
    case "506" : sp = "RQNKBBNR"; break;
    case "507" : sp = "RQNKBNRB"; break;
    case "508" : sp = "RBQNKNBR"; break;
    case "509" : sp = "RQNBKNBR"; break;
    case "510" : sp = "RQNKNBBR"; break;
    case "511" : sp = "RQNKNRBB"; break;
    case "512" : sp = "BBRNQKNR"; break;
    case "513" : sp = "BRNBQKNR"; break;
    case "514" : sp = "BRNQKBNR"; break;
    case "515" : sp = "BRNQKNRB"; break;
    case "516" : sp = "RBBNQKNR"; break;
    case "517" : sp = "RNBBQKNR"; break;
    case "518" : sp = "RNBQKBNR"; break;
    case "519" : sp = "RNBQKNRB"; break;
    case "520" : sp = "RBNQBKNR"; break;
    case "521" : sp = "RNQBBKNR"; break;
    case "522" : sp = "RNQKBBNR"; break;
    case "523" : sp = "RNQKBNRB"; break;
    case "524" : sp = "RBNQKNBR"; break;
    case "525" : sp = "RNQBKNBR"; break;
    case "526" : sp = "RNQKNBBR"; break;
    case "527" : sp = "RNQKNRBB"; break;
    case "528" : sp = "BBRNKQNR"; break;
    case "529" : sp = "BRNBKQNR"; break;
    case "530" : sp = "BRNKQBNR"; break;
    case "531" : sp = "BRNKQNRB"; break;
    case "532" : sp = "RBBNKQNR"; break;
    case "533" : sp = "RNBBKQNR"; break;
    case "534" : sp = "RNBKQBNR"; break;
    case "535" : sp = "RNBKQNRB"; break;
    case "536" : sp = "RBNKBQNR"; break;
    case "537" : sp = "RNKBBQNR"; break;
    case "538" : sp = "RNKQBBNR"; break;
    case "539" : sp = "RNKQBNRB"; break;
    case "540" : sp = "RBNKQNBR"; break;
    case "541" : sp = "RNKBQNBR"; break;
    case "542" : sp = "RNKQNBBR"; break;
    case "543" : sp = "RNKQNRBB"; break;
    case "544" : sp = "BBRNKNQR"; break;
    case "545" : sp = "BRNBKNQR"; break;
    case "546" : sp = "BRNKNBQR"; break;
    case "547" : sp = "BRNKNQRB"; break;
    case "548" : sp = "RBBNKNQR"; break;
    case "549" : sp = "RNBBKNQR"; break;
    case "550" : sp = "RNBKNBQR"; break;
    case "551" : sp = "RNBKNQRB"; break;
    case "552" : sp = "RBNKBNQR"; break;
    case "553" : sp = "RNKBBNQR"; break;
    case "554" : sp = "RNKNBBQR"; break;
    case "555" : sp = "RNKNBQRB"; break;
    case "556" : sp = "RBNKNQBR"; break;
    case "557" : sp = "RNKBNQBR"; break;
    case "558" : sp = "RNKNQBBR"; break;
    case "559" : sp = "RNKNQRBB"; break;
    case "560" : sp = "BBRNKNRQ"; break;
    case "561" : sp = "BRNBKNRQ"; break;
    case "562" : sp = "BRNKNBRQ"; break;
    case "563" : sp = "BRNKNRQB"; break;
    case "564" : sp = "RBBNKNRQ"; break;
    case "565" : sp = "RNBBKNRQ"; break;
    case "566" : sp = "RNBKNBRQ"; break;
    case "567" : sp = "RNBKNRQB"; break;
    case "568" : sp = "RBNKBNRQ"; break;
    case "569" : sp = "RNKBBNRQ"; break;
    case "570" : sp = "RNKNBBRQ"; break;
    case "571" : sp = "RNKNBRQB"; break;
    case "572" : sp = "RBNKNRBQ"; break;
    case "573" : sp = "RNKBNRBQ"; break;
    case "574" : sp = "RNKNRBBQ"; break;
    case "575" : sp = "RNKNRQBB"; break;
    case "576" : sp = "BBQRNKRN"; break;
    case "577" : sp = "BQRBNKRN"; break;
    case "578" : sp = "BQRNKBRN"; break;
    case "579" : sp = "BQRNKRNB"; break;
    case "580" : sp = "QBBRNKRN"; break;
    case "581" : sp = "QRBBNKRN"; break;
    case "582" : sp = "QRBNKBRN"; break;
    case "583" : sp = "QRBNKRNB"; break;
    case "584" : sp = "QBRNBKRN"; break;
    case "585" : sp = "QRNBBKRN"; break;
    case "586" : sp = "QRNKBBRN"; break;
    case "587" : sp = "QRNKBRNB"; break;
    case "588" : sp = "QBRNKRBN"; break;
    case "589" : sp = "QRNBKRBN"; break;
    case "590" : sp = "QRNKRBBN"; break;
    case "591" : sp = "QRNKRNBB"; break;
    case "592" : sp = "BBRQNKRN"; break;
    case "593" : sp = "BRQBNKRN"; break;
    case "594" : sp = "BRQNKBRN"; break;
    case "595" : sp = "BRQNKRNB"; break;
    case "596" : sp = "RBBQNKRN"; break;
    case "597" : sp = "RQBBNKRN"; break;
    case "598" : sp = "RQBNKBRN"; break;
    case "599" : sp = "RQBNKRNB"; break;
    case "600" : sp = "RBQNBKRN"; break;
    case "601" : sp = "RQNBBKRN"; break;
    case "602" : sp = "RQNKBBRN"; break;
    case "603" : sp = "RQNKBRNB"; break;
    case "604" : sp = "RBQNKRBN"; break;
    case "605" : sp = "RQNBKRBN"; break;
    case "606" : sp = "RQNKRBBN"; break;
    case "607" : sp = "RQNKRNBB"; break;
    case "608" : sp = "BBRNQKRN"; break;
    case "609" : sp = "BRNBQKRN"; break;
    case "610" : sp = "BRNQKBRN"; break;
    case "611" : sp = "BRNQKRNB"; break;
    case "612" : sp = "RBBNQKRN"; break;
    case "613" : sp = "RNBBQKRN"; break;
    case "614" : sp = "RNBQKBRN"; break;
    case "615" : sp = "RNBQKRNB"; break;
    case "616" : sp = "RBNQBKRN"; break;
    case "617" : sp = "RNQBBKRN"; break;
    case "618" : sp = "RNQKBBRN"; break;
    case "619" : sp = "RNQKBRNB"; break;
    case "620" : sp = "RBNQKRBN"; break;
    case "621" : sp = "RNQBKRBN"; break;
    case "622" : sp = "RNQKRBBN"; break;
    case "623" : sp = "RNQKRNBB"; break;
    case "624" : sp = "BBRNKQRN"; break;
    case "625" : sp = "BRNBKQRN"; break;
    case "626" : sp = "BRNKQBRN"; break;
    case "627" : sp = "BRNKQRNB"; break;
    case "628" : sp = "RBBNKQRN"; break;
    case "629" : sp = "RNBBKQRN"; break;
    case "630" : sp = "RNBKQBRN"; break;
    case "631" : sp = "RNBKQRNB"; break;
    case "632" : sp = "RBNKBQRN"; break;
    case "633" : sp = "RNKBBQRN"; break;
    case "634" : sp = "RNKQBBRN"; break;
    case "635" : sp = "RNKQBRNB"; break;
    case "636" : sp = "RBNKQRBN"; break;
    case "637" : sp = "RNKBQRBN"; break;
    case "638" : sp = "RNKQRBBN"; break;
    case "639" : sp = "RNKQRNBB"; break;
    case "640" : sp = "BBRNKRQN"; break;
    case "641" : sp = "BRNBKRQN"; break;
    case "642" : sp = "BRNKRBQN"; break;
    case "643" : sp = "BRNKRQNB"; break;
    case "644" : sp = "RBBNKRQN"; break;
    case "645" : sp = "RNBBKRQN"; break;
    case "646" : sp = "RNBKRBQN"; break;
    case "647" : sp = "RNBKRQNB"; break;
    case "648" : sp = "RBNKBRQN"; break;
    case "649" : sp = "RNKBBRQN"; break;
    case "650" : sp = "RNKRBBQN"; break;
    case "651" : sp = "RNKRBQNB"; break;
    case "652" : sp = "RBNKRQBN"; break;
    case "653" : sp = "RNKBRQBN"; break;
    case "654" : sp = "RNKRQBBN"; break;
    case "655" : sp = "RNKRQNBB"; break;
    case "656" : sp = "BBRNKRNQ"; break;
    case "657" : sp = "BRNBKRNQ"; break;
    case "658" : sp = "BRNKRBNQ"; break;
    case "659" : sp = "BRNKRNQB"; break;
    case "660" : sp = "RBBNKRNQ"; break;
    case "661" : sp = "RNBBKRNQ"; break;
    case "662" : sp = "RNBKRBNQ"; break;
    case "663" : sp = "RNBKRNQB"; break;
    case "664" : sp = "RBNKBRNQ"; break;
    case "665" : sp = "RNKBBRNQ"; break;
    case "666" : sp = "RNKRBBNQ"; break;
    case "667" : sp = "RNKRBNQB"; break;
    case "668" : sp = "RBNKRNBQ"; break;
    case "669" : sp = "RNKBRNBQ"; break;
    case "670" : sp = "RNKRNBBQ"; break;
    case "671" : sp = "RNKRNQBB"; break;
    case "672" : sp = "BBQRKNNR"; break;
    case "673" : sp = "BQRBKNNR"; break;
    case "674" : sp = "BQRKNBNR"; break;
    case "675" : sp = "BQRKNNRB"; break;
    case "676" : sp = "QBBRKNNR"; break;
    case "677" : sp = "QRBBKNNR"; break;
    case "678" : sp = "QRBKNBNR"; break;
    case "679" : sp = "QRBKNNRB"; break;
    case "680" : sp = "QBRKBNNR"; break;
    case "681" : sp = "QRKBBNNR"; break;
    case "682" : sp = "QRKNBBNR"; break;
    case "683" : sp = "QRKNBNRB"; break;
    case "684" : sp = "QBRKNNBR"; break;
    case "685" : sp = "QRKBNNBR"; break;
    case "686" : sp = "QRKNNBBR"; break;
    case "687" : sp = "QRKNNRBB"; break;
    case "688" : sp = "BBRQKNNR"; break;
    case "689" : sp = "BRQBKNNR"; break;
    case "690" : sp = "BRQKNBNR"; break;
    case "691" : sp = "BRQKNNRB"; break;
    case "692" : sp = "RBBQKNNR"; break;
    case "693" : sp = "RQBBKNNR"; break;
    case "694" : sp = "RQBKNBNR"; break;
    case "695" : sp = "RQBKNNRB"; break;
    case "696" : sp = "RBQKBNNR"; break;
    case "697" : sp = "RQKBBNNR"; break;
    case "698" : sp = "RQKNBBNR"; break;
    case "699" : sp = "RQKNBNRB"; break;
    case "700" : sp = "RBQKNNBR"; break;
    case "701" : sp = "RQKBNNBR"; break;
    case "702" : sp = "RQKNNBBR"; break;
    case "703" : sp = "RQKNNRBB"; break;
    case "704" : sp = "BBRKQNNR"; break;
    case "705" : sp = "BRKBQNNR"; break;
    case "706" : sp = "BRKQNBNR"; break;
    case "707" : sp = "BRKQNNRB"; break;
    case "708" : sp = "RBBKQNNR"; break;
    case "709" : sp = "RKBBQNNR"; break;
    case "710" : sp = "RKBQNBNR"; break;
    case "711" : sp = "RKBQNNRB"; break;
    case "712" : sp = "RBKQBNNR"; break;
    case "713" : sp = "RKQBBNNR"; break;
    case "714" : sp = "RKQNBBNR"; break;
    case "715" : sp = "RKQNBNRB"; break;
    case "716" : sp = "RBKQNNBR"; break;
    case "717" : sp = "RKQBNNBR"; break;
    case "718" : sp = "RKQNNBBR"; break;
    case "719" : sp = "RKQNNRBB"; break;
    case "720" : sp = "BBRKNQNR"; break;
    case "721" : sp = "BRKBNQNR"; break;
    case "722" : sp = "BRKNQBNR"; break;
    case "723" : sp = "BRKNQNRB"; break;
    case "724" : sp = "RBBKNQNR"; break;
    case "725" : sp = "RKBBNQNR"; break;
    case "726" : sp = "RKBNQBNR"; break;
    case "727" : sp = "RKBNQNRB"; break;
    case "728" : sp = "RBKNBQNR"; break;
    case "729" : sp = "RKNBBQNR"; break;
    case "730" : sp = "RKNQBBNR"; break;
    case "731" : sp = "RKNQBNRB"; break;
    case "732" : sp = "RBKNQNBR"; break;
    case "733" : sp = "RKNBQNBR"; break;
    case "734" : sp = "RKNQNBBR"; break;
    case "735" : sp = "RKNQNRBB"; break;
    case "736" : sp = "BBRKNNQR"; break;
    case "737" : sp = "BRKBNNQR"; break;
    case "738" : sp = "BRKNNBQR"; break;
    case "739" : sp = "BRKNNQRB"; break;
    case "740" : sp = "RBBKNNQR"; break;
    case "741" : sp = "RKBBNNQR"; break;
    case "742" : sp = "RKBNNBQR"; break;
    case "743" : sp = "RKBNNQRB"; break;
    case "744" : sp = "RBKNBNQR"; break;
    case "745" : sp = "RKNBBNQR"; break;
    case "746" : sp = "RKNNBBQR"; break;
    case "747" : sp = "RKNNBQRB"; break;
    case "748" : sp = "RBKNNQBR"; break;
    case "749" : sp = "RKNBNQBR"; break;
    case "750" : sp = "RKNNQBBR"; break;
    case "751" : sp = "RKNNQRBB"; break;
    case "752" : sp = "BBRKNNRQ"; break;
    case "753" : sp = "BRKBNNRQ"; break;
    case "754" : sp = "BRKNNBRQ"; break;
    case "755" : sp = "BRKNNRQB"; break;
    case "756" : sp = "RBBKNNRQ"; break;
    case "757" : sp = "RKBBNNRQ"; break;
    case "758" : sp = "RKBNNBRQ"; break;
    case "759" : sp = "RKBNNRQB"; break;
    case "760" : sp = "RBKNBNRQ"; break;
    case "761" : sp = "RKNBBNRQ"; break;
    case "762" : sp = "RKNNBBRQ"; break;
    case "763" : sp = "RKNNBRQB"; break;
    case "764" : sp = "RBKNNRBQ"; break;
    case "765" : sp = "RKNBNRBQ"; break;
    case "766" : sp = "RKNNRBBQ"; break;
    case "767" : sp = "RKNNRQBB"; break;
    case "768" : sp = "BBQRKNRN"; break;
    case "769" : sp = "BQRBKNRN"; break;
    case "770" : sp = "BQRKNBRN"; break;
    case "771" : sp = "BQRKNRNB"; break;
    case "772" : sp = "QBBRKNRN"; break;
    case "773" : sp = "QRBBKNRN"; break;
    case "774" : sp = "QRBKNBRN"; break;
    case "775" : sp = "QRBKNRNB"; break;
    case "776" : sp = "QBRKBNRN"; break;
    case "777" : sp = "QRKBBNRN"; break;
    case "778" : sp = "QRKNBBRN"; break;
    case "779" : sp = "QRKNBRNB"; break;
    case "780" : sp = "QBRKNRBN"; break;
    case "781" : sp = "QRKBNRBN"; break;
    case "782" : sp = "QRKNRBBN"; break;
    case "783" : sp = "QRKNRNBB"; break;
    case "784" : sp = "BBRQKNRN"; break;
    case "785" : sp = "BRQBKNRN"; break;
    case "786" : sp = "BRQKNBRN"; break;
    case "787" : sp = "BRQKNRNB"; break;
    case "788" : sp = "RBBQKNRN"; break;
    case "789" : sp = "RQBBKNRN"; break;
    case "790" : sp = "RQBKNBRN"; break;
    case "791" : sp = "RQBKNRNB"; break;
    case "792" : sp = "RBQKBNRN"; break;
    case "793" : sp = "RQKBBNRN"; break;
    case "794" : sp = "RQKNBBRN"; break;
    case "795" : sp = "RQKNBRNB"; break;
    case "796" : sp = "RBQKNRBN"; break;
    case "797" : sp = "RQKBNRBN"; break;
    case "798" : sp = "RQKNRBBN"; break;
    case "799" : sp = "RQKNRNBB"; break;
    case "800" : sp = "BBRKQNRN"; break;
    case "801" : sp = "BRKBQNRN"; break;
    case "802" : sp = "BRKQNBRN"; break;
    case "803" : sp = "BRKQNRNB"; break;
    case "804" : sp = "RBBKQNRN"; break;
    case "805" : sp = "RKBBQNRN"; break;
    case "806" : sp = "RKBQNBRN"; break;
    case "807" : sp = "RKBQNRNB"; break;
    case "808" : sp = "RBKQBNRN"; break;
    case "809" : sp = "RKQBBNRN"; break;
    case "810" : sp = "RKQNBBRN"; break;
    case "811" : sp = "RKQNBRNB"; break;
    case "812" : sp = "RBKQNRBN"; break;
    case "813" : sp = "RKQBNRBN"; break;
    case "814" : sp = "RKQNRBBN"; break;
    case "815" : sp = "RKQNRNBB"; break;
    case "816" : sp = "BBRKNQRN"; break;
    case "817" : sp = "BRKBNQRN"; break;
    case "818" : sp = "BRKNQBRN"; break;
    case "819" : sp = "BRKNQRNB"; break;
    case "820" : sp = "RBBKNQRN"; break;
    case "821" : sp = "RKBBNQRN"; break;
    case "822" : sp = "RKBNQBRN"; break;
    case "823" : sp = "RKBNQRNB"; break;
    case "824" : sp = "RBKNBQRN"; break;
    case "825" : sp = "RKNBBQRN"; break;
    case "826" : sp = "RKNQBBRN"; break;
    case "827" : sp = "RKNQBRNB"; break;
    case "828" : sp = "RBKNQRBN"; break;
    case "829" : sp = "RKNBQRBN"; break;
    case "830" : sp = "RKNQRBBN"; break;
    case "831" : sp = "RKNQRNBB"; break;
    case "832" : sp = "BBRKNRQN"; break;
    case "833" : sp = "BRKBNRQN"; break;
    case "834" : sp = "BRKNRBQN"; break;
    case "835" : sp = "BRKNRQNB"; break;
    case "836" : sp = "RBBKNRQN"; break;
    case "837" : sp = "RKBBNRQN"; break;
    case "838" : sp = "RKBNRBQN"; break;
    case "839" : sp = "RKBNRQNB"; break;
    case "840" : sp = "RBKNBRQN"; break;
    case "841" : sp = "RKNBBRQN"; break;
    case "842" : sp = "RKNRBBQN"; break;
    case "843" : sp = "RKNRBQNB"; break;
    case "844" : sp = "RBKNRQBN"; break;
    case "845" : sp = "RKNBRQBN"; break;
    case "846" : sp = "RKNRQBBN"; break;
    case "847" : sp = "RKNRQNBB"; break;
    case "848" : sp = "BBRKNRNQ"; break;
    case "849" : sp = "BRKBNRNQ"; break;
    case "850" : sp = "BRKNRBNQ"; break;
    case "851" : sp = "BRKNRNQB"; break;
    case "852" : sp = "RBBKNRNQ"; break;
    case "853" : sp = "RKBBNRNQ"; break;
    case "854" : sp = "RKBNRBNQ"; break;
    case "855" : sp = "RKBNRNQB"; break;
    case "856" : sp = "RBKNBRNQ"; break;
    case "857" : sp = "RKNBBRNQ"; break;
    case "858" : sp = "RKNRBBNQ"; break;
    case "859" : sp = "RKNRBNQB"; break;
    case "860" : sp = "RBKNRNBQ"; break;
    case "861" : sp = "RKNBRNBQ"; break;
    case "862" : sp = "RKNRNBBQ"; break;
    case "863" : sp = "RKNRNQBB"; break;
    case "864" : sp = "BBQRKRNN"; break;
    case "865" : sp = "BQRBKRNN"; break;
    case "866" : sp = "BQRKRBNN"; break;
    case "867" : sp = "BQRKRNNB"; break;
    case "868" : sp = "QBBRKRNN"; break;
    case "869" : sp = "QRBBKRNN"; break;
    case "870" : sp = "QRBKRBNN"; break;
    case "871" : sp = "QRBKRNNB"; break;
    case "872" : sp = "QBRKBRNN"; break;
    case "873" : sp = "QRKBBRNN"; break;
    case "874" : sp = "QRKRBBNN"; break;
    case "875" : sp = "QRKRBNNB"; break;
    case "876" : sp = "QBRKRNBN"; break;
    case "877" : sp = "QRKBRNBN"; break;
    case "878" : sp = "QRKRNBBN"; break;
    case "879" : sp = "QRKRNNBB"; break;
    case "880" : sp = "BBRQKRNN"; break;
    case "881" : sp = "BRQBKRNN"; break;
    case "882" : sp = "BRQKRBNN"; break;
    case "883" : sp = "BRQKRNNB"; break;
    case "884" : sp = "RBBQKRNN"; break;
    case "885" : sp = "RQBBKRNN"; break;
    case "886" : sp = "RQBKRBNN"; break;
    case "887" : sp = "RQBKRNNB"; break;
    case "888" : sp = "RBQKBRNN"; break;
    case "889" : sp = "RQKBBRNN"; break;
    case "890" : sp = "RQKRBBNN"; break;
    case "891" : sp = "RQKRBNNB"; break;
    case "892" : sp = "RBQKRNBN"; break;
    case "893" : sp = "RQKBRNBN"; break;
    case "894" : sp = "RQKRNBBN"; break;
    case "895" : sp = "RQKRNNBB"; break;
    case "896" : sp = "BBRKQRNN"; break;
    case "897" : sp = "BRKBQRNN"; break;
    case "898" : sp = "BRKQRBNN"; break;
    case "899" : sp = "BRKQRNNB"; break;
    case "900" : sp = "RBBKQRNN"; break;
    case "901" : sp = "RKBBQRNN"; break;
    case "902" : sp = "RKBQRBNN"; break;
    case "903" : sp = "RKBQRNNB"; break;
    case "904" : sp = "RBKQBRNN"; break;
    case "905" : sp = "RKQBBRNN"; break;
    case "906" : sp = "RKQRBBNN"; break;
    case "907" : sp = "RKQRBNNB"; break;
    case "908" : sp = "RBKQRNBN"; break;
    case "909" : sp = "RKQBRNBN"; break;
    case "910" : sp = "RKQRNBBN"; break;
    case "911" : sp = "RKQRNNBB"; break;
    case "912" : sp = "BBRKRQNN"; break;
    case "913" : sp = "BRKBRQNN"; break;
    case "914" : sp = "BRKRQBNN"; break;
    case "915" : sp = "BRKRQNNB"; break;
    case "916" : sp = "RBBKRQNN"; break;
    case "917" : sp = "RKBBRQNN"; break;
    case "918" : sp = "RKBRQBNN"; break;
    case "919" : sp = "RKBRQNNB"; break;
    case "920" : sp = "RBKRBQNN"; break;
    case "921" : sp = "RKRBBQNN"; break;
    case "922" : sp = "RKRQBBNN"; break;
    case "923" : sp = "RKRQBNNB"; break;
    case "924" : sp = "RBKRQNBN"; break;
    case "925" : sp = "RKRBQNBN"; break;
    case "926" : sp = "RKRQNBBN"; break;
    case "927" : sp = "RKRQNNBB"; break;
    case "928" : sp = "BBRKRNQN"; break;
    case "929" : sp = "BRKBRNQN"; break;
    case "930" : sp = "BRKRNBQN"; break;
    case "931" : sp = "BRKRNQNB"; break;
    case "932" : sp = "RBBKRNQN"; break;
    case "933" : sp = "RKBBRNQN"; break;
    case "934" : sp = "RKBRNBQN"; break;
    case "935" : sp = "RKBRNQNB"; break;
    case "936" : sp = "RBKRBNQN"; break;
    case "937" : sp = "RKRBBNQN"; break;
    case "938" : sp = "RKRNBBQN"; break;
    case "939" : sp = "RKRNBQNB"; break;
    case "940" : sp = "RBKRNQBN"; break;
    case "941" : sp = "RKRBNQBN"; break;
    case "942" : sp = "RKRNQBBN"; break;
    case "943" : sp = "RKRNQNBB"; break;
    case "944" : sp = "BBRKRNNQ"; break;
    case "945" : sp = "BRKBRNNQ"; break;
    case "946" : sp = "BRKRNBNQ"; break;
    case "947" : sp = "BRKRNNQB"; break;
    case "948" : sp = "RBBKRNNQ"; break;
    case "949" : sp = "RKBBRNNQ"; break;
    case "950" : sp = "RKBRNBNQ"; break;
    case "951" : sp = "RKBRNNQB"; break;
    case "952" : sp = "RBKRBNNQ"; break;
    case "953" : sp = "RKRBBNNQ"; break;
    case "954" : sp = "RKRNBBNQ"; break;
    case "955" : sp = "RKRNBNQB"; break;
    case "956" : sp = "RBKRNNBQ"; break;
    case "957" : sp = "RKRBNNBQ"; break;
    case "958" : sp = "RKRNNBBQ"; break;
    case "959" : sp = "RKRNNQBB"; break;

  //

    case "BBQNNRKR" : sp = "000"; break;
    case "BQNBNRKR" : sp = "001"; break;
    case "BQNNRBKR" : sp = "002"; break;
    case "BQNNRKRB" : sp = "003"; break;
    case "QBBNNRKR" : sp = "004"; break;
    case "QNBBNRKR" : sp = "005"; break;
    case "QNBNRBKR" : sp = "006"; break;
    case "QNBNRKRB" : sp = "007"; break;
    case "QBNNBRKR" : sp = "008"; break;
    case "QNNBBRKR" : sp = "009"; break;
    case "QNNRBBKR" : sp = "010"; break;
    case "QNNRBKRB" : sp = "011"; break;
    case "QBNNRKBR" : sp = "012"; break;
    case "QNNBRKBR" : sp = "013"; break;
    case "QNNRKBBR" : sp = "014"; break;
    case "QNNRKRBB" : sp = "015"; break;
    case "BBNQNRKR" : sp = "016"; break;
    case "BNQBNRKR" : sp = "017"; break;
    case "BNQNRBKR" : sp = "018"; break;
    case "BNQNRKRB" : sp = "019"; break;
    case "NBBQNRKR" : sp = "020"; break;
    case "NQBBNRKR" : sp = "021"; break;
    case "NQBNRBKR" : sp = "022"; break;
    case "NQBNRKRB" : sp = "023"; break;
    case "NBQNBRKR" : sp = "024"; break;
    case "NQNBBRKR" : sp = "025"; break;
    case "NQNRBBKR" : sp = "026"; break;
    case "NQNRBKRB" : sp = "027"; break;
    case "NBQNRKBR" : sp = "028"; break;
    case "NQNBRKBR" : sp = "029"; break;
    case "NQNRKBBR" : sp = "030"; break;
    case "NQNRKRBB" : sp = "031"; break;
    case "BBNNQRKR" : sp = "032"; break;
    case "BNNBQRKR" : sp = "033"; break;
    case "BNNQRBKR" : sp = "034"; break;
    case "BNNQRKRB" : sp = "035"; break;
    case "NBBNQRKR" : sp = "036"; break;
    case "NNBBQRKR" : sp = "037"; break;
    case "NNBQRBKR" : sp = "038"; break;
    case "NNBQRKRB" : sp = "039"; break;
    case "NBNQBRKR" : sp = "040"; break;
    case "NNQBBRKR" : sp = "041"; break;
    case "NNQRBBKR" : sp = "042"; break;
    case "NNQRBKRB" : sp = "043"; break;
    case "NBNQRKBR" : sp = "044"; break;
    case "NNQBRKBR" : sp = "045"; break;
    case "NNQRKBBR" : sp = "046"; break;
    case "NNQRKRBB" : sp = "047"; break;
    case "BBNNRQKR" : sp = "048"; break;
    case "BNNBRQKR" : sp = "049"; break;
    case "BNNRQBKR" : sp = "050"; break;
    case "BNNRQKRB" : sp = "051"; break;
    case "NBBNRQKR" : sp = "052"; break;
    case "NNBBRQKR" : sp = "053"; break;
    case "NNBRQBKR" : sp = "054"; break;
    case "NNBRQKRB" : sp = "055"; break;
    case "NBNRBQKR" : sp = "056"; break;
    case "NNRBBQKR" : sp = "057"; break;
    case "NNRQBBKR" : sp = "058"; break;
    case "NNRQBKRB" : sp = "059"; break;
    case "NBNRQKBR" : sp = "060"; break;
    case "NNRBQKBR" : sp = "061"; break;
    case "NNRQKBBR" : sp = "062"; break;
    case "NNRQKRBB" : sp = "063"; break;
    case "BBNNRKQR" : sp = "064"; break;
    case "BNNBRKQR" : sp = "065"; break;
    case "BNNRKBQR" : sp = "066"; break;
    case "BNNRKQRB" : sp = "067"; break;
    case "NBBNRKQR" : sp = "068"; break;
    case "NNBBRKQR" : sp = "069"; break;
    case "NNBRKBQR" : sp = "070"; break;
    case "NNBRKQRB" : sp = "071"; break;
    case "NBNRBKQR" : sp = "072"; break;
    case "NNRBBKQR" : sp = "073"; break;
    case "NNRKBBQR" : sp = "074"; break;
    case "NNRKBQRB" : sp = "075"; break;
    case "NBNRKQBR" : sp = "076"; break;
    case "NNRBKQBR" : sp = "077"; break;
    case "NNRKQBBR" : sp = "078"; break;
    case "NNRKQRBB" : sp = "079"; break;
    case "BBNNRKRQ" : sp = "080"; break;
    case "BNNBRKRQ" : sp = "081"; break;
    case "BNNRKBRQ" : sp = "082"; break;
    case "BNNRKRQB" : sp = "083"; break;
    case "NBBNRKRQ" : sp = "084"; break;
    case "NNBBRKRQ" : sp = "085"; break;
    case "NNBRKBRQ" : sp = "086"; break;
    case "NNBRKRQB" : sp = "087"; break;
    case "NBNRBKRQ" : sp = "088"; break;
    case "NNRBBKRQ" : sp = "089"; break;
    case "NNRKBBRQ" : sp = "090"; break;
    case "NNRKBRQB" : sp = "091"; break;
    case "NBNRKRBQ" : sp = "092"; break;
    case "NNRBKRBQ" : sp = "093"; break;
    case "NNRKRBBQ" : sp = "094"; break;
    case "NNRKRQBB" : sp = "095"; break;
    case "BBQNRNKR" : sp = "096"; break;
    case "BQNBRNKR" : sp = "097"; break;
    case "BQNRNBKR" : sp = "098"; break;
    case "BQNRNKRB" : sp = "099"; break;
    case "QBBNRNKR" : sp = "100"; break;
    case "QNBBRNKR" : sp = "101"; break;
    case "QNBRNBKR" : sp = "102"; break;
    case "QNBRNKRB" : sp = "103"; break;
    case "QBNRBNKR" : sp = "104"; break;
    case "QNRBBNKR" : sp = "105"; break;
    case "QNRNBBKR" : sp = "106"; break;
    case "QNRNBKRB" : sp = "107"; break;
    case "QBNRNKBR" : sp = "108"; break;
    case "QNRBNKBR" : sp = "109"; break;
    case "QNRNKBBR" : sp = "110"; break;
    case "QNRNKRBB" : sp = "111"; break;
    case "BBNQRNKR" : sp = "112"; break;
    case "BNQBRNKR" : sp = "113"; break;
    case "BNQRNBKR" : sp = "114"; break;
    case "BNQRNKRB" : sp = "115"; break;
    case "NBBQRNKR" : sp = "116"; break;
    case "NQBBRNKR" : sp = "117"; break;
    case "NQBRNBKR" : sp = "118"; break;
    case "NQBRNKRB" : sp = "119"; break;
    case "NBQRBNKR" : sp = "120"; break;
    case "NQRBBNKR" : sp = "121"; break;
    case "NQRNBBKR" : sp = "122"; break;
    case "NQRNBKRB" : sp = "123"; break;
    case "NBQRNKBR" : sp = "124"; break;
    case "NQRBNKBR" : sp = "125"; break;
    case "NQRNKBBR" : sp = "126"; break;
    case "NQRNKRBB" : sp = "127"; break;
    case "BBNRQNKR" : sp = "128"; break;
    case "BNRBQNKR" : sp = "129"; break;
    case "BNRQNBKR" : sp = "130"; break;
    case "BNRQNKRB" : sp = "131"; break;
    case "NBBRQNKR" : sp = "132"; break;
    case "NRBBQNKR" : sp = "133"; break;
    case "NRBQNBKR" : sp = "134"; break;
    case "NRBQNKRB" : sp = "135"; break;
    case "NBRQBNKR" : sp = "136"; break;
    case "NRQBBNKR" : sp = "137"; break;
    case "NRQNBBKR" : sp = "138"; break;
    case "NRQNBKRB" : sp = "139"; break;
    case "NBRQNKBR" : sp = "140"; break;
    case "NRQBNKBR" : sp = "141"; break;
    case "NRQNKBBR" : sp = "142"; break;
    case "NRQNKRBB" : sp = "143"; break;
    case "BBNRNQKR" : sp = "144"; break;
    case "BNRBNQKR" : sp = "145"; break;
    case "BNRNQBKR" : sp = "146"; break;
    case "BNRNQKRB" : sp = "147"; break;
    case "NBBRNQKR" : sp = "148"; break;
    case "NRBBNQKR" : sp = "149"; break;
    case "NRBNQBKR" : sp = "150"; break;
    case "NRBNQKRB" : sp = "151"; break;
    case "NBRNBQKR" : sp = "152"; break;
    case "NRNBBQKR" : sp = "153"; break;
    case "NRNQBBKR" : sp = "154"; break;
    case "NRNQBKRB" : sp = "155"; break;
    case "NBRNQKBR" : sp = "156"; break;
    case "NRNBQKBR" : sp = "157"; break;
    case "NRNQKBBR" : sp = "158"; break;
    case "NRNQKRBB" : sp = "159"; break;
    case "BBNRNKQR" : sp = "160"; break;
    case "BNRBNKQR" : sp = "161"; break;
    case "BNRNKBQR" : sp = "162"; break;
    case "BNRNKQRB" : sp = "163"; break;
    case "NBBRNKQR" : sp = "164"; break;
    case "NRBBNKQR" : sp = "165"; break;
    case "NRBNKBQR" : sp = "166"; break;
    case "NRBNKQRB" : sp = "167"; break;
    case "NBRNBKQR" : sp = "168"; break;
    case "NRNBBKQR" : sp = "169"; break;
    case "NRNKBBQR" : sp = "170"; break;
    case "NRNKBQRB" : sp = "171"; break;
    case "NBRNKQBR" : sp = "172"; break;
    case "NRNBKQBR" : sp = "173"; break;
    case "NRNKQBBR" : sp = "174"; break;
    case "NRNKQRBB" : sp = "175"; break;
    case "BBNRNKRQ" : sp = "176"; break;
    case "BNRBNKRQ" : sp = "177"; break;
    case "BNRNKBRQ" : sp = "178"; break;
    case "BNRNKRQB" : sp = "179"; break;
    case "NBBRNKRQ" : sp = "180"; break;
    case "NRBBNKRQ" : sp = "181"; break;
    case "NRBNKBRQ" : sp = "182"; break;
    case "NRBNKRQB" : sp = "183"; break;
    case "NBRNBKRQ" : sp = "184"; break;
    case "NRNBBKRQ" : sp = "185"; break;
    case "NRNKBBRQ" : sp = "186"; break;
    case "NRNKBRQB" : sp = "187"; break;
    case "NBRNKRBQ" : sp = "188"; break;
    case "NRNBKRBQ" : sp = "189"; break;
    case "NRNKRBBQ" : sp = "190"; break;
    case "NRNKRQBB" : sp = "191"; break;
    case "BBQNRKNR" : sp = "192"; break;
    case "BQNBRKNR" : sp = "193"; break;
    case "BQNRKBNR" : sp = "194"; break;
    case "BQNRKNRB" : sp = "195"; break;
    case "QBBNRKNR" : sp = "196"; break;
    case "QNBBRKNR" : sp = "197"; break;
    case "QNBRKBNR" : sp = "198"; break;
    case "QNBRKNRB" : sp = "199"; break;
    case "QBNRBKNR" : sp = "200"; break;
    case "QNRBBKNR" : sp = "201"; break;
    case "QNRKBBNR" : sp = "202"; break;
    case "QNRKBNRB" : sp = "203"; break;
    case "QBNRKNBR" : sp = "204"; break;
    case "QNRBKNBR" : sp = "205"; break;
    case "QNRKNBBR" : sp = "206"; break;
    case "QNRKNRBB" : sp = "207"; break;
    case "BBNQRKNR" : sp = "208"; break;
    case "BNQBRKNR" : sp = "209"; break;
    case "BNQRKBNR" : sp = "210"; break;
    case "BNQRKNRB" : sp = "211"; break;
    case "NBBQRKNR" : sp = "212"; break;
    case "NQBBRKNR" : sp = "213"; break;
    case "NQBRKBNR" : sp = "214"; break;
    case "NQBRKNRB" : sp = "215"; break;
    case "NBQRBKNR" : sp = "216"; break;
    case "NQRBBKNR" : sp = "217"; break;
    case "NQRKBBNR" : sp = "218"; break;
    case "NQRKBNRB" : sp = "219"; break;
    case "NBQRKNBR" : sp = "220"; break;
    case "NQRBKNBR" : sp = "221"; break;
    case "NQRKNBBR" : sp = "222"; break;
    case "NQRKNRBB" : sp = "223"; break;
    case "BBNRQKNR" : sp = "224"; break;
    case "BNRBQKNR" : sp = "225"; break;
    case "BNRQKBNR" : sp = "226"; break;
    case "BNRQKNRB" : sp = "227"; break;
    case "NBBRQKNR" : sp = "228"; break;
    case "NRBBQKNR" : sp = "229"; break;
    case "NRBQKBNR" : sp = "230"; break;
    case "NRBQKNRB" : sp = "231"; break;
    case "NBRQBKNR" : sp = "232"; break;
    case "NRQBBKNR" : sp = "233"; break;
    case "NRQKBBNR" : sp = "234"; break;
    case "NRQKBNRB" : sp = "235"; break;
    case "NBRQKNBR" : sp = "236"; break;
    case "NRQBKNBR" : sp = "237"; break;
    case "NRQKNBBR" : sp = "238"; break;
    case "NRQKNRBB" : sp = "239"; break;
    case "BBNRKQNR" : sp = "240"; break;
    case "BNRBKQNR" : sp = "241"; break;
    case "BNRKQBNR" : sp = "242"; break;
    case "BNRKQNRB" : sp = "243"; break;
    case "NBBRKQNR" : sp = "244"; break;
    case "NRBBKQNR" : sp = "245"; break;
    case "NRBKQBNR" : sp = "246"; break;
    case "NRBKQNRB" : sp = "247"; break;
    case "NBRKBQNR" : sp = "248"; break;
    case "NRKBBQNR" : sp = "249"; break;
    case "NRKQBBNR" : sp = "250"; break;
    case "NRKQBNRB" : sp = "251"; break;
    case "NBRKQNBR" : sp = "252"; break;
    case "NRKBQNBR" : sp = "253"; break;
    case "NRKQNBBR" : sp = "254"; break;
    case "NRKQNRBB" : sp = "255"; break;
    case "BBNRKNQR" : sp = "256"; break;
    case "BNRBKNQR" : sp = "257"; break;
    case "BNRKNBQR" : sp = "258"; break;
    case "BNRKNQRB" : sp = "259"; break;
    case "NBBRKNQR" : sp = "260"; break;
    case "NRBBKNQR" : sp = "261"; break;
    case "NRBKNBQR" : sp = "262"; break;
    case "NRBKNQRB" : sp = "263"; break;
    case "NBRKBNQR" : sp = "264"; break;
    case "NRKBBNQR" : sp = "265"; break;
    case "NRKNBBQR" : sp = "266"; break;
    case "NRKNBQRB" : sp = "267"; break;
    case "NBRKNQBR" : sp = "268"; break;
    case "NRKBNQBR" : sp = "269"; break;
    case "NRKNQBBR" : sp = "270"; break;
    case "NRKNQRBB" : sp = "271"; break;
    case "BBNRKNRQ" : sp = "272"; break;
    case "BNRBKNRQ" : sp = "273"; break;
    case "BNRKNBRQ" : sp = "274"; break;
    case "BNRKNRQB" : sp = "275"; break;
    case "NBBRKNRQ" : sp = "276"; break;
    case "NRBBKNRQ" : sp = "277"; break;
    case "NRBKNBRQ" : sp = "278"; break;
    case "NRBKNRQB" : sp = "279"; break;
    case "NBRKBNRQ" : sp = "280"; break;
    case "NRKBBNRQ" : sp = "281"; break;
    case "NRKNBBRQ" : sp = "282"; break;
    case "NRKNBRQB" : sp = "283"; break;
    case "NBRKNRBQ" : sp = "284"; break;
    case "NRKBNRBQ" : sp = "285"; break;
    case "NRKNRBBQ" : sp = "286"; break;
    case "NRKNRQBB" : sp = "287"; break;
    case "BBQNRKRN" : sp = "288"; break;
    case "BQNBRKRN" : sp = "289"; break;
    case "BQNRKBRN" : sp = "290"; break;
    case "BQNRKRNB" : sp = "291"; break;
    case "QBBNRKRN" : sp = "292"; break;
    case "QNBBRKRN" : sp = "293"; break;
    case "QNBRKBRN" : sp = "294"; break;
    case "QNBRKRNB" : sp = "295"; break;
    case "QBNRBKRN" : sp = "296"; break;
    case "QNRBBKRN" : sp = "297"; break;
    case "QNRKBBRN" : sp = "298"; break;
    case "QNRKBRNB" : sp = "299"; break;
    case "QBNRKRBN" : sp = "300"; break;
    case "QNRBKRBN" : sp = "301"; break;
    case "QNRKRBBN" : sp = "302"; break;
    case "QNRKRNBB" : sp = "303"; break;
    case "BBNQRKRN" : sp = "304"; break;
    case "BNQBRKRN" : sp = "305"; break;
    case "BNQRKBRN" : sp = "306"; break;
    case "BNQRKRNB" : sp = "307"; break;
    case "NBBQRKRN" : sp = "308"; break;
    case "NQBBRKRN" : sp = "309"; break;
    case "NQBRKBRN" : sp = "310"; break;
    case "NQBRKRNB" : sp = "311"; break;
    case "NBQRBKRN" : sp = "312"; break;
    case "NQRBBKRN" : sp = "313"; break;
    case "NQRKBBRN" : sp = "314"; break;
    case "NQRKBRNB" : sp = "315"; break;
    case "NBQRKRBN" : sp = "316"; break;
    case "NQRBKRBN" : sp = "317"; break;
    case "NQRKRBBN" : sp = "318"; break;
    case "NQRKRNBB" : sp = "319"; break;
    case "BBNRQKRN" : sp = "320"; break;
    case "BNRBQKRN" : sp = "321"; break;
    case "BNRQKBRN" : sp = "322"; break;
    case "BNRQKRNB" : sp = "323"; break;
    case "NBBRQKRN" : sp = "324"; break;
    case "NRBBQKRN" : sp = "325"; break;
    case "NRBQKBRN" : sp = "326"; break;
    case "NRBQKRNB" : sp = "327"; break;
    case "NBRQBKRN" : sp = "328"; break;
    case "NRQBBKRN" : sp = "329"; break;
    case "NRQKBBRN" : sp = "330"; break;
    case "NRQKBRNB" : sp = "331"; break;
    case "NBRQKRBN" : sp = "332"; break;
    case "NRQBKRBN" : sp = "333"; break;
    case "NRQKRBBN" : sp = "334"; break;
    case "NRQKRNBB" : sp = "335"; break;
    case "BBNRKQRN" : sp = "336"; break;
    case "BNRBKQRN" : sp = "337"; break;
    case "BNRKQBRN" : sp = "338"; break;
    case "BNRKQRNB" : sp = "339"; break;
    case "NBBRKQRN" : sp = "340"; break;
    case "NRBBKQRN" : sp = "341"; break;
    case "NRBKQBRN" : sp = "342"; break;
    case "NRBKQRNB" : sp = "343"; break;
    case "NBRKBQRN" : sp = "344"; break;
    case "NRKBBQRN" : sp = "345"; break;
    case "NRKQBBRN" : sp = "346"; break;
    case "NRKQBRNB" : sp = "347"; break;
    case "NBRKQRBN" : sp = "348"; break;
    case "NRKBQRBN" : sp = "349"; break;
    case "NRKQRBBN" : sp = "350"; break;
    case "NRKQRNBB" : sp = "351"; break;
    case "BBNRKRQN" : sp = "352"; break;
    case "BNRBKRQN" : sp = "353"; break;
    case "BNRKRBQN" : sp = "354"; break;
    case "BNRKRQNB" : sp = "355"; break;
    case "NBBRKRQN" : sp = "356"; break;
    case "NRBBKRQN" : sp = "357"; break;
    case "NRBKRBQN" : sp = "358"; break;
    case "NRBKRQNB" : sp = "359"; break;
    case "NBRKBRQN" : sp = "360"; break;
    case "NRKBBRQN" : sp = "361"; break;
    case "NRKRBBQN" : sp = "362"; break;
    case "NRKRBQNB" : sp = "363"; break;
    case "NBRKRQBN" : sp = "364"; break;
    case "NRKBRQBN" : sp = "365"; break;
    case "NRKRQBBN" : sp = "366"; break;
    case "NRKRQNBB" : sp = "367"; break;
    case "BBNRKRNQ" : sp = "368"; break;
    case "BNRBKRNQ" : sp = "369"; break;
    case "BNRKRBNQ" : sp = "370"; break;
    case "BNRKRNQB" : sp = "371"; break;
    case "NBBRKRNQ" : sp = "372"; break;
    case "NRBBKRNQ" : sp = "373"; break;
    case "NRBKRBNQ" : sp = "374"; break;
    case "NRBKRNQB" : sp = "375"; break;
    case "NBRKBRNQ" : sp = "376"; break;
    case "NRKBBRNQ" : sp = "377"; break;
    case "NRKRBBNQ" : sp = "378"; break;
    case "NRKRBNQB" : sp = "379"; break;
    case "NBRKRNBQ" : sp = "380"; break;
    case "NRKBRNBQ" : sp = "381"; break;
    case "NRKRNBBQ" : sp = "382"; break;
    case "NRKRNQBB" : sp = "383"; break;
    case "BBQRNNKR" : sp = "384"; break;
    case "BQRBNNKR" : sp = "385"; break;
    case "BQRNNBKR" : sp = "386"; break;
    case "BQRNNKRB" : sp = "387"; break;
    case "QBBRNNKR" : sp = "388"; break;
    case "QRBBNNKR" : sp = "389"; break;
    case "QRBNNBKR" : sp = "390"; break;
    case "QRBNNKRB" : sp = "391"; break;
    case "QBRNBNKR" : sp = "392"; break;
    case "QRNBBNKR" : sp = "393"; break;
    case "QRNNBBKR" : sp = "394"; break;
    case "QRNNBKRB" : sp = "395"; break;
    case "QBRNNKBR" : sp = "396"; break;
    case "QRNBNKBR" : sp = "397"; break;
    case "QRNNKBBR" : sp = "398"; break;
    case "QRNNKRBB" : sp = "399"; break;
    case "BBRQNNKR" : sp = "400"; break;
    case "BRQBNNKR" : sp = "401"; break;
    case "BRQNNBKR" : sp = "402"; break;
    case "BRQNNKRB" : sp = "403"; break;
    case "RBBQNNKR" : sp = "404"; break;
    case "RQBBNNKR" : sp = "405"; break;
    case "RQBNNBKR" : sp = "406"; break;
    case "RQBNNKRB" : sp = "407"; break;
    case "RBQNBNKR" : sp = "408"; break;
    case "RQNBBNKR" : sp = "409"; break;
    case "RQNNBBKR" : sp = "410"; break;
    case "RQNNBKRB" : sp = "411"; break;
    case "RBQNNKBR" : sp = "412"; break;
    case "RQNBNKBR" : sp = "413"; break;
    case "RQNNKBBR" : sp = "414"; break;
    case "RQNNKRBB" : sp = "415"; break;
    case "BBRNQNKR" : sp = "416"; break;
    case "BRNBQNKR" : sp = "417"; break;
    case "BRNQNBKR" : sp = "418"; break;
    case "BRNQNKRB" : sp = "419"; break;
    case "RBBNQNKR" : sp = "420"; break;
    case "RNBBQNKR" : sp = "421"; break;
    case "RNBQNBKR" : sp = "422"; break;
    case "RNBQNKRB" : sp = "423"; break;
    case "RBNQBNKR" : sp = "424"; break;
    case "RNQBBNKR" : sp = "425"; break;
    case "RNQNBBKR" : sp = "426"; break;
    case "RNQNBKRB" : sp = "427"; break;
    case "RBNQNKBR" : sp = "428"; break;
    case "RNQBNKBR" : sp = "429"; break;
    case "RNQNKBBR" : sp = "430"; break;
    case "RNQNKRBB" : sp = "431"; break;
    case "BBRNNQKR" : sp = "432"; break;
    case "BRNBNQKR" : sp = "433"; break;
    case "BRNNQBKR" : sp = "434"; break;
    case "BRNNQKRB" : sp = "435"; break;
    case "RBBNNQKR" : sp = "436"; break;
    case "RNBBNQKR" : sp = "437"; break;
    case "RNBNQBKR" : sp = "438"; break;
    case "RNBNQKRB" : sp = "439"; break;
    case "RBNNBQKR" : sp = "440"; break;
    case "RNNBBQKR" : sp = "441"; break;
    case "RNNQBBKR" : sp = "442"; break;
    case "RNNQBKRB" : sp = "443"; break;
    case "RBNNQKBR" : sp = "444"; break;
    case "RNNBQKBR" : sp = "445"; break;
    case "RNNQKBBR" : sp = "446"; break;
    case "RNNQKRBB" : sp = "447"; break;
    case "BBRNNKQR" : sp = "448"; break;
    case "BRNBNKQR" : sp = "449"; break;
    case "BRNNKBQR" : sp = "450"; break;
    case "BRNNKQRB" : sp = "451"; break;
    case "RBBNNKQR" : sp = "452"; break;
    case "RNBBNKQR" : sp = "453"; break;
    case "RNBNKBQR" : sp = "454"; break;
    case "RNBNKQRB" : sp = "455"; break;
    case "RBNNBKQR" : sp = "456"; break;
    case "RNNBBKQR" : sp = "457"; break;
    case "RNNKBBQR" : sp = "458"; break;
    case "RNNKBQRB" : sp = "459"; break;
    case "RBNNKQBR" : sp = "460"; break;
    case "RNNBKQBR" : sp = "461"; break;
    case "RNNKQBBR" : sp = "462"; break;
    case "RNNKQRBB" : sp = "463"; break;
    case "BBRNNKRQ" : sp = "464"; break;
    case "BRNBNKRQ" : sp = "465"; break;
    case "BRNNKBRQ" : sp = "466"; break;
    case "BRNNKRQB" : sp = "467"; break;
    case "RBBNNKRQ" : sp = "468"; break;
    case "RNBBNKRQ" : sp = "469"; break;
    case "RNBNKBRQ" : sp = "470"; break;
    case "RNBNKRQB" : sp = "471"; break;
    case "RBNNBKRQ" : sp = "472"; break;
    case "RNNBBKRQ" : sp = "473"; break;
    case "RNNKBBRQ" : sp = "474"; break;
    case "RNNKBRQB" : sp = "475"; break;
    case "RBNNKRBQ" : sp = "476"; break;
    case "RNNBKRBQ" : sp = "477"; break;
    case "RNNKRBBQ" : sp = "478"; break;
    case "RNNKRQBB" : sp = "479"; break;
    case "BBQRNKNR" : sp = "480"; break;
    case "BQRBNKNR" : sp = "481"; break;
    case "BQRNKBNR" : sp = "482"; break;
    case "BQRNKNRB" : sp = "483"; break;
    case "QBBRNKNR" : sp = "484"; break;
    case "QRBBNKNR" : sp = "485"; break;
    case "QRBNKBNR" : sp = "486"; break;
    case "QRBNKNRB" : sp = "487"; break;
    case "QBRNBKNR" : sp = "488"; break;
    case "QRNBBKNR" : sp = "489"; break;
    case "QRNKBBNR" : sp = "490"; break;
    case "QRNKBNRB" : sp = "491"; break;
    case "QBRNKNBR" : sp = "492"; break;
    case "QRNBKNBR" : sp = "493"; break;
    case "QRNKNBBR" : sp = "494"; break;
    case "QRNKNRBB" : sp = "495"; break;
    case "BBRQNKNR" : sp = "496"; break;
    case "BRQBNKNR" : sp = "497"; break;
    case "BRQNKBNR" : sp = "498"; break;
    case "BRQNKNRB" : sp = "499"; break;
    case "RBBQNKNR" : sp = "500"; break;
    case "RQBBNKNR" : sp = "501"; break;
    case "RQBNKBNR" : sp = "502"; break;
    case "RQBNKNRB" : sp = "503"; break;
    case "RBQNBKNR" : sp = "504"; break;
    case "RQNBBKNR" : sp = "505"; break;
    case "RQNKBBNR" : sp = "506"; break;
    case "RQNKBNRB" : sp = "507"; break;
    case "RBQNKNBR" : sp = "508"; break;
    case "RQNBKNBR" : sp = "509"; break;
    case "RQNKNBBR" : sp = "510"; break;
    case "RQNKNRBB" : sp = "511"; break;
    case "BBRNQKNR" : sp = "512"; break;
    case "BRNBQKNR" : sp = "513"; break;
    case "BRNQKBNR" : sp = "514"; break;
    case "BRNQKNRB" : sp = "515"; break;
    case "RBBNQKNR" : sp = "516"; break;
    case "RNBBQKNR" : sp = "517"; break;
    case "RNBQKBNR" : sp = "518"; break;
    case "RNBQKNRB" : sp = "519"; break;
    case "RBNQBKNR" : sp = "520"; break;
    case "RNQBBKNR" : sp = "521"; break;
    case "RNQKBBNR" : sp = "522"; break;
    case "RNQKBNRB" : sp = "523"; break;
    case "RBNQKNBR" : sp = "524"; break;
    case "RNQBKNBR" : sp = "525"; break;
    case "RNQKNBBR" : sp = "526"; break;
    case "RNQKNRBB" : sp = "527"; break;
    case "BBRNKQNR" : sp = "528"; break;
    case "BRNBKQNR" : sp = "529"; break;
    case "BRNKQBNR" : sp = "530"; break;
    case "BRNKQNRB" : sp = "531"; break;
    case "RBBNKQNR" : sp = "532"; break;
    case "RNBBKQNR" : sp = "533"; break;
    case "RNBKQBNR" : sp = "534"; break;
    case "RNBKQNRB" : sp = "535"; break;
    case "RBNKBQNR" : sp = "536"; break;
    case "RNKBBQNR" : sp = "537"; break;
    case "RNKQBBNR" : sp = "538"; break;
    case "RNKQBNRB" : sp = "539"; break;
    case "RBNKQNBR" : sp = "540"; break;
    case "RNKBQNBR" : sp = "541"; break;
    case "RNKQNBBR" : sp = "542"; break;
    case "RNKQNRBB" : sp = "543"; break;
    case "BBRNKNQR" : sp = "544"; break;
    case "BRNBKNQR" : sp = "545"; break;
    case "BRNKNBQR" : sp = "546"; break;
    case "BRNKNQRB" : sp = "547"; break;
    case "RBBNKNQR" : sp = "548"; break;
    case "RNBBKNQR" : sp = "549"; break;
    case "RNBKNBQR" : sp = "550"; break;
    case "RNBKNQRB" : sp = "551"; break;
    case "RBNKBNQR" : sp = "552"; break;
    case "RNKBBNQR" : sp = "553"; break;
    case "RNKNBBQR" : sp = "554"; break;
    case "RNKNBQRB" : sp = "555"; break;
    case "RBNKNQBR" : sp = "556"; break;
    case "RNKBNQBR" : sp = "557"; break;
    case "RNKNQBBR" : sp = "558"; break;
    case "RNKNQRBB" : sp = "559"; break;
    case "BBRNKNRQ" : sp = "560"; break;
    case "BRNBKNRQ" : sp = "561"; break;
    case "BRNKNBRQ" : sp = "562"; break;
    case "BRNKNRQB" : sp = "563"; break;
    case "RBBNKNRQ" : sp = "564"; break;
    case "RNBBKNRQ" : sp = "565"; break;
    case "RNBKNBRQ" : sp = "566"; break;
    case "RNBKNRQB" : sp = "567"; break;
    case "RBNKBNRQ" : sp = "568"; break;
    case "RNKBBNRQ" : sp = "569"; break;
    case "RNKNBBRQ" : sp = "570"; break;
    case "RNKNBRQB" : sp = "571"; break;
    case "RBNKNRBQ" : sp = "572"; break;
    case "RNKBNRBQ" : sp = "573"; break;
    case "RNKNRBBQ" : sp = "574"; break;
    case "RNKNRQBB" : sp = "575"; break;
    case "BBQRNKRN" : sp = "576"; break;
    case "BQRBNKRN" : sp = "577"; break;
    case "BQRNKBRN" : sp = "578"; break;
    case "BQRNKRNB" : sp = "579"; break;
    case "QBBRNKRN" : sp = "580"; break;
    case "QRBBNKRN" : sp = "581"; break;
    case "QRBNKBRN" : sp = "582"; break;
    case "QRBNKRNB" : sp = "583"; break;
    case "QBRNBKRN" : sp = "584"; break;
    case "QRNBBKRN" : sp = "585"; break;
    case "QRNKBBRN" : sp = "586"; break;
    case "QRNKBRNB" : sp = "587"; break;
    case "QBRNKRBN" : sp = "588"; break;
    case "QRNBKRBN" : sp = "589"; break;
    case "QRNKRBBN" : sp = "590"; break;
    case "QRNKRNBB" : sp = "591"; break;
    case "BBRQNKRN" : sp = "592"; break;
    case "BRQBNKRN" : sp = "593"; break;
    case "BRQNKBRN" : sp = "594"; break;
    case "BRQNKRNB" : sp = "595"; break;
    case "RBBQNKRN" : sp = "596"; break;
    case "RQBBNKRN" : sp = "597"; break;
    case "RQBNKBRN" : sp = "598"; break;
    case "RQBNKRNB" : sp = "599"; break;
    case "RBQNBKRN" : sp = "600"; break;
    case "RQNBBKRN" : sp = "601"; break;
    case "RQNKBBRN" : sp = "602"; break;
    case "RQNKBRNB" : sp = "603"; break;
    case "RBQNKRBN" : sp = "604"; break;
    case "RQNBKRBN" : sp = "605"; break;
    case "RQNKRBBN" : sp = "606"; break;
    case "RQNKRNBB" : sp = "607"; break;
    case "BBRNQKRN" : sp = "608"; break;
    case "BRNBQKRN" : sp = "609"; break;
    case "BRNQKBRN" : sp = "610"; break;
    case "BRNQKRNB" : sp = "611"; break;
    case "RBBNQKRN" : sp = "612"; break;
    case "RNBBQKRN" : sp = "613"; break;
    case "RNBQKBRN" : sp = "614"; break;
    case "RNBQKRNB" : sp = "615"; break;
    case "RBNQBKRN" : sp = "616"; break;
    case "RNQBBKRN" : sp = "617"; break;
    case "RNQKBBRN" : sp = "618"; break;
    case "RNQKBRNB" : sp = "619"; break;
    case "RBNQKRBN" : sp = "620"; break;
    case "RNQBKRBN" : sp = "621"; break;
    case "RNQKRBBN" : sp = "622"; break;
    case "RNQKRNBB" : sp = "623"; break;
    case "BBRNKQRN" : sp = "624"; break;
    case "BRNBKQRN" : sp = "625"; break;
    case "BRNKQBRN" : sp = "626"; break;
    case "BRNKQRNB" : sp = "627"; break;
    case "RBBNKQRN" : sp = "628"; break;
    case "RNBBKQRN" : sp = "629"; break;
    case "RNBKQBRN" : sp = "630"; break;
    case "RNBKQRNB" : sp = "631"; break;
    case "RBNKBQRN" : sp = "632"; break;
    case "RNKBBQRN" : sp = "633"; break;
    case "RNKQBBRN" : sp = "634"; break;
    case "RNKQBRNB" : sp = "635"; break;
    case "RBNKQRBN" : sp = "636"; break;
    case "RNKBQRBN" : sp = "637"; break;
    case "RNKQRBBN" : sp = "638"; break;
    case "RNKQRNBB" : sp = "639"; break;
    case "BBRNKRQN" : sp = "640"; break;
    case "BRNBKRQN" : sp = "641"; break;
    case "BRNKRBQN" : sp = "642"; break;
    case "BRNKRQNB" : sp = "643"; break;
    case "RBBNKRQN" : sp = "644"; break;
    case "RNBBKRQN" : sp = "645"; break;
    case "RNBKRBQN" : sp = "646"; break;
    case "RNBKRQNB" : sp = "647"; break;
    case "RBNKBRQN" : sp = "648"; break;
    case "RNKBBRQN" : sp = "649"; break;
    case "RNKRBBQN" : sp = "650"; break;
    case "RNKRBQNB" : sp = "651"; break;
    case "RBNKRQBN" : sp = "652"; break;
    case "RNKBRQBN" : sp = "653"; break;
    case "RNKRQBBN" : sp = "654"; break;
    case "RNKRQNBB" : sp = "655"; break;
    case "BBRNKRNQ" : sp = "656"; break;
    case "BRNBKRNQ" : sp = "657"; break;
    case "BRNKRBNQ" : sp = "658"; break;
    case "BRNKRNQB" : sp = "659"; break;
    case "RBBNKRNQ" : sp = "660"; break;
    case "RNBBKRNQ" : sp = "661"; break;
    case "RNBKRBNQ" : sp = "662"; break;
    case "RNBKRNQB" : sp = "663"; break;
    case "RBNKBRNQ" : sp = "664"; break;
    case "RNKBBRNQ" : sp = "665"; break;
    case "RNKRBBNQ" : sp = "666"; break;
    case "RNKRBNQB" : sp = "667"; break;
    case "RBNKRNBQ" : sp = "668"; break;
    case "RNKBRNBQ" : sp = "669"; break;
    case "RNKRNBBQ" : sp = "670"; break;
    case "RNKRNQBB" : sp = "671"; break;
    case "BBQRKNNR" : sp = "672"; break;
    case "BQRBKNNR" : sp = "673"; break;
    case "BQRKNBNR" : sp = "674"; break;
    case "BQRKNNRB" : sp = "675"; break;
    case "QBBRKNNR" : sp = "676"; break;
    case "QRBBKNNR" : sp = "677"; break;
    case "QRBKNBNR" : sp = "678"; break;
    case "QRBKNNRB" : sp = "679"; break;
    case "QBRKBNNR" : sp = "680"; break;
    case "QRKBBNNR" : sp = "681"; break;
    case "QRKNBBNR" : sp = "682"; break;
    case "QRKNBNRB" : sp = "683"; break;
    case "QBRKNNBR" : sp = "684"; break;
    case "QRKBNNBR" : sp = "685"; break;
    case "QRKNNBBR" : sp = "686"; break;
    case "QRKNNRBB" : sp = "687"; break;
    case "BBRQKNNR" : sp = "688"; break;
    case "BRQBKNNR" : sp = "689"; break;
    case "BRQKNBNR" : sp = "690"; break;
    case "BRQKNNRB" : sp = "691"; break;
    case "RBBQKNNR" : sp = "692"; break;
    case "RQBBKNNR" : sp = "693"; break;
    case "RQBKNBNR" : sp = "694"; break;
    case "RQBKNNRB" : sp = "695"; break;
    case "RBQKBNNR" : sp = "696"; break;
    case "RQKBBNNR" : sp = "697"; break;
    case "RQKNBBNR" : sp = "698"; break;
    case "RQKNBNRB" : sp = "699"; break;
    case "RBQKNNBR" : sp = "700"; break;
    case "RQKBNNBR" : sp = "701"; break;
    case "RQKNNBBR" : sp = "702"; break;
    case "RQKNNRBB" : sp = "703"; break;
    case "BBRKQNNR" : sp = "704"; break;
    case "BRKBQNNR" : sp = "705"; break;
    case "BRKQNBNR" : sp = "706"; break;
    case "BRKQNNRB" : sp = "707"; break;
    case "RBBKQNNR" : sp = "708"; break;
    case "RKBBQNNR" : sp = "709"; break;
    case "RKBQNBNR" : sp = "710"; break;
    case "RKBQNNRB" : sp = "711"; break;
    case "RBKQBNNR" : sp = "712"; break;
    case "RKQBBNNR" : sp = "713"; break;
    case "RKQNBBNR" : sp = "714"; break;
    case "RKQNBNRB" : sp = "715"; break;
    case "RBKQNNBR" : sp = "716"; break;
    case "RKQBNNBR" : sp = "717"; break;
    case "RKQNNBBR" : sp = "718"; break;
    case "RKQNNRBB" : sp = "719"; break;
    case "BBRKNQNR" : sp = "720"; break;
    case "BRKBNQNR" : sp = "721"; break;
    case "BRKNQBNR" : sp = "722"; break;
    case "BRKNQNRB" : sp = "723"; break;
    case "RBBKNQNR" : sp = "724"; break;
    case "RKBBNQNR" : sp = "725"; break;
    case "RKBNQBNR" : sp = "726"; break;
    case "RKBNQNRB" : sp = "727"; break;
    case "RBKNBQNR" : sp = "728"; break;
    case "RKNBBQNR" : sp = "729"; break;
    case "RKNQBBNR" : sp = "730"; break;
    case "RKNQBNRB" : sp = "731"; break;
    case "RBKNQNBR" : sp = "732"; break;
    case "RKNBQNBR" : sp = "733"; break;
    case "RKNQNBBR" : sp = "734"; break;
    case "RKNQNRBB" : sp = "735"; break;
    case "BBRKNNQR" : sp = "736"; break;
    case "BRKBNNQR" : sp = "737"; break;
    case "BRKNNBQR" : sp = "738"; break;
    case "BRKNNQRB" : sp = "739"; break;
    case "RBBKNNQR" : sp = "740"; break;
    case "RKBBNNQR" : sp = "741"; break;
    case "RKBNNBQR" : sp = "742"; break;
    case "RKBNNQRB" : sp = "743"; break;
    case "RBKNBNQR" : sp = "744"; break;
    case "RKNBBNQR" : sp = "745"; break;
    case "RKNNBBQR" : sp = "746"; break;
    case "RKNNBQRB" : sp = "747"; break;
    case "RBKNNQBR" : sp = "748"; break;
    case "RKNBNQBR" : sp = "749"; break;
    case "RKNNQBBR" : sp = "750"; break;
    case "RKNNQRBB" : sp = "751"; break;
    case "BBRKNNRQ" : sp = "752"; break;
    case "BRKBNNRQ" : sp = "753"; break;
    case "BRKNNBRQ" : sp = "754"; break;
    case "BRKNNRQB" : sp = "755"; break;
    case "RBBKNNRQ" : sp = "756"; break;
    case "RKBBNNRQ" : sp = "757"; break;
    case "RKBNNBRQ" : sp = "758"; break;
    case "RKBNNRQB" : sp = "759"; break;
    case "RBKNBNRQ" : sp = "760"; break;
    case "RKNBBNRQ" : sp = "761"; break;
    case "RKNNBBRQ" : sp = "762"; break;
    case "RKNNBRQB" : sp = "763"; break;
    case "RBKNNRBQ" : sp = "764"; break;
    case "RKNBNRBQ" : sp = "765"; break;
    case "RKNNRBBQ" : sp = "766"; break;
    case "RKNNRQBB" : sp = "767"; break;
    case "BBQRKNRN" : sp = "768"; break;
    case "BQRBKNRN" : sp = "769"; break;
    case "BQRKNBRN" : sp = "770"; break;
    case "BQRKNRNB" : sp = "771"; break;
    case "QBBRKNRN" : sp = "772"; break;
    case "QRBBKNRN" : sp = "773"; break;
    case "QRBKNBRN" : sp = "774"; break;
    case "QRBKNRNB" : sp = "775"; break;
    case "QBRKBNRN" : sp = "776"; break;
    case "QRKBBNRN" : sp = "777"; break;
    case "QRKNBBRN" : sp = "778"; break;
    case "QRKNBRNB" : sp = "779"; break;
    case "QBRKNRBN" : sp = "780"; break;
    case "QRKBNRBN" : sp = "781"; break;
    case "QRKNRBBN" : sp = "782"; break;
    case "QRKNRNBB" : sp = "783"; break;
    case "BBRQKNRN" : sp = "784"; break;
    case "BRQBKNRN" : sp = "785"; break;
    case "BRQKNBRN" : sp = "786"; break;
    case "BRQKNRNB" : sp = "787"; break;
    case "RBBQKNRN" : sp = "788"; break;
    case "RQBBKNRN" : sp = "789"; break;
    case "RQBKNBRN" : sp = "790"; break;
    case "RQBKNRNB" : sp = "791"; break;
    case "RBQKBNRN" : sp = "792"; break;
    case "RQKBBNRN" : sp = "793"; break;
    case "RQKNBBRN" : sp = "794"; break;
    case "RQKNBRNB" : sp = "795"; break;
    case "RBQKNRBN" : sp = "796"; break;
    case "RQKBNRBN" : sp = "797"; break;
    case "RQKNRBBN" : sp = "798"; break;
    case "RQKNRNBB" : sp = "799"; break;
    case "BBRKQNRN" : sp = "800"; break;
    case "BRKBQNRN" : sp = "801"; break;
    case "BRKQNBRN" : sp = "802"; break;
    case "BRKQNRNB" : sp = "803"; break;
    case "RBBKQNRN" : sp = "804"; break;
    case "RKBBQNRN" : sp = "805"; break;
    case "RKBQNBRN" : sp = "806"; break;
    case "RKBQNRNB" : sp = "807"; break;
    case "RBKQBNRN" : sp = "808"; break;
    case "RKQBBNRN" : sp = "809"; break;
    case "RKQNBBRN" : sp = "810"; break;
    case "RKQNBRNB" : sp = "811"; break;
    case "RBKQNRBN" : sp = "812"; break;
    case "RKQBNRBN" : sp = "813"; break;
    case "RKQNRBBN" : sp = "814"; break;
    case "RKQNRNBB" : sp = "815"; break;
    case "BBRKNQRN" : sp = "816"; break;
    case "BRKBNQRN" : sp = "817"; break;
    case "BRKNQBRN" : sp = "818"; break;
    case "BRKNQRNB" : sp = "819"; break;
    case "RBBKNQRN" : sp = "820"; break;
    case "RKBBNQRN" : sp = "821"; break;
    case "RKBNQBRN" : sp = "822"; break;
    case "RKBNQRNB" : sp = "823"; break;
    case "RBKNBQRN" : sp = "824"; break;
    case "RKNBBQRN" : sp = "825"; break;
    case "RKNQBBRN" : sp = "826"; break;
    case "RKNQBRNB" : sp = "827"; break;
    case "RBKNQRBN" : sp = "828"; break;
    case "RKNBQRBN" : sp = "829"; break;
    case "RKNQRBBN" : sp = "830"; break;
    case "RKNQRNBB" : sp = "831"; break;
    case "BBRKNRQN" : sp = "832"; break;
    case "BRKBNRQN" : sp = "833"; break;
    case "BRKNRBQN" : sp = "834"; break;
    case "BRKNRQNB" : sp = "835"; break;
    case "RBBKNRQN" : sp = "836"; break;
    case "RKBBNRQN" : sp = "837"; break;
    case "RKBNRBQN" : sp = "838"; break;
    case "RKBNRQNB" : sp = "839"; break;
    case "RBKNBRQN" : sp = "840"; break;
    case "RKNBBRQN" : sp = "841"; break;
    case "RKNRBBQN" : sp = "842"; break;
    case "RKNRBQNB" : sp = "843"; break;
    case "RBKNRQBN" : sp = "844"; break;
    case "RKNBRQBN" : sp = "845"; break;
    case "RKNRQBBN" : sp = "846"; break;
    case "RKNRQNBB" : sp = "847"; break;
    case "BBRKNRNQ" : sp = "848"; break;
    case "BRKBNRNQ" : sp = "849"; break;
    case "BRKNRBNQ" : sp = "850"; break;
    case "BRKNRNQB" : sp = "851"; break;
    case "RBBKNRNQ" : sp = "852"; break;
    case "RKBBNRNQ" : sp = "853"; break;
    case "RKBNRBNQ" : sp = "854"; break;
    case "RKBNRNQB" : sp = "855"; break;
    case "RBKNBRNQ" : sp = "856"; break;
    case "RKNBBRNQ" : sp = "857"; break;
    case "RKNRBBNQ" : sp = "858"; break;
    case "RKNRBNQB" : sp = "859"; break;
    case "RBKNRNBQ" : sp = "860"; break;
    case "RKNBRNBQ" : sp = "861"; break;
    case "RKNRNBBQ" : sp = "862"; break;
    case "RKNRNQBB" : sp = "863"; break;
    case "BBQRKRNN" : sp = "864"; break;
    case "BQRBKRNN" : sp = "865"; break;
    case "BQRKRBNN" : sp = "866"; break;
    case "BQRKRNNB" : sp = "867"; break;
    case "QBBRKRNN" : sp = "868"; break;
    case "QRBBKRNN" : sp = "869"; break;
    case "QRBKRBNN" : sp = "870"; break;
    case "QRBKRNNB" : sp = "871"; break;
    case "QBRKBRNN" : sp = "872"; break;
    case "QRKBBRNN" : sp = "873"; break;
    case "QRKRBBNN" : sp = "874"; break;
    case "QRKRBNNB" : sp = "875"; break;
    case "QBRKRNBN" : sp = "876"; break;
    case "QRKBRNBN" : sp = "877"; break;
    case "QRKRNBBN" : sp = "878"; break;
    case "QRKRNNBB" : sp = "879"; break;
    case "BBRQKRNN" : sp = "880"; break;
    case "BRQBKRNN" : sp = "881"; break;
    case "BRQKRBNN" : sp = "882"; break;
    case "BRQKRNNB" : sp = "883"; break;
    case "RBBQKRNN" : sp = "884"; break;
    case "RQBBKRNN" : sp = "885"; break;
    case "RQBKRBNN" : sp = "886"; break;
    case "RQBKRNNB" : sp = "887"; break;
    case "RBQKBRNN" : sp = "888"; break;
    case "RQKBBRNN" : sp = "889"; break;
    case "RQKRBBNN" : sp = "890"; break;
    case "RQKRBNNB" : sp = "891"; break;
    case "RBQKRNBN" : sp = "892"; break;
    case "RQKBRNBN" : sp = "893"; break;
    case "RQKRNBBN" : sp = "894"; break;
    case "RQKRNNBB" : sp = "895"; break;
    case "BBRKQRNN" : sp = "896"; break;
    case "BRKBQRNN" : sp = "897"; break;
    case "BRKQRBNN" : sp = "898"; break;
    case "BRKQRNNB" : sp = "899"; break;
    case "RBBKQRNN" : sp = "900"; break;
    case "RKBBQRNN" : sp = "901"; break;
    case "RKBQRBNN" : sp = "902"; break;
    case "RKBQRNNB" : sp = "903"; break;
    case "RBKQBRNN" : sp = "904"; break;
    case "RKQBBRNN" : sp = "905"; break;
    case "RKQRBBNN" : sp = "906"; break;
    case "RKQRBNNB" : sp = "907"; break;
    case "RBKQRNBN" : sp = "908"; break;
    case "RKQBRNBN" : sp = "909"; break;
    case "RKQRNBBN" : sp = "910"; break;
    case "RKQRNNBB" : sp = "911"; break;
    case "BBRKRQNN" : sp = "912"; break;
    case "BRKBRQNN" : sp = "913"; break;
    case "BRKRQBNN" : sp = "914"; break;
    case "BRKRQNNB" : sp = "915"; break;
    case "RBBKRQNN" : sp = "916"; break;
    case "RKBBRQNN" : sp = "917"; break;
    case "RKBRQBNN" : sp = "918"; break;
    case "RKBRQNNB" : sp = "919"; break;
    case "RBKRBQNN" : sp = "920"; break;
    case "RKRBBQNN" : sp = "921"; break;
    case "RKRQBBNN" : sp = "922"; break;
    case "RKRQBNNB" : sp = "923"; break;
    case "RBKRQNBN" : sp = "924"; break;
    case "RKRBQNBN" : sp = "925"; break;
    case "RKRQNBBN" : sp = "926"; break;
    case "RKRQNNBB" : sp = "927"; break;
    case "BBRKRNQN" : sp = "928"; break;
    case "BRKBRNQN" : sp = "929"; break;
    case "BRKRNBQN" : sp = "930"; break;
    case "BRKRNQNB" : sp = "931"; break;
    case "RBBKRNQN" : sp = "932"; break;
    case "RKBBRNQN" : sp = "933"; break;
    case "RKBRNBQN" : sp = "934"; break;
    case "RKBRNQNB" : sp = "935"; break;
    case "RBKRBNQN" : sp = "936"; break;
    case "RKRBBNQN" : sp = "937"; break;
    case "RKRNBBQN" : sp = "938"; break;
    case "RKRNBQNB" : sp = "939"; break;
    case "RBKRNQBN" : sp = "940"; break;
    case "RKRBNQBN" : sp = "941"; break;
    case "RKRNQBBN" : sp = "942"; break;
    case "RKRNQNBB" : sp = "943"; break;
    case "BBRKRNNQ" : sp = "944"; break;
    case "BRKBRNNQ" : sp = "945"; break;
    case "BRKRNBNQ" : sp = "946"; break;
    case "BRKRNNQB" : sp = "947"; break;
    case "RBBKRNNQ" : sp = "948"; break;
    case "RKBBRNNQ" : sp = "949"; break;
    case "RKBRNBNQ" : sp = "950"; break;
    case "RKBRNNQB" : sp = "951"; break;
    case "RBKRBNNQ" : sp = "952"; break;
    case "RKRBBNNQ" : sp = "953"; break;
    case "RKRNBBNQ" : sp = "954"; break;
    case "RKRNBNQB" : sp = "955"; break;
    case "RBKRNNBQ" : sp = "956"; break;
    case "RKRBNNBQ" : sp = "957"; break;
    case "RKRNNBBQ" : sp = "958"; break;
    case "RKRNNQBB" : sp = "959"; break;

    default:
      sp = '???'; break;
  }

  return sp;

}
