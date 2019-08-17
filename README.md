# games

[![Maintainability](https://api.codeclimate.com/v1/badges/28460c6efdbdb875207d/maintainability)](https://codeclimate.com/repos/5d0edd58be70ce01b50000a8/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/28460c6efdbdb875207d/test_coverage)](https://codeclimate.com/repos/5d0edd58be70ce01b50000a8/test_coverage)

## Setup Instructions
- [with Docker](https://github.com/FunNode/games#setup-with-docker)
- [with Docker-Compose](https://github.com/FunNode/games#setup-with-docker-compose) (recommended)
- [as Standalone](https://github.com/FunNode/games#setup-as-standalone)

### Setup with Docker

You will need to setup your own instances of MySQL and RabbitMQ.

#### Build `FunNode/games` from source:

    git clone https://github.com/FunNode/games.git
    cd games
    nano .env # see .env.template for reference
    docker build -t fn/games .

#### Run the image, binding associated ports:

    docker run -p 80:3000 games fn/games

### Setup with Docker-Compose

#### Install `docker-compose`:

    sudo curl -L https://github.com/docker/compose/releases/download/1.15.0/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose

#### Build containers:

    git clone https://github.com/FunNode/games.git
    cd games
    nano .env # see .env.template for reference
    docker-compose up -d --build mysql rabbitmq redis
    docker-compose up --build web

#### Run commands inside the running container:

    docker-compose exec web <CMD>

## Getting started

### Setting-up the DB

You will need to import `db/schema.sql` and `db/data.sql`:

    mysql -u root -p
    CREATE DATABASE funnode_development;
    CREATE USER <USERNAME>@localhost IDENTIFIED BY '<PASSWORD>';
    GRANT ALL PRIVILEGES on funnode_development.* TO <USERNAME>@localhost;
    FLUSH PRIVILEGES;
    exit;
    mysql -u <USERNAME> -p funnode_development < [schema/data].sql

### Handling messages

In `app.js`, there is a `handle_request` method that listens to messages from a redis queue. Here are some sample messages:

    RECV chess:player:get_rating
    { category: 'player',
      type: 'get_rating',
      game: 'chess',
      user:
       { name: 'FN_Dev',
         sess: 'dk45afns239h3biu3athbv6rg2',
         game: 'chess',
         id: 2272,
         country: { code: 'NL', name: 'Netherlands' },
         types: [] } }

    RECV chess:info:matches
    { category: 'info',
      type: 'matches',
      game: 'chess',
      user: { ... } }

    RECV chess:match:new
    { type: 'new',
      match: { id: 'rkLT2Pb44' },
      data:
       { type: { ladder: false, rated: true, privat: false },
         timers: 900,
         timer_type: 'Fischer',
         timersi: 5,
         ais: [ [Object] ],
         players: 2,
         player: -1,
         rules: null },
      game: 'chess',
      user: { ... },
      category: 'match' }

    RECV chess:match:join
    { type: 'join',
      match: { id: false },
      data: { id: 'rkLT2Pb44', status: 2 },
      game: 'chess',
      user: { ... },
      category: 'match' }

    RECV chess:match:move
    { type: 'move',
      match: { id: 'rkLT2Pb44' },
      data: { start: 35, end: 55, promotion: 12 },
      game: 'chess',
      user: { ... },
      category: 'match' }

    RECV chess:match:move
    { type: 'move',
      match: { id: 'rkLT2Pb44' },
      data: { resign: true },
      game: 'chess',
      user: { ... },
      category: 'match' }

    RECV chess:match:move_ai
    { category: 'match',
      type: 'move_ai',
      game: 'chess',
      match: { id: 'rkLT2Pb44' } }

    RECV chess:match:move_review
    { type: 'move_review',
      match: { id: 'rkLT2Pb44' },
      data: { rematch: true },
      game: 'chess',
      user: { ... },
      category: 'match' }

    RECV chess:match:leave
    { type: 'leave',
      match: { id: 'rkLT2Pb44' },
      data: {},
      game: 'chess',
      user: { ... },
      category: 'match' }

    RECV chess:match:join
    { type: 'join',
      match: { id: 'rkLT2Pb44' },
      data: { id: 'rkLT2Pb44', status: 5 },
      game: 'chess',
      user: { ... },
      category: 'match' }

### Run test cases
    cd games/nodejs
    npm install
    Create .env file # see .env.template for reference
    npm test
    Test cases execution with test report will be displayed
    To see detailed report open /coverage/Icov-report/index.html

## Development

### GIT

- We use Gitflow Workflow as our branching model [Check Tutorial](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)

- To start work on a new feature, create a new branch (e.g., `feature/some-name`) from `development` branch and start working:
  ```
  git checkout development
  git checkout -b feature/my-new-branch
  git push
  ```
- For hot fixes:
  ```
  git checkout -b hotfix/fixing-this-issue
  git push
  ```
  - If you are still on `development` branch, create a new branch from it
  - If you are in production, create a new branch from `master`

### Code Climate

- We use [Code Climate](https://codeclimate.com) to analyze our code quality. To install it on your local machine:
   ```
    curl -L https://github.com/codeclimate/codeclimate/archive/master.tar.gz | tar xvz
    cd codeclimate-* && sudo make install
   ```
### Usage:
- After you install the CLI, You can run the following from the root directory:
  ```
    codeclimate analyze -f html > analysis.html nodejs/
  ```
- Or the following from /nodejs directory:
```
npm run analysis
```
