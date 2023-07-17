## Description

- TheBadge - subgraph

[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/thebadge/thebadge-relayer/issues)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/thebadge/thebadge-relayer/blob/main/LICENSE)


## Running the app

1) FIrst authenticate to TheGraph:
```bash
# Install graph library
1) $ yarn global add @graphprotocol/graph-cli
2) $ Configure your .env file: THE_GRAPH_DEV_TESTING_AUTH_TOKEN
2) $ Run the following: yarn auth
```

```bash
# development
1) $ yarn codegen
2) $ yarn build
2) $ yarn deploy:dev
```