import { Route, Router } from '@solidjs/router';
import { EventList } from './events/event-list';
import { Shell } from './shell/shell';

/** The router root. A later task adds the `/events/:id` board. */
export function App() {
  return (
    <Router root={Shell}>
      <Route path="/" component={EventList} />
    </Router>
  );
}
