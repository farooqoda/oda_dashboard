import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/ui';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        title="There is nothing at this address"
        action={
          <Link to="/" className="btn-secondary">
            Back to the dashboard
          </Link>
        }
      >
        The link may be out of date. Use the sidebar to get to a screen that exists.
      </EmptyState>
    </>
  );
}
