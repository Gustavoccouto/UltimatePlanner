import { ROUTES } from './utils/constants.js';
import { setRoute } from './state.js';

export function initRouter() {
  const hash = window.location.hash.replace('#/', '');
  setRoute(ROUTES[hash] ? hash : 'dashboard');

  window.addEventListener('hashchange', () => {
    const route = window.location.hash.replace('#/', '');
    setRoute(ROUTES[route] ? route : 'dashboard');
  });
}

export function navigate(route) {
  window.location.hash = `#/${route}`;
}
