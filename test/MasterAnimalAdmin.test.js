const { accounts, contract } = require('@openzeppelin/test-environment');
const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const { farm, dex } = require('@animalswapfinance/test-helpers');
const { expect, assert } = require('chai');

const MasterAnimalAdmin = contract.fromArtifact('MasterAnimalAdmin'); // Loads a compiled contract

const SHOW_LOGS = true
const log = (message) => {
  SHOW_LOGS && console.dir(message);
}

const [owner, farmAdmin, alice] = accounts;

// TEST: large amount (10000+) of pids 
// TEST: max amount of farmAdds
// TEST: max amount of farmSets
// TEST: high range of buffer

async function assertFixedFarmPercentages(masterAnimal, fixedFarmDetails, buffer = 3) {
  const totalMasterAnimalAllocation = await masterAnimal.totalAllocPoint();

  for (let index = 0; index < fixedFarmDetails.length; index++) {
    const fixedFarmDetail = fixedFarmDetails[index];

    const { allocPoint } = await masterAnimal.getPoolInfo(fixedFarmDetail.pid);
    actualAllocationPercent = (allocPoint.mul(new BN('10000')).div(totalMasterAnimalAllocation)).toNumber();

    assert.isAtLeast(actualAllocationPercent, fixedFarmDetail.percentage - buffer,
      `Fixed farm allocation for pid ${fixedFarmDetail.pid} is too low`);
    assert.isAtMost(actualAllocationPercent, fixedFarmDetail.percentage + buffer,
      `Fixed farm allocation for pid ${fixedFarmDetail.pid} is too high`);
  }
}

async function setupMasterAnimalAdmin(that, numPairs) {
  const {
    //   treatToken,
    //   treatSplitBar,
    masterAnimal,
  } = await farm.deployMockFarm(accounts); // accounts passed will be used in the deployment
  that.masterAnimal = masterAnimal;

  const {
    // dexFactory,
    // mockWBNB,
    // mockTokens,
    dexPairs,
  } = await dex.deployMockDex(accounts, numPairs);
  that.dexPairs = dexPairs;

  that.masterAnimalAdmin = await MasterAnimalAdmin.new(that.masterAnimal.address, farmAdmin, { from: owner });
  await that.masterAnimal.transferOwnership(that.masterAnimalAdmin.address, { from: owner });
}

