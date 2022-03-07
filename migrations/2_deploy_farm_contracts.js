const { BigNumber } = require("@ethersproject/bignumber");
const { getNetworkConfig } = require('../deploy-config')
const MasterAnimal = artifacts.require("MasterAnimal");
const SupportAnimal = artifacts.require("SupportAnimal");
const TreatToken = artifacts.require("TreatToken");
const TreatSplitBar = artifacts.require("TreatSplitBar");
const MultiCall = artifacts.require("MultiCall");
const Timelock = artifacts.require("Timelock");

const logTx = (tx) => {
    console.dir(tx, { depth: 3 });
}

// let block = await web3.eth.getBlock("latest")
module.exports = async function (deployer, network, accounts) {
    const { adminAddress, feeAccount, STARTING_BLOCK, TOKENS_PER_BLOCK, TIMELOCK_DELAY_SECS, INITIAL_MINT } = getNetworkConfig(network, accounts);
    const BLOCKS_PER_HOUR = (3600 / 3) // 3sec Block Time
    const REWARDS_START = String(STARTING_BLOCK + (BLOCKS_PER_HOUR * 6))


    let treatTokenInstance;
    let treatSplitBarInstance;
    let masterAnimalInstance;

    /**
     * Deploy TreatToken
     */
    deployer.deploy(TreatToken).then((instance) => {
        treatTokenInstance = instance;
        /**
         * Mint intial tokens for liquidity pool
         */
        return treatTokenInstance.mint(BigNumber.from(INITIAL_MINT).mul(BigNumber.from(String(10 ** 18))));
    }).then((tx) => {
        logTx(tx);
        /**
         * Deploy TreatSplitBar
         */
        return deployer.deploy(TreatSplitBar, TreatToken.address)
    }).then((instance) => {
        treatSplitBarInstance = instance;
        /**
         * Deploy MasterAnimal
         */
        return deployer.deploy(MasterAnimal,
            TreatToken.address,                                         // _treat
            TreatSplitBar.address,                                      // _treatSplit
            feeAccount,                                                   // _devaddr
            BigNumber.from(TOKENS_PER_BLOCK).mul(BigNumber.from(String(10 ** 18))),  // _treatPerBlock
            REWARDS_START,                                                // _startBlock
            4                                                            // _multiplier
        )
    }).then((instance) => {
        masterAnimalInstance = instance;
        /**
         * TransferOwnership of TREAT to MasterAnimal
         */
        return treatTokenInstance.transferOwnership(MasterAnimal.address);
    }).then((tx) => {
        logTx(tx);
        /**
         * TransferOwnership of TREATSPLIT to MasterAnimal
         */
        return treatSplitBarInstance.transferOwnership(MasterAnimal.address);
    }).then((tx) => {
        logTx(tx);
        /**
         * Deploy SupportAnimal
         */
        return deployer.deploy(SupportAnimal,
            TreatSplitBar.address,                  //_treatSplit
            BigNumber.from(TOKENS_PER_BLOCK).mul(BigNumber.from(String(10 ** 18))),                                      // _rewardPerBlock
            REWARDS_START,                            // _startBlock
            STARTING_BLOCK + (BLOCKS_PER_HOUR * 24 * 365),  // _endBlock
        )
    }).then(() => {
        /**
         * Deploy MultiCall
         */
        return deployer.deploy(MultiCall);
    }).then(() => {
        /**
         * Deploy Timelock
         */
        return deployer.deploy(Timelock, adminAddress, TIMELOCK_DELAY_SECS);
    }).then(() => {
        console.log('Rewards Start at block: ', REWARDS_START)
        console.table({
            MasterAnimal: MasterAnimal.address,
            SupportAnimal: SupportAnimal.address,
            TreatToken: TreatToken.address,
            TreatSplitBar: TreatSplitBar.address,
            MultiCall: MultiCall.address,
            Timelock: Timelock.address
        })
    });
};
