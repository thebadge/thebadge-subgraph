const fs = require("fs-extra");
const mustache = require("mustache");

const chainNameToChainId = {
  goerli: 5,
  xdai: 100,
  gnosis: 100, // Added to avoid bugs
};

async function main() {
  const networkName = process.argv[2];
  const chainId = chainNameToChainId[networkName];
  const deployments = JSON.parse(fs.readFileSync("networks.json", "utf8"));
  const {
    address: theBadgeContractAdd,
    startBlock: theBadgeContractAddStartBlock
  } = deployments["TheBadge"][chainId];
  const {
    address: klerosControllerAdd,
    startBlock: klerosControllerStartBlock
  } = deployments["KlerosController"][chainId];
  const templateData = {
    network: networkName
  };
  templateData["TheBadge"] = {
    address: theBadgeContractAdd,
    addressLowerCase: theBadgeContractAdd.toLowerCase(),
    startBlock: theBadgeContractAddStartBlock
  };
  templateData["KlerosController"] = {
    address: klerosControllerAdd,
    addressLowerCase: klerosControllerAdd.toLowerCase(),
    startBlock: klerosControllerStartBlock
  };

  for (const templatedFileDesc of [["subgraph", "yaml"]]) {
    const template = fs
      .readFileSync(`${templatedFileDesc[0]}.template.${templatedFileDesc[1]}`)
      .toString();
    fs.writeFileSync(
      `${templatedFileDesc[0]}.${templatedFileDesc[1]}`,
      mustache.render(template, templateData)
    );
  }
}

main();
