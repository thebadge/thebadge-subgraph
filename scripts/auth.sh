#!/bin/sh

source .env
yarn run graph auth --product hosted-service $THE_GRAPH_DEV_TESTING_AUTH_TOKEN
