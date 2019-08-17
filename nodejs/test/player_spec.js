/* eslint-disable brace-style, camelcase, semi */
/* eslint-env mocha */
require('dotenv').config();
require(`${__dirname}/../config.js`);
app = rewire(`${__dirname}/../app.js`);
require(`./test_modules.js`);

var player_msg = {
  'category': 'player',
  'type': 'get_rating',
  'game': 'chess',
  'user':
  { 'name': 'FN_Dev',
    'sess': 'dk45afns239h3biu3athbv6rg2',
    'game': 'chess',
    'id': 2272,
    'country': { 'code': 'NL', 'name': 'Netherlands' },
    'types': [] }
};
var player_ai_msg = {
  'ai': {
    'name': 'Stockfish',
    'game': 'chess',
    'types': []
  }
};
var player_guest_msg = {
  'category': 'player',
  'type': 'get_rating',
  'game': 'chess',
  'user':
  { 'name': 'Guest056',
    'sess': 'dk45afns239h3biu3athbv6rg2',
    'game': 'chess',
    'id': 2272,
    'country': { 'code': 'NL', 'name': 'Netherlands' },
    'types': [] }
};
var player;
var handle_request = app.__get__('handle_request');

describe('Player', () => {
  before((done) => {
    R5.player = new require(`${__dirname}/../lib/games/Player.js`);
    R5.match_processor = new (require(`${__dirname}/../lib/games/MatchProcessor.js`))();
    R5.matches = new (require(`${__dirname}/../lib/games/Matches.js`))();
    R5.match_emitter = new (require(`${__dirname}/../lib/games/MatchEmitter.js`))();
    done();
  });

  it('should initialize player without get_rating', (done) => {
    player = new (require('../lib/games/Player.js'))(player_msg.user, false);
    expect(player).to.exist;
    expect(player.name).to.equal('FN_Dev');
    done();
  });

  it('should initialize player with get rating', (done) => {
    player = new (require('../lib/games/Player.js'))(player_msg.user, true);
    R5.player = (require('../lib/games/Player.js'));
    expect(player).to.exist;
    done();
  });

  it('should display player is not ai', (done) => {
    expect(player.is_ai()).to.equal(false);
    done();
  });

  it('should display player is ai', (done) => {
    let player_ai = new (require('../lib/games/Player.js'))(player_ai_msg, false);
    expect(player_ai.is_ai()).to.equal(true);
    done();
  });

  it('should display player is not guest', (done) => {
    expect(player.is_guest()).to.equal(false);
    done();
  });

  it('should display player is guest', (done) => {
    let player_guest = new (require('../lib/games/Player.js'))(player_guest_msg.user, false);
    expect(player_guest.is_guest()).to.equal(true);
    done();
  });

  it('should display player is online or not', (done) => {
    expect(player.is_online()).to.equal(true);
    done();
  });

  it('should display player is playing or not', (done) => {
    expect(player.is_playing()).to.equal(false);
    done();
  });

  it('should display player is reviewing or not', (done) => {
    expect(player.is_reviewing()).to.equal(false);
    done();
  });

  it('should display player is in match or not', (done) => {
    expect(player.is_in_match()).to.equal(false);
    done();
  });

  it('should display player can join ladder or not', (done) => {
    expect(player.can_join_ladder()).to.equal(undefined);
    done();
  });

  it('should display player can play ladder or not', (done) => {
    expect(player.can_play_ladder()).to.equal(true);
    done();
  });

  it('should join the player to ladder', (done) => {
    expect(player.join_ladder()).to.equal(undefined);
    done();
  });

  it('should give response of creating new match', (done) => {
    let new_match = {
      'type': 'new',
      'match': {
        'id': 'rkLT2Pb44'
      },
      'data': {
        'type': {
          'ladder': false,
          'rated': true,
          'privat': false
        },
        'timers': 900,
        'timer_type': 'Fischer',
        'timersi': 5,
        'ais': [
          {
            'id': 2,
            'game_id': 1,
            'name': 'p4wn',
            'rating': '1400:1:5:50',
            'certainty': 0.95,
            'pause_time': 1800,
            'status': 1
          }
        ],
        'players': 2,
        'player': -1,
        'rules': null
      },
      'game': 'chess',
      'user': {
        'name': 'FN_Dev',
        'sess': 'dk45afns239h3biu3athbv6rg2',
        'game': 'chess',
        'id': 2272,
        'country': {
          'code': 'NL',
          'name': 'Netherlands'
        },
        'types': []
      },
      'category': 'match'
    };
    handle_request(new_match);
    done();
  });

  it('should give info of matches', (done) => {
    let message = { category: 'info',
      type: 'matches',
      game: 'chess',
      user: { 'name': 'FN_Dev',
        'sess': 'dk45afns239h3biu3athbv6rg2',
        'game': 'chess',
        'id': 2272,
        'country': { 'code': 'NL', 'name': 'Netherlands' },
        'types': [] } };
    handle_request(message);
    done();
  });

  it('should join player to the chess match', (done) => {
    let message = { type: 'join',
      match: { id: 1 },
      data: { id: 'rkLT2Pb44', status: 2 },
      game: 'chess',
      user: { 'name': 'FN_Test',
        'sess': 'dk45afns239h3biu3athbv6rg2',
        'game': 'chess',
        'id': 2273,
        'country': { 'code': 'NL', 'name': 'Netherlands' },
        'types': [] },
      category: 'match' };
    handle_request(message);
    done();
  });

  it('should start the chess match', (done) => {
    let message = {
      'type': {
        'ladder': false,
        'rated': false,
        'privat': true
      },
      'timers': 900,
      'timer_type': 'Fischer',
      'timersi': 5,
      'ais': [
        {
          'count': 1,
          'name': 'p4wn',
          'level': 5
        }
      ],
      'players': 2,
      'player': -1,
      'rules': null
    };
    handle_request(message);
    done();
  });

  it('should move the chess piece', (done) => {
    let message = { 'start': 34, 'end': 54, 'promotion': 12 };
    handle_request(message);
    done();
  });

  it('should move the chess piece', (done) => {
    let message = { 'start': 37, 'end': 57, 'promotion': 12 };
    handle_request(message);
    done();
  });

  it('should resign the chess match', (done) => {
    let message = { 'resign': true };
    handle_request(message);
    done();
  });

  it('should return updated status', (done) => {
    player.update_status(R5.game.statuses.OFFLINE);
    expect(player.status).to.equal(0);
    done();
  });

  it('should call on status update', function (done) {
    this.timeout(1000);
    player.on('updated', () => {
      expect(true);
      done();
    });
    player.update_status(R5.game.statuses.PLAY);
  });

  it('should return flatten json of player', (done) => {
    let player_object = player.to_json();
    expect(player_object.ai).to.equal(undefined);
    expect(player_object.id).to.equal(2272);
    expect(player_object.game).to.equal('chess');
    expect(player_object.name).to.equal('FN_Dev');
    expect(player_object.country.name).to.equal('Netherlands');
    expect(player_object.country.code).to.equal('NL');
    expect(player_object.match).to.equal(false);
    expect(player_object.rate.cert).to.equal(0);
    expect(player_object.status).to.equal(4);
    done();
  });
});
