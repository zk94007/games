/* EidoGo - Justin Kramer <jkkramer@gmail.com>
 *
 * Code licensed under AGPLv3:
 * http://www.fsf.org/licensing/licenses/agpl-3.0.html
 *
 * lives at https://github.com/jkk/eidogo
 */

var eidogo = {};

Array.prototype.contains=function(_1){
if(Array.prototype.indexOf){
return this.indexOf(_1)!=-1;
}
for(var i in this){
if(this[i]==_1){
return true;
}
}
return false;
};
Array.prototype.setLength=function(_3,_4){
_4=typeof _4!="undefined"?_4:null;
for(var i=0;i<_3;i++){
this[i]=_4;
}
return this;
};
Array.prototype.addDimension=function(_6,_7){
_7=typeof _7!="undefined"?_7:null;
var _8=this.length;
for(var i=0;i<_8;i++){
this[i]=[].setLength(_6,_7);
}
return this;
};
Array.prototype.first=function(){
return this[0];
};
Array.prototype.last=function(){
return this[this.length-1];
};
Array.prototype.copy=function(){
var _a=[];
var _b=this.length;
for(var i=0;i<_b;i++){
if(this[i] instanceof Array){
_a[i]=this[i].copy();
}else{
_a[i]=this[i];
}
}
return _a;
};
if(!Array.prototype.map){
Array.prototype.map=function(_d){
var _e=this.length;
if(typeof _d!="function"){
throw new TypeError();
}
var _f=new Array(_e);
var _10=arguments[1];
for(var i=0;i<_e;i++){
if(i in this){
_f[i]=_d.call(_10,this[i],i,this);
}
}
return _f;
};
}
if(!Array.prototype.filter){
Array.prototype.filter=function(fun){
var len=this.length;
if(typeof fun!="function"){
throw new TypeError();
}
var res=new Array();
var _15=arguments[1];
for(var i=0;i<len;i++){
if(i in this){
var val=this[i];
if(fun.call(_15,val,i,this)){
res.push(val);
}
}
}
return res;
};
}
if(!Array.prototype.forEach){
Array.prototype.forEach=function(fun){
var len=this.length;
if(typeof fun!="function"){
throw new TypeError();
}
var _1a=arguments[1];
for(var i=0;i<len;i++){
if(i in this){
fun.call(_1a,this[i],i,this);
}
}
};
}
if(!Array.prototype.every){
Array.prototype.every=function(fun){
var len=this.length;
if(typeof fun!="function"){
throw new TypeError();
}
var _1e=arguments[1];
for(var i=0;i<len;i++){
if(i in this&&!fun.call(_1e,this[i],i,this)){
return false;
}
}
return true;
};
}
if(!Array.prototype.some){
Array.prototype.some=function(fun){
var len=this.length;
if(typeof fun!="function"){
throw new TypeError();
}
var _22=arguments[1];
for(var i=0;i<len;i++){
if(i in this&&fun.call(_22,this[i],i,this)){
return true;
}
}
return false;
};
}
Array.from=function(it){
var arr=[];
for(var i=0;i<it.length;i++){
arr[i]=it[i];
}
return arr;
};
Function.prototype.bind=function(_27){
var _28=this;
var _29=Array.from(arguments).slice(1);
return function(){
return _28.apply(_27,_29.concat(Array.from(arguments)));
};
};

/* Player.js */

// shortcuts (local only to this file)
var t = eidogo.i18n;

// Keep track of all the player instances we've created
eidogo.players = eidogo.players || {};

// Allow function calls to particular Player instances (for board rendering etc)
eidogo.delegate = function(pid, fn /*, args*/) {
    var player = eidogo.players[pid];
    player[fn].apply(player, Array.from(arguments).slice(2));
}

/**
 * @class Player is the overarching control structure that allows you to
 * load and replay games. It's a "player" in the sense of a DVD player, not
 * a person who plays a game.
 */
