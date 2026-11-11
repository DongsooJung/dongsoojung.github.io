const { app, BrowserWindow, Menu, dialog, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { navigationDecision } = require('./navigation-policy');
const { startStaticServer } = require('./static-server');

const DEV = process.argv.includes('--dev');
const PROD_URL = 'https://stargateedu.co.kr/';
const ALLOWED_PERMISSIONS = new Set([
  'clipboard-sanitized-write',
  'fullscreen',
  'notifications',
]);

let mainWindow = null;
let devServer = null;
let devOrigin = null;
let homeUrl = PROD_URL;
let showingError = false;

if (process.platform === 'win32') {
  app.setAppUserModelId('kr.co.stargateedu.desktop');
}

function findPortalRoot() {
  const candidate = path.resolve(__dirname, '..', '..');
  const markers = ['index.html', 'manifest.webmanifest', 'sw.js', 'CNAME'];
  const ready = markers.every((name) => fs.existsSync(path.join(candidate, name)));
  return ready ? candidate : null;
}

function policyOptions() {
  return { devOrigin };
}

function boundsFile() {
  return path.join(app.getPath('userData'), 'window-bounds.json');
}

function loadBounds() {
  try {
    const raw = JSON.parse(fs.readFileSync(boundsFile(), 'utf8'));
    if (!raw || typeof raw.width !== 'number' || typeof raw.height !== 'number') return null;
    if (typeof raw.x !== 'number' || typeof raw.y !== 'number') return { width: raw.width, height: raw.height };
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return raw.x < area.x + area.width - 80
        && raw.x + raw.width > area.x + 80
        && raw.y < area.y + area.height - 80
        && raw.y + raw.height > area.y + 80;
    });
    return visible ? raw : { width: raw.width, height: raw.height };
  } catch {
    return null;
  }
}

function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  fs.mkdirSync(path.dirname(boundsFile()), { recursive: true });
  fs.writeFileSync(boundsFile(), JSON.stringify(bounds));
}

function appIcon() {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, '..', 'build', file);
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

async function openExternal(url) {
  try {
    await shell.openExternal(url);
  } catch (error) {
    console.error('[stargate-desktop] 외부 링크를 열지 못했습니다', error.message);
  }
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function attachGuards(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecision(url, policyOptions());
    if (decision === 'allow') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 480,
          height: 760,
          autoHideMenuBar: true,
          backgroundColor: '#0b1020',
          parent: mainWindow || undefined,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    }
    if (decision === 'external') {
      console.log(`[stargate-desktop] 브라우저로 엽니다: ${hostOf(url)}`);
      openExternal(url);
    }
    return { action: 'deny' };
  });

  const guardNavigation = (event, url) => {
    const decision = navigationDecision(url, policyOptions());
    if (decision === 'allow') return;
    event.preventDefault();
    if (decision === 'external') {
      console.log(`[stargate-desktop] 브라우저로 엽니다: ${hostOf(url)}`);
      openExternal(url);
    }
  };
  contents.on('will-navigate', guardNavigation);
  contents.on('will-redirect', guardNavigation);
  contents.on('did-create-window', (child) => attachGuards(child.webContents));
}

function showLoadError(contents, target, reason) {
  if (showingError) return;
  showingError = true;
  contents.loadFile(path.join(__dirname, 'load-error.html'), {
    query: {
      home: homeUrl,
      target: target || '',
      reason: reason || '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    },
  }).finally(() => {
    showingError = false;
  });
}

function createWindow() {
  const saved = loadBounds();
  mainWindow = new BrowserWindow({
    width: saved?.width || 1440,
    height: saved?.height || 960,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Stargate',
    backgroundColor: '#0b1020',
    icon: appIcon(),
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  attachGuards(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  let boundsTimer = null;
  const remember = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(saveBounds, 200);
  };
  mainWindow.on('resize', remember);
  mainWindow.on('move', remember);
  mainWindow.on('close', saveBounds);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || showingError) return;
    console.error(`[stargate-desktop] 불러오기 실패 ${errorCode} ${hostOf(validatedURL)}`);
    showLoadError(mainWindow.webContents, validatedURL, errorDescription);
  });

  if (process.env.STARGATE_SMOKE === '1') armSmoke(mainWindow);
  mainWindow.loadURL(homeUrl);
}

function buildMenu() {
  const go = (direction) => {
    const contents = mainWindow?.webContents;
    if (!contents) return;
    if (direction < 0 && contents.canGoBack()) contents.goBack();
    if (direction > 0 && contents.canGoForward()) contents.goForward();
  };
  return Menu.buildFromTemplate([
    {
      label: '파일',
      submenu: [
        {
          label: '포털 홈',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => mainWindow?.loadURL(homeUrl),
        },
        { type: 'separator' },
        { label: '종료', role: 'quit' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { label: '실행 취소', role: 'undo' },
        { label: '다시 실행', role: 'redo' },
        { type: 'separator' },
        { label: '잘라내기', role: 'cut' },
        { label: '복사', role: 'copy' },
        { label: '붙여넣기', role: 'paste' },
        { label: '모두 선택', role: 'selectAll' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '뒤로', accelerator: 'Alt+Left', click: () => go(-1) },
        { label: '앞으로', accelerator: 'Alt+Right', click: () => go(1) },
        { type: 'separator' },
        { label: '새로고침', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '강력 새로고침', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { type: 'separator' },
        { label: '실제 크기', role: 'resetZoom' },
        { label: '확대', role: 'zoomIn' },
        { label: '축소', role: 'zoomOut' },
        { type: 'separator' },
        { label: '전체 화면', role: 'togglefullscreen' },
      ],
    },
    {
      label: '개발',
      submenu: [
        { label: '개발자 도구', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        {
          label: '브라우저에서 포털 열기',
          click: () => openExternal(PROD_URL),
        },
      ],
    },
  ]);
}

function armSmoke(win) {
  const out = process.env.STARGATE_SMOKE_OUT || '';
  const timer = setTimeout(() => {
    console.error('[stargate-desktop] smoke timeout');
    app.exit(1);
  }, 60000);
  win.webContents.on('console-message', (...args) => {
    const message = typeof args[0] === 'object' && args[0] ? args[0].message : args[2];
    if (message) console.log(`[page] ${message}`);
  });
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const title = win.webContents.getTitle();
      console.log(`[stargate-desktop] smoke title: ${title}`);
      console.log(`[stargate-desktop] smoke url: ${win.webContents.getURL()}`);
      if (out) {
        const image = await win.webContents.capturePage();
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, image.toPNG());
      }
      clearTimeout(timer);
      app.exit(title.includes('스타게이트') ? 0 : 1);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}

async function start() {
  const userAgent = session.defaultSession.getUserAgent().replace(/ Electron\/\S+/, '');
  session.defaultSession.setUserAgent(userAgent);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  homeUrl = PROD_URL;
  if (DEV) {
    const portalRoot = findPortalRoot();
    if (!portalRoot) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Stargate',
        message: '로컬 포털 폴더를 찾지 못해 운영 사이트를 엽니다.',
        detail: '개발 모드는 이 저장소의 desktop 폴더에서 실행할 때 저장소의 파일을 보여 줍니다.',
      });
    } else {
      const started = await startStaticServer(portalRoot);
      devServer = started.server;
      devOrigin = started.origin;
      homeUrl = `${started.origin}/`;
      console.log(`[stargate-desktop] 로컬 포털 ${homeUrl}`);
    }
  }

  Menu.setApplicationMenu(buildMenu());
  createWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(start).catch((error) => {
    console.error(error);
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('before-quit', () => devServer?.close());
}
