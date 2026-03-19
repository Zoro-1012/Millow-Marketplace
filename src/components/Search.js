const Search = ({
  searchValue,
  onSearchChange,
  filters,
  onFilterChange,
  onClearFilters,
  onRefresh,
  availableTypes,
  availableStatuses,
  marketStats,
  accountLabel
}) => {
  return (
    <header className="hero" id="marketplace">
      <div className="hero__content">
        <p className="eyebrow">Modern property marketplace</p>
        <h1>Discover, evaluate, and close on-chain real estate in one workspace.</h1>
        <p className="hero__copy">
          Search active listings, compare property data, and guide buyers, sellers, lenders, and inspectors through the escrow flow.
        </p>

        <div className="hero__meta">
          {marketStats.map((item) => (
            <div className="hero__stat" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="searchPanel" id="filters">
        <div className="searchPanel__top">
          <div>
            <span className="eyebrow">Search and screen</span>
            <h2>Refine the market in real time</h2>
          </div>
          <span className="searchPanel__wallet">{accountLabel}</span>
        </div>

        <label className="searchPanel__search">
          <span>Search listings</span>
          <input
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by address, city, property type, or listing name"
          />
        </label>

        <div className="searchPanel__filters">
          <label>
            <span>Property type</span>
            <select value={filters.type} onChange={(event) => onFilterChange('type', event.target.value)}>
              <option value="all">All types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Bedrooms</span>
            <select value={filters.minBeds} onChange={(event) => onFilterChange('minBeds', event.target.value)}>
              <option value="any">Any</option>
              <option value="2">2+ beds</option>
              <option value="3">3+ beds</option>
              <option value="4">4+ beds</option>
            </select>
          </label>

          <label>
            <span>Max price</span>
            <select value={filters.maxPrice} onChange={(event) => onFilterChange('maxPrice', event.target.value)}>
              <option value="any">Any price</option>
              <option value="10">Up to 10 ETH</option>
              <option value="15">Up to 15 ETH</option>
              <option value="20">Up to 20 ETH</option>
            </select>
          </label>

          <label>
            <span>Sale status</span>
            <select value={filters.status} onChange={(event) => onFilterChange('status', event.target.value)}>
              <option value="all">All stages</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Sort by</span>
            <select value={filters.sortBy} onChange={(event) => onFilterChange('sortBy', event.target.value)}>
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="sqft-desc">Largest homes</option>
              <option value="year-desc">Newest build</option>
            </select>
          </label>
        </div>

        <div className="searchPanel__actions">
          <button type="button" className="button button--primary" onClick={onRefresh}>
            Refresh Sepolia data
          </button>
          <button type="button" className="button button--secondary" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      </div>
    </header>
  );
};

export default Search;
