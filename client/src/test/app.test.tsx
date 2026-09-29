import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PromptEditor } from '../components/prompt/PromptEditor';
import { RiskBadge } from '../components/ui/Badge';
import { ScoreRing } from '../components/ui/ScoreRing';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import LoginPage from '../pages/LoginPage';
import { estimateTokens, sizeClass } from '../utils/helpers';
import { ratingFor } from '../utils/risk';

describe('client utilities', () => {
  it('mirrors the server token estimate', () => {
    // Same fixture as server/tests/unit/scanners.test.ts
    const tokens = estimateTokens('The quick brown fox jumps over the lazy dog. '.repeat(20));
    expect(tokens).toBeGreaterThan(180);
    expect(tokens).toBeLessThan(260);
    expect(estimateTokens('   ')).toBe(0);
  });

  it('classifies size and score bands', () => {
    expect(sizeClass(120)).toBe('LOW');
    expect(sizeClass(900)).toBe('MEDIUM');
    expect(sizeClass(2400)).toBe('HIGH');
    expect(ratingFor(92).rating).toBe('Excellent');
    expect(ratingFor(60).risk).toBe('MEDIUM');
    expect(ratingFor(10).rating).toBe('Critical Risk');
  });
});

describe('UI components', () => {
  it('renders an accessible score ring', () => {
    render(<ScoreRing score={87} animate={false} />);
    expect(screen.getByRole('img', { name: /security score 87 out of 100: good/i })).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
  });

  it('labels risk and severity badges', () => {
    render(
      <>
        <RiskBadge level="CRITICAL" />
        <RiskBadge level="LOW" kind="severity" />
      </>,
    );
    expect(screen.getByText('Critical risk')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('shows line numbers in the prompt editor and reports changes', async () => {
    const onChange = vi.fn();
    render(<PromptEditor id="editor" value={'line one\nline two\nline three'} onChange={onChange} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), '!');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('LoginPage', () => {
  it('validates the form before calling the API', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <ToastProvider>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
  });
});
