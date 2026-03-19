import { useState } from 'react';

const initialState = {
  name: '',
  address: '',
  description: '',
  image: '',
  type: 'Condo',
  beds: '3',
  baths: '2',
  sqft: '1800',
  yearBuilt: '2024',
  purchasePrice: '',
  escrowAmount: ''
};

const ListingForm = ({ account, pendingMessage, errorMessage, successMessage, onConnect, onSubmit }) => {
  const [form, setForm] = useState(initialState);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const success = await onSubmit(form);
    if (success) {
      setForm(initialState);
    }
  };

  return (
    <section className="listingForm">
      <div className="listingForm__intro">
        <p className="eyebrow">Create listing</p>
        <h3>Mint a property NFT and list it for sale</h3>
        <p>
          Enter the property details, image URL, sale price, and earnest amount. The app will mint metadata directly into the token URI, approve escrow, and list the property on Sepolia.
        </p>
      </div>

      <form className="listingForm__grid" onSubmit={handleSubmit}>
        <label>
          <span>Property name</span>
          <input name="name" value={form.name} onChange={handleChange} placeholder="Modern Austin Loft" required />
        </label>

        <label>
          <span>Address</span>
          <input name="address" value={form.address} onChange={handleChange} placeholder="101 Congress Ave, Austin, TX" required />
        </label>

        <label className="listingForm__wide">
          <span>Description</span>
          <textarea name="description" value={form.description} onChange={handleChange} placeholder="Describe the property and neighborhood." required />
        </label>

        <label className="listingForm__wide">
          <span>Image URL</span>
          <input name="image" value={form.image} onChange={handleChange} placeholder="https://..." required />
        </label>

        <label>
          <span>Property type</span>
          <select name="type" value={form.type} onChange={handleChange}>
            <option value="Condo">Condo</option>
            <option value="Townhouse">Townhouse</option>
            <option value="Single family residence">Single family residence</option>
            <option value="Villa">Villa</option>
          </select>
        </label>

        <label>
          <span>Bedrooms</span>
          <input name="beds" type="number" min="1" value={form.beds} onChange={handleChange} required />
        </label>

        <label>
          <span>Bathrooms</span>
          <input name="baths" type="number" min="1" value={form.baths} onChange={handleChange} required />
        </label>

        <label>
          <span>Square feet</span>
          <input name="sqft" type="number" min="100" value={form.sqft} onChange={handleChange} required />
        </label>

        <label>
          <span>Year built</span>
          <input name="yearBuilt" type="number" min="1800" value={form.yearBuilt} onChange={handleChange} required />
        </label>

        <label>
          <span>Purchase price (ETH)</span>
          <input name="purchasePrice" type="number" min="0.1" step="0.1" value={form.purchasePrice} onChange={handleChange} required />
        </label>

        <label>
          <span>Earnest deposit (ETH)</span>
          <input name="escrowAmount" type="number" min="0.1" step="0.1" value={form.escrowAmount} onChange={handleChange} required />
        </label>

        <div className="listingForm__actions">
          <button type="submit" className="button button--primary">
            {pendingMessage || 'Mint and List'}
          </button>

          {!account && (
            <button type="button" className="button button--secondary" onClick={onConnect}>
              Connect Wallet
            </button>
          )}
        </div>

        {errorMessage && <div className="banner banner--error">{errorMessage}</div>}
        {successMessage && <div className="banner banner--success">{successMessage}</div>}
      </form>
    </section>
  );
};

export default ListingForm;
