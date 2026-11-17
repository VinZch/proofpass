// 统一 Chromium 启动方式：
//   1. 显式设置 PROOFPASS_CHROME 时优先使用；
//   2. macOS 上存在 Google Chrome 时回退到它（与既有文档一致）；
//   3. 否则交给 Playwright 自带的 Chromium。
import fs from 'node:fs';
import { chromium } from 'playwright';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launchChromium(options = {}) {
  const explicit = process.env.PROOFPASS_CHROME;
  const fallback =
    process.platform === 'darwin' && fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined;
  const executablePath = explicit || fallback;
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    ...options,
  });
}
