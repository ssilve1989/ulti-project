import { Route, Router } from '@solidjs/router';
import { BoardPage } from './board/board-page';
import { EventList } from './events/event-list';
import { Shell } from './shell/shell';

/** The router root: the event list and each event's board. */
export function App() {
  return (
    <Router root={Shell}>
      <Route path="/" component={EventList} />
      <Route path="/events/:id" component={BoardPage} />
    </Router>
  );
}
