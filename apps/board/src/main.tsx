import { render } from 'solid-js/web';
import { App } from './app';
import { applyTheme, readStoredTheme } from './shell/theme';
import './styles.css';

applyTheme(readStoredTheme());

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root element');
render(() => <App />, root);
