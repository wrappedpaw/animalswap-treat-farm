const { getNetworkConfig } = require('../deploy-config')
const MasterAnimalAdmin = artifacts.require("MasterAnimalAdmin");

module.exports = async function(deployer, network, accounts) {
    const { masterAnimalAddress, masterAnimalAdminOwner, farmAdmin} = getNetworkConfig(network, accounts);

    await deployer.deploy(MasterAnimalAdmin, masterAnimalAddress, farmAdmin);
    const masterAnimalAdmin = await MasterAnimalAdmin.at(MasterAnimalAdmin.address);
    await masterAnimalAdmin.transferOwnership(masterAnimalAdminOwner);

    const currentMasterAnimalAdminOwner = await masterAnimalAdmin.owner();
    const currentFarmAdmin = await masterAnimalAdmin.farmAdmin();

    console.dir({
      MasterAnimalAdminContract: masterAnimalAdmin.address,
      currentMasterAnimalAdminOwner,
      currentFarmAdmin,
    });
};