describe('MasterAnimalAdmin', async function () {
  this.timeout(10000);

  describe('onlyFarmAdmin functions', async () => {
    this.NUM_POOLS = 20;
    this.FIXED_PERCENTAGE_FARMS = [
      {
        pid: 1,
        percentage: 1000 // 10%
      },
      {
        pid: 5,
        percentage: 500 // 5%
      },
      {
        pid: 10,
        percentage: 250 // 2.5%
      },
    ]
    this.FIXED_PERCENTAGE_PIDS = this.FIXED_PERCENTAGE_FARMS.map(farm => farm.pid);

    before(async () => {
      await setupMasterAnimalAdmin(this, this.NUM_POOLS - 1);
    });


    describe('farm admin ownership', async () => {
      it('should transfer farm admin ownership', async () => {
        await this.masterAnimalAdmin.transferFarmAdminOwnership(alice, { from: farmAdmin });
        assert.equal(await this.masterAnimalAdmin.farmAdmin(), alice, 'farm admin owner did not change');
        await this.masterAnimalAdmin.transferFarmAdminOwnership(farmAdmin, { from: alice });
      });

      it('should NOT transfer farm admin ownership from non farmAdmin account', async () => {
        await expectRevert(this.masterAnimalAdmin.transferFarmAdminOwnership(alice, { from: alice }),
          'must be called by farm admin'
        );
      });
    });

    describe('add/update batch farms', async () => {
      it('should add batch farms through MasterAnimalAdmin', async () => {
        let addresses = [];
        let allocations = [];

        for (let index = 0; index < this.dexPairs.length; index++) {
          const ALLOCATION_MULTIPLIER = 10;
          const dexPair = this.dexPairs[index];
          addresses.push(dexPair.address);
          allocations.push((index * ALLOCATION_MULTIPLIER) + 1);

        }

        await expectRevert(this.masterAnimalAdmin.addMasterAnimalFarms(allocations, addresses, true, { from: alice }),
          'must be called by farm admin'
        );
        await this.masterAnimalAdmin.addMasterAnimalFarms(allocations, addresses, true, true, { from: farmAdmin });

        await expectRevert(this.masterAnimalAdmin.addFixedPercentFarmAllocation(0, 100, false, true, { from: farmAdmin }),
          'cannot add reserved MasterAnimal pid 0'
        );

        for (let index = 0; index < this.FIXED_PERCENTAGE_FARMS.length; index++) {
          const fixedFarmDetails = this.FIXED_PERCENTAGE_FARMS[index];
          await this.masterAnimalAdmin.addFixedPercentFarmAllocation(fixedFarmDetails.pid, fixedFarmDetails.percentage, false, true, { from: farmAdmin });
          const { allocationPercent: fixedFarmAllocation, isActive: fixedFarmIsActive } = await this.masterAnimalAdmin.getFixedPercentFarmFromPid(fixedFarmDetails.pid);
          assert.equal(fixedFarmIsActive, true, 'fixed farm should be active')
          assert.equal(fixedFarmAllocation, fixedFarmDetails.percentage, 'fixed percentage farm allocation is incorrect')

        }
        // Check that allocations are accurate
        for (let pid = 1; pid < this.NUM_POOLS; pid++) {
          if (this.FIXED_PERCENTAGE_PIDS.includes(pid)) {
            continue; // Fixed percentage pids are checked below
          }
          const { allocPoint } = await this.masterAnimal.poolInfo(pid);
          assert.equal(allocPoint.toNumber(), allocations[pid - 1], `allocation for pid ${pid}, is inaccurate`)
        }

        await assertFixedFarmPercentages(this.masterAnimal, this.FIXED_PERCENTAGE_FARMS);

        expect((await this.masterAnimal.poolLength()).toNumber()).to.equal(this.NUM_POOLS);
      });

      it('should add set batch farm allocations through MasterAnimalAdmin', async () => {
        let pids = [];
        let allocations = [];

        for (let pid = 1; pid < this.NUM_POOLS; pid++) {
          const ALLOCATION_MULTIPLIER = 69;
          pids.push(pid);
          allocations.push((pid * ALLOCATION_MULTIPLIER) + 1);
        }

        await this.masterAnimalAdmin.setMasterAnimalFarms(pids, allocations, true, true, { from: farmAdmin });
        for (let pid = 1; pid < this.NUM_POOLS; pid++) {
          if (this.FIXED_PERCENTAGE_PIDS.includes(pid)) {
            continue; // Fixed percentage pids are checked below
          }
          const { allocPoint } = await this.masterAnimal.poolInfo(pid);
          assert.equal(allocPoint.toNumber(), allocations[pid - 1], `allocation for pid ${pid}, is inaccurate`)
        }
        await assertFixedFarmPercentages(this.masterAnimal, this.FIXED_PERCENTAGE_FARMS);
      });
    });

    describe('fixed percentage farms', async () => {
      it('should set fixed percentage farm', async () => {
        this.FIXED_PERCENTAGE_UPDATE = this.FIXED_PERCENTAGE_FARMS.map(({ pid, percentage }) => { return { pid, percentage: percentage * 2 } });

        for (let index = 0; index < this.FIXED_PERCENTAGE_UPDATE.length; index++) {
          const fixedFarmDetails = this.FIXED_PERCENTAGE_UPDATE[index];
          await expectRevert(this.masterAnimalAdmin.setFixedPercentFarmAllocation(fixedFarmDetails.pid, fixedFarmDetails.percentage, false, true, { from: alice }),
            'must be called by farm admin'
          );
          await expectRevert(this.masterAnimalAdmin.setFixedPercentFarmAllocation(fixedFarmDetails.pid, 1000000000, false, true, { from: farmAdmin }),
            'allocation out of bounds'
          );
          await this.masterAnimalAdmin.setFixedPercentFarmAllocation(fixedFarmDetails.pid, fixedFarmDetails.percentage, false, true, { from: farmAdmin });
          const { allocationPercent: fixedFarmAllocation, isActive: fixedFarmIsActive } = await this.masterAnimalAdmin.getFixedPercentFarmFromPid(fixedFarmDetails.pid);
          assert.equal(fixedFarmIsActive, true, 'fixed farm should be active')
          assert.equal(fixedFarmAllocation, fixedFarmDetails.percentage, 'fixed percentage farm allocation is incorrect')
        }

        await assertFixedFarmPercentages(this.masterAnimal, this.FIXED_PERCENTAGE_UPDATE);
      });

      it('should remove fixed percentage farm', async () => {
        this.FIXED_PERCENTAGE_UPDATE_2 = { ...this.FIXED_PERCENTAGE_UPDATE }
        this.FIXED_PERCENTAGE_UPDATE_2[0].percentage = 0;
        const { pid, percentage } = this.FIXED_PERCENTAGE_UPDATE_2[0]
        let totalFixedPercentFarmPercentage = await this.masterAnimalAdmin.totalFixedPercentFarmPercentage();
        assert.equal(totalFixedPercentFarmPercentage.toNumber(), 3500, 'total fixed percentage farm percentage is inaccurate')
        await this.masterAnimalAdmin.setFixedPercentFarmAllocation(pid, 0, false, true, { from: farmAdmin });
        // Set farm allocation to zero
        await this.masterAnimalAdmin.setMasterAnimalFarms([pid], [0], true, true, { from: farmAdmin });
        const { allocPoint: afterAllocationPoint } = await this.masterAnimal.poolInfo(pid);
        assert.equal(afterAllocationPoint.toNumber(), 0, 'fixed farm allocation should be 0')
        totalFixedPercentFarmPercentage = await this.masterAnimalAdmin.totalFixedPercentFarmPercentage();
        assert.equal(totalFixedPercentFarmPercentage.toNumber(), 1500, 'total fixed percentage farm percentage is inaccurate')
        const fixedPercentFarmLength = await this.masterAnimalAdmin.getNumberOfFixedPercentFarms();
        assert.equal(fixedPercentFarmLength, 2, 'fixed farm percentage length inaccurate')
        // Check fixed farm status
        const { allocationPercent: fixedFarmAllocation, isActive: fixedFarmIsActive } = await this.masterAnimalAdmin.getFixedPercentFarmFromPid(pid);
        assert.equal(fixedFarmIsActive, false, 'fixed farm should be inactive')
        assert.equal(fixedFarmAllocation, 0, 'fixed percentage farm allocation is incorrect');
        // Check that pool is disabled
        const { allocPoint } = await this.masterAnimal.poolInfo(pid);
        assert.equal(allocPoint.toNumber(), 0, `allocation for pid ${pid}, is inaccurate`)
        // Check that the fixed farm percentages are accurate
        await assertFixedFarmPercentages(this.masterAnimal, this.FIXED_PERCENTAGE_UPDATE_2);
      });
    });
  });

  describe('onlyOwner functions', async function () {

    before(async () => {
      await setupMasterAnimalAdmin(this, this.NUM_POOLS - 1);
    });

    describe('negative test cases', async () => {

      it('should NOT adjust the MasterAnimal bonus multiplier from wrong address', async () => {
        const NEW_MULTIPLIER = 4;
        await expectRevert(this.masterAnimalAdmin.updateMasterAnimalMultiplier(NEW_MULTIPLIER, { from: alice }),
          'Ownable: caller is not the owner'
        );
      });

      it('should NOT adjust the MasterAnimal bonus multiplier if over MAX', async () => {
        const NEW_MULTIPLIER = 100;
        await expectRevert(this.masterAnimalAdmin.updateMasterAnimalMultiplier(NEW_MULTIPLIER, { from: owner }),
          'multiplier greater than max'
        );
      });

      it('should NOT set pendingMasterAnimal admin from non-owner account', async () => {
        await expectRevert(this.masterAnimalAdmin.setPendingMasterAnimalOwner(alice, { from: alice }),
          'Ownable: caller is not the owner'
        );
      });

    });

    describe('positive test cases', async () => {

      it('should set adjust the MasterAnimal bonus multiplier', async () => {
        const NEW_MULTIPLIER = 4;
        await this.masterAnimalAdmin.updateMasterAnimalMultiplier(NEW_MULTIPLIER, { from: owner });
        const bonusMultiplier = await this.masterAnimal.BONUS_MULTIPLIER();
        assert.equal(bonusMultiplier, NEW_MULTIPLIER, `Multiplier update inaccurate`)
      });

      it('should transfer MasterAnimal ownership from MasterAnimalAdmin', async () => {
        await this.masterAnimalAdmin.setPendingMasterAnimalOwner(owner, { from: owner });

        it('should NOT accept transfer of MasterAnimal ownership from non-pending owner', async () => {
          await expectRevert(this.masterAnimalAdmin.acceptMasterAnimalOwnership({ from: alice }),
            'Ownable: caller is not the owner'
          );
        });

        await this.masterAnimalAdmin.acceptMasterAnimalOwnership({ from: owner });
        const masterAnimalOwner = await this.masterAnimal.owner();
        assert.equal(masterAnimalOwner, owner, `Owner of MasterAnimal not transferred to owner`)
      });
    });
  });
});