#!/bin/bash

echo "Pulling from git repository..."
git pull
echo "Building docker image..."
docker build -t gcr.io/funnode-com/games . 
echo "Pushing docker image..."
docker push gcr.io/funnode-com/games
echo "Finished"
