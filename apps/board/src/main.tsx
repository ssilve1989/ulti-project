import { render } from 'solid-js/web';
import { App } from './app';
import { applyTheme, readThemeChoice } from './shell/theme';
import './styles.css';

applyTheme(readThemeChoice());

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root element');
render(() => <App />, root);
