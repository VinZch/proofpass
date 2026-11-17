import { launchChromium } from './browser-launcher.mjs';
import { startDemo } from './upgrade-demo.mjs';
import { writeTestOutput, testOutputPath } from './evidence.mjs';
const demo = await startDemo(0);
let browser;
const checks = [];
const ok = (name, v) => {
  if (!v) throw Error(name);
  checks.push(name);
};
try {
  browser = await launchChromium();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(demo.origin + '/upgrade/');
  await page.waitForFunction(
    () =>
      !document.getElementById('connect').disabled &&
      document.getElementById('org-state').textContent.includes('启用'),
  );
  await page.fill('#title', '界面预览测试 · TEST ONLY');
  ok(
    '草稿预览随标题更新',
    (await page.locator('#preview-title').textContent()) === '界面预览测试 · TEST ONLY',
  );
  await page.fill('#title', 'TEST ONLY · 技能证书');
  ok(
    '技术身份默认收起',
    (await page.locator('.institution-details').getAttribute('open')) === null,
  );
  await page.locator('.institution-details summary').click();
  ok('机构切换控件可展开', await page.locator('#institution').isVisible());
  await page.locator('.institution-details summary').click();
  await page.locator('#tab-credentials').focus();
  await page.keyboard.press('ArrowRight');
  ok('方向键切换治理页', await page.locator('#governance').isVisible());
  await page.keyboard.press('End');
  ok('End 切换版本页', await page.locator('#history').isVisible());
  await page.keyboard.press('Tab');
  ok(
    'Tab 进入当前面板',
    await page.locator('#history-id').evaluate((e) => e === document.activeElement),
  );
  await page.locator('#tab-credentials').click();
  await page.fill('#title', '');
  await page.click('#issue');
  await page.waitForFunction(() => !document.getElementById('connect').disabled);
  ok(
    '缺填项获得错误焦点',
    await page
      .locator('#title')
      .evaluate((e) => e === document.activeElement && e.getAttribute('aria-invalid') === 'true'),
  );
  await page.fill('#title', 'TEST ONLY · 技能证书');
  ok('修改后清除字段错误', (await page.locator('#title').getAttribute('aria-invalid')) === null);
  await page.click('#connect');
  await page.waitForFunction(() => !document.getElementById('connect').disabled);
  const layout = await page.evaluate(() =>
    Object.fromEntries(
      ['.workspace-header', '.intro', '.connection', '.grid', '#issue'].map((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return [
          sel,
          { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) },
        ];
      }),
    ),
  );
  await page.screenshot({ path: testOutputPath('upgrade-layout-desktop.png'), fullPage: true });
  for (const width of [1440, 1024, 768, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    ok(
      width + 'px 无横向溢出',
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
  }
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await mobile.goto(demo.origin + '/upgrade/');
  await mobile.waitForFunction(
    () =>
      !document.getElementById('connect').disabled &&
      document.getElementById('org-state').textContent.includes('启用'),
  );
  await mobile.screenshot({ path: testOutputPath('upgrade-layout-mobile.png'), fullPage: true });
  ok('移动端保留基础版入口', await mobile.locator('.mobile-base-link').isVisible());
  await mobile.locator('#import').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid'),
  });
  await mobile.waitForFunction(() =>
    document.getElementById('package-info').textContent.startsWith('导入失败'),
  );
  ok(
    '导入失败显示局部错误并聚焦文件输入',
    await mobile
      .locator('#import')
      .evaluate((e) => e.getAttribute('aria-invalid') === 'true' && e === document.activeElement),
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => (document.documentElement.style.zoom = '2'));
  ok(
    '200% 缩放无横向溢出',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  ok('无脚本错误', errors.length === 0);
  writeTestOutput('upgrade-layout-ui.json', {
    at: new Date().toISOString(),
    mode: 'local-evm',
    layout,
    checks,
    errors,
  });
  console.log(JSON.stringify(checks));
} finally {
  await browser?.close();
  await demo.close();
}
