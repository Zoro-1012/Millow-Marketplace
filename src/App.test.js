import { render, screen } from '@testing-library/react';
import App from './App';

test('renders marketplace hero content', () => {
  render(<App />);
  expect(
    screen.getByText(/discover, evaluate, and close on-chain real estate/i)
  ).toBeInTheDocument();
});