eidogo.Player = function() {
    this.init.apply(this, arguments);
}
exports.Player = eidogo.Player.prototype = {

    /**
     * Inits settings that are persistent among games
     * @constructor
     * @param {Object} cfg A hash of configuration values
     */
    init: function(cfg) {

        cfg = cfg || {};

        // play, add_b, add_w, region, tr, sq, cr, label, number, score(?)
        this.mode = cfg.mode ? cfg.mode : "play";

        // unique id, so we can have more than one player on a page
        this.uniq = (new Date()).getTime();

        // store for later
        eidogo.players[this.uniq] = this;

        // URL path to SGF files
        this.sgfPath = cfg.sgfPath;

        // pattern and game info search
        this.searchUrl = cfg.searchUrl;
        this.showingSearch = false;

        // save to file
        this.saveUrl = cfg.saveUrl;

        // url to handle downloads
        this.downloadUrl = cfg.downloadUrl;

        // score est
        this.scoreEstUrl = cfg.scoreEstUrl;

        // Allow outside scripts to hook into Player events. Format:
        //      hookName:   hookHandler
        // Available hooks:
        // - initDone
        // - initGame
        // - setPermalink
        // - searchRegion
        this.hooks = cfg.hooks || {};

        this.permalinkable = !!this.hooks.setPermalink;

        // handlers for the various types of GameNode properties
        this.propertyHandlers = {
            W:  this.playMove,
            B:  this.playMove,
            KO: this.playMove,
            MN: this.setMoveNumber,
            AW: this.addStone,
            AB: this.addStone,
            AE: this.addStone,
            CR: this.addMarker, // circle
            LB: this.addMarker, // label
            TR: this.addMarker, // triangle
            MA: this.addMarker, // X
            SQ: this.addMarker, // square
            TW: this.addMarker,
            TB: this.addMarker,
            DD: this.addMarker,
            PL: this.setColor,
            C:  this.showComments,
            N:  this.showAnnotation,
            GB: this.showAnnotation,
            GW: this.showAnnotation,
            DM: this.showAnnotation,
            HO: this.showAnnotation,
            UC: this.showAnnotation,
            V:  this.showAnnotation,
            BM: this.showAnnotation,
            DO: this.showAnnotation,
            IT: this.showAnnotation,
            TE: this.showAnnotation,
            BL: this.showTime,
            OB: this.showTime,
            WL: this.showTime,
            OW: this.showTime
        };

        // UI theme
        this.theme = cfg.theme;

        // initialize per-game settings
        this.reset(cfg);

        // custom renderer?
        //this.renderer = cfg.renderer || "html";

        // crop settings
        this.cropParams = null;
        this.shrinkToFit = cfg.shrinkToFit;
        if (this.shrinkToFit || cfg.cropWidth || cfg.cropHeight) {
            this.cropParams = {};
            this.cropParams.width = cfg.cropWidth;
            this.cropParams.height = cfg.cropHeight;
            this.cropParams.left = cfg.cropLeft;
            this.cropParams.top = cfg.cropTop;
            this.cropParams.padding = cfg.cropPadding || 1;
        }

        if (cfg.sgf || cfg.sgfUrl || (cfg.sgfPath && cfg.gameName)) {
            this.loadSgf(cfg);
        }

        this.hook("initDone");
    },

    /**
     * Delegate to a hook handler. 'this' will be bound to the Player
     * instance
    **/
    hook: function(hook, params) {
        /*if (hook in this.hooks) {
            return this.hooks[hook].bind(this)(params);
        }*/
    },

    /**
     * Resets settings that can change per game
    **/
    reset: function(cfg) {
        this.gameName = "";

        // Multiple games can be contained in collectionRoot. We default
        // to the first (collectionRoot._children[0])
        // See http://www.red-bean.com/sgf/sgf4.html
        this.collectionRoot = new eidogo.GameNode();
        this.cursor = new eidogo.GameCursor();

        // used for Ajaxy dynamic branch loading
        this.progressiveLoad = cfg.progressiveLoad ? true : false;
        this.progressiveLoads = null;
        this.progressiveUrl = null;
        this.progressiveMode = cfg.progressiveLoad && cfg.progressiveMode || "id";

        // gnugo/computer opponent
        this.opponentUrl = null;
        this.opponentColor = null;
        this.opponentLevel = null;

        // these are populated after load
        this.board = null;
        this.rules = null;
        this.currentColor = null;
        this.moveNumber = null;
        this.totalMoves = null;
        this.variations = null;
        this.timeB = "";
        this.timeW = "";

        // region selection state
        this.regionTop = null;
        this.regionLeft = null;
        this.regionWidth = null;
        this.regionHeight = null;
        this.regionBegun = null;
        this.regionClickSelect = null;

        // mouse clicking/dragging state
        this.mouseDown = null;
        this.mouseDownX = null;
        this.mouseDownY = null;
        this.mouseDownClickX = null;
        this.mouseDownClickY = null;

        // for the letter and number tools
        this.labelLastLetter = null;
        this.labelLastNumber = null;
        this.resetLastLabels();

        // so we know when permalinks and downloads are unreliable
        this.unsavedChanges = false;

        // to know when to update the nav tree
        this.updatedNavTree = false;
        this.navTreeTimeout = null;

        // whether we're currently searching or editing
        this.searching = false;
        this.editingText = false;
        this.goingBack = false;

        // problem-solving mode: respond when the user plays a move
        this.problemMode = cfg.problemMode;
        this.problemColor = cfg.problemColor;

        // user-changeable preferences
        this.prefs = {};
        this.prefs.markCurrent = typeof cfg.markCurrent != "undefined" ?
            !!cfg.markCurrent : true;
        this.prefs.markNext = typeof cfg.markNext != "undefined" ?
            cfg.markNext : false;
        this.prefs.markVariations = typeof cfg.markVariations != "undefined" ?
            !!cfg.markVariations : false;
        //this.prefs.showGameInfo = !!cfg.showGameInfo;
        this.prefs.showPlayerInfo = !!cfg.showPlayerInfo;
        this.prefs.showTools = !!cfg.showTools;
        this.prefs.showComments = typeof cfg.showComments != "undefined" ?
            !!cfg.showComments : false;
        //this.prefs.showOptions = !!cfg.showOptions;
        this.prefs.showNavTree = !this.progressiveLoad && typeof cfg.showNavTree != "undefined" ?
            !!cfg.showNavTree : false;
    },

    /**
     * Load an SGF file or start from a blank board
    **/
    loadSgf: function(cfg, completeFn) {
        cfg = cfg || {};

        //this.nowLoading();

        this.reset(cfg);

        // URL path to SGF files
        this.sgfPath = cfg.sgfPath || this.sgfPath;

        // Load the first node of the first node by default
        this.loadPath = cfg.loadPath && cfg.loadPath.length > 1 ?
            cfg.loadPath : [0, 0];

        // game name (= file name) of the game to load
        this.gameName = cfg.gameName || "";

        // For calling completeFn asynchronously
        var noCb = false;

        if (typeof cfg.sgf == "string") {

            // raw SGF data
            var sgf = new eidogo.SgfParser(cfg.sgf);
            this.load(sgf.root);

        } else if (typeof cfg.sgf == "object") {

            // already-parsed JSON game tree
            this.load(cfg.sgf);

        } else if (cfg.progressiveLoad && cfg.progressiveUrl) {

            this.progressiveLoads = 0;
            this.progressiveUrl = cfg.progressiveUrl;
            this.fetchProgressiveData(completeFn);
            noCb = true;

        } else if (typeof cfg.sgfUrl == "string" || this.gameName) {

            // the URL can be provided as a single sgfUrl or as sgfPath + gameName
            if (!cfg.sgfUrl) {
                cfg.sgfUrl = this.sgfPath + this.gameName + ".sgf";
            }

            // load data from a URL
            this.remoteLoad(cfg.sgfUrl, null, false, null, completeFn);
            noCb = true;

            if (cfg.progressiveLoad) {
                this.progressiveLoads = 0;
                this.progressiveUrl = cfg.progressiveUrl ||
                    cfg.sgfUrl.replace(/\?.+$/, "");
            }

        } else {

            // start from scratch
            var boardSize = cfg.boardSize || "19";
            var komiMap = {19: 6.5, 13: 4.5, 9: 3.5, 7: 2.5};
            var blankGame = {_children: [{
                    SZ: boardSize,
                    KM: cfg.komi || komiMap[boardSize] || 6.5,
                    _children: []}]};

            // AI opponent (e.g. GNU Go)
            if (cfg.opponentUrl) {
                this.gameName = "gnugo";
                this.opponentUrl = cfg.opponentUrl;
                this.opponentColor = cfg.opponentColor == "B" ? cfg.opponentColor : "W";
                this.opponentLevel = cfg.opponentLevel || 7;
                var root = blankGame._children[0];
                root.PW = this.opponentColor == "B" ? t['you'] : "GNU Go";
                root.PB = this.opponentColor == "B" ? "GNU Go" : t['you'];
                root.HA = parseInt(cfg.handicap, 10) || 0;
                if (root.HA) {
                    var handiCoords = {
                        19: [['pd', 'dp'],
                             ['pd', 'dp', 'pp'],
                             ['pd', 'dp', 'pp', 'dd'],
                             ['pd', 'dp', 'pp', 'dd', 'jj'],
                             ['pd', 'dp', 'pp', 'dd', 'dj', 'pj'],
                             ['pd', 'dp', 'pp', 'dd', 'dj', 'pj', 'jj'],
                             ['pd', 'dp', 'pp', 'dd', 'dj', 'pj', 'jd', 'jp'],
                             ['pd', 'dp', 'pp', 'dd', 'dj', 'pj', 'jd', 'jp', 'jj']],
                        13: [['jd', 'dj'],
                             ['jd', 'dj', 'jj'],
                             ['jd', 'dj', 'jj', 'dd'],
                             ['jd', 'dj', 'jj', 'dd', 'gg'],
                             ['jd', 'dj', 'jj', 'dd', 'dg', 'jg'],
                             ['jd', 'dj', 'jj', 'dd', 'dg', 'jg', 'gg'],
                             ['jd', 'dj', 'jj', 'dd', 'dg', 'jg', 'gd', 'gj'],
                             ['jd', 'dj', 'jj', 'dd', 'dg', 'jg', 'gd', 'gj', 'gg']],
                        9: [['cg', 'gc'],
                            ['cg', 'gc', 'gg'],
                            ['cg', 'gc', 'gg', 'cc'],
                            ['cg', 'gc', 'gg', 'cc', 'ee'],
                            ['cg', 'gc', 'gg', 'cc', 'ce', 'ge'],
                            ['cg', 'gc', 'gg', 'cc', 'ce', 'ge', 'ee'],
                            ['cg', 'gc', 'gg', 'cc', 'ce', 'ge', 'ec', 'eg'],
                            ['cg', 'gc', 'gg', 'cc', 'ce', 'ge', 'ec', 'eg', 'ee']]};
                    root.KM = 0.5;
                    if (root.HA > 1) {
                        root.AB = handiCoords[boardSize][root.HA-2];
                    }
                }
            }

            this.load(blankGame);
        }
        if (!noCb && typeof completeFn == "function") {
            completeFn();
        }
    },

    /**
     * Loads game data into a given target. If no target is given, creates
     * a new gameRoot and initializes the game.
    **/
    load: function(data, target) {
        var newGame = false;
        if (!target) {
            // load from scratch
            target = new eidogo.GameNode();
            this.collectionRoot = target;
        }
        target.loadJson(data);
        target._cached = true;
        //this.doneLoading();
        this.progressiveLoads--;
        if (!target._parent) {
            // Loading into tree root; use the first game by default or
            // other if specified
            var gameIndex = this.loadPath.length ? parseInt(this.loadPath[0], 10) : 0;
            this.initGame(target._children[gameIndex || 0]);
            newGame = true;
        }

        if (this.loadPath.length) {
            this.goTo(this.loadPath, newGame);
            if (!this.progressiveLoad) {
                this.loadPath = [0,0];
            }
        } else {
            this.refresh();
        }

        // find out which color to play as for problem mode
        if (newGame && this.problemMode) {
            if (!this.problemColor)
                this.currentColor = this.problemColor = (this.cursor.getNextColor() || "B");
            else
                this.currentColor = this.problemColor;
        }
    },

    /**
     * Load game data given as raw SGF or JSON from a URL within the same
     * domain.
     * @param {string} url URL to load game data from
     * @param {GameNode} target inserts data into this node if given
     * @param {boolean} useSgfPath if true, prepends sgfPath to url
     * @param {Array} loadPath GameNode path to load
    **/
    remoteLoad: function(url, target, useSgfPath, loadPath, completeFn) {
        useSgfPath = useSgfPath == "undefined" ? true : useSgfPath;

        completeFn = (typeof completeFn == "function") ? completeFn : null;

        if (useSgfPath) {
            if (!target) {
                this.gameName = url;
            }
            // if we're using sgfPath, assume url does not include .sgf extension
            url = this.sgfPath + url + ".sgf";
        }

        if (loadPath) {
            this.loadPath = loadPath;
        }

        var success = function(req) {
            var data = req.responseText.replace(/^( |\t|\r|\n)*/, "");
            // infer the kind of file we got
            if (data.charAt(0) == '(') {
                // SGF
                var me = this;
                var sgf = new eidogo.SgfParser(data, function() {
                    // parsing is asychronous
                    me.load(this.root, target);
                    completeFn && completeFn();
                });
            } else if (data.charAt(0) == '{') {
                // JSON
                data = eval("(" + data + ")");
                this.load(data, target);
                completeFn && completeFn();
            } else {
                this.croak(t['invalid data']);
            }
        }

        var failure = function(req) {
            this.croak(t['error retrieving']);
        }

        ajax('get', url, null, success, failure, this, 30000);
    },

    /**
     * Sets up a new game for playing. Can be called repeatedly (e.g., for
     * dynamically-loaded games).
    **/
    initGame: function (gameRoot) {
        gameRoot = gameRoot || {};
        //this.handleDisplayPrefs();
        var size = gameRoot.SZ || 19;
        // Only three sizes supported for now
        if (size != 7 && size != 9 && size != 13 && size != 19)
            size = 19;
        if (this.shrinkToFit)
            this.calcShrinkToFit(gameRoot, size);
        else if (this.problemMode && !this.cropParams) {
            this.cropParams = {
                width: size,
                height: size,
                top: 0,
                left: 0,
                padding: 1};
        }
        if (!this.board) {
            // first time
            this.createBoard(size);
            this.rules = new eidogo.Rules(this.board);
        }
        this.unsavedChanges = false;
        this.resetCursor(true);
        this.totalMoves = 0;
        var moveCursor = new eidogo.GameCursor(this.cursor.node);
        while (moveCursor.next()) { this.totalMoves++; }
        this.totalMoves--;
        //this.showGameInfo(gameRoot);
        //this.selectTool(this.mode == "view" ? "view" : "play");
        this.hook("initGame");
    },

    /**
     * Create our board. This can be called multiple times.
    **/
    createBoard: function(size) {
        size = size || 19;
        if (this.board && this.board.renderer && this.board.boardSize == size) return;
        try {
            //this.dom.boardContainer.innerHTML = "";
            /*var rendererProto = (this.renderer == "flash" ?
                eidogo.BoardRendererFlash : eidogo.BoardRendererHtml);
            var renderer = new rendererProto('', size, this, this.cropParams);*/
            this.board = new eidogo.Board(undefined, size);
        } catch (e) {
            if (e == "No DOM container") {
                this.croak(t['error board']);
                return;
            }
        }
    },

    /**
     * Calculates the crop area to use based on the widest distance between
     * stones and markers in the given game. We're conservative with respect
     * to checking markers: only labels for now.
    **/
    calcShrinkToFit: function(gameRoot, size) {
        // leftmost, topmost, rightmost, bottommost
        var l = null, t = null, r = null, b = null;
        var points = {};
        var me = this;
        // find all points occupied by stones or labels
        gameRoot.walk(function(node) {
            var prop, i, coord;
            for (prop in node) {
                if (/^(W|B|AW|AB|LB)$/.test(prop)) {
                    coord = node[prop];
                    if (!(coord instanceof Array)) coord = [coord];
                    if (prop != 'LB') coord = me.expandCompressedPoints(coord);
                    else coord = [coord[0].split(/:/)[0]];
                    for (i = 0; i < coord.length; i++)
                        points[coord[i]] = "";
                }
            }
        });
        // nab the outermost points
        for (var key in points) {
            var pt = this.sgfCoordToPoint(key);
            if (l == null || pt.x < l) l = pt.x;
            if (r == null || pt.x > r) r = pt.x;
            if (t == null || pt.y < t) t = pt.y;
            if (b == null || pt.y > b) b = pt.y;
        }
        this.cropParams.width = r - l + 1;
        this.cropParams.height = b - t + 1;
        this.cropParams.left = l;
        this.cropParams.top = t;
        // add padding
        var pad = this.cropParams.padding;
        for (var lpad = pad; l - lpad < 0; lpad--) {};
        if (lpad) { this.cropParams.width += lpad; this.cropParams.left -= lpad; }
        for (var tpad = pad; t - tpad < 0; tpad--) {};
        if (tpad) { this.cropParams.height += tpad; this.cropParams.top -= tpad; }
        for (var rpad = pad; r + rpad > size; rpad--) {};
        if (rpad) { this.cropParams.width += rpad; }
        for (var bpad = pad; b + bpad > size; bpad--) {};
        if (bpad) { this.cropParams.height += bpad; }
    },

    /**
     * Fetches a move from an external opponent -- e.g., GnuGo. Provides
     * serialized game data as SGF, the color to move as, and the size of
     * the board. Expects the response to be the SGF coordinate of the
     * move to play.
    **/
    fetchOpponentMove: function() {
        //this.nowLoading(t['gnugo thinking']);
        var success = function(req) {
            //this.doneLoading();
            this.createMove(req.responseText);
        }
        var failure = function(req) {
            this.croak(t['error retrieving']);
        }
        var root = this.cursor.getGameRoot();
        var params = {
            sgf: root.toSgf(),
            move: this.currentColor,
            size: root.SZ,
            level: this.opponentLevel
        };
        ajax('post', this.opponentUrl, params, success, failure, this, 45000);
    },

    /**
     * Use GNU Go to estimate the score.
     * Thanks to Sorin Gherman for the idea and for getting this started!
    **/
    fetchScoreEstimate: function() {
        //this.nowLoading(t['gnugo thinking']);
        var success = function(req) {
            //this.doneLoading();
            var result = req.responseText.split("\n");
            var prop, props = result[1].split(" ");
            for (var i = 0; i < props.length; i++) {
                prop = props[i].split(":");
                if (prop[1]) this.addMarker(prop[1], prop[0]);
            }
            this.board.render();
            this.prependComment(result[0]);
        }
        var failure = function(req) {
            this.croak(t['error retrieving']);
        }
        var root = this.cursor.getGameRoot();
        var params = {
            sgf: root.toSgf(),
            move: 'est',
            size: root.SZ || 19,
            komi: root.KM || 0,
            mn: this.moveNumber + 1
        };
        ajax('post', this.scoreEstUrl, params, success, failure, this, 45000);
    },

    /**
     * Respond to a move made in problem-solving mode
    **/
    playProblemResponse: function(noRender) {
        // short delay before playing
        setTimeout(function() {
            this.variation(null, noRender);
            if (this.hooks.playProblemResponse) {
                this.hook("playProblemResponse");
            } else if (!this.cursor.hasNext()) {
                // not sure if it's safe to say "WRONG" -- that would work for
                // goproblems.com SGFs but I don't know about others
                this.prependComment(t['end of variation']);
            }
        }.bind(this), 200);
    },

    /**
     * Navigates to a location within the game. Takes progressive loading
     * into account.
    **/
    goTo: function(path, fromStart) {
        fromStart = typeof fromStart != "undefined" ? fromStart : true;

        if (fromStart && path.length > 1 && path[0] != this.cursor.getGameRoot().getPosition())
            this.updatedNavTree = false;

        if (fromStart)
            this.resetCursor(true);

        // Move number
        var steps = parseInt(path, 10);
        if (!(path instanceof Array) && !isNaN(steps)) {
            if (fromStart) steps++; // not zero-based
            for (var i = 0; i < steps; i++)
                this.variation(null, true);
            this.refresh();
            return;
        }

        // Not a path?
        if (!(path instanceof Array) || !path.length) {
            alert(t['bad path'] + " " + path);
            return;
        }

        var position;
        var vars;

        // Path of moves (SGF coords)
        if (isNaN(parseInt(path[0], 10))) {
            if (!this.cursor.node._parent)
                this.variation(0, true); // first game tree is assumed
            while (path.length) {
                if (this.progressiveLoads > 0) {
                    this.loadPath.push(position);
                    return;
                }
                position = path.shift();
                vars = this.getVariations();
                for (var i = 0; i < vars.length; i++) {
                    if (vars[i].move == position) {
                        this.variation(vars[i].varNum, true);
                        break;
                    }
                }
            }
            this.refresh();
            return;
        }

        // Path of branch indexes and final move number
        var first = true;
        while (path.length) {
            position = parseInt(path.shift(), 10);
            if (!path.length) {
                for (var i = 0; i < position; i++)
                    this.variation(0, true);
            } else if (path.length) {
                if (!first && fromStart)
                    while (this.cursor.node._children.length == 1)
                        this.variation(0, true);
                this.variation(position, true);
            }
            first = false;
        }
        this.refresh();
    },

    /**
     * Resets the game cursor to the first node
    **/
    resetCursor: function(noRender, toGameRoot) {
        if (this.board != null) { this.board.reset(); }
        this.resetCurrentColor();
        if (toGameRoot) {
            this.cursor.node = this.cursor.getGameRoot();
        } else {
            this.cursor.node = this.collectionRoot;
        }
        this.refresh(noRender);
    },

    /**
     * Resets the current color as appropriate
    **/
    resetCurrentColor: function() {
        this.currentColor = (this.problemMode ? this.problemColor : "B");
        var root = this.cursor.getGameRoot();
        if (root && root.HA > 1)
            this.currentColor = 'W';
    },

    /**
     * Refresh the current node (and wait until progressive loading is
     * finished before doing so)
    **/
    refresh: function(noRender) {
        if (this.progressiveLoads > 0) {
            var me = this;
            setTimeout(function() { me.refresh.call(me); }, 10);
            return;
        }
        if (this.board != null) { this.board.revert(1); }
        this.execNode(noRender);
    },

    /**
     * Handles going the next sibling or variation
     * @param {Number} varNum Variation number to follow
     * @param {Boolean} noRender If true, don't render the board
     */
    variation: function(varNum, noRender) {
        if (this.cursor.next(varNum)) {
            this.execNode(noRender);
            this.resetLastLabels();
            // Should we continue after loading finishes or just stop
            // like we do here?
            if (this.progressiveLoads > 0) return false;
            return true;
        }
        return false;
    },

    /**
     * Delegates the work of putting down stones etc to various handler
     * functions. Also resets some settings and makes sure the interface
     * gets updated.
     * @param {Boolean} noRender If true, don't render the board
     * @param {Boolean} ignoreProgressive Ignores progressive loading
     *      considerations.
     */
    execNode: function(noRender, ignoreProgressive) {
        // don't execute a node while it's being loaded
        if (!ignoreProgressive && this.progressiveLoads > 0) {
            var me = this;
            setTimeout(function() { me.execNode.call(me, noRender); }, 10);
            return;
        }

        if (!this.cursor.node) return;

        if (!noRender) {
            //this.dom.comments.innerHTML = "";
            if (this.board != null) { this.board.clearMarkers(); }
            this.moveNumber = this.cursor.getMoveNumber();
        }

        if (this.moveNumber < 1) {
            this.resetCurrentColor();
        }

        // execute handlers for the appropriate properties
        /*var props = this.cursor.node.getProperties();
        for (var propName in props) {
            if (this.propertyHandlers[propName]) {
                (this.propertyHandlers[propName]).apply(
                    this,
                    [this.cursor.node[propName], propName, noRender]
                );
            }
        }*/

        if (noRender) {
            if (this.board != null) { this.board.commit(); }
        } else {
            // let the opponent move
            if (this.opponentUrl && this.opponentColor == this.currentColor
                && this.moveNumber == this.totalMoves) {
                this.fetchOpponentMove();
            }
            this.findVariations();
            //this.updateControls();
            if (this.board != null) {
                this.board.commit();
                this.board.render();
            }
        }

        // progressive loading?
        if (!ignoreProgressive && this.progressiveUrl)
            this.fetchProgressiveData();

        // play a reponse in problem-solving mode, unless we just navigated backwards
        if (this.problemMode && this.currentColor && this.currentColor != this.problemColor && !this.goingBack)
            this.playProblemResponse(noRender);

        this.goingBack = false;
    },

    fetchProgressiveData: function(completeFn) {
        var loadNode = this.cursor.node || null;
        if (loadNode && loadNode._cached) return;
        if (this.progressiveMode == "pattern") {
            if (loadNode && !loadNode._parent._parent) return; // special case
            this.fetchProgressiveContinuations(completeFn);
        } else {
            var loadId = (loadNode && loadNode._id) || 0;
            //this.nowLoading();
            this.progressiveLoads++;
            // Show pro game search after second move
            var completeFnWrap = function() {
                var moveNum = this.cursor.getMoveNumber();
                if (moveNum > 1)
                    this.cursor.node.C = "<a id='cont-search' href='#'>" +
                        t['show games'] + "</a>" + (this.cursor.node.C || "");
                this.refresh();
                if (completeFn && typeof completeFn == "function")
                    completeFn();
                addEvent(byId("cont-search"), "click", function(e) {
                    var size = 8;
                    var region = this.board.getRegion(0, 19 - size, size, size);
                    var pattern = this.convertRegionPattern(region);
                    this.loadSearch("ne", size + "x" + size, this.compressPattern(pattern));
                    stopEvent(e);
                }.bind(this));
            }.bind(this);
            /*var url = this.progressiveUrl + "?" +
                eidogo.util.makeQueryString({id: loadId, pid: this.uniq});
            this.remoteLoad(url, loadNode, false, null, completeFnWrap);*/
        }
    },

    fetchProgressiveContinuations: function(completeFn) {
        //this.nowLoading();
        this.progressiveLoads++;
        var moveNum = this.cursor.getMoveNumber();
        var size = (moveNum > 1 ? 11 : 7);
        var left = 19 - size - 1;
        var pattern = this.board ?
            this.convertRegionPattern(this.board.getRegion(0, left+1, size, size)) :
            ".................................................";
        var params = {
            q: "ne",
            w: size,
            h: size,
            p: pattern,
            a: "continuations",
            t: (new Date()).getTime()};
        var failure = function(req) {
            this.croak(t['error retrieving']);
        }
        var success = function(req) {
            if (!req.responseText || req.responseText == "NONE") {
                this.progressiveLoads--;
                //this.doneLoading();
                this.cursor.node._cached = true;
                this.refresh();
                return;
            }
            var contBranch = {LB: [], _children: []}, contNode;
            contBranch.C = moveNum > 1 ? "<a id='cont-search' href='#'>" +
                t['show games'] + "</a>" : "";
            var cont,
                conts = eval('(' + req.responseText + ')');
            if (conts.length) {
                conts.sort(function(a, b) { return parseInt(b.count, 10) - parseInt(a.count, 10); });
                var highCount = parseInt(conts[0].count, 10);
                var x, y, coord, percent;
                contBranch.C += "<div class='continuations'>";
                for (var i = 0; cont = conts[i]; i++) {
                    percent = parseInt(cont.count / highCount * 150);
                    if (highCount > 20 && parseInt(cont.count, 10) < 10) continue;
                    contNode = {};
                    x = left + parseInt(cont.x, 10) + 1;
                    y = parseInt(cont.y, 10);
                    coord = this.pointToSgfCoord({x:x,y:y});
                    contNode[this.currentColor || "B"] = coord;
                    contBranch.LB.push(coord + ":" + cont.label);
                    if (percent)
                        contBranch.C += "<div class='continuation'>" +
                            "<div class='cont-label'>" + cont.label + "</div>" +
                            "<div class='cont-bar' style='width: " + percent + "px'></div>" +
                            "<div class='cont-count'>" + cont.count + "</div>" +
                            "</div>";
                    contBranch._children.push(contNode);
                }
                contBranch.C += "</div>";
                if (!this.cursor.node)
                    contBranch = {_children: [contBranch]};
            }
            this.load(contBranch, this.cursor.node);
            addEvent(byId("cont-search"), "click", function(e) {
                this.loadSearch("ne", size + "x" + size, this.compressPattern(pattern));
                stopEvent(e);
            }.bind(this));
            if (completeFn && typeof completeFn == "function")
                completeFn();
        }.bind(this);
        ajax('get', this.progressiveUrl, params, success, failure, this, 45000);
    },

    /**
     * Locates any variations within the current node and makes note of their
     * move and index position
     */
    findVariations: function() {
        this.variations = this.getVariations();
    },

    getVariations: function() {
        var vars = [],
            kids = this.cursor.node._children;
        for (var i = 0; i < kids.length; i++) {
            vars.push({move: kids[i].getMove(), varNum: i});
        }
        return vars;
    },

    back: function(e, obj, noRender) {
        if (this.cursor.previous()) {
            this.board.revert(1);
            this.goingBack = true;
            this.refresh(noRender);
            this.resetLastLabels();
        }
    },

    forward: function(e, obj, noRender) {
        this.variation(null, noRender);
    },

    first: function() {
        if (!this.cursor.hasPrevious()) return;
        this.resetCursor(false, true);
    },

    last: function() {
        if (!this.cursor.hasNext()) return;
        while (this.variation(null, true)) {}
        this.refresh();
    },

    pass: function() {
        if (!this.variations) return;
        for (var i = 0; i < this.variations.length; i++) {
            if (!this.variations[i].move || this.variations[i].move == "tt") {
                this.variation(this.variations[i].varNum);
                return;
            }
        }
        this.createMove('tt');
    },

    /**
     * Check whether a point falls within a given region (left, top, right,
     * bottom)
    **/
    boundsCheck: function(x, y, region) {
        if (region.length == 2) {
            region[3] = region[2] = region[1];
            region[1] = region[0];
        }
        return (x >= region[0] && y >= region[1] &&
            x <= region[2] && y <= region[3]);
    },

    /**
     * Return a top-left-width-height array based on the left-top-right-bottom
     * selection region
    **/
    getRegionBounds: function() {
        // top, left, width, height
        var l = this.regionLeft;
        var w = this.regionRight - this.regionLeft;
        if (w < 0) {
            l = this.regionRight;
            w = -w + 1;
        }
        var t = this.regionTop;
        var h = this.regionBottom - this.regionTop;
        if (h < 0) {
            t = this.regionBottom;
            h = -h + 1;
        }
        return [t, l, w, h];
    },

    /**
     * Tell the board renderer to show the search region
    **/
    showRegion: function() {
        var bounds = this.getRegionBounds();
        this.board.renderer.showRegion(bounds);
    },

    /**
     * Tell the board renderer to hide the search region
    **/
    hideRegion: function() {
        this.board.renderer.hideRegion();
    },

    /**
     * Converts a board region array to a string suitable for searching
    **/
    convertRegionPattern: function(region) {
        return region.join("")
            .replace(new RegExp(this.board.EMPTY, "g"), ".")
            .replace(new RegExp(this.board.BLACK, "g"), "x")
            .replace(new RegExp(this.board.WHITE, "g"), "o");
    },

    /**
     * Set up a board position to represent a search pattern, then start
     * the search
    **/
    loadSearch: function(q, dim, p, a, o) {
        var blankGame = {_children: [{SZ: this.board.boardSize, _children: []}]};
        this.load(blankGame);
        a = a || "corner";
        this.dom.searchAlgo.value = a;
        p = this.uncompressPattern(p);
        dim = dim.split("x");
        var w = dim[0];
        var h = dim[1];
        var bs = this.board.boardSize;
        var l;
        var t;
        switch (q) {
            case "nw": l = 0; t = 0; break;
            case "ne": l = bs - w; t = 0; break;
            case "se": l = bs - w; t = bs - h; break;
            case "sw": l = 0; t = bs - h; break;
        }
        var c;
        var x;
        var y;
        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
                c = p.charAt(y * w + x);
                if (c == "o") {
                    c = "AW";
                } else if (c == "x") {
                    c = "AB";
                } else {
                    c = "";
                }
                this.cursor.node.pushProperty(c, this.pointToSgfCoord({x:l+x, y:t+y}));
            }
        }

        this.refresh();

        this.regionLeft = l;
        this.regionTop = t;
        this.regionRight = l + x;
        this.regionBottom = t + y;

        // highlight the selected search region by dimming surroundings
        var b = this.getRegionBounds();
        var r = [b[1], b[0], b[1]+b[2], b[0]+b[3]-1];
        for (y = 0; y < this.board.boardSize; y++) {
            for (x = 0; x < this.board.boardSize; x++) {
                if (!this.boundsCheck(x, y, r)) {
                    this.board.renderer.renderMarker({x:x,y:y}, "dim");
                }
            }
        }

        this.searchRegion(o);
    },

    /**
     * Call out to our external handler to perform a pattern search. Also
     * prevent meaningless or overly-simple searches.
    **/
    searchRegion: function(offset) {
        if (this.searching) return;
        this.searching = true;

        if (!this.searchUrl) {
            show(this.dom.comments);
            hide(this.dom.searchContainer);
            this.prependComment(t['no search url']);
            return;
        }

        var offset = parseInt(offset, 10) || 0;
        var algo = this.dom.searchAlgo.value;

        var bounds = this.getRegionBounds();
        var region = this.board.getRegion(bounds[0], bounds[1], bounds[2], bounds[3]);
        var pattern = this.convertRegionPattern(region);

        // check for empty or meaningless searches
        var empty = /^\.*$/.test(pattern);
        var oneW = /^\.*o\.*$/.test(pattern);
        var oneB = /^\.*x\.*$/.test(pattern);
        if (empty || oneW || oneB) {
            this.searching = false;
            show(this.dom.comments);
            hide(this.dom.searchContainer);
            this.prependComment(t['two stones']);
            return;
        }

        // make sure corner search regions touch two adjacent edges of the board
        var edges = [];
        if (bounds[0] == 0) edges.push('n');
        if (bounds[1] == 0) edges.push('w')
        if (bounds[0] + bounds[3] == this.board.boardSize) edges.push('s');
        if (bounds[1] + bounds[2] == this.board.boardSize) edges.push('e');
        if (algo == "corner" && !(edges.length == 2 &&
             ((edges.contains('n') && edges.contains('e')) ||
              (edges.contains('n') && edges.contains('w')) ||
              (edges.contains('s') && edges.contains('e')) ||
              (edges.contains('s') && edges.contains('w'))))) {
            this.searching = false;
            show(this.dom.comments);
            hide(this.dom.searchContainer);
            this.prependComment(t['two edges']);
            return;
        }

        var quadrant = (edges.contains('n') ? "n" : "s");
        quadrant += (edges.contains('w') ? "w" : "e");

        this.showComments("");
        this.gameName = "search";

        var success = function(req) {
            this.searching = false;
            //this.doneLoading();
            hide(this.dom.comments);
            show(this.dom.searchContainer);
            this.showingSearch = true;
            if (req.responseText == "ERROR") {
                this.croak(t['error retrieving']);
                return;
            } else if (req.responseText == "NONE") {
                hide(this.dom.searchResultsContainer);
                this.dom.searchCount.innerHTML = "No";
                return;
            }
            var ret = eval("(" + req.responseText + ")");
            var results = ret.results,
                result,
                html = "",
                odd,
                total = parseInt(ret.total, 10),
                offsetStart = parseInt(ret.offset, 10) + 1,
                offsetEnd = parseInt(ret.offset, 10) + 50;
            for(var i = 0; result = results[i]; i++) {
                odd = odd ? false : true;
                html += "<a class='search-result" + (odd ? " odd" : "") + "' href='#'>\
                    <span class='id'>" + result.id + "</span>\
                    <span class='mv'>" + result.mv + "</span>\
                    <span class='pw'>" + result.pw + " " + result.wr + "</span>\
                    <span class='pb'>" + result.pb + " " + result.br + "</span>\
                    <span class='re'>" + result.re + "</span>\
                    <span class='dt'>" + result.dt + "</span>\
                    <div class='clear'>&nbsp;</div>\
                    </a>";
            }
            if (total > offsetEnd)
                html += "<div class='search-more'><a href='#' id='search-more'>Show more...</a></div>";
            show(this.dom.searchResultsContainer);
            this.dom.searchResults.innerHTML = html + "<br>";
            this.dom.searchCount.innerHTML = total;
            this.dom.searchOffsetStart.innerHTML = offsetStart;
            this.dom.searchOffsetEnd.innerHTML = (total < offsetEnd ? total : offsetEnd);
            this.dom.searchContainer.scrollTop = 0;
            if (total > offsetEnd) {
                setTimeout(function() {
                    addEvent(byId("search-more"), "click", function(e) {
                        this.loadSearch(quadrant, bounds[2] + "x" + bounds[3],
                            pattern, "corner", ret.offset + 51);
                        stopEvent(e);
                    }.bind(this));
                }.bind(this), 0);
            }
        }
        var failure = function(req) {
            this.croak(t['error retrieving']);
        }
        var params = {
            q: quadrant,
            w: bounds[2],
            h: bounds[3],
            p: pattern,
            a: algo,
            o: offset,
            t: (new Date()).getTime()
        };

        this.progressiveLoad = false;
        this.progressiveUrl = null;
        this.prefs.markNext = false;
        this.prefs.showPlayerInfo = true;

        this.hook("searchRegion", params);

        //this.nowLoading();
        ajax('get', this.searchUrl, params, success, failure, this, 45000);
    },

    /**
     * Load a particular search result. This gets called via the HTML
     * output by the external search handler.
    **/
    loadSearchResult: function(e) {
        //this.nowLoading();
        var target = e.target || e.srcElement;
        if (target.nodeName == "SPAN") {
            target = target.parentNode;
        }
        if (target.nodeName == "A") {
            var span;
            var id;
            var mv;
            for (var i = 0; span = target.childNodes[i]; i++) {
                if (span.className == "id") {
                    id = span.innerHTML;
                }
                if (span.className == "mv") {
                    mv = parseInt(span.innerHTML, 10);
                }
            }
        }
        this.remoteLoad(id, null, true, [0, mv], function() {
            //this.doneLoading();
            //this.prefs.showOptions = true;
            //this.handleDisplayPrefs();
        }.bind(this));
        stopEvent(e);
    },

    /**
     * Close the search pane
    **/
    closeSearch: function() {
        this.showingSearch = false;
        hide(this.dom.searchContainer);
        show(this.dom.comments);
    },

    /**
     * Takes a pattern string like ...O...XX and converts it to .3O.3X2
     */
    compressPattern: function(pattern) {
        var c = null;
        var pc = "";
        var n = 1;
        var ret = "";
        for (var i = 0; i < pattern.length; i++) {
            c = pattern.charAt(i);
            if (c == pc) {
               n++;
            } else {
                ret = ret + pc + (n > 1 ? n : "");
                n = 1;
                pc = c;
            }
        }
        ret = ret + pc + (n > 1 ? n : "");
        return ret;
    },

    uncompressPattern: function(pattern) {
        var c = null;
        var s = null;
        var n = "";
        var ret = "";
        for (var i = 0; i < pattern.length; i++) {
            c = pattern.charAt(i);
            if (c == "." || c == "x" || c == "o") {
                if (s != null) {
                    n = parseInt(n, 10);
                    n = isNaN(n) ? 1 : n;
                    for (var j = 0; j < n; j++) {
                        ret += s;
                    }
                    n = "";
                }
                s = c;
            } else {
                n += c;
            }
        }
        n = parseInt(n, 10);
        n = isNaN(n) ? 1 : n;
        for (var j = 0; j < n; j++) {
            ret += s;
        }
        return ret;
    },

    /**
     * Create an as-yet unplayed move and go to it.
     */
    createMove: function(coord) {
        var props = {};
        props[this.currentColor] = coord;
        var varNode = new eidogo.GameNode(null, props);
        varNode._cached = true;
        this.totalMoves++;
        this.cursor.node.appendChild(varNode);
        this.unsavedChanges = [this.cursor.node._children.last(), this.cursor.node];
        this.updatedNavTree = false;
        this.variation(this.cursor.node._children.length-1);
    },

    setColor: function(color) {
        this.prependComment(color == "B" ? t['black to play'] :
            t['white to play']);
        this.currentColor = this.problemColor = color;
    },

    setMoveNumber: function(num) {
        this.moveNumber = num;
    },

    /**
     * Play a move on the board and apply rules to it. This is different from
     * merely adding a stone.
    **/
    playMove: function(coord, color, noRender) {
        color = color || this.currentColor;
        this.currentColor = (color == "B" ? "W" : "B");
        color = color == "W" ? this.board.WHITE : this.board.BLACK;
        var pt = this.sgfCoordToPoint(coord);
        if ((!coord || coord == "tt" || coord == "") && !noRender) {
            this.prependComment((color == this.board.WHITE ?
               'PW' : 'PB') + " " + 'passed', "comment-pass");
        } else if (coord == "resign") {
            this.prependComment((color == this.board.WHITE ?
                'PW' : 'PB') + " " + 'resigned', "comment-resign");
        } else if (coord && coord != "tt") {
            this.board.addStone(pt, color);
            this.rules.apply(pt, color);
            if (this.prefs.markCurrent && !noRender) {
                this.addMarker(coord, "current");
            }
        }
        var props = {};
        props[this.currentColor] = coord;
        var varNode = new eidogo.GameNode(null, props);
        varNode._cached = true;
        this.totalMoves++;
        this.cursor.node.appendChild(varNode);
    },

    addStone: function(coord, color) {
        if (!(coord instanceof Array)) {
            coord = [coord];
        }
        coord = this.expandCompressedPoints(coord);
        for (var i = 0; i < coord.length; i++) {
            this.board.addStone(
                this.sgfCoordToPoint(coord[i]),
                color == "AW" ? this.board.WHITE :
                color == "AB" ? this.board.BLACK : this.board.EMPTY
            );
        }
    },

    addMarker: function(coord, type) {
        if (!(coord instanceof Array)) {
            coord = [coord];
        }
        coord = this.expandCompressedPoints(coord);
        var label;
        for (var i = 0; i < coord.length; i++) {
            switch (type) {
                case "TR": label = "triangle"; break;
                case "SQ": label = "square"; break;
                case "CR": label = "circle"; break;
                case "MA": label = "ex"; break;
                case "TW": label = "territory-white"; break;
                case "TB": label = "territory-black"; break;
                case "DD": label = "dim"; break;
                case "LB": label = (coord[i].split(":"))[1]; break;
                default: label = type; break;
            }
            this.board.addMarker(
                this.sgfCoordToPoint((coord[i].split(":"))[0]),
                label
            );
        }
    },

    showTime: function(value, type) {
        var tp = (type == "BL" || type == "OB" ? "timeB" : "timeW");
        if (type == "BL" || type == "WL") {
            var mins = Math.floor(value / 60);
            var secs = (value % 60).toFixed(0);
            secs = (secs < 10 ? "0" : "") + secs;
            this[tp] = mins + ":" + secs;
        } else {
            this[tp] += " (" + value + ")";
        }
    },

    /**
     * Good move, bad move, etc
    **/
    showAnnotation: function(value, type) {
        var msg;
        switch (type) {
            case 'N':  msg = value; break;
            case 'GB': msg = (value > 1 ? t['vgb'] : t['gb']); break;
            case 'GW': msg = (value > 1 ? t['vgw'] : t['gw']); break;
            case 'DM': msg = (value > 1 ? t['dmj'] : t['dm']); break;
            case 'UC': msg = t['uc']; break;
            case 'TE': msg = t['te']; break;
            case 'BM': msg = (value > 1 ? t['vbm'] : t['bm']); break;
            case 'DO': msg = t['do']; break;
            case 'IT': msg = t['it']; break;
            case 'HO': msg = t['ho']; break;
        }
        this.prependComment(msg);
    },

    showComments: function(comments, junk, noRender) {
        if (!comments || noRender) return;
        this.dom.comments.innerHTML += comments.replace(/^(\n|\r|\t|\s)+/, "").replace(/\n/g, "<br />");
    },

    /**
     * For special notices
    **/
    prependComment: function(content, cls) {
        /*cls = cls || "comment-status";
        this.dom.comments.innerHTML = "<div class='" + cls + "'>" +
            content + "</div>" + this.dom.comments.innerHTML;*/
    },

    /**
     * Redirect to a download handler or attempt to display data inline
    **/
    downloadSgf: function(evt) {
        stopEvent(evt);
        if (this.downloadUrl) {
            if (this.unsavedChanges) {
                 alert(t['unsaved changes']);
                return;
            }
            location.href = this.downloadUrl + this.gameName;
        } else if (isMoz) {
            location.href = "data:text/plain," +
                encodeURIComponent(this.cursor.getGameRoot().toSgf());
        }
    },

    /**
     * Send SGF data to a file-saving handler
    **/
    save: function(evt) {
        stopEvent(evt);
        var success = function(req) {
            this.hook("saved", [req.responseText]);
        }
        var failure = function(req) {
            this.croak(t['error retrieving']);
        }
        var sgf = this.cursor.getGameRoot().toSgf();
        ajax('POST', this.saveUrl, {sgf: sgf}, success, failure, this, 30000);
    },

    /**
     * Construct a navigation tree from scratch, assuming it hasn't been done
     * already and no unsaved additions have been made.
     *
     * We do this in two passes:
     *    1) Construct a 2D array, navGrid, containing all nodes and where
     *       to display them horizontally and vertically (adjustments are
     *       made to avoid overlapping lines of play)
     *    2) Based on navGrid, construct an HTML table to actually display
     *       the nav tree
     *
     * We use a timeout to limit how often the intense calculations happen,
     * and to provide a more responsive UI.
    **/
    updateNavTree: function(update) {
        if (!this.prefs.showNavTree)
            return;
        if (this.updatedNavTree) {
            this.showNavTreeCurrent();
            return;
        }
        // Reconstruct the nav tree a max of once per second (if multiple
        // moves are played quickly in a row, it will wait until one second
        // after the last one is played). The timeout also has the benefit
        // of updating the rest of the UI first, so it seems more responsive.
        if (!update) {
            if (this.navTreeTimeout)
                clearTimeout(this.navTreeTimeout);
            this.navTreeTimeout = setTimeout(function() {
                this.updateNavTree(true);
            }.bind(this), eidogo.browser.ie ? 1000 : 500);
            return;
        }
        this.updatedNavTree = true;
        // Construct 2D nav grid
        var navGrid = [],
            gameRoot = this.cursor.getGameRoot();
            path = [gameRoot.getPosition()],
            cur = new eidogo.GameCursor(),
            maxx = 0;
        var traverse = function(node, startx, starty) {
            var y = starty, x = startx;
            var n = node, width = 1;
            while (n && n._children.length == 1) {
                width++;
                n = n._children[0];
            }
            // If we'll overlap any future moves, skip down a row
            while (navGrid[y] && navGrid[y].slice(x, x + width + 1).some(function(el) {
                return (typeof el != "undefined");
            })) {
                y++;
            }
            do {
                if (!navGrid[y])
                    navGrid[y] = [];
                cur.node = node;
                node._pathStr = path.join('-') + "-" + (x - startx);
                navGrid[y][x] = node;
                if (x > maxx)
                    maxx = x;
                x++;
                if (node._children.length != 1) break;
                node = node._children[0];
            } while (node);
            for (var i = 0; i < node._children.length; i++) {
                path.push(i);
                traverse(node._children[i], x, y);
                path.pop();
            }
        }
        traverse(gameRoot, 0, 0);
        // Construct HTML
        var html = ["<table class='nav-tree'>"],
            node, td, cur = new eidogo.GameCursor(),
            x, y, showLine,
            ELBOW = 1, LINE = 2;
        for (x = 0; x < maxx; x++) {
            showLine = false
            for (y = navGrid.length - 1; y > 0; y--) {
                if (!navGrid[y][x]) {
                    if (typeof navGrid[y][x + 1] == "object") {
                        navGrid[y][x] = ELBOW;
                        showLine = true;
                    } else if (showLine) {
                        navGrid[y][x] = LINE;
                    }
                } else {
                    showLine = false;
                }
            }
        }
        for (y = 0; y < navGrid.length; y++) {
            html.push("<tr>");
            for (x = 0; x < navGrid[y].length; x++) {
                node = navGrid[y][x];
                if (node == ELBOW) {
                    td = "<div class='elbow'></div>";
                } else if (node == LINE) {
                    td = "<div class='line'></div>";
                } else if (node) {
                    td = ["<a href='#' id='navtree-node-",
                          node._pathStr,
                          "' class='",
                          (typeof node.W != "undefined" ? 'w' :
                          (typeof node.B != "undefined" ? 'b' : 'x')),
                          "'>",
                          x,
                          "</a>"].join("");
                } else {
                    td = "<div class='empty'></div>";
                }
                html.push("<td>");
                html.push(td);
                html.push("</td>");
            }
            html.push("</tr>");
        }
        html.push("</table>");
        this.dom.navTree.innerHTML = html.join("");
        setTimeout(function() {
            this.showNavTreeCurrent();
        }.bind(this), 0);
    },

    navTreeClick: function(e) {
        var target = e.target || e.srcElement;
        if (!target || !target.id) return;
        var path = target.id.replace(/^navtree-node-/, "").split("-");
        this.goTo(path, true);
        stopEvent(e);
    },

    resetLastLabels: function() {
        this.labelLastNumber = 1;
        this.labelLastLetter = "A";
    },

    getGameDescription: function(excludeGameName) {
        var root = this.cursor.getGameRoot();
        if (!root) return;
        var desc = (excludeGameName ? "" : root.GN || this.gameName);
        if (root.PW && root.PB) {
            var wr = root.WR ? " " + root.WR : "";
            var br = root.BR ? " " + root.BR : "";
            desc += (desc.length ? " - " : "") + root.PW + wr + " vs " + root.PB + br;
        }
        return desc;
    },

    sgfCoordToPoint: function(coord) {
        if (!coord || coord == "tt") return {x: null, y: null};
        var sgfCoords = {
            a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7, i: 8, j: 9,
            k: 10,l: 11, m: 12, n: 13, o: 14, p: 15, q: 16, r: 17, s: 18
        };
        return {
            x: sgfCoords[coord.charAt(0)],
            y: sgfCoords[coord.charAt(1)]
        };
    },

    pointToSgfCoord: function(pt) {
        if (!pt || (this.board && !this.boundsCheck(pt.x, pt.y, [0, this.board.boardSize-1]))) {
            return null;
        }
        var pts = {
            0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e', 5: 'f', 6: 'g', 7: 'h',
            8: 'i', 9: 'j', 10: 'k', 11: 'l', 12: 'm', 13: 'n', 14: 'o',
            15: 'p', 16: 'q', 17: 'r', 18: 's'
        };
        return pts[pt.x] + pts[pt.y];
    },

    expandCompressedPoints: function(coords) {
        var bounds;
        var ul, lr;
        var x, y;
        var newCoords = [];
        var hits = [];
        for (var i = 0; i < coords.length; i++) {
            bounds = coords[i].split(/:/);
            if (bounds.length > 1) {
                ul = this.sgfCoordToPoint(bounds[0]);
                lr = this.sgfCoordToPoint(bounds[1]);
                for (x = ul.x; x <= lr.x; x++) {
                   for (y = ul.y; y <= lr.y; y++) {
                       newCoords.push(this.pointToSgfCoord({x:x,y:y}));
                   }
                }
                hits.push(i);
            }
       }
       coords = coords.concat(newCoords);
       return coords;
    },

    croak: function(msg) {
        //this.doneLoading();
        if (this.board) {
            alert(msg);
        } else if (this.problemMode) {
            this.prependComment(msg);
        } else {
            this.dom.player.innerHTML += "<div class='eidogo-error " +
                (this.theme ? " theme-" + this.theme : "") + "'>" +
                msg.replace(/\n/g, "<br />") + "</div>";
            this.croaked = true;
        }
    }
};

