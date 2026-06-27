const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAO Governance Flow", function () {
  let token, timelock, governor, treasury;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    // Deploy GOVToken
    const GOVToken = await ethers.getContractFactory("GOVToken");
    token = await GOVToken.deploy(
      ethers.parseEther("1000000")
    );
    await token.waitForDeployment();

    // Delegate votes
    await token.delegate(owner.address);

    // Deploy Timelock
    const Timelock = await ethers.getContractFactory("DAOTimelock");
    timelock = await Timelock.deploy(3600, [], []);
    await timelock.waitForDeployment();

    // Deploy Governor
    const Governor = await ethers.getContractFactory("DAOGovernor");
    governor = await Governor.deploy(
      await token.getAddress(),
      await timelock.getAddress()
    );
    await governor.waitForDeployment();

    // Setup Timelock roles
    await timelock.grantRole(
      await timelock.PROPOSER_ROLE(),
      await governor.getAddress()
    );
    await timelock.grantRole(
      await timelock.EXECUTOR_ROLE(),
      ethers.ZeroAddress
    );
    await timelock.revokeRole(
      await timelock.TIMELOCK_ADMIN_ROLE(),
      owner.address
    );

    // Deploy Treasury
    const Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(await timelock.getAddress());
    await treasury.waitForDeployment();
  });

  it("Should have voting power after delegation", async function () {
    const votes = await token.getVotes(owner.address);
    expect(votes).to.be.gt(0);
  });

  it("Should create a proposal", async function () {
    const encodedCall = treasury.interface.encodeFunctionData(
      "withdrawETH",
      [owner.address, 0]
    );

    const tx = await governor.propose(
      [await treasury.getAddress()],
      [0],
      [encodedCall],
      "Test proposal"
    );

    const receipt = await tx.wait();
    expect(receipt.logs.length).to.be.gt(0);
  });

  it("Should allow voting", async function () {
    const encodedCall = treasury.interface.encodeFunctionData(
      "withdrawETH",
      [owner.address, 0]
    );

    const tx = await governor.propose(
      [await treasury.getAddress()],
      [0],
      [encodedCall],
      "Vote test"
    );
    const receipt = await tx.wait();
    const proposalId = receipt.logs[0].args.proposalId;

    await ethers.provider.send("evm_mine");
    await governor.castVote(proposalId, 1); // FOR

    const votes = await governor.proposalVotes(proposalId);
    expect(votes.forVotes).to.be.gt(0);
  });
});
