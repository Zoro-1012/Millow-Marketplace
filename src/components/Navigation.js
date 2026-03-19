const Navigation = ({ account, connectWallet, chainId, homesCount, isSupportedNetwork }) => {
  return (
    <nav className="nav">
      <div className="nav__brand">
        <div className="nav__mark">M</div>
        <div>
          <p>Millow</p>
          <span>Tokenized real estate desk</span>
        </div>
      </div>

      <div className="nav__links">
        <a href="#marketplace">Marketplace</a>
        <a href="#filters">Filters</a>
        <a href="#closing">Closing Flow</a>
      </div>

      <div className="nav__actions">
        <div className="nav__status">
          <span>{homesCount} live listings</span>
          <span>{chainId ? isSupportedNetwork ? 'Sepolia' : `Wrong network (${chainId})` : 'Wallet not connected'}</span>
        </div>

        <button type="button" className="button button--primary" onClick={connectWallet}>
          {account ? account.slice(0, 6) + '...' + account.slice(38, 42) : 'Connect Wallet'}
        </button>
      </div>
    </nav>
  );
};

export default Navigation;
