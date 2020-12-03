import { render, screen } from '@testing-library/react';
import App from './App';

test('renders join room link', () => {
  render(<App />);
  const linkElement = screen.getByText(/join room/i);
  expect(linkElement).toBeInTheDocument();
});