/* Gametree.js */

/**
 * For uniquely identifying nodes. Should work even if we have
 * multiple Player instantiations. Setting this to 100000 is kind of a hack
 * to avoid overlap with ids of as-yet-unloaded trees.
 */
eidogo.gameNodeIdCounter = 100000;

/**
 * @class GameNode holds SGF-like data containing things like moves, labels
 * game information, and so on. Each GameNode has children and (usually) a
 * parent. The first child is the main line.
 */
eidogo.GameNode = function() {
    this.init.apply(this, arguments);
};
eidogo.GameNode.prototype = {
    /**
     * @constructor
     * @param {GameNode} parent Parent of the node
     * @param {Object} properties SGF-like JSON object to load into the node
     */
    init: function(parent, properties, id) {
        this._id = (typeof id != "undefined" ? id : eidogo.gameNodeIdCounter++);
        this._parent = parent || null;
        this._children = [];
        this._preferredChild = 0;
        if (properties)
            this.loadJson(properties);
    },
    /**
     * Adds a property to this node without replacing existing values. If
     * the given property already exists, it will make the value an array
     * containing the given value and any existing values.
    **/
    pushProperty: function(prop, value) {
        if (this[prop]) {
            if (!(this[prop] instanceof Array))
                this[prop] = [this[prop]];
            if (!this[prop].contains(value))
                this[prop].push(value);
        } else {
            this[prop] = value;
        }
    },
    /**
     * Check whether this node contains the given property with the given
     * value
    **/
    hasPropertyValue: function(prop, value) {
        if (!this[prop]) return false;
        var values = (this[prop] instanceof Array ? this[prop] : [this[prop]]);
        return values.contains(value);
    },
    /**
     * Removes a value from property or properties. If the value is the only
     * one for the property, removes the property also. Value can be a RegExp
     * or a string
    **/
    deletePropertyValue: function(prop, value) {
        var test = (value instanceof RegExp) ?
            function(v) { return value.test(v); } :
            function(v) { return value == v; };
        var props = (prop instanceof Array ? prop : [prop]);
        for (var i = 0; prop = props[i]; i++) {
            if (this[prop] instanceof Array) {
                this[prop] = this[prop].filter(function(v) { return !test(v); });
                if (!this[prop].length) delete this[prop];
            } else if (test(this.prop)) {
                delete this[prop];
            }
        }
    },
    /**
     * Loads SGF-like data given in JSON format:
     *      {PROP1: VALUE, PROP2: VALUE, _children: [...]}
     * Node properties will be overwritten if they exist or created if they
     * don't.
     *
     * We use a stack instead of recursion to avoid recursion limits.
    **/
    loadJson: function(data) {
        var jsonStack = [data], gameStack = [this];
        var jsonNode, gameNode;
        var i, len;
        while (jsonStack.length) {
            jsonNode = jsonStack.pop();
            gameNode = gameStack.pop();
            gameNode.loadJsonNode(jsonNode);
            len = (jsonNode._children ? jsonNode._children.length : 0);
            for (i = 0; i < len; i++) {
                jsonStack.push(jsonNode._children[i]);
                if (!gameNode._children[i])
                    gameNode._children[i] = new eidogo.GameNode(gameNode);
                gameStack.push(gameNode._children[i]);
            }
        }
    },
    /**
     * Adds properties to the current node from a JSON object
    **/
    loadJsonNode: function(data) {
        for (var prop in data) {
            if (prop == "_id") {
                this[prop] = data[prop].toString();
                eidogo.gameNodeIdCounter = Math.max(eidogo.gameNodeIdCounter,
                                                    parseInt(data[prop], 10));
                continue;
            }
            if (prop.charAt(0) != "_")
                this[prop] = data[prop];
        }
    },
    /**
     * Add a new child (variation)
    **/
    appendChild: function(node) {
        node._parent = this;
        this._children.push(node);
    },
    /**
     * Returns all the properties for this node
    **/
    getProperties: function() {
        var properties = {}, propName, isReserved, isString, isArray;
        for (propName in this) {
            isPrivate = (propName.charAt(0) == "_");
            isString = (typeof this[propName] == "string");
            isArray = (this[propName] instanceof Array);
            if (!isPrivate && (isString || isArray))
                properties[propName] = this[propName];
        }
        return properties;
    },
    /**
     * Applies a function to this node and all its children, recursively
     * (although we use a stack instead of actual recursion)
    **/
    walk: function(fn, thisObj) {
        var stack = [this];
        var node;
        var i, len;
        while (stack.length) {
            node = stack.pop();
            fn.call(thisObj || this, node);
            len = (node._children ? node._children.length : 0);
            for (i = 0; i < len; i++)
                stack.push(node._children[i]);
        }
    },
    /**
     * Get the current black or white move as a raw SGF coordinate
    **/
    getMove: function() {
        if (typeof this.W != "undefined")
            return this.W;
        else if (typeof this.B != "undefined")
            return this.B;
        return null;
    },
    /**
     * Empty the current node of any black or white stones (played or added)
    **/
    emptyPoint: function(coord) {
        var props = this.getProperties();
        var deleted = null;
        for (var propName in props) {
            if (propName == "AW" || propName == "AB" || propName == "AE") {
                if (!(this[propName] instanceof Array))
                    this[propName] = [this[propName]];
                this[propName] = this[propName].filter(function(val) {
                    if (val == coord) {
                        deleted = val;
                        return false;
                    }
                    return true;
                });
                if (!this[propName].length)
                    delete this[propName];
            } else if ((propName == "B" || propName == "W") && this[propName] == coord) {
                deleted = this[propName];
                delete this[propName];
            }
        }
        return deleted;
    },
    /**
     * Returns the node's position in its parent's _children array
    **/
    getPosition: function() {
        if (!this._parent) return null;
        var siblings = this._parent._children;
        for (var i = 0; i < siblings.length; i++)
            if (siblings[i]._id == this._id) {
                return i;
            }
        return null;
    },
    /**
     * Converts this node and all children to SGF
    **/
    toSgf: function() {
        var sgf = (this._parent ? "(" : "");
        var node = this;

        function propsToSgf(props) {
            if (!props) return "";
            var sgf = ";", key, val;
            for (key in props) {
                if (props[key] instanceof Array) {
                    val = props[key].map(function (val) {
                        return val.toString().replace(/\]/g, "\\]");
                    }).join("][");
                } else {
                    val = props[key].toString().replace(/\]/g, "\\]");
                }
                sgf += key + "[" + val  + "]";
            }
            return sgf;
        }

        sgf += propsToSgf(node.getProperties());

        // Follow main line until we get to a node with multiple variations
        while (node._children.length == 1) {
            node = node._children[0];
            sgf += propsToSgf(node.getProperties());
        }

        // Variations
        for (var i = 0; i < node._children.length; i++) {
            sgf += node._children[i].toSgf();
        }

        sgf += (this._parent ? ")" : "");

        return sgf;
    }
};

