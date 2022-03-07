const { assert } = require("chai");

const TreatToken = artifacts.require('TreatToken');

contract('TreatToken', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.cake = await TreatToken.new({ from: minter });
    });


    it('mint', async () => {
        await this.cake.mint(alice, 1000, { from: minter });
        assert.equal((await this.cake.balanceOf(alice)).toString(), '1000');
    })
});
