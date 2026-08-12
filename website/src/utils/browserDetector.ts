export type BrowserType = 
  | 'chrome' 
  | 'firefox' 
  | 'edge' 
  | 'brave' 
  | 'opera' 
  | 'safari' 
  | 'vivaldi'
  | 'arc'
  | 'waterfox'
  | 'librewolf'
  | 'orion'
  | 'other';

export interface BrowserDetails {
  id: BrowserType;
  name: string;
  plasmoTarget: string; // e.g. "chrome-mv3", "firefox-mv3", "safari-mv3", etc.
  engine: 'chromium' | 'gecko' | 'webkit' | 'other';
  isFork: boolean;
  baseBrowserName?: string;
  installationSteps: {
    step: number;
    title: string;
    description: string;
    code?: string;
  }[];
}

export function detectBrowser(): BrowserType {
  const ua = navigator.userAgent.toLowerCase();

  // Explicit Fork Detection
  if (ua.includes('vivaldi')) return 'vivaldi';
  if (ua.includes('arc/') || (window as any).arc) return 'arc';
  if (ua.includes('waterfox')) return 'waterfox';
  if (ua.includes('librewolf')) return 'librewolf';
  if (ua.includes('orion')) return 'orion';

  // Major Browsers
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('opr/') || ua.includes('opera')) return 'opera';
  if ((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') return 'brave';
  if (ua.includes('firefox')) return 'firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';
  if (ua.includes('chrome')) return 'chrome';

  return 'other';
}

export function getBrowserDetails(browserId: BrowserType): BrowserDetails {
  switch (browserId) {
    case 'chrome':
      return {
        id: 'chrome',
        name: 'Google Chrome',
        plasmoTarget: 'chrome-mv3 (Default)',
        engine: 'chromium',
        isFork: false,
        installationSteps: [
          { step: 1, title: 'Download Plasmo Build', description: 'Download the compiled chrome-mv3 release ZIP built with Plasmo.' },
          { step: 2, title: 'Open Extensions Page', description: 'Navigate to chrome://extensions in your address bar.', code: 'chrome://extensions' },
          { step: 3, title: 'Enable Developer Mode', description: 'Toggle the Developer mode switch in the top-right corner.' },
          { step: 4, title: 'Load Unpacked Directory', description: 'Click "Load unpacked" and select your extracted build/chrome-mv3-prod directory.' }
        ]
      };

    case 'firefox':
      return {
        id: 'firefox',
        name: 'Mozilla Firefox',
        plasmoTarget: 'firefox-mv3 / firefox-mv2',
        engine: 'gecko',
        isFork: false,
        installationSteps: [
          { step: 1, title: 'Download Plasmo Firefox Package', description: 'Download the firefox-mv3 or firefox-mv2 release build from GitHub.' },
          { step: 2, title: 'Open Debugging Dashboard', description: 'Navigate to about:debugging#/runtime/this-firefox in Firefox.', code: 'about:debugging#/runtime/this-firefox' },
          { step: 3, title: 'Load Temporary Add-on', description: 'Click "Load Temporary Add-on..." button.' },
          { step: 4, title: 'Select Manifest File', description: 'Choose manifest.json from the unzipped Plasmo build directory.' }
        ]
      };

    case 'edge':
      return {
        id: 'edge',
        name: 'Microsoft Edge',
        plasmoTarget: 'edge-mv3',
        engine: 'chromium',
        isFork: false,
        installationSteps: [
          { step: 1, title: 'Download Plasmo Edge Target', description: 'Download the edge-mv3 release ZIP archive.' },
          { step: 2, title: 'Open Edge Extensions', description: 'Navigate to edge://extensions in Microsoft Edge.', code: 'edge://extensions' },
          { step: 3, title: 'Developer Mode', description: 'Turn ON Developer mode in the left-hand navigation panel.' },
          { step: 4, title: 'Load Unpacked Extension', description: 'Click "Load unpacked" and select the unzipped build/edge-mv3-prod folder.' }
        ]
      };

    case 'brave':
      return {
        id: 'brave',
        name: 'Brave Browser',
        plasmoTarget: 'brave-mv3',
        engine: 'chromium',
        isFork: true,
        baseBrowserName: 'Google Chrome',
        installationSteps: [
          { step: 1, title: 'Download Plasmo Brave Build', description: 'Download the brave-mv3 (or chrome-mv3) release package.' },
          { step: 2, title: 'Open Brave Extensions', description: 'Navigate to brave://extensions in your Brave browser.', code: 'brave://extensions' },
          { step: 3, title: 'Developer Mode', description: 'Toggle Developer mode ON at the top right.' },
          { step: 4, title: 'Load Unpacked', description: 'Click "Load unpacked" and choose your extracted Plasmo build directory.' }
        ]
      };

    case 'opera':
      return {
        id: 'opera',
        name: 'Opera',
        plasmoTarget: 'opera-mv3',
        engine: 'chromium',
        isFork: true,
        baseBrowserName: 'Google Chrome',
        installationSteps: [
          { step: 1, title: 'Download Plasmo Opera Package', description: 'Download the opera-mv3 release archive.' },
          { step: 2, title: 'Open Opera Extensions', description: 'Navigate to opera://extensions in your Opera browser.', code: 'opera://extensions' },
          { step: 3, title: 'Enable Developer Mode', description: 'Enable Developer mode toggle in top right corner.' },
          { step: 4, title: 'Load Unpacked', description: 'Click "Load unpacked" and select the unzipped directory.' }
        ]
      };

    case 'safari':
      return {
        id: 'safari',
        name: 'Apple Safari',
        plasmoTarget: 'safari-mv3 (Converter Workaround)',
        engine: 'webkit',
        isFork: false,
        installationSteps: [
          { step: 1, title: 'Plasmo Build & Xcode Conversion', description: 'Build with Plasmo for safari-mv3 or chrome-mv3 and run Xcode converter.', code: 'plasmo build --target=safari-mv3 && xcrun safari-web-extension-converter ./build/safari-mv3-prod --app-name LoginLens' },
          { step: 2, title: 'Xcode App Wrapper Build', description: 'Open LoginLens.xcodeproj in Xcode, set Signing Team to Personal Team, and press Cmd+R to Build & Run.' },
          { step: 3, title: 'Enable Develop Menu', description: 'In Safari Preferences -> Advanced, check "Show Develop menu in menu bar".' },
          { step: 4, title: 'Allow Unsigned Extensions', description: 'Under Safari Develop menu, click "Allow Unsigned Extensions" and activate LoginLens under Extension Preferences.' }
        ]
      };

    case 'vivaldi':
      return {
        id: 'vivaldi',
        name: 'Vivaldi Browser',
        plasmoTarget: 'chrome-mv3 / edge-mv3',
        engine: 'chromium',
        isFork: true,
        baseBrowserName: 'Google Chrome',
        installationSteps: [
          { step: 1, title: 'Download Plasmo Package', description: 'Download the chrome-mv3 release package.' },
          { step: 2, title: 'Open Extensions', description: 'Navigate to vivaldi://extensions in Vivaldi.', code: 'vivaldi://extensions' },
          { step: 3, title: 'Developer Mode', description: 'Turn ON Developer Mode switch at top right.' },
          { step: 4, title: 'Load Unpacked', description: 'Click "Load unpacked" and select the unzipped directory.' }
        ]
      };

    case 'arc':
      return {
        id: 'arc',
        name: 'Arc Browser',
        plasmoTarget: 'chrome-mv3',
        engine: 'chromium',
        isFork: true,
        baseBrowserName: 'Google Chrome',
        installationSteps: [
          { step: 1, title: 'Download Plasmo Build', description: 'Download the chrome-mv3 release ZIP.' },
          { step: 2, title: 'Open Extensions', description: 'Navigate to arc://extensions in Arc command bar.', code: 'arc://extensions' },
          { step: 3, title: 'Developer Mode', description: 'Enable Developer mode in the top right corner.' },
          { step: 4, title: 'Load Unpacked', description: 'Click "Load unpacked" and choose the extracted directory.' }
        ]
      };

    case 'waterfox':
    case 'librewolf':
      return {
        id: browserId,
        name: browserId === 'waterfox' ? 'Waterfox Browser' : 'LibreWolf Browser',
        plasmoTarget: 'firefox-mv2 / firefox-mv3',
        engine: 'gecko',
        isFork: true,
        baseBrowserName: 'Mozilla Firefox',
        installationSteps: [
          { step: 1, title: 'Download Plasmo Firefox Build', description: 'Download the firefox-mv2 or firefox-mv3 ZIP package.' },
          { step: 2, title: 'Open Debugging Dashboard', description: 'Navigate to about:debugging#/runtime/this-firefox.', code: 'about:debugging#/runtime/this-firefox' },
          { step: 3, title: 'Load Temporary Add-on', description: 'Click "Load Temporary Add-on..." button.' },
          { step: 4, title: 'Select Manifest', description: 'Select manifest.json from the extracted directory.' }
        ]
      };

    case 'orion':
      return {
        id: 'orion',
        name: 'Orion Browser',
        plasmoTarget: 'chrome-mv3 / safari-mv3',
        engine: 'webkit',
        isFork: true,
        baseBrowserName: 'Apple Safari (with Chrome MV3 Engine)',
        installationSteps: [
          { step: 1, title: 'Download Chrome MV3 Zip', description: 'Download the chrome-mv3 release zip built with Plasmo.' },
          { step: 2, title: 'Orion Extension Preferences', description: 'Open Orion Settings -> Extensions -> Develop.' },
          { step: 3, title: 'Install from Disk', description: 'Select "Install Extension from Disk" and choose manifest.json.' }
        ]
      };

    default:
      return {
        id: 'other',
        name: 'Generic / Custom Browser Target',
        plasmoTarget: 'chrome-mv3 / firefox-mv2',
        engine: 'other',
        isFork: false,
        installationSteps: [
          { step: 1, title: 'Identify Browser Engine', description: 'Check if your browser uses Chromium (Chrome/Edge/Brave) or Gecko (Firefox).' },
          { step: 2, title: 'Chromium Browsers (chrome-mv3)', description: 'Go to chrome://extensions, enable Developer Mode, and click "Load unpacked".', code: 'chrome://extensions' },
          { step: 3, title: 'Gecko Browsers (firefox-mv2/firefox-mv3)', description: 'Go to about:debugging#/runtime/this-firefox, click "Load Temporary Add-on...", and choose manifest.json.', code: 'about:debugging#/runtime/this-firefox' }
        ]
      };
  }
}
