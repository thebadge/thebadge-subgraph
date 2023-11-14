<div style="text-align: center;">
  <a href="https://thebadge.xyz">
    <img alt="TheBadge" src="https://www.thebadge.xyz/the_badge_github_logo.png">
  </a>
</div>

<h1 align="center">TheBadge DApp Subgraph</h1>

<p align="center">
  <a href="https://discord.com/invite/FTxtkgbAC4"><img src="https://img.shields.io/discord/1006480637512917033?style=plastic" alt="Join to Discord"></a>
  <a href="https://github.com/thebadge/thebadge-subgraph/issues"><img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat" alt="contributions welcome"></a>
  <a href="https://twitter.com/intent/user?screen_name=thebadgexyz"><img src="https://img.shields.io/twitter/follow/thebadgexyz?style=social" alt="Follow us on Twitter"></a>
  <a href="https://github.com/thebadge/thebadge-subgraph/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT licensed"></a>
  <a href="https://github.com/thebadge/thebadge-subgraph/releases"><img src="https://img.shields.io/github/v/release/thebadge/thebadge-subgraph?label=Latest%20Release" alt="Latest release"></a>
</p>

For questions or request information reach out via [Discord](https://discord.gg/tVP75NqVuC).

# Setup

This document describes how to setup your local working environment in order to develop Messari subgraphs.

## Prerequisites

- [Node & npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- Some development experience
- Technical knowledge of blockchains (especially evm)
- Knowledge of [The Graph](https://thegraph.com/docs/) (our beginner [RESOURCES.md](./RESOURCES.md) file will be a good starting place)

## Installation

After installing Nodejs and npm you are close to done with installing all of the development dependencies. There are a few other npm packages to [install globally](https://docs.npmjs.com/downloading-and-installing-packages-globally):

- [graph-cli](https://www.npmjs.com/package/@graphprotocol/graph-cli)
- [graph-ts](https://www.npmjs.com/package/@graphprotocol/graph-ts)

This is really all that you need, but you can read more about the graph packages [here](https://thegraph.com/docs/en/developing/creating-a-subgraph/#install-the-graph-cli).

After cloning the repo and moving into the head of the repository you should install the project-level npm packages:

```bash
git clone https://github.com/thebadge/thebadge-subgraph.git
yarn install
```
## Style Guide

In general we follow Google's styling [guide](https://google.github.io/styleguide/tsguide.html) as best we can. A few pointers to get you started:

- Always opt for `const` over `let` unless you have to change the value of the variable.
- Use constants when you are hardcoding a value and use `CONSTANT_CASE`.
- Otherwise, most variables should be in `camelCase`
- File names should be in `camelCase` and we try to keep folder names to one word if possible.
- To make your code more readable use early returns when things go wrong.
- When making a contract call you should always your `try...reverted` pattern outlined [here](https://thegraph.com/docs/en/developing/assemblyscript-api/#handling-reverted-calls).

## What is next?

From here you should be set to build, run, but what about deploy?

## Authenticate with WheGraph

1) First authenticate to TheGraph:
> Configure your .env file: THE_GRAPH_DEV_TESTING_AUTH_TOKEN
```bash
# Run the following
$ yarn auth
```

2) Then you can do
```bash
# development
$ yarn codegen
$ yarn build
$ yarn deploy:dev
```

## Want to learn more?

You can learn more reading [docs](docs)
