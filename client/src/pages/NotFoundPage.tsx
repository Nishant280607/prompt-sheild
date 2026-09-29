import { ShieldX } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '../components/ui/Button';
import { useDocumentTitle } from '../hooks/useAsync';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="noise flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <ShieldX className="h-12 w-12 text-accent" aria-hidden="true" />
      <p className="mt-6 font-mono text-sm tracking-[0.3em] text-slate-500">ERROR 404</p>
      <h1 className="mt-2 text-3xl font-semibold">This route is not protected - because it does not exist.</h1>
      <p className="mt-3 max-w-md text-slate-400">The page you requested could not be found.</p>
      <Link to="/" className={buttonClasses('primary', 'md', 'mt-8')}>
        Back to Prompt Shield
      </Link>
    </div>
  );
}
