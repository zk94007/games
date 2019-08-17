/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

-- Dumping data for table funnode.games: ~14 rows (approximately)
/*!40000 ALTER TABLE `games` DISABLE KEYS */;
INSERT INTO `games` (`id`, `name`, `url`, `port`, `difficulty`, `description`, `keywords`, `players`, `timers`, `timersi`, `timersb`, `mobile`, `status`) VALUES
  (1, 'Chess', 'chess', 1337, 3, 'Chess is a two-player board game played on a chessboard, a square checkered board with 64 squares arranged in an 8x8 grid. It is one of the world\'s most popular games, played by millions of people worldwide.p. A player may not make a move that would put or leave his king under attack. If the player to move has no legal moves, the game is over; either checkmate (if the king is under attack) or stalemate.  ', 'king, queen, rook, bishop, knight, pawn', '2', '15:-1:30:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (2, 'Pairs', 'pairs', 1339, 1, 'Pairs, also known as Memory, Pelmanism, Shinkei-suijaku, or Pexeso, is a card game in which all of the cards are laid face-down on a surface and two cards are flipped face-up each turn. The object of the game is to turn over pairs of matching cards.p. The game ends when the last pair has been picked up. The winner is the person with the most pairs.', 'memory, pelmanism, shinkei-suijaku, pexeso', '2-10', '5:-1:10:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (3, 'Kachuful', 'kachuful', 1341, 3, 'Kachuful (also known as Oh Hell, Elevator, and Judgment), is a trick-taking card game that originated in India. The game is played in rounds, where each round has a different trump suit and the players are dealt fewer cards than the prior round. The game continues until the last round, in which each player is dealt just 1 card.p. The winner is the player with the most points at the end of the rounds.', 'oh hell, elevator, judgment', '3-10', '10:-1:30:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (4, 'Warships', 'warships', 1343, 1, 'Warships is a guessing game for two players. The game is played on four 15x12 grids, two for each player. On one grid, the player arranges ships and records the shots by the opponent. On the other grid the player records their own shots.p. When all of the squares of a ship have been hit, the ship is sunk. After all of one player\'s ships have been sunk, the game ends and the other player wins.', 'battleship, sea battle', '2', '5:-1:10:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (5, 'Go', 'go', 1345, 3, 'Go is a game for two players that originated in China. Go is an adversarial game where each player places stones on a board with the objective of surrounding more territory than the opponent.p. The game ends when both players pass, usually when there are no more profitable moves to be made. The player with the greater number of controlled points, factoring in the number of captured stones, wins the game.', 'weiqi, baduk', '2', '30:-1:60:2', '5:0:10:1', '30:0:60:1', 0, 1),
  (6, 'Checkers', 'checkers', 1347, 2, 'Checkers is played on an 64-square board with twelve pieces on each side. The pieces move and capture diagonally. They may only move forward until they reach the opposite end of the board, when they are crowned and may thereafter move and capture both backward and forward.p. A player wins by capturing all of the opponent\'s pieces or by leaving the opponent with no legal move. The game ends in a draw if neither side can force a win, or by agreement.', 'draughts, alquerque', '2', '10:-1:20:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (7, 'Liar\'s Dice', 'liars-dice', 1349, 2, 'Liar\'s dice is a game of deception played by three to five players. Starting with five dice per player, each round, each player either makes a bid (face value and count) of what he/she believes is present in all the dice. If a player challenges the previous bid, all dice are revealed and the loser of the challenge removes one dy for the next round.p. The game ends when only one player is left with dice, and is claimed the winner.', 'deception dice, diception', '2-10', '5:-1:10:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (8, 'Reversi', 'reversi', 1351, 2, 'Reversi a two-player board game played on a 8x8 uncheckered board. Players take turns placing discs on the board with their assigned color facing up. During a play, any discs of the opponent\'s color that are bounded by the discs of the current player\'s color are turned over to the current player\'s color.p. The object of the game is to have the majority of discs turned to display your color when the last playable empty square is filled.', 'othello, annex, turnover', '2', '10:-1:20:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (9, 'Hold\'em Poker', 'holdem-poker', 1353, 2, 'Hold\'em Poker (also known as Texas Hold\'em) is a variation of the standard card game of poker. Two cards (hole cards) are dealt face down to each player and then five community cards are placed face-up by the dealer - a series of three cards (\'the flop\'), then a single card (\'the turn\'), and then another card (\'the river\'). Players have the option to check, bet, raise or fold after each deal.p. The game ends when only one player is left and is claimed the winner.', 'texas holdem, poker', '2-7', '10:-1:60:2', '5:0:10:1', '30:0:60:1', 1, 1),
  (10, 'Align 4', 'align-4', 1355, 1, 'Align 4 (also known as Connect Four, Captain\'s Mistress, and Four in a Line) is a two-player connection game in which the players take turns dropping colored discs from the top into a seven-column, six-row vertically suspended grid. The pieces fall straight down, occupying the next available space within the column.p. The objective of the game is to connect four of one\'s own discs of the same color next to each other vertically, horizontally, or diagonally before your opponent.', 'connect four, captain\'s mistress, find four, four in a line, fourplay', '2', '10:-1:20:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (11, 'Backgammon', 'backgammon', 1357, 2, 'Backgammon is one of the oldest board games known. This two-player game is played on a board with a track of 12 long triangles, called points. The two players move their pieces in opposing directions, from the 24-point towards the 1-point.p. A player wins by removing all of his/her pieces from the board before his/her opponent.', 'puff, swan-liu, tavli, tavlu, tavole reale, gammon, tric-trac, shesh besh', '2', '10:-1:20:1', '5:0:10:1', '30:0:60:1', 0, 0),
  (12, 'Ludo', 'ludo', 1359, 1, 'Ludo is a board game for two to four players in which the players race their four tokens from start to finish according to die rolls.p. The first to bring all their tokens to the finish wins the game. The others continue play to determine second-, third-, and fourth-place finishers.', 'pachisi, grumbler', '2-4', '5:-1:10:1', '5:0:10:1', '30:0:60:1', 0, 0),
  (13, 'Hearts', 'hearts', 1361, 2, 'Hearts is an \'evasion-type\' trick-taking card game for four players. Each player, in clockwise order from the dealer, plays a card from their hand. Players must follow suit and can play any card, including a penalty Heart or the Queen of Spades, if they do not have the led suit. The trick and any penalty points it contains are won by the player who played the highest-value card of the suit that was led.p. The objective is to be the player with the fewest points by the end of the game.', 'black queen, crubs', '4', '10:-1:30:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (15, 'Spades', 'spades', 1363, 2, 'Spades is a trick-taking card game for four players. Each round, players try to take at least the number of tricks (also known as \'books\') that they bid before play of the hand began. Spades is a descendant of the Whist family of card games (e.g., Hearts, Kachuful), except the Spade suit is always the trump suit.p. The objective is to be the player with the most points by the end of the game.', 'Whist family', '4', '10:-1:30:1', '5:0:10:1', '30:0:60:1', 1, 1),
  (16, 'Blackjack', 'blackjack', 1365, 1, 'Blackjack, also known as twenty-one, is one of the most widely played casino game in the world. Blackjack is a comparing card game played with one or more decks of 52 cards between players and the dealer.p. The objective of the game is to beat the dealer in each round and to have the most chips at the end of the game.', 'twenty-one', '2-7', '5:-1:10:1', '5:0:10:1', '30:0:60:1', 1, 0);
/*!40000 ALTER TABLE `games` ENABLE KEYS */;

-- Dumping data for table funnode.game_ais: ~20 rows (approximately)
/*!40000 ALTER TABLE `game_ais` DISABLE KEYS */;
INSERT INTO `game_ais` (`id`, `game_id`, `name`, `rating`, `certainty`, `pause_time`, `status`) VALUES
  (1, 6, 'Tinook', '1200:1:1:50', 0.950, 1500, 1),
  (2, 1, 'p4wn', '1400:1:5:50', 0.950, 1800, 1),
  (3, 1, 'Stockfish', '2200:1:8:100', 0.950, 900, 0),
  (4, 5, 'fuego', '1650:1:1:50', 0.950, 0, 0),
  (5, 5, 'GNUGo', '1450:1:10:15', 0.950, 500, 1),
  (6, 8, 'Owen', '1300:1:1:50', 0.950, 1800, 1),
  (7, 4, 'Barham', '1250:1:2:50', 0.770, 500, 1),
  (8, 4, 'Bismarck', '1100:1:1:50', 0.770, 500, 1),
  (9, 7, 'Madron', '1200:1:1:50', 0.770, 1800, 1),
  (10, 10, 'Sebastian', '1300:1:1:50', 0.950, 1800, 1),
  (11, 3, 'Judger', '1200:1:1:50', 0.770, 1800, 1),
  (12, 2, 'Tammet', '1600:1:3:100', 0.770, 1800, 1),
  (13, 9, 'Boeree', '1300:1:1:50', 0.770, 1800, 1),
  (14, 11, 'Fitch', '1200:1:1:50', 0.770, 2700, 1),
  (15, 12, 'Requiem', '1200:1:1:50', 0.770, 2700, 1),
  (16, 13, 'Taining', '1400:1:1:50', 0.770, 1800, 1),
  (17, 15, 'Reneger', '1400:1:1:50', 0.770, 1800, 1),
  (18, 16, 'Carlson', '1200:1:1:50', 0.770, 2700, 1),
  (19, 4, 'Friedland', '1300:1:1:50', 0.950, 1500, 1),
  (20, 7, 'Ponzi', '1300:1:1:50', 0.770, 1500, 1);
/*!40000 ALTER TABLE `game_ais` ENABLE KEYS */;

-- Dumping data for table funnode.game_settings: ~14 rows (approximately)
/*!40000 ALTER TABLE `game_settings` DISABLE KEYS */;
INSERT INTO `game_settings` (`game_id`, `audio`, `colours`, `ladder`, `layout`, `review`) VALUES
  (1, 1, 1, 1, 1, 1),
  (2, 1, 1, 0, 0, 0),
  (3, 1, 1, 0, 0, 0),
  (4, 1, 0, 1, 1, 0),
  (5, 1, 0, 1, 1, 1),
  (6, 1, 1, 1, 1, 0),
  (7, 1, 1, 0, 1, 0),
  (8, 1, 0, 1, 1, 0),
  (9, 1, 1, 0, 0, 0),
  (10, 1, 0, 1, 0, 0),
  (11, 1, 0, 1, 0, 0),
  (12, 1, 0, 0, 0, 0),
  (13, 1, 1, 0, 0, 0),
  (15, 1, 1, 0, 0, 0),
  (16, 1, 1, 0, 0, 0);
/*!40000 ALTER TABLE `game_settings` ENABLE KEYS */;

-- Dumping data for table funnode.game_types: ~16 rows (approximately)
/*!40000 ALTER TABLE `game_types` DISABLE KEYS */;
INSERT INTO `game_types` (`id`, `game_id`, `type`) VALUES
  (1, 1, 'board'),
  (2, 2, 'card'),
  (3, 3, 'card'),
  (4, 4, 'board'),
  (5, 5, 'board'),
  (6, 6, 'board'),
  (7, 7, 'dice'),
  (8, 8, 'board'),
  (9, 9, 'card'),
  (10, 10, 'board'),
  (11, 11, 'board'),
  (12, 11, 'dice'),
  (13, 12, 'board'),
  (14, 12, 'dice'),
  (15, 13, 'card'),
  (17, 15, 'card'),
  (18, 16, 'card');
/*!40000 ALTER TABLE `game_types` ENABLE KEYS */;

-- Dumping data for table funnode.players: ~1,830 rows (approximately)
/*!40000 ALTER TABLE `players` DISABLE KEYS */;
INSERT INTO `players` (`id`, `facebook_id`, `name`, `pass`, `email`, `image`, `image_date`, `key`, `date_registered`, `date_signedin`, `enabled`) VALUES
  (1, NULL, 'FN_Dev', _binary 0x1CB1C747BD7291CCAB12319612E493FC, 'admin@funnode.com', NULL, '2017-05-26 22:42:22', 551349316, '2012-08-18 22:37:03', '2017-08-04 20:24:33', 1);
/*!40000 ALTER TABLE `players` ENABLE KEYS */;
