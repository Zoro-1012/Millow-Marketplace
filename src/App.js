import { startTransition, useCallback, useDeferredValue, useEffect, useState } from 'react';
import { ethers } from 'ethers';

import Navigation from './components/Navigation';
import Search from './components/Search';
import Home from './components/Home';
import ListingForm from './components/ListingForm';

import RealEstate from './abis/RealEstate.json';
import Escrow from './abis/Escrow.json';

import config from './config.json';

const zeroAddress = ethers.constants.AddressZero;

const formatAddress = (account) => {
  if (!account || account === zeroAddress) return 'Open';
  return `${account.slice(0, 6)}...${account.slice(38, 42)}`;
};

const getAttributeValue = (home, traitType) => {
  const attribute = home.attributes?.find((item) => item.trait_type === traitType);
  return attribute?.value;
};

const toEthNumber = (value) => Number(ethers.utils.formatUnits(value || 0, 'ether'));
const envChainId = process.env.REACT_APP_CHAIN_ID ? Number(process.env.REACT_APP_CHAIN_ID) : null;
const envConfig =
  process.env.REACT_APP_REALESTATE_ADDRESS && process.env.REACT_APP_ESCROW_ADDRESS
    ? {
        realEstate: { address: process.env.REACT_APP_REALESTATE_ADDRESS },
        escrow: { address: process.env.REACT_APP_ESCROW_ADDRESS }
      }
    : null;

const localMetadataPrefix = 'millow://listing/';
const localMetadataStorageKey = 'millow:listing-metadata';

const buildTokenURI = (listingId) => `${localMetadataPrefix}${listingId}`;

