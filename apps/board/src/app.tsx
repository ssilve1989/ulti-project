import { Route, Router } from '@solidjs/router';
import { Shell } from './shell/shell';

function Home() {
  return null;
}

/** The router root. Later tasks add the event list and the `/events/:id` board. */
export function App() {
  return (
    <Router root={Shell}>
      <Route path="/" component={Home} />
    </Router>
  );
}
