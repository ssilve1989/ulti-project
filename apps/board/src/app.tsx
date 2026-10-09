import { Route, Router } from '@solidjs/router';

function Home() {
  return <p>ULTI PROJECT ▪ BOARD</p>;
}

/** The router root. Later tasks add the shell and the `/events/:id` board. */
export function App() {
  return (
    <Router>
      <Route path="/" component={Home} />
    </Router>
  );
}
