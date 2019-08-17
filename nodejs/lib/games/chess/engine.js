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

var sp_table = {
  "000" : "BBQNNRKR",
  "001" : "BQNBNRKR",
  "002" : "BQNNRBKR",
  "003" : "BQNNRKRB",
  "004" : "QBBNNRKR",
  "005" : "QNBBNRKR",
  "006" : "QNBNRBKR",
  "007" : "QNBNRKRB",
  "008" : "QBNNBRKR",
  "009" : "QNNBBRKR",
  "010" : "QNNRBBKR",
  "011" : "QNNRBKRB",
  "012" : "QBNNRKBR",
  "013" : "QNNBRKBR",
  "014" : "QNNRKBBR",
  "015" : "QNNRKRBB",
  "016" : "BBNQNRKR",
  "017" : "BNQBNRKR",
  "018" : "BNQNRBKR",
  "019" : "BNQNRKRB",
  "020" : "NBBQNRKR",
  "021" : "NQBBNRKR",
  "022" : "NQBNRBKR",
  "023" : "NQBNRKRB",
  "024" : "NBQNBRKR",
  "025" : "NQNBBRKR",
  "026" : "NQNRBBKR",
  "027" : "NQNRBKRB",
  "028" : "NBQNRKBR",
  "029" : "NQNBRKBR",
  "030" : "NQNRKBBR",
  "031" : "NQNRKRBB",
  "032" : "BBNNQRKR",
  "033" : "BNNBQRKR",
  "034" : "BNNQRBKR",
  "035" : "BNNQRKRB",
  "036" : "NBBNQRKR",
  "037" : "NNBBQRKR",
  "038" : "NNBQRBKR",
  "039" : "NNBQRKRB",
  "040" : "NBNQBRKR",
  "041" : "NNQBBRKR",
  "042" : "NNQRBBKR",
  "043" : "NNQRBKRB",
  "044" : "NBNQRKBR",
  "045" : "NNQBRKBR",
  "046" : "NNQRKBBR",
  "047" : "NNQRKRBB",
  "048" : "BBNNRQKR",
  "049" : "BNNBRQKR",
  "050" : "BNNRQBKR",
  "051" : "BNNRQKRB",
  "052" : "NBBNRQKR",
  "053" : "NNBBRQKR",
  "054" : "NNBRQBKR",
  "055" : "NNBRQKRB",
  "056" : "NBNRBQKR",
  "057" : "NNRBBQKR",
  "058" : "NNRQBBKR",
  "059" : "NNRQBKRB",
  "060" : "NBNRQKBR",
  "061" : "NNRBQKBR",
  "062" : "NNRQKBBR",
  "063" : "NNRQKRBB",
  "064" : "BBNNRKQR",
  "065" : "BNNBRKQR",
  "066" : "BNNRKBQR",
  "067" : "BNNRKQRB",
  "068" : "NBBNRKQR",
  "069" : "NNBBRKQR",
  "070" : "NNBRKBQR",
  "071" : "NNBRKQRB",
  "072" : "NBNRBKQR",
  "073" : "NNRBBKQR",
  "074" : "NNRKBBQR",
  "075" : "NNRKBQRB",
  "076" : "NBNRKQBR",
  "077" : "NNRBKQBR",
  "078" : "NNRKQBBR",
  "079" : "NNRKQRBB",
  "080" : "BBNNRKRQ",
  "081" : "BNNBRKRQ",
  "082" : "BNNRKBRQ",
  "083" : "BNNRKRQB",
  "084" : "NBBNRKRQ",
  "085" : "NNBBRKRQ",
  "086" : "NNBRKBRQ",
  "087" : "NNBRKRQB",
  "088" : "NBNRBKRQ",
  "089" : "NNRBBKRQ",
  "090" : "NNRKBBRQ",
  "091" : "NNRKBRQB",
  "092" : "NBNRKRBQ",
  "093" : "NNRBKRBQ",
  "094" : "NNRKRBBQ",
  "095" : "NNRKRQBB",
  "096" : "BBQNRNKR",
  "097" : "BQNBRNKR",
  "098" : "BQNRNBKR",
  "099" : "BQNRNKRB",
  "100" : "QBBNRNKR",
  "101" : "QNBBRNKR",
  "102" : "QNBRNBKR",
  "103" : "QNBRNKRB",
  "104" : "QBNRBNKR",
  "105" : "QNRBBNKR",
  "106" : "QNRNBBKR",
  "107" : "QNRNBKRB",
  "108" : "QBNRNKBR",
  "109" : "QNRBNKBR",
  "110" : "QNRNKBBR",
  "111" : "QNRNKRBB",
  "112" : "BBNQRNKR",
  "113" : "BNQBRNKR",
  "114" : "BNQRNBKR",
  "115" : "BNQRNKRB",
  "116" : "NBBQRNKR",
  "117" : "NQBBRNKR",
  "118" : "NQBRNBKR",
  "119" : "NQBRNKRB",
  "120" : "NBQRBNKR",
  "121" : "NQRBBNKR",
  "122" : "NQRNBBKR",
  "123" : "NQRNBKRB",
  "124" : "NBQRNKBR",
  "125" : "NQRBNKBR",
  "126" : "NQRNKBBR",
  "127" : "NQRNKRBB",
  "128" : "BBNRQNKR",
  "129" : "BNRBQNKR",
  "130" : "BNRQNBKR",
  "131" : "BNRQNKRB",
  "132" : "NBBRQNKR",
  "133" : "NRBBQNKR",
  "134" : "NRBQNBKR",
  "135" : "NRBQNKRB",
  "136" : "NBRQBNKR",
  "137" : "NRQBBNKR",
  "138" : "NRQNBBKR",
  "139" : "NRQNBKRB",
  "140" : "NBRQNKBR",
  "141" : "NRQBNKBR",
  "142" : "NRQNKBBR",
  "143" : "NRQNKRBB",
  "144" : "BBNRNQKR",
  "145" : "BNRBNQKR",
  "146" : "BNRNQBKR",
  "147" : "BNRNQKRB",
  "148" : "NBBRNQKR",
  "149" : "NRBBNQKR",
  "150" : "NRBNQBKR",
  "151" : "NRBNQKRB",
  "152" : "NBRNBQKR",
  "153" : "NRNBBQKR",
  "154" : "NRNQBBKR",
  "155" : "NRNQBKRB",
  "156" : "NBRNQKBR",
  "157" : "NRNBQKBR",
  "158" : "NRNQKBBR",
  "159" : "NRNQKRBB",
  "160" : "BBNRNKQR",
  "161" : "BNRBNKQR",
  "162" : "BNRNKBQR",
  "163" : "BNRNKQRB",
  "164" : "NBBRNKQR",
  "165" : "NRBBNKQR",
  "166" : "NRBNKBQR",
  "167" : "NRBNKQRB",
  "168" : "NBRNBKQR",
  "169" : "NRNBBKQR",
  "170" : "NRNKBBQR",
  "171" : "NRNKBQRB",
  "172" : "NBRNKQBR",
  "173" : "NRNBKQBR",
  "174" : "NRNKQBBR",
  "175" : "NRNKQRBB",
  "176" : "BBNRNKRQ",
  "177" : "BNRBNKRQ",
  "178" : "BNRNKBRQ",
  "179" : "BNRNKRQB",
  "180" : "NBBRNKRQ",
  "181" : "NRBBNKRQ",
  "182" : "NRBNKBRQ",
  "183" : "NRBNKRQB",
  "184" : "NBRNBKRQ",
  "185" : "NRNBBKRQ",
  "186" : "NRNKBBRQ",
  "187" : "NRNKBRQB",
  "188" : "NBRNKRBQ",
  "189" : "NRNBKRBQ",
  "190" : "NRNKRBBQ",
  "191" : "NRNKRQBB",
  "192" : "BBQNRKNR",
  "193" : "BQNBRKNR",
  "194" : "BQNRKBNR",
  "195" : "BQNRKNRB",
  "196" : "QBBNRKNR",
  "197" : "QNBBRKNR",
  "198" : "QNBRKBNR",
  "199" : "QNBRKNRB",
  "200" : "QBNRBKNR",
  "201" : "QNRBBKNR",
  "202" : "QNRKBBNR",
  "203" : "QNRKBNRB",
  "204" : "QBNRKNBR",
  "205" : "QNRBKNBR",
  "206" : "QNRKNBBR",
  "207" : "QNRKNRBB",
  "208" : "BBNQRKNR",
  "209" : "BNQBRKNR",
  "210" : "BNQRKBNR",
  "211" : "BNQRKNRB",
  "212" : "NBBQRKNR",
  "213" : "NQBBRKNR",
  "214" : "NQBRKBNR",
  "215" : "NQBRKNRB",
  "216" : "NBQRBKNR",
  "217" : "NQRBBKNR",
  "218" : "NQRKBBNR",
  "219" : "NQRKBNRB",
  "220" : "NBQRKNBR",
  "221" : "NQRBKNBR",
  "222" : "NQRKNBBR",
  "223" : "NQRKNRBB",
  "224" : "BBNRQKNR",
  "225" : "BNRBQKNR",
  "226" : "BNRQKBNR",
  "227" : "BNRQKNRB",
  "228" : "NBBRQKNR",
  "229" : "NRBBQKNR",
  "230" : "NRBQKBNR",
  "231" : "NRBQKNRB",
  "232" : "NBRQBKNR",
  "233" : "NRQBBKNR",
  "234" : "NRQKBBNR",
  "235" : "NRQKBNRB",
  "236" : "NBRQKNBR",
  "237" : "NRQBKNBR",
  "238" : "NRQKNBBR",
  "239" : "NRQKNRBB",
  "240" : "BBNRKQNR",
  "241" : "BNRBKQNR",
  "242" : "BNRKQBNR",
  "243" : "BNRKQNRB",
  "244" : "NBBRKQNR",
  "245" : "NRBBKQNR",
  "246" : "NRBKQBNR",
  "247" : "NRBKQNRB",
  "248" : "NBRKBQNR",
  "249" : "NRKBBQNR",
  "250" : "NRKQBBNR",
  "251" : "NRKQBNRB",
  "252" : "NBRKQNBR",
  "253" : "NRKBQNBR",
  "254" : "NRKQNBBR",
  "255" : "NRKQNRBB",
  "256" : "BBNRKNQR",
  "257" : "BNRBKNQR",
  "258" : "BNRKNBQR",
  "259" : "BNRKNQRB",
  "260" : "NBBRKNQR",
  "261" : "NRBBKNQR",
  "262" : "NRBKNBQR",
  "263" : "NRBKNQRB",
  "264" : "NBRKBNQR",
  "265" : "NRKBBNQR",
  "266" : "NRKNBBQR",
  "267" : "NRKNBQRB",
  "268" : "NBRKNQBR",
  "269" : "NRKBNQBR",
  "270" : "NRKNQBBR",
  "271" : "NRKNQRBB",
  "272" : "BBNRKNRQ",
  "273" : "BNRBKNRQ",
  "274" : "BNRKNBRQ",
  "275" : "BNRKNRQB",
  "276" : "NBBRKNRQ",
  "277" : "NRBBKNRQ",
  "278" : "NRBKNBRQ",
  "279" : "NRBKNRQB",
  "280" : "NBRKBNRQ",
  "281" : "NRKBBNRQ",
  "282" : "NRKNBBRQ",
  "283" : "NRKNBRQB",
  "284" : "NBRKNRBQ",
  "285" : "NRKBNRBQ",
  "286" : "NRKNRBBQ",
  "287" : "NRKNRQBB",
  "288" : "BBQNRKRN",
  "289" : "BQNBRKRN",
  "290" : "BQNRKBRN",
  "291" : "BQNRKRNB",
  "292" : "QBBNRKRN",
  "293" : "QNBBRKRN",
  "294" : "QNBRKBRN",
  "295" : "QNBRKRNB",
  "296" : "QBNRBKRN",
  "297" : "QNRBBKRN",
  "298" : "QNRKBBRN",
  "299" : "QNRKBRNB",
  "300" : "QBNRKRBN",
  "301" : "QNRBKRBN",
  "302" : "QNRKRBBN",
  "303" : "QNRKRNBB",
  "304" : "BBNQRKRN",
  "305" : "BNQBRKRN",
  "306" : "BNQRKBRN",
  "307" : "BNQRKRNB",
  "308" : "NBBQRKRN",
  "309" : "NQBBRKRN",
  "310" : "NQBRKBRN",
  "311" : "NQBRKRNB",
  "312" : "NBQRBKRN",
  "313" : "NQRBBKRN",
  "314" : "NQRKBBRN",
  "315" : "NQRKBRNB",
  "316" : "NBQRKRBN",
  "317" : "NQRBKRBN",
  "318" : "NQRKRBBN",
  "319" : "NQRKRNBB",
  "320" : "BBNRQKRN",
  "321" : "BNRBQKRN",
  "322" : "BNRQKBRN",
  "323" : "BNRQKRNB",
  "324" : "NBBRQKRN",
  "325" : "NRBBQKRN",
  "326" : "NRBQKBRN",
  "327" : "NRBQKRNB",
  "328" : "NBRQBKRN",
  "329" : "NRQBBKRN",
  "330" : "NRQKBBRN",
  "331" : "NRQKBRNB",
  "332" : "NBRQKRBN",
  "333" : "NRQBKRBN",
  "334" : "NRQKRBBN",
  "335" : "NRQKRNBB",
  "336" : "BBNRKQRN",
  "337" : "BNRBKQRN",
  "338" : "BNRKQBRN",
  "339" : "BNRKQRNB",
  "340" : "NBBRKQRN",
  "341" : "NRBBKQRN",
  "342" : "NRBKQBRN",
  "343" : "NRBKQRNB",
  "344" : "NBRKBQRN",
  "345" : "NRKBBQRN",
  "346" : "NRKQBBRN",
  "347" : "NRKQBRNB",
  "348" : "NBRKQRBN",
  "349" : "NRKBQRBN",
  "350" : "NRKQRBBN",
  "351" : "NRKQRNBB",
  "352" : "BBNRKRQN",
  "353" : "BNRBKRQN",
  "354" : "BNRKRBQN",
  "355" : "BNRKRQNB",
  "356" : "NBBRKRQN",
  "357" : "NRBBKRQN",
  "358" : "NRBKRBQN",
  "359" : "NRBKRQNB",
  "360" : "NBRKBRQN",
  "361" : "NRKBBRQN",
  "362" : "NRKRBBQN",
  "363" : "NRKRBQNB",
  "364" : "NBRKRQBN",
  "365" : "NRKBRQBN",
  "366" : "NRKRQBBN",
  "367" : "NRKRQNBB",
  "368" : "BBNRKRNQ",
  "369" : "BNRBKRNQ",
  "370" : "BNRKRBNQ",
  "371" : "BNRKRNQB",
  "372" : "NBBRKRNQ",
  "373" : "NRBBKRNQ",
  "374" : "NRBKRBNQ",
  "375" : "NRBKRNQB",
  "376" : "NBRKBRNQ",
  "377" : "NRKBBRNQ",
  "378" : "NRKRBBNQ",
  "379" : "NRKRBNQB",
  "380" : "NBRKRNBQ",
  "381" : "NRKBRNBQ",
  "382" : "NRKRNBBQ",
  "383" : "NRKRNQBB",
  "384" : "BBQRNNKR",
  "385" : "BQRBNNKR",
  "386" : "BQRNNBKR",
  "387" : "BQRNNKRB",
  "388" : "QBBRNNKR",
  "389" : "QRBBNNKR",
  "390" : "QRBNNBKR",
  "391" : "QRBNNKRB",
  "392" : "QBRNBNKR",
  "393" : "QRNBBNKR",
  "394" : "QRNNBBKR",
  "395" : "QRNNBKRB",
  "396" : "QBRNNKBR",
  "397" : "QRNBNKBR",
  "398" : "QRNNKBBR",
  "399" : "QRNNKRBB",
  "400" : "BBRQNNKR",
  "401" : "BRQBNNKR",
  "402" : "BRQNNBKR",
  "403" : "BRQNNKRB",
  "404" : "RBBQNNKR",
  "405" : "RQBBNNKR",
  "406" : "RQBNNBKR",
  "407" : "RQBNNKRB",
  "408" : "RBQNBNKR",
  "409" : "RQNBBNKR",
  "410" : "RQNNBBKR",
  "411" : "RQNNBKRB",
  "412" : "RBQNNKBR",
  "413" : "RQNBNKBR",
  "414" : "RQNNKBBR",
  "415" : "RQNNKRBB",
  "416" : "BBRNQNKR",
  "417" : "BRNBQNKR",
  "418" : "BRNQNBKR",
  "419" : "BRNQNKRB",
  "420" : "RBBNQNKR",
  "421" : "RNBBQNKR",
  "422" : "RNBQNBKR",
  "423" : "RNBQNKRB",
  "424" : "RBNQBNKR",
  "425" : "RNQBBNKR",
  "426" : "RNQNBBKR",
  "427" : "RNQNBKRB",
  "428" : "RBNQNKBR",
  "429" : "RNQBNKBR",
  "430" : "RNQNKBBR",
  "431" : "RNQNKRBB",
  "432" : "BBRNNQKR",
  "433" : "BRNBNQKR",
  "434" : "BRNNQBKR",
  "435" : "BRNNQKRB",
  "436" : "RBBNNQKR",
  "437" : "RNBBNQKR",
  "438" : "RNBNQBKR",
  "439" : "RNBNQKRB",
  "440" : "RBNNBQKR",
  "441" : "RNNBBQKR",
  "442" : "RNNQBBKR",
  "443" : "RNNQBKRB",
  "444" : "RBNNQKBR",
  "445" : "RNNBQKBR",
  "446" : "RNNQKBBR",
  "447" : "RNNQKRBB",
  "448" : "BBRNNKQR",
  "449" : "BRNBNKQR",
  "450" : "BRNNKBQR",
  "451" : "BRNNKQRB",
  "452" : "RBBNNKQR",
  "453" : "RNBBNKQR",
  "454" : "RNBNKBQR",
  "455" : "RNBNKQRB",
  "456" : "RBNNBKQR",
  "457" : "RNNBBKQR",
  "458" : "RNNKBBQR",
  "459" : "RNNKBQRB",
  "460" : "RBNNKQBR",
  "461" : "RNNBKQBR",
  "462" : "RNNKQBBR",
  "463" : "RNNKQRBB",
  "464" : "BBRNNKRQ",
  "465" : "BRNBNKRQ",
  "466" : "BRNNKBRQ",
  "467" : "BRNNKRQB",
  "468" : "RBBNNKRQ",
  "469" : "RNBBNKRQ",
  "470" : "RNBNKBRQ",
  "471" : "RNBNKRQB",
  "472" : "RBNNBKRQ",
  "473" : "RNNBBKRQ",
  "474" : "RNNKBBRQ",
  "475" : "RNNKBRQB",
  "476" : "RBNNKRBQ",
  "477" : "RNNBKRBQ",
  "478" : "RNNKRBBQ",
  "479" : "RNNKRQBB",
  "480" : "BBQRNKNR",
  "481" : "BQRBNKNR",
  "482" : "BQRNKBNR",
  "483" : "BQRNKNRB",
  "484" : "QBBRNKNR",
  "485" : "QRBBNKNR",
  "486" : "QRBNKBNR",
  "487" : "QRBNKNRB",
  "488" : "QBRNBKNR",
  "489" : "QRNBBKNR",
  "490" : "QRNKBBNR",
  "491" : "QRNKBNRB",
  "492" : "QBRNKNBR",
  "493" : "QRNBKNBR",
  "494" : "QRNKNBBR",
  "495" : "QRNKNRBB",
  "496" : "BBRQNKNR",
  "497" : "BRQBNKNR",
  "498" : "BRQNKBNR",
  "499" : "BRQNKNRB",
  "500" : "RBBQNKNR",
  "501" : "RQBBNKNR",
  "502" : "RQBNKBNR",
  "503" : "RQBNKNRB",
  "504" : "RBQNBKNR",
  "505" : "RQNBBKNR",
  "506" : "RQNKBBNR",
  "507" : "RQNKBNRB",
  "508" : "RBQNKNBR",
  "509" : "RQNBKNBR",
  "510" : "RQNKNBBR",
  "511" : "RQNKNRBB",
  "512" : "BBRNQKNR",
  "513" : "BRNBQKNR",
  "514" : "BRNQKBNR",
  "515" : "BRNQKNRB",
  "516" : "RBBNQKNR",
  "517" : "RNBBQKNR",
  "518" : "RNBQKBNR",
  "519" : "RNBQKNRB",
  "520" : "RBNQBKNR",
  "521" : "RNQBBKNR",
  "522" : "RNQKBBNR",
  "523" : "RNQKBNRB",
  "524" : "RBNQKNBR",
  "525" : "RNQBKNBR",
  "526" : "RNQKNBBR",
  "527" : "RNQKNRBB",
  "528" : "BBRNKQNR",
  "529" : "BRNBKQNR",
  "530" : "BRNKQBNR",
  "531" : "BRNKQNRB",
  "532" : "RBBNKQNR",
  "533" : "RNBBKQNR",
  "534" : "RNBKQBNR",
  "535" : "RNBKQNRB",
  "536" : "RBNKBQNR",
  "537" : "RNKBBQNR",
  "538" : "RNKQBBNR",
  "539" : "RNKQBNRB",
  "540" : "RBNKQNBR",
  "541" : "RNKBQNBR",
  "542" : "RNKQNBBR",
  "543" : "RNKQNRBB",
  "544" : "BBRNKNQR",
  "545" : "BRNBKNQR",
  "546" : "BRNKNBQR",
  "547" : "BRNKNQRB",
  "548" : "RBBNKNQR",
  "549" : "RNBBKNQR",
  "550" : "RNBKNBQR",
  "551" : "RNBKNQRB",
  "552" : "RBNKBNQR",
  "553" : "RNKBBNQR",
  "554" : "RNKNBBQR",
  "555" : "RNKNBQRB",
  "556" : "RBNKNQBR",
  "557" : "RNKBNQBR",
  "558" : "RNKNQBBR",
  "559" : "RNKNQRBB",
  "560" : "BBRNKNRQ",
  "561" : "BRNBKNRQ",
  "562" : "BRNKNBRQ",
  "563" : "BRNKNRQB",
  "564" : "RBBNKNRQ",
  "565" : "RNBBKNRQ",
  "566" : "RNBKNBRQ",
  "567" : "RNBKNRQB",
  "568" : "RBNKBNRQ",
  "569" : "RNKBBNRQ",
  "570" : "RNKNBBRQ",
  "571" : "RNKNBRQB",
  "572" : "RBNKNRBQ",
  "573" : "RNKBNRBQ",
  "574" : "RNKNRBBQ",
  "575" : "RNKNRQBB",
  "576" : "BBQRNKRN",
  "577" : "BQRBNKRN",
  "578" : "BQRNKBRN",
  "579" : "BQRNKRNB",
  "580" : "QBBRNKRN",
  "581" : "QRBBNKRN",
  "582" : "QRBNKBRN",
  "583" : "QRBNKRNB",
  "584" : "QBRNBKRN",
  "585" : "QRNBBKRN",
  "586" : "QRNKBBRN",
  "587" : "QRNKBRNB",
  "588" : "QBRNKRBN",
  "589" : "QRNBKRBN",
  "590" : "QRNKRBBN",
  "591" : "QRNKRNBB",
  "592" : "BBRQNKRN",
  "593" : "BRQBNKRN",
  "594" : "BRQNKBRN",
  "595" : "BRQNKRNB",
  "596" : "RBBQNKRN",
  "597" : "RQBBNKRN",
  "598" : "RQBNKBRN",
  "599" : "RQBNKRNB",
  "600" : "RBQNBKRN",
  "601" : "RQNBBKRN",
  "602" : "RQNKBBRN",
  "603" : "RQNKBRNB",
  "604" : "RBQNKRBN",
  "605" : "RQNBKRBN",
  "606" : "RQNKRBBN",
  "607" : "RQNKRNBB",
  "608" : "BBRNQKRN",
  "609" : "BRNBQKRN",
  "610" : "BRNQKBRN",
  "611" : "BRNQKRNB",
  "612" : "RBBNQKRN",
  "613" : "RNBBQKRN",
  "614" : "RNBQKBRN",
  "615" : "RNBQKRNB",
  "616" : "RBNQBKRN",
  "617" : "RNQBBKRN",
  "618" : "RNQKBBRN",
  "619" : "RNQKBRNB",
  "620" : "RBNQKRBN",
  "621" : "RNQBKRBN",
  "622" : "RNQKRBBN",
  "623" : "RNQKRNBB",
  "624" : "BBRNKQRN",
  "625" : "BRNBKQRN",
  "626" : "BRNKQBRN",
  "627" : "BRNKQRNB",
  "628" : "RBBNKQRN",
  "629" : "RNBBKQRN",
  "630" : "RNBKQBRN",
  "631" : "RNBKQRNB",
  "632" : "RBNKBQRN",
  "633" : "RNKBBQRN",
  "634" : "RNKQBBRN",
  "635" : "RNKQBRNB",
  "636" : "RBNKQRBN",
  "637" : "RNKBQRBN",
  "638" : "RNKQRBBN",
  "639" : "RNKQRNBB",
  "640" : "BBRNKRQN",
  "641" : "BRNBKRQN",
  "642" : "BRNKRBQN",
  "643" : "BRNKRQNB",
  "644" : "RBBNKRQN",
  "645" : "RNBBKRQN",
  "646" : "RNBKRBQN",
  "647" : "RNBKRQNB",
  "648" : "RBNKBRQN",
  "649" : "RNKBBRQN",
  "650" : "RNKRBBQN",
  "651" : "RNKRBQNB",
  "652" : "RBNKRQBN",
  "653" : "RNKBRQBN",
  "654" : "RNKRQBBN",
  "655" : "RNKRQNBB",
  "656" : "BBRNKRNQ",
  "657" : "BRNBKRNQ",
  "658" : "BRNKRBNQ",
  "659" : "BRNKRNQB",
  "660" : "RBBNKRNQ",
  "661" : "RNBBKRNQ",
  "662" : "RNBKRBNQ",
  "663" : "RNBKRNQB",
  "664" : "RBNKBRNQ",
  "665" : "RNKBBRNQ",
  "666" : "RNKRBBNQ",
  "667" : "RNKRBNQB",
  "668" : "RBNKRNBQ",
  "669" : "RNKBRNBQ",
  "670" : "RNKRNBBQ",
  "671" : "RNKRNQBB",
  "672" : "BBQRKNNR",
  "673" : "BQRBKNNR",
  "674" : "BQRKNBNR",
  "675" : "BQRKNNRB",
  "676" : "QBBRKNNR",
  "677" : "QRBBKNNR",
  "678" : "QRBKNBNR",
  "679" : "QRBKNNRB",
  "680" : "QBRKBNNR",
  "681" : "QRKBBNNR",
  "682" : "QRKNBBNR",
  "683" : "QRKNBNRB",
  "684" : "QBRKNNBR",
  "685" : "QRKBNNBR",
  "686" : "QRKNNBBR",
  "687" : "QRKNNRBB",
  "688" : "BBRQKNNR",
  "689" : "BRQBKNNR",
  "690" : "BRQKNBNR",
  "691" : "BRQKNNRB",
  "692" : "RBBQKNNR",
  "693" : "RQBBKNNR",
  "694" : "RQBKNBNR",
  "695" : "RQBKNNRB",
  "696" : "RBQKBNNR",
  "697" : "RQKBBNNR",
  "698" : "RQKNBBNR",
  "699" : "RQKNBNRB",
  "700" : "RBQKNNBR",
  "701" : "RQKBNNBR",
  "702" : "RQKNNBBR",
  "703" : "RQKNNRBB",
  "704" : "BBRKQNNR",
  "705" : "BRKBQNNR",
  "706" : "BRKQNBNR",
  "707" : "BRKQNNRB",
  "708" : "RBBKQNNR",
  "709" : "RKBBQNNR",
  "710" : "RKBQNBNR",
  "711" : "RKBQNNRB",
  "712" : "RBKQBNNR",
  "713" : "RKQBBNNR",
  "714" : "RKQNBBNR",
  "715" : "RKQNBNRB",
  "716" : "RBKQNNBR",
  "717" : "RKQBNNBR",
  "718" : "RKQNNBBR",
  "719" : "RKQNNRBB",
  "720" : "BBRKNQNR",
  "721" : "BRKBNQNR",
  "722" : "BRKNQBNR",
  "723" : "BRKNQNRB",
  "724" : "RBBKNQNR",
  "725" : "RKBBNQNR",
  "726" : "RKBNQBNR",
  "727" : "RKBNQNRB",
  "728" : "RBKNBQNR",
  "729" : "RKNBBQNR",
  "730" : "RKNQBBNR",
  "731" : "RKNQBNRB",
  "732" : "RBKNQNBR",
  "733" : "RKNBQNBR",
  "734" : "RKNQNBBR",
  "735" : "RKNQNRBB",
  "736" : "BBRKNNQR",
  "737" : "BRKBNNQR",
  "738" : "BRKNNBQR",
  "739" : "BRKNNQRB",
  "740" : "RBBKNNQR",
  "741" : "RKBBNNQR",
  "742" : "RKBNNBQR",
  "743" : "RKBNNQRB",
  "744" : "RBKNBNQR",
  "745" : "RKNBBNQR",
  "746" : "RKNNBBQR",
  "747" : "RKNNBQRB",
  "748" : "RBKNNQBR",
  "749" : "RKNBNQBR",
  "750" : "RKNNQBBR",
  "751" : "RKNNQRBB",
  "752" : "BBRKNNRQ",
  "753" : "BRKBNNRQ",
  "754" : "BRKNNBRQ",
  "755" : "BRKNNRQB",
  "756" : "RBBKNNRQ",
  "757" : "RKBBNNRQ",
  "758" : "RKBNNBRQ",
  "759" : "RKBNNRQB",
  "760" : "RBKNBNRQ",
  "761" : "RKNBBNRQ",
  "762" : "RKNNBBRQ",
  "763" : "RKNNBRQB",
  "764" : "RBKNNRBQ",
  "765" : "RKNBNRBQ",
  "766" : "RKNNRBBQ",
  "767" : "RKNNRQBB",
  "768" : "BBQRKNRN",
  "769" : "BQRBKNRN",
  "770" : "BQRKNBRN",
  "771" : "BQRKNRNB",
  "772" : "QBBRKNRN",
  "773" : "QRBBKNRN",
  "774" : "QRBKNBRN",
  "775" : "QRBKNRNB",
  "776" : "QBRKBNRN",
  "777" : "QRKBBNRN",
  "778" : "QRKNBBRN",
  "779" : "QRKNBRNB",
  "780" : "QBRKNRBN",
  "781" : "QRKBNRBN",
  "782" : "QRKNRBBN",
  "783" : "QRKNRNBB",
  "784" : "BBRQKNRN",
  "785" : "BRQBKNRN",
  "786" : "BRQKNBRN",
  "787" : "BRQKNRNB",
  "788" : "RBBQKNRN",
  "789" : "RQBBKNRN",
  "790" : "RQBKNBRN",
  "791" : "RQBKNRNB",
  "792" : "RBQKBNRN",
  "793" : "RQKBBNRN",
  "794" : "RQKNBBRN",
  "795" : "RQKNBRNB",
  "796" : "RBQKNRBN",
  "797" : "RQKBNRBN",
  "798" : "RQKNRBBN",
  "799" : "RQKNRNBB",
  "800" : "BBRKQNRN",
  "801" : "BRKBQNRN",
  "802" : "BRKQNBRN",
  "803" : "BRKQNRNB",
  "804" : "RBBKQNRN",
  "805" : "RKBBQNRN",
  "806" : "RKBQNBRN",
  "807" : "RKBQNRNB",
  "808" : "RBKQBNRN",
  "809" : "RKQBBNRN",
  "810" : "RKQNBBRN",
  "811" : "RKQNBRNB",
  "812" : "RBKQNRBN",
  "813" : "RKQBNRBN",
  "814" : "RKQNRBBN",
  "815" : "RKQNRNBB",
  "816" : "BBRKNQRN",
  "817" : "BRKBNQRN",
  "818" : "BRKNQBRN",
  "819" : "BRKNQRNB",
  "820" : "RBBKNQRN",
  "821" : "RKBBNQRN",
  "822" : "RKBNQBRN",
  "823" : "RKBNQRNB",
  "824" : "RBKNBQRN",
  "825" : "RKNBBQRN",
  "826" : "RKNQBBRN",
  "827" : "RKNQBRNB",
  "828" : "RBKNQRBN",
  "829" : "RKNBQRBN",
  "830" : "RKNQRBBN",
  "831" : "RKNQRNBB",
  "832" : "BBRKNRQN",
  "833" : "BRKBNRQN",
  "834" : "BRKNRBQN",
  "835" : "BRKNRQNB",
  "836" : "RBBKNRQN",
  "837" : "RKBBNRQN",
  "838" : "RKBNRBQN",
  "839" : "RKBNRQNB",
  "840" : "RBKNBRQN",
  "841" : "RKNBBRQN",
  "842" : "RKNRBBQN",
  "843" : "RKNRBQNB",
  "844" : "RBKNRQBN",
  "845" : "RKNBRQBN",
  "846" : "RKNRQBBN",
  "847" : "RKNRQNBB",
  "848" : "BBRKNRNQ",
  "849" : "BRKBNRNQ",
  "850" : "BRKNRBNQ",
  "851" : "BRKNRNQB",
  "852" : "RBBKNRNQ",
  "853" : "RKBBNRNQ",
  "854" : "RKBNRBNQ",
  "855" : "RKBNRNQB",
  "856" : "RBKNBRNQ",
  "857" : "RKNBBRNQ",
  "858" : "RKNRBBNQ",
  "859" : "RKNRBNQB",
  "860" : "RBKNRNBQ",
  "861" : "RKNBRNBQ",
  "862" : "RKNRNBBQ",
  "863" : "RKNRNQBB",
  "864" : "BBQRKRNN",
  "865" : "BQRBKRNN",
  "866" : "BQRKRBNN",
  "867" : "BQRKRNNB",
  "868" : "QBBRKRNN",
  "869" : "QRBBKRNN",
  "870" : "QRBKRBNN",
  "871" : "QRBKRNNB",
  "872" : "QBRKBRNN",
  "873" : "QRKBBRNN",
  "874" : "QRKRBBNN",
  "875" : "QRKRBNNB",
  "876" : "QBRKRNBN",
  "877" : "QRKBRNBN",
  "878" : "QRKRNBBN",
  "879" : "QRKRNNBB",
  "880" : "BBRQKRNN",
  "881" : "BRQBKRNN",
  "882" : "BRQKRBNN",
  "883" : "BRQKRNNB",
  "884" : "RBBQKRNN",
  "885" : "RQBBKRNN",
  "886" : "RQBKRBNN",
  "887" : "RQBKRNNB",
  "888" : "RBQKBRNN",
  "889" : "RQKBBRNN",
  "890" : "RQKRBBNN",
  "891" : "RQKRBNNB",
  "892" : "RBQKRNBN",
  "893" : "RQKBRNBN",
  "894" : "RQKRNBBN",
  "895" : "RQKRNNBB",
  "896" : "BBRKQRNN",
  "897" : "BRKBQRNN",
  "898" : "BRKQRBNN",
  "899" : "BRKQRNNB",
  "900" : "RBBKQRNN",
  "901" : "RKBBQRNN",
  "902" : "RKBQRBNN",
  "903" : "RKBQRNNB",
  "904" : "RBKQBRNN",
  "905" : "RKQBBRNN",
  "906" : "RKQRBBNN",
  "907" : "RKQRBNNB",
  "908" : "RBKQRNBN",
  "909" : "RKQBRNBN",
  "910" : "RKQRNBBN",
  "911" : "RKQRNNBB",
  "912" : "BBRKRQNN",
  "913" : "BRKBRQNN",
  "914" : "BRKRQBNN",
  "915" : "BRKRQNNB",
  "916" : "RBBKRQNN",
  "917" : "RKBBRQNN",
  "918" : "RKBRQBNN",
  "919" : "RKBRQNNB",
  "920" : "RBKRBQNN",
  "921" : "RKRBBQNN",
  "922" : "RKRQBBNN",
  "923" : "RKRQBNNB",
  "924" : "RBKRQNBN",
  "925" : "RKRBQNBN",
  "926" : "RKRQNBBN",
  "927" : "RKRQNNBB",
  "928" : "BBRKRNQN",
  "929" : "BRKBRNQN",
  "930" : "BRKRNBQN",
  "931" : "BRKRNQNB",
  "932" : "RBBKRNQN",
  "933" : "RKBBRNQN",
  "934" : "RKBRNBQN",
  "935" : "RKBRNQNB",
  "936" : "RBKRBNQN",
  "937" : "RKRBBNQN",
  "938" : "RKRNBBQN",
  "939" : "RKRNBQNB",
  "940" : "RBKRNQBN",
  "941" : "RKRBNQBN",
  "942" : "RKRNQBBN",
  "943" : "RKRNQNBB",
  "944" : "BBRKRNNQ",
  "945" : "BRKBRNNQ",
  "946" : "BRKRNBNQ",
  "947" : "BRKRNNQB",
  "948" : "RBBKRNNQ",
  "949" : "RKBBRNNQ",
  "950" : "RKBRNBNQ",
  "951" : "RKBRNNQB",
  "952" : "RBKRBNNQ",
  "953" : "RKRBBNNQ",
  "954" : "RKRNBBNQ",
  "955" : "RKRNBNQB",
  "956" : "RBKRNNBQ",
  "957" : "RKRBNNBQ",
  "958" : "RKRNNBBQ",
  "959" : "RKRNNQBB",
  "BBQNNRKR" : "000",
  "BQNBNRKR" : "001",
  "BQNNRBKR" : "002",
  "BQNNRKRB" : "003",
  "QBBNNRKR" : "004",
  "QNBBNRKR" : "005",
  "QNBNRBKR" : "006",
  "QNBNRKRB" : "007",
  "QBNNBRKR" : "008",
  "QNNBBRKR" : "009",
  "QNNRBBKR" : "010",
  "QNNRBKRB" : "011",
  "QBNNRKBR" : "012",
  "QNNBRKBR" : "013",
  "QNNRKBBR" : "014",
  "QNNRKRBB" : "015",
  "BBNQNRKR" : "016",
  "BNQBNRKR" : "017",
  "BNQNRBKR" : "018",
  "BNQNRKRB" : "019",
  "NBBQNRKR" : "020",
  "NQBBNRKR" : "021",
  "NQBNRBKR" : "022",
  "NQBNRKRB" : "023",
  "NBQNBRKR" : "024",
  "NQNBBRKR" : "025",
  "NQNRBBKR" : "026",
  "NQNRBKRB" : "027",
  "NBQNRKBR" : "028",
  "NQNBRKBR" : "029",
  "NQNRKBBR" : "030",
  "NQNRKRBB" : "031",
  "BBNNQRKR" : "032",
  "BNNBQRKR" : "033",
  "BNNQRBKR" : "034",
  "BNNQRKRB" : "035",
  "NBBNQRKR" : "036",
  "NNBBQRKR" : "037",
  "NNBQRBKR" : "038",
  "NNBQRKRB" : "039",
  "NBNQBRKR" : "040",
  "NNQBBRKR" : "041",
  "NNQRBBKR" : "042",
  "NNQRBKRB" : "043",
  "NBNQRKBR" : "044",
  "NNQBRKBR" : "045",
  "NNQRKBBR" : "046",
  "NNQRKRBB" : "047",
  "BBNNRQKR" : "048",
  "BNNBRQKR" : "049",
  "BNNRQBKR" : "050",
  "BNNRQKRB" : "051",
  "NBBNRQKR" : "052",
  "NNBBRQKR" : "053",
  "NNBRQBKR" : "054",
  "NNBRQKRB" : "055",
  "NBNRBQKR" : "056",
  "NNRBBQKR" : "057",
  "NNRQBBKR" : "058",
  "NNRQBKRB" : "059",
  "NBNRQKBR" : "060",
  "NNRBQKBR" : "061",
  "NNRQKBBR" : "062",
  "NNRQKRBB" : "063",
  "BBNNRKQR" : "064",
  "BNNBRKQR" : "065",
  "BNNRKBQR" : "066",
  "BNNRKQRB" : "067",
  "NBBNRKQR" : "068",
  "NNBBRKQR" : "069",
  "NNBRKBQR" : "070",
  "NNBRKQRB" : "071",
  "NBNRBKQR" : "072",
  "NNRBBKQR" : "073",
  "NNRKBBQR" : "074",
  "NNRKBQRB" : "075",
  "NBNRKQBR" : "076",
  "NNRBKQBR" : "077",
  "NNRKQBBR" : "078",
  "NNRKQRBB" : "079",
  "BBNNRKRQ" : "080",
  "BNNBRKRQ" : "081",
  "BNNRKBRQ" : "082",
  "BNNRKRQB" : "083",
  "NBBNRKRQ" : "084",
  "NNBBRKRQ" : "085",
  "NNBRKBRQ" : "086",
  "NNBRKRQB" : "087",
  "NBNRBKRQ" : "088",
  "NNRBBKRQ" : "089",
  "NNRKBBRQ" : "090",
  "NNRKBRQB" : "091",
  "NBNRKRBQ" : "092",
  "NNRBKRBQ" : "093",
  "NNRKRBBQ" : "094",
  "NNRKRQBB" : "095",
  "BBQNRNKR" : "096",
  "BQNBRNKR" : "097",
  "BQNRNBKR" : "098",
  "BQNRNKRB" : "099",
  "QBBNRNKR" : "100",
  "QNBBRNKR" : "101",
  "QNBRNBKR" : "102",
  "QNBRNKRB" : "103",
  "QBNRBNKR" : "104",
  "QNRBBNKR" : "105",
  "QNRNBBKR" : "106",
  "QNRNBKRB" : "107",
  "QBNRNKBR" : "108",
  "QNRBNKBR" : "109",
  "QNRNKBBR" : "110",
  "QNRNKRBB" : "111",
  "BBNQRNKR" : "112",
  "BNQBRNKR" : "113",
  "BNQRNBKR" : "114",
  "BNQRNKRB" : "115",
  "NBBQRNKR" : "116",
  "NQBBRNKR" : "117",
  "NQBRNBKR" : "118",
  "NQBRNKRB" : "119",
  "NBQRBNKR" : "120",
  "NQRBBNKR" : "121",
  "NQRNBBKR" : "122",
  "NQRNBKRB" : "123",
  "NBQRNKBR" : "124",
  "NQRBNKBR" : "125",
  "NQRNKBBR" : "126",
  "NQRNKRBB" : "127",
  "BBNRQNKR" : "128",
  "BNRBQNKR" : "129",
  "BNRQNBKR" : "130",
  "BNRQNKRB" : "131",
  "NBBRQNKR" : "132",
  "NRBBQNKR" : "133",
  "NRBQNBKR" : "134",
  "NRBQNKRB" : "135",
  "NBRQBNKR" : "136",
  "NRQBBNKR" : "137",
  "NRQNBBKR" : "138",
  "NRQNBKRB" : "139",
  "NBRQNKBR" : "140",
  "NRQBNKBR" : "141",
  "NRQNKBBR" : "142",
  "NRQNKRBB" : "143",
  "BBNRNQKR" : "144",
  "BNRBNQKR" : "145",
  "BNRNQBKR" : "146",
  "BNRNQKRB" : "147",
  "NBBRNQKR" : "148",
  "NRBBNQKR" : "149",
  "NRBNQBKR" : "150",
  "NRBNQKRB" : "151",
  "NBRNBQKR" : "152",
  "NRNBBQKR" : "153",
  "NRNQBBKR" : "154",
  "NRNQBKRB" : "155",
  "NBRNQKBR" : "156",
  "NRNBQKBR" : "157",
  "NRNQKBBR" : "158",
  "NRNQKRBB" : "159",
  "BBNRNKQR" : "160",
  "BNRBNKQR" : "161",
  "BNRNKBQR" : "162",
  "BNRNKQRB" : "163",
  "NBBRNKQR" : "164",
  "NRBBNKQR" : "165",
  "NRBNKBQR" : "166",
  "NRBNKQRB" : "167",
  "NBRNBKQR" : "168",
  "NRNBBKQR" : "169",
  "NRNKBBQR" : "170",
  "NRNKBQRB" : "171",
  "NBRNKQBR" : "172",
  "NRNBKQBR" : "173",
  "NRNKQBBR" : "174",
  "NRNKQRBB" : "175",
  "BBNRNKRQ" : "176",
  "BNRBNKRQ" : "177",
  "BNRNKBRQ" : "178",
  "BNRNKRQB" : "179",
  "NBBRNKRQ" : "180",
  "NRBBNKRQ" : "181",
  "NRBNKBRQ" : "182",
  "NRBNKRQB" : "183",
  "NBRNBKRQ" : "184",
  "NRNBBKRQ" : "185",
  "NRNKBBRQ" : "186",
  "NRNKBRQB" : "187",
  "NBRNKRBQ" : "188",
  "NRNBKRBQ" : "189",
  "NRNKRBBQ" : "190",
  "NRNKRQBB" : "191",
  "BBQNRKNR" : "192",
  "BQNBRKNR" : "193",
  "BQNRKBNR" : "194",
  "BQNRKNRB" : "195",
  "QBBNRKNR" : "196",
  "QNBBRKNR" : "197",
  "QNBRKBNR" : "198",
  "QNBRKNRB" : "199",
  "QBNRBKNR" : "200",
  "QNRBBKNR" : "201",
  "QNRKBBNR" : "202",
  "QNRKBNRB" : "203",
  "QBNRKNBR" : "204",
  "QNRBKNBR" : "205",
  "QNRKNBBR" : "206",
  "QNRKNRBB" : "207",
  "BBNQRKNR" : "208",
  "BNQBRKNR" : "209",
  "BNQRKBNR" : "210",
  "BNQRKNRB" : "211",
  "NBBQRKNR" : "212",
  "NQBBRKNR" : "213",
  "NQBRKBNR" : "214",
  "NQBRKNRB" : "215",
  "NBQRBKNR" : "216",
  "NQRBBKNR" : "217",
  "NQRKBBNR" : "218",
  "NQRKBNRB" : "219",
  "NBQRKNBR" : "220",
  "NQRBKNBR" : "221",
  "NQRKNBBR" : "222",
  "NQRKNRBB" : "223",
  "BBNRQKNR" : "224",
  "BNRBQKNR" : "225",
  "BNRQKBNR" : "226",
  "BNRQKNRB" : "227",
  "NBBRQKNR" : "228",
  "NRBBQKNR" : "229",
  "NRBQKBNR" : "230",
  "NRBQKNRB" : "231",
  "NBRQBKNR" : "232",
  "NRQBBKNR" : "233",
  "NRQKBBNR" : "234",
  "NRQKBNRB" : "235",
  "NBRQKNBR" : "236",
  "NRQBKNBR" : "237",
  "NRQKNBBR" : "238",
  "NRQKNRBB" : "239",
  "BBNRKQNR" : "240",
  "BNRBKQNR" : "241",
  "BNRKQBNR" : "242",
  "BNRKQNRB" : "243",
  "NBBRKQNR" : "244",
  "NRBBKQNR" : "245",
  "NRBKQBNR" : "246",
  "NRBKQNRB" : "247",
  "NBRKBQNR" : "248",
  "NRKBBQNR" : "249",
  "NRKQBBNR" : "250",
  "NRKQBNRB" : "251",
  "NBRKQNBR" : "252",
  "NRKBQNBR" : "253",
  "NRKQNBBR" : "254",
  "NRKQNRBB" : "255",
  "BBNRKNQR" : "256",
  "BNRBKNQR" : "257",
  "BNRKNBQR" : "258",
  "BNRKNQRB" : "259",
  "NBBRKNQR" : "260",
  "NRBBKNQR" : "261",
  "NRBKNBQR" : "262",
  "NRBKNQRB" : "263",
  "NBRKBNQR" : "264",
  "NRKBBNQR" : "265",
  "NRKNBBQR" : "266",
  "NRKNBQRB" : "267",
  "NBRKNQBR" : "268",
  "NRKBNQBR" : "269",
  "NRKNQBBR" : "270",
  "NRKNQRBB" : "271",
  "BBNRKNRQ" : "272",
  "BNRBKNRQ" : "273",
  "BNRKNBRQ" : "274",
  "BNRKNRQB" : "275",
  "NBBRKNRQ" : "276",
  "NRBBKNRQ" : "277",
  "NRBKNBRQ" : "278",
  "NRBKNRQB" : "279",
  "NBRKBNRQ" : "280",
  "NRKBBNRQ" : "281",
  "NRKNBBRQ" : "282",
  "NRKNBRQB" : "283",
  "NBRKNRBQ" : "284",
  "NRKBNRBQ" : "285",
  "NRKNRBBQ" : "286",
  "NRKNRQBB" : "287",
  "BBQNRKRN" : "288",
  "BQNBRKRN" : "289",
  "BQNRKBRN" : "290",
  "BQNRKRNB" : "291",
  "QBBNRKRN" : "292",
  "QNBBRKRN" : "293",
  "QNBRKBRN" : "294",
  "QNBRKRNB" : "295",
  "QBNRBKRN" : "296",
  "QNRBBKRN" : "297",
  "QNRKBBRN" : "298",
  "QNRKBRNB" : "299",
  "QBNRKRBN" : "300",
  "QNRBKRBN" : "301",
  "QNRKRBBN" : "302",
  "QNRKRNBB" : "303",
  "BBNQRKRN" : "304",
  "BNQBRKRN" : "305",
  "BNQRKBRN" : "306",
  "BNQRKRNB" : "307",
  "NBBQRKRN" : "308",
  "NQBBRKRN" : "309",
  "NQBRKBRN" : "310",
  "NQBRKRNB" : "311",
  "NBQRBKRN" : "312",
  "NQRBBKRN" : "313",
  "NQRKBBRN" : "314",
  "NQRKBRNB" : "315",
  "NBQRKRBN" : "316",
  "NQRBKRBN" : "317",
  "NQRKRBBN" : "318",
  "NQRKRNBB" : "319",
  "BBNRQKRN" : "320",
  "BNRBQKRN" : "321",
  "BNRQKBRN" : "322",
  "BNRQKRNB" : "323",
  "NBBRQKRN" : "324",
  "NRBBQKRN" : "325",
  "NRBQKBRN" : "326",
  "NRBQKRNB" : "327",
  "NBRQBKRN" : "328",
  "NRQBBKRN" : "329",
  "NRQKBBRN" : "330",
  "NRQKBRNB" : "331",
  "NBRQKRBN" : "332",
  "NRQBKRBN" : "333",
  "NRQKRBBN" : "334",
  "NRQKRNBB" : "335",
  "BBNRKQRN" : "336",
  "BNRBKQRN" : "337",
  "BNRKQBRN" : "338",
  "BNRKQRNB" : "339",
  "NBBRKQRN" : "340",
  "NRBBKQRN" : "341",
  "NRBKQBRN" : "342",
  "NRBKQRNB" : "343",
  "NBRKBQRN" : "344",
  "NRKBBQRN" : "345",
  "NRKQBBRN" : "346",
  "NRKQBRNB" : "347",
  "NBRKQRBN" : "348",
  "NRKBQRBN" : "349",
  "NRKQRBBN" : "350",
  "NRKQRNBB" : "351",
  "BBNRKRQN" : "352",
  "BNRBKRQN" : "353",
  "BNRKRBQN" : "354",
  "BNRKRQNB" : "355",
  "NBBRKRQN" : "356",
  "NRBBKRQN" : "357",
  "NRBKRBQN" : "358",
  "NRBKRQNB" : "359",
  "NBRKBRQN" : "360",
  "NRKBBRQN" : "361",
  "NRKRBBQN" : "362",
  "NRKRBQNB" : "363",
  "NBRKRQBN" : "364",
  "NRKBRQBN" : "365",
  "NRKRQBBN" : "366",
  "NRKRQNBB" : "367",
  "BBNRKRNQ" : "368",
  "BNRBKRNQ" : "369",
  "BNRKRBNQ" : "370",
  "BNRKRNQB" : "371",
  "NBBRKRNQ" : "372",
  "NRBBKRNQ" : "373",
  "NRBKRBNQ" : "374",
  "NRBKRNQB" : "375",
  "NBRKBRNQ" : "376",
  "NRKBBRNQ" : "377",
  "NRKRBBNQ" : "378",
  "NRKRBNQB" : "379",
  "NBRKRNBQ" : "380",
  "NRKBRNBQ" : "381",
  "NRKRNBBQ" : "382",
  "NRKRNQBB" : "383",
  "BBQRNNKR" : "384",
  "BQRBNNKR" : "385",
  "BQRNNBKR" : "386",
  "BQRNNKRB" : "387",
  "QBBRNNKR" : "388",
  "QRBBNNKR" : "389",
  "QRBNNBKR" : "390",
  "QRBNNKRB" : "391",
  "QBRNBNKR" : "392",
  "QRNBBNKR" : "393",
  "QRNNBBKR" : "394",
  "QRNNBKRB" : "395",
  "QBRNNKBR" : "396",
  "QRNBNKBR" : "397",
  "QRNNKBBR" : "398",
  "QRNNKRBB" : "399",
  "BBRQNNKR" : "400",
  "BRQBNNKR" : "401",
  "BRQNNBKR" : "402",
  "BRQNNKRB" : "403",
  "RBBQNNKR" : "404",
  "RQBBNNKR" : "405",
  "RQBNNBKR" : "406",
  "RQBNNKRB" : "407",
  "RBQNBNKR" : "408",
  "RQNBBNKR" : "409",
  "RQNNBBKR" : "410",
  "RQNNBKRB" : "411",
  "RBQNNKBR" : "412",
  "RQNBNKBR" : "413",
  "RQNNKBBR" : "414",
  "RQNNKRBB" : "415",
  "BBRNQNKR" : "416",
  "BRNBQNKR" : "417",
  "BRNQNBKR" : "418",
  "BRNQNKRB" : "419",
  "RBBNQNKR" : "420",
  "RNBBQNKR" : "421",
  "RNBQNBKR" : "422",
  "RNBQNKRB" : "423",
  "RBNQBNKR" : "424",
  "RNQBBNKR" : "425",
  "RNQNBBKR" : "426",
  "RNQNBKRB" : "427",
  "RBNQNKBR" : "428",
  "RNQBNKBR" : "429",
  "RNQNKBBR" : "430",
  "RNQNKRBB" : "431",
  "BBRNNQKR" : "432",
  "BRNBNQKR" : "433",
  "BRNNQBKR" : "434",
  "BRNNQKRB" : "435",
  "RBBNNQKR" : "436",
  "RNBBNQKR" : "437",
  "RNBNQBKR" : "438",
  "RNBNQKRB" : "439",
  "RBNNBQKR" : "440",
  "RNNBBQKR" : "441",
  "RNNQBBKR" : "442",
  "RNNQBKRB" : "443",
  "RBNNQKBR" : "444",
  "RNNBQKBR" : "445",
  "RNNQKBBR" : "446",
  "RNNQKRBB" : "447",
  "BBRNNKQR" : "448",
  "BRNBNKQR" : "449",
  "BRNNKBQR" : "450",
  "BRNNKQRB" : "451",
  "RBBNNKQR" : "452",
  "RNBBNKQR" : "453",
  "RNBNKBQR" : "454",
  "RNBNKQRB" : "455",
  "RBNNBKQR" : "456",
  "RNNBBKQR" : "457",
  "RNNKBBQR" : "458",
  "RNNKBQRB" : "459",
  "RBNNKQBR" : "460",
  "RNNBKQBR" : "461",
  "RNNKQBBR" : "462",
  "RNNKQRBB" : "463",
  "BBRNNKRQ" : "464",
  "BRNBNKRQ" : "465",
  "BRNNKBRQ" : "466",
  "BRNNKRQB" : "467",
  "RBBNNKRQ" : "468",
  "RNBBNKRQ" : "469",
  "RNBNKBRQ" : "470",
  "RNBNKRQB" : "471",
  "RBNNBKRQ" : "472",
  "RNNBBKRQ" : "473",
  "RNNKBBRQ" : "474",
  "RNNKBRQB" : "475",
  "RBNNKRBQ" : "476",
  "RNNBKRBQ" : "477",
  "RNNKRBBQ" : "478",
  "RNNKRQBB" : "479",
  "BBQRNKNR" : "480",
  "BQRBNKNR" : "481",
  "BQRNKBNR" : "482",
  "BQRNKNRB" : "483",
  "QBBRNKNR" : "484",
  "QRBBNKNR" : "485",
  "QRBNKBNR" : "486",
  "QRBNKNRB" : "487",
  "QBRNBKNR" : "488",
  "QRNBBKNR" : "489",
  "QRNKBBNR" : "490",
  "QRNKBNRB" : "491",
  "QBRNKNBR" : "492",
  "QRNBKNBR" : "493",
  "QRNKNBBR" : "494",
  "QRNKNRBB" : "495",
  "BBRQNKNR" : "496",
  "BRQBNKNR" : "497",
  "BRQNKBNR" : "498",
  "BRQNKNRB" : "499",
  "RBBQNKNR" : "500",
  "RQBBNKNR" : "501",
  "RQBNKBNR" : "502",
  "RQBNKNRB" : "503",
  "RBQNBKNR" : "504",
  "RQNBBKNR" : "505",
  "RQNKBBNR" : "506",
  "RQNKBNRB" : "507",
  "RBQNKNBR" : "508",
  "RQNBKNBR" : "509",
  "RQNKNBBR" : "510",
  "RQNKNRBB" : "511",
  "BBRNQKNR" : "512",
  "BRNBQKNR" : "513",
  "BRNQKBNR" : "514",
  "BRNQKNRB" : "515",
  "RBBNQKNR" : "516",
  "RNBBQKNR" : "517",
  "RNBQKBNR" : "518",
  "RNBQKNRB" : "519",
  "RBNQBKNR" : "520",
  "RNQBBKNR" : "521",
  "RNQKBBNR" : "522",
  "RNQKBNRB" : "523",
  "RBNQKNBR" : "524",
  "RNQBKNBR" : "525",
  "RNQKNBBR" : "526",
  "RNQKNRBB" : "527",
  "BBRNKQNR" : "528",
  "BRNBKQNR" : "529",
  "BRNKQBNR" : "530",
  "BRNKQNRB" : "531",
  "RBBNKQNR" : "532",
  "RNBBKQNR" : "533",
  "RNBKQBNR" : "534",
  "RNBKQNRB" : "535",
  "RBNKBQNR" : "536",
  "RNKBBQNR" : "537",
  "RNKQBBNR" : "538",
  "RNKQBNRB" : "539",
  "RBNKQNBR" : "540",
  "RNKBQNBR" : "541",
  "RNKQNBBR" : "542",
  "RNKQNRBB" : "543",
  "BBRNKNQR" : "544",
  "BRNBKNQR" : "545",
  "BRNKNBQR" : "546",
  "BRNKNQRB" : "547",
  "RBBNKNQR" : "548",
  "RNBBKNQR" : "549",
  "RNBKNBQR" : "550",
  "RNBKNQRB" : "551",
  "RBNKBNQR" : "552",
  "RNKBBNQR" : "553",
  "RNKNBBQR" : "554",
  "RNKNBQRB" : "555",
  "RBNKNQBR" : "556",
  "RNKBNQBR" : "557",
  "RNKNQBBR" : "558",
  "RNKNQRBB" : "559",
  "BBRNKNRQ" : "560",
  "BRNBKNRQ" : "561",
  "BRNKNBRQ" : "562",
  "BRNKNRQB" : "563",
  "RBBNKNRQ" : "564",
  "RNBBKNRQ" : "565",
  "RNBKNBRQ" : "566",
  "RNBKNRQB" : "567",
  "RBNKBNRQ" : "568",
  "RNKBBNRQ" : "569",
  "RNKNBBRQ" : "570",
  "RNKNBRQB" : "571",
  "RBNKNRBQ" : "572",
  "RNKBNRBQ" : "573",
  "RNKNRBBQ" : "574",
  "RNKNRQBB" : "575",
  "BBQRNKRN" : "576",
  "BQRBNKRN" : "577",
  "BQRNKBRN" : "578",
  "BQRNKRNB" : "579",
  "QBBRNKRN" : "580",
  "QRBBNKRN" : "581",
  "QRBNKBRN" : "582",
  "QRBNKRNB" : "583",
  "QBRNBKRN" : "584",
  "QRNBBKRN" : "585",
  "QRNKBBRN" : "586",
  "QRNKBRNB" : "587",
  "QBRNKRBN" : "588",
  "QRNBKRBN" : "589",
  "QRNKRBBN" : "590",
  "QRNKRNBB" : "591",
  "BBRQNKRN" : "592",
  "BRQBNKRN" : "593",
  "BRQNKBRN" : "594",
  "BRQNKRNB" : "595",
  "RBBQNKRN" : "596",
  "RQBBNKRN" : "597",
  "RQBNKBRN" : "598",
  "RQBNKRNB" : "599",
  "RBQNBKRN" : "600",
  "RQNBBKRN" : "601",
  "RQNKBBRN" : "602",
  "RQNKBRNB" : "603",
  "RBQNKRBN" : "604",
  "RQNBKRBN" : "605",
  "RQNKRBBN" : "606",
  "RQNKRNBB" : "607",
  "BBRNQKRN" : "608",
  "BRNBQKRN" : "609",
  "BRNQKBRN" : "610",
  "BRNQKRNB" : "611",
  "RBBNQKRN" : "612",
  "RNBBQKRN" : "613",
  "RNBQKBRN" : "614",
  "RNBQKRNB" : "615",
  "RBNQBKRN" : "616",
  "RNQBBKRN" : "617",
  "RNQKBBRN" : "618",
  "RNQKBRNB" : "619",
  "RBNQKRBN" : "620",
  "RNQBKRBN" : "621",
  "RNQKRBBN" : "622",
  "RNQKRNBB" : "623",
  "BBRNKQRN" : "624",
  "BRNBKQRN" : "625",
  "BRNKQBRN" : "626",
  "BRNKQRNB" : "627",
  "RBBNKQRN" : "628",
  "RNBBKQRN" : "629",
  "RNBKQBRN" : "630",
  "RNBKQRNB" : "631",
  "RBNKBQRN" : "632",
  "RNKBBQRN" : "633",
  "RNKQBBRN" : "634",
  "RNKQBRNB" : "635",
  "RBNKQRBN" : "636",
  "RNKBQRBN" : "637",
  "RNKQRBBN" : "638",
  "RNKQRNBB" : "639",
  "BBRNKRQN" : "640",
  "BRNBKRQN" : "641",
  "BRNKRBQN" : "642",
  "BRNKRQNB" : "643",
  "RBBNKRQN" : "644",
  "RNBBKRQN" : "645",
  "RNBKRBQN" : "646",
  "RNBKRQNB" : "647",
  "RBNKBRQN" : "648",
  "RNKBBRQN" : "649",
  "RNKRBBQN" : "650",
  "RNKRBQNB" : "651",
  "RBNKRQBN" : "652",
  "RNKBRQBN" : "653",
  "RNKRQBBN" : "654",
  "RNKRQNBB" : "655",
  "BBRNKRNQ" : "656",
  "BRNBKRNQ" : "657",
  "BRNKRBNQ" : "658",
  "BRNKRNQB" : "659",
  "RBBNKRNQ" : "660",
  "RNBBKRNQ" : "661",
  "RNBKRBNQ" : "662",
  "RNBKRNQB" : "663",
  "RBNKBRNQ" : "664",
  "RNKBBRNQ" : "665",
  "RNKRBBNQ" : "666",
  "RNKRBNQB" : "667",
  "RBNKRNBQ" : "668",
  "RNKBRNBQ" : "669",
  "RNKRNBBQ" : "670",
  "RNKRNQBB" : "671",
  "BBQRKNNR" : "672",
  "BQRBKNNR" : "673",
  "BQRKNBNR" : "674",
  "BQRKNNRB" : "675",
  "QBBRKNNR" : "676",
  "QRBBKNNR" : "677",
  "QRBKNBNR" : "678",
  "QRBKNNRB" : "679",
  "QBRKBNNR" : "680",
  "QRKBBNNR" : "681",
  "QRKNBBNR" : "682",
  "QRKNBNRB" : "683",
  "QBRKNNBR" : "684",
  "QRKBNNBR" : "685",
  "QRKNNBBR" : "686",
  "QRKNNRBB" : "687",
  "BBRQKNNR" : "688",
  "BRQBKNNR" : "689",
  "BRQKNBNR" : "690",
  "BRQKNNRB" : "691",
  "RBBQKNNR" : "692",
  "RQBBKNNR" : "693",
  "RQBKNBNR" : "694",
  "RQBKNNRB" : "695",
  "RBQKBNNR" : "696",
  "RQKBBNNR" : "697",
  "RQKNBBNR" : "698",
  "RQKNBNRB" : "699",
  "RBQKNNBR" : "700",
  "RQKBNNBR" : "701",
  "RQKNNBBR" : "702",
  "RQKNNRBB" : "703",
  "BBRKQNNR" : "704",
  "BRKBQNNR" : "705",
  "BRKQNBNR" : "706",
  "BRKQNNRB" : "707",
  "RBBKQNNR" : "708",
  "RKBBQNNR" : "709",
  "RKBQNBNR" : "710",
  "RKBQNNRB" : "711",
  "RBKQBNNR" : "712",
  "RKQBBNNR" : "713",
  "RKQNBBNR" : "714",
  "RKQNBNRB" : "715",
  "RBKQNNBR" : "716",
  "RKQBNNBR" : "717",
  "RKQNNBBR" : "718",
  "RKQNNRBB" : "719",
  "BBRKNQNR" : "720",
  "BRKBNQNR" : "721",
  "BRKNQBNR" : "722",
  "BRKNQNRB" : "723",
  "RBBKNQNR" : "724",
  "RKBBNQNR" : "725",
  "RKBNQBNR" : "726",
  "RKBNQNRB" : "727",
  "RBKNBQNR" : "728",
  "RKNBBQNR" : "729",
  "RKNQBBNR" : "730",
  "RKNQBNRB" : "731",
  "RBKNQNBR" : "732",
  "RKNBQNBR" : "733",
  "RKNQNBBR" : "734",
  "RKNQNRBB" : "735",
  "BBRKNNQR" : "736",
  "BRKBNNQR" : "737",
  "BRKNNBQR" : "738",
  "BRKNNQRB" : "739",
  "RBBKNNQR" : "740",
  "RKBBNNQR" : "741",
  "RKBNNBQR" : "742",
  "RKBNNQRB" : "743",
  "RBKNBNQR" : "744",
  "RKNBBNQR" : "745",
  "RKNNBBQR" : "746",
  "RKNNBQRB" : "747",
  "RBKNNQBR" : "748",
  "RKNBNQBR" : "749",
  "RKNNQBBR" : "750",
  "RKNNQRBB" : "751",
  "BBRKNNRQ" : "752",
  "BRKBNNRQ" : "753",
  "BRKNNBRQ" : "754",
  "BRKNNRQB" : "755",
  "RBBKNNRQ" : "756",
  "RKBBNNRQ" : "757",
  "RKBNNBRQ" : "758",
  "RKBNNRQB" : "759",
  "RBKNBNRQ" : "760",
  "RKNBBNRQ" : "761",
  "RKNNBBRQ" : "762",
  "RKNNBRQB" : "763",
  "RBKNNRBQ" : "764",
  "RKNBNRBQ" : "765",
  "RKNNRBBQ" : "766",
  "RKNNRQBB" : "767",
  "BBQRKNRN" : "768",
  "BQRBKNRN" : "769",
  "BQRKNBRN" : "770",
  "BQRKNRNB" : "771",
  "QBBRKNRN" : "772",
  "QRBBKNRN" : "773",
  "QRBKNBRN" : "774",
  "QRBKNRNB" : "775",
  "QBRKBNRN" : "776",
  "QRKBBNRN" : "777",
  "QRKNBBRN" : "778",
  "QRKNBRNB" : "779",
  "QBRKNRBN" : "780",
  "QRKBNRBN" : "781",
  "QRKNRBBN" : "782",
  "QRKNRNBB" : "783",
  "BBRQKNRN" : "784",
  "BRQBKNRN" : "785",
  "BRQKNBRN" : "786",
  "BRQKNRNB" : "787",
  "RBBQKNRN" : "788",
  "RQBBKNRN" : "789",
  "RQBKNBRN" : "790",
  "RQBKNRNB" : "791",
  "RBQKBNRN" : "792",
  "RQKBBNRN" : "793",
  "RQKNBBRN" : "794",
  "RQKNBRNB" : "795",
  "RBQKNRBN" : "796",
  "RQKBNRBN" : "797",
  "RQKNRBBN" : "798",
  "RQKNRNBB" : "799",
  "BBRKQNRN" : "800",
  "BRKBQNRN" : "801",
  "BRKQNBRN" : "802",
  "BRKQNRNB" : "803",
  "RBBKQNRN" : "804",
  "RKBBQNRN" : "805",
  "RKBQNBRN" : "806",
  "RKBQNRNB" : "807",
  "RBKQBNRN" : "808",
  "RKQBBNRN" : "809",
  "RKQNBBRN" : "810",
  "RKQNBRNB" : "811",
  "RBKQNRBN" : "812",
  "RKQBNRBN" : "813",
  "RKQNRBBN" : "814",
  "RKQNRNBB" : "815",
  "BBRKNQRN" : "816",
  "BRKBNQRN" : "817",
  "BRKNQBRN" : "818",
  "BRKNQRNB" : "819",
  "RBBKNQRN" : "820",
  "RKBBNQRN" : "821",
  "RKBNQBRN" : "822",
  "RKBNQRNB" : "823",
  "RBKNBQRN" : "824",
  "RKNBBQRN" : "825",
  "RKNQBBRN" : "826",
  "RKNQBRNB" : "827",
  "RBKNQRBN" : "828",
  "RKNBQRBN" : "829",
  "RKNQRBBN" : "830",
  "RKNQRNBB" : "831",
  "BBRKNRQN" : "832",
  "BRKBNRQN" : "833",
  "BRKNRBQN" : "834",
  "BRKNRQNB" : "835",
  "RBBKNRQN" : "836",
  "RKBBNRQN" : "837",
  "RKBNRBQN" : "838",
  "RKBNRQNB" : "839",
  "RBKNBRQN" : "840",
  "RKNBBRQN" : "841",
  "RKNRBBQN" : "842",
  "RKNRBQNB" : "843",
  "RBKNRQBN" : "844",
  "RKNBRQBN" : "845",
  "RKNRQBBN" : "846",
  "RKNRQNBB" : "847",
  "BBRKNRNQ" : "848",
  "BRKBNRNQ" : "849",
  "BRKNRBNQ" : "850",
  "BRKNRNQB" : "851",
  "RBBKNRNQ" : "852",
  "RKBBNRNQ" : "853",
  "RKBNRBNQ" : "854",
  "RKBNRNQB" : "855",
  "RBKNBRNQ" : "856",
  "RKNBBRNQ" : "857",
  "RKNRBBNQ" : "858",
  "RKNRBNQB" : "859",
  "RBKNRNBQ" : "860",
  "RKNBRNBQ" : "861",
  "RKNRNBBQ" : "862",
  "RKNRNQBB" : "863",
  "BBQRKRNN" : "864",
  "BQRBKRNN" : "865",
  "BQRKRBNN" : "866",
  "BQRKRNNB" : "867",
  "QBBRKRNN" : "868",
  "QRBBKRNN" : "869",
  "QRBKRBNN" : "870",
  "QRBKRNNB" : "871",
  "QBRKBRNN" : "872",
  "QRKBBRNN" : "873",
  "QRKRBBNN" : "874",
  "QRKRBNNB" : "875",
  "QBRKRNBN" : "876",
  "QRKBRNBN" : "877",
  "QRKRNBBN" : "878",
  "QRKRNNBB" : "879",
  "BBRQKRNN" : "880",
  "BRQBKRNN" : "881",
  "BRQKRBNN" : "882",
  "BRQKRNNB" : "883",
  "RBBQKRNN" : "884",
  "RQBBKRNN" : "885",
  "RQBKRBNN" : "886",
  "RQBKRNNB" : "887",
  "RBQKBRNN" : "888",
  "RQKBBRNN" : "889",
  "RQKRBBNN" : "890",
  "RQKRBNNB" : "891",
  "RBQKRNBN" : "892",
  "RQKBRNBN" : "893",
  "RQKRNBBN" : "894",
  "RQKRNNBB" : "895",
  "BBRKQRNN" : "896",
  "BRKBQRNN" : "897",
  "BRKQRBNN" : "898",
  "BRKQRNNB" : "899",
  "RBBKQRNN" : "900",
  "RKBBQRNN" : "901",
  "RKBQRBNN" : "902",
  "RKBQRNNB" : "903",
  "RBKQBRNN" : "904",
  "RKQBBRNN" : "905",
  "RKQRBBNN" : "906",
  "RKQRBNNB" : "907",
  "RBKQRNBN" : "908",
  "RKQBRNBN" : "909",
  "RKQRNBBN" : "910",
  "RKQRNNBB" : "911",
  "BBRKRQNN" : "912",
  "BRKBRQNN" : "913",
  "BRKRQBNN" : "914",
  "BRKRQNNB" : "915",
  "RBBKRQNN" : "916",
  "RKBBRQNN" : "917",
  "RKBRQBNN" : "918",
  "RKBRQNNB" : "919",
  "RBKRBQNN" : "920",
  "RKRBBQNN" : "921",
  "RKRQBBNN" : "922",
  "RKRQBNNB" : "923",
  "RBKRQNBN" : "924",
  "RKRBQNBN" : "925",
  "RKRQNBBN" : "926",
  "RKRQNNBB" : "927",
  "BBRKRNQN" : "928",
  "BRKBRNQN" : "929",
  "BRKRNBQN" : "930",
  "BRKRNQNB" : "931",
  "RBBKRNQN" : "932",
  "RKBBRNQN" : "933",
  "RKBRNBQN" : "934",
  "RKBRNQNB" : "935",
  "RBKRBNQN" : "936",
  "RKRBBNQN" : "937",
  "RKRNBBQN" : "938",
  "RKRNBQNB" : "939",
  "RBKRNQBN" : "940",
  "RKRBNQBN" : "941",
  "RKRNQBBN" : "942",
  "RKRNQNBB" : "943",
  "BBRKRNNQ" : "944",
  "BRKBRNNQ" : "945",
  "BRKRNBNQ" : "946",
  "BRKRNNQB" : "947",
  "RBBKRNNQ" : "948",
  "RKBBRNNQ" : "949",
  "RKBRNBNQ" : "950",
  "RKBRNNQB" : "951",
  "RBKRBNNQ" : "952",
  "RKRBBNNQ" : "953",
  "RKRNBBNQ" : "954",
  "RKRNBNQB" : "955",
  "RBKRNNBQ" : "956",
  "RKRBNNBQ" : "957",
  "RKRNNBBQ" : "958",
  "RKRNNQBB" : "959",
};

function chess960_switch (cvt) {
  var sp;
  const cvt_upper = cvt.toUpperCase();
  
  if (sp_table.hasOwnProperty(cvt_upper)) {
    sp = sp_table[cvt_upper];
  }
  else {
    sp = '???';
  }

  return sp;
}
