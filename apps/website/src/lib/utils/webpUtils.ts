// Client-side WebP support detection
export const detectWebPSupport = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src =
      'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
};

// Cache WebP support result
let webpSupport: boolean | null = null;

export const getWebPSupport = async (): Promise<boolean> => {
  if (webpSupport === null) {
    webpSupport = await detectWebPSupport();
  }
  return webpSupport;
};

// Synchronous fallback (assumes support for modern browsers)
export const assumeWebPSupport = (): boolean => {
  // Most modern browsers support WebP
  // You could add more sophisticated detection here
  return true;
};
