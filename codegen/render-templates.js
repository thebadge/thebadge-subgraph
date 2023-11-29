const fs = require("fs-extra");
const mustache = require("mustache");

const chainNameToChainId = {
  goerli: 5,
  sepolia: 11155111,
  xdai: 100,
  gnosis: 100, // Added to avoid bugs
  polygon: 137,
  matic: 137, // Added to avoid bugs
};

// This works for every chain except for polygon
const parseGeneralTemplate = () => {
  const networkName = process.argv[2];
  const chainId = chainNameToChainId[networkName];
  const deployments = JSON.parse(fs.readFileSync("networks.json", "utf8"));
  const templateData = {
    network: networkName
  };
  const {
    address: theBadgeContractAdd,
    startBlock: theBadgeContractAddStartBlock
  } = deployments["TheBadge"][chainId];
  templateData["TheBadge"] = {
    address: theBadgeContractAdd,
    addressLowerCase: theBadgeContractAdd.toLowerCase(),
    startBlock: theBadgeContractAddStartBlock
  };

  const {
    address: theBadgeUsersContractAdd,
    startBlock: theBadgeUsersContractAddStartBlock
  } = deployments["TheBadgeUsers"][chainId];
  templateData["TheBadgeUsers"] = {
    address: theBadgeUsersContractAdd,
    addressLowerCase: theBadgeUsersContractAdd.toLowerCase(),
    startBlock: theBadgeUsersContractAddStartBlock
  };

  const {
    address: theBadgeModelsContractAdd,
    startBlock: theBadgeModelsContractAddStartBlock
  } = deployments["TheBadgeModels"][chainId];
  templateData["TheBadgeModels"] = {
    address: theBadgeModelsContractAdd,
    addressLowerCase: theBadgeModelsContractAdd.toLowerCase(),
    startBlock: theBadgeModelsContractAddStartBlock
  };

  const {
    address: KlerosBadgeModelControllerAdd,
    startBlock: KlerosBadgeModelControllerStartBlock
  } = deployments["KlerosBadgeModelController"][chainId];
  templateData["KlerosBadgeModelController"] = {
    address: KlerosBadgeModelControllerAdd,
    addressLowerCase: KlerosBadgeModelControllerAdd.toLowerCase(),
    startBlock: KlerosBadgeModelControllerStartBlock
  };

  const {
    address: ThirdPartyBadgeModelControllerAdd,
    startBlock: ThirdPartyBadgeModelControllerStartBlock
  } = deployments["TpBadgeModelController"][chainId];
  templateData["TpBadgeModelController"] = {
    address: ThirdPartyBadgeModelControllerAdd,
    addressLowerCase: ThirdPartyBadgeModelControllerAdd.toLowerCase(),
    startBlock: ThirdPartyBadgeModelControllerStartBlock
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
};

const parsePolygonTemplate = () => {
  const networkName = process.argv[2];
  const chainId = chainNameToChainId[networkName];

  const deployments = JSON.parse(fs.readFileSync("networks.json", "utf8"));
  const templateData = {
    network: networkName
  };
  const {
    address: theBadgeContractAdd,
    startBlock: theBadgeContractAddStartBlock
  } = deployments["TheBadge"][chainId];
  templateData["TheBadge"] = {
    address: theBadgeContractAdd,
    addressLowerCase: theBadgeContractAdd.toLowerCase(),
    startBlock: theBadgeContractAddStartBlock
  };

  const {
    address: theBadgeUsersContractAdd,
    startBlock: theBadgeUsersContractAddStartBlock
  } = deployments["TheBadgeUsers"][chainId];
  templateData["TheBadgeUsers"] = {
    address: theBadgeUsersContractAdd,
    addressLowerCase: theBadgeUsersContractAdd.toLowerCase(),
    startBlock: theBadgeUsersContractAddStartBlock
  };

  const {
    address: theBadgeModelsContractAdd,
    startBlock: theBadgeModelsContractAddStartBlock
  } = deployments["TheBadgeModels"][chainId];
  templateData["TheBadgeModels"] = {
    address: theBadgeModelsContractAdd,
    addressLowerCase: theBadgeModelsContractAdd.toLowerCase(),
    startBlock: theBadgeModelsContractAddStartBlock
  };

  const {
    address: ThirdPartyBadgeModelControllerAdd,
    startBlock: ThirdPartyBadgeModelControllerStartBlock
  } = deployments["TpBadgeModelController"][chainId];
  templateData["TpBadgeModelController"] = {
    address: ThirdPartyBadgeModelControllerAdd,
    addressLowerCase: ThirdPartyBadgeModelControllerAdd.toLowerCase(),
    startBlock: ThirdPartyBadgeModelControllerStartBlock
  };

  for (const templatedFileDesc of [["subgraph", "yaml"]]) {
    const template = fs
      .readFileSync(`${templatedFileDesc[0]}Polygon.template.${templatedFileDesc[1]}`)
      .toString();
    fs.writeFileSync(
      `${templatedFileDesc[0]}.${templatedFileDesc[1]}`,
      mustache.render(template, templateData)
    );
  }
};

async function main() {
  const networkName = process.argv[2];
  const chainId = chainNameToChainId[networkName];

  if (chainId === chainNameToChainId.polygon) {
    parsePolygonTemplate();
    return;
  }

  parseGeneralTemplate();
}

main();
