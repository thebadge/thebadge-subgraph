## okgraph.xyz

This community developed tool allows you to plugin the subgraph id and gives you stats and links on the indexing.

![okgraph.png](assets%2Fimages%2Fokgraph.png)

## Miniscan

[Miniscan](https://miniscan.xyz/) is essentially an etherscan wrapper, but it allows for more chains and the ability to make historic contract calls (retrieving state at a specific block number). This tool is especially useful when you are trying to learn about a contract. You would plug in the address and you can view the source code (assuming it is verified) and make contract calls to understand behavior.

## Debug Logs

One of the most useful tools to debug is the `log` function in `@graphprotocol/graph-ts`. You can use it like follows in your mapping code:

```
log.debug('[Test Log] arbitrary argument {}', [123]);
````

which will show up in the Logs tab of Subgraph Studio:

![Debug Logs](images/errors/logs.png "Debug Logs")

You also have an option of `Error`, `Warning`, `Info`, `Debug` as the log level. I like to use `Warning` so that I can quickly filter for it. The way to filter for logs of a specific level is to click (uncheck) the log levels circled in red above.

**Note**: there is a known issue where historical logs are only kept for an indeterminate amount of time (usually an hour or so). Which means it's difficult to search for historical logs. The workaround is to run `graph-node` locally and deploy your subgraph locally (see instructions below), this way you have access to all your historical logs in the console.
