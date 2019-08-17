FROM node:carbon-alpine
LABEL maintainer="admin@funnode.com"

ENV BUILD_PACKAGES="bash build-base" \
    APP_DIR="/usr/src/app"

RUN apk update && \
    apk upgrade && \
    apk add --update $BUILD_PACKAGES && \
    rm -rf /var/cache/apk/* && \
    mkdir -p $APP_DIR

# GNUGo
RUN wget http://ftp.gnu.org/gnu/gnugo/gnugo-3.8.tar.gz && \
    tar -zxvf gnugo-3.8.tar.gz && \
    cd gnugo-3.8/ && \
    ./configure && \
    make && make install

# fuego
#RUN apk add --update subversion boost-dev pkgconfig automake autoconf libtool && \
#    svn checkout svn://svn.code.sf.net/p/fuego/code/trunk fuego
#RUN cd fuego/ && \
#    autoreconf -i && \
#    ./configure && \
#    make && make install

# Stockfish
#RUN apk add --update git && \
#    git clone https://github.com/mcostalba/Stockfish.git && \
#    cd Stockfish/src && \
#    make profile-build ARCH=x86-64

WORKDIR ${APP_DIR}

COPY .env .
COPY nodejs/package.json .
RUN npm install
# RUN apk add --update git && npm install weaver333/npm-redis#master && echo 'ok'

COPY nodejs/. .
RUN chmod -R 777 /tmp

CMD [ "npm", "start" ]