/**
 * @class GameCursor is used to navigate among the nodes of a game tree.
 */
eidogo.GameCursor = function() {
    this.init.apply(this, arguments);
}
eidogo.GameCursor.prototype = {
    /**
     * @constructor
     * @param {eidogo.GameNode} A node to start with
     */
    init: function(node) {
        this.node = node;
    },
    next: function(varNum) {
        if (!this.hasNext()) return false;
        varNum = (typeof varNum == "undefined" || varNum == null ?
            this.node._preferredChild : varNum);
        this.node._preferredChild = varNum;
        this.node = this.node._children[varNum];
        return true;
    },
    previous: function() {
        if (!this.hasPrevious()) return false;
        this.node = this.node._parent;
        return true;
    },
    hasNext: function() {
        return this.node && this.node._children.length;
    },
    hasPrevious: function() {
        // Checking _parent of _parent is to prevent returning to root
        return this.node && this.node._parent && this.node._parent._parent;
    },
    getNextMoves: function() {
        if (!this.hasNext()) return null;
        var moves = {};
        var i, node;
        for (i = 0; node = this.node._children[i]; i++)
            moves[node.getMove()] = i;
        return moves;
    },
    getNextColor: function() {
        if (!this.hasNext()) return null;
        var i, node;
        for (var i = 0; node = this.node._children[i]; i++)
            if (node.W || node.B)
                return node.W ? "W" : "B";
        return null;
    },
    getNextNodeWithVariations: function() {
        var node = this.node;
        while (node._children.length == 1)
            node = node._children[0];
        return node;
    },
    getPath: function() {
        var n = this.node,
            rpath = [],
            mn = 0;
        while (n && n._parent && n._parent._children.length == 1 && n._parent._parent) {
            mn++;
            n = n._parent;
        }
        rpath.push(mn);
        while (n) {
            if (n._parent && (n._parent._children.length > 1 || !n._parent._parent))
                rpath.push(n.getPosition() || 0);
            n = n._parent;
        }
        return rpath.reverse();
    },
    getPathMoves: function() {
        var path = [];
        var cur = new eidogo.GameCursor(this.node);
        path.push(cur.node.getMove());
        while (cur.previous()) {
            var move = cur.node.getMove();
            if (move) path.push(move);
        }
        return path.reverse();
    },
    getMoveNumber: function() {
        var num = 0,
            node = this.node;
        while (node) {
            if (node.W || node.B) num++;
            node = node._parent;
        }
        return num;
    },
    getGameRoot: function() {
        if (!this.node) return null;
        var cur = new eidogo.GameCursor(this.node);
        // If we're on the tree root, return the first game
        if (!this.node._parent && this.node._children.length)
            return this.node._children[0];
        while (cur.previous()) {};
        return cur.node;
    }
};

