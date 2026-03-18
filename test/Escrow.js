const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether');
};

describe('Escrow', () => {
  let buyer, seller, inspector, lender, outsider;
  let realEstate, escrow;

  beforeEach(async () => {
    [buyer, seller, inspector, lender, outsider] = await ethers.getSigners();

    const RealEstate = await ethers.getContractFactory('RealEstate');
    realEstate = await RealEstate.deploy();

    let transaction = await realEstate.connect(seller).mint('https://example.com/1.json');
    await transaction.wait();

    const Escrow = await ethers.getContractFactory('Escrow');
    escrow = await Escrow.deploy(
      realEstate.address,
      inspector.address,
      lender.address
    );

    transaction = await realEstate.connect(seller).approve(escrow.address, 1);
    await transaction.wait();

    transaction = await escrow.connect(seller).list(1, tokens(10), tokens(5));
    await transaction.wait();
  });

  describe('Deployment', () => {
    it('returns NFT address', async () => {
      expect(await escrow.nftAddress()).to.equal(realEstate.address);
    });

    it('returns inspector', async () => {
      expect(await escrow.inspector()).to.equal(inspector.address);
    });

    it('returns lender', async () => {
      expect(await escrow.lender()).to.equal(lender.address);
    });
  });

  describe('Listing', () => {
    it('tracks seller and listing state', async () => {
      expect(await escrow.isListed(1)).to.equal(true);
      expect(await escrow.seller(1)).to.equal(seller.address);
      expect(await escrow.buyer(1)).to.equal(ethers.constants.AddressZero);
    });

    it('moves NFT into escrow', async () => {
      expect(await realEstate.ownerOf(1)).to.equal(escrow.address);
    });
  });

  describe('Buying', () => {
    it('assigns the first buyer on earnest deposit', async () => {
      const transaction = await escrow.connect(buyer).depositEarnest(1, { value: tokens(5) });
      await transaction.wait();

      expect(await escrow.buyer(1)).to.equal(buyer.address);
      expect(await escrow.fundsDeposited(1)).to.equal(tokens(5));
      expect(await escrow.approval(1, buyer.address)).to.equal(true);
    });

    it('prevents another buyer from taking an already reserved property', async () => {
      let transaction = await escrow.connect(buyer).depositEarnest(1, { value: tokens(5) });
      await transaction.wait();

      await expect(
        escrow.connect(outsider).depositEarnest(1, { value: tokens(5) })
      ).to.be.revertedWith('Only assigned buyer can deposit');
    });

    it('allows direct purchase of an open listing', async () => {
      const transaction = await escrow.connect(buyer).buyNow(1, { value: tokens(10) });
      await transaction.wait();

      expect(await realEstate.ownerOf(1)).to.equal(buyer.address);
      expect(await escrow.isListed(1)).to.equal(false);
      expect(await escrow.buyer(1)).to.equal(buyer.address);
    });
  });

  describe('Inspection and Funding', () => {
    beforeEach(async () => {
      let transaction = await escrow.connect(buyer).depositEarnest(1, { value: tokens(5) });
      await transaction.wait();

      transaction = await escrow.connect(inspector).updateInspectionStatus(1, true);
      await transaction.wait();

      transaction = await escrow.connect(seller).approveSale(1);
      await transaction.wait();

      transaction = await escrow.connect(lender).fundSale(1, { value: tokens(5) });
      await transaction.wait();
    });

    it('updates inspection status', async () => {
      expect(await escrow.inspectionPassed(1)).to.equal(true);
    });

    it('tracks lender funding and approval', async () => {
      expect(await escrow.fundsDeposited(1)).to.equal(tokens(10));
      expect(await escrow.approval(1, lender.address)).to.equal(true);
    });
  });

  describe('Sale', () => {
    beforeEach(async () => {
      let transaction = await escrow.connect(buyer).depositEarnest(1, { value: tokens(5) });
      await transaction.wait();

      transaction = await escrow.connect(inspector).updateInspectionStatus(1, true);
      await transaction.wait();

      transaction = await escrow.connect(seller).approveSale(1);
      await transaction.wait();

      transaction = await escrow.connect(lender).fundSale(1, { value: tokens(5) });
      await transaction.wait();

      transaction = await escrow.connect(seller).finalizeSale(1);
      await transaction.wait();
    });

    it('transfers ownership to the buyer', async () => {
      expect(await realEstate.ownerOf(1)).to.equal(buyer.address);
    });

    it('clears the contract balance for the sale', async () => {
      expect(await escrow.fundsDeposited(1)).to.equal(0);
      expect(await escrow.getBalance()).to.equal(0);
    });
  });

  describe('Cancellation', () => {
    it('returns earnest to buyer if inspection fails', async () => {
      let transaction = await escrow.connect(buyer).depositEarnest(1, { value: tokens(5) });
      await transaction.wait();

      await expect(() => escrow.connect(buyer).cancelSale(1)).to.changeEtherBalances(
        [buyer, escrow],
        [tokens(5), tokens(-5)]
      );

      expect(await realEstate.ownerOf(1)).to.equal(seller.address);
      expect(await escrow.isListed(1)).to.equal(false);
    });
  });
});
