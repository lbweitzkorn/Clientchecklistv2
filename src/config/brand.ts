export const BRAND = {
  logoLight: '/assets/js-logo-light.svg',
  logoDark: '/assets/js-logo-dark.svg',
  name: 'JustSeventy',
};

export function getLogoForBackground(isDarkBackground: boolean): string {
  return isDarkBackground ? BRAND.logoLight : BRAND.logoDark;
}

export function detectBackgroundBrightness(imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let totalBrightness = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          totalBrightness += brightness;
        }

        const avgBrightness = totalBrightness / (data.length / 4);
        resolve(avgBrightness > 127);
      } catch (error) {
        console.error('Error detecting brightness:', error);
        resolve(false);
      }
    };

    img.onerror = () => resolve(false);
    img.src = imageUrl;
  });
}

export function getOptimalLogo(isDarkBackground: boolean): string {
  return isDarkBackground ? BRAND.logoLight : BRAND.logoDark;
}