/* SGF.js */

/**
 * @class Returns an SGF-like JSON object of the form:
 *      { PROP1: value,  PROP2: value, ..., _children: [...]}
 */
eidogo.SgfParser = function() {
    this.init.apply(this, arguments);
}
eidogo.SgfParser.prototype = {
    /**
     * @constructor
     * @param {String} sgf Raw SGF data to parse
     */
    init: function(sgf, completeFn) {
        completeFn = (typeof completeFn == "function") ? completeFn : null;
        this.sgf = sgf;
        this.index = 0;
        this.root = {_children: []};
        this.parseTree(this.root);
        completeFn && completeFn.call(this);
    },
    parseTree: function(curnode) {
        while (this.index < this.sgf.length) {
            var c = this.curChar();
            this.index++;
            switch (c) {
                case ';':
                    curnode = this.parseNode(curnode);
                    break;
                case '(':
                    this.parseTree(curnode);
                    break;
                case ')':
                    return;
                    break;
            }
        }
    },
    parseNode: function(parent) {
        var node = {_children: []};
        if (parent)
            parent._children.push(node);
        else
            this.root = node;
        node = this.parseProperties(node);
        return node;
    },
    parseProperties: function(node) {
        var key = "";
        var values = [];
        var i = 0;
        while (this.index < this.sgf.length) {
            var c = this.curChar();
            if (c == ';' || c == '(' || c == ')') {
                break;
            }
            if (this.curChar() == '[') {
                while (this.curChar() == '[') {
                    this.index++;
                    values[i] = "";
                    while (this.curChar() != ']' && this.index < this.sgf.length) {
                        if (this.curChar() == '\\') {
                            this.index++;
                            // not technically correct, but works in practice
                            while (this.curChar() == "\r" || this.curChar() == "\n") {
                                this.index++;
                            }
                        }
                        values[i] += this.curChar();
                        this.index++;
                    }
                    i++;
                    while (this.curChar() == ']' || this.curChar() == "\n" || this.curChar() == "\r") {
                        this.index++;
                    }
                }
                if (node[key]) {
                    if (!(node[key] instanceof Array)) {
                        node[key] = [node[key]];
                    }
                    node[key] = node[key].concat(values);
                } else {
                    node[key] = values.length > 1 ? values : values[0];
                }
                key = "";
                values = [];
                i = 0;
                continue;
            }
            if (c != " " && c != "\n" && c != "\r" && c != "\t") {
                key += c;
            }
            this.index++;
        }
        return node;
    },
    curChar: function() {
        return this.sgf.charAt(this.index);
    }
};

