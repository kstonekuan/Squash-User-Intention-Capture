import { mount } from 'svelte';
import SidePanel from './components/SidePanel.svelte';

// Wait for DOM to be ready before mounting
function mountApp() {
  const target = document.getElementById('app');
  if (!target) {
    console.error('Target element #app not found');
    return;
  }

  // Use Svelte 5's mount function
  const app = mount(SidePanel, {
    target: target,
  });

  return app;
}

// Mount when DOM is ready
let app: ReturnType<typeof mount> | undefined;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app = mountApp();
  });
} else {
  // Use setTimeout to ensure Svelte runtime is ready
  setTimeout(() => {
    app = mountApp();
  }, 0);
}

export default app;
