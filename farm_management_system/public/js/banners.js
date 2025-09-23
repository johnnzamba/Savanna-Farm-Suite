(function() {
  const banners = [
    "poultry.svg",
    "livestock.svg", 
    "pig.svg",
    "plants.svg",
    "carrot.svg",
    "sheep.svg",
    "sunflower.svg",
    "vegetable.svg",
    "farm.svg"
  ];

  function chooseRandom() {
    return banners[Math.floor(Math.random() * banners.length)];
  }

  function replaceBanner() {
    const chosen = chooseRandom();
    const assetUrl = `/assets/farm_management_system/${chosen}`;

    // Always try to find or create a banner image element
    let img = document.querySelector('.web-form-banner-image');
    
    if (!img) {
      // If no banner image exists, create one
      const container = document.querySelector('.web-form-banner-container');
      if (container) {
        img = document.createElement('img');
        img.className = 'web-form-banner-image';
        img.alt = 'Farm Banner';
        container.appendChild(img);
      }
    }

    if (img) {
      // Hide the image while loading to prevent flash
      img.style.visibility = 'hidden';
      img.style.display = 'block'; // Ensure it's visible
      
      img.src = assetUrl;
      img.onload = () => {
        img.style.visibility = 'visible';
      };
      img.onerror = () => {
        // If image fails to load, try another one
        console.warn(`Failed to load banner: ${assetUrl}`);
        setTimeout(replaceBanner, 100);
      };
      return;
    }

    // Fallback: If no img element found, try to set background on container
    let hero = document.querySelector('.web-form-banner-container') || 
               document.querySelector('.web-form-header') || 
               document.querySelector('.website-banner') || 
               document.querySelector('.hero');
    
    if (hero) {
      hero.style.backgroundImage = `url('${assetUrl}')`;
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
      hero.style.minHeight = '200px'; // Ensure there's some height
    }
  }

  function replaceNavbarLogo() {
    const chosen = chooseRandom();
    const assetUrl = `/assets/farm_management_system/${chosen}`;

    // Find the navbar logo
    let navbarLogo = document.querySelector('.app-logo') || 
                    document.querySelector('.navbar-brand img') ||
                    document.querySelector('img[alt*="Logo"]') ||
                    document.querySelector('img[alt*="App"]') ||
                    document.querySelector('.navbar img');

    if (navbarLogo) {
      // Store original logo for fallback
      if (!navbarLogo.dataset.originalSrc) {
        navbarLogo.dataset.originalSrc = navbarLogo.src;
      }

      // Always replace navbar logos for dynamic effect
      navbarLogo.style.opacity = '0';
      
      navbarLogo.src = assetUrl;
      navbarLogo.onload = () => {
        navbarLogo.style.opacity = '1';
        navbarLogo.style.transition = 'opacity 0.3s ease-in-out';
      };
      navbarLogo.onerror = () => {
        // If farm logo fails, revert to original
        console.warn(`Failed to load navbar logo: ${assetUrl}`);
        navbarLogo.src = navbarLogo.dataset.originalSrc;
        navbarLogo.style.opacity = '1';
      };
    }
  }

  function replaceSplashLogo() {
    const chosen = chooseRandom();
    const assetUrl = `/assets/farm_management_system/${chosen}`;

    // Find splash screen logo - more specific selectors
    let splashLogo = document.querySelector('.splash img') ||
                    document.querySelector('.splash-logo') ||
                    document.querySelector('img[data-farm-logo="true"]') ||
                    document.querySelector('img[src*="splash"]') ||
                    document.querySelector('img[src*="frappe-framework-logo"]') ||
                    document.querySelector('img[src*="farm_management_system"]');

    if (splashLogo) {
      // Store original logo for fallback
      if (!splashLogo.dataset.originalSrc) {
        splashLogo.dataset.originalSrc = splashLogo.src;
      }

      // Always replace splash logos for dynamic effect
      splashLogo.style.opacity = '0';
      splashLogo.src = assetUrl;
      splashLogo.onload = () => {
        splashLogo.style.opacity = '1';
        splashLogo.style.transition = 'opacity 0.3s ease-in-out';
      };
      splashLogo.onerror = () => {
        console.warn(`Failed to load splash logo: ${assetUrl}`);
        splashLogo.src = splashLogo.dataset.originalSrc;
        splashLogo.style.opacity = '1';
      };
    }
  }

  function replaceAllLogos() {
    replaceBanner();
    replaceNavbarLogo();
    replaceSplashLogo();
  }

  // Run immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceAllLogos);
  } else {
    replaceAllLogos();
  }

  // Re-run on single-page navigation
  document.addEventListener('page-change', replaceAllLogos);
  
  // Also run when the page becomes visible (for better UX)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      replaceAllLogos();
    }
  });

  // Replace logos periodically for dynamic effect (every 30 seconds)
  setInterval(replaceAllLogos, 30000);
})();