/* Rules.js */

/**
 * @class Applies rules (capturing, ko, etc) to a board.
 */
eidogo.Rules = function(board) {
    this.init(board);
};
exports.Rules = eidogo.Rules.prototype = {
    /**
     * @constructor
     * @param {eidogo.Board} board The board to apply rules to
     */
    init: function(board) {
        this.board = board;
        this.pendingCaptures = [];
    },
    /**
     * Called to see whether a stone may be placed at a given point
    **/
    check: function(pt, color) {
        // already occupied?
        if (this.board.getStone(pt) != this.board.EMPTY) {
            console.log(this.board.getStone(pt)); return false;
        }
        // TODO: check for suicide? (allowed in certain rulesets)
        // TODO: ko
        return true;
    },
    /**
     * Apply rules to the current game (perform any captures, etc)
    **/
    apply: function(pt, color) {
        this.doCaptures(pt, color);
    },
    /**
     * Thanks to Arno Hollosi for the capturing algorithm
     */
    doCaptures: function(pt, color) {
        var captures = 0;
        captures += this.doCapture({x: pt.x-1, y: pt.y}, color);
        captures += this.doCapture({x: pt.x+1, y: pt.y}, color);
        captures += this.doCapture({x: pt.x, y: pt.y-1}, color);
        captures += this.doCapture({x: pt.x, y: pt.y+1}, color);
        // check for suicide
        captures -= this.doCapture(pt, -color);
        if (captures < 0) {
            // make sure suicides give proper points (some rulesets allow it)
            color = -color;
            captures = -captures;
        }
        color = color == this.board.WHITE ? "W" : "B";
        this.board.captures[color] += captures;
    },
    doCapture: function(pt, color) {
        this.pendingCaptures = [];
        if (this.findCaptures(pt, color))
            return 0;
        var caps = this.pendingCaptures.length;
        while (this.pendingCaptures.length) {
            this.board.addStone(this.pendingCaptures.pop(), this.board.EMPTY);
        }
        return caps;
    },
    findCaptures: function(pt, color) {
        // out of bounds?
        if (pt.x < 0 || pt.y < 0 ||
            pt.x >= this.board.boardSize || pt.y >= this.board.boardSize)
            return 0;
        // found opposite color
        if (this.board.getStone(pt) == color)
            return 0;
        // found a liberty
        if (this.board.getStone(pt) == this.board.EMPTY)
            return 1;
        // already visited?
        for (var i = 0; i < this.pendingCaptures.length; i++)
            if (this.pendingCaptures[i].x == pt.x && this.pendingCaptures[i].y == pt.y)
                return 0;

        this.pendingCaptures.push(pt);

        if (this.findCaptures({x: pt.x-1, y: pt.y}, color))
            return 1;
        if (this.findCaptures({x: pt.x+1, y: pt.y}, color))
            return 1;
        if (this.findCaptures({x: pt.x, y: pt.y-1}, color))
            return 1;
        if (this.findCaptures({x: pt.x, y: pt.y+1}, color))
            return 1;
        return 0;
    }
}

