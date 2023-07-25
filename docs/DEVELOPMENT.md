### Running Locally

> Note: this is generally not very useful now that grafting has been introduced.

You can debug your subgraph by running `graph-node` locally. Here are some instructions to set it up:

https://github.com/graphprotocol/graph-node/tree/master/docker#readme

Note that you need a Ethereum RPC for your `graph-node` to connect to. You can get one for free at [Alchemy](https://www.alchemy.com/) or contact me for one.

## Running a Graph Node Step by Step

The first step is to clone the Graph Node repository:

```bash
git clone https://github.com/graphprotocol/graph-node/ \
&& cd graph-node/docker
```

Next, execute the `setup.sh` file. This will pull all the necessary Docker images and write the necessary information in the `docker-compose.yml` file.

```bash
./setup.sh
```
Once everything is set up, you need to modify the "Ethereum environment" inside the `docker-compose.yml` file, so that it points to the endpoint of the node you are running this Graph Node against. Note that the `setup.sh` file detects the _Host IP_ and writes its value, so you'll need to modify it accordingly.

docker-compose.yml
```dockerfile
version: '3'
services:
  graph-node:
    image: graphprotocol/graph-node
    ports:
      - '8000:8000'
      - '8001:8001'
      - '8020:8020'
      - '8030:8030'
      - '8040:8040'
    depends_on:
      - ipfs
      - postgres
    environment:
      postgres_host: postgres
      postgres_user: graph-node
      postgres_pass: let-me-in
      postgres_db: graph-node
      ipfs: 'ipfs:5001'
      ethereum: 'mainnet:http://host.docker.internal:8545' # <-- Change it here
      RUST_LOG: info
```

Lastly, to run the Graph Node, just run the following command:

```bash
docker-compose up
```

And that is it! You have a Graph Node running, now you can create the subgraph on it doing

```bash
yarn create-local
```


### Grafting - What is Grafting?

Grafting reuses the data from an existing subgraph and starts indexing it at a later block. This is useful during development to get past simple errors in the mappings quickly or to temporarily get an existing subgraph working again after it has failed. Also, it can be used when adding a feature to a subgraph that takes long to index from scratch.

[TheGraph Docs](https://thegraph.com/docs/en/cookbook/grafting/#what-is-grafting)