const readLocalMetadataMap = () => {
  try {
    const raw = window.localStorage.getItem(localMetadataStorageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeLocalMetadata = (uri, metadata) => {
  const current = readLocalMetadataMap();
  current[uri] = metadata;
  window.localStorage.setItem(localMetadataStorageKey, JSON.stringify(current));
};

const resolveMetadata = async (uri) => {
  if (uri.startsWith(localMetadataPrefix)) {
    const stored = readLocalMetadataMap()[uri];

    if (!stored) {
      throw new Error(`Metadata for ${uri} was not found in local storage.`);
    }

    return stored;
  }

  const response = await fetch(uri);
  return response.json();
};

function App() {
  const [provider, setProvider] = useState(null);
  const [realEstate, setRealEstate] = useState(null);
  const [escrow, setEscrow] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);

  const [homes, setHomes] = useState([]);
  const [selectedHome, setSelectedHome] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({
    type: 'all',
    minBeds: 'any',
    maxPrice: 'any',
    status: 'all',
    sortBy: 'featured'
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [listingFeedback, setListingFeedback] = useState({ pending: '', error: '' });

  const deferredSearch = useDeferredValue(searchInput);

  const fetchListingSnapshot = useCallback(async (tokenId, realEstateContract, escrowContract) => {
    const [inspectorAddress, lenderAddress, sellerAddress, buyerAddress, ownerAddress, isListed, purchasePrice, escrowAmount, fundsDeposited, inspectionPassed] = await Promise.all([
      escrowContract.inspector(),
      escrowContract.lender(),
      escrowContract.seller(tokenId),
      escrowContract.buyer(tokenId),
      realEstateContract.ownerOf(tokenId),
      escrowContract.isListed(tokenId),
      escrowContract.purchasePrice(tokenId),
      escrowContract.escrowAmount(tokenId),
      escrowContract.fundsDeposited(tokenId),
      escrowContract.inspectionPassed(tokenId)
    ]);

    const [buyerApproved, sellerApproved, lenderApproved] = await Promise.all([
      buyerAddress !== zeroAddress ? escrowContract.approval(tokenId, buyerAddress) : Promise.resolve(false),
      sellerAddress !== zeroAddress ? escrowContract.approval(tokenId, sellerAddress) : Promise.resolve(false),
      lenderAddress !== zeroAddress ? escrowContract.approval(tokenId, lenderAddress) : Promise.resolve(false)
    ]);

    let stage = 'Wallet asset';
    if (isListed) {
      if (buyerAddress === zeroAddress) {
        stage = 'Listed';
      } else if (buyerApproved && sellerApproved && lenderApproved && inspectionPassed) {
        stage = 'Ready to close';
      } else {
        stage = 'In escrow';
      }
    } else if (sellerAddress !== zeroAddress && buyerAddress !== zeroAddress) {
      stage = 'Sold';
    }

    const progressCount = [buyerApproved, inspectionPassed, lenderApproved, !isListed && buyerAddress !== zeroAddress].filter(Boolean).length;

    return {
      inspectorAddress,
      lenderAddress,
      sellerAddress,
      contractBuyer: buyerAddress,
      ownerAddress,
      isListed,
      contractPurchasePrice: toEthNumber(purchasePrice),
      contractEscrowAmount: toEthNumber(escrowAmount),
      fundsDeposited: toEthNumber(fundsDeposited),
      inspectionPassed,
      approvals: {
        buyer: buyerApproved,
        seller: sellerApproved,
        lender: lenderApproved
      },
      progressLabel: `${progressCount}/4 milestones`,
      stage
    };
  }, []);

  const loadBlockchainData = useCallback(async () => {
    if (!window.ethereum) {
      setProvider(null);
      setRealEstate(null);
      setEscrow(null);
      setHomes([]);
      setIsLoading(false);
      setError('No injected wallet was detected. Install MetaMask and connect to the local Hardhat network.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      const network = await web3Provider.getNetwork();
      const networkConfig = envChainId === network.chainId && envConfig
        ? envConfig
        : config[network.chainId];

      setProvider(web3Provider);
      setChainId(network.chainId);

      if (!networkConfig) {
        setRealEstate(null);
        setEscrow(null);
        setHomes([]);
        setIsLoading(false);
        setError(`Unsupported network detected: chain ${network.chainId}. Switch to your local Hardhat network (31337).`);
        return;
      }

      const [connectedAccounts, realEstateContract, escrowContract] = await Promise.all([
        window.ethereum.request({ method: 'eth_accounts' }),
        Promise.resolve(new ethers.Contract(networkConfig.realEstate.address, RealEstate, web3Provider)),
        Promise.resolve(new ethers.Contract(networkConfig.escrow.address, Escrow, web3Provider))
      ]);

      setAccount(connectedAccounts.length > 0 ? ethers.utils.getAddress(connectedAccounts[0]) : null);

      const totalSupply = Number((await realEstateContract.totalSupply()).toString());
      const loadedHomes = await Promise.all(
        Array.from({ length: totalSupply }, async (_, index) => {
          const tokenId = index + 1;
          const uri = await realEstateContract.tokenURI(tokenId);
          const metadata = await resolveMetadata(uri);
          const snapshot = await fetchListingSnapshot(tokenId, realEstateContract, escrowContract);

          return {
            ...metadata,
            id: metadata.id || String(tokenId),
            price: Number(getAttributeValue(metadata, 'Purchase Price') || 0),
            type: getAttributeValue(metadata, 'Type of Residence') || 'Residence',
            beds: Number(getAttributeValue(metadata, 'Bed Rooms') || 0),
            baths: Number(getAttributeValue(metadata, 'Bathrooms') || 0),
            sqft: Number(getAttributeValue(metadata, 'Square Feet') || 0),
            yearBuilt: Number(getAttributeValue(metadata, 'Year Built') || 0),
            ...snapshot
          };
        })
      );

      setRealEstate(realEstateContract);
      setEscrow(escrowContract);
      setHomes(loadedHomes);
    } catch (err) {
      setHomes([]);
      setRealEstate(null);
      setEscrow(null);
      const message = err.code === 'CALL_EXCEPTION'
        ? 'Marketplace contracts are out of sync with the frontend. Restart your Hardhat node and run the deploy script again.'
        : err.reason || err.message || 'Unable to load marketplace data.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchListingSnapshot]);

  useEffect(() => {
    loadBlockchainData();
  }, [loadBlockchainData]);

  useEffect(() => {
    if (!window.ethereum) return undefined;

    const handleAccountsChanged = (accounts) => {
      setAccount(accounts.length > 0 ? ethers.utils.getAddress(accounts[0]) : null);
    };

    const handleChainChanged = () => {
      loadBlockchainData();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [loadBlockchainData]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('Install MetaMask to connect a wallet and interact with the marketplace.');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(ethers.utils.getAddress(accounts[0]));
      setError('');
    } catch (err) {
      setError(err.reason || err.message || 'Wallet connection failed.');
    }
  };

  const handleSearchChange = (value) => {
    startTransition(() => {
      setSearchInput(value);
    });
  };

  const handleFilterChange = (name, value) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, [name]: value }));
    });
  };

  const clearFilters = () => {
    setSearchInput('');
    setFilters({
      type: 'all',
      minBeds: 'any',
      maxPrice: 'any',
      status: 'all',
      sortBy: 'featured'
    });
  };

  const handleCreateListing = async (formValues) => {
    if (!provider || !realEstate || !escrow) {
      setListingFeedback({ pending: '', error: 'Marketplace contracts are not ready. Restart your Hardhat node and redeploy the contracts.' });
      return false;
    }

    if (!account) {
      await connectWallet();
      return false;
    }

    const purchasePriceValue = Number(formValues.purchasePrice);
    const escrowAmountValue = Number(formValues.escrowAmount);

    if (!purchasePriceValue || !escrowAmountValue || escrowAmountValue > purchasePriceValue) {
      setListingFeedback({ pending: '', error: 'Enter a valid purchase price and an earnest deposit that does not exceed it.' });
      return false;
    }

    setListingFeedback({ pending: 'Minting and listing property...', error: '' });

    try {
      const signer = provider.getSigner();

      const metadata = {
        name: formValues.name,
        address: formValues.address,
        description: formValues.description,
        image: formValues.image,
        attributes: [
          { trait_type: 'Purchase Price', value: purchasePriceValue },
          { trait_type: 'Type of Residence', value: formValues.type },
          { trait_type: 'Bed Rooms', value: Number(formValues.beds) },
          { trait_type: 'Bathrooms', value: Number(formValues.baths) },
          { trait_type: 'Square Feet', value: Number(formValues.sqft) },
          { trait_type: 'Year Built', value: Number(formValues.yearBuilt) }
        ]
      };

      const listingId = `${Date.now()}-${account.toLowerCase()}`;
      const tokenURI = buildTokenURI(listingId);
      writeLocalMetadata(tokenURI, metadata);

      const mintTransaction = await realEstate.connect(signer).mint(tokenURI);
      const mintReceipt = await mintTransaction.wait();
      const transferEvent = mintReceipt.events?.find((event) => event.event === 'Transfer');
      const tokenId = transferEvent?.args?.tokenId?.toNumber();

      if (!tokenId) {
        throw new Error('Unable to determine the minted token id.');
      }

      let transaction = await realEstate.connect(signer).approve(escrow.address, tokenId);
      await transaction.wait();

      transaction = await escrow.connect(signer).list(
        tokenId,
        ethers.utils.parseUnits(formValues.purchasePrice, 'ether'),
        ethers.utils.parseUnits(formValues.escrowAmount, 'ether')
      );
      await transaction.wait();

      setListingFeedback({ pending: '', error: '' });
      await loadBlockchainData();
      return true;
    } catch (err) {
      setListingFeedback({ pending: '', error: err.reason || err.message || 'Unable to create listing.' });
      return false;
    }
  };

  const visibleHomes = homes
    .filter((home) => {
      const query = deferredSearch.trim().toLowerCase();
      const matchesQuery =
        query.length === 0 ||
        [home.name, home.address, home.description, home.type, home.stage]
          .join(' ')
          .toLowerCase()
          .includes(query);

      const referencePrice = home.contractPurchasePrice || home.price;

      return (
        matchesQuery &&
        (filters.type === 'all' || home.type === filters.type) &&
        (filters.minBeds === 'any' || home.beds >= Number(filters.minBeds)) &&
        (filters.maxPrice === 'any' || referencePrice <= Number(filters.maxPrice)) &&
        (filters.status === 'all' || home.stage === filters.status)
      );
    })
    .sort((left, right) => {
      switch (filters.sortBy) {
        case 'price-asc':
          return (left.contractPurchasePrice || left.price) - (right.contractPurchasePrice || right.price);
        case 'price-desc':
          return (right.contractPurchasePrice || right.price) - (left.contractPurchasePrice || left.price);
        case 'sqft-desc':
          return right.sqft - left.sqft;
        case 'year-desc':
          return right.yearBuilt - left.yearBuilt;
        default:
          return Number(left.id) - Number(right.id);
      }
    });

  const availableTypes = [...new Set(homes.map((home) => home.type))];
  const availableStatuses = [...new Set(homes.map((home) => home.stage))];
  const liveListings = homes.filter((home) => home.isListed).length;
  const averagePrice = homes.length
    ? (homes.reduce((sum, home) => sum + (home.contractPurchasePrice || home.price), 0) / homes.length).toFixed(1)
    : '0.0';
  const largestHome = homes.reduce((largest, home) => (home.sqft > largest ? home.sqft : largest), 0);

  return (
    <div className="app">
      <Navigation
        account={account}
        connectWallet={connectWallet}
        chainId={chainId}
        homesCount={liveListings}
      />

      <Search
        searchValue={searchInput}
        onSearchChange={handleSearchChange}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={clearFilters}
        onRefresh={loadBlockchainData}
        availableTypes={availableTypes}
        availableStatuses={availableStatuses}
        marketStats={[
          { label: 'Live Listings', value: `${liveListings}` },
          { label: 'Avg. Price', value: `${averagePrice} ETH` },
          { label: 'Largest Home', value: `${largestHome || 0} sqft` }
        ]}
        accountLabel={account ? formatAddress(account) : 'Wallet not connected'}
      />

      <main className="market">
        <section className="market__header">
          <div>
            <p className="eyebrow">Functional marketplace</p>
            <h2>Mint it, list it, reserve it, and close it.</h2>
            <p className="market__subtitle">
              This flow now supports real property creation and open-market reservation through the escrow contract instead of only displaying seeded metadata.
            </p>
          </div>
          <div className="market__summary">
            <span>{visibleHomes.length} result{visibleHomes.length === 1 ? '' : 's'}</span>
            <span>{account ? `Connected: ${formatAddress(account)}` : 'Connect a wallet to list or buy properties'}</span>
          </div>
        </section>

        <ListingForm
          account={account}
          pendingMessage={listingFeedback.pending}
          errorMessage={listingFeedback.error}
          onConnect={connectWallet}
          onSubmit={handleCreateListing}
        />

        {error && <div className="banner banner--error">{error}</div>}

        {isLoading ? (
          <section className="cards cards--skeleton">
            {[1, 2, 3].map((item) => (
              <article className="card card--skeleton" key={item}>
                <div className="card__media shimmer" />
                <div className="card__body">
                  <div className="shimmer shimmer--line" />
                  <div className="shimmer shimmer--line shimmer--line-short" />
                  <div className="shimmer shimmer--line shimmer--line-shorter" />
                </div>
              </article>
            ))}
          </section>
        ) : visibleHomes.length > 0 ? (
          <section className="cards">
            {visibleHomes.map((home) => (
              <article className="card" key={home.id} onClick={() => setSelectedHome(home)}>
                <div className="card__media">
                  <img src={home.image} alt={home.name} />
                  <div className="card__badge">{home.type}</div>
                  <div className={`card__state card__state--${home.stage.toLowerCase().replace(/\s+/g, '-')}`}>
                    {home.stage}
                  </div>
                </div>

                <div className="card__body">
                  <div className="card__priceRow">
                    <h3>{home.contractPurchasePrice || home.price} ETH</h3>
                    <span>{home.yearBuilt || 'New'} build</span>
                  </div>

                  <h4>{home.name}</h4>
                  <p className="card__address">{home.address}</p>

                  <div className="card__metrics">
                    <span>{home.beds} beds</span>
                    <span>{home.baths} baths</span>
                    <span>{home.sqft} sqft</span>
                  </div>

                  <p className="card__description">{home.description}</p>

                  <div className="card__footer">
                    <div>
                      <span>Escrow</span>
                      <strong>{home.contractEscrowAmount || 0} ETH</strong>
                    </div>
                    <div>
                      <span>Buyer</span>
                      <strong>{formatAddress(home.contractBuyer)}</strong>
                    </div>
                    <div>
                      <span>Progress</span>
                      <strong>{home.progressLabel}</strong>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="empty">
            <p className="eyebrow">No matching homes</p>
            <h3>Adjust your filters or search a broader area.</h3>
            <p>The current query returned no listings. Clear filters to restore the full inventory.</p>
            <button type="button" className="button button--primary" onClick={clearFilters}>
              Reset filters
            </button>
          </section>
        )}
      </main>

      {selectedHome && (
        <Home
          home={selectedHome}
          provider={provider}
          realEstate={realEstate}
          account={account}
          escrow={escrow}
          connectWallet={connectWallet}
          onRefresh={loadBlockchainData}
          togglePop={() => setSelectedHome(null)}
        />
      )}
    </div>
  );
}

export default App;
