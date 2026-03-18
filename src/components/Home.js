import { ethers } from 'ethers';
import { useCallback, useEffect, useState } from 'react';

import close from '../assets/close.svg';

const zeroAddress = ethers.constants.AddressZero;

const formatAddress = (value) => {
  if (!value || value === zeroAddress) return 'Open';
  return `${value.slice(0, 6)}...${value.slice(38, 42)}`;
};

const toEthNumber = (value) => Number(ethers.utils.formatUnits(value || 0, 'ether'));

const Home = ({ home, provider, realEstate, account, escrow, connectWallet, onRefresh, togglePop }) => {
  const [details, setDetails] = useState({
    buyer: home.contractBuyer || zeroAddress,
    seller: home.sellerAddress || zeroAddress,
    lender: home.lenderAddress || zeroAddress,
    inspector: home.inspectorAddress || zeroAddress,
    owner: home.ownerAddress || zeroAddress,
    isListed: home.isListed,
    purchasePrice: home.contractPurchasePrice || home.price,
    earnestDeposit: home.contractEscrowAmount || 0,
    fundsDeposited: home.fundsDeposited || 0,
    inspectionPassed: home.inspectionPassed || false,
    approvals: home.approvals || { buyer: false, seller: false, lender: false }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [txPending, setTxPending] = useState('');
  const [txError, setTxError] = useState('');
  const [relistForm, setRelistForm] = useState({
    purchasePrice: String(home.contractPurchasePrice || home.price || ''),
    escrowAmount: String(home.contractEscrowAmount || '')
  });

  const refreshDetails = useCallback(async () => {
    if (!escrow || !realEstate || !home?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setTxError('');

    try {
      const tokenId = home.id;
      const [buyerAddress, sellerAddress, lenderAddress, inspectorAddress, ownerAddress, listed, purchasePrice, earnestDeposit, fundsDeposited, inspectionPassed] = await Promise.all([
        escrow.buyer(tokenId),
        escrow.seller(tokenId),
        escrow.lender(),
        escrow.inspector(),
        realEstate.ownerOf(tokenId),
        escrow.isListed(tokenId),
        escrow.purchasePrice(tokenId),
        escrow.escrowAmount(tokenId),
        escrow.fundsDeposited(tokenId),
        escrow.inspectionPassed(tokenId)
      ]);

      const [buyerApproved, sellerApproved, lenderApproved] = await Promise.all([
        buyerAddress !== zeroAddress ? escrow.approval(tokenId, buyerAddress) : Promise.resolve(false),
        sellerAddress !== zeroAddress ? escrow.approval(tokenId, sellerAddress) : Promise.resolve(false),
        lenderAddress !== zeroAddress ? escrow.approval(tokenId, lenderAddress) : Promise.resolve(false)
      ]);

      setDetails({
        buyer: buyerAddress,
        seller: sellerAddress,
        lender: lenderAddress,
        inspector: inspectorAddress,
        owner: ownerAddress,
        isListed: listed,
        purchasePrice: toEthNumber(purchasePrice),
        earnestDeposit: toEthNumber(earnestDeposit),
        fundsDeposited: toEthNumber(fundsDeposited),
        inspectionPassed,
        approvals: {
          buyer: buyerApproved,
          seller: sellerApproved,
          lender: lenderApproved
        }
      });
    } catch (err) {
      setTxError(err.reason || err.message || 'Unable to load listing details.');
    } finally {
      setIsLoading(false);
    }
  }, [escrow, home?.id, realEstate]);

  useEffect(() => {
    refreshDetails();
  }, [refreshDetails]);

  const currentStage = (() => {
    if (details.isListed) {
      if (details.buyer === zeroAddress) return 'Listed';
      if (details.approvals.buyer && details.approvals.seller && details.approvals.lender && details.inspectionPassed) {
        return 'Ready to close';
      }
      return 'In escrow';
    }
    if (details.seller !== zeroAddress && details.buyer !== zeroAddress) return 'Sold';
    return 'Wallet asset';
  })();

  const runTransaction = async (label, action) => {
    if (!provider || !escrow) {
      setTxError('Wallet provider is not ready.');
      return;
    }

    setTxPending(label);
    setTxError('');

    try {
      await action();
      await refreshDetails();
      await onRefresh();
    } catch (err) {
      setTxError(err.reason || err.message || `${label} failed.`);
    } finally {
      setTxPending('');
    }
  };

  const reserveHandler = async () => {
    if (!account) {
      await connectWallet();
      return;
    }

    await runTransaction('Depositing earnest', async () => {
      const signer = provider.getSigner();
      const transaction = await escrow.connect(signer).depositEarnest(home.id, {
        value: ethers.utils.parseUnits(String(details.earnestDeposit), 'ether')
      });
      await transaction.wait();
    });
  };

  const buyNowHandler = async () => {
    if (!account) {
      await connectWallet();
      return;
    }

    await runTransaction('Buying property', async () => {
      const signer = provider.getSigner();
      const transaction = await escrow.connect(signer).buyNow(home.id, {
        value: ethers.utils.parseUnits(String(details.purchasePrice), 'ether')
      });
      await transaction.wait();
    });
  };

  const inspectHandler = async () => {
    await runTransaction('Approving inspection', async () => {
      const signer = provider.getSigner();
      const transaction = await escrow.connect(signer).updateInspectionStatus(home.id, true);
      await transaction.wait();
    });
  };

  const lendHandler = async () => {
    await runTransaction('Funding sale', async () => {
      const signer = provider.getSigner();
      const remainingBalance = Math.max(details.purchasePrice - details.fundsDeposited, 0);
      const transaction = await escrow.connect(signer).fundSale(home.id, {
        value: ethers.utils.parseUnits(String(remainingBalance), 'ether')
      });
      await transaction.wait();
    });
  };

  const sellerHandler = async () => {
    await runTransaction('Seller approval in progress', async () => {
      const signer = provider.getSigner();

      if (!details.approvals.seller) {
        let transaction = await escrow.connect(signer).approveSale(home.id);
        await transaction.wait();
      }

      const shouldFinalize =
        details.approvals.buyer &&
        details.approvals.lender &&
        details.inspectionPassed &&
        details.fundsDeposited >= details.purchasePrice;

      if (shouldFinalize) {
        const transaction = await escrow.connect(signer).finalizeSale(home.id);
        await transaction.wait();
      }
    });
  };

  const relistHandler = async () => {
    if (!account) {
      await connectWallet();
      return;
    }

    const purchasePriceValue = Number(relistForm.purchasePrice);
    const escrowAmountValue = Number(relistForm.escrowAmount);

    if (!purchasePriceValue || !escrowAmountValue || escrowAmountValue > purchasePriceValue) {
      setTxError('Enter a valid relist price and earnest amount.');
      return;
    }

    await runTransaction('Relisting property', async () => {
      const signer = provider.getSigner();

      let transaction = await realEstate.connect(signer).approve(escrow.address, home.id);
      await transaction.wait();

      transaction = await escrow.connect(signer).list(
        home.id,
        ethers.utils.parseUnits(relistForm.purchasePrice, 'ether'),
        ethers.utils.parseUnits(relistForm.escrowAmount, 'ether')
      );
      await transaction.wait();
    });
  };

  const sellerCanFinalize =
    details.approvals.seller &&
    details.approvals.buyer &&
    details.approvals.lender &&
    details.inspectionPassed &&
    details.fundsDeposited >= details.purchasePrice;

  const isOwner = account && details.owner === account;
  const isBuyer = account && details.buyer === account;
  const isSeller = account && details.seller === account;
  const isLender = account && details.lender === account;
  const isInspector = account && details.inspector === account;

  const primaryAction = (() => {
    if (!details.isListed) return null;
    if (details.buyer === zeroAddress && !isSeller && !isLender && !isInspector) {
      return { label: 'Buy Now', onClick: buyNowHandler, disabled: false };
    }
    if (isInspector) {
      return { label: details.inspectionPassed ? 'Inspection Approved' : 'Approve Inspection', onClick: inspectHandler, disabled: details.inspectionPassed };
    }
    if (isLender) {
      return { label: details.approvals.lender ? 'Sale Funded' : 'Fund Remaining Balance', onClick: lendHandler, disabled: details.approvals.lender };
    }
    if (isSeller) {
      return { label: sellerCanFinalize ? 'Finalize Sale' : details.approvals.seller ? 'Seller Approved' : 'Approve Sale', onClick: sellerHandler, disabled: details.approvals.seller && !sellerCanFinalize };
    }
    if (details.buyer === zeroAddress || isBuyer) {
      return { label: details.approvals.buyer ? 'Earnest Deposited' : 'Reserve and Deposit Earnest', onClick: reserveHandler, disabled: details.approvals.buyer };
    }
    return null;
  })();

  const roleHint = (() => {
    if (!account) return 'Connect a wallet to reserve this property, list your own asset, or complete an escrow role.';
    if (!details.isListed && isOwner) return 'You own this NFT. You can relist it into escrow below.';
    if (isBuyer) return `You reserved this property. Earnest required: ${details.earnestDeposit} ETH.`;
    if (isSeller) return sellerCanFinalize ? 'All conditions are met. Finalize the sale now.' : 'Approve the sale now; finalization becomes available after inspection and lender funding.';
    if (isLender) return `Remaining lender contribution: ${Math.max(details.purchasePrice - details.fundsDeposited, 0)} ETH.`;
    if (isInspector) return 'Inspection approval is still required before closing.';
    if (details.buyer !== zeroAddress) return `This listing is reserved by ${formatAddress(details.buyer)}.`;
    return `This listing is open to purchase now for ${details.purchasePrice} ETH, or it can be reserved through escrow.`;
  })();

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={togglePop} />

      <div className="home" id="closing">
        <button type="button" onClick={togglePop} className="home__close">
          <img src={close} alt="Close" />
        </button>

        <div className="home__gallery">
          <img src={home.image} alt={home.name} />
          <div className="home__chips">
            <span>{home.type}</span>
            <span>{home.yearBuilt}</span>
            <span>{home.sqft} sqft</span>
          </div>
        </div>

        <div className="home__panel">
          <p className="eyebrow">Listing detail</p>
          <div className="home__headline">
            <div>
              <h2>{home.name}</h2>
              <p>{home.address}</p>
            </div>
            <strong>{details.purchasePrice} ETH</strong>
          </div>

          <div className="home__metrics">
            <div>
              <span>Bedrooms</span>
              <strong>{home.beds}</strong>
            </div>
            <div>
              <span>Bathrooms</span>
              <strong>{home.baths}</strong>
            </div>
            <div>
              <span>Year built</span>
              <strong>{home.yearBuilt}</strong>
            </div>
          </div>

          <p className="home__description">{home.description}</p>

          <div className="home__contract">
            <div>
              <span>Status</span>
              <strong>{currentStage}</strong>
            </div>
            <div>
              <span>Earnest required</span>
              <strong>{details.earnestDeposit} ETH</strong>
            </div>
            <div>
              <span>Funds deposited</span>
              <strong>{details.fundsDeposited} ETH</strong>
            </div>
            <div>
              <span>NFT owner</span>
              <strong>{formatAddress(details.owner)}</strong>
            </div>
          </div>

          <div className="home__status">
            <div>
              <span>Buyer</span>
              <strong>{formatAddress(details.buyer)}</strong>
            </div>
            <div>
              <span>Inspector</span>
              <strong>{formatAddress(details.inspector)}</strong>
            </div>
            <div>
              <span>Lender</span>
              <strong>{formatAddress(details.lender)}</strong>
            </div>
            <div>
              <span>Seller</span>
              <strong>{formatAddress(details.seller)}</strong>
            </div>
          </div>

          <div className="workflow">
            <div className={`workflow__step ${details.approvals.buyer ? 'is-complete' : ''}`}>
              <span>01</span>
              <div>
                <strong>Buyer reserve</strong>
                <p>Any buyer can reserve the property by depositing the earnest amount.</p>
              </div>
            </div>
            <div className={`workflow__step ${details.inspectionPassed ? 'is-complete' : ''}`}>
              <span>02</span>
              <div>
                <strong>Inspection</strong>
                <p>Inspector approves the home condition.</p>
              </div>
            </div>
            <div className={`workflow__step ${details.approvals.lender ? 'is-complete' : ''}`}>
              <span>03</span>
              <div>
                <strong>Lender funding</strong>
                <p>Lender funds the remaining sale balance.</p>
              </div>
            </div>
            <div className={`workflow__step ${!details.isListed && details.buyer !== zeroAddress ? 'is-complete' : ''}`}>
              <span>04</span>
              <div>
                <strong>Closing</strong>
                <p>Seller finalizes once all conditions are satisfied.</p>
              </div>
            </div>
          </div>

          {primaryAction && (
            <div className="home__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled || Boolean(txPending) || isLoading}
              >
                {txPending || primaryAction.label}
              </button>

              {!account && (
                <button type="button" className="button button--secondary" onClick={connectWallet}>
                  Connect to continue
                </button>
              )}
            </div>
          )}

          {!details.isListed && isOwner && (
            <div className="relist">
              <h3>Relist this property</h3>
              <div className="relist__grid">
                <label>
                  <span>Purchase price (ETH)</span>
                  <input
                    value={relistForm.purchasePrice}
                    onChange={(event) => setRelistForm((current) => ({ ...current, purchasePrice: event.target.value }))}
                    type="number"
                    min="0.1"
                    step="0.1"
                  />
                </label>
                <label>
                  <span>Earnest deposit (ETH)</span>
                  <input
                    value={relistForm.escrowAmount}
                    onChange={(event) => setRelistForm((current) => ({ ...current, escrowAmount: event.target.value }))}
                    type="number"
                    min="0.1"
                    step="0.1"
                  />
                </label>
              </div>
              <button type="button" className="button button--primary" onClick={relistHandler} disabled={Boolean(txPending)}>
                {txPending || 'Approve and Relist'}
              </button>
            </div>
          )}

          <div className="banner">{roleHint}</div>
          {isLoading && <div className="banner">Loading closing details...</div>}
          {txError && <div className="banner banner--error">{txError}</div>}

          <div className="facts">
            <h3>Facts and features</h3>
            <div className="facts__grid">
              {home.attributes.map((attribute) => (
                <div className="facts__item" key={attribute.trait_type}>
                  <span>{attribute.trait_type}</span>
                  <strong>{attribute.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