/* Board.js */

/**
 * @class Keeps track of board state and passes off rendering to a renderer.
 * We can theoretically have any kind of renderer. The board state is
 * independent of its visual presentation.
 */
eidogo.Board = function() {
    this.init.apply(this, arguments);
};
exports.Board = eidogo.Board.prototype = {
    WHITE: 1,
    BLACK: -1,
    EMPTY: 0,
    /**
     * @constructor
     * @param {Object} The renderer to use to draw the board. Renderers must
     * have at least three methods: clear(), renderStone(), and renderMarker()
     * @param {Number} Board size -- theoretically could be any size,
     * but there's currently only CSS for 9, 13, and 19
     */
    init: function (renderer, boardSize) {
        this.boardSize = boardSize || 19;
        this.stones = this.makeBoardArray(this.EMPTY);
        this.markers = this.makeBoardArray(this.EMPTY);
        this.captures = {};
        this.captures.W = 0;
        this.captures.B = 0;
        this.cache = [];
        //this.renderer = renderer || new eidogo.BoardRendererHtml();
        this.lastRender = {
            stones: this.makeBoardArray(null),
            markers: this.makeBoardArray(null)
        };
    },
    reset: function() {
        this.init(this.renderer, this.boardSize);
    },
    clear: function() {
        this.clearStones();
        this.clearMarkers();
        this.clearCaptures();
    },
    clearStones: function() {
        // we could use makeBoardArray(), but this is more efficient
        for (var i = 0; i < this.stones.length; i++) {
            this.stones[i] = this.EMPTY;
        }
    },
    clearMarkers: function() {
        for (var i = 0; i < this.markers.length; i++) {
            this.markers[i] = this.EMPTY;
        }
    },
    clearCaptures: function() {
        this.captures.W = 0;
        this.captures.B = 0;
    },
    makeBoardArray: function (val) {
        // We could use a multi-dimensional array but doing this avoids
        // the need for deep copying during commit, which is very slow.
        var data = [];
        for(var i = 0; i < (this.boardSize * this.boardSize); i++) {
          data.push(val);
  }
        return data;
    },
    /**
     * Save the current state. This allows us to revert back
     * to previous states for, say, navigating backwards in a game.
     */
    commit: function() {
        this.cache.push({
            stones: this.stones.concat(),
            captures: {W: this.captures.W, B: this.captures.B}
        });
    },
    /**
     * Undo any uncomitted changes.
     */
    rollback: function() {
        if (this.cache.last()) {
            this.stones = this.cache.last().stones.concat();
            this.captures.W = this.cache.last().captures.W;
            this.captures.B = this.cache.last().captures.B;
        } else {
            this.clear();
        }
    },
    /**
     * Revert to a previous state.
     */
    revert: function(steps) {
        steps = steps || 1;
        this.rollback();
        for (var i = 0; i < steps; i++) {
            this.cache.pop();
        }
        this.rollback();
    },
    addStone: function(pt, color) {
        this.stones[pt.y * this.boardSize + pt.x] = color;
    },
    getStone: function(pt) {
        return this.stones[pt.y * this.boardSize + pt.x];
    },
    getRegion: function(t, l, w, h) {
        var region = [].setLength(w * h, this.EMPTY);
        var offset;
        for (var y = t; y < t + h; y++) {
            for (var x = l; x < l + w; x++) {
                offset = (y - t) * w + (x - l);
                region[offset] = this.getStone({x:x, y:y});
            }
        }
        return region;
    },
    addMarker: function(pt, type) {
        this.markers[pt.y * this.boardSize + pt.x] = type;
    },
    getMarker: function(pt) {
        return this.markers[pt.y * this.boardSize + pt.x];
    },
    render: function(complete) {
        var stones = this.makeBoardArray(null);
        var markers = this.makeBoardArray(null);
        var color, type;
        var len;
        if (!complete && this.cache.last()) {
            var lastCache = this.cache.last();
            len = this.stones.length;
            // render only points that have changed since the last render
            for (var i = 0; i < len; i++) {
                if (lastCache.stones[i] != this.lastRender.stones[i]) {
                    stones[i] = lastCache.stones[i];
                }
            }
            markers = this.markers;
        } else {
            // render everything
            stones = this.stones;
            markers = this.markers;
        }
        var offset;
        for (var x = 0; x < this.boardSize; x++) {
            for (var y = 0; y < this.boardSize; y++) {
                offset = y * this.boardSize + x;
                if (markers[offset] != null) {
                    //this.renderer.renderMarker({x: x, y: y}, markers[offset]);
                    this.lastRender.markers[offset] = markers[offset];
                }
                if (stones[offset] == null) {
                    continue;
                } else if (stones[offset] == this.EMPTY) {
                    color = "empty";
                } else {
                    color = (stones[offset] == this.WHITE ? "white" : "black");
                }
                //this.renderer.renderStone({x: x, y: y}, color);
                this.lastRender.stones[offset] = stones[offset];
            }
        }
    }
};

