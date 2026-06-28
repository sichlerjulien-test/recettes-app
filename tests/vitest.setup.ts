// Polyfills jsdom manquants — sans effet sémantique sur les tests
// jsdom n'implémente pas ResizeObserver (utilisé par @radix-ui/react-use-size)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