function handicapped (size, handicap) {
  var rtrn = "";
  if (handicap > 0) {

    rtrn += ";AB";

    var stns = [[["gc"], ["gc", "cg"], ["gc", "cg", "gg"],
        ["gc", "cg", "gg", "cc"], ["gc", "cg", "gg", "cc", "ee"],
    ["gc", "cg", "gg", "cc", "ce", "ge"],
    ["gc", "cg", "gg", "cc", "ee", "ce", "ge"],
    ["gc", "cg", "gg", "cc", "ee", "ce", "ge", "ec"],
    ["gc", "cg", "gg", "cc", "ee", "ce", "ge", "ec", "eg"]],
    [["jd"], ["jd", "dj"], ["jd", "dj", "jj"],
    ["jd", "dj", "jj", "dd"], ["jd", "dj", "jj", "dd", "gg"],
    ["jd", "dj", "jj", "dd", "dg", "jg"],
    ["jd", "dj", "jj", "dd", "gg", "dg", "jg"],
    ["jd", "dj", "jj", "dd", "gg", "dg", "jg", "gd"],
    ["jd", "dj", "jj", "dd", "gg", "dg", "jg", "gd", "gj"]],
    [["pd"], ["pd", "dp"], ["pd", "dp", "pp"],
    ["pd", "dp", "pp", "dd"], ["pd", "dp", "pp", "dd", "jj"],
    ["pd", "dp", "pp", "dd", "dj", "pj"],
    ["pd", "dp", "pp", "dd", "jj", "dj", "pj"],
    ["pd", "dp", "pp", "dd", "jj", "dj", "pj", "jd"],
    ["pd", "dp", "pp", "dd", "jj", "dj", "pj", "jd", "jp"]]];

    var stn = 0;
    if (size == 13) { stn = 1; } if (size == 19) { stn = 2; }
    for (var i = 0; i < handicap; i++) {
  rtrn += "[" + stns[stn][handicap-1][i]+ "]";
    }
    rtrn += "\n";

  }
  return rtrn;
}
exports.handicapped = handicapped;

exports.initialize = function initialize (size, handicap, komi) {

var sgf = ";FF[4]GM[1]SZ[" + size + "]HA[" + handicap + "]KM[" + komi + "]\n";
sgf="(" + sgf + handicapped(size, handicap) + "\n)";

var tmp = new eidogo.Player({
    container: '',
    sgf: sgf,
    theme: 'compact',
    enableShortcuts: false
});

if (handicap > 0) { tmp.forward(); }

return tmp;

}

exports.continued = function continued (sgf) {
return new eidogo.Player({
    container: '',
    sgf: sgf,
    theme: 'compact',
    enableShortcuts: false
});
}
